/**
 * PromptRecordDto: one row of the SQLite `prompts` table. Metrics only, no chat text.
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

import type { TokenEstimateDto } from './token-estimate.dto';

export interface PromptRecordDto extends TokenEstimateDto {
  /** UUID v4, generated on save. */
  id: string;
  conversationUrl: string;
}
