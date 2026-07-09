// Geteilte Helfer für die intervallbasierten Fälligkeits-Adapter
// (LeiterDex / RegalDex / SpielDex — jeweils „letzte Prüfung + Intervall je Objekt").

import type { DueItem, DueResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Wirft den ersten vorhandenen PostgREST-Fehler → allSettled überspringt die App still. */
export function throwOnError(...errors: ({ message: string } | null)[]): void {
  const err = errors.find((e) => e);
  if (err) throw new Error(err.message);
}

/** Geprüftes Objekt (Leiter/Regal/Spielplatz), optional mit Kontext (z. B. Standortname). */
export interface DueUnit {
  id: string;
  label: string;
  context?: string;
}

/** Schmale Prüf-Metazeile — nur die Spalten für die Fälligkeit. */
export interface InspMetaRow {
  unitId: string;
  type: string;
  startedAt: string;
  canceled: boolean;
}

/**
 * Baut die fälligen Punkte: je Objekt und Prüfart überfällig, wenn die jüngste
 * nicht-stornierte Prüfung älter als das Intervall ist (oder nie stattfand).
 * Sortierung: am längsten überfällig zuerst (nie geprüft ganz oben).
 */
export function buildIntervalDue(
  units: DueUnit[],
  inspections: InspMetaRow[],
  intervalDays: Record<string, number>,
  shortLabels: Record<string, string>,
  route: string,
): DueResult {
  const now = Date.now();
  const lastByKey = new Map<string, string>(); // `${unitId}:${type}` -> jüngstes startedAt
  for (const i of inspections) {
    if (i.canceled) continue;
    const key = `${i.unitId}:${i.type}`;
    if (!lastByKey.has(key)) lastByKey.set(key, i.startedAt);
  }

  const scored: (DueItem & { sort: number })[] = [];
  for (const u of units) {
    for (const type of Object.keys(intervalDays)) {
      const last = lastByKey.get(`${u.id}:${type}`);
      const ageDays = last ? (now - new Date(last).getTime()) / DAY_MS : Infinity;
      if (ageDays > intervalDays[type]) {
        const state = last ? 'überfällig' : 'noch nie geprüft';
        scored.push({
          id: `${u.id}:${type}`,
          label: u.label,
          sublabel: `${u.context ? `${u.context} — ` : ''}${shortLabels[type]} ${state}`,
          route,
          sort: last ? ageDays - intervalDays[type] : Number.MAX_SAFE_INTEGER,
        });
      }
    }
  }
  scored.sort((a, b) => b.sort - a.sort);
  const items = scored.map(({ sort: _sort, ...item }) => item);
  return { count: items.length, items };
}
