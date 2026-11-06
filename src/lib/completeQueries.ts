// Vollständige Abfragen über die 1.000-Zeilen-Grenze von PostgREST hinweg (siehe fetchAll.ts).
// - fetchAllOf: ganze Tabelle/Liste seitenweise, Sortierung immer mit id als letztem Schlüssel.
// - fetchLatestWindow: Prüf-/Einsatz-Metadaten für Fälligkeit und „letzte Prüfung": alle Einträge
//   im Zeitfenster PLUS der jüngste ältere Eintrag je Einheit (und Prüfart), die im Fenster fehlt.
//   Ergebnis für jede Auswertung „jüngster Eintrag je Schlüssel" und „Einträge der letzten N Tage"
//   (N ≤ Fenster) ist damit identisch zum Laden der kompletten Historie — nur ohne Jahre an Altdaten.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows, PAGE_SIZE } from './fetchAll';

/** Höchstzahl ids je .in()-Filter — hält die URL kurz (UUID = 36 Zeichen). */
export const IN_CHUNK = 150;

const DAY_MS = 24 * 60 * 60 * 1000;

type Err = { message: string; code?: string };
type Row = Record<string, unknown>;
// PostgREST-Builder sind generisch schwer zu typisieren — hier bewusst locker, die Aufrufer typisieren das Ergebnis.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

