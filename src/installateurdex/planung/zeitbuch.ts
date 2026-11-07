// Zeitbuch-Regeln fürs Portal — gleiche Regeln wie die App InstallateurDex/mobile/src/lib/timeclock.ts (07.11.):
//  - Kunde = site_id. Ort ohne Kunde (Werkstatt/Lager, Büro, Heimarbeit, Sonstiges) und Pause stehen als Kennzeichen
//    vorn in der Notiz: „[Büro] [Pause 30 min] Angebote geschrieben“. Rest = Tätigkeit. note ≤ 300 Zeichen (zeit.sql).
//  - Arbeitszeit = Dauer − Pause im Eintrag; alte Pausen-Einträge (kind break) zählen wie bisher nicht mit.
//  - Hinweise: Pause (AT § 11 AZG / DE § 4 ArbZG / CH Art. 15 ArG), Höchstarbeitszeit (AT 12 h § 9 AZG / DE 10 h § 3 ArbZG,
//    CH keine Tagesgrenze), Ruhezeit 11 h (AT § 12 AZG / DE § 5 ArbZG / CH Art. 15a ArG).
//  - Feiertage: AT bundesweit, DE bundesweit + Bundesland (org.region), CH schweizweit — wie App holidays().

import { dayKey, dayOf, hhmm, hm, KIND_LABEL, minutesOf, parseDay, type TimeEntry } from './logic';

export type LawLand = 'AT' | 'DE' | 'CH';
export const lawLandOf = (land: string | null | undefined): LawLand => (land === 'DE' || land === 'CH' ? land : 'AT');
const LAW = {
  AT: { pause: '§ 11 AZG', rest: '§ 12 AZG', name: 'AZG' },
  DE: { pause: '§ 4 ArbZG', rest: '§ 5 ArbZG', name: 'ArbZG' },
  CH: { pause: 'Art. 15 ArG', rest: 'Art. 15a ArG', name: 'ArG' },
} as const;
export const lawName = (l: LawLand) => LAW[l].name;

/** Mindestpause je Arbeitszeit — wie App pauseNeed. */
export function pauseNeed(paid: number, land: LawLand): number {
  if (land === 'CH') return paid > 9 * 60 ? 60 : paid > 7 * 60 ? 30 : paid > 5.5 * 60 ? 15 : 0;
  return paid > 9 * 60 && land === 'DE' ? 45 : paid > 6 * 60 ? 30 : 0;
}
export function pauseHint(t: { paid: number; break: number }, land: LawLand): string | null {
  const need = pauseNeed(t.paid, land);
  return need > t.break ? `Bei ${hm(t.paid)} Arbeitszeit sind mindestens ${need} Minuten Pause vorgesehen (${LAW[land].pause}).` : null;
}

