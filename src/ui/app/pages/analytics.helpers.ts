/**
 * Analytics helpers: pure, framework-agnostic validation, normalization, and aggregation of raw
 * `PromptRecordDto` items into ready-to-render view models for the Analytics page.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import { capture, estimation } from '../../../config/config.json';
import type {
  EstimationConfig,
  FactItem,
  FactKpiId,
  TokenEnergyCategory,
} from '../../../config/config.types';
import factSheet from '../../../config/factSheet.json';
import type { ModelInfo, Provider, ThinkingEffort } from '../../../dto/chat-capture.dto';
import type { PromptRecordDto } from '../../../dto/prompt-record.dto';
import type { EnvironmentalImpact, TokenBreakdown } from '../../../dto/token-estimate.dto';
import { formatCount, type Quantity } from '../../format.helpers';
import { DAY_MS } from '../../timeframe.helpers';

const ESTIMATION_CONFIG: EstimationConfig = estimation;
const { impact: IMPACT_CONFIG, models: MODELS_CONFIG } = ESTIMATION_CONFIG;
const ROUNDING_FACTOR = 10 ** IMPACT_CONFIG.roundingDecimals;

export const HOUR_MS = 60 * 60 * 1000;
export const LOW_SAMPLE_PROMPT_THRESHOLD = 3;
/** Standard English text equivalence: 1,000 words ≈ 1,333.3 tokens (1,000 tokens ≈ 750 words). */
export const WORK_TO_1K_WORDS_FACTOR = 1.3333;
export const TOKENS_TO_WORDS_NOTE = '1,000 tokens ≈ 750 words';

const ESTIMATION_VERSION_STAMP = `v2-${IMPACT_CONFIG.waterMlPerWh}-${IMPACT_CONFIG.cachedInputMultiplier}-${IMPACT_CONFIG.tokenEnergyProfile.history.avgCacheHitRate}`;

export type AnalyticsMetricTab = 'all' | 'power' | 'water' | 'co2' | 'tokens';
export type AnalyticsTimeframe = '24h' | '7d' | '30d' | 'all';
export type ModelUsageMode = 'impact' | 'prompts';
export type ModelEfficiencyMode = 'normalized' | 'perPrompt' | 'modelRate';

export interface MetricTabOption {
  id: AnalyticsMetricTab;
  label: string;
  unitLabel: string;
}

export interface AnalyticsTimeframeOption {
  id: AnalyticsTimeframe;
  label: string;
  shortPeriodLabel: string | null;
}

export const ANALYTICS_METRIC_TABS: readonly MetricTabOption[] = [
  { id: 'all', label: 'All', unitLabel: 'Wh' },
  { id: 'power', label: 'Power', unitLabel: 'Wh' },
  { id: 'water', label: 'Water', unitLabel: 'mL' },
  { id: 'co2', label: 'CO₂', unitLabel: 'g CO₂' },
  { id: 'tokens', label: 'Tokens', unitLabel: 'tokens' },
];

export const ANALYTICS_TIMEFRAMES: readonly AnalyticsTimeframeOption[] = [
  { id: '24h', label: '24h', shortPeriodLabel: '24h' },
  { id: '7d', label: '7d', shortPeriodLabel: '7d' },
  { id: '30d', label: '30d', shortPeriodLabel: '30d' },
  { id: 'all', label: 'All time', shortPeriodLabel: null },
];

export interface AnalyticsWindow {
  timeframe: AnalyticsTimeframe;
  nowMs: number;
  sinceMs: number;
  prevSinceMs: number | null;
  durationMs: number | null;
  shortPeriodLabel: string | null;
}

export type KpiTone = 'power' | 'water' | 'co2' | 'neutral';

export interface AnalyticsKpiCardViewModel {
  id: string;
  label: string;
  tone: KpiTone;
  value: string;
  unit: string;
  deltaText: string | null;
  deltaTrend: 'up' | 'down' | 'flat' | null;
  comparisonText: string;
  /** Set when the value is a token count, so the page renders it with TokenCount. */
  tokens?: number;
}

export interface CategoryBreakdownSegment {
  category: TokenEnergyCategory;
  group: 'visible' | 'hidden';
  label: string;
  rawTokens: number;
  weightedValue: number;
  formattedValue: string;
  percentage: number;
  formattedPercentage: string;
  effectiveMultiplier: number;
}

export interface CategoryBreakdownViewModel {
  metric: AnalyticsMetricTab;
  title: string;
  isImpactWeighted: boolean;
  totalRawTokens: number;
  totalWeightedValue: number;
  formattedTotal: string;
  visibleSharePct: number;
  formattedVisibleSharePct: string;
  hiddenSharePct: number;
  formattedHiddenSharePct: string;
  segments: CategoryBreakdownSegment[];
  subtitle: string;
  tooltip: string;
}

export interface ModelDonutSlice {
  id: string;
  label: string;
  provider: Provider | 'other';
  value: number;
  formattedValue: string;
  percentage: number;
  promptCount: number;
  promptSharePct: number;
  impactSharePct: number;
  totalTokens: number;
  isOther: boolean;
  colorIndex: number;
}

export interface ModelDonutViewModel {
  mode: ModelUsageMode;
  impactToggleLabel: string;
  messagesToggleLabel: string;
  totalValue: number;
  centerValue: string;
  centerUnit: string;
  centerLabel: string;
  slices: ModelDonutSlice[];
  subtitle: string;
  tooltip: string;
}

export interface ModelEfficiencyRow {
  id: string;
  label: string;
  provider: Provider;
  promptCount: number;
  totalTokens: number;
  avgTokensPerPrompt: number;
  usefulWorkTokens: number;
  outputEquivalentTokens: number;
  isLowSample: boolean;
  /** Numeric value driving the bar ranking (per 1k words by default, or per 1k work in technical mode). */
  efficiencyValue: number;
  /** Underlying rate per 1k output-equivalent work tokens (kept for technical verification). */
  ratePer1kWork: number;
  /** Fixed-decimal formatted number + unit (e.g. `2.7 Wh / 1k words`). */
  formattedValue: string;
  /** Clean everyday subline placed beneath the model name (e.g. `14 messages`). */
  messageCountLabel: string;
  /** Inline power-user detail shown when Technical Details is ON. */
  technicalDetailLabel: string;
  /** Clean hover/focus tooltip containing deeper token/work/average stats. */
  hoverTooltip: string;
  /** Auxiliary metadata string (points to `messageCountLabel` or `technicalDetailLabel` per mode). */
  secondaryLabel: string;
  /** Normalized bar length (0..100). */
  barWidthPct: number;
  /** Normalized rank intensity (0 = best/most efficient, 1 = least efficient) for color scaling. */
  rankIntensity: number;
}

export interface ModelEfficiencyViewModel {
  mode: ModelEfficiencyMode;
  showTechnicalDetails: boolean;
  title: string;
  directionCue: 'Lower is better' | 'Higher is better';
  unitLabel: string;
  decimals: number;
  rows: ModelEfficiencyRow[];
  subtitle: string;
  tooltip: string;
}

export interface HistoryTimeBucket {
  index: number;
  startMs: number;
  endMs: number;
  label: string;
  tooltipLabel: string;
  promptCount: number;
  avgHistoryTokens: number;
  avgNewTokens: number;
  avgTotalVisibleTokens: number;
  historyHeightPct: number;
  newHeightPct: number;
}

export interface HistoryTimeSeriesViewModel {
  timeframe: AnalyticsTimeframe;
  buckets: HistoryTimeBucket[];
  maxAvgTokens: number;
  overallAvgHistoryTokens: number;
  overallAvgNewTokens: number;
  peakBucketLabel: string | null;
  subtitle: string;
  tooltip: string;
}

export interface EcoInsightViewModel {
  id: 'history-drag' | 'thinking-effort' | 'heavy-model' | 'cache-efficiency' | 'sparse';
  badge: string;
  headline: string;
  detail: string;
  savingsBadge: string | null;
  tone: KpiTone;
}

export interface AnalyticsViewModel {
  metric: AnalyticsMetricTab;
  timeframe: AnalyticsTimeframe;
  modelUsageMode: ModelUsageMode;
  modelEfficiencyMode: ModelEfficiencyMode;
  showTechnicalDetails: boolean;
  headerSubtitle: string;
  promptCount: number;
  previousPromptCount: number;
  /** Legacy records in the active timeframe that lack a category breakdown. */
  legacyRecordCount: number;
  /** Legacy records across the entire stored dataset. */
  totalLegacyRecordCount: number;
  isEmpty: boolean;
  kpis: AnalyticsKpiCardViewModel[];
  breakdown: CategoryBreakdownViewModel;
  modelDonut: ModelDonutViewModel;
  modelEfficiency: ModelEfficiencyViewModel;
  historySeries: HistoryTimeSeriesViewModel;
  ecoInsight: EcoInsightViewModel;
}

/**
 * Ordered consistently by group with plain-English everyday labels:
 * Visible first (`Your Messages`, `AI Replies`), followed by Behind the Scenes
 * (`AI Reasoning`, `Search & Tools`, `Chat Memory`, `App Instructions`).
 */
const CATEGORY_ORDER: readonly {
  category: TokenEnergyCategory;
  group: 'visible' | 'hidden';
  label: string;
}[] = [
  { category: 'input', group: 'visible', label: 'Your messages' },
  { category: 'output', group: 'visible', label: 'AI replies' },
  { category: 'thinking', group: 'hidden', label: 'AI reasoning' },
  { category: 'tools', group: 'hidden', label: 'Search & tools' },
  { category: 'history', group: 'hidden', label: 'Chat memory' },
  { category: 'systemPrompt', group: 'hidden', label: 'App instructions' },
];

/** Friendly display names for known model families in `config.json`. */
const MODEL_DISPLAY_LABELS: Record<string, string> = {
  gpt: 'GPT',
  'gpt-astra': 'GPT Astra',
  'gpt-sol': 'GPT Sol',
  'gpt-luna': 'GPT Luna',
  'openai-o': 'OpenAI o-series',
  claude: 'Claude',
  'claude-fable': 'Claude Fable',
  'claude-opus': 'Claude Opus',
  'claude-sonnet': 'Claude Sonnet',
  'claude-haiku': 'Claude Haiku',
  gemini: 'Gemini',
  'gemini-neon': 'Gemini Neon',
  'gemini-pro': 'Gemini Pro',
  'gemini-hydrogen': 'Gemini Hydrogen',
  'gemini-flash': 'Gemini Flash',
};

const VALID_PROVIDERS = new Set<Provider>(['openai', 'anthropic', 'google']);
const VALID_EFFORTS = new Set<ThinkingEffort>([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'unknown',
]);

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function roundImpactMetric(value: number): number {
  return Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR;
}

