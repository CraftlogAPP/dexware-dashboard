// RegalDex-spezifische Anzeige-Helfer (Domänenwissen bleibt im regaldex-Ordner).

import { CHECKLIST, type CheckResult } from './types';

/** Kurzfassung: „Alle Punkte in Ordnung (12× OK)" oder „Mängel bei: Traversen, …". */
export function checklistSummary(checklist: Record<string, CheckResult>): string {
  const defectLabels = CHECKLIST.filter((c) => checklist[c.id] === 'defect').map(
    (c) => c.label,
  );
  if (defectLabels.length === 0) {
    const okCount = CHECKLIST.filter((c) => (checklist[c.id] ?? 'ok') === 'ok').length;
    return `Alle Punkte in Ordnung (${okCount}× OK)`;
  }
  return `Mängel bei: ${defectLabels.join(', ')}`;
}

/**
 * Jüngste nicht-stornierte Inspektion je Lager.
 * Erwartet Inspektionen absteigend nach started_at sortiert (so liefern die Queries).
 */
export function lastInspectionByWarehouse<
  T extends { warehouse_id: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    if (!map.has(i.warehouse_id)) map.set(i.warehouse_id, i);
  }
  return map;
}

/**
 * Jüngste nicht-stornierte Inspektion je Lager UND Inspektionsart
 * (Key `${warehouse_id}:${type}`) — für die Fälligkeits-Ampel.
 */
export function lastInspectionByType<
  T extends { warehouse_id: string; type: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    const key = `${i.warehouse_id}:${i.type}`;
    if (!map.has(key)) map.set(key, i);
  }
  return map;
}

/** Schnelle Namens-Auflösung warehouse_id → Name für Tabellen. */
export function warehouseNameMap(
  whs: { id: string; name: string }[],
): Map<string, string> {
  return new Map(whs.map((w) => [w.id, w.name]));
}

/** Namens-Auflösung rack_id → Regalzeilen-Name (Schadens-Ort). */
export function rackNameMap(racks: { id: string; name: string }[]): Map<string, string> {
  return new Map(racks.map((r) => [r.id, r.name]));
}

/** Fach-/Feldlast-Label fürs Inventar (z. B. „Fach 1.000 kg · Feld 8.000 kg"). */
export function loadLabel(bay: string | null, field: string | null): string {
  const parts: string[] = [];
  if (bay) parts.push(`Fach ${bay} kg`);
  if (field) parts.push(`Feld ${field} kg`);
  return parts.length ? parts.join(' · ') : '—';
}
