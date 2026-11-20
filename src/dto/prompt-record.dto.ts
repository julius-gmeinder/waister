/**
 * PromptRecordDto: EstimationHandler -> PromptStoreService (one row in the SQLite `prompts` table).
 *
 * One saved prompt: the full `TokenEstimateDto` plus a generated id and the link to the
 * conversation. Metrics only, no chat text.
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#dtos, docs/dto.md
 */

import type { TokenEstimateDto } from './token-estimate.dto';

export interface PromptRecordDto extends TokenEstimateDto {
  /** Random UUID (v4) generated when the prompt is saved. */
  id: string;
  /** Link to the conversation on the chat site, echoed from the capture. */
  conversationUrl: string;
}