const two = (n: number) => String(n).padStart(2, '0');
const addD = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function easterSunday(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
/** Gesetzliche Feiertage (JJJJ-MM-TT → Name) — gleiche Liste wie App lib/timeclock.ts holidays(). */
export function holidays(year: number, land: string, region?: string | null): Map<string, string> {
  const e = easterSunday(year);
  const rel = (n: number) => dayKey(addD(e, n));
  const fix = (m: number, d: number) => `${year}-${two(m)}-${two(d)}`;
  const list: [string, string][] =
    land === 'DE'
      ? [[fix(1, 1), 'Neujahr'], [rel(-2), 'Karfreitag'], [rel(1), 'Ostermontag'], [fix(5, 1), 'Tag der Arbeit'], [rel(39), 'Christi Himmelfahrt'], [rel(50), 'Pfingstmontag'], [fix(10, 3), 'Tag der Deutschen Einheit'], [fix(12, 25), '1. Weihnachtstag'], [fix(12, 26), '2. Weihnachtstag']]
      : land === 'CH'
        ? [[fix(1, 1), 'Neujahr'], [rel(39), 'Auffahrt'], [fix(8, 1), 'Bundesfeier'], [fix(12, 25), 'Weihnachten']]
        : [[fix(1, 1), 'Neujahr'], [fix(1, 6), 'Heilige Drei Könige'], [rel(1), 'Ostermontag'], [fix(5, 1), 'Staatsfeiertag'], [rel(39), 'Christi Himmelfahrt'], [rel(50), 'Pfingstmontag'], [rel(60), 'Fronleichnam'], [fix(8, 15), 'Mariä Himmelfahrt'], [fix(10, 26), 'Nationalfeiertag'], [fix(11, 1), 'Allerheiligen'], [fix(12, 8), 'Mariä Empfängnis'], [fix(12, 25), 'Christtag'], [fix(12, 26), 'Stefanitag']];
  if (land === 'DE' && region) {
    const r = region.toUpperCase();
    const add = (on: boolean, k: string, name: string) => {
      if (on) list.push([k, name]);
    };
    add(['BW', 'BY', 'ST'].includes(r), fix(1, 6), 'Heilige Drei Könige');
    add((r === 'BE' && year >= 2019) || (r === 'MV' && year >= 2023), fix(3, 8), 'Internationaler Frauentag');
    add(['BW', 'BY', 'HE', 'NW', 'RP', 'SL'].includes(r), rel(60), 'Fronleichnam');
    add(['BY', 'SL'].includes(r), fix(8, 15), 'Mariä Himmelfahrt');
    add(r === 'TH' && year >= 2019, fix(9, 20), 'Weltkindertag');
    add(['BB', 'MV', 'SN', 'ST', 'TH'].includes(r) || (['HB', 'HH', 'NI', 'SH'].includes(r) && year >= 2018), fix(10, 31), 'Reformationstag');
    add(['BW', 'BY', 'NW', 'RP', 'SL'].includes(r), fix(11, 1), 'Allerheiligen');
    if (r === 'SN') {
      const d22 = new Date(year, 10, 22);
      list.push([dayKey(new Date(year, 10, 22 - ((d22.getDay() - 3 + 7) % 7))), 'Buß- und Bettag']);
    }
  }
  return new Map(list);
}

export const NOTE_MAX = 300;

export type Place = 'werkstatt' | 'buero' | 'heim' | 'sonst';
export const PLACES: { id: Place; label: string; icon: string }[] = [
  { id: 'werkstatt', label: 'Werkstatt/Lager', icon: '🏭' },
  { id: 'buero', label: 'Büro', icon: '🗂️' },
  { id: 'heim', label: 'Heimarbeit', icon: '🏠' },
  { id: 'sonst', label: 'Sonstiges', icon: '📌' },
];
const placeInfo = (p: Place) => PLACES.find((x) => x.id === p)!;
/** Kürzen nach Zeichen (Code Points wie Postgres char_length) — kein halbes Emoji */
export const clampChars = (t: string, n: number) => {
  const a = Array.from(t);
  return a.length > n ? a.slice(0, Math.max(0, n)).join('') : t;
};
/** unsichtbare Markierung vor einer Tätigkeit, die mit „[“ beginnt (sonst würde „[Büro] privat“ zum Ort) — wie App */
const GUARD = '\u200B';
const PLACE_ALIASES: Record<string, Place> = {
  'werkstatt/lager': 'werkstatt',
  werkstatt: 'werkstatt',
  lager: 'werkstatt',
  'büro': 'buero',
  buero: 'buero',
  heimarbeit: 'heim',
  'home-office': 'heim',
  homeoffice: 'heim',
  sonstiges: 'sonst',
};

export interface NoteParts {
  place?: Place;
  pauseMin: number;
  text: string;
}

/** Notiz → Ort, Pause, Tätigkeit (wie App parseNote). */
export function parseNote(note?: string | null): NoteParts {
  let rest = String(note ?? '');
  let place: Place | undefined;
  let pauseMin = 0;
  for (let i = 0; i < 3; i++) {
    const m = /^\s*\[([^\]\n]{1,30})\]\s*/.exec(rest);
    if (!m) break;
    const tag = m[1].trim();
    const pm = /^Pause\s+(\d{1,3})\s*min\.?$/i.exec(tag);
    const pl = PLACE_ALIASES[tag.toLowerCase()];
    if (pm && !pauseMin) pauseMin = Number(pm[1]);
    else if (pl && !place) place = pl;
    else break;
    rest = rest.slice(m[0].length);
  }
  return { place, pauseMin, text: rest.trim().replace(/^\u200B/, '') };
}

