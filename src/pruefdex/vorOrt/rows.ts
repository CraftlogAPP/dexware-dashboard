// Die Zeile, die „Vor Ort“ für PrüfDex in die Tabelle inspection schreibt — EXAKT wie die App
// (PruefDex/mobile/src/screens/InspectionScreen.tsx → save und mobile/src/data/supabaseRepository.ts → addInspection):
// gleiche Spalten, gleiche Bedeutung. Bewusst ohne Abhängigkeiten außer dguv.ts, damit der Schema-Test
// (tests/pruefdex-vor-ort.test.mjs) genau diese Funktionen gegen das echte Schema prüft.
// Der Server ergänzt selbst: performed_by (angemeldeter Nutzer), Server-Eingang, Prüfcode — und schreibt die Frist
// des Geräts fort (Trigger inspection_set_device_due; eine neuere Prüfung gewinnt). Von hier wird die Frist am
// Gerät deshalb NICHT zusätzlich gesetzt (wie in der App seit 10.11.).

import { VISUAL_CHECKS, nextDueDate, type Measurements, type Result, type VisualChecks } from './dguv.ts';

/** Gratis-Grenzen wie in der App (mobile/src/lib/entitlement.ts → FREE_LIMITS): 3 Geräte, 5 Prüfungen. */
export const FREE_LIMITS = { devices: 3, inspections: 5 } as const;

export const STORAGE_PREFIX = 'storage:';
/** Ordner der Prüf-Fotos im privaten Bucket „photos“ (wie photoFolder in addInspection). */
export const PHOTO_FOLDER = 'inspection';

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy?: number;
  at: string;
}

/** Prüfung ohne Fotos — so, wie sie in die Tabelle inspection geht (photo_urls kommt beim Senden dazu). */
export interface InspectionRow {
  id: string;
  org_id: string;
  device_id: string;
  /** Tag der Prüfung, YYYY-MM-DD (lokaler Kalendertag) */
  inspected_at: string;
  inspector_name: string;
  visual_checks: VisualChecks;
  measurements: Measurements;
  result: Result;
  next_due_date: string;
  notes: string | null;
  created_at: string;
  /** PNG-Daten-URI; fehlt ganz, wenn nicht unterschrieben wurde (wie die App). */
  signature?: string;
  // GPS-Stempel: alle zehn Spalten oder keine (wie die App — ältere Datenbanken kennen sie nicht)
  lat?: number | null;
  lng?: number | null;
  gps_accuracy_m?: number | null;
  gps_at?: string | null;
  gps_mocked?: null;
  end_lat?: number | null;
  end_lng?: number | null;
  end_accuracy_m?: number | null;
  end_gps_at?: string | null;
  end_mocked?: null;
}

export const GPS_PROOF_KEYS = ['lat', 'lng', 'gps_accuracy_m', 'gps_at', 'gps_mocked', 'end_lat', 'end_lng', 'end_accuracy_m', 'end_gps_at', 'end_mocked'] as const;

/** „Name (Qualifikation)“ bzw. nur der Name; hängt nicht doppelt an. Wie mobile/src/lib/qualification.ts. */
export function inspectorWithQualification(name: string, qualification: string): string {
  const n = name.trim();
  const q = qualification.trim();
  if (!n || !q || n.endsWith(`(${q})`)) return n;
  return `${n} (${q})`;
}

export interface InspectionInput {
  id: string;
  orgId: string;
  deviceId: string;
  /** Prüfintervall des Geräts in Monaten */
  intervalMonths: number;
  /** Tag der Prüfung (heute, lokal) */
  inspectedAt: string;
  /** Zeitpunkt des ERSTEN Speicher-Versuchs (ISO) — bleibt bei Wiederholungen gleich. */
  at: string;
  inspectorName: string;
  qualification: string;
  signature: string;
  visual: VisualChecks;
  measurements: Measurements;
  result: Result;
  notes: string;
  /** Beginn-Stempel (beste Position der ersten 20 s) oder null = kein GPS. */
  start: GpsFix | null;
  /** End-Stempel (letzte Position beim Speichern) oder null. */
  end: GpsFix | null;
}

export function buildInspectionRow(i: InspectionInput): InspectionRow {
  const row: InspectionRow = {
    id: i.id,
    org_id: i.orgId,
    device_id: i.deviceId,
    inspected_at: i.inspectedAt,
    inspector_name: inspectorWithQualification(i.inspectorName, i.qualification),
    // genau die Punkte der Sichtprüfung, jeder mit true/false (Vorbelegung: in Ordnung)
    visual_checks: Object.fromEntries(VISUAL_CHECKS.map((c) => [c.key, i.visual[c.key] !== false])),
    // Messwerte als Text, so wie eingegeben (die App speichert den Zustand der Felder)
    measurements: { ...i.measurements },
    result: i.result,
    // Mangel (nicht bestanden): sofort fällig → Nachprüfung nach Instandsetzung
    next_due_date: nextDueDate(i.result, i.inspectedAt, i.intervalMonths),
    notes: i.notes ?? null,
    created_at: i.at,
  };
  if (i.signature) row.signature = i.signature;
  // GPS-Stempel nur mitschicken, wenn vorhanden
  if (i.start || i.end) {
    row.lat = i.start?.lat ?? null;
    row.lng = i.start?.lng ?? null;
    row.gps_accuracy_m = i.start?.accuracy ?? null;
    row.gps_at = i.start?.at ?? null;
    row.gps_mocked = null; // der Browser meldet kein Fake-GPS
    row.end_lat = i.end?.lat ?? null;
    row.end_lng = i.end?.lng ?? null;
    row.end_accuracy_m = i.end?.accuracy ?? null;
    row.end_gps_at = i.end?.at ?? null;
    row.end_mocked = null;
  }
  return row;
}

/**
 * Pfad eines Fotos im privaten Bucket „photos“: <org>/inspection/<prüf-id>/<n>.jpg (Ordner wie die App).
 * Fester Name je Foto: Ein wiederholter Versuch trifft dieselbe Datei („gibt es schon“ = Erfolg) — keine Waisen.
 */
export function photoPath(orgId: string, inspectionId: string, n: number): string {
  return `${orgId}/${PHOTO_FOLDER}/${inspectionId}/${n}.jpg`;
}

/** Darf noch eine Prüfung bzw. ein Gerät dazu? (Gratis-Regel der App: gezählt < Grenze, sonst nur mit Pro.) */
export function withinFree(kind: keyof typeof FREE_LIMITS, count: number): boolean {
  return count < FREE_LIMITS[kind];
}
