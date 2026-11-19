// Senden eines fertigen Einsatzes: ERST auf dem Gerät sichern, DANN zum Server (Fotos → Speicher, dann Zeile).
// Ohne Netz bleibt er auf dem Gerät und wird später nachgesendet — Zeitstempel, GPS und Fotos bleiben die
// vom Einsatzort. Doppelt gesendet ist unschädlich (gleiche Einsatz-ID, gleiche Foto-Pfade).
// Vorbild: addOperation/flushOutbox/pushOperation der App (mobile/src/data/supabaseRepository.ts).

import { isNetworkError, STORAGE_PREFIX, type EinsatzBackend } from './backend';
import { dataUriToBlob } from './photo';
import { deletePending, emitPendingChanged, listPending, pendingKey, savePending, type Pending } from './store';

/** Wetter nur nachtragen, solange es noch zur Einsatzzeit passt (≤ 1 h) — wie die App. */
const WEATHER_BACKFILL_MS = 60 * 60 * 1000;

function weatherBackfillOpen(startedAtIso: string): boolean {
  const started = Date.parse(startedAtIso);
  if (!Number.isFinite(started)) return false;
  const age = Date.now() - started;
  return age > -10 * 60 * 1000 && age < WEATHER_BACKFILL_MS;
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

function errorText(e: unknown): string {
  const m = String((e as { message?: string } | null)?.message ?? e ?? 'unbekannter Fehler');
  if (/row-level security|permission denied/i.test(m)) {
    return 'Keine Berechtigung für diesen Betrieb oder dieses Objekt (Mitgliedschaft entfernt?).';
  }
  return m;
}

async function push(be: EinsatzBackend, p: Pending): Promise<void> {
  const urls: string[] = [];
  for (let i = 0; i < p.photos.length; i++) {
    const photo = p.photos[i];
    const path = `${p.row.org_id}/${p.row.id}/${i + 1}.jpg`;
    try {
      await be.uploadPhoto(path, dataUriToBlob(photo));
      urls.push(STORAGE_PREFIX + path);
    } catch (e) {
      // Netz weg / Anmeldung abgelaufen → ganzer Einsatz bleibt auf dem Gerät (Fotos später in den Speicher).
      if (isNetworkError(e) || isRetryLater(e)) throw e;
      // Anderer Fehler → Foto eingebettet speichern, die Dokumentation darf nie an einem Foto scheitern (wie die App).
      urls.push(photo);
    }
  }
  await be.insertOperation(p.row, urls);
}

export type SubmitResult = 'synced' | 'queued' | { rejected: string };

/** Fertigen Einsatz sichern und senden. Wirft nie wegen des Netzes — der Einsatz geht nicht verloren. */
export async function submit(be: EinsatzBackend, p: Pending): Promise<{ result: SubmitResult; onDevice: boolean }> {
  const onDevice = await savePending(p);
  emitPendingChanged();
  try {
    await push(be, p);
  } catch (e) {
    if (isNetworkError(e) || isRetryLater(e)) return { result: 'queued', onDevice };
    const rejected = errorText(e);
    await savePending({ ...p, lastError: rejected });
    emitPendingChanged();
    return { result: { rejected }, onDevice };
  }
  await deletePending(p.row.id);
  emitPendingChanged();
  return { result: 'synced', onDevice };
}

let flushing = false;

/**
 * Wartende Einsätze nachsenden. Bricht beim ersten Netzfehler ab (Rest beim nächsten Versuch).
 * Liefert die Zahl der übertragenen Einsätze.
 */
export async function flushPending(be: EinsatzBackend, userId: string): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  let changed = false;
  try {
    for (let p of await listPending(userId)) {
      try {
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
        const lastError = errorText(e);
        if (p.lastError !== lastError) {
          await savePending({ ...p, key: pendingKey(p.row.id), lastError });
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
