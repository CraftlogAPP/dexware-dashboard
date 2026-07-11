// GerüstDex-spezifische Anzeige-Helfer (Domänenwissen bleibt im geruestdex-Ordner).

import { CHECKLIST, type CheckResult } from './types';

/** Kurzfassung: „Alle Punkte in Ordnung (12× OK)" oder „Mängel bei: Verankerung, …". */
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
 * Jüngste nicht-stornierte Prüfung je Baustelle.
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
 * Jüngste nicht-stornierte Prüfung je BAUSTELLE und Prüfart
 * (Key `${site_id}:${type}`) — für die Fälligkeits-Ampel. Anders als bei
 * FeuerDex hängt die Prüfung an der Baustelle, nicht am einzelnen Gerüst.
 */
export function lastInspectionByType<
  T extends { site_id: string; type: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    const key = `${i.site_id}:${i.type}`;
    if (!map.has(key)) map.set(key, i);
  }
  return map;
}

/** Schnelle Namens-Auflösung site_id → Name für Tabellen. */
export function siteNameMap(sites: { id: string; name: string }[]): Map<string, string> {
  return new Map(sites.map((s) => [s.id, s.name]));
}

/** Namens-Auflösung scaffold_id → Gerüst-Name (Mangel-Ort). */
export function scaffoldNameMap(
  scaffolds: { id: string; name: string }[],
): Map<string, string> {
  return new Map(scaffolds.map((sc) => [sc.id, sc.name]));
}

/** Klassen-Label fürs Inventar (z. B. „LK 4 (3,00 kN/m²) · W09" nach EN 12811-1). */
export function classLabel(loadClass: string | null, widthClass: string | null): string {
  const parts: string[] = [];
  if (loadClass) parts.push(`LK ${loadClass}`);
  if (widthClass) parts.push(widthClass);
  return parts.length ? parts.join(' · ') : '—';
}

/** Aufbau-Label fürs Inventar (z. B. „05.07.2026 · Gerüstbau Muster GmbH"). */
export function erectedLabel(erectedAt: string | null, erectedBy: string | null): string {
  const parts: string[] = [];
  if (erectedAt) parts.push(erectedAt);
  if (erectedBy) parts.push(erectedBy);
  return parts.length ? parts.join(' · ') : '—';
}
