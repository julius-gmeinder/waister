/**
 * UsageApi: the UI side of `GET_USAGE_SUMMARY`. Shared by the popup and the app page, so the
 * `*.app.tsx` roots only pick the window.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

import { useEffect, useState } from 'react';
import { estimation } from '../config/config.json';
import type { UsageSummaryDto } from '../dto/usage-summary.dto';
import type { GetUsageSummaryMessage, UsageSummaryResponse } from '../messages/runtime-messages';

/** `undefined` while loading, `null` if the background had no answer. */
export type SummaryState = UsageSummaryDto | null | undefined;

/**
 * Fills the fields an older background service worker (not reloaded yet after an update) doesn't
 * send: `impact` from the provider-default rates, the window fields so the dashboard counts 1 day.
 */
function normalizeSummary(summary: Partial<UsageSummaryResponse>): UsageSummaryDto {
  const base = summary as UsageSummaryDto;
  const windowFields = {
    queriedAtMs: summary.queriedAtMs ?? Date.now(),
    firstCapturedAt: summary.firstCapturedAt ?? null,
  };
  if (
    summary.impact &&
    typeof summary.impact.energyWh === 'number' &&
    typeof summary.impact.waterMl === 'number' &&
    typeof summary.impact.co2Grams === 'number'
  ) {
    return { ...base, ...windowFields };
  }

  const {
    perTokensUnit,
    roundingDecimals,
    waterMlPerWh,
    co2GramsPerWh,
    cachedInputMultiplier,
    tokenEnergyProfile,
  } = estimation.impact;
  const rates = estimation.models.openai.default;
  const factor = 10 ** roundingDecimals;
  const round = (value: number): number => Math.round(value * factor) / factor;

  const breakdown = summary.breakdown;
  const categoryTokens = {
    output: breakdown?.output ?? summary.totalTokens ?? 0,
    thinking: breakdown?.thinking ?? 0,
    input: breakdown?.input ?? 0,
    tools: breakdown?.tools ?? 0,
    history: breakdown?.history ?? 0,
    systemPrompt: breakdown?.overhead ?? 0,
  } as const;

  let totalEnergyWh = 0;
  for (const [key, count] of Object.entries(categoryTokens) as [
    keyof typeof tokenEnergyProfile,
    number,
  ][]) {
    const profile = tokenEnergyProfile[key];
    const effectiveMultiplier =
      (1 - profile.avgCacheHitRate) * profile.baseMultiplier +
      profile.avgCacheHitRate * cachedInputMultiplier;
    totalEnergyWh +=
      (Math.max(0, count) / perTokensUnit) * rates.energyWhPer1M * effectiveMultiplier;
  }

  return {
    ...base,
    ...windowFields,
    impact: {
      energyWh: round(totalEnergyWh),
      waterMl: round(totalEnergyWh * waterMlPerWh),
      co2Grams: round(totalEnergyWh * co2GramsPerWh.openai),
    },
  };
}

export async function fetchUsageSummary(sinceMs: number): Promise<UsageSummaryDto | null> {
  const message: GetUsageSummaryMessage = { type: 'GET_USAGE_SUMMARY', payload: { sinceMs } };

  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    // The background answers `{ error }` on failure and nothing if no listener replied.
    if (!response || typeof response !== 'object' || 'error' in response) return null;
    return normalizeSummary(response as Partial<UsageSummaryResponse>);
  } catch {
    return null;
  }
}

/**
 * Fetches the summary since `sinceMs`, again whenever it changes. Only for `*.app.tsx` roots.
 * Keeps the previous summary while a new window loads, so switching windows doesn't flash `–`
 * and restart every animation.
 */
export function useUsageSummary(sinceMs: number): SummaryState {
  const [summary, setSummary] = useState<SummaryState>(undefined);

  useEffect(() => {
    let ignore = false;
    void fetchUsageSummary(sinceMs).then((result) => {
      if (!ignore) setSummary(result);
    });
    return () => {
      ignore = true;
    };
  }, [sinceMs]);

  return summary;
}
