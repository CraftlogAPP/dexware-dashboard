// PinnDex — reine Logik (keine Abfragen): Kalendertage, Arbeitszeit, Sortierung, Zeiten-Summen.
// Suite-Datumsregel: Kalendertage immer LOKAL (dayKey), nie über toISOString().slice(0, 10).

import { OPEN_STATUSES, type Job, type JobStatus, type PinnMember } from './types';

export const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Lokaler Kalendertag JJJJ-MM-TT. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** JJJJ-MM-TT als lokale Mitternacht. */
export function parseDay(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Tage addieren über das Kalenderdatum (Sommer-/Winterzeit-sicher). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Montag der Woche. */
export function weekStart(d: Date): Date {
  const s = startOfDay(d);
  const wd = (s.getDay() + 6) % 7;
  return addDays(s, -wd);
}

export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** ISO-Kalenderwoche. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

export const ddmm = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
export const ddmmyyyy = (d: Date) => `${ddmm(d)}${d.getFullYear()}`;
export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** „Di 11.11.“ */
export const dayShort = (d: Date) => `${WD_SHORT[d.getDay()]} ${ddmm(d)}`;
/** „Di 11.11. 07:12“ */
export const stamp = (iso: string) => `${dayShort(new Date(iso))} ${hhmm(iso)}`;

/** Kalendertag eines Termins (lokal) oder null. */
export const jobDay = (j: Job): string | null => (j.scheduled_at ? dayKey(new Date(j.scheduled_at)) : null);

export const isOpen = (s: JobStatus) => OPEN_STATUSES.includes(s);

/**
 * Arbeitszeit jetzt: abgeschlossene Strecken (work_seconds, vom Server aus den Ereignissen gerechnet)
 * + die laufende Strecke seit dem letzten Start/Weiter.
 */
export function workSecondsNow(j: Job, runningSince: string | null | undefined, now: number): number {
  const base = Math.max(0, j.work_seconds || 0);
  if (j.status !== 'running') return base;
  const since = j.running_since ?? runningSince ?? (base === 0 ? j.started_at : null);
  if (!since) return base;
  return base + Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
}

/** „2:05 h“ bzw. „45 min“ — für Summen und Listen. */
export function fmtWork(sec: number): string {
  const m = Math.round(Math.max(0, sec) / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}:${pad(m % 60)} h`;
}

/** „1:02:33“ — mitlaufende Uhr. */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Dezimalstunden mit Komma (für CSV/Lohn). */
export const decimalHours = (sec: number) =>
  (Math.round((sec / 3600) * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

export function fmtDuration(min: number | null): string {
  if (!min) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}:${pad(r)} h` : `${h} h`;
}

const STATUS_RANK: Record<JobStatus, number> = { running: 0, paused: 1, seen: 2, new: 3, done: 4, canceled: 5 };

/** Reihenfolge in einer Spalte: laufende oben, dann nach Uhrzeit, ohne Uhrzeit danach, Erledigtes/Abgesagtes unten. */
export function sortJobs(list: Job[]): Job[] {
  return [...list].sort((a, b) => {
    const fa = a.status === 'done' || a.status === 'canceled';
    const fb = b.status === 'done' || b.status === 'canceled';
    if (fa !== fb) return fa ? 1 : -1;
    if ((a.status === 'running') !== (b.status === 'running')) return a.status === 'running' ? -1 : 1;
    const ta = a.scheduled_at ? Date.parse(a.scheduled_at) : Infinity;
    const tb = b.scheduled_at ? Date.parse(b.scheduled_at) : Infinity;
    if (ta !== tb) return ta - tb;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.created_at.localeCompare(b.created_at);
  });
}

export const memberName = (m: PinnMember | undefined | null) => (m ? m.display_name?.trim() || 'Ohne Namen' : 'Nicht zugewiesen');

/** Spaltenfarbe je Person: eigene Farbe aus der App, sonst feste Reihe. */
const FALLBACK_COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#2dd4bf', '#f97316'];
export function memberColor(m: PinnMember | undefined, index = 0): string {
  if (m?.color && /^#[0-9a-f]{6}$/i.test(m.color)) return m.color;
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

/** Gehört die Karte (für den Monteur) zu „meinen“? Hauptmonteur oder Helfer. */
export const isMine = (j: Job, uid: string) => j.assignee_id === uid || (j.helper_ids ?? []).includes(uid);

/**
 * Wer darf Aufträge bekommen (Zugewiesener/Helfer)? Nur aktive Monteure und der Chef — nie das Büro (Entscheidung
 * 12.11.2026; Server: pinn_assignable/job_before_write, Fehler „assignee is office“/„helper is office“).
 */
export const canGetJobs = (m: Pick<PinnMember, 'active' | 'role'> | null | undefined) => !!m && m.active && (m.role === 'owner' || m.role === 'worker');

/** Verständliche Meldungen zu den Büro-Regeln (Server-Codes aus schema.sql), sonst null. */
export function officeRuleMessage(msg: string | undefined): string | null {
  if (/assignee is office|helper is office/i.test(msg ?? '')) return 'Büro-Mitglieder bekommen keine Aufträge. Aufträge gehen an Monteure oder an den Chef.';
  if (/member has open jobs/i.test(msg ?? '')) return 'Diese Person hat noch offene Aufträge. Gib sie erst jemand anderem (oder sag sie ab) – dann kann sie ins Büro wechseln.';
  return null;
}

/** Lokales Datum + Uhrzeit (Eingabefelder) → ISO mit Zeitzone. Leerer Tag = kein Termin. */
export function scheduledIso(day: string, time: string): string | null {
  if (!day) return null;
  const d = parseDay(day);
  const [h, m] = (time || '00:00').split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

/** Termin auf einen anderen Kalendertag legen, Uhrzeit bleibt (beim Ziehen in der Wochenansicht). */
export function moveToDay(iso: string | null, day: string): string {
  const d = parseDay(day);
  if (iso) {
    const old = new Date(iso);
    d.setHours(old.getHours(), old.getMinutes(), 0, 0);
  } else {
    d.setHours(8, 0, 0, 0);
  }
  return d.toISOString();
}

export type Period = 'week' | 'month';

export function periodRange(kind: Period, anchor: Date): { from: Date; to: Date; label: string } {
  if (kind === 'week') {
    const from = weekStart(anchor);
    const to = addDays(from, 7);
    return { from, to, label: `KW ${isoWeek(from)} · ${ddmm(from)}–${ddmmyyyy(addDays(to, -1))}` };
  }
  const from = monthStart(anchor);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  return { from, to, label: `${MONTHS[from.getMonth()]} ${from.getFullYear()}` };
}

/** Welcher Tag zählt für die Zeiten: Fertig-Zeitpunkt, sonst Start (laufende/pausierte Karten). */
export const workDay = (j: Job): string | null => {
  const iso = j.finished_at ?? j.started_at;
  return iso ? dayKey(new Date(iso)) : null;
};

export interface WorkerTimes {
  userId: string | null;
  name: string;
  jobs: Job[];
  seconds: number;
  done: number;
  fixed: number;
}

/**
 * Zeiten je Monteur im Zeitraum. Gezählt wird beim Hauptmonteur (assignee_id) — work_seconds ist je Karte,
 * nicht je Person. Korrigierte Karten (job_event time_fix) zählen extra.
 */
export function timesByWorker(
  jobs: Job[],
  members: PinnMember[],
  fixedIds: Set<string>,
  runningSince: Record<string, string>,
  now: number,
): WorkerTimes[] {
  const map = new Map<string, WorkerTimes>();
  const byId = new Map(members.map((m) => [m.user_id, m]));
  for (const j of jobs) {
    const key = j.assignee_id ?? 'none';
    let row = map.get(key);
    if (!row) {
      row = { userId: j.assignee_id, name: memberName(byId.get(j.assignee_id ?? '')), jobs: [], seconds: 0, done: 0, fixed: 0 };
      map.set(key, row);
    }
    row.jobs.push(j);
    row.seconds += workSecondsNow(j, runningSince[j.id], now);
    if (j.status === 'done') row.done += 1;
    if (fixedIds.has(j.id)) row.fixed += 1;
  }
  for (const r of map.values()) r.jobs.sort((a, b) => (workDay(a) ?? '').localeCompare(workDay(b) ?? '') || a.title.localeCompare(b.title));
  return [...map.values()].sort((a, b) => (a.userId === null ? 1 : b.userId === null ? -1 : a.name.localeCompare(b.name, 'de')));
}

/** Freitextsuche über Titel, Kunde, Adresse, Notizen. */
export function matchesSearch(j: Job, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [j.title, j.customer_name, j.address, j.note, j.done_note].some((v) => (v ?? '').toLowerCase().includes(s));
}

/** Google-Maps-Link für die Adresse (Route im Browser/Handy). */
export const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** tel:-Link nur mit Ziffern und + (kein Einschleusen anderer Schemata). */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Neue ID wie „vom Gerät“ (job.id uuid). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Rückfall für alte Browser (http ohne sicheren Kontext)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
