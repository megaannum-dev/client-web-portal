// Messages that never reached the backend, kept in IndexedDB (File objects
// survive a reload) until the user retries or deletes them. Best-effort: with
// no IndexedDB, or on any error, every call resolves quietly -- losing a draft
// to cleared browser storage is acceptable.

export interface FailedRecord {
  tempId: string;
  owner: string;
  body: string;
  files: File[];
  createdAt: string;
}

const STORE = "failed";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open("portal-chat", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "tempId" }).createIndex("owner", "owner");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Run `fn` on the store; resolve with its request's result, or `fallback` on any failure. */
async function run<T>(mode: IDBTransactionMode, fallback: T, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  try {
    const db = await open();
    return await new Promise<T>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req ? (req.result as T) : fallback);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(fallback);
      };
    });
  } catch {
    return fallback;
  }
}

export const listFailed = (owner: string) =>
  run<FailedRecord[]>("readonly", [], (s) => s.index("owner").getAll(owner));

export const putFailed = (rec: FailedRecord) => run<void>("readwrite", undefined, (s) => s.put(rec));

export const removeFailed = (tempId: string) => run<void>("readwrite", undefined, (s) => s.delete(tempId));

/** Sign-out wipe: every record owned by `uid` (or a `uid:`-prefixed owner). */
export const clearFailedForUser = (uid: string) =>
  run<void>("readwrite", undefined, (s) => {
    s.openCursor().onsuccess = (e) => {
      const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cur) return;
      const owner = (cur.value as FailedRecord).owner;
      if (owner === uid || owner.startsWith(`${uid}:`)) cur.delete();
      cur.continue();
    };
  });
