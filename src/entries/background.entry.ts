/**
 * Background entry: registers the runtime listener and forwards messages to message.handler.
 *
 * Context: background (service worker)
 * Docs: docs/modules.md#entries
 */

import { handleRuntimeMessage } from '../handlers/message.handler';
import type { RuntimeMessage } from '../messages/runtime-messages';

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  handleRuntimeMessage(message).then(sendResponse, (err: unknown) => {
    console.error('[waister]', message.type, 'failed', err);
    sendResponse({ error: String(err) });
  });
  // Keeps the channel open for the async sendResponse.
  return true;
});