function formatMessageCount(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'message' : 'messages'}`;
}

function getMetricDisplayNames(metric: AnalyticsMetricTab): {
  titleCase: string;
  lowerCase: string;
  topUserLabel: string;
  breakdownTitle: string;
  donutToggleLabel: string;
} {
  switch (metric) {
    case 'water':
      return {
        titleCase: 'Water',
        lowerCase: 'water',
        topUserLabel: 'Top water user',
        breakdownTitle: 'Where your water goes',
        donutToggleLabel: 'Water (%)',
      };
    case 'co2':
      return {
        titleCase: 'CO₂',
        lowerCase: 'CO₂',
        topUserLabel: 'Top CO₂ user',
        breakdownTitle: 'Where your CO₂ goes',
        donutToggleLabel: 'CO₂ (%)',
      };
    case 'tokens':
      return {
        titleCase: 'Tokens',
        lowerCase: 'tokens',
        topUserLabel: 'Top token user',
        breakdownTitle: 'Where your tokens go',
        donutToggleLabel: 'Tokens (%)',
      };
    case 'all':
    case 'power':
      return {
        titleCase: 'Energy',
        lowerCase: 'energy',
        topUserLabel: 'Top energy user',
        breakdownTitle: 'Where your energy goes',
        donutToggleLabel: 'Energy (%)',
      };
  }
}

/** Warm, plain-English header subline adapting naturally to each timeframe. */
export function formatAnalyticsHeaderSubtitle(
  messageCount: number,
  timeframe: AnalyticsTimeframe,
  metric: AnalyticsMetricTab = 'all',
): string {
  const countText = formatMessageCount(messageCount);
  let base: string;
  switch (timeframe) {
    case '24h':
      base = `Based on ${countText} over the last 24 hours`;
      break;
    case '7d':
      base = `Based on ${countText} over the last 7 days`;
      break;
    case '30d':
      base = `Based on ${countText} over the last 30 days`;
      break;
    case 'all':
      base = `Based on ${countText} across all time`;
      break;
  }
  return metric === 'tokens' ? `${base} · ${TOKENS_TO_WORDS_NOTE}` : base;
}

/** Effective energy multiplier for a token category from `config.json`. */
export function getCategoryEffectiveMultiplier(category: TokenEnergyCategory): number {
  const profile = IMPACT_CONFIG.tokenEnergyProfile[category];
  return (
    (1 - profile.avgCacheHitRate) * profile.baseMultiplier +
    profile.avgCacheHitRate * IMPACT_CONFIG.cachedInputMultiplier
  );
}

/** Resolves a model's base `energyWhPer1M` from `config.json`. */
export function getModelBaseEnergyWhPer1M(provider: Provider, model: ModelInfo): number {
  const providerModels = MODELS_CONFIG[provider] ?? MODELS_CONFIG.openai;
  const rates = providerModels.families[model.name] ?? providerModels.default;
  return rates.energyWhPer1M;
}

/**
 * Visible useful workload tokens in output-equivalent units:
 * `outputTokens + m_input * inputTokens` (where `m_input = tokenEnergyProfile.input.baseMultiplier = 0.2`).
 */
export function computeUsefulWorkTokens(breakdown: TokenBreakdown): number {
  const inputBaseMultiplier = IMPACT_CONFIG.tokenEnergyProfile.input.baseMultiplier;
  return Math.max(0, breakdown.output) + inputBaseMultiplier * Math.max(0, breakdown.input);
}

/**
 * Computes total output-equivalent weighted tokens across all 6 categories:
 * `sum(categoryTokens * effectiveCategoryMultiplier)`.
 */
export function computeOutputEquivalentTokens(breakdown: TokenBreakdown): number {
  return (
    Math.max(0, breakdown.output) * getCategoryEffectiveMultiplier('output') +
    Math.max(0, breakdown.thinking) * getCategoryEffectiveMultiplier('thinking') +
    Math.max(0, breakdown.input) * getCategoryEffectiveMultiplier('input') +
    Math.max(0, breakdown.tools) * getCategoryEffectiveMultiplier('tools') +
    Math.max(0, breakdown.history) * getCategoryEffectiveMultiplier('history') +
    Math.max(0, breakdown.overhead) * getCategoryEffectiveMultiplier('systemPrompt')
  );
}

/**
 * Recomputes environmental impact from a breakdown, provider, and model using current `config.json`.
 * Keeps stored `breakdown.overhead` (`systemPromptTokens`) intact.
 */
export function recomputeRecordImpact(
  breakdown: TokenBreakdown,
  provider: Provider,
  model: ModelInfo,
): EnvironmentalImpact {
  const energyWhPer1M = getModelBaseEnergyWhPer1M(provider, model);
  const outputEqTokens = computeOutputEquivalentTokens(breakdown);
  const totalEnergyWh = (outputEqTokens / IMPACT_CONFIG.perTokensUnit) * energyWhPer1M;
  const co2GramsPerWh = IMPACT_CONFIG.co2GramsPerWh[provider] ?? IMPACT_CONFIG.co2GramsPerWh.openai;

  return {
    energyWh: roundImpactMetric(totalEnergyWh),
    waterMl: roundImpactMetric(totalEnergyWh * IMPACT_CONFIG.waterMlPerWh),
    co2Grams: roundImpactMetric(totalEnergyWh * co2GramsPerWh),
  };
}

/**
 * Re-resolves a stored `ModelInfo` against `config.json` (`capture.models` and `estimation.models`)
 * so legacy records with generic family names (`gpt`, `claude`, `gemini`, `unknown`) map to their
 * specific model family when `rawLabel` carries a recognizable keyword.
 */
export function resolveAnalyticsModelInfo(provider: Provider, model: ModelInfo): ModelInfo {
  const providerFamilies = MODELS_CONFIG[provider].families as Record<string, unknown>;
  const rawLabel = (model.rawLabel || '').trim();
  const lowerLabel = rawLabel.toLowerCase();
  const lowerName = (model.name || '').trim().toLowerCase();

  let resolvedName = model.name;
  let resolvedVersion = model.version || 'unknown';

  const hasSpecificFamily =
    resolvedName in providerFamilies && (provider !== 'openai' || resolvedName !== 'gpt');

  if (!hasSpecificFamily && ((lowerLabel && lowerLabel !== 'unknown') || lowerName)) {
    const searchTarget =
      lowerLabel && lowerLabel !== 'unknown' ? `${lowerLabel} ${lowerName}` : lowerName;

    if (provider === 'anthropic') {
      const matched = Object.entries(capture.models.claude.families).find(([, keywords]) =>
        keywords.some((kw) => searchTarget.includes(kw)),
      )?.[0];
      if (matched) resolvedName = matched;
    } else if (provider === 'google') {
      const matched = Object.entries(capture.models.gemini.families).find(([, keywords]) =>
        keywords.some((kw) => searchTarget.includes(kw)),
      )?.[0];
      if (matched) resolvedName = matched;
    } else if (provider === 'openai') {
      const matched = Object.entries(capture.models.chatgpt.families).find(([, keywords]) =>
        keywords.some((kw) => searchTarget.includes(kw)),
      )?.[0];
      if (matched) {
        resolvedName = matched;
      } else if (
        new RegExp(capture.models.chatgpt.slug.oSeries, 'i').test(searchTarget) ||
        new RegExp(capture.models.chatgpt.label.oSeries, 'i').test(searchTarget)
      ) {
        resolvedName = 'openai-o';
      } else if (resolvedName in providerFamilies) {
        resolvedName = 'gpt';
      }
    }
  }

  if (resolvedVersion === 'unknown' && rawLabel && rawLabel !== 'unknown') {
    const versionMatch = rawLabel.match(/(\d+(?:[.-]\d+)?)/);
    if (versionMatch?.[1]) {
      resolvedVersion = versionMatch[1].replace('-', '.');
    }
  }

  const thinkingEffort: ThinkingEffort = VALID_EFFORTS.has(model.thinkingEffort)
    ? model.thinkingEffort
    : 'unknown';

  return {
    name: resolvedName || 'unknown',
    version: resolvedVersion,
    thinkingEffort,
    rawLabel: rawLabel || resolvedName || 'unknown',
  };
}

/**
 * Pure validator & normalizer invoked on records before aggregation.
 * Explicitly preserves historically stored `breakdown.overhead` (`systemPromptTokens`) intact.
 */
export function normalizeAnalyticsRecord(candidate: unknown): PromptRecordDto | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const raw = candidate as Record<string, unknown>;

  if (typeof raw.id !== 'string' || raw.id.trim() === '') return null;
  if (typeof raw.provider !== 'string' || !VALID_PROVIDERS.has(raw.provider as Provider)) {
    return null;
  }
  const provider = raw.provider as Provider;

  if (!isFiniteNonNegative(raw.capturedAt) || raw.capturedAt <= 0) return null;
  if (!isFiniteNonNegative(raw.totalTokens)) return null;

  if (!raw.model || typeof raw.model !== 'object') return null;
  const rawModel = raw.model as Record<string, unknown>;
  if (typeof rawModel.name !== 'string' || rawModel.name.trim() === '') return null;

  if (!raw.breakdown || typeof raw.breakdown !== 'object') return null;
  const rawBreakdown = raw.breakdown as Record<string, unknown>;
  const input = rawBreakdown.input;
  const history = rawBreakdown.history;
  const output = rawBreakdown.output;
  const thinking = rawBreakdown.thinking;
  const tools = rawBreakdown.tools ?? 0;
  const overhead = rawBreakdown.overhead ?? rawBreakdown.systemPrompt;

  if (
    !isFiniteNonNegative(input) ||
    !isFiniteNonNegative(history) ||
    !isFiniteNonNegative(output) ||
    !isFiniteNonNegative(thinking) ||
    !isFiniteNonNegative(tools) ||
    !isFiniteNonNegative(overhead)
  ) {
    return null;
  }

  if (!raw.impact || typeof raw.impact !== 'object') return null;
  const rawImpact = raw.impact as Record<string, unknown>;
  if (
    !isFiniteNonNegative(rawImpact.energyWh) ||
    !isFiniteNonNegative(rawImpact.waterMl) ||
    !isFiniteNonNegative(rawImpact.co2Grams)
  ) {
    return null;
  }

  const rawTimings =
    raw.timings && typeof raw.timings === 'object'
      ? (raw.timings as Record<string, unknown>)
      : { latencyMs: 0, thinkingTimeMs: 0 };
  const latencyMs = rawTimings.latencyMs ?? 0;
  const thinkingTimeMs = rawTimings.thinkingTimeMs ?? 0;
  if (!isFiniteNonNegative(latencyMs) || !isFiniteNonNegative(thinkingTimeMs)) {
    return null;
  }

  const breakdown: TokenBreakdown = {
    input: Math.round(input),
    history: Math.round(history),
    output: Math.round(output),
    thinking: Math.round(thinking),
    tools: Math.round(tools),
    overhead: Math.round(overhead),
  };

  const breakdownSum =
    breakdown.input +
    breakdown.history +
    breakdown.output +
    breakdown.thinking +
    breakdown.tools +
    breakdown.overhead;

  const rawTotalTokens = Math.round(raw.totalTokens);

  if (
    breakdownSum === 0 &&
    rawTotalTokens === 0 &&
    (rawImpact.energyWh > 0 || rawImpact.waterMl > 0 || rawImpact.co2Grams > 0)
  ) {
    return null;
  }

  const resolvedModel = resolveAnalyticsModelInfo(provider, {
    name: rawModel.name,
    version: typeof rawModel.version === 'string' ? rawModel.version : 'unknown',
    thinkingEffort:
      typeof rawModel.thinkingEffort === 'string'
        ? (rawModel.thinkingEffort as ThinkingEffort)
        : 'unknown',
    rawLabel: typeof rawModel.rawLabel === 'string' ? rawModel.rawLabel : rawModel.name,
  });

  const isLegacy = raw.isLegacy === true || (breakdownSum === 0 && rawTotalTokens > 0);

  if (isLegacy) {
    return {
      id: raw.id,
      conversationUrl: typeof raw.conversationUrl === 'string' ? raw.conversationUrl : '',
      capturedAt: raw.capturedAt,
      provider,
      model: resolvedModel,
      breakdown,
      totalTokens: rawTotalTokens,
      impact: {
        energyWh: rawImpact.energyWh,
        waterMl: rawImpact.waterMl,
        co2Grams: rawImpact.co2Grams,
      },
      timings: { latencyMs, thinkingTimeMs },
      approximate: Boolean(raw.approximate),
      estimationVersion:
        typeof raw.estimationVersion === 'string' && raw.estimationVersion
          ? raw.estimationVersion
          : 'legacy',
      isLegacy: true,
    };
  }

  const totalTokens = breakdownSum;
  const recomputedImpact =
    totalTokens > 0
      ? recomputeRecordImpact(breakdown, provider, resolvedModel)
      : { energyWh: 0, waterMl: 0, co2Grams: 0 };

  return {
    id: raw.id,
    conversationUrl: typeof raw.conversationUrl === 'string' ? raw.conversationUrl : '',
    capturedAt: raw.capturedAt,
    provider,
    model: resolvedModel,
    breakdown,
    totalTokens,
    impact: recomputedImpact,
    timings: { latencyMs, thinkingTimeMs },
    approximate: Boolean(raw.approximate),
    estimationVersion: ESTIMATION_VERSION_STAMP,
    isLegacy: false,
  };
}

/** Formats a number with an exact fixed number of decimal places (`0.6`, `2.7`, `0.240`). */
export function formatFixedDecimal(value: number, decimals: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Adaptive human-friendly decimal precision for a column of numbers:
 * - `1` decimal place when values are `>= 0.1` (e.g., `2.7 Wh`, `0.6 Wh`)
 * - `2` decimal places when `0.01 <= max < 0.1`
 * - `3` decimal places only when `< 0.01`
 * Applied uniformly across every row in the same list.
 */
export function resolveHumanColumnDecimals(
  values: readonly number[],
  isIntegerMetric = false,
): number {
  if (isIntegerMetric) return 0;
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  if (positive.length === 0) return 1;
  const maxVal = positive.reduce((m, v) => Math.max(m, v), 0);
  if (maxVal >= 0.1) return 1;
  if (maxVal >= 0.01) return 2;
  return 3;
}

/** Higher-precision fixed decimal count for power-user technical mode. */
export function resolveColumnDecimals(values: readonly number[], isIntegerMetric = false): number {
  if (isIntegerMetric) return 0;
  const maxVal = values.reduce((max, v) => (Number.isFinite(v) ? Math.max(max, v) : max), 0);
  if (maxVal === 0) return 3;
  if (maxVal < 10) return 3;
  if (maxVal < 100) return 2;
  return 1;
}

/** Formats a single summary number with adaptive human-friendly rounding. */
export function formatHumanSummaryNumber(value: number): string {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  if (safe === 0) return '0';
  if (safe >= 100) return Math.round(safe).toLocaleString('en-US');
  if (safe >= 0.1) return formatFixedDecimal(safe, 1);
  if (safe >= 0.01) return formatFixedDecimal(safe, 2);
  return formatFixedDecimal(safe, 3);
}

/** Formats a compact token number (`1.2k`, `1.4M`, `450`). */
export function formatCompactTokens(tokens: number): string {
  const safe = Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0;
  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  }
  if (safe >= 1_000) {
    return `${(safe / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
  }
  return safe.toLocaleString('en-US');
}

