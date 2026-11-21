/**
 * RecordValidator: pure schema validation, corrupt record quarantine, model family re-resolution,
 * token breakdown sum reconciliation, and dynamic impact recomputation against current `config.json`.
 *
 * Context: background
 * Docs: docs/modules.md#prompt-store-service
 */

import { capture, estimation } from '../../config/config.json';
import type { ModelInfo, Provider, ThinkingEffort } from '../../dto/chat-capture.dto';
import type { PromptRecordDto } from '../../dto/prompt-record.dto';
import type { TokenBreakdown } from '../../dto/token-estimate.dto';
import { calculateEnvironmentalImpact } from '../conversion/conversion.service';

/**
 * Deterministic version stamp derived from `config.json` impact parameters.
 * Updated automatically whenever key impact multipliers or water/CO2 intensities change.
 */
export const CURRENT_ESTIMATION_VERSION = `v2-${estimation.impact.waterMlPerWh}-${estimation.impact.cachedInputMultiplier}-${estimation.impact.tokenEnergyProfile.history.avgCacheHitRate}`;

const VALID_PROVIDERS = new Set<Provider>(['openai', 'anthropic', 'google']);
const VALID_EFFORTS = new Set<ThinkingEffort>([
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'unknown',
]);

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Re-resolves a stored `ModelInfo` against `config.json` (`capture.models` and `estimation.models`)
 * so legacy records with generic family names (`gpt`, `claude`, `gemini`, `unknown`) but rich
 * `rawLabel` strings (`"GPT-6 Astra"`, `"Claude 4.5 Opus"`, `"Gemini 4 Argon"`) map to their
 * accurate model family and rates.
 */
export function resolveStoredModelInfo(provider: Provider, model: ModelInfo): ModelInfo {
  const providerFamilies = estimation.models[provider].families as Record<string, unknown>;
  const rawLabel = (model.rawLabel || '').trim();
  const lowerLabel = rawLabel.toLowerCase();
  const lowerName = (model.name || '').trim().toLowerCase();

  let resolvedName = model.name;
  let resolvedVersion = model.version || 'unknown';

  const hasSpecificFamily =
    resolvedName in providerFamilies && (provider !== 'openai' || resolvedName !== 'gpt');

  if (!hasSpecificFamily && ((lowerLabel && lowerLabel !== 'unknown') || lowerName)) {
    const searchTarget =
      lowerLabel && lowerLabel !== 'unknown' ? `${lowerLabel} ${lowerName}` : lowerName;

    if (provider === 'anthropic') {
      const matched = Object.entries(capture.models.claude.families).find(([, keywords]) =>
        keywords.some((kw) => searchTarget.includes(kw)),
      )?.[0];
      if (matched) resolvedName = matched;
    } else if (provider === 'google') {
      const matched = Object.entries(capture.models.gemini.families).find(([, keywords]) =>
        keywords.some((kw) => searchTarget.includes(kw)),
      )?.[0];
      if (matched) resolvedName = matched;
    } else if (provider === 'openai') {
      const matched = Object.entries(capture.models.chatgpt.families).find(([, keywords]) =>
        keywords.some((kw) => searchTarget.includes(kw)),
      )?.[0];
      if (matched) {
        resolvedName = matched;
      } else if (
        new RegExp(capture.models.chatgpt.slug.oSeries, 'i').test(searchTarget) ||
        new RegExp(capture.models.chatgpt.label.oSeries, 'i').test(searchTarget)
      ) {
        resolvedName = 'openai-o';
      } else if (resolvedName in providerFamilies) {
        resolvedName = 'gpt';
      }
    }
  }

  if (resolvedVersion === 'unknown' && rawLabel && rawLabel !== 'unknown') {
    const versionMatch = rawLabel.match(/(\d+(?:[.-]\d+)?)/);
    if (versionMatch?.[1]) {
      resolvedVersion = versionMatch[1].replace('-', '.');
    }
  }

  const thinkingEffort: ThinkingEffort = VALID_EFFORTS.has(model.thinkingEffort)
    ? model.thinkingEffort
    : 'unknown';

  return {
    name: resolvedName || 'unknown',
    version: resolvedVersion,
    thinkingEffort,
    rawLabel: rawLabel || resolvedName || 'unknown',
  };
}

/**
 * Validates and normalizes one candidate prompt record:
 * - Rejects (`null`) records with missing required objects, `NaN`/`Infinity`, negative numbers,
 *   invalid timestamps, or zero-token impact spikes.
 * - Reconciles `totalTokens` to equal the sum of `breakdown` categories whenever breakdown counts exist.
 * - Dynamically recomputes `impact` (`energyWh`, `waterMl`, `co2Grams`) via `calculateEnvironmentalImpact`
 *   for any record that has a per-category token breakdown.
 * - Flags pre-update records that have `totalTokens > 0` but zero breakdown counts as `isLegacy: true`.
 */
