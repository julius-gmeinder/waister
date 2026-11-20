/**
 * Entry point of the background (esbuild -> background.js, ES module).
 * Only registers the runtime listeners and hands every message to handlers/message.handler.
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
  // Return true to keep the message channel open for the async handler response
  return true;
});
