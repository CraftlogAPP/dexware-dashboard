// Plantafel: Termine verschieben (Ziehen & Ablegen, Tastatur) — reine Rechenlogik, ohne React/Netz.
// Rechte wie RLS appt_update in plantafel.sql: der Inhaber verschiebt alles, Monteure nur eigene Termine
// und nur bei sich selbst (assigned_to = auth.uid() vorher UND nachher). Überschneidungen werden gezeigt, nicht verboten.

import { APPT_MAX_HOURS, dayOf, parseDay, type Appt, type ApptInput, type PlanMember } from './logic';

/** Kürzeste Dauer beim Ziehen (ein Rasterschritt) und längste (Check-Constraint in plantafel.sql). */
export const MIN_DUR = 15;
export const MAX_DUR = APPT_MAX_HOURS * 60;
export const clampDur = (min: number) => Math.min(MAX_DUR, Math.max(MIN_DUR, Math.round(min)));
/** Beginn innerhalb des Tages (0:00 … 23:45) */
export const clampStart = (min: number) => Math.min(24 * 60 - MIN_DUR, Math.max(0, Math.round(min)));

/** Minuten nach Mitternacht (lokal) */
export const minuteOfDay = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/** Dauer in Minuten */
export const durationMin = (a: Pick<Appt, 'starts_at' | 'ends_at'>) =>
  Math.max(0, Math.round((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60_000));

/** Wer gerade arbeitet — dieselben Angaben wie die Rechte-Prüfung in der Plantafel. */
export interface MoveActor {
  isOwner: boolean;
  me: string | null;
}

/** Ziel einer Verschiebung: Kalendertag (lokal) und wem der Termin danach gehört. */
export interface MoveTarget {
  day: string;
  assigned_to: string | null;
}

/** Warum ein Termin nicht ziehbar ist — oder null, wenn er sich verschieben lässt. */
export function moveBlockReason(a: Pick<Appt, 'status' | 'assigned_to'>, actor: MoveActor): string | null {
  if (a.status === 'done') return 'Erledigte Termine lassen sich nicht verschieben.';
  if (a.status === 'canceled') return 'Abgesagte Termine lassen sich nicht verschieben.';
  if (!actor.isOwner && (!actor.me || a.assigned_to !== actor.me))
    return 'Du kannst nur deine eigenen Termine verschieben — andere plant der Inhaber.';
  return null;
}

/** Hinweis für Kundentermine (Anfragen): erst einplanen, dann verschieben — wie im Dialog. */
export const REQUEST_MOVE_HINT = 'Vom Kunden gewählter Termin: erst „Einplanen“, dann lässt er sich verschieben.';

/** Darf `a` zu diesem Monteur? Gleicher Monteur geht immer; einen anderen nur der Inhaber (RLS with check). */
export function canAssignTo(a: Pick<Appt, 'assigned_to'>, assignee: string | null, actor: MoveActor): boolean {
  if (assignee === a.assigned_to) return true;
  if (!assignee) return false;
  return actor.isOwner;
}

/**
 * Neue Zeiten am Zieltag: Uhrzeit (lokal) und Dauer bleiben gleich.
 * `startMin` (Minuten nach Mitternacht) setzt optional eine neue Uhrzeit — z. B. aus der Zeitachse, vorher mit `snapMinutes` rasten.
 * `durMin` setzt optional eine neue Dauer (Unterkante ziehen) — wird auf 15 min … 14 h begrenzt.
 */
export function shiftTimes(
  a: Pick<Appt, 'starts_at' | 'ends_at'>,
  day: string,
  startMin?: number,
  durMin?: number,
): { starts_at: string; ends_at: string } {
  const s = new Date(a.starts_at);
  const dur = durMin === undefined ? Math.max(0, Date.parse(a.ends_at) - s.getTime()) : clampDur(durMin) * 60_000;
  const d = parseDay(day);
  const h = startMin === undefined ? s.getHours() : Math.floor(startMin / 60);
  const m = startMin === undefined ? s.getMinutes() : startMin % 60;
  const ns =
    startMin === undefined
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, s.getSeconds(), s.getMilliseconds())
      : new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
  return { starts_at: ns.toISOString(), ends_at: new Date(ns.getTime() + dur).toISOString() };
}

/** Auf ein Raster runden (Standard 15 Minuten), innerhalb eines Tages (0 … 24 h − Raster). */
export function snapMinutes(min: number, step = 15): number {
  const r = Math.round(min / step) * step;
  return Math.min(Math.max(0, r), 24 * 60 - step);
}

/** Ändert die Verschiebung überhaupt etwas? */
export function isSameSlot(a: Pick<Appt, 'starts_at' | 'assigned_to'>, t: MoveTarget, startMin?: number): boolean {
  if (t.assigned_to !== a.assigned_to || t.day !== dayOf(a.starts_at)) return false;
  if (startMin === undefined) return true;
  const s = new Date(a.starts_at);
  return s.getHours() * 60 + s.getMinutes() === startMin;
}

