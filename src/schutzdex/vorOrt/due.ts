// SchutzDex — Fälligkeits-Logik, 1:1 aus der App übernommen (SchutzDex/src/lib/due.ts).
// Bewusst ohne Abhängigkeiten: tests/schutzdex-vor-ort.test.mjs lädt diese Datei UND die der App und vergleicht
// beide Wert für Wert. Wer hier etwas ändert, muss es in der App genauso ändern (und umgekehrt).
//
// Fälligkeits-Logik: Wann ist die nächste jährliche Unterweisung je Mitarbeiter
// fällig? (ArbSchG § 12 / DGUV Vorschrift 1 § 4 — mindestens einmal jährlich.)
// EINE Quelle für Listen-Badges, Fälligkeits-Zeilen, das Dashboard und die
// Fristen-Erinnerung (lib/notifications.ts).

const DAY_MS = 86_400_000;

/** Fälligkeitstag als LOKALER Kalendertag. Volle Jahre (365er-Vielfache) laufen über den
 *  Kalender (05.11. → 05.11., 29.02. → 28.02.), sonst Kalendertage — sommerzeitfest. */
function dueDay(fromIso: string, days: number): Date {
  const f = new Date(fromIso);
  if (days % 365 === 0) {
    const t = new Date(f.getFullYear() + days / 365, f.getMonth(), 1);
    t.setDate(Math.min(f.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
    return t;
  }
  return new Date(f.getFullYear(), f.getMonth(), f.getDate() + days);
}

/** Ganze Kalendertage von heute bis zum Tag (0 = heute, negativ = vorbei). */
function calendarDaysUntil(day: Date, n: Date = new Date()): number {
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return Math.round((d.getTime() - today.getTime()) / DAY_MS);
}

/** Gültigkeitsdauer einer Unterweisung in Tagen (jährliche Pflicht). */
export const UNTERWEISUNG_VALID_DAYS = 365;

/** Ab so vielen Tagen Restlaufzeit gilt eine Unterweisung als „bald fällig". */
export const DUE_SOON_DAYS = 30;

/** So viele Tage vor der Fälligkeit kommt die Vorwarnung (lib/notifications.ts). */
export const DUE_PRE_DAYS = 14;

export type DueState = 'never' | 'overdue' | 'soon' | 'ok';

export interface DueInfo {
  state: DueState;
  /** Fälligkeitsdatum (letzte bestandene Unterweisung + Gültigkeit); null = noch nie unterwiesen. */
  dueAt: Date | null;
  /** Ganze Tage bis zur Fälligkeit (0/negativ = fällig/überfällig); null = noch nie unterwiesen. */
  daysLeft: number | null;
}

/** Minimal-Form eines Nachweises für die Fälligkeits-Rechnung. */
export interface CompletionLike {
  member_id: string | null;
  briefing_id?: string | null;
  check_passed: boolean;
  abgeschlossen_am: string;
}

const pairKey = (memberId: string, briefingId: string) => `${memberId}|${briefingId}`;

/**
 * Letzter bestandener Nachweis je Paar Mitarbeiter × Unterweisung (ISO-Timestamp). Nur bestandene
 * Nachweise zählen — eine durchgefallene Unterweisung erneuert die Frist nicht. Nachweise ohne
 * Unterweisung (inzwischen gelöscht) zählen für keine der heutigen Unterweisungen.
 *
 * Früher wurde je Mitarbeiter über ALLE Themen gerechnet: ein bestandenes Thema („Leitern“) färbte den
 * Mitarbeiter ein Jahr grün, obwohl „Gefahrstoffe“ nie unterwiesen war.
 */
export function lastPassedByPair(completions: CompletionLike[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of completions) {
    if (!c.check_passed || !c.member_id || !c.briefing_id) continue;
    const k = pairKey(c.member_id, c.briefing_id);
    const prev = map.get(k);
    if (!prev || c.abgeschlossen_am > prev) map.set(k, c.abgeschlossen_am);
  }
  return map;
}

/**
 * Gesamtstand eines Mitarbeiters über die Unterweisungen des Betriebs:
 *  none    — der Betrieb hat noch keine Unterweisung angelegt
 *  ok      — ALLE Unterweisungen aktuell bestanden
 *  soon    — alle aktuell, mindestens eine läuft bald ab
 *  partial — mindestens eine noch nie bestanden, keine abgelaufen (neutral, kein Alarm)
 *  expired — mindestens eine früher bestandene ist abgelaufen
 */
export type MemberState = 'none' | 'ok' | 'soon' | 'partial' | 'expired';

export interface MemberStatus {
  state: MemberState;
  /** Unterweisungen des Betriebs. */
  total: number;
  /** Davon aktuell bestanden. */
  current: number;
  /** Früher bestanden, inzwischen abgelaufen. */
  expired: number;
  /** Noch nie bestanden. */
  missing: number;
  /** Früheste Fälligkeit unter den aktuell bestandenen. */
  nextDue: Date | null;
  /** Stand je Unterweisung, in der Reihenfolge von briefingIds. */
  items: { briefingId: string; info: DueInfo }[];
}

/**
 * Stand eines Mitarbeiters je Unterweisung. Zuordnungen (Tabelle assignment) nutzt die App nicht —
 * deshalb gilt jede Unterweisung des Betriebs für jeden aktiven Mitarbeiter.
 */
export function memberStatus(
  memberId: string,
  briefingIds: string[],
  lastPassed: Map<string, string>,
  now: Date = new Date(),
): MemberStatus {
  const items = briefingIds.map((briefingId) => ({
    briefingId,
    info: dueInfo(lastPassed.get(pairKey(memberId, briefingId)), now),
  }));
  let current = 0;
  let expired = 0;
  let missing = 0;
  let soon = false;
  let nextDue: Date | null = null;
  for (const { info } of items) {
    if (info.state === 'never') missing++;
    else if (info.state === 'overdue') expired++;
    else {
      current++;
      if (info.state === 'soon') soon = true;
      if (info.dueAt && (!nextDue || info.dueAt.getTime() < nextDue.getTime())) nextDue = info.dueAt;
    }
  }
  const state: MemberState =
    items.length === 0 ? 'none' : expired > 0 ? 'expired' : missing > 0 ? 'partial' : soon ? 'soon' : 'ok';
  return { state, total: items.length, current, expired, missing, nextDue, items };
}

/** Eine Zeile zum Gesamtstand — ehrlich, aber ohne Alarm, solange nichts abgelaufen ist. */
export function memberStatusLabel(s: MemberStatus): string {
  const von = `${s.current} von ${s.total} ${s.total === 1 ? 'Unterweisung' : 'Unterweisungen'} aktuell`;
  switch (s.state) {
    case 'none':
      return 'Noch keine Unterweisung angelegt';
    case 'ok':
      return s.total === 1
        ? `Unterwiesen — gültig bis ${fmtDate(s.nextDue!)}`
        : `Alle ${s.total} Unterweisungen aktuell — nächste fällig am ${fmtDate(s.nextDue!)}`;
    case 'soon':
      return `Nächste Unterweisung fällig am ${fmtDate(s.nextDue!)}`;
    case 'partial':
      return von;
    case 'expired':
      return `${s.expired} abgelaufen · ${von}`;
  }
}

/** Kurzes Badge zum Gesamtstand. „Unterwiesen ✓“ nur, wenn ALLE Unterweisungen aktuell bestanden sind. */
export function memberStatusBadge(s: MemberStatus): string {
  switch (s.state) {
    case 'none':
      return '';
    case 'ok':
      return 'Unterwiesen ✓';
    case 'soon':
      return 'Bald fällig';
    case 'partial':
      return `${s.current} von ${s.total}`;
    case 'expired':
      return 'Abgelaufen';
  }
}

/** Fälligkeit aus der letzten bestandenen Unterweisung (undefined = noch nie unterwiesen). */
export function dueInfo(lastPassedAt: string | undefined, now: Date = new Date()): DueInfo {
  if (!lastPassedAt) return { state: 'never', dueAt: null, daysLeft: null };
  const dueAt = dueDay(lastPassedAt, UNTERWEISUNG_VALID_DAYS);
  const daysLeft = calendarDaysUntil(dueAt, now);
  const state: DueState = daysLeft <= 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'soon' : 'ok';
  return { state, dueAt, daysLeft };
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Menschenlesbare Fälligkeits-Zeile — beantwortet die Kundenfrage „bis wann gilt
 * die Unterweisung / wann muss ich wieder unterweisen?" in einem Satz.
 */
export function dueLabel(info: DueInfo): string {
  if (info.state === 'never') return 'Noch nicht unterwiesen';
  if (info.state === 'overdue') {
    const days = Math.abs(info.daysLeft ?? 0);
    return days === 0
      ? `Unterweisung heute fällig (${fmtDate(info.dueAt!)})`
      : `Überfällig seit ${days} ${days === 1 ? 'Tag' : 'Tagen'} — war fällig am ${fmtDate(info.dueAt!)}`;
  }
  if (info.state === 'soon') {
    return `Fällig in ${info.daysLeft} ${info.daysLeft === 1 ? 'Tag' : 'Tagen'} — am ${fmtDate(info.dueAt!)}`;
  }
  return `Gültig bis ${fmtDate(info.dueAt!)} — dann erneut unterweisen`;
}

