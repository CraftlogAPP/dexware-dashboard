// FeuerDex-spezifische Anzeige-Helfer (Domänenwissen bleibt im feuerdex-Ordner).

import { CHECKLIST, type CheckResult } from './types';

/** Kurzfassung: „Alle Punkte in Ordnung (12× OK)" oder „Mängel bei: Plombe, …". */
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
 * Jüngste nicht-stornierte Prüfung je FEUERLÖSCHER (Fälligkeit hängt am Gerät,
 * nicht am Standort — Prüfung ist je Löscher dokumentiert).
 */
export function lastInspectionByExtinguisher<
  T extends { extinguisher_id: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    if (!map.has(i.extinguisher_id)) map.set(i.extinguisher_id, i);
  }
  return map;
}

/**
 * Jüngste nicht-stornierte Prüfung je Löscher UND Prüfart
 * (Key `${extinguisher_id}:${type}`) — für die Fälligkeits-Ampel.
 */
export function lastInspectionByType<
  T extends { extinguisher_id: string; type: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    const key = `${i.extinguisher_id}:${i.type}`;
    if (!map.has(key)) map.set(key, i);
  }
  return map;
}

/** Schnelle Namens-Auflösung site_id → Name für Tabellen. */
export function siteNameMap(sites: { id: string; name: string }[]): Map<string, string> {
  return new Map(sites.map((s) => [s.id, s.name]));
}

/** Namens-Auflösung extinguisher_id → Löscher-Name (Prüf-/Mangel-Ort). */
export function extinguisherNameMap(
  extinguishers: { id: string; name: string }[],
): Map<string, string> {
  return new Map(extinguishers.map((e) => [e.id, e.name]));
}

/** Löschmittel-/Bauart-Label fürs Inventar (z. B. „Pulver (ABC) · Dauerdrucklöscher"). */
export function extinguisherTypeLabel(category: string, buildType: string): string {
  return [category, buildType].filter(Boolean).join(' · ') || '—';
}

/** Füllmengen-Label fürs Inventar (z. B. „6 kg · 10 LE"). */
export function fillingLabel(fillingKg: string | null, ratingLE: string | null): string {
  const parts: string[] = [];
  if (fillingKg) parts.push(`${fillingKg} kg/l`);
  if (ratingLE) parts.push(`${ratingLE} LE`);
  return parts.length ? parts.join(' · ') : '—';
}
