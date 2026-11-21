/**
 * Timeframe helpers: the dashboard's selectable windows and where each one starts.
 *
 * Context: app page
 * Docs: docs/modules.md#ui
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export type TimeframeId = 'today' | 'week' | 'month' | 'all';

export interface Timeframe {
  id: TimeframeId;
  label: string;
}

/** Order of the chips in the TimeframePicker. */
export const TIMEFRAMES: readonly Timeframe[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last week' },
  { id: 'month', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
];

/** Every visit starts here. The choice is not remembered. */
export const DEFAULT_TIMEFRAME: TimeframeId = 'today';

/** Window start, epoch ms. Today = since local midnight, the others are rolling. */
export function timeframeSinceMs(id: TimeframeId, nowMs: number): number {
  switch (id) {
    case 'today': {
      const midnight = new Date(nowMs);
      midnight.setHours(0, 0, 0, 0);
      return midnight.getTime();
    }
    case 'week':
      return nowMs - 7 * DAY_MS;
    case 'month':
      return nowMs - 30 * DAY_MS;
    case 'all':
      return 0;
  }
}
