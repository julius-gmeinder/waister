/**
 * SqliteDatabase: in-memory SQLite (WASM) database, persisted as IndexedDB snapshots. Internal to
 * `prompt-store/`.
 * MV3 service workers can't use the OPFS-backed VFSes (those need a dedicated Worker) and are
 * stopped after ~30 s idle, so every write is followed by a snapshot of the whole database to
 * IndexedDB, and `getDatabase()` restores it on the next start.
 * `sqlite3.wasm` is found through `import.meta.url` (that's why the background bundle is ESM).
 *
 * Context: background
 * Docs: docs/modules.md#prompt-store-service
 */

import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';

const IDB_NAME = 'waister';
const IDB_STORE = 'sqlite';
const SNAPSHOT_KEY = 'main';
/** A snapshot that failed to load is kept here, so a bug never destroys the user's history. */
const CORRUPT_SNAPSHOT_KEY = 'main.corrupt';

interface Sqlite {
  sqlite3: Sqlite3Static;
  db: Database;
}

// Every sqlite3InitModule() call creates a separate wasm instance and DB pointers are only valid
// inside the instance that created them, so init exactly once.
let sqlitePromise: Promise<Sqlite> | undefined;
/** Serializes writes so snapshots reach IndexedDB in the same order as the writes. */
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs on every start, so it must be idempotent: it creates the schema (`CREATE TABLE IF NOT
 * EXISTS`) and migrates an existing one.
 */
export type SchemaSetup = (db: Database) => void;

export async function getDatabase(schema: SchemaSetup): Promise<Database> {
  sqlitePromise ??= openDatabase(schema).catch((err: unknown) => {
    sqlitePromise = undefined; // allow a retry on the next call
    throw err;
  });
  return (await sqlitePromise).db;
}

/**
 * Trade-offs: `write` mutates the in-memory database before the snapshot is saved, so if
 * `saveSnapshot` fails the row stays in memory (and in later snapshots) while this call rejects.
 * The next successful write persists it. Every insert re-serializes the whole database, which is
 * fine for a few thousand metric rows but would need an incremental scheme beyond that.
 */
export function writeAndPersist<T>(schema: SchemaSetup, write: (db: Database) => T): Promise<T> {
  const run = writeQueue.then(async () => {
    const db = await getDatabase(schema);
    const result = write(db);
    await saveSnapshot();
    return result;
  });
  writeQueue = run.catch(() => undefined);
  return run;
}

async function openDatabase(schema: SchemaSetup): Promise<Sqlite> {
  const [sqlite3, snapshot] = await Promise.all([sqlite3InitModule(), loadSnapshot()]);

  let db: Database;
  try {
    db = restoreDatabase(sqlite3, snapshot, schema);
  } catch (err) {
    if (!snapshot) throw err;
    // Without this, a corrupt or truncated snapshot would fail every start forever. Only the
    // latest bad snapshot is kept, an older backup is overwritten.
    console.error('[waister] snapshot could not be restored, starting with a fresh database', err);
    await idbRequest('readwrite', (store) => store.put(snapshot, CORRUPT_SNAPSHOT_KEY));
    db = restoreDatabase(sqlite3, undefined, schema);
  }

  console.info(`[waister] sqlite ${sqlite3.version.libVersion} ready`);
  return { sqlite3, db };
}

/** Opens a database from `snapshot` (if any) and applies the schema. Closes it again on failure. */
function restoreDatabase(
  sqlite3: Sqlite3Static,
  snapshot: ArrayBuffer | undefined,
  schema: SchemaSetup,
): Database {
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  try {
    if (snapshot && snapshot.byteLength > 0) {
      const { capi, wasm } = sqlite3;
      const bytes = new Uint8Array(snapshot);
      const pointer = wasm.allocFromTypedArray(bytes);
      db.checkRc(
        capi.sqlite3_deserialize(
          db.pointer!,
          'main',
          pointer,
          bytes.byteLength,
          bytes.byteLength,
          capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
        ),
      );
    }
    // Running the schema also catches a snapshot that deserializes fine but is corrupt, which
    // only shows on first use.
    schema(db);
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

async function saveSnapshot(): Promise<void> {
  const { sqlite3, db } = await sqlitePromise!;
  const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer!);
  await idbRequest('readwrite', (store) => store.put(bytes.buffer, SNAPSHOT_KEY));
}

function loadSnapshot(): Promise<ArrayBuffer | undefined> {
  return idbRequest('readonly', (store) => store.get(SNAPSHOT_KEY) as IDBRequest<ArrayBuffer>);
}

function idbRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const connection = open.result;
      const transaction = connection.transaction(IDB_STORE, mode);
      const request = run(transaction.objectStore(IDB_STORE));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      // Resolve on commit, not on request success, so a write is really on disk.
      transaction.oncomplete = () => {
        connection.close();
        resolve(result);
      };
      transaction.onerror = () => {
        connection.close();
        reject(transaction.error ?? request.error);
      };
      transaction.onabort = () => {
        connection.close();
        reject(transaction.error);
      };
    };
  });
}
