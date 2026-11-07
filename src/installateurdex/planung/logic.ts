// Planung (Plantafel + Zeiten): reine Rechenlogik, ohne React/Netz.
// Portiert aus der App — die Ergebnisse müssen gleich sein:
//   mobile/src/lib/plan.ts      (Zeitfenster, Tagesgruppen, Kollisionen, Monteur-Farben)
//   mobile/src/lib/timeclock.ts (Woche, Summen je Tag, Pausen-Hinweis, CSV-Spalten)
// Alle Kalendertage sind LOKAL (Europe/Berlin bzw. Wien) — nie toISOString().slice(0, 10).

import type { Member } from '../../lib/orgApi';

// ---------------------------------------------------------------------------
// Datensätze (DB-Schreibweise wie plantafel.sql / zeit.sql)
// ---------------------------------------------------------------------------
export type ApptStatus = 'planned' | 'done' | 'canceled';

export interface Appt {
  id: string;
  org_id: string;
  site_id: string | null;
  asset_id: string | null;
  request_id: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  title: string;
  note: string | null;
  starts_at: string;
  ends_at: string;
  status: ApptStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Was das Portal beim Anlegen/Ändern schreibt (org_id/created_by setzt die DB bzw. der Trigger). */
export interface ApptInput {
  site_id: string | null;
  asset_id: string | null;
  request_id: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  title: string;
  note: string | null;
  starts_at: string;
  ends_at: string;
  status: ApptStatus;
}

/** Anfrage mit vom Kunden gewähltem Termin bzw. offene Anfrage (nur die Spalten, die die Plantafel braucht). */
export interface PlanRequest {
  id: string;
  site_id: string | null;
  asset_id: string | null;
  kind: 'maintenance' | 'fault' | 'quote';
  status: 'new' | 'scheduled' | 'done' | 'dismissed';
  contact_name: string | null;
  created_at: string;
  scheduled_at: string | null;
  scheduled_end: string | null;
}

export type TimeKind = 'work' | 'travel' | 'break';

export interface TimeEntry {
  id: string;
  org_id: string;
  user_id: string;
  user_name: string | null;
  kind: TimeKind;
  started_at: string;
  ended_at: string | null;
  site_id: string | null;
  note: string | null;
  edited_by: string | null;
  edited_at: string | null;
  created_at: string;
  /** In eine Rechnung übernommen (App, time_mark_billed) — fehlt, solange NACHTRAG-ZEITBUCH-2026-11-07.sql nicht eingespielt ist. */
  billed_at?: string | null;
}

/** Sollzeit je Person (Tabelle time_target, NACHTRAG-ZEITBUCH-2026-11-07.sql). week_minutes null = keine Sollzeit. */
export interface TimeTarget {
  user_id: string;
  week_minutes: number | null;
  /** Arbeitstage als getDay()-Werte (Mo = 1 … So = 0) */
  days: number[];
}

export interface TimePatch {
  kind: TimeKind;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  /** Kunde (Zeitbuch) — null = ohne Kunde (ein Ort steht dann als Kennzeichen in der Notiz, siehe zeitbuch.ts) */
  site_id?: string | null;
}

// ---------------------------------------------------------------------------
// Kalender (wie App lib/timeclock.ts)
// ---------------------------------------------------------------------------
const two = (n: number) => String(n).padStart(2, '0');

export const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Lokaler Kalendertag JJJJ-MM-TT — wie App timeclock.ts dayKey */
export const dayKey = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** Lokaler Tag eines Zeitpunkts — wie App plan.ts dayOf */
export const dayOf = (iso: string) => dayKey(new Date(iso));

/** 'JJJJ-MM-TT' als lokale Mitternacht */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Montag 00:00 (lokal) der Woche von `d` — wie App timeclock.ts weekStart */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // Mo = 0
  x.setDate(x.getDate() - wd);
  return x;
}

/** Lokales Datum + n Tage (Sommerzeit-sicher, weil über setDate). */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** ISO-Kalenderwoche — wie App timeclock.ts isoWeek */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7); // fehlermuster-ok: ISO-Woche, reine UTC-Datumsrechnung
}

/** „03.11.“ */
export const deDate = (d: Date) => `${two(d.getDate())}.${two(d.getMonth() + 1)}.`;

