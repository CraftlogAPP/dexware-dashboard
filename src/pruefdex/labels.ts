// PrüfDex-spezifische Helfer: Fristen-Ampel + Messwert-Bewertung
// (Logik gespiegelt aus mobile/src/lib/dguv.ts).

import { addMonthsLocalISO, todayLocalISO } from '../lib/format';

export type DueStatus = 'ok' | 'soon' | 'overdue' | 'none';

const todayISO = todayLocalISO;
const addMonthsISO = addMonthsLocalISO;

/** Fälligkeits-Status für die Ampel-Logik (überfällig / fällig ≤ 1 Monat / ok). */
export function dueStatus(nextDueDate?: string | null): DueStatus {
  if (!nextDueDate) return 'none';
  const today = todayISO();
  if (nextDueDate < today) return 'overdue';
  if (nextDueDate <= addMonthsISO(today, 1)) return 'soon';
  return 'ok';
}

// --- Automatische Grenzwert-Bewertung der Messwerte (schutzklassen-abhängig) ---
// EINE Quelle: vorOrt/dguv.ts — 1:1 aus der App (mobile/src/lib/dguv.ts) und per Test gegen deren Quelltext
// abgesichert (tests/pruefdex-vor-ort.test.mjs). Vorher stand hier eine ältere Kopie: '1.234,5' wurde als 1,234
// gelesen, und ohne Schutzklasse galten still die milden SK-I-Grenzen.
export { anyMeasurementFail, evaluateMeasurement, parseMeasure, schutzleiterLimit, type MeasureEval } from './vorOrt/dguv';

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