/** Ort, Pause, Tätigkeit → Notiz (wie App buildNote). */
export function buildNote(p: Partial<NoteParts>): string | null {
  const pause = Math.max(0, Math.min(999, Math.round(p.pauseMin ?? 0)));
  const tags = [p.place ? `[${placeInfo(p.place).label}]` : '', pause > 0 ? `[Pause ${pause} min]` : ''].filter(Boolean).join(' ');
  const room = NOTE_MAX - Array.from(tags).length - (tags ? 1 : 0);
  let text = (p.text ?? '').trim();
  if (text.startsWith('[')) text = GUARD + text;
  text = clampChars(text, room).trim();
  return [tags, text].filter(Boolean).join(' ') || null;
}

export const pauseOf = (e: TimeEntry, now = new Date()) => (e.kind === 'break' ? 0 : Math.min(parseNote(e.note).pauseMin, minutesOf(e, now)));
export const netMinutes = (e: TimeEntry, now = new Date()) => (e.kind === 'break' ? 0 : minutesOf(e, now) - pauseOf(e, now));
export const activityOf = (e: Pick<TimeEntry, 'note'>) => parseNote(e.note).text;

export function whereKey(e: TimeEntry): string {
  if (e.kind === 'break') return 'break';
  if (e.site_id) return `site:${e.site_id}`;
  const p = parseNote(e.note).place;
  if (p) return `place:${p}`;
  return e.kind === 'travel' ? 'travel' : 'none';
}

export function whereLabel(e: TimeEntry, siteName: (id: string) => string | undefined): { icon: string; label: string } {
  const k = whereKey(e);
  if (k.startsWith('site:')) return { icon: '👤', label: siteName(e.site_id!) ?? 'Kunde (nicht mehr in der Liste)' };
  if (k.startsWith('place:')) {
    const p = placeInfo(k.slice(6) as Place);
    return { icon: p.icon, label: p.label };
  }
  if (k === 'travel') return { icon: '🚐', label: 'Fahrt' };
  if (k === 'break') return { icon: '☕', label: 'Pause' };
  return { icon: '❔', label: 'Ohne Zuordnung' };
}

export interface ZTotals {
  /** Arbeitszeit ohne Pausen */
  paid: number;
  /** Pausen-Einträge + Pause im Eintrag */
  break: number;
  /** davon alte Fahrt-Einträge */
  travel: number;
}

