/**
 * PromptHistoryDto (PromptStoreService -> app page History): one page of saved prompts plus the
 * totals of everything that matches the filter, requested with a PromptHistoryQuery.
 *
 * Context: shared
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

import type { Provider } from './chat-capture.dto';
import type { PromptRecordDto } from './prompt-record.dto';
import type { UsageSummaryDto } from './usage-summary.dto';

/** Row order. The two time orders are shown grouped by day, the metric orders as a ranking. */
export type HistorySort = 'newest' | 'oldest' | 'tokens' | 'energy';

export interface PromptHistoryQuery {
  /** Window start, epoch ms, inclusive. */
  sinceMs: number;
  /** Only these providers. Empty = every provider. */
  providers: Provider[];
  sort: HistorySort;
  /** Rows to skip, for "Load more". */
  offset: number;
  /** Rows per page. */
  limit: number;
}

export interface PromptHistoryDto {
  /** At most `limit` rows, in `sort` order. */
  records: PromptRecordDto[];
  /**
   * Totals over every prompt that matches `sinceMs` + `providers`, not only this page.
   * `summary.promptCount` > loaded rows means there are more pages.
   */
  summary: UsageSummaryDto;
}
