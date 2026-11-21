/**
 * Types for `config.json`, the single place for all tunable estimation and capture values.
 *
 * `CheckedConfig` makes `tsc` check the whole JSON against `WaisterConfig`. JSON imports type
 * strings as `string` and skip excess-property checks, so string enums stay `string` here (the
 * readers validate effort values at runtime) and model-family keys are checked separately.
 *
 * Context: shared
 * Docs: docs/modules.md#config
 */

import type {
  AttachmentKind,
  Provider,
  ThinkingEffort,
  ToolCallKind,
} from '../dto/chat-capture.dto';
import type rawConfig from './config.json';
import type rawFactSheet from './factSheet.json';

type RawConfig = typeof rawConfig;
type RawFactSheet = typeof rawFactSheet;

/**
 * Per-model rates. Hidden-token rates plus the environmental impact per `perTokensUnit` tokens.
 *
 * Assumptions: none of these numbers come from a provider. The providers publish neither system
 * prompt sizes nor per-prompt energy, water or CO2 figures. The `*Per1M` rates are order-of-
 * magnitude guesses, loosely scaled by model size (opus / pro / o-series > sonnet / gpt > haiku /
 * flash). `systemPromptTokens` and `tokensPerMsThinking` (observed streaming speed) are rough
 * estimates too. Treat the impact as a relative indicator, not a measurement.
 */
export interface ModelRates {
  /** Hidden input: system prompt + tool definitions sent with every prompt. */
  systemPromptTokens: number;
  /** Thinking tokens per ms of `thinkingTimeMs`, i.e. output speed (0.085 ≈ 85 tokens/s). */
  tokensPerMsThinking: number;
  /** Base output/thinking energy in Wh per `perTokensUnit` tokens. */
  energyWhPer1M: number;
}

export interface ProviderModels {
  /** Used when the model family is unknown (the estimate is then marked approximate). */
  default: ModelRates;
  /** Keyed by `ModelInfo.name`. */
  families: Record<string, ModelRates>;
}

/** Token categories weighted separately in `estimation.impact.tokenEnergyProfile`. */
export type TokenEnergyCategory =
  'output' | 'thinking' | 'input' | 'tools' | 'history' | 'systemPrompt';

export interface TokenCategoryEnergyProfile {
  /** Energy cost relative to base output/thinking generation (1.0 = full decode cost). */
  baseMultiplier: number;
  /** Fraction of tokens in this category expected to hit the KV cache (`[0, 1]`). */
  avgCacheHitRate: number;
}

/**
 * Assumptions: every value here is a guess, not a measurement (ADR 0012).
 * - `thinking.baselineMs`: typical network + time-to-first-token of a non-reasoning reply.
 * - `thinking.effortMultipliers`: relative reasoning budget per UI effort level, `medium` = 1.
 *   `none` is 0 because a model with thinking switched off emits no reasoning tokens, whatever
 *   the latency. `unknown` hedges between thinking and not thinking.
 * - `tools`: snippet sizes per call, i.e. a search returns a few result snippets (~3500 tokens,
 *   3000 for Gemini), a code run its input plus output (~850), any other tool ~900.
 */
export interface EstimationConfig {
  thinking: {
    /** Subtracted from `thinkingTimeMs` so plain round-trip latency isn't counted as reasoning. */
    baselineMs: number;
    /**
     * Upper bound for the thinking estimate of one prompt. Guards against a network stall or an
     * idle tab being counted as reasoning, since the estimate is derived from latency alone.
     */
    maxTokens: number;
    /** `medium` = 1. `unknown` hedges between thinking and not thinking. */
    effortMultipliers: Record<ThinkingEffort, number>;
  };
  impact: {
    /** Token count the `*Per1M` rates refer to. */
    perTokensUnit: number;
    /** Decimals kept, so tiny single-prompt Wh / mL values don't round to 0. */
    roundingDecimals: number;
    /** Datacenter cooling + power generation water intensity (mL per Wh). */
    waterMlPerWh: number;
    /** Grid carbon intensity per provider (g CO2e per Wh). */
    co2GramsPerWh: Record<Provider, number>;
    /** Relative energy multiplier for tokens served from the KV cache. */
    cachedInputMultiplier: number;
    /** Per-category energy multiplier and average KV-cache hit rate. */
    tokenEnergyProfile: Record<TokenEnergyCategory, TokenCategoryEnergyProfile>;
  };
  /** Hidden tokens per tool call (`search` snippets, `code` execution, `other`), per provider. */
  tools: Record<Provider, Record<ToolCallKind, number>>;
  models: Record<Provider, ProviderModels>;
}

