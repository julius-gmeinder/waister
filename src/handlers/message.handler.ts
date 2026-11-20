/**
 * Routes runtime messages (messages/runtime-messages) to the right handler.
 * ESTIMATE_PROMPT -> estimation.handler (`handleEstimation`),
 * GET_LATEST_ESTIMATE -> estimation.handler (`handleGetLatestEstimate`).
 *
 * Context: background
 * Docs: docs/modules.md#handlers
 */

import type { RuntimeMessage } from '../messages/runtime-messages';
import { handleEstimation, handleGetLatestEstimate } from './estimation.handler';

/**
 * Dispatches an incoming `chrome.runtime` message by its `type` discriminator.
 */
export async function handleRuntimeMessage(
  message: RuntimeMessage,
  sender?: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case 'ESTIMATE_PROMPT': {
      const tabId = sender?.tab?.id;
      return handleEstimation(message.payload, tabId);
    }
    case 'GET_LATEST_ESTIMATE': {
      return handleGetLatestEstimate(message.payload?.tabId);
    }
    default:
      return undefined;
  }
}
