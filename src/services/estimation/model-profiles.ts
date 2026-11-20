/**
 * Model profiles (internal to EstimationService).
 *
 * 1. Hidden-token profile per provider + model: `systemPromptTokens` (overhead for the system
 *    prompt and tool definitions), `tokensPerMsThinking` (model output speed while reasoning) and
 *    the `thinkingEffort` multipliers. Used to estimate the hidden `thinking` + `overhead` tokens.
 * 2. Energy profile per provider + model from `energy-lookup.json` (energy/water/CO2 per 1M
 *    tokens). Computed in the background only and not shown in the popup.
 *
 * Context: background
 * Docs: docs/modules.md#estimation-service
 */

import type { ModelInfo, Provider, ThinkingEffort } from '../../dto/chat-capture.dto';
import energyLookup from './energy-lookup.json';

// ---------------------------------------------------------------------------------------------
// Hidden tokens
// ---------------------------------------------------------------------------------------------

/** Per-model parameters for the hidden-token estimate. */
export interface HiddenTokenRates {
  /** Hidden system prompt + tool-definition tokens sent with every prompt. */
  systemPromptTokens: number;
  /** Thinking tokens generated per ms of `thinkingTimeMs` (model output speed). */
  tokensPerMsThinking: number;
}

/** Resolved hidden-token profile for one provider + model. */
export interface HiddenTokenProfile extends HiddenTokenRates {
  /** False if the model is unknown and the provider default was used. */
  exactModelMatch: boolean;
}

/** Hidden-token rates per provider. `models` is keyed by `ModelInfo.name`. */
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

/** Scales the thinking estimate by the effort level the site's UI shows. */
export const THINKING_EFFORT_MULTIPLIERS: Record<ThinkingEffort, number> = {
  none: 0,
  low: 0.6,
  medium: 1.0,
  high: 1.4,
  unknown: 0.5,
};

/**
 * Network/time-to-first-token baseline (ms) subtracted from `thinkingTimeMs`, so plain round-trip
 * latency is not counted as reasoning.
 */
export const THINKING_BASELINE_MS = 250;

/**
 * Resolves the hidden-token profile for `provider` and `model.name`. Falls back to the provider
 * default if the model is not listed.
 */
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

// ---------------------------------------------------------------------------------------------
// Energy (background only, not displayed)
// ---------------------------------------------------------------------------------------------

/** Resource rates per 1,000,000 tokens from `energy-lookup.json`. */
export interface ResourceRatePer1M {
  /** Electrical energy in watt-hours (Wh) per 1,000,000 tokens. */
  energyWhPer1M: number;
  /** Cooling & power-generation water in milliliters (mL) per 1,000,000 tokens. */
  waterMlPer1M: number;
  /** Carbon footprint in grams of CO2e per 1,000,000 tokens. */
  co2GramsPer1M: number;
  /** Whether an exact model match was found in `energy-lookup.json`. */
  exactModelMatch: boolean;
}

/**
 * Resolves the 1M-token environmental impact profile for `provider` and `model.name`.
 * Falls back to the provider default (or global default) if the model is not listed.
 */
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