/**
 * Parameters of the character-based heuristic tokenizer, per provider. All of them are
 * calibrations against typical English prose, not the real vocabularies:
 * - openai: `o200k_base`, about 4.0 chars/token, numbers split into 1-3 digit chunks.
 * - anthropic: no public vocabulary, about 3.7 chars/token. Slightly denser than `o200k_base`
 *   because words over 5 characters split more often.
 * - google: SentencePiece unigram, 256k vocab, about 4.1 chars/token. The large vocabulary keeps
 *   words up to about 7 characters as one piece.
 * `turnFramingTokens` is the chat-template control tokens around a turn (ChatML
 * `<|im_start|>`, Claude turn tags, Gemini `<start_of_turn>`). `attachmentTokens` image values
 * follow the providers' published per-image costs for a typical image (OpenAI 765 = 1024x1024 at
 * high detail, Gemini 258 for an image up to 384px, Claude ~1600 for a large one). The file value
 * is a flat guess.
 */
export interface HeuristicTokenizerConfig {
  /** Chat-template control tokens around every input/history turn. */
  turnFramingTokens: number;
  /** Fixed token estimate per attached image or file / pasted-content card. */
  attachmentTokens: Record<AttachmentKind, number>;
  /** Words up to this length are 1 token. */
  singleTokenMaxWordLength: number;
  /** Longer words split into subwords of about this many characters. */
  charsPerSubword: number;
  /** Numbers are split into chunks of up to this many digits, 1 token each. */
  digitChunkSize: number;
  /** Runs of punctuation/symbols: about this many characters per token. */
  charsPerSymbolToken: number;
}

/** Whitespace the provider tokenizers skip, added back as one token per run. */
export interface WhitespaceTokenConfig {
  /** Tokens per run of consecutive line breaks. */
  newlineRunTokens: number;
  /** Tokens per run of leading indentation. */
  indentRunTokens: number;
  /** Leading spaces needed to count as indentation (a leading tab always counts). */
  indentMinSpaces: number;
}

export interface TokenizerConfig extends Record<Provider, HeuristicTokenizerConfig> {
  whitespace: WhitespaceTokenConfig;
}

export interface CaptureTimings {
  /** Quiet time after the generating indicator disappeared before a response counts as done. */
  settleMs: number;
  /** Quiet time used instead when the site's generating indicator was never seen. */
  textStableMs: number;
  /** Bursts of DOM mutations are coalesced into one check after this delay. */
  checkDelayMs: number;
  /** While a prompt is in flight, the page is re-checked at least this often. */
  pollMs: number;
  /** A sent prompt that never produced a response is dropped after this long. */
  stalePromptMs: number;
  /** Claude: a pause in visible text this long while generating counts as interleaved thinking. */
  claudeInterleavedStallMs: number;
}

export interface CaptureAttachments {
  /**
   * Images at most this many px wide and high are icons / avatars (UI chrome), not attachments.
   * Real upload thumbnails are larger.
   */
  maxIconPx: number;
}

/**
 * Providers whose model family is named by a word in the picker label (Claude, Gemini).
 * Read by `buildModelInfo` in `readers/sites/site.helpers.ts`.
 */
export interface ModelKeywordConfig {
  /** Family name when no keyword matches. Has no rates in `estimation.models` (provider default). */
  fallbackName: string;
  /**
   * Family name -> lowercase keywords contained in the label. Checked in key order, the first
   * family with a matching keyword wins. Keys must exist in `estimation.models` (type-checked below).
   */
  families: Record<string, string[]>;
  /** Lowercase label words that mean the picked model thinks (e.g. "Sonnet 4 Extended"). */
  thinkingKeywords: string[];
}

