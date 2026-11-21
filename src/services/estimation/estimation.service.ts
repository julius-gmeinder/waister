/**
 * EstimationService: estimates the hidden tokens (thinking, overhead) and assembles the
 * `TokenEstimateDto`. Visible counts are passed in by the handler, so services don't call each
 * other.
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

export type VisibleTokenCounts = Pick<TokenBreakdown, 'input' | 'history' | 'output'> & {
  approximate: boolean;
};

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

/** 4 decimals, so tiny single-prompt Wh / mL values don't round to 0. */
function roundMetric(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Energy (Wh), water (mL) and CO2 (g) for `totalTokens`. Saved, but not displayed. */
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
