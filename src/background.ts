import type { Message } from './messages';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[waister] installed (${reason})`);
});

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ ok: true });
  }
  // Return true only if sendResponse will be called asynchronously.
  return false;
});
