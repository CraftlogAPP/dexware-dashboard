// Glätte-Frühwarnung: eigene Uhrzeit je Betrieb (25.11.2026, Alex: „Winterdienst steht um 3 auf, fährt um 4“).
// Server: org.glaette_morgen_zeit = Minuten seit Mitternacht (Ortszeit), 02:00–05:30 in 15-min-Schritten, leer = 02:45
// (WinterDex/supabase/NACHTRAG-GLAETTE-UHRZEIT-2026-11-25.sql). Setzen über glaette_zeit_setzen (Inhaber + Verwalter).
// Der Worker (winterdex-backend ab 0.5.1) warnt jeden Betrieb zu seiner Uhrzeit, Wiederholung 30/60 min später, und
// nur bei echter Glättegefahr. Reine Rechnung bis auf laden/speichern — getestet in tests/glaette-zeit.test.mjs.
import type { SupabaseClient } from '@supabase/supabase-js';

export const GLAETTE_STANDARD = 2 * 60 + 45;
export const GLAETTE_VON = 2 * 60;
export const GLAETTE_BIS = 5 * 60 + 30;

export const GLAETTE_ERKLAERUNG =
  'Die Glätte-Frühwarnung kommt als Mitteilung aufs Handy – nur, wenn wirklich Glätte droht. Stell die Uhrzeit so ein, dass sie da ist, bevor ihr aufsteht. Die Vorwarnung am Vorabend um 19:00 bleibt gleich.';

export function glaetteZeitGueltig(m: unknown): m is number {
  return typeof m === 'number' && Number.isInteger(m) && m >= GLAETTE_VON && m <= GLAETTE_BIS && m % 15 === 0;
}

/** 165 → „02:45“ */
export function hhmm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Wert aus der Datenbank → Minuten (leer/ungültig = Standard 02:45). */
export function glaetteZeitAus(v: unknown): number {
  return glaetteZeitGueltig(v) ? v : GLAETTE_STANDARD;
}

/** Auswahl 02:00 … 05:30 (15 Schritte), Standard markiert. */
export function glaetteZeitOptionen(): Array<{ value: number; label: string }> {
  const out: Array<{ value: number; label: string }> = [];
  for (let m = GLAETTE_VON; m <= GLAETTE_BIS; m += 15) out.push({ value: m, label: m === GLAETTE_STANDARD ? `${hhmm(m)} Uhr (Standard)` : `${hhmm(m)} Uhr` });
  return out;
}

/**
 * Aktuelle Uhrzeit des Betriebs. null = Spalte fehlt (Nachtrag noch nicht eingespielt) oder nicht lesbar → Auswahl
 * ausblenden (der Worker warnt dann ohnehin alle um 02:45).
 */
export async function ladeGlaetteZeit(sb: SupabaseClient, orgId: string): Promise<number | null> {
  try {
    const { data, error } = await sb.from('org').select('glaette_morgen_zeit').eq('id', orgId).maybeSingle();
    if (error || !data) return null;
    return glaetteZeitAus((data as { glaette_morgen_zeit?: unknown }).glaette_morgen_zeit);
  } catch {
    return null;
  }
}

/** Speichern über die Server-Funktion (prüft Rolle + erlaubte Werte selbst). Wirft mit verständlicher Meldung. */
export async function speichereGlaetteZeit(sb: SupabaseClient, orgId: string, minuten: number): Promise<number> {
  if (!glaetteZeitGueltig(minuten)) throw new Error('Erlaubt sind 02:00 bis 05:30 Uhr in 15-Minuten-Schritten.');
  const { data, error } = await sb.rpc('glaette_zeit_setzen', { p_org: orgId, p_minuten: minuten });
  if (error) {
    if (error.code === '42501') throw new Error('Nur Inhaber oder Verwalter können die Uhrzeit ändern.');
    throw new Error(`Uhrzeit nicht gespeichert: ${error.message}`);
  }
  return glaetteZeitAus(typeof data === 'number' ? data : minuten);
}
