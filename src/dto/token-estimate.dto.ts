/**
 * TokenEstimateDto (EstimationService -> EstimationHandler): token breakdown, total and impact.
 *
 * Context: shared
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

import type { ModelInfo, Provider } from './chat-capture.dto';

export interface TokenBreakdown {
  input: number;
  /** Earlier turns, which the chat app re-sends as context. */
  history: number;
  /** Answer plus any artifact / canvas document. */
  output: number;
  /** Hidden reasoning tokens, estimated. */
  thinking: number;
  /** Hidden tool-call tokens (search results, code + execution output), estimated per call. */
  tools: number;
  /** Hidden system prompt and tool-definition tokens, estimated. */
  overhead: number;
}

/** Derived from `totalTokens` via the per-1M-token rates in `config.json` (`estimation.models`). */
export interface EnvironmentalImpact {
  energyWh: number;
  /** Datacenter cooling water. */
  waterMl: number;
  /** Grams of CO2 equivalent. */
  co2Grams: number;
}

export interface TokenEstimateDto {
  /** input + history + output + thinking + tools + overhead. */
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
