// Strecken-Aufzeichnung auf dem Gerät: die LAUFENDE Aufzeichnung (alle 10 s gesichert — übersteht Neuladen,
// versehentliches Schließen, leeren Akku) und fertige Fahrten, die noch nicht gesendet sind.
// Gleicher Speicher wie die Einsätze (einsatz/store.ts). Senden: wie einsatz/send.ts, nur für route_run.

import type { LatLng, Track } from '../routes';
import type { WeatherSnapshot } from '../types';
import { isNetworkError, STORAGE_PREFIX, type EinsatzBackend, type RunRow } from '../einsatz/backend';
import { dataUriToBlob } from '../einsatz/photo';
import { emitPendingChanged, kvAll, kvDel, kvPut, type FormValues } from '../einsatz/store';

/** run = Fahrt mit Nachweis · plan = Strecke einmal abfahren, daraus wird die Vorlage */
export type RunMode = 'run' | 'plan';

export interface ActiveRun {
  key: string;
  kind: 'run-active';
  userId: string;
  /** Aufnahme-ID = ID der Fahrt bzw. der neuen Strecke (Wiederholung legt nichts doppelt an) */
  id: string;
  mode: RunMode;
  routeId: string | null;
  routeName: string | null;
  plan: LatLng[] | null;
  /** nur Modus plan */
  planName?: string;
  planNotes?: string;
  replaceRouteId?: string;
  startedAt: string;
  /** gesetzt = Fahrt beendet, Abschlussformular offen */
  stoppedAt: string | null;
  track: Track;
  gaps: [string, string][];
  lengthM: number;
  weather: WeatherSnapshot | null;
  form: FormValues | null;
  photos: string[];
  savedAt: string;
}

export interface PendingRun {
  key: string;
  kind: 'run-pending';
  userId: string;
  routeName: string | null;
  row: RunRow;
  photos: string[];
  lastError?: string;
}

const activeKey = (userId: string) => `run-active:${userId}`;
const pendingKey = (id: string) => `run-pending:${id}`;

export const saveActiveRun = (a: Omit<ActiveRun, 'key' | 'kind' | 'savedAt'>) =>
  kvPut({ ...a, key: activeKey(a.userId), kind: 'run-active', savedAt: new Date().toISOString() } as ActiveRun);
export const deleteActiveRun = (userId: string) => kvDel(activeKey(userId));
export async function getActiveRun(userId: string): Promise<ActiveRun | null> {
  const key = activeKey(userId);
  return ((await kvAll()).find((r) => r.key === key) as ActiveRun | undefined) ?? null;
}

export async function listPendingRuns(userId: string): Promise<PendingRun[]> {
  return ((await kvAll()).filter((r) => r.kind === 'run-pending' && r.userId === userId) as PendingRun[]).sort((a, b) =>
    a.row.started_at.localeCompare(b.row.started_at),
  );
}
export const deletePendingRun = (id: string) => kvDel(pendingKey(id));

const WEATHER_BACKFILL_MS = 60 * 60 * 1000;
const backfillOpen = (startedAt: string) => {
  const age = Date.now() - Date.parse(startedAt);
  return age > -10 * 60 * 1000 && age < WEATHER_BACKFILL_MS;
};

function isRetryLater(e: unknown): boolean {
  const err = e as { code?: string; message?: string; status?: number; statusCode?: string | number } | null;
  const status = Number(err?.status ?? err?.statusCode ?? 0);
  return (
    err?.code === 'PGRST301' ||
    err?.code === 'PGRST303' ||
    status === 401 ||
    status >= 500 ||
    /jwt expired|invalid jwt|not authenticated|unauthorized|bad gateway|service unavailable|gateway timeout/i.test(String(err?.message ?? ''))
  );
}

function errorText(e: unknown): string {
  const m = String((e as { message?: string } | null)?.message ?? e ?? 'unbekannter Fehler');
  if (/row-level security|permission denied/i.test(m)) return 'Keine Berechtigung für diesen Betrieb (Mitgliedschaft entfernt?).';
  if (/track too long/i.test(m)) return 'Die Fahrt hat zu viele Punkte für den Server.';
  if (/route not found/i.test(m)) return 'Die Strecke gibt es in diesem Betrieb nicht mehr.';
  return m;
}

async function push(be: EinsatzBackend, p: PendingRun): Promise<void> {
  const urls: string[] = [];
  for (let i = 0; i < p.photos.length; i++) {
    const path = `${p.row.org_id}/${p.row.id}/${i + 1}.jpg`;
    try {
      await be.uploadPhoto(path, dataUriToBlob(p.photos[i]));
      urls.push(STORAGE_PREFIX + path);
    } catch (e) {
      if (isNetworkError(e) || isRetryLater(e)) throw e;
      urls.push(p.photos[i]); // Foto eingebettet — die Dokumentation scheitert nie an einem Foto (wie die App)
    }
  }
  await be.insertRun(p.row, urls);
}

export type RunResult = 'synced' | 'queued' | { rejected: string };

/** Fertige Fahrt sichern und senden. Wirft nie wegen des Netzes — die Fahrt geht nicht verloren. */
export async function submitRun(
  be: EinsatzBackend,
  p: Omit<PendingRun, 'key' | 'kind'>,
): Promise<{ result: RunResult; onDevice: boolean }> {
  const rec: PendingRun = { ...p, key: pendingKey(p.row.id), kind: 'run-pending' };
  const onDevice = await kvPut(rec);
  emitPendingChanged();
  try {
    await push(be, rec);
  } catch (e) {
    if (isNetworkError(e) || isRetryLater(e)) return { result: 'queued', onDevice };
    const rejected = errorText(e);
    await kvPut({ ...rec, lastError: rejected } as PendingRun);
    emitPendingChanged();
    return { result: { rejected }, onDevice };
  }
  await kvDel(rec.key);
  emitPendingChanged();
  return { result: 'synced', onDevice };
}

let flushing = false;

/** Wartende Fahrten nachsenden (bricht beim ersten Netzfehler ab). Liefert die Zahl der übertragenen Fahrten. */
export async function flushPendingRuns(be: EinsatzBackend, userId: string): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  let changed = false;
  try {
    for (let p of await listPendingRuns(userId)) {
      try {
        const first = p.row.track.find((s) => s.length)?.[0];
        if (!p.row.weather && first && backfillOpen(p.row.started_at)) {
          const r = await be.weather(first[0], first[1], 8000);
          if (r.weather) {
            p = { ...p, row: { ...p.row, weather: r.weather } };
            await kvPut(p);
          } else if (r.netError && backfillOpen(p.row.started_at)) break;
        }
        await push(be, p);
        await kvDel(p.key);
        changed = true;
        sent++;
      } catch (e) {
        if (isNetworkError(e) || isRetryLater(e)) break;
        const lastError = errorText(e);
        if (p.lastError !== lastError) {
          await kvPut({ ...p, lastError } as PendingRun);
          changed = true;
        }
      }
    }
  } finally {
    flushing = false;
    if (changed) emitPendingChanged();
  }
  return sent;
}
