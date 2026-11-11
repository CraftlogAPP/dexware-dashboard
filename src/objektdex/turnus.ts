// ObjektDex — Turnus/Fälligkeit, Soll/Ist und Heute-Status. KOPIE von ObjektDex/mobile/src/lib/turnus.ts
// (gleiche Regeln wie die Datenbank: od_is_due, od_due_count, today_overview). Bei Änderungen beide Stellen pflegen.
//
//
// Kalendertage sind Texte „JJJJ-MM-TT“ und immer BERLINER Tage (Suite-Regel: nie toISOString().slice(0,10)).
// Rechnen mit Tagen über Date.UTC — so spielen Sommer-/Winterzeit keine Rolle.

export type Cadence = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'on_demand';
export type Day = string; // 'YYYY-MM-DD'

export interface TurnusSpec {
  cadence: Cadence;
  weekdays: number[]; // 1 = Mo … 7 = So
  monthDay?: number | null; // 1–31 (31 = Monatsletzter)
  startOn: Day;
  endOn?: Day | null; // fällig nur VOR diesem Tag
}

const DAY_MS = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');

export function dayToUTC(d: Day): number {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
}
export function utcToDay(ms: number): Day {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function addDays(d: Day, n: number): Day {
  return utcToDay(dayToUTC(d) + n * DAY_MS);
}
export function daysBetween(a: Day, b: Day): number {
  return Math.round((dayToUTC(b) - dayToUTC(a)) / DAY_MS);
}
/** ISO-Wochentag: 1 = Montag … 7 = Sonntag */
export function isoDow(d: Day): number {
  const w = new Date(dayToUTC(d)).getUTCDay();
  return w === 0 ? 7 : w;
}
export function daysInMonth(d: Day): number {
  const [y, m] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function firstOfMonth(d: Day): Day {
  return d.slice(0, 8) + '01';
}
export function lastOfMonth(d: Day): Day {
  return d.slice(0, 8) + pad(daysInMonth(d));
}
/** Monate addieren, Tag am Monatsende kappen (31.08. + 6 = 28./29.02.). */
export function addMonths(d: Day, n: number): Day {
  const [y, m, dd] = d.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const first = `${ny}-${pad(nm)}-01`;
  return `${ny}-${pad(nm)}-${pad(Math.min(dd, daysInMonth(first)))}`;
}

let berlinFmt: Intl.DateTimeFormat | null | undefined;
/** Berliner Kalendertag eines Zeitpunkts (Rückfall: Gerätezeit, falls Intl ohne Zeitzonen). */
export function berlinDay(date: Date = new Date()): Day {
  if (berlinFmt === undefined) {
    try {
      berlinFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(berlinFmt.format(new Date(0)))) berlinFmt = null;
    } catch {
      berlinFmt = null;
    }
  }
  if (berlinFmt) {
    try {
      const parts = berlinFmt.formatToParts(date);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      const s = `${get('year')}-${get('month')}-${get('day')}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    } catch {
      /* Rückfall unten */
    }
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
/** Berliner Kalendertag eines ISO-Zeitstempels. */
export function dayOf(iso: string): Day {
  return berlinDay(new Date(iso));
}
export function todayBerlin(): Day {
  return berlinDay(new Date());
}

/** Ist die Leistung an diesem Tag fällig? */
export function isDue(s: TurnusSpec, day: Day): boolean {
  if (day < s.startOn) return false;
  if (s.endOn && day >= s.endOn) return false;
  switch (s.cadence) {
    case 'daily':
      return true;
    case 'weekly':
      return s.weekdays.includes(isoDow(day));
    case 'biweekly': {
      if (!s.weekdays.includes(isoDow(day))) return false;
      const weekStart = (d: Day) => addDays(d, -(isoDow(d) - 1));
      const weeks = Math.round(daysBetween(weekStart(s.startOn), weekStart(day)) / 7);
      return weeks % 2 === 0;
    }
    case 'monthly': {
      if (!s.monthDay) return false;
      const dd = Number(day.slice(8, 10));
      return dd === Math.min(s.monthDay, daysInMonth(day));
    }
    default:
      return false;
  }
}

/** Soll-Termine im Zeitraum [from, to] (beide einschließlich); null bei „nach Bedarf“. */
export function dueCount(s: TurnusSpec, from: Day, to: Day): number | null {
  if (s.cadence === 'on_demand') return null;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isDue(s, d)) n++;
  return n;
}

/** Letzter Soll-Termin VOR day (höchstens lookback Tage zurück). */
export function lastDueBefore(s: TurnusSpec, day: Day, lookback = 62): Day | null {
  for (let i = 1; i <= lookback; i++) {
    const d = addDays(day, -i);
    if (isDue(s, d)) return d;
  }
  return null;
}

/** Nächster Soll-Termin ab day (einschließlich), höchstens 400 Tage voraus. */
export function nextDue(s: TurnusSpec, day: Day): Day | null {
  if (s.cadence === 'on_demand') return null;
  for (let i = 0; i <= 400; i++) {
    const d = addDays(day, i);
    if (isDue(s, d)) return d;
  }
  return null;
}

// ---------------------------------------------------------------------------- Soll/Ist + Heute

/** Minimal-Form eines Einsatzes für die Rechnung. */
export interface OpLike {
  startedAt: string; // ISO
  serviceIds: string[];
  canceled: boolean;
}
export interface ServiceLike extends TurnusSpec {
  id: string;
  active: boolean;
}

/** Berliner Tage, an denen die Leistung erledigt wurde (nicht stornierte Einsätze). */
export function doneDays(serviceId: string, ops: OpLike[]): Set<Day> {
  const out = new Set<Day>();
  for (const o of ops) if (!o.canceled && o.serviceIds.includes(serviceId)) out.add(dayOf(o.startedAt));
  return out;
}

export interface SollIst {
  soll: number | null;
  ist: number;
}
/** Soll/Ist im Zeitraum: Ist = Anzahl Tage mit mindestens einem Einsatz, der die Leistung enthält. */
export function sollIst(s: ServiceLike, ops: OpLike[], from: Day, to: Day): SollIst {
  let ist = 0;
  for (const d of doneDays(s.id, ops)) if (d >= from && d <= to) ist++;
  return { soll: dueCount(s, from, to), ist };
}

export interface ServiceToday {
  dueToday: boolean;
  doneToday: boolean;
  /** seit einem früheren Termin nicht erledigt */
  overdue: boolean;
  lastDue: Day | null;
}
export function serviceToday(s: ServiceLike, ops: OpLike[], day: Day): ServiceToday {
  const done = doneDays(s.id, ops);
  const dueToday = s.active && isDue(s, day);
  const doneToday = done.has(day);
  const lastDue = s.active ? lastDueBefore(s, day) : null;
  let overdue = false;
  if (lastDue) {
    overdue = true;
    for (const d of done) if (d >= lastDue && d <= day) overdue = false;
  }
  return { dueToday, doneToday, overdue, lastDue };
}

export type DayStatus = 'overdue' | 'open' | 'done' | 'none';
export interface PropertyToday {
  status: DayStatus;
  due: number;
  done: number;
  overdue: number;
  /** IDs der Leistungen, die man jetzt vorwählt (heute fällig oder überfällig, noch nicht erledigt) */
  preselect: string[];
}
/** Status eines Objekts für „Heute“ (Rangfolge wie in der Datenbank: überfällig > offen > erledigt > nichts). */
export function propertyToday(services: ServiceLike[], ops: OpLike[], day: Day): PropertyToday {
  let due = 0, done = 0, overdue = 0;
  const preselect: string[] = [];
  for (const s of services) {
    if (!s.active) continue;
    const t = serviceToday(s, ops, day);
    if (t.dueToday) due++;
    if (t.dueToday && t.doneToday) done++;
    if (t.overdue) overdue++;
    if ((t.dueToday && !t.doneToday) || t.overdue) preselect.push(s.id);
  }
  const status: DayStatus = overdue > 0 ? 'overdue' : due > done ? 'open' : due > 0 ? 'done' : 'none';
  return { status, due, done, overdue, preselect };
}

// ---------------------------------------------------------------------------- Texte

export const WEEKDAY_SHORT = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAY_LONG = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: 'Täglich',
  weekly: 'Wöchentlich',
  biweekly: 'Alle 14 Tage',
  monthly: 'Monatlich',
  on_demand: 'Nach Bedarf',
};

function dayList(w: number[]): string {
  const s = [...w].sort((a, b) => a - b);
  if (s.join() === '1,2,3,4,5') return 'Mo–Fr';
  if (s.join() === '1,2,3,4,5,6') return 'Mo–Sa';
  if (s.length === 1) return WEEKDAY_LONG[s[0]];
  return s.map((d) => WEEKDAY_SHORT[d]).join(' + ');
}

/** „Jeden Montag“, „Mo + Do“, „Alle 14 Tage · Mo“, „Monatlich am 15.“, „Monatlich am Monatsletzten“ … */
export function cadenceText(s: Pick<TurnusSpec, 'cadence' | 'weekdays' | 'monthDay'>): string {
  switch (s.cadence) {
    case 'daily':
      return 'Täglich';
    case 'weekly':
      return s.weekdays.length === 1 ? `Jeden ${WEEKDAY_LONG[s.weekdays[0]]}` : `Wöchentlich · ${dayList(s.weekdays)}`;
    case 'biweekly':
      return `Alle 14 Tage · ${dayList(s.weekdays)}`;
    case 'monthly':
      return !s.monthDay ? 'Monatlich' : s.monthDay >= 31 ? 'Monatlich am Monatsletzten' : `Monatlich am ${s.monthDay}.`;
    default:
      return 'Nach Bedarf';
  }
}

/** „4 von 4“ bzw. „3 (nach Bedarf)“ */
export function sollIstText(x: SollIst): string {
  return x.soll == null ? `${x.ist}× (nach Bedarf)` : `${x.ist} von ${x.soll}`;
}

/** „JJJJ-MM-TT“ → „TT.MM.JJJJ“ */
export function formatDay(d: Day): string {
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
}
/** „TT.MM.JJJJ“ (auch „T.M.JJ“) → „JJJJ-MM-TT“ oder null */
export function parseGermanDay(text: string): Day | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\s*$/.exec(text);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mo = Number(m[2]);
  const d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const first = `${y}-${pad(mo)}-01`;
  if (d > daysInMonth(first)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
