// Zeitbuch-Regeln fürs Portal — gleiche Regeln wie die App InstallateurDex/mobile/src/lib/timeclock.ts (07.11.):
//  - Kunde = site_id. Ort ohne Kunde (Werkstatt/Lager, Büro, Heimarbeit, Sonstiges) und Pause stehen als Kennzeichen
//    vorn in der Notiz: „[Büro] [Pause 30 min] Angebote geschrieben“. Rest = Tätigkeit. note ≤ 300 Zeichen (zeit.sql).
//  - Arbeitszeit = Dauer − Pause im Eintrag; alte Pausen-Einträge (kind break) zählen wie bisher nicht mit.
//  - Hinweise: Pause (AT § 11 AZG / DE § 4 ArbZG), Höchstarbeitszeit (AT 12 h § 9 AZG / DE 10 h § 3 ArbZG),
//    Ruhezeit 11 h (AT § 12 AZG / DE § 5 ArbZG).

import { breakHint, dayKey, dayOf, hhmm, hm, KIND_LABEL, minutesOf, parseDay, type TimeEntry } from './logic';

export const NOTE_MAX = 300;

export type Place = 'werkstatt' | 'buero' | 'heim' | 'sonst';
export const PLACES: { id: Place; label: string; icon: string }[] = [
  { id: 'werkstatt', label: 'Werkstatt/Lager', icon: '🏭' },
  { id: 'buero', label: 'Büro', icon: '🗂️' },
  { id: 'heim', label: 'Heimarbeit', icon: '🏠' },
  { id: 'sonst', label: 'Sonstiges', icon: '📌' },
];
const placeInfo = (p: Place) => PLACES.find((x) => x.id === p)!;
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
  return { place, pauseMin, text: rest.trim() };
}

/** Ort, Pause, Tätigkeit → Notiz (wie App buildNote). */
export function buildNote(p: Partial<NoteParts>): string | null {
  const pause = Math.max(0, Math.min(999, Math.round(p.pauseMin ?? 0)));
  const tags = [p.place ? `[${placeInfo(p.place).label}]` : '', pause > 0 ? `[Pause ${pause} min]` : ''].filter(Boolean).join(' ');
  const room = NOTE_MAX - tags.length - (tags ? 1 : 0);
  const text = (p.text ?? '').trim().slice(0, Math.max(0, room)).trim();
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
export function lawHintsByDay(entries: TimeEntry[], land: 'AT' | 'DE', now = new Date()): Map<string, string[]> {
  const byDay = new Map<string, TimeEntry[]>();
  for (const e of entries) byDay.set(dayOf(e.started_at), [...(byDay.get(dayOf(e.started_at)) ?? []), e]);
  const out = new Map<string, string[]>();
  const keys = [...byDay.keys()].sort();
  for (const k of keys) {
    const list = byDay.get(k)!;
    const t = zTotals(list, now);
    const hints: string[] = [];
    const b = breakHint(t, land);
    if (b) hints.push(b);
    const max = land === 'DE' ? 600 : 720;
    if (t.paid > max) hints.push(`${hm(t.paid)} an einem Tag — mehr als die Höchstgrenze von ${max / 60} Stunden (${land === 'DE' ? '§ 3 ArbZG' : '§ 9 AZG'}).`);
    const prev = byDay.get(dayKey(addDays(parseDay(k), -1)));
    if (prev) {
      const lastEnd = prev.filter((e) => e.kind !== 'break' && e.ended_at).map((e) => e.ended_at!).sort().pop();
      const first = list.filter((e) => e.kind !== 'break').map((e) => e.started_at).sort()[0];
      if (lastEnd && first) {
        const gap = Math.round((Date.parse(first) - Date.parse(lastEnd)) / 60_000);
        if (gap >= 0 && gap < 11 * 60) hints.push(`Nur ${hm(gap)} Ruhezeit seit dem Vortag — vorgesehen sind mindestens 11 Stunden (${land === 'DE' ? '§ 5 ArbZG' : '§ 12 AZG'}).`);
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
      String(pauseOf(e, now)),
      String(netMinutes(e, now)),
      activityOf(e),
      KIND_LABEL[e.kind],
      e.edited_at ? 'korrigiert' : '',
    ]);
}
