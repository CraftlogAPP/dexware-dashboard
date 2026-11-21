// Sicherung auf dem Gerät (IndexedDB): Entwürfe (angefangene Einsätze) und fertige Einsätze, die noch
// nicht gesendet werden konnten (Funkloch). Safari lädt eine Seite neu, wenn die Kamera viel Speicher
// braucht — ohne diese Sicherung wären Fotos, Startzeit und GPS-Stempel dann weg.
// Geht IndexedDB nicht (privates Surfen), bleibt alles im Arbeitsspeicher der Seite — die Erfassung läuft weiter.
//
// Seit 21.11.2026: Jeder Lesezugriff holt nur, was er braucht (Schlüssel bzw. Schlüssel-Bereich statt des ganzen
// Speichers), und die Fotos wartender Einsätze/Fahrten liegen in einem eigenen Eintrag „fotos:<schlüssel>“. Listen,
// Anzeigen und das minütliche Nachsenden laden damit keine Fotos mehr — die kommen erst beim Hochladen, Eintrag für
// Eintrag. Ältere Einträge mit eingebetteten Fotos werden weiter gelesen und beim nächsten Speichern umgezogen.

import type { OperationAction, WeatherSnapshot } from '../types';
import type { OperationRow } from './backend';
import type { RejectInfo } from '../../lib/retryLater';

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

/** Eintrag, dessen Fotos getrennt gespeichert werden (wartender Einsatz, wartende Fahrt). */
export interface WithPhotos {
  key: string;
  userId: string;
  /**
   * Fotos als Daten-URIs — nur beim Anlegen (und in Einträgen von vor dem 21.11.2026). Gespeichert werden sie im
   * eigenen Eintrag „fotos:<key>“; aus Listen kommt der Eintrag ohne sie (siehe photoCount, photosOf).
   */
  photos?: string[];
  /** Zahl der Fotos (auch wenn sie nicht mitgeladen sind) */
  photoCount?: number;
  /** Fotos liegen schon im Speicher des Servers: diese Pfade beim nächsten Senden nehmen (kein zweites Hochladen). */
  photoUrls?: string[];
}

/** Fertiger Einsatz, der noch nicht auf dem Server ist (Zeit, GPS und Fotos bleiben die vom Einsatzort). */
export interface Pending extends WithPhotos, RejectInfo {
  kind: 'pending';
  propertyName: string;
  row: OperationRow;
}

/** Die Fotos eines wartenden Eintrags (eigener Eintrag, damit Listen klein bleiben). */
interface PhotoRec {
  key: string;
  kind: 'photos';
  userId: string;
  photos: string[];
}

/** Weitere Einträge desselben Speichers (Strecken-Aufzeichnung, wartende Fahrten) — siehe aussendienst/runStore.ts */
export interface OtherRec {
  key: string;
  kind: string;
  userId: string;
}

type Rec = Draft | Pending | PhotoRec | OtherRec;

const DB_NAME = 'dexware-winterdex-einsatz';
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
        req.onsuccess = () => {
          const db = req.result;
          // Der Browser darf die Verbindung schließen (iOS nach längerem Hintergrund): beim nächsten Zugriff neu öffnen,
          // sonst blieben Entwürfe und Wartendes bis zum Neuladen der Seite unsichtbar.
          db.onclose = forgetDb;
          db.onversionchange = () => {
            db.close();
            forgetDb();
          };
          resolve(db);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    // Öffnen gescheitert: nicht für die ganze Lebensdauer der Seite merken — der nächste Zugriff versucht es wieder.
    const mine = dbPromise;
    void mine.then((db) => {
      if (!db && dbPromise === mine) dbPromise = null;
    });
  }
  return dbPromise;
}

function forgetDb(): void {
  dbPromise = null;
}

/** Eine Transaktion; `fn` stellt die Anfragen, das Ergebnis der letzten Anfrage kommt zurück. Alles oder nichts. */
function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        if (!db) return reject(new Error('kein IndexedDB'));
        try {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req ? req.result : undefined);
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Fehler'));
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abgebrochen'));
        } catch (e) {
          // z. B. InvalidStateError: Verbindung wurde geschlossen → nächster Zugriff öffnet neu
          forgetDb();
          reject(e as Error);
        }
      }),
  );
}

const rangeOf = (prefix: string) => IDBKeyRange.bound(prefix, `${prefix}￿`);

/** Mehrere Einträge in EINEM Schritt sichern. true = dauerhaft auf dem Gerät; false = nur im Arbeitsspeicher der Seite. */
async function kvPutMany(recs: Rec[]): Promise<boolean> {
  for (const r of recs) memory.set(r.key, r);
  try {
    await run('readwrite', (s) => {
      for (const r of recs) s.put(r);
    });
    // Dauerhaft gesichert → die Kopie im Arbeitsspeicher wird nicht mehr gebraucht (Fotos sind groß)
    // … aber nur, wenn inzwischen kein neuerer Stand desselben Schlüssels geschrieben wird (der könnte noch scheitern)
    for (const r of recs) if (memory.get(r.key) === r) memory.delete(r.key);
    return true;
  } catch {
    return false;
  }
}

