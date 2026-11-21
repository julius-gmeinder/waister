/**
 * Types for `config.json`, the single place for all tunable estimation and capture values.
 *
 * `CheckedConfig` makes `tsc` check the whole JSON against `WaisterConfig`. JSON imports type
 * strings as `string` and skip excess-property checks, so string enums stay `string` here (the
 * readers validate effort values at runtime) and model-family keys are checked separately.
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#config
 */

import type {
  AttachmentKind,
  Provider,
  ThinkingEffort,
  ToolCallKind,
} from '../dto/chat-capture.dto';
import type rawConfig from './config.json';

type RawConfig = typeof rawConfig;

/** Per-model rates. Hidden-token rates plus the environmental impact per `perTokensUnit` tokens. */
export interface ModelRates {
  /** Hidden input: system prompt + tool definitions sent with every prompt. */
  systemPromptTokens: number;
  /** Thinking tokens per ms of `thinkingTimeMs`, i.e. output speed (0.075 ≈ 75 tokens/s). */
  tokensPerMsThinking: number;
  energyWhPer1M: number;
  /** Covers cooling and power generation. */
  waterMlPer1M: number;
  /** Grams of CO2 equivalent. */
  co2GramsPer1M: number;
}

export interface ProviderModels {
  /** Used when the model family is unknown (the estimate is then marked approximate). */
  default: ModelRates;
  /** Keyed by `ModelInfo.name`. */
  families: Record<string, ModelRates>;
}

export interface EstimationConfig {
  thinking: {
    /** Subtracted from `thinkingTimeMs` so plain round-trip latency isn't counted as reasoning. */
    baselineMs: number;
    /** `medium` = 1. `unknown` hedges between thinking and not thinking. */
    effortMultipliers: Record<ThinkingEffort, number>;
  };
  impact: {
    /** Token count the `*Per1M` rates refer to. */
    perTokensUnit: number;
    /** Decimals kept, so tiny single-prompt Wh / mL values don't round to 0. */
    roundingDecimals: number;
  };
  /** Hidden tokens per tool call (`search` snippets, `code` execution, `other`), per provider. */
  tools: Record<Provider, Record<ToolCallKind, number>>;
  models: Record<Provider, ProviderModels>;
}

/** Parameters of the character-based heuristic tokenizer, per provider. */
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

export type TokenizerConfig = Record<Provider, HeuristicTokenizerConfig>;

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

export interface CaptureConfig {
  timings: CaptureTimings;
  /** Values are `ThinkingEffort` strings, validated at runtime by the readers. */
  effortInference: {
    /** Effort when the UI shows that thinking is on, but not at which level. */
    thinkingDetected: string;
    /** Effort per model family when the UI shows no thinking signal. Missing = `unknown`. */
    familyDefaults: Partial<Record<ModelFamily, string>>;
  };
}

export interface UiConfig {
  /** Time window of the popup's usage summary. */
  usageWindowHours: number;
}

export interface WaisterConfig {
  description: string;
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
