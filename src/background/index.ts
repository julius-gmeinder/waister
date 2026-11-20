import type { Message } from '../shared/messages';
import { getDb } from './db';
import { handleMessage } from './handlers';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[waister] installed (${reason})`);
});

// Start loading SQLite right away so the first query doesn't pay for it.
getDb().catch((err: unknown) => console.error('[waister] sqlite failed to load', err));

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_INFO') return false; // answered by the content script
  handleMessage(message).then(sendResponse, (err: unknown) => sendResponse({ error: String(err) }));
  // true = sendResponse will be called asynchronously.
  return true;
});
