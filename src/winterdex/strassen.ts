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
import { positionZu, type FahrtDaten } from './fahrtZeit';

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

export interface StrassenTabelle {
  art: 'tabelle';
  zeilen: StrassenZeile[];
  mehrereOrte: boolean;
  /** Anbieter-Code aus route_run_strassen.quelle ('osm-nominatim' Verfahren 1/2, 'osm-overpass' ab Verfahren 3) */
  quelle: string | null;
  /** Summe der Spalte „Strecke“ (null = Meter fehlen) und gefahrene Meter der Fahrt (Kennzahl „gefahren (GPS)“) */
  summeM: number | null;
  gesamtM: number | null;
  /** Meter je Zeile aus der GPS-Spur im Zeitfenster der Zeile nachgerechnet (Server-Meter wichen > 2 % ab) */
  mAusSpur: boolean;
  /** Summe weicht auch danach noch > 2 % von den gefahrenen Metern ab (z. B. Wegstücke ohne Straßenzuordnung) */
  abweichung: boolean;
}
export type StrassenAnzeige = { art: 'ermittelt' } | StrassenTabelle;

/** Quellenangabe (ODbL) — überall, wo Straßennamen erscheinen; gleich für jedes OSM-Verfahren (Nominatim, Overpass). */
export const STRASSEN_QUELLE = '© OpenStreetMap-Mitwirkende';
export const STRASSEN_QUELLE_URL = 'https://www.openstreetmap.org/copyright';

/**
 * Wie die Straßennamen ermittelt wurden — für die Fußnote im Bericht, je Verfahren (route_run_strassen.quelle):
 * Overpass (ab Verfahren 3): jeder GPS-Punkt der nächsten Straße aus den OSM-Straßendaten zugeordnet;
 * Nominatim (Verfahren 1/2): Stichproben entlang der Spur. Unbekannt → neutral.
 */
export function strassenMethode(quelle: string | null | undefined): string {
  // Verfahren 3 = Kartenabgleich (Viterbi über das OSM-Wegenetz): die PASSENDE Straße, nicht zwingend die nächstgelegene
  if (quelle && /overpass/i.test(quelle))
    return 'nach der Fahrt per Kartenabgleich jedem GPS-Punkt die passende Straße aus den OpenStreetMap-Straßendaten zugeordnet (Straßen ab ca. 30 m bzw. 10 s)';
  if (quelle && /nominatim/i.test(quelle)) return 'nach der Fahrt an Stichproben entlang der GPS-Spur ermittelt (sehr kurze Straßenstücke können fehlen)';
  return 'nach der Fahrt aus den GPS-Punkten ermittelt';
}

/** Weichen zwei Meter-Angaben sichtbar voneinander ab? (> 2 % und mehr als 10 m — Rundung der Anzeige zählt nicht) */
export function meterWeichenAb(a: number, b: number): boolean {
  return Math.abs(a - b) > Math.max(0.02 * Math.abs(b), 10);
}

/** Gefahrene Meter der Spur zwischen zwei Uhrzeiten (ms) — gleiche Rechnung wie „km seit Start“ in der Zeitleiste. */
export function spurMeter(F: FahrtDaten, vonMs: number, bisMs: number): number | null {
  const a = positionZu(F, vonMs);
  const b = positionZu(F, bisMs);
  if (!a || !b) return null;
  return Math.max(0, b.dM - a.dM);
}

/** Zusatz zur Fußnote: woher die Meter kommen bzw. warum die Summe nicht die gefahrenen Meter ergibt. */
export function strassenMeterHinweis(t: Pick<StrassenTabelle, 'mAusSpur' | 'abweichung' | 'summeM' | 'gesamtM'> & { quelle?: string | null }): string {
  const teile: string[] = [];
  if (t.mAusSpur) teile.push('Strecke je Zeile aus der GPS-Spur im Zeitraum der Zeile berechnet (wie „km seit Start“).');
  if (t.abweichung && t.summeM != null && t.gesamtM != null) {
    const summe = `Die Zeilen ergeben zusammen ${fmtStrecke(t.summeM)} von ${fmtStrecke(t.gesamtM)} gefahrenen`;
    // Grund ehrlich nennen (Prüfer 26.11.): ohne Spur bleiben bei Verfahren 1/2 die zu knappen Meter des alten Wegzählers
    // stehen — das ist KEIN Wegstück ohne Straße; „der Rest …“ nur, wenn wirklich Meter fehlen
    const altesVerfahren = !t.mAusSpur && !(t.quelle && /overpass/i.test(t.quelle));
    if (altesVerfahren)
      teile.push(`${summe} — Strecke je Zeile nach dem bisherigen Verfahren (einzelne Zeilen zu knapp); maßgeblich ist die gefahrene Strecke laut GPS.`);
    else if (t.summeM < t.gesamtM) teile.push(`${summe} — der Rest liegt auf Wegstücken ohne Straßenzuordnung (z. B. Hof, Parkplatz).`);
    else teile.push(`${summe} — maßgeblich ist die gefahrene Strecke laut GPS.`);
  }
  return teile.join(' ');
}

