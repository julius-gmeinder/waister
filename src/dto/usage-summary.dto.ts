/**
 * UsageSummaryDto (PromptStoreService -> popup, app page): token usage and impact summed since
 * `sinceMs`.
 *
 * Context: shared
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

import type { EnvironmentalImpact, TokenBreakdown } from './token-estimate.dto';

export interface UsageSummaryDto {
  /** Window start, epoch ms, inclusive. */
  sinceMs: number;
  /** When the background ran the query, epoch ms. The window ends here. */
  queriedAtMs: number;
  /** `capturedAt` of the oldest prompt in the window, `null` if the window is empty. */
  firstCapturedAt: number | null;
  promptCount: number;
  totalTokens: number;
  breakdown: TokenBreakdown;
  /** Sum of each prompt's saved impact. */
  impact: EnvironmentalImpact;
}
