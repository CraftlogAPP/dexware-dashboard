// Tour-Reihenfolge der Objekte (property.tour_pos, teamweit gleich — NACHTRAG-GRATIS-NACH-ABLAUF-2026-11-25.sql).
// Sortierung überall wie in der App: tour_pos aufsteigend, Objekte ohne Platz zuletzt, dann Name.
// Fehlt die Spalte noch (Nachtrag nicht live), ist tour_pos undefined → reine Namens-Sortierung wie bisher.
//
// Bewusst ohne Laufzeit-Imports: Node-Tests laden die Datei direkt (tests/gratis-ablauf.test.mjs).

export interface MitTour {
  name: string;
  tour_pos?: number | null;
}

const pos = (p: MitTour): number | null => (typeof p.tour_pos === 'number' && Number.isFinite(p.tour_pos) ? p.tour_pos : null);

/** Vergleich für sort(): tour_pos aufsteigend (leere zuletzt), dann Name (deutsch). */
export function nachTour(a: MitTour, b: MitTour): number {
  const pa = pos(a);
  const pb = pos(b);
  if (pa !== pb) {
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa - pb;
  }
  return a.name.localeCompare(b.name, 'de');
}

/** Aktive zuerst, darin nach Tour — für Objektlisten mit pausierten Objekten. */
export function aktivNachTour(a: MitTour & { active: boolean }, b: MitTour & { active: boolean }): number {
  return Number(b.active) - Number(a.active) || nachTour(a, b);
}

/** Kennt die Datenbank die Spalte schon? (select('*') liefert sie dann in jeder Zeile mit, auch als null) */
export function hatTourSpalte(rows: readonly object[]): boolean {
  return rows.length > 0 && 'tour_pos' in rows[0];
}

/**
 * Neue Plätze nach dem Umsortieren: 1, 2, 3 … in der gezeigten Reihenfolge. Liefert nur die Objekte, deren Platz sich
 * ändert (so wenige Schreibvorgänge wie möglich).
 */
export function neuePlaetze<T extends { id: string; tour_pos?: number | null }>(reihe: readonly T[]): { id: string; tour_pos: number }[] {
  const out: { id: string; tour_pos: number }[] = [];
  reihe.forEach((p, i) => {
    if (p.tour_pos !== i + 1) out.push({ id: p.id, tour_pos: i + 1 });
  });
  return out;
}

/** Ein Element um eins nach oben (-1) oder unten (+1) verschieben — neue Liste. */
export function verschiebe<T>(liste: readonly T[], i: number, richtung: -1 | 1): T[] {
  const j = i + richtung;
  if (i < 0 || i >= liste.length || j < 0 || j >= liste.length) return [...liste];
  const neu = [...liste];
  [neu[i], neu[j]] = [neu[j], neu[i]];
  return neu;
}
