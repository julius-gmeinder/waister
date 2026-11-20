/**
 * TokenEstimateDto: EstimationHandler -> popup.
 *
 * Holds the complete token count breakdown (input, history, output, thinking, overhead),
 * the summed `totalTokens`, and the estimated environmental impact (`energyWh`, `waterMl`,
 * `co2Grams`) calculated from the 1M-token lookup table in `services/estimation/`.
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

import type { ModelInfo, Provider } from './chat-capture.dto';

/**
 * Per-category token breakdown computed by `tokenizer.service.ts`.
 */
export interface TokenBreakdown {
  /** Visible tokens in the newly submitted user prompt (`userInput`). */
  input: number;
  /** Visible tokens across all earlier turns in `chatHistory[]` (re-sent as context). */
  history: number;
  /** Visible tokens in the assistant's answer (`response`). */
  output: number;
  /** Hidden reasoning/thinking tokens inferred from `thinkingTimeMs` via the tokenizer lookup JSON. */
  thinking: number;
  /** Hidden system prompt and tool-definition overhead tokens via the tokenizer lookup JSON. */
  overhead: number;
}

/**
 * Environmental impact estimate derived from `totalTokens` (and input vs. output/thinking split)
 * using the per-1M-token lookup table in `services/estimation/`.
 */
export interface EnvironmentalImpact {
  /** Estimated electrical energy consumed by this prompt in watt-hours (Wh). */
  energyWh: number;
  /** Estimated cooling/datacenter water consumed by this prompt in milliliters (mL). */
  waterMl: number;
  /** Estimated carbon footprint in grams of CO2 equivalent (gCO2e). */
  co2Grams: number;
}

/**
 * Final estimation DTO produced by `estimation.handler.ts`, cached per tab in
 * `estimate-cache.service.ts`, and displayed in the popup UI (`popup.html` / `popup.view.ts`).
 */
export interface TokenEstimateDto {
  /** Sum of all breakdown token counts (input + history + output + thinking + overhead). */
  totalTokens: number;
  /** Detailed token count split by visible and hidden categories. */
  breakdown: TokenBreakdown;
  /** Estimated energy (Wh) and water (mL) usage for this prompt. */
  impact: EnvironmentalImpact;
  /** Provider echoed from the capture ('openai' | 'anthropic' | 'google'). */
  provider: Provider;
  /** Model metadata echoed from the capture. */
  model: ModelInfo;
  /** Timing metrics echoed from the capture for display/debugging in the popup. */
  timings: {
    latencyMs: number;
    thinkingTimeMs: number;
  };
  /** True if heuristic tokenization or a fallback model lookup profile was used. */
  approximate: boolean;
  /** Epoch ms timestamp when the prompt response was captured. */
  capturedAt: number;
}
