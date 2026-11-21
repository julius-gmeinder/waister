/**
 * RuntimeMessages: all chrome.runtime messages and their responses.
 *
 * Context: shared
 * Docs: docs/modules.md#messages
 */

import type { ChatCaptureDto } from '../dto/chat-capture.dto';
import type { PromptHistoryDto, PromptHistoryQuery } from '../dto/prompt-history.dto';
import type { PromptRecordDto } from '../dto/prompt-record.dto';
import type { UsageSummaryDto } from '../dto/usage-summary.dto';

/** Content -> background, once the response has finished streaming. */
export interface EstimatePromptMessage {
  type: 'ESTIMATE_PROMPT';
  payload: ChatCaptureDto;
}

/** Popup / app page -> background. */
export interface GetUsageSummaryMessage {
  type: 'GET_USAGE_SUMMARY';
  payload: {
    sinceMs: number;
  };
}

/** App page (Analytics) -> background. */
export interface GetPromptRecordsMessage {
  type: 'GET_PROMPT_RECORDS';
  payload: {
    sinceMs: number;
  };
}

/** App page (Reset History) -> background. */
export interface ClearPromptRecordsMessage {
  type: 'CLEAR_PROMPT_RECORDS';
  payload?: {
    legacyOnly?: boolean;
  };
}

/** App page (History) -> background. */
export interface GetPromptHistoryMessage {
  type: 'GET_PROMPT_HISTORY';
  payload: PromptHistoryQuery;
}

export type RuntimeMessage =
  | EstimatePromptMessage
  | GetUsageSummaryMessage
  | GetPromptRecordsMessage
  | ClearPromptRecordsMessage
  | GetPromptHistoryMessage;

export type UsageSummaryResponse = UsageSummaryDto;
export type PromptRecordsResponse = PromptRecordDto[];
export type PromptHistoryResponse = PromptHistoryDto;
export interface ClearPromptRecordsResponse {
  cleared: true;
}
