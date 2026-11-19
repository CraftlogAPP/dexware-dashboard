// Die Zeilen, die „Vor Ort“ in die Datenbank schreibt — EXAKT wie die Apps (mobile/src/data/supabaseRepository.ts →
// addInspection/addDefect): gleiche Spalten, gleiche Bedeutung. Bewusst ohne Abhängigkeiten (nur Typen), damit der
// Schema-Test (tests/pruefen-vor-ort.test.mjs) genau diese Funktionen gegen das echte Schema prüft.
// Abstand zum Standort, Server-Eingang und Prüfcode ergänzt der Server selbst (Trigger inspection_zz_seal).
// Zwei Familien (cfg.mode): 'unit' — die Prüfung trägt die Einheit (ladder_id …); 'site' — die Prüfung trägt nur den
// Ort (site_id / warehouse_id / playground_id), der Mangel/Schaden zusätzlich die betroffene Einheit oder NULL.
// HebeDex: zusätzlich die Spalte `measurements` (Messwerte des Ablegereife-Rechners als Text, ohne Messung `{}`).

import type { CheckResult, PruefConfig } from './config.ts';

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy?: number;
  at: string;
}

export const STORAGE_PREFIX = 'storage:';

/**
 * Prüfung ohne Fotos — so, wie sie in die Tabelle inspection geht. Der Ort steht unter cfg.cols.siteFk (Standard
 * site_id), die Einheit — nur im Einheiten-Modus — unter cfg.cols.unitFk.
 */
export interface InspectionRow {
  id: string;
  org_id: string;
  type: string;
  started_at: string;
  lat: number | null;
  lng: number | null;
  gps_accuracy_m: number | null;
  gps_at: string | null;
  gps_mocked: null;
  end_lat: number | null;
  end_lng: number | null;
  end_accuracy_m: number | null;
  end_gps_at: string | null;
  end_mocked: null;
  checklist: Record<string, CheckResult>;
  notes: string | null;
  performed_by: string;
  inspector_name: string | null;
  created_at: string;
  /** PNG-Daten-URI; fehlt ganz, wenn nicht unterschrieben wurde (wie die App). */
  signature?: string;
  /** Nur Apps mit Messwerten (HebeDex): Werte wie eingegeben; ohne Messung `{}`. Fehlt bei allen anderen Apps ganz. */
  measurements?: Record<string, string>;
  [siteOrUnitFk: string]: unknown;
}

/** Mangel/Schaden ohne Fotos — so, wie er in die Tabelle defect bzw. damage geht (Ort, Einheit und Sperre unter den Spalten der App). */
export interface DefectRow {
  id: string;
  org_id: string;
  inspection_id: string;
  title: string;
  description: string | null;
  severity: string;
  reported_by: string;
  reporter_name: string | null;
  created_at: string;
  [siteFkUnitFkOrBlocked: string]: unknown;
}

export interface InspectionInput {
  id: string;
  orgId: string;
  userId: string;
  siteId: string;
  /** Einheiten-Modus: die geprüfte Einheit. Im Orts-Modus ohne Bedeutung (weglassen). */
  unitId?: string;
  type: string;
  /** Zeitpunkt des ERSTEN Speicher-Versuchs — Teil des Nachweises, bleibt bei Wiederholungen gleich. */
  at: string;
  /** Beginn-Stempel (beste Position der ersten 20 s) oder null = kein GPS. */
  start: GpsFix | null;
  /** End-Stempel (letzte Position beim Speichern) oder null. */
  end: GpsFix | null;
  checklist: Record<string, CheckResult>;
  notes: string;
  inspectorName: string;
  qualification: string;
  signature: string;
  /**
   * Nur Apps mit Messwerten (HebeDex): die ausgefüllten Felder des Rechners, ohne Messung `{}`.
   * Weglassen (undefined) = die Tabelle hat keine Spalte measurements.
   */
  measurements?: Record<string, string>;
}

