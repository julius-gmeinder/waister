/**
 * Routes runtime messages (messages/runtime-messages) to the right handler.
 * ESTIMATE_PROMPT -> estimation.handler (`handleEstimation`), GET_LATEST_ESTIMATE -> estimate-cache.
 *
 * Context: background
 * Docs: docs/modules.md#handlers
 */

import type { RuntimeMessage } from '../messages/runtime-messages';
import { handleEstimation } from './estimation.handler';

/**
 * Dispatches an incoming `chrome.runtime` message by its `type` discriminator.
 * Routes `ESTIMATE_PROMPT` payloads (`ChatCaptureDto`) directly into `handleEstimation`.
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
      // Out of scope for this step; will connect to estimate-cache.service in a later task.
      return null;
    }
    default:
      return undefined;
  }
}
