// Kleiner Gerätespeicher (IndexedDB) für die Handy-Ansichten mit EIGENEM Datenmodell (PrüfDex, SchutzDex):
// Entwürfe und fertige Nachweise, die noch nicht auf dem Server sind — samt Fotos und Unterschriften (zu groß für
// localStorage). Gleiches Muster wie store.ts (dort fest auf Prüfung + Mängel der acht Prüf-Apps zugeschnitten).
// Geht IndexedDB nicht (privates Surfen), bleibt alles im Arbeitsspeicher der Seite — die Erfassung läuft weiter.

export interface KvRec {
  /** eindeutiger Schlüssel, z. B. „pruefdex:wartend:<konto>:<id>“ */
  key: string;
}

const DB_NAME = 'dexware-vor-ort-kv';
const STORE = 'kv';
const memory = new Map<string, KvRec>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    // dauerhaft behalten (sonst darf der Browser selten genutzte Seiten-Daten von selbst löschen)
    void navigator.storage?.persist?.().catch(() => undefined);
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        if (!db) return reject(new Error('kein IndexedDB'));
        try {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req.result);
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Fehler'));
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abgebrochen'));
        } catch (e) {
          reject(e as Error);
        }
      }),
  );
}

/** true = dauerhaft auf dem Gerät gesichert; false = nur im Arbeitsspeicher dieser Seite. */
export async function kvPut<T extends KvRec>(rec: T): Promise<boolean> {
  memory.set(rec.key, rec);
  try {
    await run('readwrite', (s) => s.put(rec));
    // Dauerhaft gesichert → die Kopie im Arbeitsspeicher wird nicht mehr gebraucht (Fotos sind groß)
    memory.delete(rec.key);
    return true;
  } catch {
    return false;
  }
}

export async function kvDel(key: string): Promise<void> {
  memory.delete(key);
  await run('readwrite', (s) => s.delete(key)).catch(() => undefined);
}

export async function kvGet<T extends KvRec>(key: string): Promise<T | null> {
  const mem = memory.get(key);
  if (mem) return mem as T;
  const v = await run<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>).catch(() => undefined);
  return v ?? null;
}

/** Alle Einträge, deren Schlüssel mit `prefix` beginnt. Der Arbeitsspeicher gewinnt (dort steht nur, was IndexedDB nicht annahm). */
export async function kvList<T extends KvRec>(prefix: string): Promise<T[]> {
  const range = typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.bound(prefix, `${prefix}￿`) : undefined;
  const fromDb = await run<T[]>('readonly', (s) => s.getAll(range) as IDBRequest<T[]>).catch(() => undefined);
  const map = new Map<string, T>((fromDb ?? []).map((r) => [r.key, r]));
  for (const [k, v] of memory) if (k.startsWith(prefix)) map.set(k, v as T);
  return [...map.values()];
}

/** Kleine Melde-Stelle: Seiten, die Wartendes anzeigen, aktualisieren sich sofort. */
export function createSignal(): { on: (fn: () => void) => () => void; emit: () => void } {
  const listeners = new Set<() => void>();
  return {
    on(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    emit() {
      listeners.forEach((f) => f());
    },
  };
}
