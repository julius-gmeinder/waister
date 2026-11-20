/**
 * EstimationService: estimates the **hidden** tokens of a prompt and assembles the final
 * `TokenEstimateDto`.
 *
 *   - `thinking`: reasoning tokens inferred from `thinkingTimeMs`, the model's output speed
 *     (`tokensPerMsThinking`) and the `thinkingEffort` multiplier.
 *   - `overhead`: system prompt + tool definitions per model (`systemPromptTokens`).
 *
 * The per-model numbers live in `model-profiles.ts`. The visible counts (input, history, output)
 * come from TokenizerService. The handler passes them in, so services don't call each other.
 *
 * Also computes the environmental impact (energy-lookup.json). That stays in the background
 * and is not shown in the popup.
 *
 * Context: background
 * Docs: docs/modules.md#estimation-service, docs/pipeline.md
 */

import type {
  ChatCaptureDto,
  ModelInfo,
  Provider,
  ThinkingEffort,
} from '../../dto/chat-capture.dto';
import type {
  EnvironmentalImpact,
  TokenBreakdown,
  TokenEstimateDto,
} from '../../dto/token-estimate.dto';
import energyLookup from './energy-lookup.json';
import {
  resolveEnergyProfile,
  resolveHiddenTokenProfile,
  THINKING_BASELINE_MS,
  THINKING_EFFORT_MULTIPLIERS,
} from './model-profiles';

/** Visible token counts as produced by TokenizerService. */
export type VisibleTokenCounts = Pick<TokenBreakdown, 'input' | 'history' | 'output'> & {
  /** True if a heuristic (not the provider's exact) tokenizer was used. */
  approximate: boolean;
};

/** Hidden token estimate produced by `estimateHiddenTokens`. */
export type HiddenTokenEstimate = Pick<TokenBreakdown, 'thinking' | 'overhead'> & {
  /** False if the model was unknown and a provider default profile was used. */
  exactModelMatch: boolean;
};

/**
 * Thinking tokens: `max(0, thinkingTimeMs − baseline) × tokensPerMsThinking × effortMultiplier`.
 */
export function estimateThinkingTokens(
  thinkingTimeMs: number,
  tokensPerMsThinking: number,
  thinkingEffort: ThinkingEffort,
): number {
  const effectiveMs = Math.max(0, thinkingTimeMs - THINKING_BASELINE_MS);
  const effortMultiplier = THINKING_EFFORT_MULTIPLIERS[thinkingEffort] ?? 0.5;
  return Math.round(effectiveMs * tokensPerMsThinking * effortMultiplier);
}

/**
 * Estimates the hidden tokens (thinking + overhead) for a capture from its model profile.
 */
export function estimateHiddenTokens(capture: ChatCaptureDto): HiddenTokenEstimate {
  const profile = resolveHiddenTokenProfile(capture.provider, capture.model);
  return {
    thinking: estimateThinkingTokens(
      capture.thinkingTimeMs,
      profile.tokensPerMsThinking,
      capture.model.thinkingEffort,
    ),
    overhead: profile.systemPromptTokens,
    exactModelMatch: profile.exactModelMatch,
  };
}

/**
 * Rounds a number to 4 decimal places so small single-prompt Wh / mL values remain readable.
 */
function roundMetric(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Calculates energy (Wh), water (mL), and carbon (gCO2e) usage for a given `totalTokens` count
 * by scaling the 1M-token lookup rate (`totalTokens / 1_000_000 * ratePer1M`).
 * Background only, not displayed.
 */
export function calculateEnvironmentalImpact(
  totalTokens: number,
  provider: Provider,
  model: ModelInfo,
): EnvironmentalImpact {
  const profile = resolveEnergyProfile(provider, model);
  const unit = energyLookup.perTokensUnit || 1_000_000;
  const scale = Math.max(0, totalTokens) / unit;

  return {
    energyWh: roundMetric(scale * profile.energyWhPer1M),
    waterMl: roundMetric(scale * profile.waterMlPer1M),
    co2Grams: roundMetric(scale * profile.co2GramsPer1M),
  };
}

/**
 * Combines visible + hidden counts into the breakdown, sums `totalTokens`
 * (input + history + output + thinking + overhead) and builds the `TokenEstimateDto`.
 */
export function buildTokenEstimateDto(
  capture: ChatCaptureDto,
  visible: VisibleTokenCounts,
  hidden: HiddenTokenEstimate,
): TokenEstimateDto {
  const breakdown: TokenBreakdown = {
    input: visible.input,
    history: visible.history,
    output: visible.output,
    thinking: hidden.thinking,
    overhead: hidden.overhead,
  };
  const totalTokens =
    breakdown.input +
    breakdown.history +
    breakdown.output +
    breakdown.thinking +
    breakdown.overhead;

  return {
    totalTokens,
    breakdown,
    impact: calculateEnvironmentalImpact(totalTokens, capture.provider, capture.model),
    provider: capture.provider,
    model: capture.model,
    timings: {
      latencyMs: capture.latencyMs,
      thinkingTimeMs: capture.thinkingTimeMs,
    },
    approximate: visible.approximate || !hidden.exactModelMatch,
    capturedAt: capture.capturedAt,
  };
}
