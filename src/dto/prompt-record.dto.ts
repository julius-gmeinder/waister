/**
 * PromptRecordDto: one row of the SQLite `prompts` table. Metrics only, no chat text.
 *
 * Context: shared
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

import type { TokenEstimateDto } from './token-estimate.dto';

export interface PromptRecordDto extends TokenEstimateDto {
  /** UUID v4, generated in `createPromptRecord`. */
  id: string;
  conversationUrl: string;
  /** Config/formula version stamp set when the record was validated or saved. */
  estimationVersion?: string;
  /** True when a pre-update record lacks a per-category breakdown and cannot be recomputed. */
  isLegacy?: boolean;
}
