// Sicherung auf dem Gerät (IndexedDB) — gleiches Muster wie WinterDex (src/winterdex/einsatz/store.ts):
// Entwürfe (angefangene Prüfungen) und fertige Prüfungen, die noch nicht (ganz) auf dem Server sind.
// Safari lädt eine Seite neu, wenn die Kamera viel Speicher braucht — ohne diese Sicherung wären Checkliste,
// Mängel, Fotos und GPS-Stempel dann weg.
// Geht IndexedDB nicht (privates Surfen), bleibt alles im Arbeitsspeicher der Seite — die Erfassung läuft weiter.

import type { CheckResult } from './config';
import type { DefectRow, GpsFix, InspectionRow } from './rows';

/** Mangel im Formular — wird erst mit der Prüfung gespeichert. `key` ist schon die spätere Mangel-ID. */
export interface DefectDraft {
  key: string;
  title: string;
  description: string;
  severity: string;
  blocked: boolean;
  photos: string[];
  /** Nur Orts-Modus: betroffene Einheit des Orts (Gerüst, Regalzeile, Spielgerät); fehlt = „Ort allgemein“. */
  unitId?: string;
}

export interface FormValues {
  type: string;
  checklist: Record<string, CheckResult>;
  notes: string;
  inspectorName: string;
  qualification: string;
  signature: string;
  /** Nur Apps mit Messwerten (HebeDex): Eingaben des Rechners, als Text wie getippt. */
  measure?: Record<string, string>;
}

/** Angefangene Prüfung einer Einheit — im Orts-Modus eines Orts (unitId ist dann die ID des Orts). */
export interface Draft {
  key: string;
  kind: 'draft';
  app: string;
  userId: string;
  siteId: string;
  unitId: string;
  /** feste Prüf-ID ab dem Öffnen (gleiche Foto-Pfade bei jeder Wiederholung) */
  inspectionId: string;
  openedAt: string;
  start: GpsFix | null;
  form: FormValues;
  photos: string[];
  defects: DefectDraft[];
  /** gerade geöffneter Mangel (Kamera im Mangel-Dialog kann die Seite neu laden) */
  editing: DefectDraft | null;
  /** Die Checkliste wurde wegen einer Einheiten-Warnung vorbelegt (z. B. ablegereif) — beim Fortsetzen nicht noch einmal. */
  prefilled?: boolean;
  updatedAt: string;
}

/** Fertige Prüfung samt Mängeln, die noch nicht vollständig auf dem Server ist. */
export interface Pending {
  key: string;
  kind: 'pending';
  app: string;
  userId: string;
  siteName: string;
  unitName: string;
  inspection: InspectionRow;
  photos: string[];
  defects: { row: DefectRow; photos: string[] }[];
  /** Was schon auf dem Server ist — ein neuer Versuch holt nur nach, was fehlt. */
  sent: { inspection: boolean; defects: string[] };
  /** Die Datenbank kannte die Spalte für die Unterschrift nicht → ohne gespeichert. */
  signatureDropped?: boolean;
  /** Server hat abgelehnt (kein Netzproblem) — Meldung für die Anzeige. */
  lastError?: string;
}

type Rec = Draft | Pending;

const DB_NAME = 'dexware-pruefen-vor-ort';
const STORE = 'kv';
const memory = new Map<string, Rec>();
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
async function kvPut(rec: Rec): Promise<boolean> {
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

async function kvDel(key: string): Promise<void> {
  memory.delete(key);
  await run('readwrite', (s) => s.delete(key)).catch(() => undefined);
}

async function kvAll(): Promise<Rec[]> {
  const fromDb = await run<Rec[]>('readonly', (s) => s.getAll() as IDBRequest<Rec[]>).catch(() => undefined);
  if (!fromDb) return [...memory.values()];
  // Arbeitsspeicher gewinnt (dort steht nur, was IndexedDB nicht annehmen konnte)
  const map = new Map(fromDb.map((r) => [r.key, r]));
  for (const [k, v] of memory) map.set(k, v);
  return [...map.values()];
}

export const draftKey = (app: string, userId: string, unitId: string) => `draft:${app}:${userId}:${unitId}`;
export const pendingKey = (app: string, inspectionId: string) => `pending:${app}:${inspectionId}`;

export const saveDraft = (d: Draft) => kvPut(d);
export const deleteDraft = (app: string, userId: string, unitId: string) => kvDel(draftKey(app, userId, unitId));
export async function getDraft(app: string, userId: string, unitId: string): Promise<Draft | null> {
  const key = draftKey(app, userId, unitId);
  return ((await kvAll()).find((r) => r.key === key && r.kind === 'draft') as Draft | undefined) ?? null;
}
export async function listDrafts(app: string, userId: string): Promise<Draft[]> {
  return (await kvAll()).filter((r): r is Draft => r.kind === 'draft' && r.app === app && r.userId === userId);
}

export const savePending = (p: Pending) => kvPut(p);
export const deletePending = (key: string) => kvDel(key);
export async function listPending(app: string, userId: string): Promise<Pending[]> {
  return (await kvAll())
    .filter((r): r is Pending => r.kind === 'pending' && r.app === app && r.userId === userId)
    .sort((a, b) => a.inspection.started_at.localeCompare(b.inspection.started_at));
}

// Seiten, die Wartendes anzeigen, aktualisieren sich sofort.
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
