/**
 * EstimationService: combines the token counts calculated by `tokenizer.service.ts` with
 * the 1M-token energy and water lookup table (`energy-lookup.json`) to produce the final
 * `TokenEstimateDto` for the popup.
 *
 * Context: background
 * Docs: docs/modules.md#estimation-service, docs/pipeline.md
 */

import type { ChatCaptureDto, ModelInfo, Provider } from '../../dto/chat-capture.dto';
import type { EnvironmentalImpact, TokenEstimateDto } from '../../dto/token-estimate.dto';
import type { TokenizationResult } from '../tokenizer/tokenizer.service';
import energyLookup from './energy-lookup.json';
import { resolveEnergyProfile } from './model-profiles';

/**
 * Rounds a number to 4 decimal places so small single-prompt Wh / mL values remain readable.
 */
function roundMetric(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Calculates energy (Wh), water (mL), and carbon (gCO2e) usage for a given `totalTokens` count
 * by scaling the 1M-token lookup rate (`totalTokens / 1_000_000 * ratePer1M`).
 */
export function calculateEnvironmentalImpact(
  totalTokens: number,
  provider: Provider,
  model: ModelInfo,
): { impact: EnvironmentalImpact; exactModelMatch: boolean } {
  const profile = resolveEnergyProfile(provider, model);
  const unit = energyLookup.perTokensUnit || 1_000_000;
  const scale = Math.max(0, totalTokens) / unit;

  return {
    impact: {
      energyWh: roundMetric(scale * profile.energyWhPer1M),
      waterMl: roundMetric(scale * profile.waterMlPer1M),
      co2Grams: roundMetric(scale * profile.co2GramsPer1M),
    },
    exactModelMatch: profile.exactModelMatch,
  };
}

/**
 * Combines the `ChatCaptureDto`, the `TokenizationResult` from `tokenizer.service.ts`, and
 * the 1M-token environmental impact calculation from `energy-lookup.json` into a single
 * `TokenEstimateDto` ready for the popup.
 */
export function buildTokenEstimateDto(
  capture: ChatCaptureDto,
  tokenization: TokenizationResult,
): TokenEstimateDto {
  const { impact, exactModelMatch } = calculateEnvironmentalImpact(
    tokenization.totalTokens,
    capture.provider,
    capture.model,
  );

  return {
    totalTokens: tokenization.totalTokens,
    breakdown: tokenization.breakdown,
    impact,
    provider: capture.provider,
    model: capture.model,
    timings: {
      latencyMs: capture.latencyMs,
      thinkingTimeMs: capture.thinkingTimeMs,
    },
    approximate: tokenization.approximate || !exactModelMatch,
    capturedAt: capture.capturedAt,
  };
}