/** „08:30“ (lokale Zeit) */
export const hhmm = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** „HH:MM“ oder „H.MM“ / „HHMM“ → [h, m] — wie App PlanScreen/TimesScreen parseHm */
export function parseHm(s: string): [number, number] | null {
  const m = s.trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  return m && +m[1] < 24 && +m[2] < 60 ? [+m[1], +m[2]] : null;
}

/** Lokaler Zeitpunkt an einem Tag — wie App plan.ts slotRange */
export function atLocal(dayKeyStr: string, hm: [number, number]): Date {
  const d = parseDay(dayKeyStr);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hm[0], hm[1]);
}

// ---------------------------------------------------------------------------
// Plantafel (wie App lib/plan.ts)
// ---------------------------------------------------------------------------
export interface Slot {
  id: string;
  label: string;
  from: string;
  to: string;
}

/** Übliche Zeitfenster im Handwerk — wie App plan.ts SLOTS */
export const SLOTS: Slot[] = [
  { id: 'am1', label: '08–10', from: '08:00', to: '10:00' },
  { id: 'am2', label: '10–12', from: '10:00', to: '12:00' },
  { id: 'pm1', label: '13–15', from: '13:00', to: '15:00' },
  { id: 'pm2', label: '15–17', from: '15:00', to: '17:00' },
  { id: 'day', label: 'ganztags', from: '08:00', to: '16:00' },
];

/** Schnellwahl „Was“ — wie App plan.ts TITLES */
export const TITLES = ['Wartung', 'Störung', 'Inbetriebnahme', 'Besichtigung', 'Reparatur'];

/** Grenzen aus plantafel.sql (Check-Constraints) */
export const APPT_MAX_HOURS = 14;
export const APPT_TITLE_MAX = 120;
export const APPT_NOTE_MAX = 500;

export const APPT_STATUS_LABELS: Record<ApptStatus, string> = {
  planned: 'Geplant',
  done: 'Erledigt',
  canceled: 'Abgesagt',
};

/** Titel eines vom Kunden gewählten Termins — wie App PlanScreen (fromReq) */
export function requestTitle(kind: PlanRequest['kind']): string {
  return kind === 'fault' ? 'Störung' : kind === 'quote' ? 'Besichtigung' : 'Wartung';
}

/** Termine eines Tages, nach Beginn sortiert (abgesagte ans Ende) — wie App plan.ts forDay */
export function forDay<T extends { starts_at: string; status: ApptStatus }>(list: T[], day: string): T[] {
  return list
    .filter((a) => dayOf(a.starts_at) === day)
    .sort(
      (x, y) =>
        (x.status === 'canceled' ? 1 : 0) - (y.status === 'canceled' ? 1 : 0) || x.starts_at.localeCompare(y.starts_at),
    );
}

/** Überschneidungen je Monteur (gleiche Person, Zeiten überlappen) — wie App plan.ts conflicts */
export function conflicts(list: Pick<Appt, 'id' | 'assigned_to' | 'starts_at' | 'ends_at' | 'status'>[]): Set<string> {
  const out = new Set<string>();
  // Zeitpunkte als Zahl vergleichen (App vergleicht ISO-Texte — gleiche Wirkung, solange alle aus toISOString kommen;
  // vom Server kommen sie als „+00:00“, darum hier über Date.parse).
  const active = list
    .filter((a) => a.status !== 'canceled' && a.assigned_to)
    .map((a) => ({ id: a.id, who: a.assigned_to, s: Date.parse(a.starts_at), e: Date.parse(a.ends_at) }));
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.who !== b.who) continue;
      if (a.s < b.e && b.s < a.e) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  return out;
}

/** Feste Farbe je Monteur (Reihenfolge der Mitgliederliste = list_members) — wie App plan.ts LANE_COLORS */
export const LANE_COLORS = ['#B5651D', '#2563EB', '#16A34A', '#9333EA', '#DC2626', '#0891B2', '#CA8A04', '#DB2777'];
export const laneColor = (index: number) => LANE_COLORS[((index % LANE_COLORS.length) + LANE_COLORS.length) % LANE_COLORS.length];

/** „max.mustermann@…“ → „Max Mustermann“ — wie App plan.ts nameFromEmail */
export function nameFromEmail(email: string): string {
  const local = (email.split('@')[0] ?? '').replace(/[._-]+/g, ' ').trim();
  return local
    ? local
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : 'Monteur';
}