/**
 * ChatGPT model knowledge, read by `readers/sites/chatgpt.site.ts`. Every pattern string is a
 * case-insensitive regex source. The slug (`data-message-model-slug`, e.g. "gpt-5-1-thinking")
 * is preferred over the picker label because in Auto mode it names the model that really answered.
 */
export interface ChatGptModelConfig {
  /**
   * Family name -> lowercase keywords matched against slugs and picker labels before falling back
   * to `openai-o` or generic `gpt`. Keys must exist in `estimation.models.openai.families`.
   */
  families: Record<string, string[]>;
  /**
   * Plain words per effort level, matched as whole words in slugs and picker labels. Checked
   * max, xhigh, high, medium, low (first hit wins).
   */
  effortWords: Record<'max' | 'xhigh' | 'high' | 'medium' | 'low', string[]>;
  slug: {
    /** o-series slugs ("o3", "o4-mini-high") start with `o` + digit. */
    oSeries: string;
    /** Capture group 1 = version of an o-series slug ("o4-mini"). */
    oSeriesVersion: string;
    /** Capture groups = major, minor, letter suffix of a GPT slug ("gpt-4o", "gpt-5-1"). */
    gptVersion: string;
    /**
     * Matched against the slug with `-`/`_` replaced by spaces, so a bare `t` is the "thinking"
     * marker of slugs like "gpt-5-t-mini". Slugs without a match are non-reasoning answers
     * (instant, chat, 4o).
     */
    reasoning: string;
  };
  /** Picker-label fallback, used when no message carries a model slug. */
  label: {
    /** Substrings (lowercase) that mark a non-reasoning model, so no thinking is assumed. */
    nonReasoning: string[];
    /** Substrings (lowercase) that mark a reasoning model. */
    reasoning: string[];
    /**
     * Regexes for reasoning models named by number only: o1 / o3 / o4 as a whole word and
     * GPT-5 / 5.x, which is a thinking model by default.
     */
    reasoningPatterns: string[];
    /** Label belongs to the o-series (starts with `o`, or contains o1 / o3 / o4). */
    oSeries: string;
    /** Capture group 1 = version ("4o", "5.1", "o3-mini"). */
    version: string;
  };
}

export interface CaptureConfig {
  timings: CaptureTimings;
  attachments: CaptureAttachments;
  /** Values are `ThinkingEffort` strings, validated at runtime by the readers. */
  effortInference: {
    /** Effort when the UI shows that thinking is on, but not at which level. */
    thinkingDetected: string;
    /** Effort per model family when the UI shows no thinking signal. Missing = `unknown`. */
    familyDefaults: Partial<Record<ModelFamily, string>>;
  };
  models: {
    claude: ModelKeywordConfig;
    gemini: ModelKeywordConfig;
    chatgpt: ChatGptModelConfig;
  };
}

/** Animation period range, ms: `slowest` at the lowest intensity above 0, `fastest` at 1. */
export interface AnimationPeriodRange {
  slowest: number;
  fastest: number;
}

/**
 * Dashboard animations. Intensity = ((usage ÷ active days) ÷ `busyDay`) ^ `intensityExponent`,
 * clamped to 0..1, separately for energy, water and CO2. Active days = from the oldest prompt in
 * the timeframe until now, at least 1. 0 usage = no pulse / drip / puff.
 *
 * Assumptions: `busyDay` is about 1M tokens a day (e.g. 50 prompts with 20k tokens of context
 * each) at the default rates of ~400 Wh / ~1400 mL / ~120 g CO2 (vendor average) per 1M tokens. The exponent < 1 lifts low
 * usage, so a light day still visibly moves.
 */
export interface DashboardConfig {
  /** Usage per day that counts as intensity 1 (fastest pulse / drip, fullest pool). */
  busyDay: { energyWh: number; waterMl: number; co2Grams: number };
  intensityExponent: number;
  /** Time between two power pulses (one lightning strike + gear step each). */
  pulseMs: AnimationPeriodRange;
  /** Time between two water drops. */
  dripMs: AnimationPeriodRange;
  /** Time between two smoke clouds from the factory chimneys. */
  puffMs: AnimationPeriodRange;
  /** Time one cloud takes from the chimney to fading out (constant, only the frequency changes). */
  cloudRiseMs: number;
  /** Pool fill level, as a fraction of the basin height, at intensity 0 and 1. */
  poolFill: { min: number; max: number };
}