/** Termin nach der Verschiebung (für die sofortige Anzeige). */
export function movedAppt(a: Appt, t: MoveTarget, team: PlanMember[], startMin?: number, durMin?: number): Appt {
  const times = shiftTimes(a, t.day, startMin, durMin);
  const who = team.find((m) => m.userId === t.assigned_to);
  const assigned_name = t.assigned_to === a.assigned_to ? a.assigned_name : who ? who.name.slice(0, 80) : null;
  return { ...a, ...times, assigned_to: t.assigned_to, assigned_name };
}

/** Was an updateAppointment geht — alle Felder wie im Dialog, nur Zeit und Monteur neu. */
export function apptInputOf(a: Appt): ApptInput {
  return {
    site_id: a.site_id,
    asset_id: a.site_id ? a.asset_id : null,
    request_id: a.request_id,
    assigned_to: a.assigned_to,
    assigned_name: a.assigned_name,
    title: a.title,
    note: a.note,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    status: a.status,
  };
}

/** Andere aktive Termine desselben Monteurs, die sich mit `moved` überschneiden (gleiche Regel wie conflicts()). */
export function clashesWith<T extends Pick<Appt, 'id' | 'assigned_to' | 'starts_at' | 'ends_at' | 'status'>>(
  list: T[],
  moved: Pick<Appt, 'id' | 'assigned_to' | 'starts_at' | 'ends_at'>,
): T[] {
  if (!moved.assigned_to) return [];
  const s = Date.parse(moved.starts_at);
  const e = Date.parse(moved.ends_at);
  return list.filter(
    (o) =>
      o.id !== moved.id &&
      o.status !== 'canceled' &&
      o.assigned_to === moved.assigned_to &&
      Date.parse(o.starts_at) < e &&
      s < Date.parse(o.ends_at),
  );
}

/**
 * Tastatur: nächstes Ziel. `days` = auswählbare Tage (Reihenfolge links → rechts), `lanes` = auswählbare Monteure
 * (oben → unten). Am Rand bleibt das Ziel stehen. Gibt null zurück, wenn sich nichts ändert.
 */
export function stepTarget(
  t: MoveTarget,
  dir: 'day-' | 'day+' | 'lane-' | 'lane+',
  days: string[],
  lanes: (string | null)[],
): MoveTarget | null {
  if (dir === 'day-' || dir === 'day+') {
    const i = days.indexOf(t.day);
    const j = i < 0 ? 0 : i + (dir === 'day+' ? 1 : -1);
    if (j < 0 || j >= days.length || j === i) return null;
    return { ...t, day: days[j] };
  }
  const i = lanes.indexOf(t.assigned_to);
  const j = i < 0 ? 0 : i + (dir === 'lane+' ? 1 : -1);
  if (j < 0 || j >= lanes.length || j === i) return null;
  return { ...t, assigned_to: lanes[j] };
}

/** Gleiche Zeiten und gleicher Monteur? (Ablegen an derselben Stelle = nichts speichern) */
export const sameSlot = (a: Pick<Appt, 'starts_at' | 'ends_at' | 'assigned_to'>, b: Pick<Appt, 'starts_at' | 'ends_at' | 'assigned_to'>) =>
  a.assigned_to === b.assigned_to && Date.parse(a.starts_at) === Date.parse(b.starts_at) && Date.parse(a.ends_at) === Date.parse(b.ends_at);

// ---------------------------------------------------------------------------
// Tagesansicht mit Zeitachse
// ---------------------------------------------------------------------------

/** Ende auf der Zeitachse eines Tages in Minuten — endet der Termin erst am Folgetag, dann 24:00. */
export const endMinuteOn = (a: Pick<Appt, 'ends_at'>, day: string) => (dayOf(a.ends_at) === day ? minuteOfDay(a.ends_at) : 24 * 60);

/** Sichtbarer Stundenbereich: Standard 6–20 Uhr, ausgeweitet auf Termine außerhalb. */
export function dayRange(items: Pick<Appt, 'starts_at' | 'ends_at'>[], day: string, from = 6, to = 20): { startH: number; endH: number } {
  let startH = from;
  let endH = to;
  for (const a of items) {
    if (dayOf(a.starts_at) !== day) continue;
    startH = Math.min(startH, Math.floor(minuteOfDay(a.starts_at) / 60));
    endH = Math.max(endH, Math.ceil(endMinuteOn(a, day) / 60));
  }
  return { startH, endH: Math.min(24, endH) };
}

/**
 * Überschneidende Termine nebeneinander: jede Gruppe sich überlappender Termine bekommt so viele Spalten wie nötig,
 * jeder Termin die erste freie Spalte. `s`/`e` in Minuten.
 */
export function layoutColumns(items: { id: string; s: number; e: number }[]): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>();
  const sorted = [...items].sort((x, y) => x.s - y.s || y.e - x.e || x.id.localeCompare(y.id));
  let group: string[] = [];
  let colEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const id of group) out.get(id)!.cols = colEnds.length;
    group = [];
    colEnds = [];
  };
  for (const it of sorted) {
    const e = Math.max(it.e, it.s + 1); // Termine ohne Dauer brauchen trotzdem Platz
    if (it.s >= groupEnd) close();
    let col = colEnds.findIndex((end) => end <= it.s);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(e);
    } else colEnds[col] = e;
    out.set(it.id, { col, cols: 1 });
    group.push(it.id);
    groupEnd = group.length === 1 ? e : Math.max(groupEnd, e);
  }
  close();
  return out;
}
