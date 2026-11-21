/**
 * ConversionService: converts a prompt's token estimate into environmental impact (energy in Wh,
 * water in mL, CO2 in g) using the per-model rates in `config.json` (`estimation.models`,
 * `estimation.impact`).
 *
 * Context: background
 * Docs: docs/modules.md#conversion-service, docs/pipeline.md
 */

import { estimation } from '../../config/config.json';
import type { EstimationConfig, ModelRates } from '../../config/config.types';
import type { ModelInfo, Provider } from '../../dto/chat-capture.dto';
import type { EnvironmentalImpact, TokenEstimateDto } from '../../dto/token-estimate.dto';

const ESTIMATION_CONFIG: EstimationConfig = estimation;
const { impact: IMPACT, models: MODELS } = ESTIMATION_CONFIG;
const ROUNDING_FACTOR = 10 ** IMPACT.roundingDecimals;

function roundMetric(value: number): number {
  return Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR;
}

function resolveImpactRates(provider: Provider, model: ModelInfo): ModelRates {
  const providerModels = MODELS[provider] ?? MODELS.openai;
  return providerModels.families[model.name] ?? providerModels.default;
}

/** Energy (Wh), water (mL) and CO2 (g) for `totalTokens`. */
export function calculateEnvironmentalImpact(
  totalTokens: number,
  provider: Provider,
  model: ModelInfo,
): EnvironmentalImpact {
  const rates = resolveImpactRates(provider, model);
  const scale = Math.max(0, totalTokens) / IMPACT.perTokensUnit;

  return {
    energyWh: roundMetric(scale * rates.energyWhPer1M),
    waterMl: roundMetric(scale * rates.waterMlPer1M),
    co2Grams: roundMetric(scale * rates.co2GramsPer1M),
  };
}

/** Populates `impact` on a `TokenEstimateDto` from its `totalTokens`, `provider` and `model`. */
export function convertTokensToImpact(estimateDto: TokenEstimateDto): TokenEstimateDto {
  return {
    ...estimateDto,
    impact: calculateEnvironmentalImpact(
      estimateDto.totalTokens,
      estimateDto.provider,
      estimateDto.model,
    ),
  };
}