function formatHumanScaled(rawValue: number, smallUnit: string, largeUnit: string): Quantity {
  const safe = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 0;
  if (safe >= 1000) {
    return { value: formatHumanSummaryNumber(safe / 1000), unit: largeUnit };
  }
  return { value: formatHumanSummaryNumber(safe), unit: smallUnit };
}

/** Formats a quantity according to the active metric tab using adaptive human-friendly rounding. */
export function formatMetricQuantity(metric: AnalyticsMetricTab, value: number): Quantity {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  switch (metric) {
    case 'all':
    case 'power':
      return formatHumanScaled(safe, 'Wh', 'kWh');
    case 'water':
      return formatHumanScaled(safe, 'mL', 'L');
    case 'co2':
      return formatHumanScaled(safe, 'g', 'kg');
    case 'tokens':
      return { value: formatCompactTokens(safe), unit: 'tok' };
  }
}

/** Formats a single combined string (`2.7 Wh`, `1.2 L`, `4.5k tok`) for legends and subtitles. */
export function formatMetricCombined(metric: AnalyticsMetricTab, value: number): string {
  const q = formatMetricQuantity(metric, value);
  return `${q.value} ${q.unit}`;
}

/** Extracts the scalar metric value for a prompt record depending on the selected metric tab. */
export function getRecordMetricValue(record: PromptRecordDto, metric: AnalyticsMetricTab): number {
  switch (metric) {
    case 'all':
    case 'power':
      return Math.max(0, record.impact.energyWh);
    case 'water':
      return Math.max(0, record.impact.waterMl);
    case 'co2':
      return Math.max(0, record.impact.co2Grams);
    case 'tokens':
      return Math.max(0, record.totalTokens);
  }
}

/** Resolves window bounds and prior-period comparison bounds for a timeframe. */
export function resolveAnalyticsWindow(
  timeframe: AnalyticsTimeframe,
  nowMs: number,
): AnalyticsWindow {
  switch (timeframe) {
    case '24h': {
      const durationMs = 24 * HOUR_MS;
      const sinceMs = nowMs - durationMs;
      return {
        timeframe,
        nowMs,
        sinceMs,
        prevSinceMs: sinceMs - durationMs,
        durationMs,
        shortPeriodLabel: '24h',
      };
    }
    case '7d': {
      const durationMs = 7 * DAY_MS;
      const sinceMs = nowMs - durationMs;
      return {
        timeframe,
        nowMs,
        sinceMs,
        prevSinceMs: sinceMs - durationMs,
        durationMs,
        shortPeriodLabel: '7d',
      };
    }
    case '30d': {
      const durationMs = 30 * DAY_MS;
      const sinceMs = nowMs - durationMs;
      return {
        timeframe,
        nowMs,
        sinceMs,
        prevSinceMs: sinceMs - durationMs,
        durationMs,
        shortPeriodLabel: '30d',
      };
    }
    case 'all':
      return {
        timeframe,
        nowMs,
        sinceMs: 0,
        prevSinceMs: null,
        durationMs: null,
        shortPeriodLabel: null,
      };
  }
}

/** Filters records inside `[sinceMs, untilMs)`. */
export function filterRecordsByWindow(
  records: readonly PromptRecordDto[],
  sinceMs: number,
  untilMs?: number,
): PromptRecordDto[] {
  return records.filter((r) => {
    if (r.capturedAt < sinceMs) return false;
    if (untilMs !== undefined && r.capturedAt >= untilMs) return false;
    return true;
  });
}

/**
 * Formats a percentage delta vs. the previous period (`+12% vs prev 7d`).
 * Returns `{ deltaText: null, deltaTrend: null }` when `All Time` is active or prior data is 0.
 */
export function computePeriodDelta(
  currentValue: number,
  previousValue: number,
  shortPeriodLabel: string | null,
  previousPromptCount: number,
): { deltaText: string | null; deltaTrend: 'up' | 'down' | 'flat' | null } {
  if (
    !shortPeriodLabel ||
    previousPromptCount <= 0 ||
    !Number.isFinite(previousValue) ||
    previousValue <= 0
  ) {
    return { deltaText: null, deltaTrend: null };
  }

  const rawPct = ((currentValue - previousValue) / previousValue) * 100;
  if (!Number.isFinite(rawPct)) {
    return { deltaText: null, deltaTrend: null };
  }

  const rounded = Math.round(rawPct);
  if (rounded === 0) {
    return { deltaText: `0% vs prev ${shortPeriodLabel}`, deltaTrend: 'flat' };
  }
  const sign = rounded > 0 ? '+' : '';
  return {
    deltaText: `${sign}${rounded}% vs prev ${shortPeriodLabel}`,
    deltaTrend: rounded > 0 ? 'up' : 'down',
  };
}

function lowerFirstPreservingUnits(phrase: string): string {
  const normalizedUnits = phrase.replace(/(\d)(W|kW|Wh|kWh)\b/g, '$1 $2');
  if (/^(?:LED|TV|EV|HD|CO₂|A4)\b/.test(normalizedUnits)) {
    return normalizedUnits;
  }
  return normalizedUnits.charAt(0).toLowerCase() + normalizedUnits.slice(1);
}

