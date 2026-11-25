// Datenzugriff von „Vor Ort“ hinter einer Schnittstelle — Supabase (echter Betrieb) oder Beispieldaten
// (demo.tsx, nur Dev-Server). Geschrieben wird wie in den Apps: gleiche Spalten (rows.ts), Fotos im privaten
// Bucket „photos“, in der Datenbank steht „storage:<pfad>“.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllOf, fetchLatestWindow } from '../lib/completeQueries';
import { dueFkOf, isSiteMode, needsUnitRow, siteFkOf, type PruefConfig } from './config';
import type { InspMeta } from './due';
import { fetchOrgPro } from './pro';
import type { DefectRow, InspectionRow } from './rows';

export interface Site {
  id: string;
  name: string;
  address: string;
  active: boolean;
}

export interface Unit {
  id: string;
  siteId: string;
  name: string;
  /** Unterzeile, z. B. „Stehleiter · Aluminium“ */
  info: string;
  retired: boolean;
  /** Stammdaten-Zeile (Spalten aus cfg.unitSelect) — nur bei Apps, die sie brauchen (Warnung, eigene Checkliste, Messwerte). */
  row?: Record<string, unknown>;
}

export interface OpenDefect {
  id: string;
  /** Ort des Mangels */
  siteId: string;
  /** Betroffene Einheit — im Orts-Modus null, wenn der Mangel den Ort allgemein betrifft. */
  unitId: string | null;
  severity: string;
  /** Sperr-Mangel: die Einheit darf nicht benutzt werden, bis er behoben ist. */
  blocked: boolean;
}

export interface PruefBackend {
  listSites(): Promise<Site[]>;
  /** Alle Einheiten des Betriebs (ohne Fotos), auch außer Betrieb genommene. */
  listUnits(): Promise<Unit[]>;
  /** Schmale Prüf-Daten für die Fälligkeit (jüngste Prüfung je Einheit und Art; im Orts-Modus je Ort — unitId ist dann die ID des Orts). */
  listInspectionMeta(): Promise<InspMeta[]>;
  /** Offene Mängel (für „gesperrt“ und die Zahl offener Mängel). */
  listOpenDefects(): Promise<OpenDefect[]>;
  /** Foto hochladen; „gibt es schon“ (Wiederholung nach Abbruch) zählt als Erfolg. */
  uploadPhoto(path: string, blob: Blob): Promise<void>;
  /**
   * Prüfung anlegen; „ID gibt es schon“ (Wiederholung) zählt als Erfolg.
   * Kennt die Datenbank die Spalte `signature` noch nicht, wird ohne Unterschrift gespeichert (wie die App) —
   * die Antwort sagt das, damit die Oberfläche nichts Falsches behauptet.
   */
  insertInspection(row: InspectionRow, photoUrls: string[]): Promise<{ signatureDropped: boolean }>;
  /** Mangel anlegen; „ID gibt es schon“ (Wiederholung) zählt als Erfolg. */
  insertDefect(row: DefectRow, photoUrls: string[]): Promise<void>;
  /** Pro des Betriebs laut Server — nur Anzeige: unklar → letzter sicherer Stand, sonst true. */
  isPro(): Promise<boolean>;
  /**
   * Nur Apps mit Messwerten (cfg.measure, HebeDex): Messwerte der jüngsten gültigen Prüfung dieser Einheit —
   * daraus belegt das Formular Neumaße, Nenndicke und Seilart vor (wie die App). null = noch keine Prüfung.
   */
  lastMeasurements?(unitId: string): Promise<Record<string, string> | null>;
}

export const PHOTO_BUCKET = 'photos';

const GPS_PROOF_COLS = ['gps_at', 'gps_mocked', 'end_lat', 'end_lng', 'end_accuracy_m', 'end_gps_at', 'end_mocked'] as const;

type DbError = { code?: string; message?: string };

const missingColumn = (e: DbError) =>
  e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(e.message ?? '');

/**
 * Netz weg / Zeitüberschreitung? Dann bleibt die Prüfung auf dem Gerät und wird später gesendet.
 * Erkennt auch die schon übersetzte Meldung der Dashboard-Abfragen (lib/orgApi → „keine Verbindung zum Server“) —
 * sonst griffe der gemerkte Stand bei wackligem Netz nicht (KfzDex, PrüfDex, SchutzDex laden über diese Abfragen).
 */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const err = e as { name?: string; message?: string } | null;
  if (err?.name === 'StorageUnknownError' || err?.name === 'AbortError') return true;
  const m = String(err?.message ?? e ?? '');
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|timeout|zeitüberschreitung|aborted|offline|keine verbindung zum server/i.test(m);
}

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

/** Messwerte aus der Datenbank als Text-Werte (die App speichert Text; Zahlen aus älteren Zeilen werden zu Text). null = keine. */
export function textValues(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (typeof x === 'string') out[k] = x;
    else if (typeof x === 'number' && Number.isFinite(x)) out[k] = String(x);
  }
  return out;
}

