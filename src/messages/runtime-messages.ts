/**
 * RuntimeMessages: all chrome.runtime messages and their responses.
 *
 * Context: shared
 * Docs: docs/modules.md#messages
 */

import type { ChatCaptureDto } from '../dto/chat-capture.dto';
import type { PromptHistoryDto, PromptHistoryQuery } from '../dto/prompt-history.dto';
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

/** App page (History) -> background. */
export interface GetPromptHistoryMessage {
  type: 'GET_PROMPT_HISTORY';
  payload: PromptHistoryQuery;
}

export type RuntimeMessage =
  EstimatePromptMessage | GetUsageSummaryMessage | GetPromptHistoryMessage;

export type UsageSummaryResponse = UsageSummaryDto;

export type PromptHistoryResponse = PromptHistoryDto;
