/**
 * Model impact profile lookup helper (`model-profiles.ts`).
 * Reads `energy-lookup.json` in `src/services/estimation/` to resolve the per-1M-token
 * energy (Wh), water (mL), and carbon (gCO2e) factors for a given provider and model.
 *
 * Context: background
 * Docs: docs/modules.md#estimation-service
 */

import type { ModelInfo, Provider } from '../../dto/chat-capture.dto';
import energyLookup from './energy-lookup.json';

/**
 * Resource rates per 1,000,000 tokens from `energy-lookup.json`.
 */
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
