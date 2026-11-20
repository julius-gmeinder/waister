/**
 * UsageSummaryDto: PromptStoreService -> popup (response to GET_USAGE_SUMMARY).
 *
 * Token usage summed over all saved prompts captured since `sinceMs`.
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

import type { TokenBreakdown } from './token-estimate.dto';

export interface UsageSummaryDto {
  /** Start of the window (epoch ms, inclusive), echoed from the request. */
  sinceMs: number;
  /** Number of saved prompts in the window. */
  promptCount: number;
  /** Sum of `totalTokens` over those prompts. */
  totalTokens: number;
  /** Per-category sums over those prompts. */
  breakdown: TokenBreakdown;
}
