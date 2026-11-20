import type { Message } from '../shared/messages';
import { getDb, persist } from './db';

/** Handles a message sent to the background. Returns the response for the sender. */
export async function handleMessage(message: Message): Promise<unknown> {
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
