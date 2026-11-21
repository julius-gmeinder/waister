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
    typeof summary.impact.waterMl === 'number'
  ) {
    return { ...base, ...windowFields };
  }

  const { perTokensUnit, roundingDecimals } = estimation.impact;
  const rates = estimation.models.openai.default;
  const factor = 10 ** roundingDecimals;
  const scale = Math.max(0, summary.totalTokens ?? 0) / perTokensUnit;
  const round = (value: number): number => Math.round(value * factor) / factor;

  return {
    ...base,
    ...windowFields,
    impact: {
      energyWh: round(scale * rates.energyWhPer1M),
      waterMl: round(scale * rates.waterMlPer1M),
      co2Grams: round(scale * rates.co2GramsPer1M),
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
