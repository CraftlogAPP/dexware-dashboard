// LeiterDex-spezifische Anzeige-Helfer (Domänenwissen bleibt im leiterdex-Ordner).

import { CHECKLIST, type CheckResult } from './types';

/** Kurzfassung: „Alle Punkte in Ordnung (12× OK)" oder „Mängel bei: Holme, …". */
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
 * Jüngste nicht-stornierte Prüfung je Standort.
 * Erwartet Prüfungen absteigend nach started_at sortiert (so liefern die Queries).
 */
export function lastInspectionBySite<
  T extends { site_id: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    if (!map.has(i.site_id)) map.set(i.site_id, i);
  }
  return map;
}

/**
 * Jüngste nicht-stornierte Prüfung je LEITER (Fälligkeit hängt am Gerät, nicht
 * am Standort — Prüfung ist je Leiter dokumentiert).
 */
export function lastInspectionByLadder<
  T extends { ladder_id: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    if (!map.has(i.ladder_id)) map.set(i.ladder_id, i);
  }
  return map;
}

/**
 * Jüngste nicht-stornierte Prüfung je Leiter UND Prüfart
 * (Key `${ladder_id}:${type}`) — für die Fälligkeits-Ampel.
 */
export function lastInspectionByType<
  T extends { ladder_id: string; type: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    const key = `${i.ladder_id}:${i.type}`;
    if (!map.has(key)) map.set(key, i);
  }
  return map;
}

/** Schnelle Namens-Auflösung site_id → Name für Tabellen. */
export function siteNameMap(sites: { id: string; name: string }[]): Map<string, string> {
  return new Map(sites.map((s) => [s.id, s.name]));
}

/** Namens-Auflösung ladder_id → Leiter-Name (Prüf-/Mangel-Ort). */
export function ladderNameMap(
  ladders: { id: string; name: string }[],
): Map<string, string> {
  return new Map(ladders.map((l) => [l.id, l.name]));
}

/** Bauart-/Werkstoff-Label fürs Inventar (z. B. „Stehleiter · Aluminium"). */
export function ladderTypeLabel(category: string, material: string): string {
  return [category, material].filter(Boolean).join(' · ') || '—';
}

/** Maß-Label fürs Inventar (z. B. „4,0 m · 12 Sprossen"). */
export function dimensionLabel(length: string | null, rungs: string | null): string {
  const parts: string[] = [];
  if (length) parts.push(`${length} m`);
  if (rungs) parts.push(`${rungs} Sprossen`);
  return parts.length ? parts.join(' · ') : '—';
}
