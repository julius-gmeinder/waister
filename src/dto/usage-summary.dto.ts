/**
 * UsageSummaryDto (PromptStoreService -> popup): token usage summed since `sinceMs`.
 *
 * Context: shared
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

import type { EnvironmentalImpact, TokenBreakdown } from './token-estimate.dto';

export interface UsageSummaryDto {
  /** Window start, epoch ms, inclusive. */
  sinceMs: number;
  promptCount: number;
  totalTokens: number;
  breakdown: TokenBreakdown;
  impact: EnvironmentalImpact;
}