export interface UiConfig {
  /** Time window of the popup's usage summary. */
  usageWindowHours: number;
  /** Full-scale values (100% arc fill) for the popup's energy, water and CO2 tachos. */
  tachoMax: {
    energyWh: number;
    waterMl: number;
    co2Grams: number;
  };
  dashboard: DashboardConfig;
}

export interface WaisterConfig {
  estimation: EstimationConfig;
  tokenizer: TokenizerConfig;
  capture: CaptureConfig;
  ui: UiConfig;
}

/**
 * Model families that have their own rates in `config.json`, per provider. Readers type the
 * `ModelInfo.name` they produce with it, so a family missing from the config fails the typecheck.
 */
export type ModelFamily<P extends Provider = Provider> = P extends Provider
  ? keyof RawConfig['estimation']['models'][P]['families'] & string
  : never;

type ShapeCheck<T extends WaisterConfig> = T;
type Expect<T extends true> = T;
type HasOnlyKeys<T, K extends PropertyKey> = [Exclude<keyof T, K>] extends [never] ? true : false;

/** Compile-time only: errors if `config.json` doesn't match `WaisterConfig`. */
export type CheckedConfig = ShapeCheck<RawConfig>;
/**
 * Compile-time only: `Type 'false' does not satisfy the constraint 'true'` here means
 * `familyDefaults` names a family that has no rates in `estimation.models`.
 */
export type CheckedFamilyDefaults = Expect<
  HasOnlyKeys<RawConfig['capture']['effortInference']['familyDefaults'], ModelFamily>
>;

/**
 * Compile-time only: `false` here means a family key under
 * `capture.models.claude|gemini|chatgpt.families` has no rates in `estimation.models`.
 */
export type CheckedModelKeywordFamilies = [
  Expect<
    HasOnlyKeys<RawConfig['capture']['models']['claude']['families'], ModelFamily<'anthropic'>>
  >,
  Expect<HasOnlyKeys<RawConfig['capture']['models']['gemini']['families'], ModelFamily<'google'>>>,
  Expect<HasOnlyKeys<RawConfig['capture']['models']['chatgpt']['families'], ModelFamily<'openai'>>>,
];

/** Everyday benchmark tier in `factSheet.json`. */
export type FactTier = 'micro' | 'daily' | 'weekly' | 'heavy';

/** KPI keys in `factSheet.json`. */
export type FactKpiId = 'power' | 'water' | 'co2';

/** Source of the SVG icon in `public/icons/`. */
export type FactIconSource = 'lucide' | 'custom';

/** Single everyday perspective benchmark item in `factSheet.json`. */
export interface FactItem {
  id: string;
  tier: string;
  value: number;
  unit: string;
  equivalent: string;
  shortCopy: string;
  isVirtualWater?: boolean;
  icon: string;
  iconHint: string;
  iconSource: string;
}

/** Per-KPI benchmark group and display unit thresholds in `factSheet.json`. */
export interface FactKpiGroup {
  label: string;
  baseUnit: string;
  displayUnits: {
    small: string;
    large: string;
    largeThreshold: number;
  };
  items: FactItem[];
}

/** Schema of `src/config/factSheet.json`. */
export interface FactSheetConfig {
  meta: {
    version: string;
    description: string;
    assumptions: {
      gridCarbonIntensity_gCO2ePerKWh: number;
      gasCarEmissions_gCO2PerKm: number;
      virtualWaterNote: string;
    };
    tiers: string[];
    shuffleDefaults: {
      minRatio: number;
      maxRatio: number;
    };
  };
  kpis: Record<FactKpiId, FactKpiGroup>;
}

type FactSheetShapeCheck<T extends FactSheetConfig> = T;

/** Compile-time only: errors if `factSheet.json` doesn't match `FactSheetConfig`. */
export type CheckedFactSheet = FactSheetShapeCheck<RawFactSheet>;