export function chunks<T>(list: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Sortierschlüssel: [Spalte, aufsteigend?]. id wird automatisch als letzter Schlüssel angehängt. */
export type OrderKey = [col: string, ascending?: boolean, opts?: { nullsFirst?: boolean }];

/**
 * Alle Zeilen einer Abfrage. `build()` liefert jedes Mal eine FRISCHE Abfrage (select + Filter, ohne order/range).
 * Gibt Fehler zurück statt zu werfen (wie fetchAllRows), damit Ersatzwege für fehlende Spalten möglich bleiben.
 */
export function fetchAllOf<T>(
  build: () => Q,
  order: OrderKey[] = [],
  idCol = 'id',
): Promise<{ data: T[]; error: Err | null }> {
  return fetchAllRows<T, Err>((from, to) => {
    let q = build();
    for (const [col, asc = true, opts] of order) q = q.order(col, { ascending: asc, ...(opts ?? {}) });
    if (!order.some(([c]) => c === idCol)) q = q.order(idCol, { ascending: true });
    return q.range(from, to);
  });
}

/** Lokales Kalenderdatum YYYY-MM-DD (nie toISOString().slice — Zeitzone!). */
function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface LatestWindowConfig {
  sb: SupabaseClient;
  table: string;
  /** Spaltenliste — muss id, unitCol, dateCol (+ type bei `types`, canceled bei `canceled`, tieCols) enthalten. */
  cols: string;
  dateCol: string;
  /** Spalte der Einheit (z. B. extinguisher_id, site_id, property_id). */
  unitCol: string;
  /** Einheiten, für die der jüngste Eintrag gebraucht wird: id-Liste oder Tabelle (dann alle ids daraus). */
  units: string[] | { table: string };
  /** Fensterlänge in Tagen (längster Prüfabstand + Puffer). */
  windowDays: number;
  /** Prüfarten: jüngster Eintrag je Einheit UND Art. Weglassen = je Einheit. */
  types?: readonly string[];
  /** true = nur Einträge dieser Arten laden (statt aller Arten). */
  onlyTypes?: boolean;
  /** true = stornierte Einträge (canceled = true) zählen nicht als „jüngster". */
  canceled?: boolean;
  /** dateCol ist eine reine Datums-Spalte (date) statt Zeitstempel. */
  dateOnly?: boolean;
  /** weitere absteigende Sortierspalten hinter dateCol (z. B. created_at bei date-Spalten). */
  tieCols?: string[];
  /** Zusatzfilter, der für alle Teilabfragen gilt. */
  refine?: (q: Q) => Q;
}

/**
 * Einträge im Zeitfenster vollständig + je fehlender Einheit/Art der jüngste ältere Eintrag
 * (Rückschau in wachsenden Schritten, ids in Häppchen à IN_CHUNK).
 * Rückgabe absteigend nach dateCol (dann tieCols, dann id) — wie die bisherigen Abfragen.
 */
export async function fetchLatestWindow<T>(cfg: LatestWindowConfig): Promise<{ data: T[]; error: Err | null }> {
  const { sb, table, cols, dateCol, unitCol, types, canceled, dateOnly } = cfg;
  const tie = cfg.tieCols ?? [];
  const fmt = (ms: number) => (dateOnly ? localDate(ms) : new Date(ms).toISOString());
  const base = (): Q => {
    let q: Q = sb.from(table).select(cols);
    if (cfg.onlyTypes && types) q = q.in('type', types as string[]);
    if (cfg.refine) q = cfg.refine(q);
    return q;
  };
  const desc: OrderKey[] = [[dateCol, false], ...tie.map((c): OrderKey => [c, false]), ['id', false]];

  const sinceMs = Date.now() - cfg.windowDays * DAY_MS;
  const since = fmt(sinceMs);

  const unitsP: Promise<{ data: string[]; error: Err | null }> = Array.isArray(cfg.units)
    ? Promise.resolve({ data: cfg.units, error: null })
    : fetchAllOf<{ id: string }>(() => sb.from((cfg.units as { table: string }).table).select('id')).then((r) => ({
        data: r.data.map((u) => u.id),
        error: r.error,
      }));
  const [win, unitRes] = await Promise.all([fetchAllOf<Row>(() => base().gte(dateCol, since), desc), unitsP]);
  if (win.error) return { data: win.data as T[], error: win.error };
  if (unitRes.error) return { data: [], error: unitRes.error };

  const rows: Row[] = [...win.data];
  const keyTypes: (string | null)[] = types ? [...types] : [null];
  const keyOf = (unit: unknown, type: unknown) => (types ? `${unit}:${type}` : String(unit));
  const found = new Set<string>();
  const mark = (list: Row[]) => {
    for (const r of list) {
      if (canceled && r.canceled === true) continue;
      found.add(keyOf(r[unitCol], r.type));
    }
  };
  mark(rows);

  const missing = () =>
    keyTypes
      .map((t) => ({ t, ids: [...new Set(unitRes.data)].filter((u) => !found.has(keyOf(u, t))) }))
      .filter((m) => m.ids.length > 0);

  let todo = missing();
  if (todo.length > 0) {
    // Ältester Eintrag überhaupt (vor dem Fenster) = Ende der Rückschau.
    let fq: Q = base().lt(dateCol, since);
    if (canceled) fq = fq.eq('canceled', false);
    const { data: oldest, error: oErr } = await fq.order(dateCol, { ascending: true }).limit(1);
    if (oErr) return { data: rows as T[], error: oErr };
    const floorRow = (oldest as Row[] | null)?.[0];
    if (floorRow) {
      const floorMs = Date.parse(String(floorRow[dateCol])) - DAY_MS; // Puffer gegen Zeitzonen-Kanten
      let upper = sinceMs;
      let span = Math.max(cfg.windowDays, 30) * DAY_MS;
      while (todo.length > 0 && upper > floorMs) {
        const lower = upper - span;
        const lo = fmt(lower);
        const hi = fmt(upper);
        // Je Häppchen absteigend seitenweise lesen und abbrechen, sobald jede Einheit ihren jüngsten Eintrag hat.
        const errors = await Promise.all(
          todo.flatMap(({ t, ids }) =>
            chunks(ids).map(async (part): Promise<Err | null> => {
              let from = 0;
              for (let i = 0; i < 200; i++) {
                let q: Q = base().in(unitCol, part).gte(dateCol, lo).lt(dateCol, hi);
                if (t !== null) q = q.eq('type', t);
                if (canceled) q = q.eq('canceled', false);
                for (const [col, asc] of desc) q = q.order(col, { ascending: asc });
                const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
                if (error) return error as Err;
                const got = (data ?? []) as Row[];
                if (got.length === 0) break;
                rows.push(...got);
                mark(got);
                if (part.every((u) => found.has(keyOf(u, t)))) break;
                from += got.length;
              }
              return null;
            }),
          ),
        );
        const stepErr = errors.find((e) => e);
        if (stepErr) return { data: rows as T[], error: stepErr };
        todo = missing();
        upper = lower;
        span *= 2;
      }
    }
  }

  // Gesamtergebnis absteigend sortieren (Fenster + Rückschau-Häppchen).
  const cmpVal = (a: unknown, b: unknown, isDate: boolean): number => {
    if (a === b) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (isDate && !dateOnly) {
      const d = Date.parse(String(a)) - Date.parse(String(b));
      if (d !== 0 && !Number.isNaN(d)) return d;
    }
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  };
  rows.sort((x, y) => {
    for (const c of [dateCol, ...tie, 'id']) {
      const d = cmpVal(y[c], x[c], c === dateCol || tie.includes(c));
      if (d !== 0) return d;
    }
    return 0;
  });
  return { data: rows as T[], error: null };
}

/** Exakte Anzahl per count (head: true) — für Kennzahlen statt data.length. */
export async function countRows(build: () => Q): Promise<{ count: number; error: Err | null }> {
  const { count, error } = await build();
  return { count: count ?? 0, error };
}
