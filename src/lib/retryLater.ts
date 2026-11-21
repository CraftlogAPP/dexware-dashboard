// Vom Server abgelehnte Einträge (kein Netzproblem, sondern ein klares Nein — z. B. Mitgliedschaft entfernt) nicht
// jede Minute samt Fotos neu senden: Das kostete am Handy Datenvolumen und Akku und ändert am Nein meist nichts.
// Wartezeit wächst mit jedem Fehlversuch: 5 Min → 15 Min → 1 Std → 3 Std → danach alle 6 Std.
// „Jetzt senden“ versucht sofort (force). Gemeinsam für alle Handy-Ansichten (Außendienst, Vor Ort).

export interface RejectInfo {
  /** Meldung des Servers (gesetzt = abgelehnt, kein Netzproblem) */
  lastError?: string;
  /** Zeitpunkt der letzten Ablehnung (ISO) */
  failedAt?: string;
  /** Zahl der Ablehnungen in Folge */
  tries?: number;
}

const STEPS_MIN = [5, 15, 60, 180, 360];

function waitMs(r: RejectInfo): number {
  const i = Math.min(Math.max((r.tries ?? 1) - 1, 0), STEPS_MIN.length - 1);
  return STEPS_MIN[i] * 60 * 1000;
}

/** Wann der nächste automatische Versuch fällig ist (null = sofort / nicht abgelehnt). */
export function nextTryAt(r: RejectInfo): Date | null {
  if (!r.lastError) return null;
  const at = Date.parse(r.failedAt ?? '');
  if (!Number.isFinite(at)) return null; // ältere Einträge ohne Zeitpunkt: einmal sofort, danach mit Wartezeit
  return new Date(at + waitMs(r));
}

/** Darf der automatische Versuch diesen Eintrag jetzt senden? */
export function retryDue(r: RejectInfo, now = Date.now()): boolean {
  const next = nextTryAt(r);
  return !next || now >= next.getTime();
}

/** Ablehnung vermerken (zählt die Versuche hoch, merkt den Zeitpunkt). */
export function markRejected<T extends RejectInfo>(r: T, error: string, now = new Date()): T {
  return { ...r, lastError: error, failedAt: now.toISOString(), tries: (r.tries ?? 0) + 1 };
}

/** „ · nächster automatischer Versuch 14:20“ für die Anzeige abgelehnter Einträge (lokale Zeit). */
export function nextTryLabel(r: RejectInfo): string {
  const at = nextTryAt(r);
  if (!at || at.getTime() <= Date.now()) return ' · wird beim nächsten Durchgang erneut versucht';
  const time = at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const sameDay = at.toDateString() === new Date().toDateString();
  return ` · nächster automatischer Versuch ${time} Uhr${sameDay ? '' : ` am ${at.toLocaleDateString('de-DE')}`}`;
}
