// HebeDex-spezifische Anzeige-Helfer (Domänenwissen bleibt im hebedex-Ordner).

import { checklistFor, checkLabel, type CheckResult } from './types';

/**
 * Kurzfassung: „Alle Punkte in Ordnung (6× OK)" oder „Mängel bei: Tragende Nähte, …".
 * Mit Teil-Typ zählt die Typ-Checkliste, sonst die gespeicherten Schlüssel.
 */
export function checklistSummary(checklist: Record<string, CheckResult>, kind?: string | null): string {
  const list = checklist ?? {};
  const keys = kind ? checklistFor(kind).map((c) => c.id) : Object.keys(list);
  const defectLabels = Object.entries(list)
    .filter(([, v]) => v === 'defect')
    .map(([k]) => checkLabel(k));
  if (defectLabels.length === 0) {
    if (keys.length === 0) return 'Ohne Mängel';
    const okCount = keys.filter((k) => (list[k] ?? 'ok') === 'ok').length;
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
 * Jüngste nicht-stornierte Prüfung je TEIL (Fälligkeit hängt am Teil,
 * nicht am Standort — Prüfung ist je Teil dokumentiert).
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
 * Jüngste nicht-stornierte Prüfung je Teil UND Prüfart
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

/** Namens-Auflösung item_id → Teil-Nummer (Prüf-/Mangel-Bezug). */
export function itemNameMap(
  items: { id: string; name: string }[],
): Map<string, string> {
  return new Map(items.map((e) => [e.id, e.name]));
}

/** Stammdaten-Label (z. B. „Dolezych · Nr. 12345 · Bj. 2022"). */
export function itemMetaLabel(it: {
  manufacturer: string | null;
  serial_no: string | null;
  build_year: string | null;
}): string {
  const parts: string[] = [];
  if (it.manufacturer) parts.push(it.manufacturer);
  if (it.serial_no) parts.push(`Nr. ${it.serial_no}`);
  if (it.build_year) parts.push(`Bj. ${it.build_year}`);
  return parts.length ? parts.join(' · ') : '—';
}
