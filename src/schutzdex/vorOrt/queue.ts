// Unterschriebene Nachweise sichern und senden: ERST auf dem Gerät sichern (samt Unterschrift), DANN zum Server.
// Ohne Netz bleibt der Nachweis auf dem Gerät und wird später nachgesendet — abgeschlossen_am bleibt der Zeitpunkt
// der Unterschrift. Wiederholen ist unschädlich: feste ID je Unterschrift, „gibt es schon“ zählt als gespeichert —
// nichts doppelt. Vorbild: die Warteschlange der App (src/lib/queries.ts → createCompletion / flushCompletions:
// je Nutzer, der Reihe nach, Stopp beim ersten Netzfehler; abgelehnte Einträge bleiben erhalten und blockieren nichts).

import { isNetworkError } from '../../pruefen/backend';
import { createSignal, kvDel, kvList, kvPut } from '../../pruefen/kv';
import { markRejected, retryDue } from '../../lib/retryLater';
import type { SdBackend, SdCompletion } from './backend';
import type { CompletionRow } from './rows';

export interface Pending {
  key: string;
  userId: string;
  row: CompletionRow;
  /** Thema der Unterweisung — für die Anzeige (der Name des Mitarbeiters steht in row.signed_name) */
  briefingTitel: string;
  /** Die Datenbank kannte die neuen Felder nicht → ohne Thema/Inhaltsversion/unterweisende Person gespeichert. */
  fieldsDropped?: boolean;
  /** Server hat abgelehnt (kein Netzproblem) — Meldung für die Anzeige. */
  lastError?: string;
  /** letzte Ablehnung + Zahl der Ablehnungen — wachsende Wartezeit (src/lib/retryLater.ts) */
  failedAt?: string;
  tries?: number;
}

const prefix = (userId: string) => `schutzdex:wartend:${userId}:`;
export const pendingKey = (userId: string, id: string) => `${prefix(userId)}${id}`;

export async function listPending(userId: string): Promise<Pending[]> {
  return (await kvList<Pending>(prefix(userId))).sort((a, b) => a.row.abgeschlossen_am.localeCompare(b.row.abgeschlossen_am));
}
export const deletePending = (key: string) => kvDel(key);

const signal = createSignal();
export const onPendingChanged = signal.on;
export const emitPendingChanged = signal.emit;

/** Anmeldung abgelaufen / Server kurz weg: später erneut, kein „abgelehnt“. */
function isRetryLater(e: unknown): boolean {
  const err = e as { code?: string; message?: string; status?: number; statusCode?: string | number } | null;
  const m = String(err?.message ?? '');
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  return (
    err?.code === 'PGRST301' ||
    err?.code === 'PGRST303' ||
    status === 401 ||
    status >= 500 ||
    /jwt expired|invalid jwt|not authenticated|unauthorized|bad gateway|service unavailable|gateway timeout/i.test(m)
  );
}

const later = (e: unknown) => isNetworkError(e) || isRetryLater(e);

function errorText(e: unknown): string {
  const m = String((e as { message?: string } | null)?.message ?? e ?? 'unbekannter Fehler');
  if (/row-level security|permission denied/i.test(m)) return 'Keine Berechtigung für diesen Betrieb (anderes Konto angemeldet?).';
  if (/foreign key/i.test(m)) return 'Mitarbeiter oder Unterweisung gibt es auf dem Server nicht mehr (gelöscht?).';
  return m;
}

export type SubmitResult = 'synced' | 'queued' | { rejected: string };

export interface SubmitOutcome {
  result: SubmitResult;
  /** dauerhaft auf dem Gerät gesichert (false = nur im Arbeitsspeicher, z. B. privates Surfen) */
  onDevice: boolean;
  pending: Pending;
}

// Was gerade gesendet wird — das automatische Nachsenden lässt diesen Nachweis solange in Ruhe.
const inFlight = new Set<string>();

/** Unterschriebenen Nachweis sichern und senden. Wirft nie wegen des Netzes — die Unterschrift geht nicht verloren. */
export async function submit(be: SdBackend, p: Pending): Promise<SubmitOutcome> {
  inFlight.add(p.key);
  try {
    const onDevice = await kvPut(p);
    emitPendingChanged();
    let current = p;
    try {
      const { fieldsDropped } = await be.insertCompletion(p.row);
      current = { ...p, fieldsDropped: fieldsDropped || undefined };
    } catch (e) {
      if (later(e)) {
        emitPendingChanged();
        return { result: 'queued', onDevice, pending: p };
      }
      const rejected = errorText(e);
      current = markRejected(p, rejected);
      await kvPut(current);
      emitPendingChanged();
      return { result: { rejected }, onDevice, pending: current };
    }
    await deletePending(p.key);
    emitPendingChanged();
    return { result: 'synced', onDevice, pending: current };
  } finally {
    inFlight.delete(p.key);
  }
}

let flushing = false;

/** Wartende Nachweise nachsenden (älteste zuerst). Bricht beim ersten Netzfehler ab. Liefert die Zahl der übertragenen. */
// Abgelehnte erst nach ihrer Wartezeit erneut (nicht jede Minute) — außer bei `force` („Jetzt senden“).
export async function flushPending(be: SdBackend, userId: string, opts: { force?: boolean } = {}): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  let changed = false;
  try {
    for (const p of await listPending(userId)) {
      if (inFlight.has(p.key)) continue;
      if (p.lastError && !opts.force && !retryDue(p)) continue;
      try {
        await be.insertCompletion(p.row);
        await deletePending(p.key);
        changed = true;
        sent++;
      } catch (e) {
        if (later(e)) break;
        // Serverfehler (z. B. Mitarbeiter inzwischen gelöscht): behalten, nicht verlieren — blockiert aber nichts.
        const lastError = errorText(e);
        await kvPut(markRejected(p, lastError));
        changed = true;
      }
    }
  } finally {
    flushing = false;
    if (changed) emitPendingChanged();
  }
  return sent;
}

/**
 * Wartende Nachweise (ohne Serverfehler) zählen für die Fälligkeit schon mit — wie listCompletionsWithPending in der
 * App: Sonst bliebe ein im Funkloch unterwiesener Mitarbeiter „fällig“ und würde doppelt unterwiesen.
 */
export function withPending(completions: SdCompletion[], pending: Pending[]): SdCompletion[] {
  const known = new Set(completions.map((c) => c.id));
  const waiting = pending
    .filter((p) => !p.lastError && !known.has(p.row.id))
    .map((p) => ({ id: p.row.id, member_id: p.row.member_id, briefing_id: p.row.briefing_id, check_passed: p.row.check_passed, abgeschlossen_am: p.row.abgeschlossen_am }));
  return waiting.length ? [...waiting, ...completions] : completions;
}