function formatScaledCount(amount: number): string {
  if (amount < 10) {
    const rounded = Math.round(amount * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  }
  return Math.round(amount).toLocaleString('en-US');
}

function pluralizeSingularUnit(unitWord: string, numericStr: string): string {
  if (numericStr === '1' || numericStr === '1.0') return unitWord;
  if (unitWord.endsWith('s') || unitWord === 'km' || unitWord === 'm') return unitWord;
  if (unitWord === 'person’s' || unitWord === "person's") return unitWord;
  if (unitWord.endsWith('ch') || unitWord.endsWith('sh')) return `${unitWord}es`;
  return `${unitWord}s`;
}

/**
 * Formats a natural, grammatically scaled real-world equivalence phrase without awkward
 * `"1.5× 1 minute..."` or lowercased `"1,200w"` unit defects.
 */
export function formatNaturalScaledEquivalent(ratio: number, rawEquivalent: string): string {
  const cleanEq = rawEquivalent.replace(/(\d)(W|kW|Wh|kWh)\b/g, '$1 $2');

  if (ratio < 0.01) {
    return `<1% of ${lowerFirstPreservingUnits(cleanEq)}`;
  }
  if (ratio < 0.95) {
    const pct = Math.max(1, Math.round(ratio * 100));
    return `≈ ${pct}% of ${lowerFirstPreservingUnits(cleanEq)}`;
  }

  const leadingMatch =
    /^(\d+(?:\.\d+)?)\s+(?:(single|level|standard|classic|short|modern|eco|large|small|full)\s+)?([a-zA-Z₂]+)(\b.*)$/.exec(
      cleanEq,
    );
  if (leadingMatch) {
    const baseCount = Number(leadingMatch[1]);
    const adjective = leadingMatch[2];
    const noun = leadingMatch[3]!;
    const rest = leadingMatch[4] ?? '';
    const scaled = baseCount * ratio;
    const numStr = formatScaledCount(scaled);
    const inflectedNoun = pluralizeSingularUnit(noun, numStr);
    const keepAdjective = adjective && adjective !== 'single' ? `${adjective} ` : '';
    return `≈ ${numStr} ${keepAdjective}${inflectedNoun}${rest}`;
  }

  const embeddedMatch =
    /^(.*?\b)(\d+(?:\.\d+)?)\s+(?:(single|standard|short)\s+)?(meter|meters|kilometer|kilometers|km|m|minute|minutes|second|seconds|hour|hours|slice|slices|sheet|sheets|cup|cups|mug|mugs|bag|bags|bottle|bottles|can|cans|burger|burgers|email|emails|car length)(\b.*)$/i.exec(
      cleanEq,
    );
  if (embeddedMatch) {
    const prefix = lowerFirstPreservingUnits(embeddedMatch[1]!);
    const baseCount = Number(embeddedMatch[2]);
    const adjective = embeddedMatch[3];
    const unitWord = embeddedMatch[4]!;
    const suffix = embeddedMatch[5] ?? '';
    const scaled = baseCount * ratio;
    const numStr = formatScaledCount(scaled);
    const inflectedUnit =
      unitWord === 'car length'
        ? numStr === '1'
          ? 'car length'
          : 'car lengths'
        : pluralizeSingularUnit(unitWord, numStr);
    const adjPart = adjective && adjective !== 'single' ? `${adjective} ` : '';
    return `≈ ${prefix}${numStr} ${adjPart}${inflectedUnit}${suffix}`;
  }

  const numStr = formatScaledCount(ratio);
  return `≈ ${numStr}× ${lowerFirstPreservingUnits(cleanEq)}`;
}

/**
 * Picks a deterministic, human-readable 1-line real-world equivalent from `factSheet.json`.
 */
export function formatRealWorldComparison(kpi: FactKpiId, rawValue: number): string {
  const items: readonly FactItem[] = factSheet.kpis[kpi].items;
  if (!Number.isFinite(rawValue) || rawValue <= 0 || items.length === 0) {
    const baseline = items[0];
    return baseline
      ? `0 · Ref: ${baseline.equivalent.replace(/(\d)(W|kW|Wh|kWh)\b/g, '$1 $2')}`
      : 'No impact recorded yet';
  }

  const directItems = items.filter((item) => !item.isVirtualWater && item.value > 0);
  const pool = directItems.length > 0 ? directItems : items;

  let bestItem = pool[0]!;
  let bestScore = Infinity;
  for (const item of pool) {
    const ratio = rawValue / item.value;
    const distance = Math.abs(Math.log(Math.max(1e-9, ratio / 1.5)));
    if (distance < bestScore) {
      bestScore = distance;
      bestItem = item;
    }
  }

  const ratio = rawValue / bestItem.value;
  return formatNaturalScaledEquivalent(ratio, bestItem.equivalent);
}

/** Human-friendly display name for a record's model (`Claude Sonnet 4.5`, `GPT Astra 6`). */
export function formatModelDisplayName(provider: Provider, model: ModelInfo): string {
  const baseName = MODEL_DISPLAY_LABELS[model.name] ?? model.name;
  const version = model.version && model.version !== 'unknown' ? model.version : '';
  if (!version) return baseName;
  if (baseName.toLowerCase().includes(version.toLowerCase())) {
    return baseName;
  }
  return `${baseName} ${version}`;
}

/** Canonical grouping key for a model family + version. */
export function getModelGroupKey(provider: Provider, model: ModelInfo): string {
  const version = model.version && model.version !== 'unknown' ? model.version : '';
  return `${provider}:${model.name}:${version}`;
}

/**
 * Computes per-category impact or token values for a single prompt record.
 */
export function computeRecordCategoryValues(
  record: PromptRecordDto,
  metric: AnalyticsMetricTab,
): Record<TokenEnergyCategory, number> {
  const rawCounts: Record<TokenEnergyCategory, number> = {
    input: Math.max(0, record.breakdown.input),
    output: Math.max(0, record.breakdown.output),
    thinking: Math.max(0, record.breakdown.thinking),
    tools: Math.max(0, record.breakdown.tools),
    history: Math.max(0, record.breakdown.history),
    systemPrompt: Math.max(0, record.breakdown.overhead),
  };

  if (metric === 'tokens') {
    return rawCounts;
  }

  const energyWhPer1M = getModelBaseEnergyWhPer1M(record.provider, record.model);
  const unroundedWh: Record<TokenEnergyCategory, number> = {
    input: 0,
    output: 0,
    thinking: 0,
    tools: 0,
    history: 0,
    systemPrompt: 0,
  };

  let formulaTotalWh = 0;
  for (const { category } of CATEGORY_ORDER) {
    const count = rawCounts[category];
    if (count === 0) continue;
    const mult = getCategoryEffectiveMultiplier(category);
    const wh = (count / IMPACT_CONFIG.perTokensUnit) * energyWhPer1M * mult;
    unroundedWh[category] = wh;
    formulaTotalWh += wh;
  }

  const targetTotal = getRecordMetricValue(record, metric);
  const scale = formulaTotalWh > 0 ? targetTotal / formulaTotalWh : 0;

  return {
    input: unroundedWh.input * scale,
    output: unroundedWh.output * scale,
    thinking: unroundedWh.thinking * scale,
    tools: unroundedWh.tools * scale,
    history: unroundedWh.history * scale,
    systemPrompt: unroundedWh.systemPrompt * scale,
  };
}

/**
 * Formats all 6 category values in `<HiddenCostCard>` with uniform fixed decimal precision and unit.
 * Uses adaptive human-friendly decimals by default, or higher technical precision when toggled on.
 */
function formatConsistentCategoryValues(
  values: Record<TokenEnergyCategory, number>,
  metric: AnalyticsMetricTab,
  showTechnicalDetails: boolean,
): Record<TokenEnergyCategory, string> {
  if (metric === 'tokens') {
    return {
      input: `${formatCompactTokens(values.input)} tok`,
      output: `${formatCompactTokens(values.output)} tok`,
      thinking: `${formatCompactTokens(values.thinking)} tok`,
      tools: `${formatCompactTokens(values.tools)} tok`,
      history: `${formatCompactTokens(values.history)} tok`,
      systemPrompt: `${formatCompactTokens(values.systemPrompt)} tok`,
    };
  }

  const nums = Object.values(values);
  const maxVal = nums.reduce((m, v) => Math.max(m, v), 0);
  const useLargeUnit = maxVal >= 1000;
  const scaleDivisor = useLargeUnit ? 1000 : 1;
  const scaledValues = nums.map((v) => v / scaleDivisor);
  const decimals = showTechnicalDetails
    ? resolveColumnDecimals(scaledValues, false)
    : resolveHumanColumnDecimals(scaledValues, false);

  const unit =
    metric === 'water'
      ? useLargeUnit
        ? 'L'
        : 'mL'
      : metric === 'co2'
        ? useLargeUnit
          ? 'kg'
          : 'g'
        : useLargeUnit
          ? 'kWh'
          : 'Wh';

  return {
    input: `${formatFixedDecimal(values.input / scaleDivisor, decimals)} ${unit}`,
    output: `${formatFixedDecimal(values.output / scaleDivisor, decimals)} ${unit}`,
    thinking: `${formatFixedDecimal(values.thinking / scaleDivisor, decimals)} ${unit}`,
    tools: `${formatFixedDecimal(values.tools / scaleDivisor, decimals)} ${unit}`,
    history: `${formatFixedDecimal(values.history / scaleDivisor, decimals)} ${unit}`,
    systemPrompt: `${formatFixedDecimal(values.systemPrompt / scaleDivisor, decimals)} ${unit}`,
  };
}

/** Row 2: Two-group stacked breakdown bar ("Where Your Energy/Water/CO₂/Tokens Goes"). */
export function buildCategoryBreakdown(
  records: readonly PromptRecordDto[],
  metric: AnalyticsMetricTab,
  showTechnicalDetails = false,
): CategoryBreakdownViewModel {
  const isImpactWeighted = metric !== 'tokens';
  const metricNames = getMetricDisplayNames(metric);

  const rawTotals: Record<TokenEnergyCategory, number> = {
    input: 0,
    output: 0,
    thinking: 0,
    tools: 0,
    history: 0,
    systemPrompt: 0,
  };
  const weightedTotals: Record<TokenEnergyCategory, number> = {
    input: 0,
    output: 0,
    thinking: 0,
    tools: 0,
    history: 0,
    systemPrompt: 0,
  };

  for (const record of records) {
    if (record.isLegacy) continue;
    rawTotals.input += Math.max(0, record.breakdown.input);
    rawTotals.output += Math.max(0, record.breakdown.output);
    rawTotals.thinking += Math.max(0, record.breakdown.thinking);
    rawTotals.tools += Math.max(0, record.breakdown.tools);
    rawTotals.history += Math.max(0, record.breakdown.history);
    rawTotals.systemPrompt += Math.max(0, record.breakdown.overhead);

    const catValues = computeRecordCategoryValues(record, metric);
    for (const { category } of CATEGORY_ORDER) {
      weightedTotals[category] += catValues[category];
    }
  }

  const totalRawTokens = Object.values(rawTotals).reduce((a, b) => a + b, 0);
  const totalWeightedValue = Object.values(weightedTotals).reduce((a, b) => a + b, 0);
  const formattedValues = formatConsistentCategoryValues(
    weightedTotals,
    metric,
    showTechnicalDetails,
  );

  const segments: CategoryBreakdownSegment[] = CATEGORY_ORDER.map(({ category, group, label }) => {
    const weightedValue = weightedTotals[category];
    const percentage =
      totalWeightedValue > 0 ? Math.round((weightedValue / totalWeightedValue) * 1000) / 10 : 0;

    return {
      category,
      group,
      label,
      rawTokens: rawTotals[category],
      weightedValue,
      formattedValue: formattedValues[category],
      percentage,
      formattedPercentage: `${formatFixedDecimal(percentage, 1)}%`,
      effectiveMultiplier: getCategoryEffectiveMultiplier(category),
    };
  });

  const visibleSum = segments
    .filter((s) => s.group === 'visible')
    .reduce((sum, s) => sum + s.weightedValue, 0);
  const hiddenSum = segments
    .filter((s) => s.group === 'hidden')
    .reduce((sum, s) => sum + s.weightedValue, 0);

  const visibleSharePct =
    totalWeightedValue > 0 ? Math.round((visibleSum / totalWeightedValue) * 1000) / 10 : 0;
  const hiddenSharePct =
    totalWeightedValue > 0 ? Math.round((hiddenSum / totalWeightedValue) * 1000) / 10 : 0;

  const formattedVisibleSharePct = `${formatFixedDecimal(visibleSharePct, 1)}%`;
  const formattedHiddenSharePct = `${formatFixedDecimal(hiddenSharePct, 1)}%`;

  let subtitle: string;
  if (totalWeightedValue <= 0) {
    subtitle = 'No activity recorded for this timeframe yet';
  } else {
    const topSegment = [...segments].sort((a, b) => b.weightedValue - a.weightedValue)[0]!;
    subtitle = `Behind-the-scenes work drives ${formattedHiddenSharePct} of your ${metricNames.lowerCase} · Biggest driver: ${topSegment.label} (${topSegment.formattedPercentage})`;
  }

  const tooltip = isImpactWeighted
    ? `Shows how much of your ${metricNames.lowerCase} goes to the messages you see versus behind-the-scenes work like AI reasoning, web searches, and re-reading chat memory. Re-read context is cached and uses much less energy per word than new replies.`
    : `Shows how your text splits between your visible conversation and behind-the-scenes work like AI reasoning, tools, and chat memory (${TOKENS_TO_WORDS_NOTE}).`;

  return {
    metric,
    title: metricNames.breakdownTitle,
    isImpactWeighted,
    totalRawTokens,
    totalWeightedValue,
    formattedTotal: formatMetricCombined(metric, totalWeightedValue),
    visibleSharePct,
    formattedVisibleSharePct,
    hiddenSharePct,
    formattedHiddenSharePct,
    segments,
    subtitle,
    tooltip,
  };
}

interface AggregatedModelGroup {
  key: string;
  label: string;
  provider: Provider;
  model: ModelInfo;
  promptCount: number;
  totalTokens: number;
  usefulTokens: number;
  usefulWorkTokens: number;
  outputEquivalentTokens: number;
  metricTotal: number;
}

function aggregateByModel(
  records: readonly PromptRecordDto[],
  metric: AnalyticsMetricTab,
  excludeLegacy = false,
): AggregatedModelGroup[] {
  const map = new Map<string, AggregatedModelGroup>();

  for (const record of records) {
    if (excludeLegacy && record.isLegacy) continue;
    const key = getModelGroupKey(record.provider, record.model);
    const label = formatModelDisplayName(record.provider, record.model);
    const existing = map.get(key) ?? {
      key,
      label,
      provider: record.provider,
      model: record.model,
      promptCount: 0,
      totalTokens: 0,
      usefulTokens: 0,
      usefulWorkTokens: 0,
      outputEquivalentTokens: 0,
      metricTotal: 0,
    };

    existing.promptCount += 1;
    existing.totalTokens += Math.max(0, record.totalTokens);
    existing.usefulTokens +=
      Math.max(0, record.breakdown.input) + Math.max(0, record.breakdown.output);
    existing.usefulWorkTokens += computeUsefulWorkTokens(record.breakdown);
    existing.outputEquivalentTokens += computeOutputEquivalentTokens(record.breakdown);
    existing.metricTotal += getRecordMetricValue(record, metric);
    map.set(key, existing);
  }

  return Array.from(map.values());
}

/**
 * Row 3 Left: Relative Model Usage Donut Chart view model.
 */
export function buildModelDonut(
  records: readonly PromptRecordDto[],
  metric: AnalyticsMetricTab,
  mode: ModelUsageMode,
): ModelDonutViewModel {
  const metricNames = getMetricDisplayNames(metric);
  const groups = aggregateByModel(records, metric, false);
  const totalImpact = groups.reduce((s, g) => s + g.metricTotal, 0);
  const totalPrompts = groups.reduce((s, g) => s + g.promptCount, 0);
  const totalValue = mode === 'prompts' ? totalPrompts : totalImpact;

  const sorted = [...groups]
    .filter((g) => (mode === 'prompts' ? g.promptCount > 0 : g.metricTotal > 0))
    .sort((a, b) => {
      const valA = mode === 'prompts' ? a.promptCount : a.metricTotal;
      const valB = mode === 'prompts' ? b.promptCount : b.metricTotal;
      if (valB !== valA) return valB - valA;
      return b.promptCount - a.promptCount;
    });

  const topFive = sorted.slice(0, 5);
  const rest = sorted.slice(5);

  const slices: ModelDonutSlice[] = topFive.map((group, idx) => {
    const value = mode === 'prompts' ? group.promptCount : group.metricTotal;
    const percentage = totalValue > 0 ? Math.round((value / totalValue) * 1000) / 10 : 0;
    const promptSharePct =
      totalPrompts > 0 ? Math.round((group.promptCount / totalPrompts) * 100) : 0;
    const impactSharePct =
      totalImpact > 0 ? Math.round((group.metricTotal / totalImpact) * 100) : 0;

    return {
      id: group.key,
      label: group.label,
      provider: group.provider,
      value,
      formattedValue:
        mode === 'prompts'
          ? formatMessageCount(group.promptCount)
          : formatMetricCombined(metric, group.metricTotal),
      percentage,
      promptCount: group.promptCount,
      promptSharePct,
      impactSharePct,
      totalTokens: group.totalTokens,
      isOther: false,
      colorIndex: idx,
    };
  });

  if (rest.length > 0) {
    const otherPrompts = rest.reduce((s, g) => s + g.promptCount, 0);
    const otherImpact = rest.reduce((s, g) => s + g.metricTotal, 0);
    const otherTokens = rest.reduce((s, g) => s + g.totalTokens, 0);
    const value = mode === 'prompts' ? otherPrompts : otherImpact;
    const percentage = totalValue > 0 ? Math.round((value / totalValue) * 1000) / 10 : 0;

    slices.push({
      id: 'other',
      label: 'Other',
      provider: 'other',
      value,
      formattedValue:
        mode === 'prompts'
          ? formatMessageCount(otherPrompts)
          : formatMetricCombined(metric, otherImpact),
      percentage,
      promptCount: otherPrompts,
      promptSharePct: totalPrompts > 0 ? Math.round((otherPrompts / totalPrompts) * 100) : 0,
      impactSharePct: totalImpact > 0 ? Math.round((otherImpact / totalImpact) * 100) : 0,
      totalTokens: otherTokens,
      isOther: true,
      colorIndex: 5,
    });
  }

  let centerValue: string;
  let centerUnit: string;
  let centerLabel: string;

  if (mode === 'prompts') {
    centerValue = formatCount(totalPrompts);
    centerUnit = totalPrompts === 1 ? 'message' : 'messages';
    centerLabel = 'Total messages';
  } else {
    const q = formatMetricQuantity(metric, totalImpact);
    centerValue = q.value;
    centerUnit = q.unit;
    centerLabel = `Total ${metricNames.lowerCase}`;
  }

  let subtitle: string;
  if (slices.length === 0) {
    subtitle = 'No model activity recorded in this timeframe';
  } else {
    const lead = slices[0]!;
    if (slices.length === 1) {
      subtitle = `${lead.label} accounts for 100% of your ${metricNames.lowerCase} (${formatMessageCount(lead.promptCount)})`;
    } else {
      subtitle = `${lead.label} uses ${lead.impactSharePct}% of your ${metricNames.lowerCase} across ${lead.promptSharePct}% of your messages`;
    }
  }

  const tooltip = `Compares each AI model’s share of your ${metricNames.lowerCase} against how often you message it. Smaller models beyond the top 5 are grouped into "Other".`;

  return {
    mode,
    impactToggleLabel: metricNames.donutToggleLabel,
    messagesToggleLabel: 'Messages (%)',
    totalValue,
    centerValue,
    centerUnit,
    centerLabel,
    slices,
    subtitle,
    tooltip,
  };
}

function resolveIntrinsicRatePer1kOutputEq(
  group: AggregatedModelGroup,
  metric: Exclude<AnalyticsMetricTab, 'tokens'>,
): number {
  if (group.outputEquivalentTokens > 0) {
    const baseEnergyWhPer1M = getModelBaseEnergyWhPer1M(group.provider, group.model);
    const whPer1kEq = (baseEnergyWhPer1M / IMPACT_CONFIG.perTokensUnit) * 1000;
    if (metric === 'power' || metric === 'all') return roundImpactMetric(whPer1kEq);
    if (metric === 'water') return roundImpactMetric(whPer1kEq * IMPACT_CONFIG.waterMlPerWh);
    const co2PerWh =
      IMPACT_CONFIG.co2GramsPerWh[group.provider] ?? IMPACT_CONFIG.co2GramsPerWh.openai;
    return roundImpactMetric(whPer1kEq * co2PerWh);
  }
  return 0;
}

/**
 * Row 3 Right: "Fair Model Comparison" (`Equal Length` vs `Per Message`).
 * - Default `'normalized'` ("Equal Length"): expresses workload-normalized impact per 1,000 words
 *   (`ratePer1kWords = ratePer1kWork * 1.3333`) in everyday mode, or per 1,000 work tokens in
 *   technical mode.
 * - Second `'perPrompt'` ("Per Message"): average cost per message.
 */
export function buildModelEfficiency(
  records: readonly PromptRecordDto[],
  metric: AnalyticsMetricTab,
  mode: ModelEfficiencyMode = 'normalized',
  showTechnicalDetails = false,
): ModelEfficiencyViewModel {
  const metricNames = getMetricDisplayNames(metric);
  const groups = aggregateByModel(records, metric, true).filter(
    (g) => g.promptCount > 0 && g.totalTokens > 0,
  );
  const isTokensTab = metric === 'tokens';

  const tooltip = isTokensTab
    ? `Equal length shows what share of each model’s text goes directly to your visible conversation versus behind-the-scenes work (${TOKENS_TO_WORDS_NOTE}). Per message shows your average tokens per message.`
    : `Equal length compares models fairly for the same amount of text (1,000 words ≈ 1,333 tokens), including all behind-the-scenes reasoning, tools, and chat memory. Per message shows your real average cost per message.`;

  // MODE: Per Message (Raw Session Average)
  if (mode === 'perPrompt') {
    const shortUnit =
      metric === 'tokens' ? 'tok' : metric === 'water' ? 'mL' : metric === 'co2' ? 'g' : 'Wh';
    const unitLabel = `${shortUnit} / msg`;

    const withAvg = groups.map((g) => ({
      ...g,
      avgImpactPerPrompt: g.metricTotal / g.promptCount,
      avgTokPerPrompt: Math.round(g.totalTokens / g.promptCount),
      ratePer1kWork:
        g.usefulWorkTokens > 0 ? roundImpactMetric(g.metricTotal / (g.usefulWorkTokens / 1000)) : 0,
    }));

    withAvg.sort((a, b) => a.avgImpactPerPrompt - b.avgImpactPerPrompt);

    const values = withAvg.map((g) => g.avgImpactPerPrompt);
    const decimals = showTechnicalDetails
      ? resolveColumnDecimals(values, isTokensTab)
      : resolveHumanColumnDecimals(values, isTokensTab);
    const maxVal = values.reduce((m, v) => Math.max(m, v), 0);

    const rows: ModelEfficiencyRow[] = withAvg.map((g, idx) => {
      const formattedNum = isTokensTab
        ? Math.round(g.avgImpactPerPrompt).toLocaleString('en-US')
        : formatFixedDecimal(g.avgImpactPerPrompt, decimals);
      const barWidthPct =
        maxVal > 0 ? Math.max(8, Math.round((g.avgImpactPerPrompt / maxVal) * 100)) : 8;
      const rankIntensity = withAvg.length > 1 ? idx / (withAvg.length - 1) : 0;

      const messageCountLabel = formatMessageCount(g.promptCount);
      const technicalDetailLabel = `${formatCompactTokens(g.totalTokens)} tok · avg ${formatCompactTokens(g.avgTokPerPrompt)} tokens/msg`;
      const hoverTooltip = `${g.label}: ${messageCountLabel} · ${formatCompactTokens(g.totalTokens)} total tokens · avg ${formatCompactTokens(g.avgTokPerPrompt)} tokens/msg`;

      return {
        id: g.key,
        label: g.label,
        provider: g.provider,
        promptCount: g.promptCount,
        totalTokens: g.totalTokens,
        avgTokensPerPrompt: g.avgTokPerPrompt,
        usefulWorkTokens: g.usefulWorkTokens,
        outputEquivalentTokens: g.outputEquivalentTokens,
        isLowSample: g.promptCount < LOW_SAMPLE_PROMPT_THRESHOLD,
        efficiencyValue: g.avgImpactPerPrompt,
        ratePer1kWork: g.ratePer1kWork,
        formattedValue: `${formattedNum} ${unitLabel}`,
        messageCountLabel,
        technicalDetailLabel,
        hoverTooltip,
        secondaryLabel: showTechnicalDetails ? technicalDetailLabel : messageCountLabel,
        barWidthPct,
        rankIntensity,
      };
    });

    let subtitle = 'No model comparison data available in this timeframe';
    if (rows.length === 1) {
      const only = rows[0]!;
      subtitle = `${only.label} averages ${only.formattedValue} across ${only.messageCountLabel}`;
    } else if (rows.length > 1) {
      const reliable = rows.filter((r) => !r.isLowSample);
      if (reliable.length >= 2) {
        const lowest = reliable[0]!;
        const highest = reliable[reliable.length - 1]!;
        const ratio =
          lowest.efficiencyValue > 0 ? highest.efficiencyValue / lowest.efficiencyValue : 1;
        subtitle =
          ratio >= 1.15
            ? `${highest.label} averages ${formatFixedDecimal(ratio, 1)}× more ${metricNames.lowerCase} per message than ${lowest.label}`
            : `Lowest average per message: ${lowest.label} at ${lowest.formattedValue}`;
      } else {
        const lowest = rows[0]!;
        subtitle = `Lowest average per message: ${lowest.label} at ${lowest.formattedValue}`;
      }
    }

    return {
      mode: 'perPrompt',
      showTechnicalDetails,
      title: 'Fair model comparison',
      directionCue: 'Lower is better',
      unitLabel,
      decimals,
      rows,
      subtitle,
      tooltip,
    };
  }

  // Tokens tab in Equal Length / Model Rate mode: Direct Text Share ((input + output) / totalTokens)
  if (isTokensTab) {
    const sorted = [...groups].sort((a, b) => {
      const ratioA = a.usefulTokens / a.totalTokens;
      const ratioB = b.usefulTokens / b.totalTokens;
      return ratioB - ratioA;
    });

    const decimals = 1;
    const rows: ModelEfficiencyRow[] = sorted.map((g, idx) => {
      const usefulPct = (g.usefulTokens / g.totalTokens) * 100;
      const overheadPct = Math.max(0, 100 - usefulPct);
      const avgTokPerPrompt = Math.round(g.totalTokens / g.promptCount);
      const rankIntensity = sorted.length > 1 ? idx / (sorted.length - 1) : 0;

      const messageCountLabel = formatMessageCount(g.promptCount);
      const technicalDetailLabel = `${formatFixedDecimal(overheadPct, decimals)}% behind-the-scenes · avg ${formatCompactTokens(avgTokPerPrompt)} tokens/msg`;
      const hoverTooltip = `${g.label}: ${messageCountLabel} · ${formatFixedDecimal(usefulPct, 1)}% visible text · ${formatFixedDecimal(overheadPct, 1)}% behind-the-scenes · avg ${formatCompactTokens(avgTokPerPrompt)} tokens/msg`;

      return {
        id: g.key,
        label: g.label,
        provider: g.provider,
        promptCount: g.promptCount,
        totalTokens: g.totalTokens,
        avgTokensPerPrompt: avgTokPerPrompt,
        usefulWorkTokens: g.usefulWorkTokens,
        outputEquivalentTokens: g.outputEquivalentTokens,
        isLowSample: g.promptCount < LOW_SAMPLE_PROMPT_THRESHOLD,
        efficiencyValue: Math.round(usefulPct * 10) / 10,
        ratePer1kWork: 0,
        formattedValue: `${formatFixedDecimal(usefulPct, decimals)}% direct text`,
        messageCountLabel,
        technicalDetailLabel,
        hoverTooltip,
        secondaryLabel: showTechnicalDetails ? technicalDetailLabel : messageCountLabel,
        barWidthPct: Math.max(8, Math.min(100, Math.round(usefulPct))),
        rankIntensity,
      };
    });

    let subtitle = 'No model text efficiency data available';
    if (rows.length === 1) {
      subtitle = `${rows[0]!.label} puts ${rows[0]!.formattedValue} into visible conversation (${TOKENS_TO_WORDS_NOTE})`;
    } else if (rows.length > 1) {
      const reliable = rows.filter((r) => !r.isLowSample);
      if (reliable.length >= 2) {
        const best = reliable[0]!;
        const worst = reliable[reliable.length - 1]!;
        subtitle = `Most direct: ${best.label} (${best.formattedValue}) · Most behind-the-scenes: ${worst.label} (${formatFixedDecimal(100 - worst.efficiencyValue, 1)}%)`;
      } else {
        const best = rows[0]!;
        subtitle = `Highest direct text share: ${best.label} at ${best.formattedValue}`;
      }
    }

    return {
      mode,
      showTechnicalDetails,
      title: 'Fair model comparison',
      directionCue: 'Higher is better',
      unitLabel: 'Direct text share',
      decimals,
      rows,
      subtitle,
      tooltip,
    };
  }

  // MODE: Normalized (Default — "Equal Length": Impact per 1,000 words, or per 1k work in technical mode)
  if (mode === 'normalized') {
    const shortUnit = metric === 'water' ? 'mL' : metric === 'co2' ? 'g' : 'Wh';
    const unitSuffix = showTechnicalDetails ? `${shortUnit} / 1k work` : `${shortUnit} / 1k words`;

    const withNormalized = groups
      .filter((g) => g.usefulWorkTokens > 0)
      .map((g) => {
        const ratePer1kWork = roundImpactMetric(g.metricTotal / (g.usefulWorkTokens / 1000));
        const ratePer1kWords = roundImpactMetric(ratePer1kWork * WORK_TO_1K_WORDS_FACTOR);
        return {
          ...g,
          ratePer1kWork,
          ratePer1kWords,
          displayRate: showTechnicalDetails ? ratePer1kWork : ratePer1kWords,
          avgTokPerPrompt: Math.round(g.totalTokens / g.promptCount),
        };
      });

    withNormalized.sort((a, b) => a.displayRate - b.displayRate);

    const normValues = withNormalized.map((g) => g.displayRate);
    const decimals = showTechnicalDetails
      ? resolveColumnDecimals(normValues, false)
      : resolveHumanColumnDecimals(normValues, false);
    const maxNorm = normValues.reduce((m, v) => Math.max(m, v), 0);

    const rows: ModelEfficiencyRow[] = withNormalized.map((g, idx) => {
      const formattedNum = formatFixedDecimal(g.displayRate, decimals);
      const barWidthPct =
        maxNorm > 0 ? Math.max(8, Math.round((g.displayRate / maxNorm) * 100)) : 8;
      const rankIntensity = withNormalized.length > 1 ? idx / (withNormalized.length - 1) : 0;

      const messageCountLabel = formatMessageCount(g.promptCount);
      const technicalDetailLabel = `${formatCompactTokens(Math.round(g.usefulWorkTokens))} work · ${formatCompactTokens(g.totalTokens)} tok · avg ${formatCompactTokens(g.avgTokPerPrompt)} tokens/msg`;
      const hoverTooltip = `${g.label}: ${messageCountLabel} · ${formatCompactTokens(g.totalTokens)} total tokens · ${formatCompactTokens(Math.round(g.usefulWorkTokens))} work tokens · avg ${formatCompactTokens(g.avgTokPerPrompt)} tokens/msg`;

      return {
        id: g.key,
        label: g.label,
        provider: g.provider,
        promptCount: g.promptCount,
        totalTokens: g.totalTokens,
        avgTokensPerPrompt: g.avgTokPerPrompt,
        usefulWorkTokens: g.usefulWorkTokens,
        outputEquivalentTokens: g.outputEquivalentTokens,
        isLowSample: g.promptCount < LOW_SAMPLE_PROMPT_THRESHOLD,
        efficiencyValue: g.displayRate,
        ratePer1kWork: g.ratePer1kWork,
        formattedValue: `${formattedNum} ${unitSuffix}`,
        messageCountLabel,
        technicalDetailLabel,
        hoverTooltip,
        secondaryLabel: showTechnicalDetails ? technicalDetailLabel : messageCountLabel,
        barWidthPct,
        rankIntensity,
      };
    });

    let subtitle = 'No model comparison data available in this timeframe';
    if (rows.length === 1) {
      subtitle = `${rows[0]!.label} uses ${rows[0]!.formattedValue}`;
    } else if (rows.length > 1) {
      const reliable = rows.filter((r) => !r.isLowSample);
      if (reliable.length >= 2) {
        const best = reliable[0]!;
        const worst = reliable[reliable.length - 1]!;
        const ratio = best.efficiencyValue > 0 ? worst.efficiencyValue / best.efficiencyValue : 1;
        if (ratio >= 1.15) {
          subtitle = showTechnicalDetails
            ? `${best.label} uses ${formatFixedDecimal(ratio, 1)}× less ${metricNames.lowerCase} per 1k work than ${worst.label}`
            : `For the same amount of text, ${best.label} uses ${formatFixedDecimal(ratio, 1)}× less ${metricNames.lowerCase} than ${worst.label}`;
        } else {
          subtitle = `Most efficient for equal text: ${best.label} at ${best.formattedValue}`;
        }
      } else {
        const best = rows[0]!;
        subtitle = `Most efficient for equal text: ${best.label} at ${best.formattedValue}`;
      }
    }

    return {
      mode: 'normalized',
      showTechnicalDetails,
      title: 'Fair model comparison',
      directionCue: 'Lower is better',
      unitLabel: unitSuffix,
      decimals,
      rows,
      subtitle,
      tooltip,
    };
  }

  // MODE: Model Rate (Programmatic intrinsic rate per 1,000 output-equivalent tokens)
  const unitSuffix =
    metric === 'water'
      ? 'mL / 1k eq. tok'
      : metric === 'co2'
        ? 'g CO₂ / 1k eq. tok'
        : 'Wh / 1k eq. tok';

  const withRate = groups.map((g) => ({
    ...g,
    ratePer1kEq: resolveIntrinsicRatePer1kOutputEq(g, metric),
    avgTokPerPrompt: Math.round(g.totalTokens / g.promptCount),
  }));

  withRate.sort((a, b) => a.ratePer1kEq - b.ratePer1kEq);

  const rateValues = withRate.map((g) => g.ratePer1kEq);
  const decimals = resolveColumnDecimals(rateValues, false);
  const maxRate = rateValues.reduce((m, v) => Math.max(m, v), 0);

  const rows: ModelEfficiencyRow[] = withRate.map((g, idx) => {
    const formattedNum = formatFixedDecimal(g.ratePer1kEq, decimals);
    const barWidthPct = maxRate > 0 ? Math.max(8, Math.round((g.ratePer1kEq / maxRate) * 100)) : 8;
    const rankIntensity = withRate.length > 1 ? idx / (withRate.length - 1) : 0;

    const messageCountLabel = formatMessageCount(g.promptCount);
    const technicalDetailLabel = `${formatCompactTokens(g.totalTokens)} tok · avg ${formatCompactTokens(g.avgTokPerPrompt)} tokens/msg`;
    const hoverTooltip = `${g.label}: ${messageCountLabel} · ${formatCompactTokens(g.totalTokens)} total tokens · avg ${formatCompactTokens(g.avgTokPerPrompt)} tokens/msg`;

    return {
      id: g.key,
      label: g.label,
      provider: g.provider,
      promptCount: g.promptCount,
      totalTokens: g.totalTokens,
      avgTokensPerPrompt: g.avgTokPerPrompt,
      usefulWorkTokens: g.usefulWorkTokens,
      outputEquivalentTokens: g.outputEquivalentTokens,
      isLowSample: g.promptCount < LOW_SAMPLE_PROMPT_THRESHOLD,
      efficiencyValue: g.ratePer1kEq,
      ratePer1kWork: g.ratePer1kEq,
      formattedValue: `${formattedNum} ${unitSuffix}`,
      messageCountLabel,
      technicalDetailLabel,
      hoverTooltip,
      secondaryLabel: showTechnicalDetails ? technicalDetailLabel : messageCountLabel,
      barWidthPct,
      rankIntensity,
    };
  });

  let subtitle = 'No model rate data available in this timeframe';
  if (rows.length === 1) {
    subtitle = `${rows[0]!.label} operates at ${rows[0]!.formattedValue}`;
  } else if (rows.length > 1) {
    const reliable = rows.filter((r) => !r.isLowSample);
    if (reliable.length >= 2) {
      const best = reliable[0]!;
      const worst = reliable[reliable.length - 1]!;
      const ratio = best.efficiencyValue > 0 ? worst.efficiencyValue / best.efficiencyValue : 1;
      subtitle =
        ratio >= 1.15
          ? `${best.label} uses ${formatFixedDecimal(ratio, 1)}× less ${metricNames.lowerCase} per 1k output-eq. tokens than ${worst.label}`
          : `${best.label} leads intrinsic efficiency at ${best.formattedValue}`;
    } else {
      const best = rows[0]!;
      subtitle = `Lowest intrinsic rate: ${best.label} at ${best.formattedValue}`;
    }
  }

  return {
    mode: 'modelRate',
    showTechnicalDetails,
    title: 'Intrinsic model rate',
    directionCue: 'Lower is better',
    unitLabel: unitSuffix,
    decimals,
    rows,
    subtitle,
    tooltip,
  };
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatHourBucketLabel(ms: number): string {
  const d = new Date(ms);
  const hrs = d.getHours().toString().padStart(2, '0');
  return `${hrs}:00`;
}

/**
 * Row 4: Chat Memory Over Time (Avg Chat Memory vs Avg New Text per message).
 */
export function buildHistoryTimeSeries(
  records: readonly PromptRecordDto[],
  timeframe: AnalyticsTimeframe,
  nowMs: number,
): HistoryTimeSeriesViewModel {
  let bucketCount: number;
  let bucketDurationMs: number;
  let seriesStartMs: number;

  if (timeframe === '24h') {
    bucketCount = 12;
    bucketDurationMs = 2 * HOUR_MS;
    seriesStartMs = nowMs - bucketCount * bucketDurationMs;
  } else if (timeframe === '7d') {
    bucketCount = 7;
    bucketDurationMs = DAY_MS;
    seriesStartMs = nowMs - bucketCount * bucketDurationMs;
  } else if (timeframe === '30d') {
    bucketCount = 10;
    bucketDurationMs = 3 * DAY_MS;
    seriesStartMs = nowMs - bucketCount * bucketDurationMs;
  } else {
    const minCapturedAt =
      records.length > 0
        ? records.reduce((min, r) => Math.min(min, r.capturedAt), records[0]!.capturedAt)
        : nowMs - 14 * DAY_MS;
    const rawSpanMs = Math.max(DAY_MS, nowMs - minCapturedAt);
    const spanDays = Math.ceil(rawSpanMs / DAY_MS);

    if (spanDays <= 12) {
      bucketCount = 12;
      bucketDurationMs = DAY_MS;
      seriesStartMs = nowMs - bucketCount * bucketDurationMs;
    } else if (spanDays <= 16 * 7) {
      bucketCount = Math.min(16, Math.max(12, Math.ceil(spanDays / 7)));
      bucketDurationMs = 7 * DAY_MS;
      seriesStartMs = nowMs - bucketCount * bucketDurationMs;
    } else {
      bucketCount = 14;
      bucketDurationMs = Math.ceil(rawSpanMs / bucketCount);
      seriesStartMs = nowMs - bucketCount * bucketDurationMs;
    }
  }

  const accumulators = Array.from({ length: bucketCount }, (_, index) => {
    const startMs = seriesStartMs + index * bucketDurationMs;
    const endMs = startMs + bucketDurationMs;

    let label: string;
    let tooltipLabel: string;

    if (timeframe === '24h') {
      label = formatHourBucketLabel(startMs);
      tooltipLabel = `${formatHourBucketLabel(startMs)} – ${formatHourBucketLabel(endMs)}`;
    } else if (timeframe === '7d') {
      const d = new Date(endMs - 1);
      label = SHORT_WEEKDAYS[d.getDay()]!;
      tooltipLabel = `${label}, ${formatShortDate(endMs - 1)}`;
    } else {
      label = formatShortDate(endMs - 1);
      tooltipLabel = `${formatShortDate(startMs)} – ${formatShortDate(endMs - 1)}`;
    }

    return {
      index,
      startMs,
      endMs,
      label,
      tooltipLabel,
      promptCount: 0,
      sumHistory: 0,
      sumNew: 0,
    };
  });

  let totalHistory = 0;
  let totalNew = 0;
  let totalPromptsInSeries = 0;

  for (const record of records) {
    if (record.isLegacy) continue;
    if (record.capturedAt < seriesStartMs || record.capturedAt > nowMs + 1000) continue;
    const rawIndex = Math.floor((record.capturedAt - seriesStartMs) / bucketDurationMs);
    const clampedIndex = Math.max(0, Math.min(bucketCount - 1, rawIndex));
    const bucket = accumulators[clampedIndex];
    if (!bucket) continue;

    const historyTokens = Math.max(0, record.breakdown.history);
    const newTokens = Math.max(0, record.breakdown.input) + Math.max(0, record.breakdown.output);

    bucket.promptCount += 1;
    bucket.sumHistory += historyTokens;
    bucket.sumNew += newTokens;

    totalHistory += historyTokens;
    totalNew += newTokens;
    totalPromptsInSeries += 1;
  }

  const rawBuckets = accumulators.map((b) => {
    const avgHistoryTokens = b.promptCount > 0 ? Math.round(b.sumHistory / b.promptCount) : 0;
    const avgNewTokens = b.promptCount > 0 ? Math.round(b.sumNew / b.promptCount) : 0;
    const avgTotalVisibleTokens = avgHistoryTokens + avgNewTokens;
    return {
      ...b,
      avgHistoryTokens,
      avgNewTokens,
      avgTotalVisibleTokens,
    };
  });

  const maxAvgTokens = rawBuckets.reduce((max, b) => Math.max(max, b.avgTotalVisibleTokens), 0);

  let peakBucket: (typeof rawBuckets)[number] | null = null;
  for (const b of rawBuckets) {
    if (b.promptCount > 0 && (!peakBucket || b.avgHistoryTokens > peakBucket.avgHistoryTokens)) {
      peakBucket = b;
    }
  }

  const buckets: HistoryTimeBucket[] = rawBuckets.map((b) => ({
    index: b.index,
    startMs: b.startMs,
    endMs: b.endMs,
    label: b.label,
    tooltipLabel: b.tooltipLabel,
    promptCount: b.promptCount,
    avgHistoryTokens: b.avgHistoryTokens,
    avgNewTokens: b.avgNewTokens,
    avgTotalVisibleTokens: b.avgTotalVisibleTokens,
    historyHeightPct:
      maxAvgTokens > 0 ? Math.round((b.avgHistoryTokens / maxAvgTokens) * 1000) / 10 : 0,
    newHeightPct: maxAvgTokens > 0 ? Math.round((b.avgNewTokens / maxAvgTokens) * 1000) / 10 : 0,
  }));

  const overallAvgHistoryTokens =
    totalPromptsInSeries > 0 ? Math.round(totalHistory / totalPromptsInSeries) : 0;
  const overallAvgNewTokens =
    totalPromptsInSeries > 0 ? Math.round(totalNew / totalPromptsInSeries) : 0;
  const peakBucketLabel = peakBucket ? peakBucket.label : null;

  let subtitle: string;
  if (totalPromptsInSeries === 0) {
    subtitle = 'No messages recorded in this timeframe';
  } else {
    const peakPart = peakBucketLabel ? ` · Peak on ${peakBucketLabel}` : '';
    subtitle = `Avg ${formatCompactTokens(overallAvgHistoryTokens)} chat memory tokens vs ${formatCompactTokens(overallAvgNewTokens)} new tokens per message${peakPart}`;
  }

  const tooltip =
    'Every time you reply in a long thread, the AI re-reads your earlier messages as Chat Memory. Starting a new chat when switching topics keeps this bar low.';

  return {
    timeframe,
    buckets,
    maxAvgTokens,
    overallAvgHistoryTokens,
    overallAvgNewTokens,
    peakBucketLabel,
    subtitle,
    tooltip,
  };
}

/**
 * Row 5: Computes ONE concrete, data-driven "what-if" Eco-Insight tip from active timeframe records.
 */
export function buildEcoInsight(
  records: readonly PromptRecordDto[],
  metric: AnalyticsMetricTab,
  breakdown: CategoryBreakdownViewModel,
): EcoInsightViewModel {
  if (records.length === 0 || breakdown.totalRawTokens === 0) {
    return {
      id: 'sparse',
      badge: 'Eco-insight',
      headline: 'Send a few messages to unlock personalized savings tips',
      detail:
        'Once you chat with AI, Waister looks at your thread length, reasoning depth, and model mix to suggest simple ways to lower your footprint.',
      savingsBadge: null,
      tone: 'neutral',
    };
  }

  const tone: KpiTone =
    metric === 'water'
      ? 'water'
      : metric === 'co2'
        ? 'co2'
        : metric === 'power'
          ? 'power'
          : 'power';

  const historySegment = breakdown.segments.find((s) => s.category === 'history');
  const thinkingSegment = breakdown.segments.find((s) => s.category === 'thinking');
  const rawHistoryShare =
    breakdown.totalRawTokens > 0 ? (historySegment?.rawTokens ?? 0) / breakdown.totalRawTokens : 0;
  const weightedThinkingShare =
    breakdown.totalWeightedValue > 0
      ? (thinkingSegment?.weightedValue ?? 0) / breakdown.totalWeightedValue
      : 0;

  if (rawHistoryShare >= 0.35 && (historySegment?.weightedValue ?? 0) > 0) {
    const savedValue = (historySegment?.weightedValue ?? 0) * 0.5;
    const savedFormatted = formatMetricCombined(metric, savedValue);
    const historyPct = Math.round(rawHistoryShare * 100);
    return {
      id: 'history-drag',
      badge: 'What-if · Fresh chats',
      headline: `Starting fresh chats 50% sooner could save ~${savedFormatted}`,
      detail: `Re-reading earlier chat memory makes up ${historyPct}% of your text volume. Opening a new chat when you change topics avoids re-sending old messages.`,
      savingsBadge: `Save ~${savedFormatted}`,
      tone,
    };
  }

  if (weightedThinkingShare >= 0.3 && (thinkingSegment?.weightedValue ?? 0) > 0) {
    const savedValue = (thinkingSegment?.weightedValue ?? 0) * 0.45;
    const savedFormatted = formatMetricCombined(metric, savedValue);
    const thinkingPct = Math.round(weightedThinkingShare * 100);
    return {
      id: 'thinking-effort',
      badge: 'What-if · Lighter reasoning',
      headline: `Using standard mode for quick questions could save ~${savedFormatted}`,
      detail: `Behind-the-scenes AI reasoning drives ${thinkingPct}% of your current footprint. Saving deep thinking modes for complex questions cuts wait time and energy together.`,
      savingsBadge: `Save ~${savedFormatted}`,
      tone,
    };
  }

  let heavyModelImpact = 0;
  let heavyModelPrompts = 0;
  let topHeavyLabel = '';
  const totalMetric = records.reduce((s, r) => s + getRecordMetricValue(r, metric), 0);

  for (const record of records) {
    const baseWh = getModelBaseEnergyWhPer1M(record.provider, record.model);
    if (baseWh >= 1500) {
      heavyModelImpact += getRecordMetricValue(record, metric);
      heavyModelPrompts += 1;
      if (!topHeavyLabel) {
        topHeavyLabel = formatModelDisplayName(record.provider, record.model);
      }
    }
  }

  if (totalMetric > 0 && heavyModelImpact / totalMetric >= 0.4) {
    const savedValue = heavyModelImpact * 0.375;
    const savedFormatted = formatMetricCombined(metric, savedValue);
    const heavyPct = Math.round((heavyModelImpact / totalMetric) * 100);
    return {
      id: 'heavy-model',
      badge: 'What-if · Right-size models',
      headline: `Using a faster model for half of your ${topHeavyLabel} chats could save ~${savedFormatted}`,
      detail: `Heavyweight models (${formatMessageCount(heavyModelPrompts)}) generate ${heavyPct}% of your footprint. Save flagship models for tough tasks and use Flash, Haiku, or Luna for everyday questions.`,
      savingsBadge: `Save ~${savedFormatted}`,
      tone,
    };
  }

  const avgTokensPerPrompt = Math.round(breakdown.totalRawTokens / records.length);
  return {
    id: 'cache-efficiency',
    badge: 'Eco-insight · Well balanced',
    headline: `Concise chats averaging ${formatCompactTokens(avgTokensPerPrompt)} tokens per message`,
    detail:
      'Your conversations keep chat memory and AI reasoning well-balanced. Starting a fresh thread every 5–10 messages keeps your footprint low.',
    savingsBadge: 'Low overhead',
    tone,
  };
}

/** Row 1: Builds the 4 compact KPI cards for the selected metric tab and timeframe. */
export function buildKpiCards(
  activeRecords: readonly PromptRecordDto[],
  previousRecords: readonly PromptRecordDto[],
  metric: AnalyticsMetricTab,
  shortPeriodLabel: string | null,
  breakdown: CategoryBreakdownViewModel,
  donut: ModelDonutViewModel,
): AnalyticsKpiCardViewModel[] {
  const promptCount = activeRecords.length;
  const prevPromptCount = previousRecords.length;
  const metricNames = getMetricDisplayNames(metric);

  const sumMetric = (list: readonly PromptRecordDto[], m: AnalyticsMetricTab): number =>
    list.reduce((s, r) => s + getRecordMetricValue(r, m), 0);

  if (metric === 'all') {
    const powerNow = sumMetric(activeRecords, 'power');
    const powerPrev = sumMetric(previousRecords, 'power');
    const powerQ = formatMetricQuantity('power', powerNow);
    const powerDelta = computePeriodDelta(powerNow, powerPrev, shortPeriodLabel, prevPromptCount);

    const waterNow = sumMetric(activeRecords, 'water');
    const waterPrev = sumMetric(previousRecords, 'water');
    const waterQ = formatMetricQuantity('water', waterNow);
    const waterDelta = computePeriodDelta(waterNow, waterPrev, shortPeriodLabel, prevPromptCount);

    const co2Now = sumMetric(activeRecords, 'co2');
    const co2Prev = sumMetric(previousRecords, 'co2');
    const co2Q = formatMetricQuantity('co2', co2Now);
    const co2Delta = computePeriodDelta(co2Now, co2Prev, shortPeriodLabel, prevPromptCount);

    const tokensNow = sumMetric(activeRecords, 'tokens');
    const tokensPrev = sumMetric(previousRecords, 'tokens');
    const tokensDelta = computePeriodDelta(
      tokensNow,
      tokensPrev,
      shortPeriodLabel,
      prevPromptCount,
    );
    const avgTokPerMsg = promptCount > 0 ? Math.round(tokensNow / promptCount) : 0;

    return [
      {
        id: 'total-power',
        label: 'Total energy',
        tone: 'power',
        value: powerQ.value,
        unit: powerQ.unit,
        deltaText: powerDelta.deltaText,
        deltaTrend: powerDelta.deltaTrend,
        comparisonText: formatRealWorldComparison('power', powerNow),
      },
      {
        id: 'total-water',
        label: 'Total water',
        tone: 'water',
        value: waterQ.value,
        unit: waterQ.unit,
        deltaText: waterDelta.deltaText,
        deltaTrend: waterDelta.deltaTrend,
        comparisonText: formatRealWorldComparison('water', waterNow),
      },
      {
        id: 'total-co2',
        label: 'Total CO₂',
        tone: 'co2',
        value: co2Q.value,
        unit: co2Q.unit,
        deltaText: co2Delta.deltaText,
        deltaTrend: co2Delta.deltaTrend,
        comparisonText: formatRealWorldComparison('co2', co2Now),
      },
      {
        id: 'total-tokens',
        label: 'Total tokens',
        tone: 'neutral',
        value: formatCompactTokens(tokensNow),
        unit: 'tok',
        tokens: tokensNow,
        deltaText: tokensDelta.deltaText,
        deltaTrend: tokensDelta.deltaTrend,
        comparisonText: `${formatMessageCount(promptCount)} · avg ${formatCompactTokens(avgTokPerMsg)}/msg`,
      },
    ];
  }

  const tone: KpiTone =
    metric === 'power'
      ? 'power'
      : metric === 'water'
        ? 'water'
        : metric === 'co2'
          ? 'co2'
          : 'neutral';

  const totalNow = sumMetric(activeRecords, metric);
  const totalPrev = sumMetric(previousRecords, metric);
  const totalQ = formatMetricQuantity(metric, totalNow);
  const totalDelta = computePeriodDelta(totalNow, totalPrev, shortPeriodLabel, prevPromptCount);

  const avgNow = promptCount > 0 ? totalNow / promptCount : 0;
  const avgPrev = prevPromptCount > 0 ? totalPrev / prevPromptCount : 0;
  const avgQ = formatMetricQuantity(metric, avgNow);
  const avgDelta = computePeriodDelta(avgNow, avgPrev, shortPeriodLabel, prevPromptCount);

  const hiddenWeighted = breakdown.segments
    .filter((s) => s.group === 'hidden')
    .reduce((s, seg) => s + seg.weightedValue, 0);
  const hiddenPct =
    breakdown.totalWeightedValue > 0
      ? Math.round((hiddenWeighted / breakdown.totalWeightedValue) * 100)
      : 0;

  const impactDonut =
    donut.mode === 'impact' ? donut : buildModelDonut(activeRecords, metric, 'impact');
  const topModel = impactDonut.slices.find((s) => !s.isOther) ?? impactDonut.slices[0];

  const primaryComparison =
    metric === 'tokens'
      ? `${formatMessageCount(promptCount)} · ${TOKENS_TO_WORDS_NOTE}`
      : formatRealWorldComparison(metric, totalNow);

  const avgComparison =
    metric === 'tokens'
      ? `Across ${formatMessageCount(promptCount)}`
      : formatRealWorldComparison(metric, avgNow);

  return [
    {
      id: 'headline-total',
      label: `Total ${metricNames.lowerCase}`,
      tone,
      value: totalQ.value,
      unit: totalQ.unit,
      ...(metric === 'tokens' && { tokens: totalNow }),
      deltaText: totalDelta.deltaText,
      deltaTrend: totalDelta.deltaTrend,
      comparisonText: primaryComparison,
    },
    {
      id: 'avg-per-prompt',
      label: 'Avg per message',
      tone,
      value: avgQ.value,
      unit: avgQ.unit,
      ...(metric === 'tokens' && { tokens: Math.round(avgNow) }),
      deltaText: avgDelta.deltaText,
      deltaTrend: avgDelta.deltaTrend,
      comparisonText: avgComparison,
    },
    {
      id: 'hidden-cost-share',
      label: `Behind-the-scenes ${metricNames.lowerCase}`,
      tone: 'neutral',
      value: `${hiddenPct}`,
      unit: '%',
      deltaText: null,
      deltaTrend: null,
      comparisonText: `${formatMetricCombined(metric, hiddenWeighted)} from reasoning, tools & chat memory`,
    },
    {
      id: 'top-model',
      label: metricNames.topUserLabel,
      tone: 'neutral',
      value: topModel ? topModel.label : 'None',
      unit: topModel ? `${topModel.impactSharePct}%` : '',
      deltaText: null,
      deltaTrend: null,
      comparisonText: topModel
        ? `${formatMetricCombined(metric, (topModel.impactSharePct / 100) * totalNow)} · ${formatMessageCount(topModel.promptCount)}`
        : 'No model usage in window',
    },
  ];
}

/**
 * Primary `<AnalyticsAggregator>` entry point: validates & normalizes raw stored `PromptRecordDto[]`
 * items, dynamically recomputes impact for records with breakdowns (preserving historical
 * `systemPromptTokens`), flags breakdown-less legacy records, and builds view models.
 */
export function aggregateAnalytics(
  allRecords: readonly PromptRecordDto[],
  metric: AnalyticsMetricTab,
  timeframe: AnalyticsTimeframe,
  modelUsageMode: ModelUsageMode = 'impact',
  nowMs: number = Date.now(),
  modelEfficiencyMode: ModelEfficiencyMode = 'normalized',
  showTechnicalDetails = false,
): AnalyticsViewModel {
  const normalizedRecords: PromptRecordDto[] = [];
  if (Array.isArray(allRecords)) {
    for (const candidate of allRecords) {
      const valid = normalizeAnalyticsRecord(candidate);
      if (valid) normalizedRecords.push(valid);
    }
  }

  const totalLegacyRecordCount = normalizedRecords.filter((r) => r.isLegacy).length;
  const window = resolveAnalyticsWindow(timeframe, nowMs);

  const activeRecords = filterRecordsByWindow(normalizedRecords, window.sinceMs);
  const previousRecords =
    window.prevSinceMs !== null
      ? filterRecordsByWindow(normalizedRecords, window.prevSinceMs, window.sinceMs)
      : [];

  const legacyRecordCount = activeRecords.filter((r) => r.isLegacy).length;

  const breakdown = buildCategoryBreakdown(activeRecords, metric, showTechnicalDetails);
  const modelDonut = buildModelDonut(activeRecords, metric, modelUsageMode);
  const modelEfficiency = buildModelEfficiency(
    activeRecords,
    metric,
    modelEfficiencyMode,
    showTechnicalDetails,
  );
  const historySeries = buildHistoryTimeSeries(activeRecords, timeframe, nowMs);
  const ecoInsight = buildEcoInsight(activeRecords, metric, breakdown);
  const kpis = buildKpiCards(
    activeRecords,
    previousRecords,
    metric,
    window.shortPeriodLabel,
    breakdown,
    modelDonut,
  );

  return {
    metric,
    timeframe,
    modelUsageMode,
    modelEfficiencyMode,
    showTechnicalDetails,
    headerSubtitle: formatAnalyticsHeaderSubtitle(activeRecords.length, timeframe, metric),
    promptCount: activeRecords.length,
    previousPromptCount: previousRecords.length,
    legacyRecordCount,
    totalLegacyRecordCount,
    isEmpty: activeRecords.length === 0,
    kpis,
    breakdown,
    modelDonut,
    modelEfficiency,
    historySeries,
    ecoInsight,
  };
}

function escapeCsvCell(value: string | number | boolean): string {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Formats stored prompt records as pretty-printed JSON for download. */
export function formatRecordsAsJson(records: readonly PromptRecordDto[]): string {
  return JSON.stringify(records, null, 2);
}

/** Formats stored prompt records as an RFC-4180 CSV string for download. */
export function formatRecordsAsCsv(records: readonly PromptRecordDto[]): string {
  const headers = [
    'id',
    'capturedAt',
    'isoTimestamp',
    'provider',
    'modelName',
    'modelVersion',
    'thinkingEffort',
    'inputTokens',
    'historyTokens',
    'outputTokens',
    'thinkingTokens',
    'toolTokens',
    'systemPromptTokens',
    'totalTokens',
    'energyWh',
    'waterMl',
    'co2Grams',
    'latencyMs',
    'thinkingTimeMs',
    'approximate',
    'conversationUrl',
  ];

  const rows = records.map((r) =>
    [
      r.id,
      r.capturedAt,
      new Date(r.capturedAt).toISOString(),
      r.provider,
      r.model.name,
      r.model.version,
      r.model.thinkingEffort,
      r.breakdown.input,
      r.breakdown.history,
      r.breakdown.output,
      r.breakdown.thinking,
      r.breakdown.tools,
      r.breakdown.overhead,
      r.totalTokens,
      r.impact.energyWh,
      r.impact.waterMl,
      r.impact.co2Grams,
      r.timings.latencyMs,
      r.timings.thinkingTimeMs,
      r.approximate,
      r.conversationUrl,
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  return [headers.join(','), ...rows].join('\n');
}
