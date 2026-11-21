/**
 * Background entry: registers the runtime listener and forwards messages to message.handler.
 *
 * Context: background
 * Docs: docs/modules.md#entries
 */

import { handleRuntimeMessage } from '../handlers/message.handler';
import type { RuntimeMessage } from '../messages/runtime-messages';

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  const pending = handleRuntimeMessage(message);
  // Unrecognized message: don't keep the channel open for a response that never comes.
  if (!pending) return false;

  pending.then(sendResponse, (err: unknown) => {
    console.error('[waister]', message.type, 'failed', err);
    sendResponse({ error: String(err) });
  });
  // Keeps the channel open for the async sendResponse.
  return true;
});
