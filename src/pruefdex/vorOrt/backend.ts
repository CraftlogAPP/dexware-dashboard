// Datenzugriff von „Vor Ort“ (PrüfDex) hinter einer Schnittstelle — Supabase (echter Betrieb) oder Beispieldaten
// (demo.tsx, nur Dev-Server). Geschrieben wird wie in der App: gleiche Spalten (rows.ts), Fotos im privaten Bucket
// „photos“, in der Datenbank steht „storage:<pfad>“. Die Frist am Gerät schreibt der Server selbst fort.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isNetworkError } from '../../pruefen/backend';
import { fetchCustomers, fetchDevices, fetchInspectionMeta } from '../api';
import { inspectionGate, type Gate } from '../gate';
import type { Customer, Device } from '../types';
import { GPS_PROOF_KEYS, type InspectionRow } from './rows';

export interface PdData {
  customers: Customer[];
  /** Geräte in Betrieb (ohne ausgesonderte), ohne Fotos */
  devices: Device[];
  /** IDs der Geräte, deren jüngste gültige Prüfung „nicht bestanden“ ist (Mangel-Markierung wie in der App) */
  failed: string[];
}

export interface InsertOutcome {
  /** Die Datenbank kannte die Spalte für die Unterschrift nicht → ohne gespeichert. */
  signatureDropped: boolean;
  /** Die Datenbank kannte die GPS-Spalten nicht → ohne gespeichert (wie die App). */
  gpsDropped: boolean;
}

export interface PdBackend {
  load(): Promise<PdData>;
  /** Foto hochladen; „gibt es schon“ (Wiederholung nach Abbruch) zählt als Erfolg. */
  uploadPhoto(path: string, blob: Blob): Promise<void>;
  /** Prüfung anlegen; „ID gibt es schon“ (Wiederholung) zählt als Erfolg. */
  insertInspection(row: InspectionRow, photoUrls: string[]): Promise<InsertOutcome>;
  /** Gratis-Grenze der Prüfungen (5 ohne Pro). Unklar → letzter sicherer Stand, sonst ProUnklarError („gleich nochmal“). */
  inspectionGate(waiting: number): Promise<Gate>;
}

export const PHOTO_BUCKET = 'photos';

type DbError = { code?: string; message?: string; details?: string };

const missingColumn = (e: DbError) =>
  e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(e.message ?? '');

/** 23505 am Primärschlüssel = Prüfung schon da (Wiederholung nach Abbruch). */
const alreadyThere = (e: DbError) => e.code === '23505' && (/_pkey\b/.test(e.message ?? '') || /^Key \(id\)=/.test(e.details ?? ''));

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout (Zeitüberschreitung)')), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function supabasePdBackend(sb: SupabaseClient): PdBackend {
  return {
    async load() {
      const [customers, devices, meta] = await Promise.all([fetchCustomers(sb), fetchDevices(sb), fetchInspectionMeta(sb)]);
      // jüngste gültige Prüfung je Gerät (inspected_at ist ein reines Datum; bei gleichem Tag gilt die zuerst gelieferte)
      const latest = new Map<string, { at: string; result: string }>();
      for (const m of meta) {
        const cur = latest.get(m.device_id);
        if (!cur || m.inspected_at > cur.at) latest.set(m.device_id, { at: m.inspected_at, result: m.result });
      }
      const failed = [...latest].filter(([, v]) => v.result === 'failed').map(([id]) => id);
      return { customers, devices, failed };
    },

    async uploadPhoto(path, blob) {
      const { error } = await withTimeout(sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false }), 60000);
      if (error && !/exists|duplicate/i.test(error.message ?? '')) throw error;
    },

    async insertInspection(row, photoUrls) {
      const full: Record<string, unknown> = { ...row, photo_urls: photoUrls };
      const out: InsertOutcome = { signatureDropped: false, gpsDropped: false };
      let error: DbError | null = null;
      // Höchstens drei Versuche: vollständig → ohne die Spalten, die der Datenbank fehlen (GPS-Prüfnachweis bzw.
      // Unterschrift) → ohne beides. Nur bei „Spalte fehlt“ — jeder andere Fehler wird gemeldet.
      for (let attempt = 0; attempt < 3; attempt++) {
        ({ error } = (await withTimeout(sb.from('inspection').insert(full), 30000)) as { error: DbError | null });
        if (!error || !missingColumn(error)) break;
        const msg = error.message ?? '';
        const hasGps = GPS_PROOF_KEYS.some((k) => k in full);
        if ('signature' in full && (/signature/i.test(msg) || !hasGps)) {
          delete full.signature;
          out.signatureDropped = true;
        } else if (hasGps) {
          for (const k of GPS_PROOF_KEYS) delete full[k];
          out.gpsDropped = true;
        } else {
          break;
        }
      }
      if (error && !alreadyThere(error)) throw error;
      return out;
    },

    inspectionGate: (waiting) => inspectionGate(sb, waiting),
  };
}

// --- Laden; der letzte Stand wird je Konto gemerkt (Keller, Halle: Erfassen geht auch ohne Netz) -----------------

const cacheKey = (userId: string) => `dexware-pruefdex-vorort:${userId}`;

export interface PdState extends PdData {
  /** true = ohne Netz aus dem Gerätespeicher geladen (Stand vom letzten Laden) */
  offline: boolean;
}

export async function loadPd(be: PdBackend, userId: string): Promise<PdState> {
  try {
    const data = await be.load();
    try {
      localStorage.setItem(cacheKey(userId), JSON.stringify(data));
    } catch {
      /* nur Komfort */
    }
    return { ...data, offline: false };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    let cached: PdData | null = null;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey(userId)) ?? 'null') as PdData | null;
    } catch {
      cached = null;
    }
    if (!cached?.devices) throw new Error('Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.');
    return { customers: cached.customers ?? [], devices: cached.devices, failed: cached.failed ?? [], offline: true };
  }
}
