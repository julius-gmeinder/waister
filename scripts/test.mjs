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
      export * from './src/readers/sites/effort-inference.helpers';
      export { buildModelInfo, unknownModel } from './src/readers/sites/site.helpers';
      export { parseChatGptSlug, parseChatGptLabel } from './src/readers/sites/chatgpt.site';
      export * from './src/ui/app/pages/facts.helpers';
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
  buildModelInfo,
  parseChatGptSlug,
  parseChatGptLabel,
  formatFactKpiValue,
  formatFactMultiplier,
  getCandidateFacts,
  shuffleFactsBoard,
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
    assert.equal(formatFactMultiplier(36, 15).multiplierText, '~2.4×');
    assert.equal(formatFactMultiplier(6.75, 15).multiplierText, '45% of');
    assert.equal(formatFactMultiplier(180, 15).multiplierText, '~12×');
    assert.equal(formatFactMultiplier(0, 15).isBaselineZero, true);

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

    // Board shuffle deduplicates across daily, weekly, allTime and rotates on re-shuffle
    const mockSummaries = {
      daily: { impact: { energyWh: 25, waterMl: 300, co2Grams: 18 } },
      weekly: { impact: { energyWh: 180, waterMl: 2200, co2Grams: 160 } },
      allTime: { impact: { energyWh: 1400, waterMl: 18000, co2Grams: 1200 } },
    };
    const board1 = shuffleFactsBoard(mockSummaries, null, () => 0.1);
    for (const kpi of ['power', 'water', 'co2']) {
      const ids = new Set([
        board1.daily[kpi].item.id,
        board1.weekly[kpi].item.id,
        board1.allTime[kpi].item.id,
      ]);
      assert.equal(ids.size, 3, `Expected 3 distinct facts across timeframes for ${kpi}`);
    }

    const board2 = shuffleFactsBoard(mockSummaries, board1, () => 0.2);
    for (const kpi of ['power', 'water', 'co2']) {
      assert.notEqual(board2.daily[kpi].item.id, board1.daily[kpi].item.id);
    }
  });
});
