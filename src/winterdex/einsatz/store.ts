// Sicherung auf dem Gerät (IndexedDB): Entwürfe (angefangene Einsätze) und fertige Einsätze, die noch
// nicht gesendet werden konnten (Funkloch). Safari lädt eine Seite neu, wenn die Kamera viel Speicher
// braucht — ohne diese Sicherung wären Fotos, Startzeit und GPS-Stempel dann weg.
// Geht IndexedDB nicht (privates Surfen), bleibt alles im Arbeitsspeicher der Seite — die Erfassung läuft weiter.

import type { OperationAction, WeatherSnapshot } from '../types';
import type { OperationRow } from './backend';

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy?: number;
  at: string;
}

export type GritUnit = 'kg' | 'g/m²' | 'l';

export interface FormValues {
  action: OperationAction;
  gritMaterial: string;
  gritAmount: string;
  gritUnit: GritUnit;
  unitTouched: boolean;
  performerName: string;
  notes: string;
}

/** Angefangener Einsatz an einem Objekt. */
export interface Draft {
  key: string;
  kind: 'draft';
  userId: string;
  propertyId: string;
  opId: string;
  openedAt: string;
  start: GpsFix | null;
  weather: WeatherSnapshot | null;
  form: FormValues;
  photos: string[];
  updatedAt: string;
}

/** Fertiger Einsatz, der noch nicht auf dem Server ist (Zeit, GPS und Fotos bleiben die vom Einsatzort). */
export interface Pending {
  key: string;
  kind: 'pending';
  userId: string;
  propertyName: string;
  row: OperationRow;
  photos: string[];
  /** Server hat abgelehnt (kein Netzproblem) — Meldung für die Anzeige. */
  lastError?: string;
}

/** Weitere Einträge desselben Speichers (Strecken-Aufzeichnung, wartende Fahrten) — siehe aussendienst/runStore.ts */
export interface OtherRec {
  key: string;
  kind: string;
  userId: string;
}

type Rec = Draft | Pending | OtherRec;

const DB_NAME = 'dexware-winterdex-einsatz';
const STORE = 'kv';
const memory = new Map<string, Rec>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
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
export async function kvPut(rec: Rec): Promise<boolean> {
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

export async function kvAll(): Promise<Rec[]> {
  const fromDb = await run<Rec[]>('readonly', (s) => s.getAll() as IDBRequest<Rec[]>).catch(() => undefined);
  if (!fromDb) return [...memory.values()];
  // Arbeitsspeicher gewinnt (dort steht nur, was IndexedDB nicht annehmen konnte)
  const map = new Map(fromDb.map((r) => [r.key, r]));
  for (const [k, v] of memory) map.set(k, v);
  return [...map.values()];
}

export const draftKey = (userId: string, propertyId: string) => `draft:${userId}:${propertyId}`;
export const pendingKey = (opId: string) => `pending:${opId}`;

export const saveDraft = (d: Draft) => kvPut(d);
export const deleteDraft = (userId: string, propertyId: string) => kvDel(draftKey(userId, propertyId));
export async function getDraft(userId: string, propertyId: string): Promise<Draft | null> {
  const key = draftKey(userId, propertyId);
  return ((await kvAll()).find((r) => r.key === key && r.kind === 'draft') as Draft | undefined) ?? null;
}
export async function listDrafts(userId: string): Promise<Draft[]> {
  return (await kvAll()).filter((r): r is Draft => r.kind === 'draft' && r.userId === userId) as Draft[];
}

export const savePending = (p: Pending) => kvPut(p);
export const deletePending = (opId: string) => kvDel(pendingKey(opId));
export async function listPending(userId: string): Promise<Pending[]> {
  return (await kvAll())
    .filter((r): r is Pending => r.kind === 'pending' && r.userId === userId)
    .sort((a, b) => a.row.started_at.localeCompare(b.row.started_at));
}

// Seiten, die Wartendes anzeigen, aktualisieren sich sofort (wie emitOutboxChanged in der App).
const listeners = new Set<() => void>();
export function onPendingChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function emitPendingChanged(): void {
  listeners.forEach((f) => f());
}
