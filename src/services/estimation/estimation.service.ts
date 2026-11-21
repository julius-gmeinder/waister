/**
 * EstimationService: estimates the hidden tokens (thinking, tools, overhead) and assembles the
 * `TokenEstimateDto`.
 * Visible counts are passed in by the handler, and environmental impact is populated afterwards by
 * the ConversionService, so services don't call each other.
 *
 * Context: background
 * Docs: docs/modules.md#estimation-service, docs/pipeline.md
 */

import type {
  ChatCaptureDto,
  Provider,
  ThinkingEffort,
  ToolCallKind,
} from '../../dto/chat-capture.dto';
import type {
  EnvironmentalImpact,
  TokenBreakdown,
  TokenEstimateDto,
} from '../../dto/token-estimate.dto';
import { ESTIMATION_CONFIG, resolveModelProfile } from './model-profiles';

const { thinking: THINKING, tools: TOOLS } = ESTIMATION_CONFIG;

const EMPTY_IMPACT: EnvironmentalImpact = {
  energyWh: 0,
  waterMl: 0,
  co2Grams: 0,
};

export type VisibleTokenCounts = Pick<TokenBreakdown, 'input' | 'history' | 'output'> & {
  approximate: boolean;
};

export type HiddenTokenEstimate = Pick<TokenBreakdown, 'thinking' | 'tools' | 'overhead'> & {
  /** False if the model was unknown and a provider default profile was used. */
  exactModelMatch: boolean;
};

/**
 * Thinking tokens: `max(0, thinkingTimeMs − baseline) × tokensPerMsThinking × effortMultiplier`,
 * capped at `estimation.thinking.maxTokens`. Thinking can't take longer than the whole response.
 */
export function estimateThinkingTokens(
  thinkingTimeMs: number,
  latencyMs: number,
  tokensPerMsThinking: number,
  thinkingEffort: ThinkingEffort,
): number {
  const effectiveMs = Math.max(0, Math.min(thinkingTimeMs, latencyMs) - THINKING.baselineMs);
  // An effort string outside ThinkingEffort (it crosses a message boundary) counts as unknown.
  const effortMultiplier =
    THINKING.effortMultipliers[thinkingEffort] ?? THINKING.effortMultipliers.unknown;
  return Math.min(
    THINKING.maxTokens,
    Math.round(effectiveMs * tokensPerMsThinking * effortMultiplier),
  );
}

/** Tool tokens: sum of `estimation.tools[provider][kind]` over all detected calls. */
export function estimateToolTokens(toolCalls: readonly ToolCallKind[], provider: Provider): number {
  const rates = TOOLS[provider];
  // `?? 0`: a kind that crossed the message boundary may have no rate (NaN would lose the prompt).
  return toolCalls.reduce((sum, kind) => sum + (rates[kind] ?? 0), 0);
}

export function estimateHiddenTokens(capture: ChatCaptureDto): HiddenTokenEstimate {
  const profile = resolveModelProfile(capture.provider, capture.model);
  return {
    thinking: estimateThinkingTokens(
      capture.thinkingTimeMs,
      capture.latencyMs,
      profile.tokensPerMsThinking,
      capture.model.thinkingEffort,
    ),
    tools: estimateToolTokens(capture.toolCalls, capture.provider),
    overhead: profile.systemPromptTokens,
    exactModelMatch: profile.exactModelMatch,
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
    tools: hidden.tools,
    overhead: hidden.overhead,
  };
  const totalTokens =
    breakdown.input +
    breakdown.history +
    breakdown.output +
    breakdown.thinking +
    breakdown.tools +
    breakdown.overhead;

  return {
    totalTokens,
    breakdown,
    impact: EMPTY_IMPACT,
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
