import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import * as esbuild from 'esbuild';

/**
 * Bundles the estimation, conversion, tokenizer, and model-parsing modules in memory so we can
 * test the TypeScript sources directly with Node's built-in test runner without adding npm packages.
 */
const bundled = await esbuild.build({
  stdin: {
    contents: `
      export { default as config } from './src/config/config.json';
      export { default as factSheet } from './src/config/factSheet.json';
      export * from './src/services/conversion/conversion.service';
      export * from './src/services/estimation/estimation.service';
      export * from './src/services/estimation/model-profiles';
      export * from './src/services/tokenizer/tokenizer.service';
      export * from './src/readers/dom-content.reader';
      export * from './src/readers/sites/effort-inference.helpers';
      export { buildModelInfo, hasMatch, unknownModel } from './src/readers/sites/site.helpers';
      export { parseChatGptSlug, parseChatGptLabel } from './src/readers/sites/chatgpt.site';
      export {
        CURRENT_ESTIMATION_VERSION,
        resolveStoredModelInfo,
        validateAndNormalizeRecord,
        validateAndNormalizeRecords,
      } from './src/services/prompt-store/record-validator';
      export * from './src/ui/app/pages/facts.helpers';
      export * from './src/ui/app/pages/analytics.helpers';
      export * from './src/ui/app/pages/tips-catalog.helpers';
      export * from './src/ui/app/pages/tips-recommender.helpers';
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2022',
});

const code = bundled.outputFiles[0].text;
const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const {
  config,
  factSheet,
  calculateEnvironmentalImpact,
  convertTokensToImpact,
  resolveCategoryEffectiveMultiplier,
  estimateThinkingTokens,
  estimateToolTokens,
  estimateHiddenTokens,
  buildTokenEstimateDto,
  resolveModelProfile,
  countTextTokensForProvider,
  countAttachmentTokens,
  countInputTokens,
  familyDefaultEffort,
  THINKING_DETECTED_EFFORT,
  readAttachments,
  readToolCalls,
  buildModelInfo,
  hasMatch,
  parseChatGptSlug,
  parseChatGptLabel,
  formatFactKpiValue,
  formatFactMultiplier,
  getCandidateFacts,
  shuffleFactsBoard,
  factsShuffleSeed,
  seededRandom,
  validateAndNormalizeRecord,
  validateAndNormalizeRecords,
  resolveStoredModelInfo,
  CURRENT_ESTIMATION_VERSION,
  aggregateAnalytics,
  buildCategoryBreakdown,
  buildModelDonut,
  buildModelEfficiency,
  buildHistoryTimeSeries,
  buildEcoInsight,
  computeUsefulWorkTokens,
  formatAnalyticsHeaderSubtitle,
  formatHumanSummaryNumber,
  formatNaturalScaledEquivalent,
  formatRecordsAsCsv,
  formatRecordsAsJson,
  resolveHumanColumnDecimals,
  WORK_TO_1K_WORDS_FACTOR,
  HOUR_MS,
  TIPS_CATALOG,
  recommendTips,
} = mod;

describe('1. Config & UI Gauge Max Values', () => {
  it('exposes the 2026 impact, thinking, tokenizer, and UI gauge limits', () => {
    assert.equal(config.estimation.thinking.baselineMs, 450);
    assert.equal(config.estimation.thinking.maxTokens, 64000);
    assert.equal(config.estimation.thinking.effortMultipliers.xhigh, 1.1);
    assert.equal(config.estimation.thinking.effortMultipliers.max, 1.15);
    assert.equal(config.estimation.impact.waterMlPerWh, 3.54);
    assert.deepEqual(config.estimation.impact.co2GramsPerWh, {
      openai: 0.35,
      anthropic: 0.29,
      google: 0.2,
    });
    assert.equal(config.estimation.impact.cachedInputMultiplier, 0.03);
    assert.equal(config.ui.tachoMax.energyWh, 30);
    assert.equal(config.ui.tachoMax.waterMl, 105);
  });
});

describe('2. Differentiated Energy, Caching, Water & Vendor CO2 (ConversionService)', () => {
  it('computes effective multipliers per category with KV-caching', () => {
    // output: (1 - 0) * 1.0 + 0 * 0.03 = 1.0
    assert.ok(Math.abs(resolveCategoryEffectiveMultiplier('output') - 1.0) < 1e-9);
    // thinking: (1 - 0) * 1.0 + 0 * 0.03 = 1.0
    assert.ok(Math.abs(resolveCategoryEffectiveMultiplier('thinking') - 1.0) < 1e-9);
    // input: (1 - 0) * 0.2 + 0 * 0.03 = 0.2
    assert.ok(Math.abs(resolveCategoryEffectiveMultiplier('input') - 0.2) < 1e-9);
    // tools: (1 - 0.3) * 0.2 + 0.3 * 0.03 = 0.14 + 0.009 = 0.149
    assert.ok(Math.abs(resolveCategoryEffectiveMultiplier('tools') - 0.149) < 1e-9);
    // history: (1 - 0.7) * 0.2 + 0.7 * 0.03 = 0.06 + 0.021 = 0.081
    assert.ok(Math.abs(resolveCategoryEffectiveMultiplier('history') - 0.081) < 1e-9);
    // systemPrompt: (1 - 0.9) * 0.2 + 0.9 * 0.03 = 0.02 + 0.027 = 0.047
    assert.ok(Math.abs(resolveCategoryEffectiveMultiplier('systemPrompt') - 0.047) < 1e-9);
  });

  it('computes differentiated category energy, uniform water, and vendor-split CO2', () => {
    const breakdown = {
      output: 1000,
      thinking: 2000,
      input: 1000,
      tools: 1000,
      history: 10000,
      overhead: 2000, // maps to systemPrompt
    };
    const gptModel = {
      name: 'gpt',
      version: '5',
      thinkingEffort: 'medium',
      rawLabel: 'GPT-5',
    };

    // gpt energyWhPer1M = 1000 -> 0.001 Wh per effective token
    // output:       1000 * 1.0   = 1000
    // thinking:     2000 * 1.0   = 2000
    // input:        1000 * 0.2   =  200
    // tools:        1000 * 0.149 =  149
    // history:     10000 * 0.081 =  810
    // systemPrompt: 2000 * 0.047 =   94
    // sum effective tokens = 4253 -> 4253 / 1_000_000 * 1000 = 4.253 Wh
    const openaiImpact = calculateEnvironmentalImpact(breakdown, 'openai', gptModel);
    assert.equal(openaiImpact.energyWh, 4.253);
    // waterMl = 4.253 * 3.54 = 15.05562 -> 15.0556
    assert.equal(openaiImpact.waterMl, 15.0556);
    // openai co2Grams = 4.253 * 0.35 = 1.48855 -> 1.4886
    assert.equal(openaiImpact.co2Grams, 1.4886);

    // Same 1M output tokens across all 3 vendors with models of known energyWhPer1M
    const oneMillionOutput = {
      output: 1_000_000,
      thinking: 0,
      input: 0,
      tools: 0,
      history: 0,
      overhead: 0,
    };

    const anthropicImpact = calculateEnvironmentalImpact(oneMillionOutput, 'anthropic', {
      name: 'claude-sonnet',
      version: '4.5',
      thinkingEffort: 'medium',
      rawLabel: 'Claude Sonnet',
    });
    // claude-sonnet energyWhPer1M = 1100
    assert.equal(anthropicImpact.energyWh, 1100);
    assert.equal(anthropicImpact.waterMl, 3894); // 1100 * 3.54
    assert.equal(anthropicImpact.co2Grams, 319); // 1100 * 0.29

    const googleImpact = calculateEnvironmentalImpact(oneMillionOutput, 'google', {
      name: 'gemini-pro',
      version: '3',
      thinkingEffort: 'medium',
      rawLabel: 'Gemini Pro',
    });
    // gemini-pro energyWhPer1M = 1100
    assert.equal(googleImpact.energyWh, 1100);
    assert.equal(googleImpact.waterMl, 3894); // 1100 * 3.54 (uniform water intensity)
    assert.equal(googleImpact.co2Grams, 220); // 1100 * 0.20 (google grid intensity)
  });

  it('populates impact on TokenEstimateDto via convertTokensToImpact', () => {
    const capture = {
      provider: 'openai',
      model: { name: 'gpt-astra', version: '6', thinkingEffort: 'high', rawLabel: 'GPT-6 Astra' },
      userInput: 'Hello',
      userAttachments: [],
      response: 'World',
      artifactText: '',
      toolCalls: [],
      chatHistory: [],
      latencyMs: 2450,
      thinkingTimeMs: 1450,
      capturedAt: 1000,
      conversationUrl: 'https://chatgpt.com/c/1',
    };
    const visible = { input: 1000, history: 0, output: 1000, approximate: true };
    const hidden = estimateHiddenTokens(capture);
    const dto = buildTokenEstimateDto(capture, visible, hidden);
    const withImpact = convertTokensToImpact(dto);
    assert.ok(withImpact.impact.energyWh > 0);
    assert.ok(withImpact.impact.waterMl > 0);
    assert.ok(withImpact.impact.co2Grams > 0);
  });
});

describe('3. Thinking Estimation Calibration (EstimationService)', () => {
  it('subtracts 450ms baseline, applies xhigh and max multipliers, and clamps to [0, 64000]', () => {
    // Below baseline (450ms) -> 0
    assert.equal(estimateThinkingTokens(450, 1000, 0.1, 'medium'), 0);
    assert.equal(estimateThinkingTokens(200, 1000, 0.1, 'max'), 0);

    // none effort -> 0
    assert.equal(estimateThinkingTokens(5000, 6000, 0.1, 'none'), 0);

    // 1450ms thinking -> effectiveMs = 1000ms, speed = 0.1 -> base = 100 tokens
    assert.equal(estimateThinkingTokens(1450, 2000, 0.1, 'low'), 90); // 100 * 0.9
    assert.equal(estimateThinkingTokens(1450, 2000, 0.1, 'medium'), 100); // 100 * 1.0
    assert.equal(estimateThinkingTokens(1450, 2000, 0.1, 'high'), 105); // 100 * 1.05
    assert.equal(estimateThinkingTokens(1450, 2000, 0.1, 'xhigh'), 110); // 100 * 1.1
    assert.equal(estimateThinkingTokens(1450, 2000, 0.1, 'max'), 115); // 100 * 1.15
    assert.equal(estimateThinkingTokens(1450, 2000, 0.1, 'unknown'), 85); // 100 * 0.85

    // Clamped to maxTokens = 64000
    assert.equal(estimateThinkingTokens(1_000_000, 1_000_000, 0.2, 'max'), 64000);
  });

  it('uses updated tool token rates', () => {
    assert.equal(estimateToolTokens(['search', 'code', 'other'], 'openai'), 3500 + 850 + 900);
    assert.equal(estimateToolTokens(['search', 'code', 'other'], 'anthropic'), 3500 + 850 + 900);
    assert.equal(estimateToolTokens(['search', 'code', 'other'], 'google'), 3000 + 800 + 850);
  });
});

describe('4. System Prompt, Attachments & Tokenizer (TokenizerService & ModelProfiles)', () => {
  it('reads updated attachment and heuristic tokenizer parameters from config.json', () => {
    assert.equal(countAttachmentTokens(['image'], 'openai'), 765);
    assert.equal(countAttachmentTokens(['file'], 'openai'), 2500);
    assert.equal(countAttachmentTokens(['image'], 'anthropic'), 1600);
    assert.equal(countAttachmentTokens(['file'], 'anthropic'), 2500);
    assert.equal(countAttachmentTokens(['image'], 'google'), 774);
    assert.equal(countAttachmentTokens(['file'], 'google'), 2500);

    // Anthropic: singleTokenMaxWordLength = 4, charsPerSubword = 3.0, charsPerSymbolToken = 1.5
    // "abcd" (len 4) -> 1 token; "abcdef" (len 6 > 4) -> ceil(6 / 3.0) = 2 tokens
    assert.equal(countTextTokensForProvider('abcd', 'anthropic'), 1);
    assert.equal(countTextTokensForProvider('abcdef', 'anthropic'), 2);
    // Symbol run "!!!" (len 3) -> ceil(3 / 1.5) = 2 tokens
    assert.equal(countTextTokensForProvider('!!!', 'anthropic'), 2);

    // OpenAI: singleTokenMaxWordLength = 6, charsPerSubword = 4.0
    // "abcdef" (len 6 <= 6) -> 1 token; "abcdefgh" (len 8 > 6) -> ceil(8 / 4.0) = 2 tokens
    assert.equal(countTextTokensForProvider('abcdef', 'openai'), 1);
    assert.equal(countTextTokensForProvider('abcdefgh', 'openai'), 2);

    // Input framing + attachment
    assert.equal(countInputTokens('abcd', 'anthropic', undefined, ['file']), 1 + 2500 + 5);
  });

  it('resolves all new 2026 model profiles and systemPromptTokens', () => {
    const astra = resolveModelProfile('openai', {
      name: 'gpt-astra',
      version: '6',
      thinkingEffort: 'high',
      rawLabel: 'gpt-astra',
    });
    assert.equal(astra.exactModelMatch, true);
    assert.equal(astra.systemPromptTokens, 2200);
    assert.equal(astra.tokensPerMsThinking, 0.078);
    assert.equal(astra.energyWhPer1M, 2500);

    const sol = resolveModelProfile('openai', {
      name: 'gpt-sol',
      version: '6',
      thinkingEffort: 'medium',
      rawLabel: 'gpt-sol',
    });
    assert.equal(sol.exactModelMatch, true);
    assert.equal(sol.systemPromptTokens, 2000);
    assert.equal(sol.energyWhPer1M, 1000);

    const luna = resolveModelProfile('openai', {
      name: 'gpt-luna',
      version: '6',
      thinkingEffort: 'low',
      rawLabel: 'gpt-luna',
    });
    assert.equal(luna.exactModelMatch, true);
    assert.equal(luna.systemPromptTokens, 1400);
    assert.equal(luna.energyWhPer1M, 250);

    const fable = resolveModelProfile('anthropic', {
      name: 'claude-fable',
      version: '5',
      thinkingEffort: 'high',
      rawLabel: 'Claude Fable',
    });
    assert.equal(fable.exactModelMatch, true);
    assert.equal(fable.systemPromptTokens, 5800);
    assert.equal(fable.tokensPerMsThinking, 0.092);
    assert.equal(fable.energyWhPer1M, 2800);

    const neon = resolveModelProfile('google', {
      name: 'gemini-neon',
      version: '4',
      thinkingEffort: 'high',
      rawLabel: 'Gemini Neon',
    });
    assert.equal(neon.exactModelMatch, true);
    assert.equal(neon.systemPromptTokens, 2000);
    assert.equal(neon.energyWhPer1M, 1150);

    const hydrogen = resolveModelProfile('google', {
      name: 'gemini-hydrogen',
      version: '4',
      thinkingEffort: 'low',
      rawLabel: 'Gemini Hydrogen',
    });
    assert.equal(hydrogen.exactModelMatch, true);
    assert.equal(hydrogen.systemPromptTokens, 1600);
    assert.equal(hydrogen.energyWhPer1M, 380);
  });

  it('recognizes new Claude, Gemini (incl. Argon/Carbon -> gemini-pro), and ChatGPT families & effort words', () => {
    assert.equal(THINKING_DETECTED_EFFORT, 'medium');
    assert.equal(familyDefaultEffort('claude-fable'), 'high');
    assert.equal(familyDefaultEffort('gemini-neon'), 'high');
    assert.equal(familyDefaultEffort('gemini-hydrogen'), 'low');
    assert.equal(familyDefaultEffort('gpt-astra'), 'high');
    assert.equal(familyDefaultEffort('gpt-sol'), 'medium');
    assert.equal(familyDefaultEffort('gpt-luna'), 'low');

    // Claude families
    const claudeFable = buildModelInfo('Claude 5 Fable', false, config.capture.models.claude);
    assert.equal(claudeFable.name, 'claude-fable');
    assert.equal(claudeFable.thinkingEffort, 'high');

    // Gemini families (including argon and carbon mapped to gemini-pro)
    const geminiNeon = buildModelInfo('Gemini 4 Neon', false, config.capture.models.gemini);
    assert.equal(geminiNeon.name, 'gemini-neon');
    assert.equal(geminiNeon.thinkingEffort, 'high');

    const geminiHydrogen = buildModelInfo('Gemini 4 Hydrogen', false, config.capture.models.gemini);
    assert.equal(geminiHydrogen.name, 'gemini-hydrogen');
    assert.equal(geminiHydrogen.thinkingEffort, 'low');

    const geminiArgon = buildModelInfo('Gemini 4 Argon', false, config.capture.models.gemini);
    assert.equal(geminiArgon.name, 'gemini-pro');
    assert.equal(geminiArgon.thinkingEffort, 'medium');

    const geminiCarbon = buildModelInfo('Gemini 4 Carbon', false, config.capture.models.gemini);
    assert.equal(geminiCarbon.name, 'gemini-pro');
    assert.equal(geminiCarbon.thinkingEffort, 'medium');

    // ChatGPT families (checked before generic gpt / openai-o)
    const gptAstraSlug = parseChatGptSlug('gpt-6-astra', 'ChatGPT 6 Astra');
    assert.equal(gptAstraSlug.name, 'gpt-astra');
    assert.equal(gptAstraSlug.thinkingEffort, 'high');

    const gptSolSlug = parseChatGptSlug('gpt-6-sol', 'ChatGPT 6 Sol');
    assert.equal(gptSolSlug.name, 'gpt-sol');
    assert.equal(gptSolSlug.thinkingEffort, 'medium');

    const gptTerraLabel = parseChatGptLabel('ChatGPT 6 Terra', false);
    assert.equal(gptTerraLabel.name, 'gpt-sol');
    assert.equal(gptTerraLabel.thinkingEffort, 'medium');

    const gptLunaLabel = parseChatGptLabel('ChatGPT 6 Luna', false);
    assert.equal(gptLunaLabel.name, 'gpt-luna');
    assert.equal(gptLunaLabel.thinkingEffort, 'low');

    // ChatGPT xhigh and max effort words
    const xhighSlug = parseChatGptSlug('gpt-6-astra-xhigh', 'ChatGPT');
    assert.equal(xhighSlug.name, 'gpt-astra');
    assert.equal(xhighSlug.thinkingEffort, 'xhigh');

    const deepLabel = parseChatGptLabel('ChatGPT 6 Sol · Deep', true);
    assert.equal(deepLabel.name, 'gpt-sol');
    assert.equal(deepLabel.thinkingEffort, 'xhigh');

    const maxLabel = parseChatGptLabel('ChatGPT 6 Astra Maximum', true);
    assert.equal(maxLabel.name, 'gpt-astra');
    assert.equal(maxLabel.thinkingEffort, 'max');
  });
});

describe('5. FactSheet Icon Library & Smart-Shuffle Logic', () => {
  it('validates all 60 items in factSheet.json and verifies every SVG file exists with consistent attributes', () => {
    const kpiKeys = Object.keys(factSheet.kpis);
    assert.deepEqual(kpiKeys, ['power', 'water', 'co2']);

    let total = 0;
    for (const kpi of kpiKeys) {
      const items = factSheet.kpis[kpi].items;
      assert.equal(items.length, 20, `Expected 20 items for ${kpi}`);
      for (const item of items) {
        assert.ok(typeof item.icon === 'string' && item.icon.startsWith('icons/'));
        assert.ok(item.icon.endsWith('.svg'));
        assert.ok(item.iconSource === 'lucide' || item.iconSource === 'custom');

        const svgPath = path.join(process.cwd(), 'public', item.icon);
        assert.ok(fs.existsSync(svgPath), `Missing SVG asset: ${svgPath}`);
        const svg = fs.readFileSync(svgPath, 'utf8');
        assert.ok(svg.includes('viewBox="0 0 24 24"'));
        assert.ok(svg.includes('fill="none"'));
        assert.ok(svg.includes('stroke="currentColor"'));
        assert.ok(svg.includes('stroke-width="1.75"'));
        assert.ok(svg.includes('stroke-linecap="round"'));
        assert.ok(svg.includes('stroke-linejoin="round"'));
        total++;
      }
    }
    assert.equal(total, 60);
  });

  it('formats multipliers and raw KPI values naturally and shuffles without cross-timeframe duplicates', () => {
    assert.equal(formatFactMultiplier('power', 36, 15).multiplierText, '~2.4×');
    assert.equal(formatFactMultiplier('power', 36, 15).comparisonQualifier, 'as much energy as');
    assert.equal(formatFactMultiplier('water', 6.75, 15).multiplierText, '45%');
    assert.equal(formatFactMultiplier('water', 6.75, 15).comparisonQualifier, 'of the water for');
    assert.equal(formatFactMultiplier('co2', 180, 15).multiplierText, '~12×');
    assert.equal(formatFactMultiplier('power', 0, 15).isBaselineZero, true);

    assert.equal(formatFactKpiValue('power', 15), '15 Wh');
    assert.equal(formatFactKpiValue('power', 1500), '1.5 kWh');
    assert.equal(formatFactKpiValue('water', 500), '500 mL');
    assert.equal(formatFactKpiValue('water', 2000), '2 L');
    assert.equal(formatFactKpiValue('co2', 80), '80 g CO₂e');
    assert.equal(formatFactKpiValue('co2', 3000), '3 kg CO₂e');

    // Filter window [0.25, 15]
    const candidates = getCandidateFacts('power', 30, 'daily');
    assert.ok(candidates.length > 0);
    for (const c of candidates) {
      const ratio = 30 / c.value;
      assert.ok(ratio >= 0.25 && ratio <= 15);
    }

    // Board shuffle deduplicates across daily, weekly, allTime and is stable per seed
    const mockSummaries = {
      daily: { impact: { energyWh: 25, waterMl: 300, co2Grams: 18 } },
      weekly: { impact: { energyWh: 180, waterMl: 2200, co2Grams: 160 } },
      allTime: { impact: { energyWh: 1400, waterMl: 18000, co2Grams: 1200 } },
    };
    const board1 = shuffleFactsBoard(mockSummaries, () => 0.1);
    for (const kpi of ['power', 'water', 'co2']) {
      const ids = new Set([
        board1.daily[kpi].item.id,
        board1.weekly[kpi].item.id,
        board1.allTime[kpi].item.id,
      ]);
      assert.equal(ids.size, 3, `Expected 3 distinct facts across timeframes for ${kpi}`);
    }

    const seed = factsShuffleSeed(1_750_000_000_000);
    const seededA = shuffleFactsBoard(mockSummaries, seededRandom(seed));
    const seededB = shuffleFactsBoard(mockSummaries, seededRandom(seed));
    for (const kpi of ['power', 'water', 'co2']) {
      assert.equal(seededA.daily[kpi].item.id, seededB.daily[kpi].item.id);
    }
  });
});

function makeTestPromptRecord(overrides = {}) {
  const provider = overrides.provider ?? 'openai';
  const model = overrides.model ?? {
    name: 'gpt-sol',
    version: '6',
    thinkingEffort: 'medium',
    rawLabel: 'GPT-6 Sol',
  };
  const breakdown = {
    input: 500,
    history: 1500,
    output: 1000,
    thinking: 500,
    tools: 0,
    overhead: 2000,
    ...(overrides.breakdown ?? {}),
  };
  const totalTokens =
    overrides.totalTokens ??
    breakdown.input +
      breakdown.history +
      breakdown.output +
      breakdown.thinking +
      breakdown.tools +
      breakdown.overhead;

  const impact = overrides.impact ?? calculateEnvironmentalImpact(breakdown, provider, model);

  return {
    id: overrides.id ?? 'rec-1',
    conversationUrl: overrides.conversationUrl ?? 'https://chatgpt.com/c/test',
    capturedAt: overrides.capturedAt ?? 1_700_000_000_000,
    provider,
    model,
    breakdown,
    totalTokens,
    impact,
    timings: overrides.timings ?? { latencyMs: 1800, thinkingTimeMs: 600 },
    approximate: overrides.approximate ?? false,
  };
}

describe('6. Analytics Aggregator (Timeframes, Breakdown, Donut, Efficiency, Series, Eco-Insight)', () => {
  const NOW = 1_750_000_000_000;
  const DAY = 24 * HOUR_MS;

  it('handles empty and zero-token edge cases gracefully without NaN or Infinity', () => {
    const emptyVm = aggregateAnalytics([], 'all', '7d', 'impact', NOW);
    assert.equal(emptyVm.isEmpty, true);
    assert.equal(emptyVm.promptCount, 0);
    assert.equal(emptyVm.kpis.length, 4);
    assert.equal(emptyVm.breakdown.totalWeightedValue, 0);
    assert.ok(emptyVm.breakdown.segments.every((s) => s.percentage === 0));
    assert.equal(emptyVm.modelDonut.slices.length, 0);
    assert.equal(emptyVm.modelEfficiency.rows.length, 0);
    assert.equal(emptyVm.historySeries.buckets.length, 7);
    assert.equal(emptyVm.ecoInsight.id, 'sparse');

    // Single record with zero tokens
    const zeroRecord = makeTestPromptRecord({
      capturedAt: NOW - HOUR_MS,
      breakdown: { input: 0, history: 0, output: 0, thinking: 0, tools: 0, overhead: 0 },
      totalTokens: 0,
      impact: { energyWh: 0, waterMl: 0, co2Grams: 0 },
    });
    const zeroVm = aggregateAnalytics([zeroRecord], 'tokens', '24h', 'impact', NOW);
    assert.equal(zeroVm.promptCount, 1);
    assert.equal(zeroVm.breakdown.totalRawTokens, 0);
    assert.ok(
      zeroVm.breakdown.segments.every((s) => Number.isFinite(s.percentage) && s.percentage === 0),
    );
    assert.equal(zeroVm.modelEfficiency.rows.length, 0);
    assert.equal(zeroVm.ecoInsight.id, 'sparse');
  });

  it('filters timeframes (24h, 7d, 30d, All Time), computes period deltas, and builds exact bucket counts', () => {
    const records = [
      makeTestPromptRecord({ id: 'r-2h', capturedAt: NOW - 2 * HOUR_MS }),
      makeTestPromptRecord({ id: 'r-30h', capturedAt: NOW - 30 * HOUR_MS }), // in prev 24h, active 7d
      makeTestPromptRecord({ id: 'r-10d', capturedAt: NOW - 10 * DAY }), // in prev 7d, active 30d
      makeTestPromptRecord({ id: 'r-45d', capturedAt: NOW - 45 * DAY }), // in prev 30d, active All Time
      makeTestPromptRecord({ id: 'r-120d', capturedAt: NOW - 120 * DAY }), // active All Time only
    ];

    const vm24h = aggregateAnalytics(records, 'power', '24h', 'impact', NOW);
    assert.equal(vm24h.promptCount, 1);
    assert.equal(vm24h.previousPromptCount, 1);
    assert.equal(vm24h.historySeries.buckets.length, 12);
    assert.equal(vm24h.kpis[0].deltaText, '0% vs prev 24h');

    const vm7d = aggregateAnalytics(records, 'power', '7d', 'impact', NOW);
    assert.equal(vm7d.promptCount, 2);
    assert.equal(vm7d.previousPromptCount, 1);
    assert.equal(vm7d.historySeries.buckets.length, 7);
    assert.equal(vm7d.kpis[0].deltaText, '+100% vs prev 7d');

    const vm30d = aggregateAnalytics(records, 'power', '30d', 'impact', NOW);
    assert.equal(vm30d.promptCount, 3);
    assert.equal(vm30d.previousPromptCount, 1);
    assert.equal(vm30d.historySeries.buckets.length, 10);
    assert.equal(vm30d.kpis[0].deltaText, '+200% vs prev 30d');

    const vmAll = aggregateAnalytics(records, 'power', 'all', 'impact', NOW);
    assert.equal(vmAll.promptCount, 5);
    assert.equal(vmAll.previousPromptCount, 0);
    assert.equal(vmAll.kpis[0].deltaText, null);
    assert.ok(
      vmAll.historySeries.buckets.length >= 12 && vmAll.historySeries.buckets.length <= 16,
      `Expected 12..16 buckets for All Time, got ${vmAll.historySeries.buckets.length}`,
    );

    const directSeries = buildHistoryTimeSeries(records.slice(0, 1), '24h', NOW);
    assert.equal(directSeries.buckets.length, 12);
    assert.equal(directSeries.overallAvgHistoryTokens, 1500);
    assert.equal(directSeries.overallAvgNewTokens, 1500);
    assert.ok(directSeries.peakBucketLabel !== null);
  });

  it('weights category breakdown by effective energy multipliers in impact tabs vs raw tokens in Tokens tab', () => {
    // 1000 thinking tokens (1.0x weight) vs 1000 history tokens (0.081x weight)
    const rec = makeTestPromptRecord({
      capturedAt: NOW - HOUR_MS,
      breakdown: {
        output: 0,
        thinking: 1000,
        history: 1000,
        input: 0,
        tools: 0,
        overhead: 0,
      },
    });

    const tokenBreakdown = buildCategoryBreakdown([rec], 'tokens');
    const tokThinking = tokenBreakdown.segments.find((s) => s.category === 'thinking');
    const tokHistory = tokenBreakdown.segments.find((s) => s.category === 'history');
    assert.equal(tokThinking.percentage, 50);
    assert.equal(tokHistory.percentage, 50);

    const powerBreakdown = buildCategoryBreakdown([rec], 'power');
    // Ordered with Visible first (input, output) followed by Hidden & Context (thinking, tools, history, systemPrompt)
    assert.deepEqual(
      powerBreakdown.segments.map((s) => s.category),
      ['input', 'output', 'thinking', 'tools', 'history', 'systemPrompt'],
    );
    const powThinking = powerBreakdown.segments.find((s) => s.category === 'thinking');
    const powHistory = powerBreakdown.segments.find((s) => s.category === 'history');
    // 1.0 / (1.0 + 0.081) = 92.5%, 0.081 / 1.081 = 7.5%
    assert.equal(powThinking.percentage, 92.5);
    assert.equal(powThinking.formattedPercentage, '92.5%');
    assert.equal(powHistory.percentage, 7.5);
    assert.equal(powHistory.formattedPercentage, '7.5%');
  });

  it('groups models beyond the top 5 into an "Other" donut slice in both impact and prompt modes', () => {
    const models = [
      { provider: 'anthropic', name: 'claude-fable', version: '5', count: 6 },
      { provider: 'anthropic', name: 'claude-opus', version: '4.5', count: 5 },
      { provider: 'openai', name: 'gpt-astra', version: '6', count: 4 },
      { provider: 'google', name: 'gemini-neon', version: '4', count: 3 },
      { provider: 'openai', name: 'gpt-sol', version: '6', count: 2 },
      { provider: 'google', name: 'gemini-flash', version: '3', count: 1 },
      { provider: 'anthropic', name: 'claude-haiku', version: '4.5', count: 1 },
    ];

    const records = [];
    for (const m of models) {
      for (let i = 0; i < m.count; i++) {
        records.push(
          makeTestPromptRecord({
            id: `${m.name}-${i}`,
            capturedAt: NOW - HOUR_MS,
            provider: m.provider,
            model: {
              name: m.name,
              version: m.version,
              thinkingEffort: 'medium',
              rawLabel: m.name,
            },
          }),
        );
      }
    }

    const impactDonut = buildModelDonut(records, 'power', 'impact');
    assert.equal(impactDonut.slices.length, 6);
    assert.equal(impactDonut.slices[5].isOther, true);
    assert.equal(impactDonut.slices[5].label, 'Other');
    assert.equal(impactDonut.slices[5].promptCount, 2);

    const promptsDonut = buildModelDonut(records, 'power', 'prompts');
    assert.equal(promptsDonut.slices.length, 6);
    assert.equal(promptsDonut.slices[0].promptCount, 6);
    assert.equal(promptsDonut.slices[5].isOther, true);
    assert.equal(promptsDonut.slices[5].value, 2);
  });

  it('prevents Simpson’s Paradox in Model Rate mode while reflecting real session cost in Per Prompt mode', () => {
    // Heavy model (Claude Opus, 2000 Wh/1M) used in a long cached chat (25,000 history tokens + 200 output)
    // vs Lightweight model (Gemini Flash, 240 Wh/1M) used in a short uncached chat (0 history + 500 output)
    const opusLongChat = [1, 2, 3].map((i) =>
      makeTestPromptRecord({
        id: `opus-${i}`,
        capturedAt: NOW - HOUR_MS,
        provider: 'anthropic',
        model: {
          name: 'claude-opus',
          version: '4.5',
          thinkingEffort: 'none',
          rawLabel: 'Claude Opus',
        },
        breakdown: {
          input: 100,
          output: 200,
          history: 25000,
          thinking: 0,
          tools: 0,
          overhead: 5200,
        },
      }),
    );

    const flashShortChat = [1, 2, 3].map((i) =>
      makeTestPromptRecord({
        id: `flash-${i}`,
        capturedAt: NOW - HOUR_MS,
        provider: 'google',
        model: {
          name: 'gemini-flash',
          version: '3',
          thinkingEffort: 'none',
          rawLabel: 'Gemini Flash',
        },
        breakdown: {
          input: 200,
          output: 500,
          history: 0,
          thinking: 0,
          tools: 0,
          overhead: 1500,
        },
      }),
    );

    const combined = [...opusLongChat, ...flashShortChat];

    // Note: Under the old naive blended Wh/1k totalTokens formula:
    // Opus energy = (200*1 + 100*0.2 + 25000*0.081 + 5200*0.047)/1M * 2000 = 2489.4/1M * 2000 = 4.9788 Wh
    // Divided by 30,500 total tokens -> 0.163 Wh/1k raw tokens!
    // Flash energy = (500*1 + 200*0.2 + 1500*0.047)/1M * 240 = 610.5/1M * 240 = 0.1465 Wh
    // (If Flash had 0 overhead/history, 500 output -> 0.240 Wh/1k raw tokens > 0.163 Wh/1k!)
    // In Model Rate mode (per 1k output-equivalent tokens):
    // Flash is 0.240 Wh / 1k eq. tok, while Opus is 2.000 Wh / 1k eq. tok!
    const rateEff = buildModelEfficiency(combined, 'power', 'modelRate');
    assert.equal(rateEff.mode, 'modelRate');
    assert.equal(rateEff.directionCue, 'Lower is better');
    assert.equal(rateEff.rows.length, 2);
    assert.ok(rateEff.rows[0].label.includes('Gemini Flash'));
    assert.ok(rateEff.rows[1].label.includes('Claude Opus'));
    assert.equal(rateEff.rows[0].efficiencyValue, 0.24);
    assert.equal(rateEff.rows[1].efficiencyValue, 2.0);
    // Consistent fixed 3-decimal formatting across the column
    assert.equal(rateEff.rows[0].formattedValue, '0.240 Wh / 1k eq. tok');
    assert.equal(rateEff.rows[1].formattedValue, '2.000 Wh / 1k eq. tok');
    assert.ok(rateEff.subtitle.includes('less energy per 1k output-eq. tokens'));

    // Per Message mode: reflects real session cost per message (human-friendly rounding by default)
    const promptEff = buildModelEfficiency(combined, 'power', 'perPrompt', false);
    assert.equal(promptEff.mode, 'perPrompt');
    assert.equal(promptEff.directionCue, 'Lower is better');
    assert.ok(promptEff.rows[0].label.includes('Gemini Flash'));
    assert.ok(promptEff.rows[1].label.includes('Claude Opus'));
    assert.ok(promptEff.rows[0].efficiencyValue < promptEff.rows[1].efficiencyValue);
    assert.equal(promptEff.rows[0].formattedValue, '0.1 Wh / msg');
    assert.equal(promptEff.rows[1].formattedValue, '5.0 Wh / msg');
    assert.ok(promptEff.subtitle.includes('more energy per message than'));

    // With technical details ON: higher decimal precision and inline token metadata
    const promptEffTech = buildModelEfficiency(combined, 'power', 'perPrompt', true);
    assert.equal(promptEffTech.rows[0].formattedValue, '0.147 Wh / msg');
    assert.equal(promptEffTech.rows[1].formattedValue, '4.979 Wh / msg');

    // Tokens tab in Model Rate mode: useful token ratio ((input + output) / totalTokens)
    const tokenRateEff = buildModelEfficiency(combined, 'tokens', 'modelRate');
    assert.equal(tokenRateEff.mode, 'modelRate');
    assert.equal(tokenRateEff.directionCue, 'Higher is better');
    assert.ok(tokenRateEff.rows[0].label.includes('Gemini Flash'));
    assert.ok(tokenRateEff.rows[0].efficiencyValue > tokenRateEff.rows[1].efficiencyValue);

    // Low-sample guard (<3 messages): marks isLowSample and avoids outlier multiplier claims in Per Message mode
    const lowSampleEff = buildModelEfficiency(
      [opusLongChat[0], flashShortChat[0]],
      'power',
      'perPrompt',
    );
    assert.equal(lowSampleEff.rows[0].isLowSample, true);
    assert.equal(lowSampleEff.rows[1].isLowSample, true);
    assert.ok(lowSampleEff.subtitle.startsWith('Lowest average per message:'));
  });

  it('selects data-driven Eco-Insights and exports clean CSV/JSON', () => {
    // 1. High history drag
    const historyHeavy = [
      makeTestPromptRecord({
        capturedAt: NOW - HOUR_MS,
        breakdown: {
          input: 200,
          output: 300,
          history: 12000,
          thinking: 0,
          tools: 0,
          overhead: 1500,
        },
      }),
    ];
    const historyInsight = buildEcoInsight(
      historyHeavy,
      'power',
      buildCategoryBreakdown(historyHeavy, 'power'),
    );
    assert.equal(historyInsight.id, 'history-drag');

    // 2. High thinking share
    const thinkingHeavy = [
      makeTestPromptRecord({
        capturedAt: NOW - HOUR_MS,
        breakdown: {
          input: 300,
          output: 300,
          history: 200,
          thinking: 4000,
          tools: 0,
          overhead: 1500,
        },
      }),
    ];
    const thinkingInsight = buildEcoInsight(
      thinkingHeavy,
      'power',
      buildCategoryBreakdown(thinkingHeavy, 'power'),
    );
    assert.equal(thinkingInsight.id, 'thinking-effort');

    // 3. Heavy frontier model dominance (when history and thinking are low)
    const frontierHeavy = [
      makeTestPromptRecord({
        capturedAt: NOW - HOUR_MS,
        provider: 'anthropic',
        model: {
          name: 'claude-fable',
          version: '5',
          thinkingEffort: 'none',
          rawLabel: 'Claude Fable',
        },
        breakdown: {
          input: 2000,
          output: 4000,
          history: 500,
          thinking: 0,
          tools: 0,
          overhead: 1000,
        },
      }),
    ];
    const frontierInsight = buildEcoInsight(
      frontierHeavy,
      'power',
      buildCategoryBreakdown(frontierHeavy, 'power'),
    );
    assert.equal(frontierInsight.id, 'heavy-model');

    // 4. Export JSON & CSV
    const jsonOut = formatRecordsAsJson(historyHeavy);
    assert.equal(JSON.parse(jsonOut).length, 1);
    const csvOut = formatRecordsAsCsv(historyHeavy);
    const csvLines = csvOut.split('\n');
    assert.equal(csvLines.length, 2);
    assert.ok(csvLines[0].startsWith('id,capturedAt,isoTimestamp,provider,modelName'));
  });
});

describe('7. RecordValidator (Corrupt Quarantine, Breakdown Sum Fix, Dynamic Recomputation, Legacy Flagging)', () => {
  const NOW = 1_750_000_000_000;

  it('rejects corrupt, missing, negative, NaN, Infinity, and zero-token impact spike records', () => {
    assert.equal(validateAndNormalizeRecord(null), null);
    assert.equal(validateAndNormalizeRecord({}), null);

    // Negative token count
    const negTokens = makeTestPromptRecord({
      breakdown: { input: -10, history: 100, output: 100, thinking: 0, tools: 0, overhead: 100 },
    });
    assert.equal(validateAndNormalizeRecord(negTokens), null);

    // NaN / Infinity in impact
    const nanImpact = makeTestPromptRecord({
      impact: { energyWh: Number.NaN, waterMl: 10, co2Grams: 1 },
    });
    assert.equal(validateAndNormalizeRecord(nanImpact), null);

    const infImpact = makeTestPromptRecord({
      impact: { energyWh: 1, waterMl: Number.POSITIVE_INFINITY, co2Grams: 1 },
    });
    assert.equal(validateAndNormalizeRecord(infImpact), null);

    // Zero-token impact spike (0 tokens everywhere, but energyWh > 0)
    const zeroSpike = makeTestPromptRecord({
      breakdown: { input: 0, history: 0, output: 0, thinking: 0, tools: 0, overhead: 0 },
      totalTokens: 0,
      impact: { energyWh: 50, waterMl: 177, co2Grams: 15 },
    });
    assert.equal(validateAndNormalizeRecord(zeroSpike), null);

    //Batch filtering drops corrupt items and keeps valid ones
    const validOne = makeTestPromptRecord({ id: 'valid-1', capturedAt: NOW });
    const list = validateAndNormalizeRecords([negTokens, nanImpact, zeroSpike, validOne]);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'valid-1');
  });

  it('fixes token sum mismatches, re-resolves generic model families from rawLabel, and dynamically recomputes legacy flat-rate impact', () => {
    // Legacy record stored with generic model.name = 'gpt' but rawLabel = 'GPT-6 Astra',
    // mismatched totalTokens (999999 instead of 12200), and stale flat-rate energyWh = 999
    const staleRecord = {
      id: 'legacy-with-breakdown',
      conversationUrl: 'https://chatgpt.com/c/legacy',
      capturedAt: NOW - HOUR_MS,
      provider: 'openai',
      model: {
        name: 'gpt',
        version: 'unknown',
        thinkingEffort: 'high',
        rawLabel: 'ChatGPT 6 Astra',
      },
      breakdown: {
        input: 1000,
        history: 10000,
        output: 1000,
        thinking: 2000,
        tools: 0,
        overhead: 2200,
      },
      totalTokens: 999999, // mismatched
      impact: {
        energyWh: 999, // stale pre-update number
        waterMl: 999,
        co2Grams: 999,
      },
      timings: { latencyMs: 2000, thinkingTimeMs: 800 },
      approximate: false,
    };

    const normalized = validateAndNormalizeRecord(staleRecord);
    assert.ok(normalized !== null);
    assert.equal(normalized.isLegacy, false);
    assert.equal(normalized.estimationVersion, CURRENT_ESTIMATION_VERSION);
    // Re-resolved model family and version from rawLabel
    assert.equal(normalized.model.name, 'gpt-astra');
    assert.equal(normalized.model.version, '6');
    // Reconciled totalTokens = 1000 + 10000 + 1000 + 2000 + 0 + 2200 = 16200
    assert.equal(normalized.totalTokens, 16200);
    // Dynamically recomputed impact via current config.json for gpt-astra (energyWhPer1M = 2500)
    const expectedImpact = calculateEnvironmentalImpact(
      staleRecord.breakdown,
      'openai',
      normalized.model,
    );
    assert.deepEqual(normalized.impact, expectedImpact);
    assert.notEqual(normalized.impact.energyWh, 999);

    // Also verify resolveStoredModelInfo for Claude and Gemini labels
    const resolvedClaude = resolveStoredModelInfo('anthropic', {
      name: 'claude',
      version: 'unknown',
      thinkingEffort: 'medium',
      rawLabel: 'Claude 4.5 Opus',
    });
    assert.equal(resolvedClaude.name, 'claude-opus');
    assert.equal(resolvedClaude.version, '4.5');

    const resolvedGemini = resolveStoredModelInfo('google', {
      name: 'gemini',
      version: 'unknown',
      thinkingEffort: 'medium',
      rawLabel: 'Gemini 4 Argon',
    });
    assert.equal(resolvedGemini.name, 'gemini-pro');
    assert.equal(resolvedGemini.version, '4');
  });

  it('flags breakdown-less legacy records with isLegacy=true and excludes them from model efficiency comparisons', () => {
    const breakdownLessLegacy = {
      id: 'old-scalar-only',
      conversationUrl: 'https://claude.ai/chat/1',
      capturedAt: NOW - HOUR_MS,
      provider: 'anthropic',
      model: {
        name: 'claude-opus',
        version: '4',
        thinkingEffort: 'none',
        rawLabel: 'Claude 4 Opus',
      },
      breakdown: {
        input: 0,
        history: 0,
        output: 0,
        thinking: 0,
        tools: 0,
        overhead: 0,
      },
      totalTokens: 50000,
      impact: { energyWh: 100, waterMl: 354, co2Grams: 29 },
      timings: { latencyMs: 1000, thinkingTimeMs: 0 },
      approximate: true,
    };

    const modernRecord = makeTestPromptRecord({
      id: 'modern-sonnet',
      capturedAt: NOW - HOUR_MS,
      provider: 'anthropic',
      model: {
        name: 'claude-sonnet',
        version: '4.5',
        thinkingEffort: 'medium',
        rawLabel: 'Claude 4.5 Sonnet',
      },
    });

    const validatedLegacy = validateAndNormalizeRecord(breakdownLessLegacy);
    assert.ok(validatedLegacy !== null);
    assert.equal(validatedLegacy.isLegacy, true);
    assert.equal(validatedLegacy.totalTokens, 50000);

    const vm = aggregateAnalytics(
      [breakdownLessLegacy, modernRecord],
      'power',
      '7d',
      'impact',
      NOW,
      'perPrompt',
    );
    assert.equal(vm.legacyRecordCount, 1);
    assert.equal(vm.totalLegacyRecordCount, 1);
    // Excluded from modelEfficiency so incompatible flat-rate numbers don't distort rankings
    assert.equal(vm.modelEfficiency.rows.length, 1);
    assert.ok(vm.modelEfficiency.rows[0].label.includes('Claude Sonnet'));
  });

  it('preserves historically stored systemPromptTokens (breakdown.overhead) untouched during normalization', () => {
    // Current config for gpt-astra has systemPromptTokens = 2200, but this historical record stored 1111
    const historicalRecord = makeTestPromptRecord({
      id: 'historical-sysprompt',
      capturedAt: NOW - HOUR_MS,
      provider: 'openai',
      model: {
        name: 'gpt-astra',
        version: '6',
        thinkingEffort: 'high',
        rawLabel: 'GPT-6 Astra',
      },
      breakdown: {
        input: 500,
        history: 1000,
        output: 500,
        thinking: 500,
        tools: 0,
        overhead: 1111, // Historical value must NOT be overwritten by 2200
      },
    });

    const validated = validateAndNormalizeRecord(historicalRecord);
    assert.ok(validated !== null);
    assert.equal(validated.breakdown.overhead, 1111);
    assert.equal(validated.totalTokens, 500 + 1000 + 500 + 500 + 0 + 1111);

    const vm = aggregateAnalytics([historicalRecord], 'tokens', '24h', 'impact', NOW);
    const sysSeg = vm.breakdown.segments.find((s) => s.category === 'systemPrompt');
    assert.equal(sysSeg.rawTokens, 1111);
  });
});

describe('8. Workload-Normalized Model Comparison, Natural Equivalences & Reader Scoping Fixes', () => {
  const NOW = 1_750_000_000_000;

  it('computes Workload-Normalized cost (Wh / 1k work): prompt-size invariant at zero overhead and sensitive to real overhead', () => {
    // 1. Prompt-size invariance when overhead (thinking, tools, history, systemPrompt) is zero:
    // Model A (gpt-sol, 1000 Wh/1M) used on 3 short prompts (100 input, 200 output -> usefulWork = 220)
    // vs Model B (gpt-astra, 2500 Wh/1M) used on 3 long prompts (1000 input, 2000 output -> usefulWork = 2200)
    const solShortZeroOverhead = [1, 2, 3].map((i) =>
      makeTestPromptRecord({
        id: `sol-short-${i}`,
        capturedAt: NOW - HOUR_MS,
        provider: 'openai',
        model: { name: 'gpt-sol', version: '6', thinkingEffort: 'none', rawLabel: 'GPT-6 Sol' },
        breakdown: { input: 100, output: 200, history: 0, thinking: 0, tools: 0, overhead: 0 },
      }),
    );
    const solLongZeroOverhead = [1, 2, 3].map((i) =>
      makeTestPromptRecord({
        id: `sol-long-${i}`,
        capturedAt: NOW - HOUR_MS,
        provider: 'openai',
        model: { name: 'gpt-sol', version: '6.1', thinkingEffort: 'none', rawLabel: 'GPT-6.1 Sol' },
        breakdown: { input: 2000, output: 4000, history: 0, thinking: 0, tools: 0, overhead: 0 },
      }),
    );

    assert.equal(
      computeUsefulWorkTokens({
        input: 100,
        output: 200,
        history: 0,
        thinking: 0,
        tools: 0,
        overhead: 0,
      }),
      220,
    );

    // Default everyday mode: expresses Equal Length rate per 1,000 words (ratePer1kWork * 1.3333)
    const invariantEff = buildModelEfficiency(
      [...solShortZeroOverhead, ...solLongZeroOverhead],
      'power',
      'normalized',
      false,
    );
    assert.equal(invariantEff.mode, 'normalized');
    assert.equal(invariantEff.title, 'Fair model comparison');
    assert.equal(invariantEff.rows.length, 2);
    // Both have 0 overhead and identical model rate: 1.000 Wh/1k work * 1.3333 = 1.3333 Wh/1k words -> "1.3 Wh / 1k words"
    assert.equal(invariantEff.rows[0].ratePer1kWork, 1.0);
    assert.equal(invariantEff.rows[0].efficiencyValue, WORK_TO_1K_WORDS_FACTOR);
    assert.equal(invariantEff.rows[1].efficiencyValue, WORK_TO_1K_WORDS_FACTOR);
    assert.equal(invariantEff.rows[0].formattedValue, '1.3 Wh / 1k words');
    assert.equal(invariantEff.rows[0].secondaryLabel, '3 messages');

    // Technical Details ON: reveals raw Wh / 1k work with 3-decimal precision and inline token metadata
    const invariantTech = buildModelEfficiency(
      [...solShortZeroOverhead, ...solLongZeroOverhead],
      'power',
      'normalized',
      true,
    );
    assert.equal(invariantTech.rows[0].efficiencyValue, 1.0);
    assert.equal(invariantTech.rows[0].formattedValue, '1.000 Wh / 1k work');
    assert.ok(invariantTech.rows[0].secondaryLabel.includes('work'));
    assert.ok(invariantTech.rows[0].secondaryLabel.includes('avg'));
    assert.ok(!invariantTech.rows[0].secondaryLabel.includes('Ø'));

    // 2. When thinking/tools/history overhead increases on the same model, Normalized cost increases:
    const solWithOverhead = [1, 2, 3].map((i) =>
      makeTestPromptRecord({
        id: `sol-ovh-${i}`,
        capturedAt: NOW - HOUR_MS,
        provider: 'openai',
        model: { name: 'gpt-sol', version: '6.2', thinkingEffort: 'high', rawLabel: 'GPT-6.2 Sol' },
        breakdown: {
          input: 100,
          output: 200,
          history: 10000,
          thinking: 1500,
          tools: 3500,
          overhead: 2000,
        },
      }),
    );

    const overheadComp = buildModelEfficiency(
      [...solShortZeroOverhead, ...solWithOverhead],
      'power',
      'normalized',
      false,
    );
    assert.equal(overheadComp.rows.length, 2);
    assert.ok(overheadComp.rows[0].efficiencyValue < overheadComp.rows[1].efficiencyValue);
    assert.ok(overheadComp.subtitle.startsWith('For the same amount of text,'));

    // 3. Zero-division safety when usefulWorkTokens === 0 (input=0, output=0, overhead>0)
    const zeroWorkRec = makeTestPromptRecord({
      id: 'zero-work',
      capturedAt: NOW - HOUR_MS,
      breakdown: { input: 0, output: 0, history: 1000, thinking: 0, tools: 0, overhead: 1000 },
    });
    const zeroWorkEff = buildModelEfficiency([zeroWorkRec], 'power', 'normalized');
    assert.equal(zeroWorkEff.rows.length, 0);

    // 4. < 3 messages headline guard in Equal Length mode
    const lowSampleNorm = buildModelEfficiency(
      [solShortZeroOverhead[0], solWithOverhead[0]],
      'power',
      'normalized',
      false,
    );
    assert.equal(lowSampleNorm.rows[0].isLowSample, true);
    assert.ok(lowSampleNorm.subtitle.startsWith('Most efficient for equal text:'));
  });

  it('applies adaptive human rounding and plain-English labels, titles, and header sublines across tabs', () => {
    // Adaptive human rounding rules
    assert.equal(resolveHumanColumnDecimals([2.7, 0.6]), 1);
    assert.equal(resolveHumanColumnDecimals([0.08, 0.02]), 2);
    assert.equal(resolveHumanColumnDecimals([0.008, 0.002]), 3);
    assert.equal(formatHumanSummaryNumber(2.74), '2.7');
    assert.equal(formatHumanSummaryNumber(0.045), '0.05');
    assert.equal(formatHumanSummaryNumber(0.0042), '0.004');

    // Warm header sublines
    assert.equal(
      formatAnalyticsHeaderSubtitle(1, '24h'),
      'Based on 1 message over the last 24 hours',
    );
    assert.equal(
      formatAnalyticsHeaderSubtitle(12, '7d'),
      'Based on 12 messages over the last 7 days',
    );
    assert.equal(
      formatAnalyticsHeaderSubtitle(42, 'all', 'tokens'),
      'Based on 42 messages across all time · 1,000 tokens ≈ 750 words',
    );

    const rec = makeTestPromptRecord({ capturedAt: NOW - HOUR_MS });

    // Energy tab plain-English copy
    const vmPower = aggregateAnalytics([rec], 'power', '7d', 'impact', NOW, 'normalized', false);
    assert.equal(vmPower.breakdown.title, 'Where your energy goes');
    assert.deepEqual(
      vmPower.breakdown.segments.map((s) => s.label),
      [
        'Your messages',
        'AI replies',
        'AI reasoning',
        'Search & tools',
        'Chat memory',
        'App instructions',
      ],
    );
    assert.equal(vmPower.modelDonut.impactToggleLabel, 'Energy');
    assert.equal(vmPower.modelDonut.messagesToggleLabel, 'Messages');
    assert.equal(
      vmPower.kpis.find((k) => k.id === 'hidden-cost-share').label,
      'Behind-the-scenes energy',
    );
    assert.equal(vmPower.kpis.find((k) => k.id === 'top-model').label, 'Top energy user');

    // Water & CO2 tab plain-English copy
    const vmWater = aggregateAnalytics([rec], 'water', '7d', 'impact', NOW, 'normalized', false);
    assert.equal(vmWater.breakdown.title, 'Where your water goes');
    assert.equal(vmWater.modelDonut.impactToggleLabel, 'Water');
    assert.equal(vmWater.kpis.find((k) => k.id === 'top-model').label, 'Top water user');

    const vmCo2 = aggregateAnalytics([rec], 'co2', '7d', 'impact', NOW, 'normalized', false);
    assert.equal(vmCo2.breakdown.title, 'Where your CO₂ goes');
    assert.equal(vmCo2.modelDonut.impactToggleLabel, 'CO₂');
    assert.equal(vmCo2.kpis.find((k) => k.id === 'top-model').label, 'Top CO₂ user');

    // Natural equivalences & factSheet email benchmark
    assert.equal(
      formatNaturalScaledEquivalent(1.5, '1 minute in a microwave (1,200 W)'),
      '≈ 1.5 minutes in a microwave (1,200 W)',
    );
    assert.equal(
      formatNaturalScaledEquivalent(1.1, '1 second of a running kitchen faucet'),
      '≈ 1.1 seconds of a running kitchen faucet',
    );
    assert.equal(
      formatNaturalScaledEquivalent(1.2, 'Driving a gas car 1 meter'),
      '≈ driving a gas car 1.2 meters',
    );
    assert.equal(
      formatNaturalScaledEquivalent(2.0, 'Sending 1 standard email'),
      '≈ sending 2 standard emails',
    );

    const emailItem = factSheet.kpis.co2.items.find((i) => i.id === 'co2-photo-email');
    assert.equal(emailItem.equivalent, 'Sending 1 standard email');
  });

  it('prevents cross-turn hasMatch leaks and deduplicates sibling tool chips in readToolCalls', () => {
    // 1. hasMatch([], selector) must return false without querying global document
    assert.equal(hasMatch([], '[data-testid*="thought"]'), false);

    // 2. readToolCalls with 1 assistant turn root containing multiple search chips -> 1 search call
    const fakeSearchTurnRoot = {
      matches: () => false,
      querySelector: (sel) => (sel.includes('source-chip') ? {} : null),
      querySelectorAll: () => [],
      contains: () => true,
    };
    const tools = readToolCalls([fakeSearchTurnRoot], {
      search: '',
      code: '',
      other: '',
      searchEvidence: '.source-inline-chip, [data-test-id="source-chip"]',
    });
    assert.deepEqual(tools, ['search']);

    // 3. readAttachments ignores 0x0 unrendered/avatar images while counting real content images (> maxIconPx)
    const zeroByZeroIcon = {
      closest: () => null,
      getAttribute: () => null,
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
      naturalWidth: 0,
      naturalHeight: 0,
    };
    const realUploadImg = {
      closest: () => null,
      getAttribute: () => null,
      getBoundingClientRect: () => ({ width: 320, height: 240 }),
      naturalWidth: 320,
      naturalHeight: 240,
    };
    const fakeUserTurnRoot = {
      matches: () => false,
      querySelectorAll: (sel) => (sel === 'img' ? [zeroByZeroIcon, realUploadImg] : []),
    };
    assert.deepEqual(readAttachments([fakeUserTurnRoot], ''), ['image']);
  });
});

describe('9. Tips Catalog & Personalized Recommender (TipsRecommender)', () => {
  const NOW = 1_750_000_000_000;
  const DAY = 24 * HOUR_MS;

  function makeRecords(count, overridesFactory) {
    return Array.from({ length: count }, (_, i) =>
      makeTestPromptRecord({
        id: `tip-rec-${i}`,
        capturedAt: NOW - (i + 1) * HOUR_MS,
        ...(typeof overridesFactory === 'function' ? overridesFactory(i) : overridesFactory),
      }),
    );
  }

  it('contains all 9 curated jargon-free tips with unique IDs and examples', () => {
    assert.equal(TIPS_CATALOG.length, 9);
    const ids = new Set(TIPS_CATALOG.map((t) => t.id));
    assert.equal(ids.size, 9);
    for (const tip of TIPS_CATALOG) {
      assert.ok(tip.title.length > 0);
      assert.ok(tip.summary.length > 0);
      assert.ok(tip.example.insteadOf.length > 0);
      assert.ok(tip.example.tryThis.length > 0);
      // Primary card copy stays jargon-free
      assert.ok(!/\b(tokens?|kv\s*cache|prefill)\b/i.test(tip.summary));
    }
  });

  it('falls back gracefully to top starter tips when data is empty or sparse (< 3 messages)', () => {
    const empty = recommendTips([], [], NOW);
    assert.equal(empty.isStarterFallback, true);
    assert.equal(empty.sectionTitle, 'Start here: highest-impact habits');
    assert.equal(empty.items.length, 2);
    assert.deepEqual(
      empty.items.map((item) => item.tip.id),
      ['start-fresh-chat', 'match-model-to-task'],
    );
    assert.ok(empty.items.every((item) => item.reason === null));

    const sparse = recommendTips(makeRecords(2, {}), [], NOW);
    assert.equal(sparse.isStarterFallback, true);
    assert.equal(sparse.items.length, 2);
    assert.ok(sparse.items.every((item) => item.reason === null));

    // Widens to last 30 days when 7d has < 3 messages but 30d has >= 3
    const olderBut30d = [10, 12, 15].map((daysAgo, i) =>
      makeTestPromptRecord({
        id: `old-${i}`,
        capturedAt: NOW - daysAgo * DAY,
        breakdown: {
          input: 100,
          output: 200,
          history: 200,
          thinking: 1800,
          tools: 0,
          overhead: 500,
        },
      }),
    );
    const widened = recommendTips(olderBut30d, [], NOW);
    assert.equal(widened.isStarterFallback, false);
    assert.equal(widened.windowLabel, 'last 30 days');
    assert.equal(widened.items[0].tip.id, 'save-deep-thinking');
    assert.ok(widened.items[0].reason.includes('last 30 days'));
  });

  it('selects the right personalized tip for dominant history, thinking, tools, output, and heavy model shares', () => {
    // 1. Dominant history energy share
    const historyRecords = makeRecords(4, {
      breakdown: {
        input: 100,
        output: 200,
        history: 14000,
        thinking: 0,
        tools: 0,
        overhead: 1000,
      },
    });
    const historyRec = recommendTips(historyRecords, [], NOW);
    assert.equal(historyRec.isStarterFallback, false);
    assert.equal(historyRec.items[0].tip.id, 'start-fresh-chat');
    assert.ok(historyRec.items[0].reason.includes('Chat memory'));

    // 2. Dominant thinking energy share
    const thinkingRecords = makeRecords(4, {
      breakdown: {
        input: 200,
        output: 300,
        history: 200,
        thinking: 2500,
        tools: 0,
        overhead: 1000,
      },
    });
    const thinkingRec = recommendTips(thinkingRecords, [], NOW);
    assert.equal(thinkingRec.items[0].tip.id, 'save-deep-thinking');
    assert.ok(thinkingRec.items[0].reason.includes('AI reasoning'));

    // 3. Dominant tools (search) energy share
    const toolsRecords = makeRecords(4, {
      breakdown: {
        input: 100,
        output: 200,
        history: 200,
        thinking: 0,
        tools: 7000,
        overhead: 1000,
      },
    });
    const toolsRec = recommendTips(toolsRecords, [], NOW);
    assert.equal(toolsRec.items[0].tip.id, 'use-regular-search');
    assert.ok(toolsRec.items[0].reason.includes('Search & tools'));

    // 4. Dominant output energy share
    const outputRecords = makeRecords(4, {
      breakdown: {
        input: 120,
        output: 1800,
        history: 200,
        thinking: 0,
        tools: 0,
        overhead: 800,
      },
    });
    const outputRec = recommendTips(outputRecords, [], NOW);
    assert.equal(outputRec.items[0].tip.id, 'ask-for-length-and-format');
    assert.ok(outputRec.items[0].reason.includes('AI replies'));

    // 5. Heavy flagship model share
    const heavyModelRecords = makeRecords(4, {
      provider: 'anthropic',
      model: {
        name: 'claude-opus',
        version: '4.5',
        thinkingEffort: 'none',
        rawLabel: 'Claude Opus',
      },
      breakdown: {
        input: 300,
        output: 400,
        history: 800,
        thinking: 0,
        tools: 0,
        overhead: 2000,
      },
    });
    const heavyRec = recommendTips(heavyModelRecords, [], NOW);
    assert.equal(heavyRec.items[0].tip.id, 'match-model-to-task');
    assert.ok(heavyRec.items[0].reason.includes('Heavy models'));
  });

  it('avoids duplicate recommendations and excludes already-adopted tips when other relevant tips exist', () => {
    // Both thinking and heavy model fire strongly
    const multiSignalRecords = makeRecords(5, {
      provider: 'anthropic',
      model: {
        name: 'claude-fable',
        version: '5',
        thinkingEffort: 'high',
        rawLabel: 'Claude Fable',
      },
      breakdown: {
        input: 150,
        output: 250,
        history: 12000,
        thinking: 2400,
        tools: 0,
        overhead: 2000,
      },
    });

    const initial = recommendTips(multiSignalRecords, [], NOW);
    assert.equal(initial.items.length, 2);
    const initialIds = initial.items.map((item) => item.tip.id);
    assert.equal(new Set(initialIds).size, 2);

    // Adopting the #1 recommended tip promotes the next relevant un-adopted tip into featured slots
    const topId = initialIds[0];
    const afterAdopt = recommendTips(multiSignalRecords, [topId], NOW);
    assert.equal(afterAdopt.items.length, 2);
    assert.ok(!afterAdopt.items.some((item) => item.tip.id === topId));
    assert.equal(new Set(afterAdopt.items.map((item) => item.tip.id)).size, 2);

    // Adopting starter tips in sparse mode rotates to other un-adopted starter tips
    const sparseAdopted = recommendTips([], ['start-fresh-chat'], NOW);
    assert.equal(sparseAdopted.items.length, 2);
    assert.ok(!sparseAdopted.items.some((item) => item.tip.id === 'start-fresh-chat'));
    assert.equal(sparseAdopted.items[0].tip.id, 'match-model-to-task');
  });
});
