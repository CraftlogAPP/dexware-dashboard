// Strecken-Aufzeichnung auf dem Gerät: die LAUFENDE Aufzeichnung (alle 10 s gesichert — übersteht Neuladen,
// versehentliches Schließen, leeren Akku) und fertige Fahrten, die noch nicht gesendet sind.
// Gleicher Speicher wie die Einsätze (einsatz/store.ts). Senden: wie einsatz/send.ts, nur für route_run.

import type { LatLng, Track } from '../routes';
import type { WeatherSnapshot } from '../types';
import { isNetworkError, type EinsatzBackend, type RunRow } from '../einsatz/backend';
import { isRetryLater, missingPhotoNote, uploadPhotosOnce } from '../einsatz/send';
import { markRejected, retryDue, type RejectInfo } from '../../lib/retryLater';
import {
  delWithPhotos,
  emitPendingChanged,
  kvDel,
  kvGet,
  kvKeys,
  kvList,
  kvPut,
  putWithPhotos,
  withoutPhotos,
  type FormValues,
  type WithPhotos,
} from '../einsatz/store';

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

/** Fertige Fahrt, die noch nicht auf dem Server ist. Fotos liegen in einem eigenen Eintrag (siehe einsatz/store.ts). */
export interface PendingRun extends WithPhotos, RejectInfo {
  key: string;
  kind: 'run-pending';
  userId: string;
  routeName: string | null;
  row: RunRow;
}

const activeKey = (userId: string) => `run-active:${userId}`;
const pendingKey = (id: string) => `run-pending:${id}`;

export const saveActiveRun = (a: Omit<ActiveRun, 'key' | 'kind' | 'savedAt'>) =>
  kvPut({ ...a, key: activeKey(a.userId), kind: 'run-active', savedAt: new Date().toISOString() } as ActiveRun);
export const deleteActiveRun = (userId: string) => kvDel(activeKey(userId));
export async function getActiveRun(userId: string): Promise<ActiveRun | null> {
  const r = await kvGet(activeKey(userId));
  return r && r.kind === 'run-active' ? (r as ActiveRun) : null;
}
/** Liegt eine laufende/unterbrochene Aufzeichnung auf dem Gerät? (nur der Schlüssel wird gelesen) */
export async function hasActiveRun(userId: string): Promise<boolean> {
  return (await kvKeys(activeKey(userId))).includes(activeKey(userId));
}

/** Wartende Fahrten OHNE Fotos (die lädt erst das Senden). */
export async function listPendingRuns(userId: string): Promise<PendingRun[]> {
  return (await kvList<PendingRun>('run-pending:'))
    .filter((r) => r.kind === 'run-pending' && r.userId === userId)
    .sort((a, b) => a.row.started_at.localeCompare(b.row.started_at));
}
export const deletePendingRun = (id: string) => delWithPhotos(pendingKey(id));
const savePendingRun = (p: PendingRun) => putWithPhotos(p);

const WEATHER_BACKFILL_MS = 60 * 60 * 1000;
const backfillOpen = (startedAt: string) => {
  const age = Date.now() - Date.parse(startedAt);
  return age > -10 * 60 * 1000 && age < WEATHER_BACKFILL_MS;
};


function errorText(e: unknown): string {
  const m = String((e as { message?: string } | null)?.message ?? e ?? 'unbekannter Fehler');
  if (/row-level security|permission denied/i.test(m)) return 'Keine Berechtigung für diesen Betrieb (Mitgliedschaft entfernt?).';
  if (/track too long/i.test(m)) return 'Die Fahrt hat zu viele Punkte für den Server.';
  if (/route not found/i.test(m)) return 'Die Strecke gibt es in diesem Betrieb nicht mehr.';
  return m;
}

