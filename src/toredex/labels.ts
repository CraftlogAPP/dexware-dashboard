// ToreDex-spezifische Anzeige-Helfer (Domänenwissen bleibt im toredex-Ordner).

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
 * Jüngste nicht-stornierte Prüfung je Objekt.
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
 * Jüngste nicht-stornierte Prüfung je TOR (Fälligkeit hängt am Tor,
 * nicht am Objekt — Prüfung ist je Tor dokumentiert).
 */
export function lastInspectionByGate<
  T extends { gate_id: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    if (!map.has(i.gate_id)) map.set(i.gate_id, i);
  }
  return map;
}

/**
 * Jüngste nicht-stornierte Prüfung je Tor UND Prüfart
 * (Key `${gate_id}:${type}`) — für die Fälligkeits-Ampel.
 */
export function lastInspectionByType<
  T extends { gate_id: string; type: string; canceled: boolean },
>(inspections: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const i of inspections) {
    if (i.canceled) continue;
    const key = `${i.gate_id}:${i.type}`;
    if (!map.has(key)) map.set(key, i);
  }
  return map;
}

/** Schnelle Namens-Auflösung site_id → Name für Tabellen. */
export function siteNameMap(sites: { id: string; name: string }[]): Map<string, string> {
  return new Map(sites.map((s) => [s.id, s.name]));
}

/** Namens-Auflösung gate_id → Tor-Name (Prüf-/Mangel-Ort). */
export function gateNameMap(
  gates: { id: string; name: string }[],
): Map<string, string> {
  return new Map(gates.map((e) => [e.id, e.name]));
}

/** Torart-/Antriebs-Label fürs Inventar (z. B. „Sectionaltor · Kraftbetätigt"). */
export function gateTypeLabel(category: string, driveType: string): string {
  return [category, driveType].filter(Boolean).join(' · ') || '—';
}

/** Bau-Label fürs Inventar (z. B. „Baujahr 2015 · 4 × 4,5 m"). */
export function buildLabel(buildYear: string | null, dimensions: string | null): string {
  const parts: string[] = [];
  if (buildYear) parts.push(`Baujahr ${buildYear}`);
  if (dimensions) parts.push(`${dimensions} m`);
  return parts.length ? parts.join(' · ') : '—';
}
