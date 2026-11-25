// Straßenverlauf einer Fahrt (seit 25.11.2026, Gemeinde-Kunde: „im Bericht sehen, wann die Fahrt auf welcher Straße
// war“). Die Straßennamen ermittelt der WinterDex-Worker NACH der Fahrt serverseitig (OpenStreetMap Nominatim) und
// legt sie in route_run_strassen ab (WinterDex/supabase/NACHTRAG-STRASSEN-2026-11-25.sql, Worker backend/src/strassen.ts).
// route_run selbst (Nachweis mit Prüfcode) bleibt unverändert — die Straßennamen sind NICHT Teil des Prüfcodes.
//
// Vertrag: route_run_strassen { run_id, org_id, status, abschnitte = [{sek_von, sek_bis, strasse, ort, ortsteil?, m?}],
// quelle, erstellt_at, version }, sek = Sekunden seit route_run.started_at (wie die Punkt-Zeiten der Spur).
// status: in_arbeit (wird ermittelt) · fertig · leer (Fahrt ohne GPS-Punkte) · aufgegeben (Anbieter dauerhaft gestört).
//
// Nie ein Fehler in der Anzeige: Tabelle fehlt (SQL nicht eingespielt), Netz weg, kaputte Zeilen → Abschnitt fehlt
// bzw. „wird ermittelt“. Reine Rechnung bis auf fetchStrassen — getestet in tests/strassen-verlauf.test.mjs.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface StrassenAbschnitt {
  sek_von: number;
  sek_bis: number;
  strasse: string;
  ort: string | null;
  ortsteil?: string | null;
  m?: number | null;
}

export type StrassenStatus = 'fertig' | 'in_arbeit' | 'leer' | 'aufgegeben' | 'fehlt';

export interface StrassenStand {
  status: StrassenStatus;
  abschnitte: StrassenAbschnitt[];
  quelle: string | null;
}

/** Eine Zeile „09:32–09:38 · Wiener Straße, Eggenburg“ (Zeiten in ms). */
export interface StrassenZeile {
  von: number;
  bis: number;
  strasse: string;
  ort: string | null;
  ortsteil: string | null;
  m: number | null;
}

export type StrassenAnzeige = { art: 'ermittelt' } | { art: 'tabelle'; zeilen: StrassenZeile[]; mehrereOrte: boolean };

/** Quellenangabe (ODbL) — überall, wo Straßennamen erscheinen. */
export const STRASSEN_QUELLE = '© OpenStreetMap-Mitwirkende';
export const STRASSEN_QUELLE_URL = 'https://www.openstreetmap.org/copyright';
// Seit 25.11.2026 ermittelt der Worker JEDE Minute (vorher alle 10 min) → eine neue Fahrt hat ihre Straßen nach 1–3 min.
// Die Ansicht fragt solange selbst nach (useStrassenNachladen, alle 20 s, höchstens 10 min) — kein Neuladen nötig.
// Dieselben Texte bekommt die App (WinterDex-App-Runde).
export const STRASSEN_ERMITTELT = 'Straßenverlauf wird ermittelt – meist in 1–3 Minuten.';
/** Neben dem PDF-Knopf, solange der Straßenverlauf noch fehlt (das PDF entsteht trotzdem). */
export const STRASSEN_PDF_HINWEIS = 'Straßenverlauf kommt in wenigen Minuten – für den vollständigen Bericht kurz warten';
/** Nachfragen, solange „wird ermittelt“: alle 20 s, höchstens 10 Minuten lang. */
export const STRASSEN_NACHLADEN_MS = 20_000;
export const STRASSEN_NACHLADEN_MAX_MS = 10 * 60_000;

/** Wird der Straßenverlauf noch ermittelt (Status in_arbeit bzw. noch keine Zeile)? Storniert/fehlt/fertig → nein. */
export function strassenOffen(stand: StrassenStand | null | undefined, run?: { canceled?: boolean | null } | null): boolean {
  return !!stand && stand.status === 'in_arbeit' && !run?.canceled;
}

/** Im PDF an der Stelle der Tabelle: „Straßenverlauf wurde bei Erstellung (25.11.2026 18:05) noch ermittelt – …“ */
export function strassenPdfNochOffen(erstelltMs: number, timeZone?: string): string {
  const t: Record<string, string> = {};
  try {
    const f = new Intl.DateTimeFormat('de-DE', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    for (const p of f.formatToParts(new Date(erstelltMs))) t[p.type] = p.value;
  } catch {
    /* unbekannte Zeitzone → unten Rückfall */
  }
  const wann = t.year ? `${t.day}.${t.month}.${t.year} ${t.hour}:${t.minute}` : new Date(erstelltMs).toLocaleString('de-DE');
  return `Straßenverlauf wurde bei Erstellung (${wann}) noch ermittelt – Bericht später erneut erstellen.`;
}

const FEHLT: StrassenStand = { status: 'fehlt', abschnitte: [], quelle: null };
const STATUS = new Set<StrassenStatus>(['fertig', 'in_arbeit', 'leer', 'aufgegeben']);

const text = (v: unknown, max = 120): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};
const zahl = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Abschnitte aus der Datenbank säubern: nur gültige Zeiten, Straße nie leer, nach Zeit sortiert. */
export function cleanAbschnitte(roh: unknown): StrassenAbschnitt[] {
  if (!Array.isArray(roh)) return [];
  const out: StrassenAbschnitt[] = [];
  for (const a of roh) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const von = zahl(o.sek_von);
    const bis = zahl(o.sek_bis);
    if (von == null || bis == null || von < 0 || bis < von) continue;
    out.push({
      sek_von: von,
      sek_bis: bis,
      strasse: text(o.strasse) ?? 'Weg ohne Namen',
      ort: text(o.ort),
      ortsteil: text(o.ortsteil),
      m: zahl(o.m),
    });
  }
  return out.sort((a, b) => a.sek_von - b.sek_von);
}

