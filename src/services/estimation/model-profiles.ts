/**
 * Per-model rates for hidden tokens and energy (internal to EstimationService).
 *
 * Context: background
 * Docs: docs/modules.md#estimation-service
 */

import type { ModelInfo, Provider, ThinkingEffort } from '../../dto/chat-capture.dto';
import energyLookup from './energy-lookup.json';

export interface HiddenTokenRates {
  /** System prompt + tool-definition tokens sent with every prompt. */
  systemPromptTokens: number;
  /** Thinking tokens per ms of `thinkingTimeMs`, i.e. output speed (0.075 ≈ 75 tokens/s). */
  tokensPerMsThinking: number;
}

export interface HiddenTokenProfile extends HiddenTokenRates {
  /** False if the model is unknown and the provider default was used. */
  exactModelMatch: boolean;
}

/** `models` is keyed by `ModelInfo.name`. */
const HIDDEN_TOKEN_PROFILES: Record<
  Provider,
  { default: HiddenTokenRates; models: Record<string, HiddenTokenRates> }
> = {
  openai: {
    default: { systemPromptTokens: 1400, tokensPerMsThinking: 0.075 },
    models: {
      gpt: { systemPromptTokens: 1400, tokensPerMsThinking: 0.065 },
      'openai-o': { systemPromptTokens: 1600, tokensPerMsThinking: 0.095 },
    },
  },
  anthropic: {
    default: { systemPromptTokens: 1800, tokensPerMsThinking: 0.07 },
    models: {
      'claude-sonnet': { systemPromptTokens: 1800, tokensPerMsThinking: 0.075 },
      'claude-opus': { systemPromptTokens: 2000, tokensPerMsThinking: 0.055 },
      'claude-haiku': { systemPromptTokens: 1200, tokensPerMsThinking: 0.1 },
    },
  },
  google: {
    default: { systemPromptTokens: 1500, tokensPerMsThinking: 0.08 },
    models: {
      'gemini-pro': { systemPromptTokens: 1600, tokensPerMsThinking: 0.075 },
      'gemini-flash': { systemPromptTokens: 1300, tokensPerMsThinking: 0.11 },
    },
  },
};

/** `medium` = 1. `unknown` hedges between thinking and not thinking. */
export const THINKING_EFFORT_MULTIPLIERS: Record<ThinkingEffort, number> = {
  none: 0,
  low: 0.6,
  medium: 1.0,
  high: 1.4,
  unknown: 0.5,
};

/** Subtracted from `thinkingTimeMs` so plain round-trip latency isn't counted as reasoning. */
export const THINKING_BASELINE_MS = 250;

export function resolveHiddenTokenProfile(
  provider: Provider,
  model: ModelInfo,
): HiddenTokenProfile {
  const providerProfile = HIDDEN_TOKEN_PROFILES[provider];
  const modelRates = providerProfile.models[model.name];
  return {
    ...(modelRates ?? providerProfile.default),
    exactModelMatch: modelRates !== undefined,
  };
}

/** Rates per 1M tokens from `energy-lookup.json`. Water covers cooling and power generation. */
export interface ResourceRatePer1M {
  energyWhPer1M: number;
  waterMlPer1M: number;
  co2GramsPer1M: number;
  exactModelMatch: boolean;
}

export function resolveEnergyProfile(provider: Provider, model: ModelInfo): ResourceRatePer1M {
  const providerTable = energyLookup.providers[provider];
  if (!providerTable) {
    return {
      ...energyLookup.defaults,
      exactModelMatch: false,
    };
  }

  const modelsMap = providerTable.models as Record<
    string,
    { energyWhPer1M: number; waterMlPer1M: number; co2GramsPer1M: number } | undefined
  >;
  const modelEntry = modelsMap[model.name];

  if (modelEntry) {
    return {
      ...modelEntry,
      exactModelMatch: true,
    };
  }

  return {
    ...providerTable.default,
    exactModelMatch: false,
  };
}
