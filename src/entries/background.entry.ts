/**
 * Background entry: registers the runtime listener and forwards messages to message.handler.
 * On first install it opens the app page, whose privacy notice asks for consent before anything
 * is captured.
 *
 * Context: background
 * Docs: docs/modules.md#entries
 */

import { handleRuntimeMessage } from '../handlers/message.handler';
import type { RuntimeMessage } from '../messages/runtime-messages';
import { seedDummyPromptRecords } from '../services/prompt-store/prompt-store.service';

/** Replaced at build time by esbuild's `define` (scripts/build.mjs). */
declare const process: { env: { WAISTER_DUMMY: string } };

// `npm run dummy` builds only (stripped elsewhere): top up fake history to ~12M tokens.
if (process.env.WAISTER_DUMMY === 'true') {
  seedDummyPromptRecords().then(
    (added) => console.info('[waister] dummy data seeded', added),
    (err: unknown) => console.error('[waister] dummy data failed', err),
  );
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  // Install only: an update must not open a tab (a new policy version is asked in the popup).
  if (reason !== 'install') return;
  void chrome.tabs.create({ url: chrome.runtime.getURL('app/index.html') });
});

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