export function validateAndNormalizeRecord(candidate: unknown): PromptRecordDto | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const raw = candidate as Record<string, unknown>;

  if (typeof raw.id !== 'string' || raw.id.trim() === '') return null;
  if (typeof raw.provider !== 'string' || !VALID_PROVIDERS.has(raw.provider as Provider)) {
    return null;
  }
  const provider = raw.provider as Provider;

  if (!isFiniteNonNegative(raw.capturedAt) || raw.capturedAt <= 0) return null;
  if (!isFiniteNonNegative(raw.totalTokens)) return null;

  if (!raw.model || typeof raw.model !== 'object') return null;
  const rawModel = raw.model as Record<string, unknown>;
  if (typeof rawModel.name !== 'string' || rawModel.name.trim() === '') return null;

  if (!raw.breakdown || typeof raw.breakdown !== 'object') return null;
  const rawBreakdown = raw.breakdown as Record<string, unknown>;
  const input = rawBreakdown.input;
  const history = rawBreakdown.history;
  const output = rawBreakdown.output;
  const thinking = rawBreakdown.thinking;
  const tools = rawBreakdown.tools ?? 0;
  const overhead = rawBreakdown.overhead ?? rawBreakdown.systemPrompt;

  if (
    !isFiniteNonNegative(input) ||
    !isFiniteNonNegative(history) ||
    !isFiniteNonNegative(output) ||
    !isFiniteNonNegative(thinking) ||
    !isFiniteNonNegative(tools) ||
    !isFiniteNonNegative(overhead)
  ) {
    return null;
  }

  if (!raw.impact || typeof raw.impact !== 'object') return null;
  const rawImpact = raw.impact as Record<string, unknown>;
  if (
    !isFiniteNonNegative(rawImpact.energyWh) ||
    !isFiniteNonNegative(rawImpact.waterMl) ||
    !isFiniteNonNegative(rawImpact.co2Grams)
  ) {
    return null;
  }

  const rawTimings =
    raw.timings && typeof raw.timings === 'object'
      ? (raw.timings as Record<string, unknown>)
      : { latencyMs: 0, thinkingTimeMs: 0 };
  const latencyMs = rawTimings.latencyMs ?? 0;
  const thinkingTimeMs = rawTimings.thinkingTimeMs ?? 0;
  if (!isFiniteNonNegative(latencyMs) || !isFiniteNonNegative(thinkingTimeMs)) {
    return null;
  }

  const breakdown: TokenBreakdown = {
    input: Math.round(input),
    history: Math.round(history),
    output: Math.round(output),
    thinking: Math.round(thinking),
    tools: Math.round(tools),
    overhead: Math.round(overhead),
  };

  const breakdownSum =
    breakdown.input +
    breakdown.history +
    breakdown.output +
    breakdown.thinking +
    breakdown.tools +
    breakdown.overhead;

  const rawTotalTokens = Math.round(raw.totalTokens);

  // Quarantine zero-token impact spikes (0 tokens in both breakdown and total, yet positive impact)
  if (
    breakdownSum === 0 &&
    rawTotalTokens === 0 &&
    (rawImpact.energyWh > 0 || rawImpact.waterMl > 0 || rawImpact.co2Grams > 0)
  ) {
    return null;
  }

  const resolvedModel = resolveStoredModelInfo(provider, {
    name: rawModel.name,
    version: typeof rawModel.version === 'string' ? rawModel.version : 'unknown',
    thinkingEffort:
      typeof rawModel.thinkingEffort === 'string'
        ? (rawModel.thinkingEffort as ThinkingEffort)
        : 'unknown',
    rawLabel: typeof rawModel.rawLabel === 'string' ? rawModel.rawLabel : rawModel.name,
  });

  // If the record lacks a per-category breakdown but has a positive scalar totalTokens,
  // it cannot be recomputed with category weights -> mark as legacy.
  const isLegacy = raw.isLegacy === true || (breakdownSum === 0 && rawTotalTokens > 0);

  if (isLegacy) {
    return {
      id: raw.id,
      conversationUrl: typeof raw.conversationUrl === 'string' ? raw.conversationUrl : '',
      capturedAt: raw.capturedAt,
      provider,
      model: resolvedModel,
      breakdown,
      totalTokens: rawTotalTokens,
      impact: {
        energyWh: rawImpact.energyWh,
        waterMl: rawImpact.waterMl,
        co2Grams: rawImpact.co2Grams,
      },
      timings: {
        latencyMs,
        thinkingTimeMs,
      },
      approximate: Boolean(raw.approximate),
      estimationVersion:
        typeof raw.estimationVersion === 'string' && raw.estimationVersion
          ? raw.estimationVersion
          : 'legacy',
      isLegacy: true,
    };
  }

  // Reconcile totalTokens with the sum of its category breakdown and dynamically recompute impact
  const totalTokens = breakdownSum;
  const recomputedImpact =
    totalTokens > 0
      ? calculateEnvironmentalImpact(breakdown, provider, resolvedModel)
      : { energyWh: 0, waterMl: 0, co2Grams: 0 };

  return {
    id: raw.id,
    conversationUrl: typeof raw.conversationUrl === 'string' ? raw.conversationUrl : '',
    capturedAt: raw.capturedAt,
    provider,
    model: resolvedModel,
    breakdown,
    totalTokens,
    impact: recomputedImpact,
    timings: {
      latencyMs,
      thinkingTimeMs,
    },
    approximate: Boolean(raw.approximate),
    estimationVersion: CURRENT_ESTIMATION_VERSION,
    isLegacy: false,
  };
}

/** Filters and normalizes a list of candidate records, dropping corrupt entries. */
export function validateAndNormalizeRecords(records: readonly unknown[]): PromptRecordDto[] {
  if (!Array.isArray(records)) return [];
  const valid: PromptRecordDto[] = [];
  for (const item of records) {
    const normalized = validateAndNormalizeRecord(item);
    if (normalized) {
      valid.push(normalized);
    }
  }
  return valid;
}
