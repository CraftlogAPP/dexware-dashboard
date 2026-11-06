// Prüffester GPS-Nachweis (seit 04.11.2026) für die Prüf-Apps nach Vorlage.
// Die Nachweis-Spalten werden per EIGENER Abfrage zu den Prüfungen geholt — fehlen sie in
// einer Datenbank noch (gps-pruefnachweis.sql nicht eingespielt), bleibt alles wie bisher.

import type { SupabaseClient } from '@supabase/supabase-js';
import { IN_CHUNK } from './completeQueries';

const PROOF_COLS =
  'id, gps_at, gps_mocked, end_lat, end_lng, end_accuracy_m, end_gps_at, end_mocked, distance_m, end_distance_m, received_at, entry_hash';

const PROOF_COLS_NO_DIST = PROOF_COLS.replace(', distance_m, end_distance_m', '');

export interface GpsProofFields {
  lat?: number | null;
  lng?: number | null;
  gps_accuracy_m?: number | null;
  gps_at?: string | null;
  gps_mocked?: boolean | null;
  end_lat?: number | null;
  end_lng?: number | null;
  end_accuracy_m?: number | null;
  end_gps_at?: string | null;
  end_mocked?: boolean | null;
  distance_m?: number | null;
  end_distance_m?: number | null;
  received_at?: string | null;
  entry_hash?: string | null;
}

/** Nachweis-Felder zu Prüfungen ergänzen (gleiche Form wie Eingabe: Zeile oder Liste). */
export async function withGpsProof<T>(sb: SupabaseClient, table: string, data: T): Promise<T> {
  if (!data) return data;
  const rows = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
  const ids = rows.map((r) => r.id as string).filter(Boolean);
  if (!ids.length) return data;
  const byId = new Map<string, Record<string, unknown>>();
  // Häppchen à IN_CHUNK (150) ids — hält die URL des .in()-Filters kurz.
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    let { data: extra, error }: { data: unknown[] | null; error: unknown } = await sb.from(table).select(PROOF_COLS).in('id', ids.slice(i, i + IN_CHUNK));
    // PrüfDex hat keinen Bezugsort → ohne Abstandsspalten erneut
    if (error) ({ data: extra, error } = await sb.from(table).select(PROOF_COLS_NO_DIST).in('id', ids.slice(i, i + IN_CHUNK)));
    if (error) return data; // Spalten fehlen (noch) → unverändert
    for (const e of (extra ?? []) as unknown as Record<string, unknown>[]) byId.set(e.id as string, e);
  }
  const out = rows.map((r) => ({ ...r, ...(byId.get(r.id as string) ?? {}) }));
  return (Array.isArray(data) ? out : out[0]) as T;
}

const GPS_WEAK_M = 50;
const fmtT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
const mapLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&amp;query=${lat.toFixed(6)},${lng.toFixed(6)}`;

function stamp(label: string, place: string, lat?: number | null, lng?: number | null, acc?: number | null,
  at?: string | null, dist?: number | null, mocked?: boolean | null): string {
  if (lat == null || lng == null) return `<div><b>${label}:</b> kein GPS</div>`;
  const warn: string[] = [];
  if (acc != null && acc > GPS_WEAK_M) warn.push(`Ortung ungenau (±${Math.round(acc)} m)`);
  if (dist != null && dist > Math.max(100, (acc ?? 0) * 2)) warn.push(`${Math.round(dist)} m vom ${place} entfernt`);
  if (mocked) warn.push('Fake-GPS gemeldet (Android)');
  return `<div><b>${label}</b>${at ? ` ${fmtT(at)}` : ''} · ${lat.toFixed(5)}, ${lng.toFixed(5)}${
    acc != null ? ` · ±${Math.round(acc)} m` : ''
  }${dist != null ? ` · ${Math.round(dist)} m vom ${place}` : ''} · <a href="${mapLink(lat, lng)}" target="_blank" rel="noreferrer">Karte</a></div>${warn
    .map((w) => `<div class="gps-warn" style="color:#B91C1C;font-weight:700">Achtung: ${w}</div>`)
    .join('')}`;
}

/** GPS-Zelle (HTML): Beginn/Ende mit Ortungszeit, Genauigkeit, Abstand, Karte und Hinweisen. */
export function gpsProofHtml(r: GpsProofFields, place = 'Standort'): string {
  if (r.lat == null && r.end_lat == null) return '—';
  return (
    stamp(r.end_lat != null ? 'Beginn' : 'GPS', place, r.lat, r.lng, r.gps_accuracy_m, r.gps_at, r.distance_m, r.gps_mocked) +
    (r.end_lat != null ? stamp('Ende', place, r.end_lat, r.end_lng, r.end_accuracy_m, r.end_gps_at, r.end_distance_m, r.end_mocked) : '')
  );
}

/** Zusatz unter dem Datum: Server-Eingang + Prüfcode (nur wenn vorhanden). */
export function proofStampHtml(r: GpsProofFields, fmt: (iso: string) => string): string {
  if (!r.entry_hash) return '';
  return `<div class="small">Server-Eingang ${r.received_at ? fmt(r.received_at) : '—'}</div><div class="small mono">Prüfcode ${r.entry_hash.slice(0, 12)}</div>`;
}

/** Erklärung am Berichtsende (nur wenn mindestens ein Eintrag einen Prüfcode hat). */
export function gpsProofNote(rows: GpsProofFields[], place = 'Standort'): string {
  if (!rows.some((r) => r.entry_hash)) return '';
  return `<p class="small" style="border:1.5px solid #AFC1D2;border-radius:8px;padding:8px 12px;page-break-inside:avoid">
  <b>Prüffester GPS-Nachweis.</b> Jede Prüfung trägt GPS-Stempel (Beginn und Speichern) mit Uhrzeit der Ortung und Genauigkeit.
  Abstand zum hinterlegten ${place} und Server-Eingang berechnet der Server selbst — unabhängig von Handy-Uhr und App.
  Jede Prüfung erhält beim Eingang einen Prüfcode (SHA-256 über alle Felder); eine spätere Änderung ist technisch gesperrt.
  Hinweise in Rot: Ortung ungenauer als ±${GPS_WEAK_M} m, mehr als 100 m vom ${place} entfernt oder Fake-GPS gemeldet.
  Einträge ohne Prüfcode wurden vor Einführung des Prüfcodes erfasst.</p>`;
}