async function push(be: EinsatzBackend, p: PendingRun): Promise<void> {
  // Fotos nur einmal hochladen (Pfade werden gemerkt) — gleiche Regel wie bei den Einsätzen (einsatz/send.ts)
  const { urls, missing } = await uploadPhotosOnce(be, p, p.row.org_id, p.row.id, (photoUrls) =>
    savePendingRun({ ...withoutPhotos(p), photoUrls }),
  );
  await be.insertRun({ ...p.row, notes: missingPhotoNote(p.row.notes, missing) }, urls);
}

export type RunResult = 'synced' | 'queued' | { rejected: string };

const inFlight = new Set<string>();

/** Fertige Fahrt sichern und senden. Wirft nie wegen des Netzes — die Fahrt geht nicht verloren. */
export async function submitRun(
  be: EinsatzBackend,
  p: Omit<PendingRun, 'key' | 'kind'> & { photos: string[] },
): Promise<{ result: RunResult; onDevice: boolean }> {
  const rec: PendingRun = { ...p, key: pendingKey(p.row.id), kind: 'run-pending' };
  inFlight.add(rec.key);
  try {
    const onDevice = await savePendingRun(rec);
    // Fotos stehen jetzt in ihrem eigenen Eintrag → ab hier nur noch der kleine Teil
    const light = withoutPhotos(rec);
    emitPendingChanged();
    try {
      await push(be, { ...light, photos: rec.photos });
    } catch (e) {
      if (isNetworkError(e) || isRetryLater(e)) return { result: 'queued', onDevice };
      const rejected = errorText(e);
      const now = (await listPendingRuns(rec.userId)).find((x) => x.key === rec.key) ?? light;
      await savePendingRun(markRejected(now, rejected));
      emitPendingChanged();
      return { result: { rejected }, onDevice };
    }
    await deletePendingRun(rec.row.id);
    emitPendingChanged();
    return { result: 'synced', onDevice };
  } finally {
    inFlight.delete(rec.key);
  }
}

let running: Promise<number> | null = null;

/**
 * Wartende Fahrten nachsenden (bricht beim ersten Netzfehler ab). Abgelehnte erst nach ihrer Wartezeit, außer bei
 * `force` („Jetzt senden“). Liefert die Zahl der übertragenen Fahrten.
 */
export function flushPendingRuns(be: EinsatzBackend, userId: string, opts: { force?: boolean } = {}): Promise<number> {
  if (running) return opts.force ? running.then(() => flushPendingRuns(be, userId, opts)) : Promise.resolve(0);
  const mine = doFlush(be, userId, !!opts.force).finally(() => {
    if (running === mine) running = null;
  });
  running = mine;
  return mine;
}

async function doFlush(be: EinsatzBackend, userId: string, force: boolean): Promise<number> {
  let sent = 0;
  let changed = false;
  try {
    for (let p of await listPendingRuns(userId)) {
      if (inFlight.has(p.key)) continue;
      if (p.lastError && !force && !retryDue(p)) continue;
      try {
        // Eintrag von vor dem 21.11.2026 mit eingebetteten Fotos: einmal in den eigenen Foto-Eintrag umziehen
        if (p.photos) {
          await savePendingRun(p);
          p = withoutPhotos(p);
        }
        const first = p.row.track.find((s) => s.length)?.[0];
        if (!p.row.weather && first && backfillOpen(p.row.started_at)) {
          const r = await be.weather(first[0], first[1], 8000);
          if (r.weather) {
            p = { ...p, row: { ...p.row, weather: r.weather } };
            await savePendingRun(p);
          } else if (r.netError && backfillOpen(p.row.started_at)) break;
        }
        await push(be, p);
        await deletePendingRun(p.row.id);
        changed = true;
        sent++;
      } catch (e) {
        if (isNetworkError(e) || isRetryLater(e)) break;
        const now = (await listPendingRuns(userId)).find((x) => x.key === p.key) ?? p;
        await savePendingRun(markRejected(now, errorText(e)));
        changed = true;
      }
    }
  } finally {
    if (changed) emitPendingChanged();
  }
  return sent;
}
