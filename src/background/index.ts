import { getDb, persist } from './db';
import type { Message } from './messages';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[waister] installed (${reason})`);
});

// Start loading SQLite right away so the first query doesn't pay for it.
getDb().catch((err: unknown) => console.error('[waister] sqlite failed to load', err));

async function handle(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'PING':
      return { ok: true };
    case 'KV_GET': {
      const db = await getDb();
      return db.selectValue('SELECT value FROM kv WHERE key = ?', [message.key]) ?? null;
    }
    case 'KV_SET': {
      const db = await getDb();
      db.exec('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', {
        bind: [message.key, message.value],
      });
      await persist();
      return { ok: true };
    }
    default:
      return undefined;
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_INFO') return false; // answered by the content script
  handle(message).then(sendResponse, (err: unknown) => sendResponse({ error: String(err) }));
  // true = sendResponse will be called asynchronously.
  return true;
});
