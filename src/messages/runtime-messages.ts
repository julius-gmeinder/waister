/**
 * Union of all chrome.runtime messages and their responses:
 * ESTIMATE_PROMPT (content -> background), GET_LATEST_ESTIMATE (popup -> background).
 *
 * Context: shared (any context)
 * Docs: docs/modules.md#messages
 */

import type { ChatCaptureDto } from '../dto/chat-capture.dto';
import type { TokenEstimateDto } from '../dto/token-estimate.dto';

/**
 * Sent by the content script (`dom-capture.strategy.ts`) to the background service worker
 * once a prompt's response stream has finished and been consolidated into a `ChatCaptureDto`.
 */
export interface EstimatePromptMessage {
  type: 'ESTIMATE_PROMPT';
  payload: ChatCaptureDto;
}

/**
 * Sent by the toolbar popup to retrieve the latest token & environmental impact estimate
 * for the active tab.
 */
export interface GetLatestEstimateMessage {
  type: 'GET_LATEST_ESTIMATE';
  payload: {
    tabId?: number;
  };
}

/**
 * Discriminated union of all runtime messages exchanged across extension contexts.
 */
export type RuntimeMessage = EstimatePromptMessage | GetLatestEstimateMessage;

/**
 * Response type returned by `ESTIMATE_PROMPT` and `GET_LATEST_ESTIMATE`.
 */
export type EstimateResponse = TokenEstimateDto | null;
