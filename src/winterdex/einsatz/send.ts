// Senden eines fertigen Einsatzes: ERST auf dem Gerät sichern, DANN zum Server (Fotos → Speicher, dann Zeile).
// Ohne Netz bleibt er auf dem Gerät und wird später nachgesendet — Zeitstempel, GPS und Fotos bleiben die
// vom Einsatzort. Doppelt gesendet ist unschädlich (gleiche Einsatz-ID, gleiche Foto-Pfade).
// Vorbild: addOperation/flushOutbox/pushOperation der App (mobile/src/data/supabaseRepository.ts).
//
// Vom Server ABGELEHNTE Einsätze (kein Netzproblem) werden mit wachsender Wartezeit erneut versucht (5 Min bis 6 Std,
// src/lib/retryLater.ts), nicht mehr jede Minute. Schon hochgeladene Fotos werden dabei nicht noch einmal gesendet.

import { isNetworkError, STORAGE_PREFIX, type EinsatzBackend } from './backend';
import { dataUriToBlob } from './photo';
import { markRejected, retryDue } from '../../lib/retryLater';
import {
  deletePending,
  emitPendingChanged,
  listPending,
  photoCountOf,
  photosOf,
  savePending,
  withoutPhotos,
  type Pending,
  type WithPhotos,
} from './store';

/** Wetter nur nachtragen, solange es noch zur Einsatzzeit passt (≤ 1 h) — wie die App. */
const WEATHER_BACKFILL_MS = 60 * 60 * 1000;

function weatherBackfillOpen(startedAtIso: string): boolean {
  const started = Date.parse(startedAtIso);
  if (!Number.isFinite(started)) return false;
  const age = Date.now() - started;
  return age > -10 * 60 * 1000 && age < WEATHER_BACKFILL_MS;
}

/** Anmeldung abgelaufen / Server kurz weg: später erneut, kein „abgelehnt“. */
export function isRetryLater(e: unknown): boolean {
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

function errorText(e: unknown): string {
  const m = String((e as { message?: string } | null)?.message ?? e ?? 'unbekannter Fehler');
  if (/row-level security|permission denied/i.test(m)) {
    return 'Keine Berechtigung für diesen Betrieb oder dieses Objekt (Mitgliedschaft entfernt?).';
  }
  return m;
}

/**
 * Fotos in den Speicher des Servers laden (oder die schon hochgeladenen Pfade nehmen). Ist ein Foto auf dem Gerät nicht
 * mehr lesbar, steht das ehrlich in der Notiz — wie in der App.
 */
export async function uploadPhotosOnce(
  be: EinsatzBackend,
  p: WithPhotos,
  orgId: string,
  recordId: string,
  saveUrls: (urls: string[]) => Promise<unknown>,
): Promise<{ urls: string[]; missing: number }> {
  const count = photoCountOf(p);
  if (p.photoUrls && p.photoUrls.length === count) return { urls: p.photoUrls, missing: 0 };
  const photos = await photosOf(p);
  const urls: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const path = `${orgId}/${recordId}/${i + 1}.jpg`;
    try {
      await be.uploadPhoto(path, dataUriToBlob(photo));
      urls.push(STORAGE_PREFIX + path);
    } catch (e) {
      // Netz weg / Anmeldung abgelaufen → ganzer Eintrag bleibt auf dem Gerät (Fotos später in den Speicher).
      if (isNetworkError(e) || isRetryLater(e)) throw e;
      // Anderer Fehler → Foto eingebettet speichern, die Dokumentation darf nie an einem Foto scheitern (wie die App).
      urls.push(photo);
    }
  }
  const missing = Math.max(0, count - photos.length);
  // Alle Fotos liegen im Speicher → Pfade merken: ein späterer Versuch (z. B. nach einer Ablehnung) lädt nicht neu hoch.
  if (!missing && urls.length && urls.every((u) => u.startsWith(STORAGE_PREFIX))) await saveUrls(urls);
  return { urls, missing };
}

export function missingPhotoNote(notes: string | null, missing: number): string | null {
  if (!missing) return notes;
  const note = `[Hinweis: ${missing === 1 ? '1 Foto war' : `${missing} Fotos waren`} auf dem Gerät nicht mehr lesbar und fehlt im Nachweis.]`;
  return notes ? `${notes}\n${note}` : note;
}

