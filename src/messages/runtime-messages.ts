/**
 * Union of all chrome.runtime messages and their responses:
 * ESTIMATE_PROMPT (content -> background), GET_USAGE_SUMMARY (popup -> background).
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#messages
 */

import type { ChatCaptureDto } from '../dto/chat-capture.dto';
import type { PromptRecordDto } from '../dto/prompt-record.dto';
import type { UsageSummaryDto } from '../dto/usage-summary.dto';

/**
 * Sent by the content script (`dom-capture.strategy.ts`) to the background service worker
 * once a prompt's response stream has finished and been consolidated into a `ChatCaptureDto`.
 * The background estimates the tokens and saves the prompt to the database.
 */
export interface EstimatePromptMessage {
  type: 'ESTIMATE_PROMPT';
  payload: ChatCaptureDto;
}

/**
 * Sent by the toolbar popup to read the summed token usage of all saved prompts captured since
 * `sinceMs` (epoch ms) from the database.
 */
export interface GetUsageSummaryMessage {
  type: 'GET_USAGE_SUMMARY';
  payload: {
    sinceMs: number;
  };
}

/**
 * Discriminated union of all runtime messages exchanged across extension contexts.
 */
export type RuntimeMessage = EstimatePromptMessage | GetUsageSummaryMessage;

/** Response to `ESTIMATE_PROMPT`: the saved prompt. */
export type EstimatePromptResponse = PromptRecordDto;

/** Response to `GET_USAGE_SUMMARY`. */
export type UsageSummaryResponse = UsageSummaryDto;