/**
 * @param dueIntervalDays Frist der Fälligkeits-Prüfart dieses Betriebs — bestimmt, wie weit die Prüf-Daten zurückreichen.
 */
export function supabasePruefBackend(sb: SupabaseClient, cfg: PruefConfig, dueIntervalDays: number): PruefBackend {
  const { tables, cols } = cfg;
  const siteFk = siteFkOf(cfg);
  // Spalte, an der die Fälligkeit hängt: die Einheit — im Orts-Modus der Ort
  const dueFk = dueFkOf(cfg);
  return {
    async listSites() {
      const { data, error } = await fetchAllOf<Site>(() => sb.from(tables.site).select('id, name, address, active'), [['name']]);
      if (error) throw error;
      return data ?? [];
    },

    async listUnits() {
      const { data, error } = await fetchAllOf<Record<string, unknown>>(() => sb.from(tables.unit).select(cfg.unitSelect), [['name']]);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        siteId: r[siteFk] as string,
        name: r.name as string,
        info: cfg.unitInfo(r),
        retired: r[cols.retired] === true,
        ...(needsUnitRow(cfg) ? { row: r } : {}),
      }));
    },

    async listInspectionMeta() {
      const { data, error } = await fetchLatestWindow<Record<string, unknown>>({
        sb,
        table: tables.inspection,
        cols: `id, ${dueFk}, type, started_at, canceled`,
        dateCol: 'started_at',
        unitCol: dueFk,
        units: { table: isSiteMode(cfg) ? tables.site : tables.unit },
        windowDays: Math.max(dueIntervalDays, cfg.extraDue?.intervalDays ?? 0, 365) + 31,
        types: cfg.kinds.map((k) => k.id),
        canceled: true,
      });
      if (error) throw error;
      return data.map((i) => ({
        unitId: i[dueFk] as string,
        type: i.type as string,
        startedAt: i.started_at as string,
        canceled: i.canceled === true,
      }));
    },

    async listOpenDefects() {
      const { data, error } = await fetchAllOf<Record<string, unknown>>(
        () => sb.from(tables.defect).select(`id, ${siteFk}, ${cols.unitFk}, severity, ${cols.blocked}`).eq('status', 'open'),
        [['created_at', false]],
      );
      if (error) throw error;
      return (data ?? []).map((d) => ({
        id: d.id as string,
        siteId: d[siteFk] as string,
        unitId: (d[cols.unitFk] as string | null) ?? null,
        severity: d.severity as string,
        blocked: d[cols.blocked] === true,
      }));
    },

    async uploadPhoto(path, blob) {
      const { error } = await withTimeout(
        sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false }),
        60000,
      );
      if (error && !/exists|duplicate/i.test(error.message ?? '')) throw error;
    },

    async insertInspection(row, photoUrls) {
      const full: Record<string, unknown> = { ...row, photo_urls: photoUrls };
      let signatureDropped = false;
      let error: DbError | null = null;
      // Höchstens drei Versuche: vollständig → ohne die Spalte, die der Datenbank fehlt (Unterschrift bzw.
      // GPS-Prüfnachweis) → ohne beides. Nur bei „Spalte fehlt“ — jeder andere Fehler wird gemeldet.
      for (let attempt = 0; attempt < 3; attempt++) {
        ({ error } = await withTimeout(sb.from(tables.inspection).insert(full), 30000));
        if (!error || !missingColumn(error)) break;
        const msg = error.message ?? '';
        const gpsNamed = GPS_PROOF_COLS.some((k) => msg.includes(k));
        const hasGps = GPS_PROOF_COLS.some((k) => k in full);
        if ('signature' in full && (/signature/i.test(msg) || !gpsNamed && !hasGps)) {
          delete full.signature;
          signatureDropped = true;
        } else if (hasGps) {
          for (const k of GPS_PROOF_COLS) delete full[k];
        } else {
          break;
        }
      }
      if (error && error.code !== '23505') throw error; // 23505 = ID schon vorhanden (Wiederholung)
      return { signatureDropped };
    },

    async insertDefect(row, photoUrls) {
      const { error } = await withTimeout(sb.from(tables.defect).insert({ ...row, photo_urls: photoUrls }), 30000);
      if (error && error.code !== '23505') throw error;
    },

    // nur Anzeige (Vor Ort legt nichts Zählendes an): letzter sicherer Stand, sonst Pro
    isPro: () => fetchOrgPro(sb, cfg.appId, true),

    ...(cfg.measure
      ? {
          async lastMeasurements(unitId: string) {
            const { data, error } = await withTimeout(
              sb
                .from(tables.inspection)
                .select('measurements')
                .eq(cols.unitFk, unitId)
                .eq('canceled', false)
                .order('started_at', { ascending: false })
                .limit(1),
              15000,
            );
            if (error) throw error;
            return textValues((data as { measurements?: unknown }[] | null)?.[0]?.measurements);
          },
        }
      : {}),
  };
}
