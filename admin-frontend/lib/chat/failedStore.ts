// Chat messages that never reached the backend, kept in IndexedDB (not
// localStorage) so File objects survive a reload. Best-effort throughout: if
// storage is missing, blocked or cleared, we quietly lose the saved copies.

export interface FailedRecord {
  tempId: string;
  /** `${uid}:${clientId}` -- per user, per room. */
  owner: string;
  body: string;
  files: File[];
  createdAt: string;
}

const STORE = "failed";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("portal-chat", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "tempId" }).createIndex("owner", "owner");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Run `fn` against the store; resolves with its result, or `fallback` on any failure. */
async function run<T>(
  mode: IDBTransactionMode,
  fallback: T,
  fn: (store: IDBObjectStore) => IDBRequest | void,
): Promise<T> {
  if (typeof indexedDB === "undefined") return fallback;
  try {
    const db = await open();
    return await new Promise<T>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req && "result" in req && mode === "readonly" ? (req.result as T) : fallback);
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

export const listFailed = (owner: string): Promise<FailedRecord[]> =>
  run<FailedRecord[]>("readonly", [], (s) => s.index("owner").getAll(owner));

export const putFailed = (rec: FailedRecord): Promise<void> =>
  run<void>("readwrite", undefined, (s) => s.put(rec));

export const removeFailed = (tempId: string): Promise<void> =>
  run<void>("readwrite", undefined, (s) => s.delete(tempId));

export const clearFailedForUser = (uid: string): Promise<void> =>
  run<void>("readwrite", undefined, (s) => {
    s.index("owner").openKeyCursor(IDBKeyRange.bound(`${uid}:`, `${uid}:￿`)).onsuccess = (e) => {
      const cur = (e.target as IDBRequest<IDBCursor | null>).result;
      if (cur) {
        s.delete(cur.primaryKey);
        cur.continue();
      }
    };
  });