/** true = dauerhaft auf dem Gerät gesichert; false = nur im Arbeitsspeicher dieser Seite. */
export const kvPut = (rec: Rec): Promise<boolean> => kvPutMany([rec]);

async function kvDelMany(keys: string[]): Promise<void> {
  for (const k of keys) memory.delete(k);
  await run('readwrite', (s) => {
    for (const k of keys) s.delete(k);
  }).catch(() => undefined);
}

export const kvDel = (key: string): Promise<void> => kvDelMany([key]);

/** Ein Eintrag per Schlüssel (der Arbeitsspeicher gewinnt — dort steht nur, was IndexedDB nicht annehmen konnte). */
export async function kvGet<T extends Rec = Rec>(key: string): Promise<T | null> {
  const mem = memory.get(key);
  if (mem) return mem as T;
  const v = await run<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>).catch(() => undefined);
  return v ?? null;
}

/** Alle Einträge, deren Schlüssel mit `prefix` beginnt — nur diese werden gelesen. */
export async function kvList<T extends Rec = Rec>(prefix: string): Promise<T[]> {
  const fromDb = await run<T[]>('readonly', (s) => s.getAll(rangeOf(prefix)) as IDBRequest<T[]>).catch(() => undefined);
  const map = new Map<string, T>((fromDb ?? []).map((r) => [r.key, r]));
  for (const [k, v] of memory) if (k.startsWith(prefix)) map.set(k, v as T);
  return [...map.values()];
}

/** Nur die Schlüssel (ohne Inhalte, also ohne Fotos) — zum Zählen und für Markierungen. */
export async function kvKeys(prefix: string): Promise<string[]> {
  const fromDb = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys(rangeOf(prefix))).catch(() => undefined);
  const keys = new Set<string>((fromDb ?? []).map(String));
  for (const k of memory.keys()) if (k.startsWith(prefix)) keys.add(k);
  return [...keys];
}

// ---- Einträge mit getrennt gespeicherten Fotos ----------------------------------------------------------------------

const photosKey = (key: string) => `fotos:${key}`;

/**
 * Eintrag sichern. Enthält er `photos`, werden die Fotos im selben Schritt in ihren eigenen Eintrag geschrieben (alles
 * oder nichts) — der Haupteintrag trägt dann nur noch die Anzahl. Ohne `photos` bleibt der Foto-Eintrag unberührt
 * (z. B. Wetter nachgetragen, Ablehnung vermerkt).
 */
export async function putWithPhotos<T extends WithPhotos & { kind: string }>(rec: T): Promise<boolean> {
  const { photos, ...rest } = rec;
  if (!photos) return kvPutMany([rest as unknown as Rec]);
  const main = { ...rest, photoCount: photos.length } as unknown as Rec;
  return kvPutMany([main, { key: photosKey(rec.key), kind: 'photos', userId: rec.userId, photos }]);
}

/** Eintrag samt Fotos löschen (ein Schritt). */
export const delWithPhotos = (key: string): Promise<void> => kvDelMany([key, photosKey(key)]);

/** Fotos eines Eintrags laden (eingebettet bei älteren Einträgen, sonst aus dem eigenen Foto-Eintrag). */
export async function photosOf(rec: WithPhotos): Promise<string[]> {
  if (rec.photos) return rec.photos;
  return (await kvGet<PhotoRec>(photosKey(rec.key)))?.photos ?? [];
}

/** Anzahl Fotos ohne sie zu laden. */
export const photoCountOf = (rec: WithPhotos): number => rec.photos?.length ?? rec.photoCount ?? 0;

/** Dasselbe ohne die eingebetteten Fotos — NUR verwenden, wenn der Foto-Eintrag sicher schon geschrieben ist. */
export function withoutPhotos<T extends WithPhotos>(rec: T): T {
  if (!rec.photos) return rec;
  const { photos, ...rest } = rec;
  return { ...rest, photoCount: photos.length } as T;
}

// ---- Entwürfe und wartende Einsätze -------------------------------------------------------------------------------

export const draftKey = (userId: string, propertyId: string) => `draft:${userId}:${propertyId}`;
export const pendingKey = (opId: string) => `pending:${opId}`;

export const saveDraft = (d: Draft) => kvPut(d);
export const deleteDraft = (userId: string, propertyId: string) => kvDel(draftKey(userId, propertyId));
export async function getDraft(userId: string, propertyId: string): Promise<Draft | null> {
  const r = await kvGet(draftKey(userId, propertyId));
  return r && r.kind === 'draft' ? (r as Draft) : null;
}
/** Objekte mit angefangenem Einsatz (nur die Schlüssel werden gelesen, keine Fotos). */
export async function listDraftPropertyIds(userId: string): Promise<string[]> {
  const prefix = draftKey(userId, '');
  return (await kvKeys(prefix)).map((k) => k.slice(prefix.length));
}

export const savePending = (p: Pending) => putWithPhotos(p);
export const deletePending = (opId: string) => delWithPhotos(pendingKey(opId));
/** Wartende Einsätze OHNE Fotos (die lädt erst das Senden, siehe photosOf). */
export async function listPending(userId: string): Promise<Pending[]> {
  return (await kvList<Pending>('pending:'))
    .filter((r) => r.kind === 'pending' && r.userId === userId)
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
