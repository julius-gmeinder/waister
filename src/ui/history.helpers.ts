/**
 * History helpers: the History page's filter state (timeframe, providers, sort), its options, and
 * grouping the loaded prompts by local day.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

import type { Provider } from '../dto/chat-capture.dto';
import type { HistorySort } from '../dto/prompt-history.dto';
import type { PromptRecordDto } from '../dto/prompt-record.dto';
import { DAY_MS, type TimeframeId } from './timeframe.helpers';

/** What the History page shows. Held by the App root, so it survives switching pages. */
export interface HistoryView {
  timeframe: TimeframeId;
  /** Empty = every provider. */
  providers: Provider[];
  sort: HistorySort;
}

/** History is for looking things up, so it starts with everything, unlike the dashboard. */
export const DEFAULT_HISTORY_VIEW: HistoryView = {
  timeframe: 'all',
  providers: [],
  sort: 'newest',
};

/** Order of the options in the SortPicker. */
export const HISTORY_SORTS: readonly { id: HistorySort; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'tokens', label: 'Most tokens' },
  { id: 'energy', label: 'Most energy' },
];

/** Order of the chips in the ProviderFilter. */
export const HISTORY_PROVIDERS: readonly Provider[] = ['openai', 'anthropic', 'google'];

/** Time orders are grouped by day. A metric order is a ranking, so day groups would split it. */
export function isChronological(sort: HistorySort): boolean {
  return sort === 'newest' || sort === 'oldest';
}

/** Toggles one provider. Selecting all of them is the same as selecting none, so it resets. */
export function toggleProvider(selected: readonly Provider[], provider: Provider): Provider[] {
  const next = selected.includes(provider)
    ? selected.filter((p) => p !== provider)
    : [...selected, provider];
  return next.length === HISTORY_PROVIDERS.length ? [] : next;
}

export interface HistoryDay {
  /** Local midnight, epoch ms. Also the React key. */
  startMs: number;
  label: string;
  records: PromptRecordDto[];
  totalTokens: number;
  energyWh: number;
}

function localMidnight(epochMs: number): number {
  const date = new Date(epochMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayLabel(startMs: number, nowMs: number): string {
  const today = localMidnight(nowMs);
  if (startMs === today) return 'Today';
  // Half a day of slack, because a DST switch makes a day 23 or 25 hours long.
  if (Math.abs(today - DAY_MS - startMs) < DAY_MS / 2) return 'Yesterday';
  const date = new Date(startMs);
  const sameYear = date.getFullYear() === new Date(nowMs).getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Consecutive records of the same local day, in the order given (they arrive sorted by time).
 * The totals only cover loaded records, so the last day may still grow with "Load more".
 */
export function groupByDay(records: readonly PromptRecordDto[], nowMs: number): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const record of records) {
    const startMs = localMidnight(record.capturedAt);
    let day = days.at(-1);
    if (!day || day.startMs !== startMs) {
      day = { startMs, label: dayLabel(startMs, nowMs), records: [], totalTokens: 0, energyWh: 0 };
      days.push(day);
    }
    day.records.push(record);
    day.totalTokens += record.totalTokens;
    day.energyWh += record.impact.energyWh;
  }
  return days;
}
