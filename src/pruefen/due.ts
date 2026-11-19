// Fälligkeit je Einheit — gleiche Regeln wie die Apps (mobile/src/lib/due.ts): letzte gültige Prüfung der
// Fälligkeits-Art + Frist, gerechnet in LOKALEN Kalendertagen (nie über toISOString — Zeitzone/Sommerzeit).
// Eine Einheit mit offenem Sperr-Mangel gilt als „gesperrt“, egal wie frisch die Prüfung ist.

const DAY_MS = 86_400_000;

/** Ab so vielen Tagen Restlaufzeit gilt eine Prüfung als „bald fällig“. */
export const DUE_SOON_DAYS = 30;

export type DueState = 'never' | 'overdue' | 'soon' | 'ok';
export type UnitState = DueState | 'blocked';

export interface DueInfo {
  state: DueState;
  dueAt: Date | null;
  /** Ganze Kalendertage bis zur Fälligkeit (0/negativ = fällig/überfällig); null = noch nie geprüft. */
  daysLeft: number | null;
}

/** Fälligkeitstag als lokaler Kalendertag. Volle Jahre laufen über den Kalender (05.11. → 05.11., 29.02. → 28.02.). */
function dueDay(fromIso: string, days: number): Date {
  const f = new Date(fromIso);
  if (days % 365 === 0) {
    const t = new Date(f.getFullYear() + days / 365, f.getMonth(), 1);
    t.setDate(Math.min(f.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
    return t;
  }
  return new Date(f.getFullYear(), f.getMonth(), f.getDate() + days);
}

function calendarDaysUntil(day: Date): number {
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return Math.round((d.getTime() - today.getTime()) / DAY_MS);
}

/** Eigene Frist-Regel einer App: Fälligkeitstag nach einer Prüfung am Tag `last` (HebeDex: Monate, in Österreich mit Jahresgrenze). */
export type DueDateFn = (last: Date) => Date;

export function dueInfo(
  lastAt: string | undefined,
  intervalDays: number,
  soonDays: number = DUE_SOON_DAYS,
  custom?: DueDateFn,
): DueInfo {
  if (!lastAt) return { state: 'never', dueAt: null, daysLeft: null };
  const days = Number.isFinite(intervalDays) && intervalDays > 0 ? intervalDays : 365;
  const dueAt = custom ? custom(new Date(lastAt)) : dueDay(lastAt, days);
  const daysLeft = calendarDaysUntil(dueAt);
  const state: DueState = daysLeft <= 0 ? 'overdue' : daysLeft <= soonDays ? 'soon' : 'ok';
  return { state, dueAt, daysLeft };
}

export function fmtDay(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export interface InspMeta {
  unitId: string;
  type: string;
  startedAt: string;
  canceled: boolean;
}

/**
 * Jüngste gültige (nicht stornierte) Prüfung der Fälligkeits-Art je Einheit (im Orts-Modus je Ort).
 * @param dueKind eine Prüfart oder mehrere, die dieselbe Frist erfüllen (SpielDex: operativ + Hauptinspektion)
 */
export function lastDueByUnit(meta: InspMeta[], dueKind: string | readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  const kinds = typeof dueKind === 'string' ? [dueKind] : dueKind;
  for (const i of meta) {
    if (i.canceled || !kinds.includes(i.type)) continue;
    const prev = map.get(i.unitId);
    if (!prev || i.startedAt > prev) map.set(i.unitId, i.startedAt);
  }
  return map;
}

export function unitState(info: DueInfo, blocked: boolean): UnitState {
  return blocked ? 'blocked' : info.state;
}

/** Reihenfolge in Listen: Dringendes zuerst. */
export const STATE_ORDER: Record<UnitState, number> = { blocked: 0, overdue: 1, never: 2, soon: 3, ok: 4 };

/** Eine Zeile für Listen: „bis wann gilt die Prüfung / wann muss ich wieder?“ */
export function dueLine(info: DueInfo, kindShort: string): string {
  if (info.state === 'never') return `Noch nie geprüft (${kindShort}) — jetzt fällig`;
  const day = fmtDay(info.dueAt!);
  if (info.state === 'overdue') {
    const days = Math.abs(info.daysLeft ?? 0);
    return days === 0 ? `Heute fällig (${day})` : `Überfällig seit ${days} ${days === 1 ? 'Tag' : 'Tagen'} (${day})`;
  }
  if (info.state === 'soon') return `Fällig in ${info.daysLeft} ${info.daysLeft === 1 ? 'Tag' : 'Tagen'} (${day})`;
  return `Geprüft bis ${day}`;
}

/**
 * Serienprüfung: nächste fällige Einheit (überfällig vor nie geprüft vor bald fällig) — ohne die gerade geprüfte
 * und ohne gesperrte. null = nichts mehr fällig.
 */
export function nextDueAfter<T extends { id: string; retired: boolean }>(
  units: T[],
  last: Map<string, string>,
  intervalDays: number,
  excludeIds: Set<string>,
  blocked: Set<string>,
  custom?: DueDateFn,
): { next: T; count: number } | null {
  const due = units
    .filter((u) => !excludeIds.has(u.id) && !u.retired && !blocked.has(u.id))
    .map((u) => ({ u, info: dueInfo(last.get(u.id), intervalDays, DUE_SOON_DAYS, custom) }))
    .filter((e) => e.info.state !== 'ok')
    .sort((a, b) => STATE_ORDER[a.info.state] - STATE_ORDER[b.info.state]);
  return due.length ? { next: due[0].u, count: due.length } : null;
}