export function strassenStandAus(row: unknown): StrassenStand {
  if (!row || typeof row !== 'object') return { status: 'in_arbeit', abschnitte: [], quelle: null };
  const r = row as Record<string, unknown>;
  const status = STATUS.has(r.status as StrassenStatus) ? (r.status as StrassenStatus) : 'fertig';
  return { status, abschnitte: cleanAbschnitte(r.abschnitte), quelle: text(r.quelle, 60) };
}

/** Straßenverlauf einer Fahrt laden. Wirft nie: keine Zeile = „wird ermittelt“, Tabelle fehlt/Fehler = „fehlt“. */
export async function fetchStrassen(sb: SupabaseClient, runId: string): Promise<StrassenStand> {
  try {
    const { data, error } = await sb.from('route_run_strassen').select('status, abschnitte, quelle').eq('run_id', runId).maybeSingle();
    if (error) return FEHLT;
    return strassenStandAus(data);
  } catch {
    return FEHLT;
  }
}

/**
 * Was zeigen? null = nichts (Tabelle fehlt, Fahrt ohne Punkt-Zeiten, ohne GPS, storniert und nie ermittelt, Anbieter
 * aufgegeben), „ermittelt“ = Hinweis, „tabelle“ = Zeilen mit Uhrzeiten (started_at + sek).
 */
export function strassenAnzeige(
  stand: StrassenStand | null | undefined,
  run: { started_at: string; canceled?: boolean | null },
  mitZeit: boolean,
): StrassenAnzeige | null {
  if (!stand || !mitZeit) return null;
  const startMs = Date.parse(run.started_at);
  if (!Number.isFinite(startMs)) return null;
  if (stand.status === 'fertig') {
    const zeilen = stand.abschnitte.map((a) => ({
      von: startMs + a.sek_von * 1000,
      bis: startMs + a.sek_bis * 1000,
      strasse: a.strasse,
      ort: a.ort,
      // Ortsteil nie anzeigen (25.11.2026): Nominatim nannte in echten Fahrten Nachbar-Katastralgemeinden
      // („Hauptplatz, Eggenburg (Gauderndorf)“) — für einen Prüfbericht zu riskant. Nur „Straße, Ort“ (Gemeinde stimmt).
      ortsteil: null,
      m: a.m ?? null,
    }));
    if (!zeilen.length) return null;
    const orte = new Set(zeilen.map((z) => z.ort).filter(Boolean));
    return { art: 'tabelle', zeilen, mehrereOrte: orte.size > 1 };
  }
  if (stand.status === 'in_arbeit') return run.canceled ? null : { art: 'ermittelt' };
  return null;
}

/** Straße zur Uhrzeit (ms): der Abschnitt, in dem sie liegt — am Anfang/Ende bis 2 Min. Spielraum (Start/Ende). */
export function strasseZu(zeilen: readonly StrassenZeile[], ms: number): StrassenZeile | undefined {
  for (const z of zeilen) if (ms >= z.von && ms <= z.bis) return z;
  const erste = zeilen[0];
  const letzte = zeilen[zeilen.length - 1];
  if (erste && ms < erste.von && erste.von - ms <= 120000) return erste;
  if (letzte && ms > letzte.bis && ms - letzte.bis <= 120000) return letzte;
  return undefined;
}

/** „Eggenburg“ — nur die Gemeinde, nie ein Ortsteil (siehe strassenAnzeige). */
export function ortText(z: Pick<StrassenZeile, 'ort' | 'ortsteil'>): string {
  return z.ort ?? '';
}

/** „Wiener Straße, Eggenburg“ — Ort nur, wenn gewünscht (z. B. wenn die Fahrt durch mehrere Orte führt). */
export function strassenText(z: StrassenZeile, mitOrt = true): string {
  const o = ortText(z);
  return mitOrt && o ? `${z.strasse}, ${o}` : z.strasse;
}

/** „1,2 km“ / „350 m“ */
export function fmtStrecke(m: number | null): string {
  if (m == null || !Number.isFinite(m)) return '';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** Straßenverlauf vieler Fahrten (Fahrtenbuch). null = Tabelle fehlt/Fehler. Fahrten ohne Zeile fehlen in der Map. */
export async function fetchStrassenViele(sb: SupabaseClient, ids: readonly string[]): Promise<Map<string, StrassenStand> | null> {
  const out = new Map<string, StrassenStand>();
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await sb.from('route_run_strassen').select('run_id, status, abschnitte, quelle').in('run_id', ids.slice(i, i + 100));
      if (error) return null;
      for (const row of (data ?? []) as Record<string, unknown>[]) if (typeof row.run_id === 'string') out.set(row.run_id, strassenStandAus(row));
    }
    return out;
  } catch {
    return null;
  }
}
