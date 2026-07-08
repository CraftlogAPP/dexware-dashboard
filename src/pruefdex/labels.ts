// PrüfDex-spezifische Helfer: Fristen-Ampel + Messwert-Bewertung
// (Logik gespiegelt aus mobile/src/lib/dguv.ts).

import type { Measurements, ProtectionClass } from './types';

export type DueStatus = 'ok' | 'soon' | 'overdue' | 'none';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Fälligkeits-Status für die Ampel-Logik (überfällig / fällig ≤ 1 Monat / ok). */
export function dueStatus(nextDueDate?: string | null): DueStatus {
  if (!nextDueDate) return 'none';
  const today = todayISO();
  if (nextDueDate < today) return 'overdue';
  if (nextDueDate <= addMonthsISO(today, 1)) return 'soon';
  return 'ok';
}

// --- Automatische Grenzwert-Bewertung der Messwerte (schutzklassen-abhängig) ---
// 'ok' = innerhalb Grenzwert · 'fail' = überschritten
// 'na' = für diese Schutzklasse nicht erforderlich · 'none' = kein/ungültiger Wert
export type MeasureEval = 'ok' | 'fail' | 'na' | 'none';

/** Deutschen Dezimalwert ('0,32' / '> 300') tolerant in eine Zahl wandeln. */
export function parseMeasure(raw?: string | null): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Bewertet einen Messwert gegen die Grenzwerte nach VDE 0701-0702. */
export function evaluateMeasurement(
  key: string,
  raw: string | undefined,
  sk: ProtectionClass | null,
): MeasureEval {
  const v = parseMeasure(raw);
  if (v === null) return 'none';
  switch (key) {
    case 'schutzleiterwiderstand':
      if (sk !== 'I') return 'na'; // nur bei Schutzklasse I relevant
      return v <= 0.3 ? 'ok' : 'fail';
    case 'isolationswiderstand': {
      const min = sk === 'II' ? 2.0 : sk === 'III' ? 0.25 : 1.0;
      return v >= min ? 'ok' : 'fail';
    }
    case 'ableitstrom': {
      if (sk === 'III') return 'na';
      const max = sk === 'II' ? 0.5 : 3.5;
      return v <= max ? 'ok' : 'fail';
    }
    default:
      return 'none';
  }
}

/** True, wenn mindestens ein eingetragener Messwert den Grenzwert überschreitet. */
export function anyMeasurementFail(
  meas: Measurements,
  sk: ProtectionClass | null,
): boolean {
  return ['schutzleiterwiderstand', 'isolationswiderstand', 'ableitstrom'].some(
    (key) => evaluateMeasurement(key, meas[key], sk) === 'fail',
  );
}

/**
 * Jüngste Prüfung je Gerät.
 * Erwartet Prüfungen absteigend nach inspected_at sortiert (so liefern die Queries).
 */
export function lastInspectionByDevice<T extends { device_id: string }>(
  inspections: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (!map.has(i.device_id)) map.set(i.device_id, i);
  }
  return map;
}

/** Schnelle Namens-Auflösung id → Name für Tabellen. */
export function nameMap(rows: { id: string; name: string }[]): Map<string, string> {
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Schutzklasse-Label (z. B. „SK I"). */
export function skLabel(sk: string | null): string {
  return sk ? `SK ${sk}` : '—';
}
