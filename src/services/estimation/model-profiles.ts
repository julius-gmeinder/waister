/**
 * Per-model rates from `config.json` (`estimation.models`), internal to EstimationService.
 *
 * Context: background
 * Docs: docs/modules.md#estimation-service
 */

import { estimation } from '../../config/config.json';
import type { EstimationConfig, ModelRates } from '../../config/config.types';
import type { ModelInfo, Provider } from '../../dto/chat-capture.dto';

export const ESTIMATION_CONFIG: EstimationConfig = estimation;

export interface ModelProfile extends ModelRates {
  /** False if the model family is unknown and the provider default was used. */
  exactModelMatch: boolean;
}

/** Rates of `model.name`, or the provider default if the family has no entry. */
export function resolveModelProfile(provider: Provider, model: ModelInfo): ModelProfile {
  const providerModels = ESTIMATION_CONFIG.models[provider];
  const familyRates = providerModels.families[model.name];
  return {
    ...(familyRates ?? providerModels.default),
    exactModelMatch: familyRates !== undefined,
  };
}