export interface DefectInput {
  id: string;
  orgId: string;
  userId: string;
  siteId: string;
  /** Betroffene Einheit. Im Orts-Modus darf sie fehlen (null = „Lager/Baustelle/Fläche allgemein“). */
  unitId: string | null;
  inspectionId: string;
  at: string;
  title: string;
  description: string;
  severity: string;
  blocked: boolean;
  inspectorName: string;
}

/** „Name (Qualifikation)“ bzw. nur der Name; leer → null. Wie mobile/src/lib/qualification.ts. */
export function inspectorWithQualification(name: string, qualification: string): string | null {
  const n = name.trim();
  const q = qualification.trim();
  if (!n) return null;
  return q ? `${n} (${q})` : n;
}

type Cols = Pick<PruefConfig, 'cols'> & Partial<Pick<PruefConfig, 'mode'>>;

const siteFk = (cfg: Cols) => cfg.cols.siteFk ?? 'site_id';

export function buildInspectionRow(cfg: Cols, i: InspectionInput): InspectionRow {
  const row: InspectionRow = {
    id: i.id,
    org_id: i.orgId,
    [siteFk(cfg)]: i.siteId,
    // Orts-Modus: die Tabelle inspection hat keine Einheiten-Spalte
    ...(cfg.mode === 'site' ? {} : { [cfg.cols.unitFk]: i.unitId }),
    type: i.type,
    started_at: i.at,
    lat: i.start?.lat ?? null,
    lng: i.start?.lng ?? null,
    gps_accuracy_m: i.start?.accuracy ?? null,
    gps_at: i.start?.at ?? null,
    gps_mocked: null, // der Browser meldet kein Fake-GPS
    end_lat: i.end?.lat ?? null,
    end_lng: i.end?.lng ?? null,
    end_accuracy_m: i.end?.accuracy ?? null,
    end_gps_at: i.end?.at ?? null,
    end_mocked: null,
    checklist: i.checklist,
    notes: i.notes.trim() || null,
    performed_by: i.userId,
    inspector_name: inspectorWithQualification(i.inspectorName, i.qualification),
    created_at: i.at,
  };
  if (i.signature) row.signature = i.signature;
  if (i.measurements !== undefined) row.measurements = i.measurements;
  return row;
}

export function buildDefectRow(cfg: Cols, d: DefectInput): DefectRow {
  return {
    id: d.id,
    org_id: d.orgId,
    [siteFk(cfg)]: d.siteId,
    inspection_id: d.inspectionId,
    [cfg.cols.unitFk]: d.unitId ?? null,
    title: d.title.trim(),
    description: d.description.trim() || null,
    severity: d.severity,
    [cfg.cols.blocked]: d.blocked,
    reported_by: d.userId,
    reporter_name: d.inspectorName.trim() || null,
    created_at: d.at,
  };
}

/**
 * Messwerte für die Spalte measurements — wie die App (InspectionScreen → doSave): alle ausgefüllten Felder als Text;
 * ist keines der „gemessen“-Felder ausgefüllt (nur Vorbelegung wie Nenndicke oder Seilart), wird `{}` gespeichert.
 */
export function measurementsForRow(values: Record<string, string>, measuredKeys: readonly string[]): Record<string, string> {
  const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => String(v ?? '').trim() !== ''));
  return measuredKeys.some((k) => !!filled[k]) ? filled : {};
}

/**
 * Pfad eines Fotos im privaten Bucket „photos“: <org>/<ordner>/<id>/<n>.jpg (Ordner wie die App).
 * Fester Name je Foto: Ein wiederholter Versuch trifft dieselbe Datei („gibt es schon“ = Erfolg) — keine Waisen.
 */
export function photoPath(orgId: string, folder: string, id: string, n: number): string {
  return `${orgId}/${folder}/${id}/${n}.jpg`;
}