/** Straßenverlauf frisch laden mit Frist (PDF-Knopf: nicht ewig warten); Fehler/Frist → null (dann gilt der bisherige Stand). */
export function strassenFrisch(laden: () => Promise<StrassenStand | null>, ms = 3000): Promise<StrassenStand | null> {
  return new Promise((ok) => {
    const t = setTimeout(() => ok(null), ms);
    laden().then(
      (s) => {
        clearTimeout(t);
        ok(s && s.status !== 'fehlt' ? s : null);
      },
      () => {
        clearTimeout(t);
        ok(null);
      },
    );
  });
}
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
 *
 * Meter je Zeile (Tagescheck 26.11.2026, Fund 11): Der Worker bis Verfahren 2 zählte erst ab 20 m Abstand weiter —
 * die Spalte „Strecke“ ergab zusammen bis 27 % weniger als „gefahren (GPS)“ im selben Bericht. Mit der Spur (opts.F)
 * wird deshalb geprüft: Weicht die Summe der Server-Meter > 2 % von den gefahrenen Metern ab, rechnet die Anzeige die
 * Meter je Zeile aus der GPS-Spur im Zeitfenster nach (gleiche Rechnung wie „km seit Start“) — und sagt das in der
 * Fußnote. Ab Verfahren 3 (osm-overpass) stimmen die Server-Meter, dann bleiben sie unverändert.
 */
export function strassenAnzeige(
  stand: StrassenStand | null | undefined,
  run: { started_at: string; canceled?: boolean | null },
  mitZeit: boolean,
  opts: { F?: FahrtDaten | null; gefahrenM?: number | null } = {},
): StrassenAnzeige | null {
  if (!stand || !mitZeit) return null;
  const startMs = Date.parse(run.started_at);
  if (!Number.isFinite(startMs)) return null;
  if (stand.status === 'fertig') {
    const zeilen: StrassenZeile[] = stand.abschnitte.map((a) => ({
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
    const F = opts.F && opts.F.mitZeit && opts.F.n >= 2 ? opts.F : null;
    const spurGesamt = F ? F.d[F.n - 1] : null;
    const gesamtM = opts.gefahrenM != null && Number.isFinite(opts.gefahrenM) && opts.gefahrenM > 0 ? opts.gefahrenM : spurGesamt;
    const summe = (ms: readonly (number | null)[]) => (ms.every((m) => m != null && Number.isFinite(m)) ? (ms as number[]).reduce((a, b) => a + b, 0) : null);
    const serverSumme = summe(zeilen.map((z) => z.m));
    // Verfahren 1/2 (Nominatim) zählte mit 20-m-Schwelle: einzelne Zeilen bis −32 %, auch wenn die Summe knapp passt
    // (echte Fahrt 25.11.: Σ −2,0 %) → dann immer aus der Spur. Ab Verfahren 3 (Overpass) nur bei > 2 % Abweichung.
    const altesVerfahren = !stand.quelle || /nominatim/i.test(stand.quelle);
    let mAusSpur = false;
    if (F && gesamtM != null && (altesVerfahren || serverSumme == null || meterWeichenAb(serverSumme, gesamtM))) {
      const neu = zeilen.map((z) => spurMeter(F, z.von, z.bis));
      const neuSumme = summe(neu);
      // Verfahren 3: nur übernehmen, wenn die Spur-Rechnung wirklich näher an den gefahrenen Metern liegt
      if (neuSumme != null && (altesVerfahren || serverSumme == null || Math.abs(neuSumme - gesamtM) < Math.abs(serverSumme - gesamtM))) {
        zeilen.forEach((z, i) => (z.m = neu[i]));
        mAusSpur = true;
      }
    }
    const summeM = summe(zeilen.map((z) => z.m));
    return {
      art: 'tabelle',
      zeilen,
      mehrereOrte: orte.size > 1,
      quelle: stand.quelle,
      summeM,
      gesamtM,
      mAusSpur,
      abweichung: summeM != null && gesamtM != null && meterWeichenAb(summeM, gesamtM),
    };
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