export interface PlanMember {
  userId: string;
  name: string;
  color: string;
  isMe: boolean;
  role: Member['role'];
}

/** Team mit Farbe je Person — wie App data/plan.ts planMembers (gleiche Reihenfolge → gleiche Farben). */
export function planMembers(members: Member[], myId: string | null): PlanMember[] {
  return members.map((m, i) => ({
    userId: m.user_id,
    name: nameFromEmail(m.email),
    color: laneColor(i),
    isMe: m.user_id === myId,
    role: m.role,
  }));
}

// ---------------------------------------------------------------------------
// Zeiten (wie App lib/timeclock.ts)
// ---------------------------------------------------------------------------
export const KIND_LABEL: Record<TimeKind, string> = { work: 'Arbeit', travel: 'Fahrt', break: 'Pause' };
export const KIND_ICON: Record<TimeKind, string> = { work: '🔧', travel: '🚐', break: '☕' };
export const MAX_ENTRY_MS = 24 * 3600_000;
/** RLS time_update: eigene Einträge 7 Tage änderbar (danach nur der Inhaber) */
export const OWN_EDIT_DAYS = 7;
/** RLS time_delete: eigene Einträge bis 24 Stunden nach dem Anlegen löschbar */
export const OWN_DELETE_HOURS = 24;

/** Dauer in Minuten (laufende Einträge bis `now`, gedeckelt auf 24 h) — wie App timeclock.ts minutesOf */
export function minutesOf(e: Pick<TimeEntry, 'started_at' | 'ended_at'>, now = new Date()): number {
  const start = Date.parse(e.started_at);
  const end = e.ended_at ? Date.parse(e.ended_at) : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round(Math.min(end - start, MAX_ENTRY_MS) / 60_000);
}

export interface Totals {
  work: number;
  travel: number;
  break: number;
  /** Arbeitszeit = Arbeit + Fahrt (Pausen zählen nicht) */
  paid: number;
}

export const emptyTotals = (): Totals => ({ work: 0, travel: 0, break: 0, paid: 0 });

/** Summen über Einträge — gleiche Regel wie App timeclock.ts totalsByDay (Pause zählt nicht zur Arbeitszeit). */
export function totalsOf(entries: Pick<TimeEntry, 'kind' | 'started_at' | 'ended_at'>[], now = new Date()): Totals {
  const t = emptyTotals();
  for (const e of entries) {
    const m = minutesOf(e, now);
    t[e.kind] += m;
    if (e.kind !== 'break') t.paid += m;
  }
  return t;
}

/** 125 → „2:05 h“ — wie App timeclock.ts hm */
export const hm = (min: number) => `${Math.floor(Math.max(0, min) / 60)}:${String(Math.max(0, min) % 60).padStart(2, '0')} h`;

/** Hinweis nach Arbeitszeitgesetz — wie App timeclock.ts breakHint (DE § 4 ArbZG, AT § 11 AZG). */
export function breakHint(t: Pick<Totals, 'paid' | 'break'>, land: 'AT' | 'DE' = 'AT'): string | null {
  const need = t.paid > 9 * 60 && land === 'DE' ? 45 : t.paid > 6 * 60 ? 30 : 0;
  return need > t.break
    ? `Bei ${hm(t.paid)} Arbeitszeit sind mindestens ${need} Minuten Pause vorgesehen (${land === 'DE' ? '§ 4 ArbZG' : '§ 11 AZG'}).`
    : null;
}

/** CSV-Zeilen wie App timeclock.ts toCsv: Datum;Person;Art;Beginn;Ende;Minuten;Notiz;Hinweis (nach Beginn sortiert). */
export const TIME_CSV_HEADER = ['Datum', 'Person', 'Art', 'Beginn', 'Ende', 'Minuten', 'Notiz', 'Hinweis'];
export function timeCsvRows(entries: TimeEntry[], nameOf: (e: TimeEntry) => string, now = new Date()): string[][] {
  return [...entries]
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
    .map((e) => [
      dayOf(e.started_at).split('-').reverse().join('.'),
      nameOf(e),
      KIND_LABEL[e.kind],
      hhmm(e.started_at),
      e.ended_at ? hhmm(e.ended_at) : 'läuft',
      String(minutesOf(e, now)),
      e.note ?? '',
      e.edited_at ? 'korrigiert' : '',
    ]);
}
