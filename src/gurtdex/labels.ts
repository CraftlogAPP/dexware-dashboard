// GurtDex-spezifische Anzeige-Helfer (Domänenwissen bleibt im gurtdex-Ordner).

import { CHECKLIST, type CheckResult } from './types';

/** Kurzfassung: „Alle Punkte in Ordnung (12× OK)" oder „Mängel bei: Nähte, …". */
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
 * Jüngste nicht-stornierte Prüfung je ARTIKEL (Fälligkeit hängt am PSA-Artikel,
 * nicht am Standort — Prüfung ist je Artikel dokumentiert).
 */
export function lastInspectionByItem<
  T extends { item_id: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    if (!map.has(i.item_id)) map.set(i.item_id, i);
  }
  return map;
}

/**
 * Jüngste nicht-stornierte Prüfung je Artikel UND Prüfart
 * (Key `${item_id}:${type}`) — für die Fälligkeits-Ampel.
 */
export function lastInspectionByType<
  T extends { item_id: string; type: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    const key = `${i.item_id}:${i.type}`;
    if (!map.has(key)) map.set(key, i);
  }
  return map;
}

/** Schnelle Namens-Auflösung site_id → Name für Tabellen. */
export function siteNameMap(sites: { id: string; name: string }[]): Map<string, string> {
  return new Map(sites.map((s) => [s.id, s.name]));
}

/** Namens-Auflösung item_id → Artikel-Name (Prüf-/Mangel-Bezug). */
export function itemNameMap(
  items: { id: string; name: string }[],
): Map<string, string> {
  return new Map(items.map((e) => [e.id, e.name]));
}

/** Artikel-Label fürs Inventar (z. B. „Auffanggurt (EN 361) · Petzl AVAO BOD"). */
export function itemTypeLabel(category: string, manufacturer: string | null, model: string | null): string {
  const maker = [manufacturer, model].filter(Boolean).join(' ');
  return [category, maker].filter(Boolean).join(' · ') || '—';
}

/** Stammdaten-Label (z. B. „Herst. 2023-04 · max. 10 J. · Träger: M. Krause"). */
export function itemMetaLabel(
  manufactureDate: string | null,
  maxLifeYears: string | null,
  wearerName: string | null,
): string {
  const parts: string[] = [];
  if (manufactureDate) parts.push(`Herst. ${manufactureDate}`);
  if (maxLifeYears) parts.push(`max. ${maxLifeYears} J.`);
  if (wearerName) parts.push(`Träger/in: ${wearerName}`);
  return parts.length ? parts.join(' · ') : '—';
}
