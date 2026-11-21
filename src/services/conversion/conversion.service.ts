/**
 * ConversionService: converts a prompt's token breakdown into environmental impact (energy in Wh,
 * water in mL, CO2 in g) using differentiated per-category token energy profiles, KV-cache hit
 * rates, and vendor-specific CO2 grid intensity from `config.json` (`estimation.models`,
 * `estimation.impact`).
 *
 * Context: background
 * Docs: docs/modules.md#conversion-service, docs/pipeline.md
 */

import { estimation } from '../../config/config.json';
import type {
  EstimationConfig,
  ModelRates,
  TokenCategoryEnergyProfile,
  TokenEnergyCategory,
} from '../../config/config.types';
import type { ModelInfo, Provider } from '../../dto/chat-capture.dto';
import type {
  EnvironmentalImpact,
  TokenBreakdown,
  TokenEstimateDto,
} from '../../dto/token-estimate.dto';

const ESTIMATION_CONFIG: EstimationConfig = estimation;
const { impact: IMPACT, models: MODELS } = ESTIMATION_CONFIG;
const ROUNDING_FACTOR = 10 ** IMPACT.roundingDecimals;

/**
 * Token breakdown accepted by `calculateEnvironmentalImpact`. Supports both `overhead` (from
 * `TokenBreakdown`) and `systemPrompt` (matching `estimation.impact.tokenEnergyProfile`).
 */
export type TokenCategoryCounts = Partial<
  Record<keyof TokenBreakdown | TokenEnergyCategory, number>
>;

function roundMetric(value: number): number {
  return Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR;
}

function resolveImpactRates(provider: Provider, model: ModelInfo): ModelRates {
  const providerModels = MODELS[provider] ?? MODELS.openai;
  return providerModels.families[model.name] ?? providerModels.default;
}

/**
 * Effective energy multiplier for a token category after blending its base multiplier with the
 * KV-cached input multiplier according to its average cache hit rate:
 * `(1 - avgCacheHitRate) * baseMultiplier + avgCacheHitRate * cachedInputMultiplier`.
 */
export function resolveCategoryEffectiveMultiplier(category: TokenEnergyCategory): number {
  const profile: TokenCategoryEnergyProfile = IMPACT.tokenEnergyProfile[category];
  return (
    (1 - profile.avgCacheHitRate) * profile.baseMultiplier +
    profile.avgCacheHitRate * IMPACT.cachedInputMultiplier
  );
}

function resolveCategoryTokens(counts: TokenCategoryCounts, category: TokenEnergyCategory): number {
  if (category === 'systemPrompt') {
    return Math.max(0, counts.systemPrompt ?? counts.overhead ?? 0);
  }
  return Math.max(0, counts[category] ?? 0);
}

const TOKEN_CATEGORIES: readonly TokenEnergyCategory[] = [
  'output',
  'thinking',
  'input',
  'tools',
  'history',
  'systemPrompt',
];

/**
 * Energy (Wh), water (mL) and CO2 (g) for a per-category token breakdown (or a scalar token total,
 * treated as uncached `output` tokens for backward compatibility).
 */
export function calculateEnvironmentalImpact(
  tokens: TokenCategoryCounts | number,
  provider: Provider,
  model: ModelInfo,
): EnvironmentalImpact {
  const rates = resolveImpactRates(provider, model);
  const counts: TokenCategoryCounts =
    typeof tokens === 'number' ? { output: Math.max(0, tokens) } : tokens;

  let totalEnergyWh = 0;
  for (const category of TOKEN_CATEGORIES) {
    const categoryTokens = resolveCategoryTokens(counts, category);
    if (categoryTokens === 0) continue;
    const effectiveMultiplier = resolveCategoryEffectiveMultiplier(category);
    totalEnergyWh +=
      (categoryTokens / IMPACT.perTokensUnit) * rates.energyWhPer1M * effectiveMultiplier;
  }

  const co2GramsPerWh = IMPACT.co2GramsPerWh[provider] ?? IMPACT.co2GramsPerWh.openai;
  const waterMl = totalEnergyWh * IMPACT.waterMlPerWh;
  const co2Grams = totalEnergyWh * co2GramsPerWh;

  return {
    energyWh: roundMetric(totalEnergyWh),
    waterMl: roundMetric(waterMl),
    co2Grams: roundMetric(co2Grams),
  };
}

/** Populates `impact` on a `TokenEstimateDto` from its `breakdown`, `provider` and `model`. */
export function convertTokensToImpact(estimateDto: TokenEstimateDto): TokenEstimateDto {
  return {
    ...estimateDto,
    impact: calculateEnvironmentalImpact(
      estimateDto.breakdown,
      estimateDto.provider,
      estimateDto.model,
    ),
  };
}
