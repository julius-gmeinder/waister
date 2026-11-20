/**
 * SQLite (WebAssembly) for the background worker.
 *
 * The database lives in memory. MV3 service workers can't use the OPFS-backed VFSes
 * (those need a dedicated Worker) and get shut down after ~30 s idle, so after writes
 * call `persist()`: it saves a snapshot of the whole database to IndexedDB, and
 * `getDb()` restores it on the next start.
 */
import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';

const IDB_NAME = 'waister';
const IDB_STORE = 'sqlite';
const SNAPSHOT_KEY = 'main';

/** Schema, run on every start. Keep statements idempotent (IF NOT EXISTS). */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// Every sqlite3InitModule() call creates a new, separate wasm instance, so init exactly once.
// DB pointers are only valid inside the instance that created them.
let sqlitePromise: Promise<Sqlite3Static> | undefined;
let dbPromise: Promise<Database> | undefined;

function getSqlite(): Promise<Sqlite3Static> {
  sqlitePromise ??= sqlite3InitModule();
  return sqlitePromise;
}

/** Returns the shared database, initialising SQLite and restoring the snapshot on first use. */
export function getDb(): Promise<Database> {
  dbPromise ??= openDb().catch((err: unknown) => {
    sqlitePromise = dbPromise = undefined; // allow a retry
    throw err;
  });
  return dbPromise;
}

async function openDb(): Promise<Database> {
  const [sqlite3, snapshot] = await Promise.all([getSqlite(), loadSnapshot()]);
  const db = new sqlite3.oo1.DB(':memory:', 'c');

  if (snapshot && snapshot.byteLength > 0) {
    const { capi, wasm } = sqlite3;
    const bytes = new Uint8Array(snapshot);
    const ptr = wasm.allocFromTypedArray(bytes);
    db.checkRc(
      capi.sqlite3_deserialize(
        db.pointer!,
        'main',
        ptr,
        bytes.byteLength,
        bytes.byteLength,
        capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
      ),
    );
  }

  db.exec(SCHEMA);
  console.log(`[waister] sqlite ${sqlite3.version.libVersion} ready`);
  return db;
}

/** Saves the current database to IndexedDB. Call after writes you want to keep. */
export async function persist(): Promise<void> {
  const [db, sqlite3] = await Promise.all([getDb(), getSqlite()]);
  const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer!);
  await idb('readwrite', (store) => store.put(bytes.buffer, SNAPSHOT_KEY));
}

function loadSnapshot(): Promise<ArrayBuffer | undefined> {
  return idb('readonly', (store) => store.get(SNAPSHOT_KEY));
}

function idb<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const conn = open.result;
      const request = run(conn.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.transaction!.oncomplete = () => conn.close();
    };
  });
}
