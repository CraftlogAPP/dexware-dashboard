// Nachweise (UVV-Prüfung, Führerscheinkontrolle) sichern und senden: ERST auf dem Gerät sichern, DANN zum Server —
// erst der Nachweis, dann die Frist am Fahrzeug bzw. Fahrer. Ohne Netz bleibt alles auf dem Gerät und wird später
// nachgesendet. Wiederholen ist unschädlich: feste ID je Nachweis, „gibt es schon“ zählt als gespeichert; die Frist
// wird nur vorgezogen, nie zurückgesetzt. Vorbild: FleetContext der App (Warteschlange + vorgemerkte Fristen) und
// src/pruefen/send.ts.
// Die Einträge sind klein (kein Foto) — sie liegen im Browser-Speicher des Geräts (localStorage), je Konto.

import { isNetworkError } from '../../pruefen/backend';
import type { KfzBackend } from './backend';
import { dueBump, type LicenseRow, type UvvRow } from './rows';

export interface Proof {
  /** ID des Nachweises (= id der Zeile) */
  key: string;
  kind: 'uvv' | 'license';
  userId: string;
  /** Kennzeichen bzw. Name des Fahrers — für die Anzeige */
  label: string;
  row: UvvRow | LicenseRow;
  /** Zeitpunkt des Speicherns auf dem Gerät (ISO) */
  createdAt: string;
  /** Der Nachweis selbst ist schon auf dem Server — es fehlt nur noch die Frist. */
  sent: boolean;
  /** Server hat abgelehnt (kein Netzproblem) — Meldung für die Anzeige. */
  lastError?: string;
}

const storeKey = (userId: string) => `dexware-kfzdex-vorort-wartend:${userId}`;
// Geht der Browser-Speicher nicht (privates Surfen, voll), bleibt alles im Arbeitsspeicher dieser Seite.
const memory = new Map<string, Proof[]>();

export function listProofs(userId: string): Proof[] {
  const mem = memory.get(userId);
  if (mem) return mem;
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(userId)) ?? '[]') as Proof[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** true = dauerhaft auf dem Gerät gesichert; false = nur im Arbeitsspeicher dieser Seite. */
function writeProofs(userId: string, list: Proof[]): boolean {
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(list));
    memory.delete(userId);
    return true;
  } catch {
    memory.set(userId, list);
    return false;
  }
}

function saveProof(p: Proof): boolean {
  const list = listProofs(p.userId);
  return writeProofs(p.userId, list.some((x) => x.key === p.key) ? list.map((x) => (x.key === p.key ? p : x)) : [...list, p]);
}

export function removeProof(userId: string, key: string): void {
  writeProofs(userId, listProofs(userId).filter((x) => x.key !== key));
}

// Seiten, die Wartendes anzeigen, aktualisieren sich sofort.
const listeners = new Set<() => void>();
export function onProofsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function emitProofsChanged(): void {
  listeners.forEach((f) => f());
}

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
  if (/row-level security|permission denied/i.test(m)) return 'Keine Berechtigung für diesen Betrieb (Mitgliedschaft entfernt?).';
  return m;
}

/** Überträgt, was noch fehlt, und merkt sich jeden Schritt auf dem Gerät. Wirft beim ersten Fehler. */
async function push(be: KfzBackend, start: Proof): Promise<void> {
  let p = start;
  if (!p.sent) {
    await be.insertProof(p.kind, p.row);
    p = { ...p, sent: true, lastError: undefined };
    saveProof(p);
  }
  // Erst wenn der Nachweis am Server ist, die Frist nachziehen — sonst stünde dort eine erneuerte Frist ohne Nachweis.
  const bump = dueBump(p.kind, p.row);
  if (bump) await be.bumpDue(bump);
}

export type SubmitResult = 'synced' | 'queued' | { rejected: string };

export interface SubmitOutcome {
  result: SubmitResult;
  /** dauerhaft auf dem Gerät gesichert (false = nur im Arbeitsspeicher, z. B. privates Surfen) */
  onDevice: boolean;
  /** Der Nachweis selbst ist auf dem Server (bei „queued“/„rejected“ fehlt dann nur die Frist). */
  proofOnServer: boolean;
}

// Was gerade gesendet wird — das automatische Nachsenden lässt diesen Nachweis solange in Ruhe.
const inFlight = new Set<string>();

/** Fertigen Nachweis sichern und senden. Wirft nie wegen des Netzes — der Nachweis geht nicht verloren. */
export async function submitProof(be: KfzBackend, p: Proof): Promise<SubmitOutcome> {
  inFlight.add(p.key);
  try {
    const onDevice = saveProof(p);
    emitProofsChanged();
    try {
      await push(be, p);
    } catch (e) {
      const now = listProofs(p.userId).find((x) => x.key === p.key) ?? p;
      if (later(e)) {
        emitProofsChanged();
        return { result: 'queued', onDevice, proofOnServer: now.sent };
      }
      const rejected = errorText(e);
      saveProof({ ...now, lastError: rejected });
      emitProofsChanged();
      return { result: { rejected }, onDevice, proofOnServer: now.sent };
    }
    removeProof(p.userId, p.key);
    emitProofsChanged();
    return { result: 'synced', onDevice, proofOnServer: true };
  } finally {
    inFlight.delete(p.key);
  }
}

let flushing = false;

/**
 * Wartende Nachweise nachsenden (der Reihe nach, ältester zuerst). Bricht beim ersten Netzfehler ab.
 * Liefert die Zahl der vollständig übertragenen Nachweise.
 */
export async function flushProofs(be: KfzBackend, userId: string): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let done = 0;
  let changed = false;
  try {
    for (const p of [...listProofs(userId)].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (inFlight.has(p.key)) continue;
      try {
        await push(be, p);
        removeProof(userId, p.key);
        changed = true;
        done++;
      } catch (e) {
        changed = true; // Teil-Fortschritt kann gesichert worden sein
        if (later(e)) break;
        const lastError = errorText(e);
        const now = listProofs(userId).find((x) => x.key === p.key) ?? p;
        if (now.lastError !== lastError) saveProof({ ...now, lastError });
      }
    }
  } finally {
    flushing = false;
    if (changed) emitProofsChanged();
  }
  return done;
}
