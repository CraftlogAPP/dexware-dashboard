// Entwürfe und fertige Prüfungen von „Vor Ort“ (PrüfDex) auf dem Gerät — und das Senden: ERST auf dem Gerät
// sichern, DANN zum Server (erst die Fotos in den Speicher, dann die Prüfung). Ohne Netz bleibt alles auf dem Gerät
// und wird später nachgesendet; Datum, GPS-Stempel, Fotos und Unterschrift bleiben die vom Prüfort.
// Wiederholen ist unschädlich: feste Prüf-ID und feste Foto-Pfade, „gibt es schon“ zählt als gespeichert.
// Vorbild: src/pruefen/send.ts + store.ts und die Warteschlange der App (mobile/src/data/offline.ts → Outbox).

import { isNetworkError } from '../../pruefen/backend';
import { createSignal, kvDel, kvGet, kvList, kvPut } from '../../pruefen/kv';
import { dataUriToBlob } from '../../winterdex/einsatz/photo';
import type { Measurements, Result, VisualChecks } from './dguv';
import type { PdBackend } from './backend';
import { STORAGE_PREFIX, photoPath, type GpsFix, type InspectionRow } from './rows';

// ---------------------------------------------------------------- Entwurf (angefangene Prüfung eines Geräts)

export interface DraftForm {
  visual: VisualChecks;
  measurements: Measurements;
  result: Result;
  /** eigene Wahl des Ergebnisses (null = folgt den Eingaben) */
  userChoice: Result | null;
  notes: string;
  inspectorName: string;
  qualification: string;
  signature: string;
}

export interface Draft {
  key: string;
  userId: string;
  deviceId: string;
  /** feste Prüf-ID ab dem Öffnen (gleiche Foto-Pfade bei jeder Wiederholung) */
  inspectionId: string;
  openedAt: string;
  /** Tag, an dem die Prüfung begonnen wurde — ein Entwurf gilt nur am selben Tag (die Prüfung trägt das heutige Datum) */
  day: string;
  start: GpsFix | null;
  form: DraftForm;
  photos: string[];
  updatedAt: string;
}

const draftKey = (userId: string, deviceId: string) => `pruefdex:entwurf:${userId}:${deviceId}`;

export const saveDraft = (d: Omit<Draft, 'key'>) => kvPut({ ...d, key: draftKey(d.userId, d.deviceId) });
export const deleteDraft = (userId: string, deviceId: string) => kvDel(draftKey(userId, deviceId));
export const getDraft = (userId: string, deviceId: string) => kvGet<Draft>(draftKey(userId, deviceId));
export const listDrafts = (userId: string) => kvList<Draft>(`pruefdex:entwurf:${userId}:`);

// ---------------------------------------------------------------- Wartende Prüfungen

export interface Pending {
  key: string;
  userId: string;
  /** Name des Geräts und des Kunden — für die Anzeige */
  deviceName: string;
  customerName: string;
  inspection: InspectionRow;
  photos: string[];
  /** Zeitpunkt des Speicherns auf dem Gerät (ISO) */
  createdAt: string;
  /** Die Datenbank kannte Spalten nicht → ohne Unterschrift bzw. ohne GPS-Stempel gespeichert. */
  signatureDropped?: boolean;
  gpsDropped?: boolean;
  /** Server hat abgelehnt (kein Netzproblem) — Meldung für die Anzeige. */
  lastError?: string;
}

const pendingPrefix = (userId: string) => `pruefdex:wartend:${userId}:`;
export const pendingKey = (userId: string, inspectionId: string) => `${pendingPrefix(userId)}${inspectionId}`;

export async function listPending(userId: string): Promise<Pending[]> {
  return (await kvList<Pending>(pendingPrefix(userId))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
  if (/row-level security|permission denied/i.test(m)) return 'Keine Berechtigung für diesen Betrieb (Mitgliedschaft entfernt?).';
  if (/foreign key|inspection_device_id_fkey/i.test(m)) return 'Das Gerät gibt es auf dem Server nicht mehr (gelöscht?).';
  return m;
}

/** Überträgt Fotos und Prüfung. Wirft beim ersten Fehler; nach Erfolg ist alles auf dem Server. */
async function push(be: PdBackend, p: Pending): Promise<Pending> {
  const urls: string[] = [];
  for (let i = 0; i < p.photos.length; i++) {
    const path = photoPath(p.inspection.org_id, p.inspection.id, i + 1);
    try {
      await be.uploadPhoto(path, dataUriToBlob(p.photos[i]));
      urls.push(STORAGE_PREFIX + path);
    } catch (e) {
      // Netz weg / Anmeldung abgelaufen → alles bleibt auf dem Gerät (Fotos später in den Speicher).
      if (later(e)) throw e;
      // Anderer Fehler → Foto eingebettet speichern: die Dokumentation darf nie an einem Foto scheitern (wie die App).
      urls.push(p.photos[i]);
    }
  }
  const { signatureDropped, gpsDropped } = await be.insertInspection(p.inspection, urls);
  return { ...p, signatureDropped: signatureDropped || undefined, gpsDropped: gpsDropped || undefined, lastError: undefined };
}

export type SubmitResult = 'synced' | 'queued' | { rejected: string };

export interface SubmitOutcome {
  result: SubmitResult;
  /** dauerhaft auf dem Gerät gesichert (false = nur im Arbeitsspeicher, z. B. privates Surfen) */
  onDevice: boolean;
  /** Stand nach dem Versuch */
  pending: Pending;
}

// Was gerade gesendet wird — das automatische Nachsenden lässt diese Prüfung solange in Ruhe.
const inFlight = new Set<string>();

/** Fertige Prüfung sichern und senden. Wirft nie wegen des Netzes — die Prüfung geht nicht verloren. */
export async function submit(be: PdBackend, p: Pending): Promise<SubmitOutcome> {
  inFlight.add(p.key);
  try {
    const onDevice = await kvPut(p);
    emitPendingChanged();
    let current = p;
    try {
      current = await push(be, p);
    } catch (e) {
      if (later(e)) {
        emitPendingChanged();
        return { result: 'queued', onDevice, pending: p };
      }
      const rejected = errorText(e);
      current = { ...p, lastError: rejected };
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

/** Wartende Prüfungen nachsenden (älteste zuerst). Bricht beim ersten Netzfehler ab. Liefert die Zahl der übertragenen. */
export async function flushPending(be: PdBackend, userId: string): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  let changed = false;
  try {
    for (const p of await listPending(userId)) {
      if (inFlight.has(p.key)) continue;
      try {
        await push(be, p);
        await deletePending(p.key);
        changed = true;
        sent++;
      } catch (e) {
        if (later(e)) break;
        const lastError = errorText(e);
        if (p.lastError !== lastError) {
          await kvPut({ ...p, lastError });
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
