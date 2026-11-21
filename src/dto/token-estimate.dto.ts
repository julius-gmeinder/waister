/**
 * TokenEstimateDto (EstimationService -> EstimationHandler): token breakdown, total and impact.
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

import type { ModelInfo, Provider } from './chat-capture.dto';

export interface TokenBreakdown {
  /** Visible tokens of `userInput`. */
  input: number;
  /** Visible tokens of all earlier turns (re-sent as context). */
  history: number;
  /** Visible tokens of `response`. */
  output: number;
  /** Hidden reasoning tokens, estimated. */
  thinking: number;
  /** Hidden system prompt and tool-definition tokens, estimated. */
  overhead: number;
}

/** Derived from the token counts via the per-1M-token table in `services/estimation/`. */
export interface EnvironmentalImpact {
  energyWh: number;
  /** Datacenter cooling water. */
  waterMl: number;
  /** Grams of CO2 equivalent. */
  co2Grams: number;
}

export interface TokenEstimateDto {
  /** input + history + output + thinking + overhead. */
  totalTokens: number;
  breakdown: TokenBreakdown;
  impact: EnvironmentalImpact;
  provider: Provider;
  model: ModelInfo;
  timings: {
    latencyMs: number;
    thinkingTimeMs: number;
  };
  /** True if heuristic tokenization or a fallback model profile was used. */
  approximate: boolean;
  /** Epoch ms. */
  capturedAt: number;
}
