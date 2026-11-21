/**
 * All chrome.runtime messages and their responses.
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#messages
 */

import type { ChatCaptureDto } from '../dto/chat-capture.dto';
import type { PromptRecordDto } from '../dto/prompt-record.dto';
import type { UsageSummaryDto } from '../dto/usage-summary.dto';

/** Content -> background, once the response has finished streaming. */
export interface EstimatePromptMessage {
  type: 'ESTIMATE_PROMPT';
  payload: ChatCaptureDto;
}

/** Popup -> background. */
export interface GetUsageSummaryMessage {
  type: 'GET_USAGE_SUMMARY';
  payload: {
    sinceMs: number;
  };
}

export type RuntimeMessage = EstimatePromptMessage | GetUsageSummaryMessage;

export type EstimatePromptResponse = PromptRecordDto;

export type UsageSummaryResponse = UsageSummaryDto;