async function push(be: EinsatzBackend, p: Pending): Promise<void> {
  const { urls, missing } = await uploadPhotosOnce(be, p, p.row.org_id, p.row.id, (photoUrls) =>
    savePending({ ...withoutPhotos(p), photoUrls }),
  );
  await be.insertOperation({ ...p.row, notes: missingPhotoNote(p.row.notes, missing) }, urls);
}

export type SubmitResult = 'synced' | 'queued' | { rejected: string };

// Was gerade gesendet wird — das automatische Nachsenden lässt diesen Einsatz solange in Ruhe.
const inFlight = new Set<string>();

/** Fertigen Einsatz sichern und senden. Wirft nie wegen des Netzes — der Einsatz geht nicht verloren. */
export async function submit(be: EinsatzBackend, p: Pending): Promise<{ result: SubmitResult; onDevice: boolean }> {
  inFlight.add(p.key);
  try {
    const onDevice = await savePending(p);
    // Fotos stehen jetzt in ihrem eigenen Eintrag (Gerät oder Arbeitsspeicher) → ab hier nur noch der kleine Teil.
    const light = withoutPhotos(p);
    emitPendingChanged();
    try {
      await push(be, { ...light, photos: p.photos });
    } catch (e) {
      if (isNetworkError(e) || isRetryLater(e)) return { result: 'queued', onDevice };
      const rejected = errorText(e);
      const now = (await listPending(p.userId)).find((x) => x.key === p.key) ?? light;
      await savePending(markRejected(now, rejected));
      emitPendingChanged();
      return { result: { rejected }, onDevice };
    }
    await deletePending(p.row.id);
    emitPendingChanged();
    return { result: 'synced', onDevice };
  } finally {
    inFlight.delete(p.key);
  }
}

let running: Promise<number> | null = null;

/**
 * Wartende Einsätze nachsenden. Bricht beim ersten Netzfehler ab (Rest beim nächsten Versuch).
 * Abgelehnte kommen nur nach ihrer Wartezeit dran — außer bei `force` („Jetzt senden“).
 * Liefert die Zahl der übertragenen Einsätze.
 */
export function flushPending(be: EinsatzBackend, userId: string, opts: { force?: boolean } = {}): Promise<number> {
  if (running) return opts.force ? running.then(() => flushPending(be, userId, opts)) : Promise.resolve(0);
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
    for (let p of await listPending(userId)) {
      if (inFlight.has(p.key)) continue;
      if (p.lastError && !force && !retryDue(p)) continue;
      try {
        // Eintrag von vor dem 21.11.2026 mit eingebetteten Fotos: einmal in den eigenen Foto-Eintrag umziehen
        // (ein Schritt, alles oder nichts) — danach arbeitet alles mit dem kleinen Teil.
        if (p.photos) {
          await savePending(p);
          p = withoutPhotos(p);
        }
        // Wetter fehlt (ohne Netz erfasst)? Nachtragen, solange es zur Einsatzzeit passt. Der Server versiegelt
        // den Einsatz beim Eingang — bei NETZFEHLER lieber im nächsten Durchlauf senden; läuft das Fenster ab,
        // geht er ohne Wetter raus (nie verloren, nie endlos zurückgehalten).
        if (!p.row.weather && p.row.lat != null && p.row.lng != null && weatherBackfillOpen(p.row.started_at)) {
          const r = await be.weather(p.row.lat, p.row.lng, 8000);
          if (r.weather) {
            p = { ...p, row: { ...p.row, weather: r.weather } };
            await savePending(p);
          } else if (r.netError && weatherBackfillOpen(p.row.started_at)) {
            break;
          }
        }
        await push(be, p);
        await deletePending(p.row.id);
        changed = true;
        sent++;
      } catch (e) {
        if (isNetworkError(e) || isRetryLater(e)) break;
        const now = (await listPending(userId)).find((x) => x.key === p.key) ?? p;
        await savePending(markRejected(now, errorText(e)));
        changed = true;
      }
    }
  } finally {
    if (changed) emitPendingChanged();
  }
  return sent;
}
