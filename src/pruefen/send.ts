// Senden einer fertigen Prüfung: ERST auf dem Gerät sichern, DANN zum Server — Fotos in den Speicher, dann die
// Prüfung, dann die Mängel (jeweils erst deren Fotos). Ohne Netz bleibt alles auf dem Gerät und wird später
// nachgesendet; Zeitstempel, GPS und Fotos bleiben die vom Prüfort.
// Wiederholen ist unschädlich: feste IDs und feste Foto-Pfade, „gibt es schon“ zählt als gespeichert. Nach einem
// Teil-Erfolg (Prüfung da, Mängel fehlen) holt der nächste Versuch nur das Fehlende nach — nichts doppelt.
// Vorbild: src/winterdex/einsatz/send.ts und der Ablauf der App (InspectionScreen → doSave).

import { isNetworkError, type PruefBackend } from './backend';
import type { PruefConfig } from './config';
import { dataUriToBlob } from '../winterdex/einsatz/photo';
import { photoPath, STORAGE_PREFIX } from './rows';
import { deletePending, emitPendingChanged, listPending, savePending, type Pending } from './store';
import { markRejected, retryDue } from '../lib/retryLater';

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
    return 'Keine Berechtigung für diesen Betrieb (Mitgliedschaft entfernt?).';
  }
  return m;
}

const later = (e: unknown) => isNetworkError(e) || isRetryLater(e);

async function uploadAll(be: PruefBackend, orgId: string, folder: string, id: string, photos: string[]): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const path = photoPath(orgId, folder, id, i + 1);
    try {
      await be.uploadPhoto(path, dataUriToBlob(photo));
      urls.push(STORAGE_PREFIX + path);
    } catch (e) {
      // Netz weg / Anmeldung abgelaufen → alles bleibt auf dem Gerät (Fotos später in den Speicher).
      if (later(e)) throw e;
      // Anderer Fehler → Foto eingebettet speichern: die Dokumentation darf nie an einem Foto scheitern (wie die App).
      urls.push(photo);
    }
  }
  return urls;
}

/** Überträgt, was noch fehlt, und merkt sich jeden Schritt auf dem Gerät. Wirft beim ersten Fehler. */
async function push(be: PruefBackend, cfg: PruefConfig, start: Pending): Promise<Pending> {
  let p = start;
  const orgId = p.inspection.org_id;
  if (!p.sent.inspection) {
    const urls = await uploadAll(be, orgId, cfg.photoFolders.inspection, p.inspection.id, p.photos);
    const { signatureDropped } = await be.insertInspection(p.inspection, urls);
    p = { ...p, sent: { ...p.sent, inspection: true }, signatureDropped: signatureDropped || undefined, lastError: undefined };
    await savePending(p);
  }
  for (const d of p.defects) {
    if (p.sent.defects.includes(d.row.id)) continue;
    const urls = await uploadAll(be, orgId, cfg.photoFolders.defect, d.row.id, d.photos);
    await be.insertDefect(d.row, urls);
    p = { ...p, sent: { ...p.sent, defects: [...p.sent.defects, d.row.id] }, lastError: undefined };
    await savePending(p);
  }
  return p;
}

export type SubmitResult = 'synced' | 'queued' | { rejected: string };

export interface SubmitOutcome {
  result: SubmitResult;
  /** dauerhaft auf dem Gerät gesichert (false = nur im Arbeitsspeicher, z. B. privates Surfen) */
  onDevice: boolean;
  /** Stand nach dem Versuch (was schon auf dem Server ist) */
  pending: Pending;
}

// Was gerade gesendet wird — das automatische Nachsenden lässt diese Prüfung solange in Ruhe.
const inFlight = new Set<string>();

/** Fertige Prüfung sichern und senden. Wirft nie wegen des Netzes — die Prüfung geht nicht verloren. */
export async function submit(be: PruefBackend, cfg: PruefConfig, p: Pending): Promise<SubmitOutcome> {
  inFlight.add(p.key);
  let current = p;
  try {
    const onDevice = await savePending(p);
    emitPendingChanged();
    try {
      current = await push(be, cfg, p);
    } catch (e) {
      // letzter auf dem Gerät gemerkter Stand (push sichert nach jedem Schritt)
      current = (await listPending(p.app, p.userId)).find((x) => x.key === p.key) ?? p;
      if (later(e)) {
        emitPendingChanged();
        return { result: 'queued', onDevice, pending: current };
      }
      const rejected = errorText(e);
      current = markRejected(current, rejected);
      await savePending(current);
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

/**
 * Wartende Prüfungen nachsenden. Bricht beim ersten Netzfehler ab (Rest beim nächsten Versuch).
 * Vom Server abgelehnte kommen erst nach ihrer Wartezeit wieder dran (5 Min bis 6 Std, nicht jede Minute samt Fotos) —
 * außer bei `force` („Jetzt senden“). Liefert die Zahl der vollständig übertragenen Prüfungen.
 */
export async function flushPending(be: PruefBackend, cfg: PruefConfig, userId: string, opts: { force?: boolean } = {}): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  let changed = false;
  try {
    for (const p of await listPending(cfg.appId, userId)) {
      if (inFlight.has(p.key)) continue;
      if (p.lastError && !opts.force && !retryDue(p)) continue;
      try {
        await push(be, cfg, p);
        await deletePending(p.key);
        changed = true;
        sent++;
      } catch (e) {
        changed = true; // Teil-Fortschritt kann gesichert worden sein
        if (later(e)) break;
        const lastError = errorText(e);
        const now = (await listPending(cfg.appId, userId)).find((x) => x.key === p.key) ?? p;
        await savePending(markRejected(now, lastError));
      }
    }
  } finally {
    flushing = false;
    if (changed) emitPendingChanged();
  }
  return sent;
}

/** Wie viele Mängel einer wartenden Prüfung noch nicht auf dem Server sind. */
export function defectsMissing(p: Pending): number {
  return p.defects.filter((d) => !p.sent.defects.includes(d.row.id)).length;
}
