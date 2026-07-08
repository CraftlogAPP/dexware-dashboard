// SchutzDex-spezifische Anzeige-Helfer.

import type { Assignment } from './types';

/** Schnelle Namens-Auflösung id → Name für Tabellen. */
export function nameMap(rows: { id: string; name: string }[]): Map<string, string> {
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Titel-Auflösung briefing_id → Titel. */
export function briefingTitleMap(
  rows: { id: string; titel: string }[],
): Map<string, string> {
  return new Map(rows.map((r) => [r.id, r.titel]));
}

/**
 * Effektiver Zuweisungs-Status: `ueberfaellig` wird von der App nicht immer
 * nachgezogen — offene Zuweisungen mit überschrittenem faellig_am zählen
 * im Dashboard ebenfalls als überfällig.
 */
export function isOverdue(a: Assignment): boolean {
  if (a.status === 'ueberfaellig') return true;
  if (a.status !== 'offen' || !a.faellig_am) return false;
  return a.faellig_am < new Date().toISOString().slice(0, 10);
}
