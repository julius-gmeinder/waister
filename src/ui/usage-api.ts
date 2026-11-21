/**
 * UsageApi: the UI side of `GET_USAGE_SUMMARY` and `GET_PROMPT_HISTORY`. Shared by the popup and
 * the app page, so the `*.app.tsx` roots only pick the window or filter.
 *
 * Context: popup, app page
 * Docs: docs/modules.md#ui
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { estimation, ui } from '../config/config.json';
import type { PromptHistoryQuery } from '../dto/prompt-history.dto';
import type { PromptRecordDto } from '../dto/prompt-record.dto';
import type { UsageSummaryDto } from '../dto/usage-summary.dto';
import type {
  GetPromptHistoryMessage,
  GetUsageSummaryMessage,
  PromptHistoryResponse,
  UsageSummaryResponse,
} from '../messages/runtime-messages';
import { timeframeSinceMs } from './timeframe.helpers';

/** `undefined` while loading, `null` if the background had no answer. */
export type SummaryState = UsageSummaryDto | null | undefined;

/** Summaries for the three Facts Page timeframe sections. */
export interface FactsSummaries {
  daily: SummaryState;
  weekly: SummaryState;
  allTime: SummaryState;
}

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

/** A history query without the paging fields, which the hook fills in. */
export type HistoryFilter = Omit<PromptHistoryQuery, 'offset' | 'limit'>;

export interface PromptHistoryState {
  /** `undefined` while the first page loads, `null` if the background had no answer. */
  records: PromptRecordDto[] | null | undefined;
  /** Totals of everything matching the filter, `undefined` until the first answer. */
  summary: UsageSummaryDto | undefined;
  /** More rows match than are loaded. */
  hasMore: boolean;
  /** A request is running: a new filter, or "Load more". */
  loading: boolean;
  /** Appends the next page. Does nothing while a request is running. */
  loadMore: () => void;
}

export async function fetchPromptHistory(
  query: PromptHistoryQuery,
): Promise<PromptHistoryResponse | null> {
  const message: GetPromptHistoryMessage = { type: 'GET_PROMPT_HISTORY', payload: query };

  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    // A worker from before this message existed answers nothing.
    if (!response || typeof response !== 'object' || !('records' in response)) return null;
    const history = response as PromptHistoryResponse;
    return { ...history, summary: normalizeSummary(history.summary) };
  } catch {
    return null;
  }
}

interface LoadedHistory {
  records: PromptRecordDto[] | null | undefined;
  summary: UsageSummaryDto | undefined;
  loading: boolean;
  /** The last page came back short, so nothing is left even if the count says otherwise. */
  exhausted: boolean;
}

/**
 * Pages through the prompts matching `filter`, `ui.history.pageSize` at a time. Only for
 * `*.app.tsx` roots. Starts over whenever `filter` changes identity or `active` turns true (so
 * opening the page shows prompts saved meanwhile), and keeps the old rows on screen until the
 * new ones arrive. Pass a memoized filter.
 */
export function usePromptHistory(filter: HistoryFilter, active: boolean): PromptHistoryState {
  const [loaded, setLoaded] = useState<LoadedHistory>({
    records: undefined,
    summary: undefined,
    loading: false,
    exhausted: false,
  });
  // Bumped by every restart, so a page that belongs to an older filter is dropped.
  const generation = useRef(0);

  useEffect(() => {
    if (!active) return;
    const current = ++generation.current;
    setLoaded((prev) => ({ ...prev, loading: true }));
    void fetchPromptHistory({ ...filter, offset: 0, limit: ui.history.pageSize }).then((result) => {
      if (current !== generation.current) return;
      setLoaded({
        records: result?.records ?? null,
        summary: result?.summary,
        loading: false,
        exhausted: !result || result.records.length < ui.history.pageSize,
      });
    });
  }, [filter, active]);

  const { records, loading } = loaded;
  const loadMore = useCallback(() => {
    if (!records || loading) return;
    const current = generation.current;
    setLoaded((prev) => ({ ...prev, loading: true }));
    void fetchPromptHistory({
      ...filter,
      offset: records.length,
      limit: ui.history.pageSize,
    }).then((result) => {
      if (current !== generation.current) return;
      setLoaded((prev) => {
        if (!result || !prev.records) return { ...prev, loading: false };
        // A prompt saved since the last page shifts OFFSET by one, which would repeat a row.
        const seen = new Set(prev.records.map((record) => record.id));
        return {
          records: [...prev.records, ...result.records.filter((record) => !seen.has(record.id))],
          summary: result.summary,
          loading: false,
          exhausted: result.records.length < ui.history.pageSize,
        };
      });
    });
  }, [filter, records, loading]);

  return {
    records,
    summary: loaded.summary,
    loading,
    hasMore: !loaded.exhausted && !!records && records.length < (loaded.summary?.promptCount ?? 0),
    loadMore,
  };
}

/**
 * Fetches Daily (since local midnight), Weekly (last 7 days) and All-Time summaries in parallel
 * for the Facts Page. Only for `*.app.tsx` roots.
 */
export function useFactsSummaries(): FactsSummaries {
  const [summaries, setSummaries] = useState<FactsSummaries>({
    daily: undefined,
    weekly: undefined,
    allTime: undefined,
  });

  useEffect(() => {
    let ignore = false;
    const nowMs = Date.now();
    void Promise.all([
      fetchUsageSummary(timeframeSinceMs('today', nowMs)),
      fetchUsageSummary(timeframeSinceMs('week', nowMs)),
      fetchUsageSummary(timeframeSinceMs('all', nowMs)),
    ]).then(([daily, weekly, allTime]) => {
      if (!ignore) {
        setSummaries({ daily, weekly, allTime });
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  return summaries;
}