/** Summen: Arbeitszeit ohne Pausen (auch ohne Pause im Eintrag) — wie App totalsByDay. */
export function zTotals(entries: TimeEntry[], now = new Date()): ZTotals {
  const t: ZTotals = { paid: 0, break: 0, travel: 0 };
  for (const e of entries) {
    const m = minutesOf(e, now);
    if (e.kind === 'break') {
      t.break += m;
      continue;
    }
    const p = pauseOf(e, now);
    t.break += p;
    t.paid += m - p;
    if (e.kind === 'travel') t.travel += m - p;
  }
  return t;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Hinweise je Tag einer Person (Pause, Höchstgrenze, Ruhezeit zum Vortag) — wie App lawHintsByDay. */
export function lawHintsByDay(entries: TimeEntry[], land: LawLand, now = new Date()): Map<string, string[]> {
  const byDay = new Map<string, TimeEntry[]>();
  for (const e of entries) byDay.set(dayOf(e.started_at), [...(byDay.get(dayOf(e.started_at)) ?? []), e]);
  const out = new Map<string, string[]>();
  const keys = [...byDay.keys()].sort();
  for (const k of keys) {
    const list = byDay.get(k)!;
    const t = zTotals(list, now);
    const hints: string[] = [];
    const b = pauseHint(t, land);
    if (b) hints.push(b);
    const max = land === 'DE' ? 600 : 720;
    if (land !== 'CH' && t.paid > max) hints.push(`${hm(t.paid)} an einem Tag — mehr als die Höchstgrenze von ${max / 60} Stunden (${land === 'DE' ? '§ 3 ArbZG' : '§ 9 AZG'}).`);
    const prev = byDay.get(dayKey(addDays(parseDay(k), -1)));
    if (prev) {
      const lastEnd = prev.filter((e) => e.kind !== 'break' && e.ended_at).map((e) => e.ended_at!).sort().pop();
      const first = list.filter((e) => e.kind !== 'break').map((e) => e.started_at).sort()[0];
      if (lastEnd && first) {
        const gap = Math.round((Date.parse(first) - Date.parse(lastEnd)) / 60_000);
        if (gap >= 0 && gap < 11 * 60) hints.push(`Nur ${hm(gap)} Ruhezeit seit dem Vortag — vorgesehen sind mindestens 11 Stunden (${LAW[land].rest}).`);
      }
    }
    if (hints.length) out.set(k, hints);
  }
  return out;
}

export interface WhereGroup {
  key: string;
  siteId?: string;
  minutes: number;
  days: Set<string>;
  people: Set<string>;
  entries: TimeEntry[];
}

/** Stunden je Kunde/Ort (ohne Pausen-Einträge), meiste zuerst. */
export function byWhere(entries: TimeEntry[], nameOf: (e: TimeEntry) => string, now = new Date()): WhereGroup[] {
  const m = new Map<string, WhereGroup>();
  for (const e of entries) {
    if (e.kind === 'break') continue;
    const key = whereKey(e);
    const g = m.get(key) ?? { key, siteId: e.site_id ?? undefined, minutes: 0, days: new Set<string>(), people: new Set<string>(), entries: [] };
    g.minutes += netMinutes(e, now);
    g.days.add(dayOf(e.started_at));
    g.people.add(nameOf(e));
    g.entries.push(e);
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => b.minutes - a.minutes);
}

/** CSV wie App toCsv: Datum;Person;Kunde/Ort;Beginn;Ende;Pause (min);Arbeitszeit (min);Tätigkeit;Art;Hinweis */
export const ZEITBUCH_CSV_HEADER = ['Datum', 'Person', 'Kunde/Ort', 'Beginn', 'Ende', 'Pause (min)', 'Arbeitszeit (min)', 'Tätigkeit', 'Art', 'Hinweis'];
export function zeitbuchCsvRows(entries: TimeEntry[], nameOf: (e: TimeEntry) => string, siteName: (id: string) => string | undefined, now = new Date()): string[][] {
  return [...entries]
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
    .map((e) => [
      dayOf(e.started_at).split('-').reverse().join('.'),
      nameOf(e),
      whereLabel(e, siteName).label,
      hhmm(e.started_at),
      e.ended_at ? hhmm(e.ended_at) : 'läuft',
      String(e.kind === 'break' ? minutesOf(e, now) : pauseOf(e, now)),
      String(netMinutes(e, now)),
      activityOf(e),
      KIND_LABEL[e.kind],
      e.edited_at ? 'korrigiert' : '',
    ]);
}

// ---------------------------------------------------------------- Sollzeit (time_target) — wie App dayTarget/periodSummary

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export interface WorkTarget {
  weekMinutes: number;
  days: number[];
}
export const targetOf = (t: { week_minutes: number | null; days: number[] } | undefined | null): WorkTarget | null =>
  t && typeof t.week_minutes === 'number' && t.week_minutes > 0 && Array.isArray(t.days) && t.days.length ? { weekMinutes: t.week_minutes, days: t.days } : null;

/** Tagessoll in Minuten: Wochensoll gleichmäßig auf die Arbeitstage (Restminuten ab Montag), Feiertage 0 — wie App. */
export function dayTarget(t: WorkTarget | null, d: Date, hol: Map<string, string>): number {
  if (!t || !t.days.length || t.weekMinutes <= 0) return 0;
  if (!t.days.includes(d.getDay())) return 0;
  if (hol.has(dayKey(d))) return 0;
  const order = WEEK_ORDER.filter((x) => t.days.includes(x));
  const n = order.length;
  const base = Math.floor(t.weekMinutes / n);
  return base + (order.indexOf(d.getDay()) < t.weekMinutes - base * n ? 1 : 0);
}

/**
 * Soll eines Zeitraums bis heute — wie App periodSummary(until = heute): vergangene Tage voll, HEUTE erst nach
 * Feierabend voll (vorher höchstens das schon Gearbeitete), künftige Tage gar nicht. entries = Zeiten DIESER Person.
 */
export function sollUntilToday(t: WorkTarget | null, from: Date, to: Date, entries: TimeEntry[], hol: Map<string, string>, now = new Date()): number {
  if (!t) return 0;
  const today = dayKey(now);
  let soll = 0;
  for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const k = dayKey(d);
    if (k > today) break;
    const s = dayTarget(t, d, hol);
    if (!s) continue;
    if (k < today) soll += s;
    else {
      const list = entries.filter((e) => dayOf(e.started_at) === k);
      const done = list.length > 0 && list.every((e) => !!e.ended_at);
      const ist = list.reduce((x, e) => x + netMinutes(e, now), 0);
      soll += done ? s : Math.min(s, ist);
    }
  }
  return soll;
}
