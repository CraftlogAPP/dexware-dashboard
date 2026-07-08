// SpielDex-spezifische Anzeige-Helfer (Domänenwissen bleibt im spieldex-Ordner).

import { CHECKLIST, type CheckResult } from './types';

/** Anzahl „defekt"-Antworten einer Checkliste (für Listen-Badges). */
export function checklistDefectCount(checklist: Record<string, CheckResult>): number {
  return Object.values(checklist).filter((r) => r === 'defect').length;
}

/** Kurzfassung: „Alle Punkte in Ordnung (10× OK)" oder „Mängel bei: Fallschutz, …". */
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
 * Jüngste nicht-stornierte Kontrolle je Spielplatz.
 * Erwartet Kontrollen absteigend nach started_at sortiert (so liefern die Queries).
 */
export function lastInspectionByPlayground<
  T extends { playground_id: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    if (!map.has(i.playground_id)) map.set(i.playground_id, i);
  }
  return map;
}

/**
 * Jüngste nicht-stornierte Kontrolle je Spielplatz UND Kontrollart
 * (Key `${playground_id}:${type}`) — für die Fälligkeits-Ampel.
 */
export function lastInspectionByType<
  T extends { playground_id: string; type: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    const key = `${i.playground_id}:${i.type}`;
    if (!map.has(key)) map.set(key, i);
  }
  return map;
}

/** Schnelle Namens-Auflösung playground_id → Name für Tabellen. */
export function playgroundNameMap(
  pgs: { id: string; name: string }[],
): Map<string, string> {
  return new Map(pgs.map((p) => [p.id, p.name]));
}

/** Namens-Auflösung equipment_id → Gerätename (Mangel-Ort). */
export function equipmentNameMap(
  eq: { id: string; name: string }[],
): Map<string, string> {
  return new Map(eq.map((e) => [e.id, e.name]));
}
