// Wetterverlauf im Prüfbericht (Wetter-Guide P3, Bauplan G5/G13/5.5) — Laden, feste Texte, Bausteine für PDF und Excel.
// Quelle: wetter_beleg (versiegelt, nur Anhängen; Prüfcode verkettet mit dem Prüfcode des Nachweises) und der Stand je
// Nachweis aus wetter_beleg_stand (WinterDex/supabase/NACHTRAG-WETTER-BELEG-2026-11-26.sql).
//   · Wortlaut kommt NUR vom Server (Worker beleg.ts): Kurzsatz nach G13 („Schneefall endete ca. 05:30 · Einsatz ab
//     05:50“) und Kernsatz (5.5). Hier wird nichts umformuliert und nichts bewertet — die Datenbank lehnt Bewertungs-
//     Wörter ohnehin ab.
//   · Paywall (D1, 2a): Belege entstehen nur serverseitig für Pro/Probe; Free bekommt den Stand „nur_pro“ → „Wetterverlauf
//     im Nachweis: mit WinterDex Pro.“ NUR auf der Detailseite — PDFs und Excel bleiben für Free genau wie bisher (keine
//     Werbung in einem Nachweis, der an Auftraggeber/Gerichte geht). Vorhandene Belege bleiben nach Pro-Ende sichtbar.
//   · Ohne Beleg (wird ermittelt, Quelle fehlt, …) zeigen PDF-Zeilen IMMER den bisherigen Schnappschuss, den Stand nur klein
//     und grau darunter (Bauplan P3: der Modell-Momentwert bleibt) — eine Lücke im Nachholen leert nie einen Nachweis.
//   · Nachträglich aus Stundenwerten ermittelte Belege (stufe „nachtrag“) sind in jeder Zeile als solche gekennzeichnet.
//   · „aus“ (Schalter aus/noch nicht freigegeben, storniert ohne Beleg, vor dem 01.10.2026) → keine Zeile.
//   · Fehlt der Nachtrag (RPC fehlt) → alles wie bisher; Fehler beim Laden stoppen nie ein PDF.
// Getestet in tests/wetter-dashboard.test.mjs (Fixtures = echte Belege aus WinterDex backend/test/wetter-beleg.test).
import type { SupabaseClient } from '@supabase/supabase-js';
import { rpcFehlt, uhrzeit, wochentag } from './heuteNachtDaten';
import { weatherLabel } from './labels';
import type { WeatherSnapshot } from './types';

export type Bezug = 'operation' | 'run';
export type BelegStandArt = 'da' | 'wird_ermittelt' | 'quelle_fehlt' | 'nicht_verfuegbar' | 'ohne_standort' | 'nur_pro' | 'aus';

export interface BelegStunde {
  /** Stundenbeginn, Unix-Sekunden */
  von: number;
  mm: number | null;
  t: number | null;
  art: string | null;
  voll?: boolean;
  quelle?: string | null;
}
export interface BelegPhase {
  z?: string;
  art: string;
  beginn: number;
  ende: number | null;
  ende_bestaetigt?: boolean;
  mm?: number;
  cm?: [number, number] | null;
  luecke?: boolean;
}
export interface BelegAmtlich {
  typ: number;
  stufe: number;
  beginn?: number;
  ende?: number;
  text?: string | null;
  gemeinde?: string | null;
  satz?: string | null;
}
export interface BelegFakten {
  nachweis?: { art?: string; beginn?: number; ende?: number | null };
  zeitraum?: { von?: number; bis?: number };
  grundlage?: string;
  phasen?: BelegPhase[];
  stunden?: BelegStunde[];
  luecken?: Array<[number, number]>;
  tmin?: number | null;
  mm_summe?: number | null;
  amtlich?: BelegAmtlich[];
  pflicht_ab?: string | null;
  vermerk?: string | null;
  fusszeile?: string | null;
}
export interface BelegQuelle {
  code?: string;
  text?: string;
  lizenz?: string;
  datensatz?: string;
}
export interface WetterBeleg {
  id: number;
  operation_id: string | null;
  run_id: string | null;
  stufe: 'verlauf' | 'nachtrag';
  satz: string;
  kurz: string;
  fakten: BelegFakten;
  quellen: BelegQuelle[];
  entry_hash: string;
  erstellt_at: string;
  zeitraum_von: string;
  zeitraum_bis: string;
  land: string | null;
}
export interface WetterInfo {
  stand: BelegStandArt;
  beleg: WetterBeleg | null;
}
export type WetterLadung = { art: 'ok'; je: Map<string, WetterInfo> } | { art: 'aus' } | { art: 'fehler' };

/** Spalten, die gelesen werden (RLS „lesen wie der Nachweis“) */
export const BELEG_SPALTEN = 'id, operation_id, run_id, stufe, satz, kurz, fakten, quellen, entry_hash, erstellt_at, zeitraum_von, zeitraum_bis, land';

const STAENDE: readonly BelegStandArt[] = ['da', 'wird_ermittelt', 'quelle_fehlt', 'nicht_verfuegbar', 'ohne_standort', 'nur_pro', 'aus'];

/** Fehlfälle „nie leer“ (5.5) — wortgleich mit dem Kopf von NACHTRAG-WETTER-BELEG; für Fahrten „Fahrtende“/„Spur“. */
export function standText(stand: BelegStandArt, bezug: Bezug): string | null {
  switch (stand) {
    case 'wird_ermittelt':
      return `Wetterverlauf wird ermittelt (ca. 1–3 Std. nach ${bezug === 'run' ? 'Fahrtende' : 'Einsatzende'}).`;
    case 'quelle_fehlt':
      return 'Wetterverlauf nicht verfügbar (Datenquelle nicht erreichbar) – erneuter Versuch läuft.';
    case 'nicht_verfuegbar':
      return 'Wetterverlauf nicht verfügbar.';
    case 'ohne_standort':
      return bezug === 'run' ? 'Kein Wetterverlauf: Fahrt ohne GPS-Spur und Strecke ohne Standort.' : 'Kein Wetterverlauf: Objekt ohne Standort und Einsatz ohne GPS.';
    case 'nur_pro':
      return 'Wetterverlauf im Nachweis: mit WinterDex Pro.';
    default:
      return null;
  }
}

/**
 * Stand in PDF und Excel (klein, grau, unter dem Schnappschuss): ein Bericht ist ein Abzug zum Zeitpunkt X — darum ohne
 * Zeitversprechen („ca. 1–3 Std.“ stimmt beim rückwirkenden Nachholen ab 01.10. nicht) und ohne „Versuch läuft“.
 * „nur_pro“ → null: im Nachweis keine Pro-Werbung (die steht nur auf der Detailseite).
 */
export function standTextBericht(stand: BelegStandArt, bezug: Bezug): string | null {
  switch (stand) {
    case 'wird_ermittelt':
      return 'Wetterverlauf wird noch ermittelt.';
    case 'quelle_fehlt':
      return 'Wetterverlauf noch nicht verfügbar.';
    case 'nicht_verfuegbar':
      return 'Wetterverlauf nicht verfügbar.';
    case 'ohne_standort':
      return standText(stand, bezug);
    default:
      return null;
  }
}

/** Zählt der Stand im Bericht (Spalten/Überschrift)? Nicht bei „aus“ und nicht bei „nur_pro“ (Free = wie bisher). */
export const wetterImBericht = (i: WetterInfo | null | undefined): i is WetterInfo => !!i && i.stand !== 'aus' && i.stand !== 'nur_pro';

/** Prüfcode wie überall: die ersten 12 Zeichen des SHA-256 */
export const pruefcode = (hash: string | null | undefined): string => (hash ? hash.slice(0, 12) : '');

const istObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function belegLesen(x: unknown): WetterBeleg | null {
  if (!istObj(x)) return null;
  const id = typeof x.id === 'number' ? x.id : typeof x.id === 'string' && /^\d+$/.test(x.id) ? Number(x.id) : NaN;
  if (!Number.isFinite(id) || typeof x.satz !== 'string' || typeof x.kurz !== 'string' || typeof x.entry_hash !== 'string') return null;
  return {
    id,
    operation_id: typeof x.operation_id === 'string' ? x.operation_id : null,
    run_id: typeof x.run_id === 'string' ? x.run_id : null,
    stufe: x.stufe === 'nachtrag' ? 'nachtrag' : 'verlauf',
    satz: x.satz,
    kurz: x.kurz,
    fakten: istObj(x.fakten) ? (x.fakten as BelegFakten) : {},
    quellen: Array.isArray(x.quellen) ? (x.quellen.filter(istObj) as BelegQuelle[]) : [],
    entry_hash: x.entry_hash,
    erstellt_at: String(x.erstellt_at ?? ''),
    zeitraum_von: String(x.zeitraum_von ?? ''),
    zeitraum_bis: String(x.zeitraum_bis ?? ''),
    land: typeof x.land === 'string' ? x.land : null,
  };
}

function stueckeln<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

/**
 * Stand + Beleg je Nachweis (höchstens 500 IDs je Aufruf, Belege in Blöcken zu 100). Wirft nie: „aus“ = Nachtrag fehlt,
 * „fehler“ = Netz/Server gestört (dann bleibt alles wie bisher — ein PDF entsteht immer).
 */
export async function ladeWetter(sb: SupabaseClient, bezug: Bezug, ids: readonly string[]): Promise<WetterLadung> {
  const alle = [...new Set(ids.filter((i) => typeof i === 'string' && i))];
  const je = new Map<string, WetterInfo>();
  if (!alle.length) return { art: 'ok', je };
  try {
    const belegVon = new Map<number, string>();
    for (const teil of stueckeln(alle, 500)) {
      const { data, error, status } = await sb.rpc('wetter_beleg_stand', { p_bezug: bezug, p_ids: teil });
      if (error) return rpcFehlt({ ...error, status }) ? { art: 'aus' } : { art: 'fehler' };
      for (const z of Array.isArray(data) ? data : []) {
        if (!istObj(z) || typeof z.id !== 'string') continue;
        const stand = (STAENDE as readonly unknown[]).includes(z.stand) ? (z.stand as BelegStandArt) : 'aus';
        je.set(z.id, { stand, beleg: null });
        const bid = typeof z.beleg_id === 'number' ? z.beleg_id : Number(z.beleg_id);
        if (stand === 'da' && Number.isFinite(bid)) belegVon.set(bid, z.id);
      }
    }
    for (const teil of stueckeln([...belegVon.keys()], 100)) {
      const { data, error } = await sb.from('wetter_beleg').select(BELEG_SPALTEN).in('id', teil);
      if (error) return { art: 'fehler' };
      for (const roh of Array.isArray(data) ? data : []) {
        const b = belegLesen(roh);
        const nid = b ? belegVon.get(b.id) : undefined;
        if (b && nid) je.set(nid, { stand: 'da', beleg: b });
      }
    }
    // „da“, aber Beleg nicht lesbar (sollte nie vorkommen) → lieber nichts zeigen als eine leere Zeile
    for (const [k, v] of je) if (v.stand === 'da' && !v.beleg) je.delete(k);
    return { art: 'ok', je };
  } catch {
    return { art: 'fehler' };
  }
}

/** Wie ladeWetter, aber nach `ms` aufgeben (Bericht-Knöpfe: das PDF wartet nie lange aufs Wetter) */
export function ladeWetterMitFrist(sb: SupabaseClient, bezug: Bezug, ids: readonly string[], ms = 15000): Promise<WetterLadung> {
  return new Promise((ok) => {
    const t = setTimeout(() => ok({ art: 'fehler' }), ms);
    ladeWetter(sb, bezug, ids).then(
      (r) => {
        clearTimeout(t);
        ok(r);
      },
      () => {
        clearTimeout(t);
        ok({ art: 'fehler' });
      },
    );
  });
}

/** Map oder null (aus/Fehler) — für die Bericht-Bausteine */
export const wetterMap = (l: WetterLadung | null | undefined): Map<string, WetterInfo> | null => (l?.art === 'ok' ? l.je : null);

// ---------------------------------------------------------------------------------------------- Texte

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const fmtDatum = (ms: number, tz?: string) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ms));

/**
 * Kurzvermerk je Zeile für nachträglich ermittelte Belege (stufe „nachtrag“ = nur Stundenwerte, zum Zeitpunkt des
 * Nachweises nicht gespeichert): „Aus Stundenwerten nachträglich ermittelt am 10.12.2026“. Sonst null.
 */
export function nachtragKurz(b: WetterBeleg, tz?: string): string | null {
  if (b.stufe !== 'nachtrag') return null;
  const ms = Date.parse(b.erstellt_at);
  return `Aus Stundenwerten nachträglich ermittelt${Number.isFinite(ms) ? ` am ${fmtDatum(ms, tz)}` : ''}`;
}

/** „Wetterverlauf gespeichert am 26.11.2026, 07:42 · Prüfcode 3fa9c1d2e8b0“ (5.5) */
export function archivVermerk(b: WetterBeleg, tz: string): string {
  const ms = Date.parse(b.erstellt_at);
  const am = Number.isFinite(ms) ? ` am ${fmtDatum(ms, tz)}, ${uhrzeit(ms, tz)}` : '';
  return `Wetterverlauf gespeichert${am} · Prüfcode ${pruefcode(b.entry_hash)}`;
}

/** Vermerke des Servers (z. B. „Aus Stundenwerten nachträglich ermittelt …“) — grau, nicht rot */
export const belegVermerk = (b: WetterBeleg): string | null => (typeof b.fakten.vermerk === 'string' && b.fakten.vermerk.trim() ? b.fakten.vermerk.trim() : null);

/** Amtliche Warnungen wörtlich (Server-Satz) */
export const amtlicheSaetze = (b: WetterBeleg): string[] =>
  (Array.isArray(b.fakten.amtlich) ? b.fakten.amtlich : []).map((a) => (typeof a?.satz === 'string' ? a.satz : null)).filter((s): s is string => !!s);

const STUFE_WORT: Record<number, string> = { 1: 'Gelbe', 2: 'Orange', 3: 'Rote' };
const TYP_WORT: Record<number, string> = { 3: 'Schneewarnung', 4: 'Glatteiswarnung' };
/** Kurz für Tabellen: „Amtlich: Gelbe Glatteiswarnung“ (Stufe als Wort) */
export function amtlichKurz(b: WetterBeleg): string | null {
  const a = (Array.isArray(b.fakten.amtlich) ? b.fakten.amtlich : []).filter((x) => x && typeof x.stufe === 'number');
  if (!a.length) return null;
  const s = [...a].sort((x, y) => y.stufe - x.stufe)[0];
  return `Amtlich: ${`${STUFE_WORT[s.stufe] ?? ''} ${TYP_WORT[s.typ] ?? 'Wetterwarnung'}`.trim()}${a.length > 1 ? ` (+${a.length - 1})` : ''}`;
}

/** Fußzeile AT bzw. neutral (5.5) — der Server schreibt sie in die Fakten; Rückfall nach Land */
export const FUSS_AT =
  'Wetterangaben sind Analyse- und Modellwerte für den Objektstandort und können örtlich abweichen (Schauer, Höhenlage, Beschattung). § 93 StVO legt keine feste Wartezeit nach Ende des Schneefalls fest; maßgeblich sind die Umstände des Einzelfalls. WinterDex gibt Zeiten wieder und bewertet nicht, ob Pflichten erfüllt wurden. Datensatz und Zeitraum sind angegeben, damit die Werte unabhängig geprüft werden können.';
export const FUSS_NEUTRAL =
  'Wetterangaben sind Analyse- bzw. Modellwerte für den Standort und können örtlich abweichen. Zeiten und Fristen ergeben sich aus den örtlichen Vorschriften; maßgeblich sind die Umstände des Einzelfalls. WinterDex gibt Zeiten wieder und bewertet nicht, ob Pflichten erfüllt wurden.';
export function belegFusszeile(b: WetterBeleg): string {
  if (typeof b.fakten.fusszeile === 'string' && b.fakten.fusszeile.trim()) return b.fakten.fusszeile.trim();
  return b.land === 'AT' ? FUSS_AT : FUSS_NEUTRAL;
}

/** Quellen nur aus den tatsächlich enthaltenen Belegen (dynamisch, ohne Doppel) */
export function quellenTexte(belege: Iterable<WetterBeleg>): string[] {
  const out: string[] = [];
  for (const b of belege) for (const q of b.quellen) if (typeof q.text === 'string' && q.text && !out.includes(q.text)) out.push(q.text);
  return out;
}
/** Fußzeilen der enthaltenen Belege (AT und/oder neutral), ohne Doppel */
export function fusszeilen(belege: Iterable<WetterBeleg>): string[] {
  const out: string[] = [];
  for (const b of belege) {
    const f = belegFusszeile(b);
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

/** „Modell-Momentwert bei Beginn: −2 °C (Open-Meteo)“ — der bisherige Schnappschuss, klein unter dem Kurzsatz */
export function momentwert(w: { temp_c?: number | null } | null | undefined): string | null {
  if (!w || typeof w.temp_c !== 'number' || !Number.isFinite(w.temp_c)) return null;
  const r = Math.round(w.temp_c);
  return `Modell-Momentwert bei Beginn: ${r < 0 ? '−' : ''}${Math.abs(r)} °C (Open-Meteo)`;
}

// ---------------------------------------------------------------------------------------------- PDF-Bausteine (HTML)

/**
 * Zelle „Wetter“ im Einsatz-Nachweis bzw. Fahrtenbuch. Mit Beleg: Zeile 1 Kurzsatz (G13), klein grau amtliche Stufe als
 * Wort, Modell-Momentwert, bei „nachtrag“ der Vermerk „Aus Stundenwerten nachträglich ermittelt am …“, Prüfcode; storniert
 * mit Durchstrich. Ohne Beleg: IMMER der bisherige Schnappschuss, der Stand nur klein und grau darunter (Bauplan P3).
 * null (ohne Wetter-Daten, „aus“, „nur_pro“) → der Aufrufer zeigt den Schnappschuss genau wie bisher.
 */
export function wetterZelleHtml(
  info: WetterInfo | null | undefined,
  bezug: Bezug,
  w: WeatherSnapshot | null | undefined,
  opts: {
    canceled?: boolean;
    /** Fahrtenbuch: nur der Kurzsatz (Bauplan P3) */
    kompakt?: boolean;
    /** Zone des Betriebs (Datum im Nachtrag-Vermerk) */
    tz?: string;
  } = {},
): string | null {
  if (!wetterImBericht(info)) return null;
  const { canceled = false, kompakt = false, tz } = opts;
  if (info.stand !== 'da' || !info.beleg) {
    const t = standTextBericht(info.stand, bezug);
    return `${esc(weatherLabel(w))}${t ? `<div class="wv-klein wv-stand">${esc(t)}</div>` : ''}`;
  }
  const b = info.beleg;
  const kurz = canceled ? `<s>${esc(b.kurz)}</s>` : esc(b.kurz);
  const nt = nachtragKurz(b, tz);
  const nachtrag = nt ? `<div class="wv-klein">${esc(nt)}</div>` : '';
  if (kompakt) return `<span class="wv-kurz">${kurz}</span>${nachtrag}`;
  const m = momentwert(w);
  const am = amtlichKurz(b);
  return `<b class="wv-kurz">${kurz}</b>${am ? `<div class="wv-klein">${esc(am)}</div>` : ''}${m ? `<div class="wv-klein">${esc(m)}</div>` : ''}${nachtrag}<div class="wv-klein mono">Wetter-Prüfcode ${esc(pruefcode(b.entry_hash))}</div>`;
}

/** Styles für die Wetter-Bausteine im Druck (einmal je Bericht in <style>) */
export const WETTER_PDF_STYLE = `
  .wv-kurz { font-weight: 700; }
  .wv-klein { font-size: 9.5px; color: #51606f; margin-top: 2px; }
  .wv-stand { color: #51606f; font-size: 10.5px; }
  .wv-kasten { border: 1.5px solid #AFC1D2; border-radius: 8px; padding: 10px 12px; margin: 0 0 12px; page-break-inside: avoid; break-inside: avoid; }
  .wv-kasten h2 { margin: 0 0 6px; }
  .wv-kasten p { margin: 3px 0; }
  .wv-kasten svg { display: block; width: 100%; height: auto; margin: 6px 0 2px; }
  .wv-anhang { margin-top: 14px; border: 1.5px solid #AFC1D2; border-radius: 8px; padding: 8px 12px; font-size: 10px; color: #3b4a59; page-break-inside: avoid; }
  .wv-anhang p { margin: 3px 0; }
`;

/**
 * Kasten „Wetterverlauf“ unter dem Kopf des Fahrt-Nachweises (Kurzsatz, Kernsatz, kleine Zeitleiste, Vermerke, Prüfcode).
 * Ohne Beleg nur der kurze Stand (der Schnappschuss steht weiter unten unter „Wetterlage (archiviert)“); „aus“ und
 * „nur_pro“ → kein Kasten (Free: Nachweis wie bisher, ohne Pro-Werbung).
 */
export function wetterKastenHtml(info: WetterInfo | null | undefined, bezug: Bezug, tz: string, canceled = false): string {
  if (!wetterImBericht(info)) return '';
  if (info.stand !== 'da' || !info.beleg) {
    const t = standTextBericht(info.stand, bezug);
    return t ? `<div class="wv-kasten"><h2>Wetterverlauf</h2><p class="wv-stand">${esc(t)}</p></div>` : '';
  }
  const b = info.beleg;
  const s = (x: string) => (canceled ? `<s>${esc(x)}</s>` : esc(x));
  const vermerk = belegVermerk(b);
  return `<div class="wv-kasten"><h2>Wetterverlauf</h2>
    <p class="wv-kurz">${s(b.kurz)}</p>
    <p>${s(b.satz)}</p>
    ${amtlicheSaetze(b).map((a) => `<p class="wv-klein">${esc(a)}</p>`).join('')}
    ${zeitleisteSvg(b, tz)}
    ${vermerk ? `<p class="wv-klein">${esc(vermerk)}</p>` : ''}
    <p class="wv-klein mono">${esc(archivVermerk(b, tz))}</p>
  </div>`;
}

/**
 * Woher die Zeiten stammen — nach den tatsächlich enthaltenen Stufen: „verlauf“ = zum Zeitpunkt des Nachweises gespeicherte
 * 15-Min.-Analyse (Uhrzeiten auf 15 Min. gerundet), „nachtrag“ = nachträglich abgerufene Stundenwerte (stundengenau).
 */
export function herkunftText(belege: Iterable<WetterBeleg>): string {
  let verlauf = false;
  let nachtrag = false;
  for (const b of belege) {
    if (b.stufe === 'nachtrag') nachtrag = true;
    else verlauf = true;
  }
  const ana = 'aus der zum Zeitpunkt des Nachweises gespeicherten 15-Minuten-Analyse ermittelt (Uhrzeiten auf 15 Minuten gerundet)';
  const std = 'nachträglich aus Stundenwerten ermittelt, die zum Zeitpunkt des Nachweises nicht gespeichert waren (Zeiten auf die Stunde genau)';
  if (verlauf && nachtrag) return `Je Nachweis einmal ${ana} – bei Einträgen mit dem Vermerk „Aus Stundenwerten nachträglich ermittelt“ ${std}.`;
  return `Je Nachweis einmal ${nachtrag ? std : ana}.`;
}

/** Schluss-Absatz im Bericht: Herkunft (nach Stufen) + Quellen (nur die enthaltenen) + Fußzeile AT/neutral + Prüfcode. */
export function wetterAnhangHtml(belege: WetterBeleg[]): string {
  if (!belege.length) return '';
  return `<div class="wv-anhang"><p><b>Wetterverlauf (archiviert).</b> ${esc(herkunftText(belege))} Jeder Wetterverlauf ist mit
    eigenem Prüfcode (SHA-256) versiegelt, verknüpft mit dem Prüfcode des Nachweises; spätere Änderungen sind technisch
    gesperrt. Schneemengen geschätzt.</p>
    ${quellenTexte(belege).map((q) => `<p>${esc(q)}</p>`).join('')}
    ${fusszeilen(belege).map((f) => `<p>${esc(f)}</p>`).join('')}</div>`;
}

// ---------------------------------------------------------------------------------------------- Zeitleiste (SVG)

const ART_FARBE: Record<string, { fill: string; muster: boolean; wort: string }> = {
  schnee: { fill: '#1D4ED8', muster: false, wort: 'Schnee' },
  schneeregen: { fill: '#60A5FA', muster: false, wort: 'Schneeregen' },
  regen: { fill: '#1D4ED8', muster: true, wort: 'Regen' },
  eisregen: { fill: '#7C3AED', muster: true, wort: 'gefrierender Regen' },
  gefrierend: { fill: '#7C3AED', muster: true, wort: 'gefrierender Regen' },
};

/**
 * Kleine Zeitleiste (12 Std. vor Beginn bis 2 Std. nach Ende): Niederschlag je Stunde blau (Schnee voll, Regen schraffiert,
 * gefrierender Regen violett schraffiert), Niederschlags-Phasen der 15-Min.-Analyse als Band, Einsatz/Fahrt grün,
 * Räumzeit-Linie nur aus duty_times (pflicht_ab), Datenlücken grau. Reines SVG für Druck und Seite (heller Grund).
 */
export function zeitleisteSvg(b: WetterBeleg, tz: string, opts: { breite?: number } = {}): string {
  const f = b.fakten;
  const von = Number(f.zeitraum?.von ?? Date.parse(b.zeitraum_von) / 1000);
  const bis = Number(f.zeitraum?.bis ?? Date.parse(b.zeitraum_bis) / 1000);
  if (!Number.isFinite(von) || !Number.isFinite(bis) || bis <= von) return '';
  const W = opts.breite ?? 640;
  const L = 6;
  const R = W - 6;
  const x = (s: number) => L + ((Math.min(Math.max(s, von), bis) - von) / (bis - von)) * (R - L);
  const yBand = 8;
  const yBalkenOben = 22;
  const yBalkenUnten = 74;
  const yNachweis = 80;
  const yAchse = 96;
  const H = 112;
  const stunden = Array.isArray(f.stunden) ? f.stunden.filter((s) => s && Number.isFinite(s.von)) : [];
  const maxMm = Math.max(1, ...stunden.map((s) => (typeof s.mm === 'number' ? s.mm : 0)));
  const teile: string[] = [];
  teile.push(
    `<defs><pattern id="wv-schraffur-${b.id}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="#1D4ED8"/></pattern>` +
      `<pattern id="wv-schraffur-eis-${b.id}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="#7C3AED"/></pattern>` +
      `<pattern id="wv-luecke-${b.id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="1.5" height="5" fill="#9CA3AF"/></pattern></defs>`,
  );
  teile.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  // Datenlücken
  for (const l of Array.isArray(f.luecken) ? f.luecken : []) {
    if (!Array.isArray(l) || l.length !== 2) continue;
    const a = x(l[0]);
    const e = x(l[1]);
    if (e - a > 0.5) teile.push(`<rect x="${a.toFixed(1)}" y="${yBalkenOben}" width="${(e - a).toFixed(1)}" height="${yBalkenUnten - yBalkenOben}" fill="url(#wv-luecke-${b.id})" opacity="0.6"><title>Datenlücke</title></rect>`);
  }
  // Grundlinie
  teile.push(`<line x1="${L}" y1="${yBalkenUnten}" x2="${R}" y2="${yBalkenUnten}" stroke="#9CA5AD" stroke-width="1"/>`);
  // Niederschlag je Stunde
  for (const s of stunden) {
    if (typeof s.mm !== 'number' || s.mm <= 0 || !s.art || s.art === 'trocken') continue;
    const st = ART_FARBE[s.art] ?? ART_FARBE.regen;
    const a = x(s.von);
    const e = x(s.von + 3600);
    const h = Math.max(2, (s.mm / maxMm) * (yBalkenUnten - yBalkenOben));
    const fill = st.muster ? (s.art === 'eisregen' || s.art === 'gefrierend' ? `url(#wv-schraffur-eis-${b.id})` : `url(#wv-schraffur-${b.id})`) : st.fill;
    teile.push(
      `<rect x="${(a + 0.5).toFixed(1)}" y="${(yBalkenUnten - h).toFixed(1)}" width="${Math.max(1, e - a - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" stroke="${st.fill}" stroke-width="0.6"><title>${esc(`${uhrzeit(s.von * 1000, tz)}: ${st.wort}, ${String(Math.round(s.mm * 10) / 10).replace('.', ',')} mm`)}</title></rect>`,
    );
  }
  // Phasen der 15-Min.-Analyse (genaue Zeiten)
  for (const p of Array.isArray(f.phasen) ? f.phasen : []) {
    if (!p || !Number.isFinite(p.beginn)) continue;
    const st = ART_FARBE[p.art] ?? ART_FARBE.regen;
    const a = x(p.beginn);
    const e = x(p.ende ?? bis);
    teile.push(`<rect x="${a.toFixed(1)}" y="${yBand}" width="${Math.max(2, e - a).toFixed(1)}" height="8" rx="2" fill="${st.fill}" opacity="${st.muster ? 0.55 : 0.85}"/>`);
  }
  // Einsatz/Fahrt (grün)
  const nb = Number(f.nachweis?.beginn);
  if (Number.isFinite(nb)) {
    const ne = Number(f.nachweis?.ende);
    const a = x(nb);
    const e = Number.isFinite(ne) && ne > nb ? x(ne) : a + 3;
    teile.push(`<rect x="${a.toFixed(1)}" y="${yNachweis}" width="${Math.max(3, e - a).toFixed(1)}" height="7" rx="2" fill="#16A34A"/>`);
  }
  // Räumzeit-Linie nur aus duty_times (pflicht_ab „HH:MM“ am Tag des Beginns)
  const pf = typeof f.pflicht_ab === 'string' ? /^(\d{2}):(\d{2})$/.exec(f.pflicht_ab) : null;
  if (pf && Number.isFinite(nb)) {
    // gesucht: Zeitpunkt HH:MM Ortszeit am Tag des Beginns — durch Probieren in 15-min-Schritten (Zeitumstellung sicher)
    const ziel = `${pf[1]}:${pf[2]}`;
    let ms: number | null = null;
    const tag0 = nb * 1000 - 12 * 3_600_000;
    for (let t = Math.floor(tag0 / 900_000) * 900_000; t < nb * 1000 + 14 * 3_600_000; t += 900_000) {
      if (uhrzeit(t, tz) === ziel && fmtDatum(t, tz) === fmtDatum(nb * 1000, tz)) {
        ms = t;
        break;
      }
    }
    if (ms !== null && ms / 1000 >= von && ms / 1000 <= bis) {
      const px = x(ms / 1000);
      teile.push(`<line x1="${px.toFixed(1)}" y1="${yBand}" x2="${px.toFixed(1)}" y2="${yNachweis + 8}" stroke="#B45309" stroke-width="1.2" stroke-dasharray="3 2"/>`);
      teile.push(`<text x="${(px + 3).toFixed(1)}" y="${yBalkenOben + 8}" font-size="9" fill="#B45309">Räumzeit ${ziel}</text>`);
    }
  }
  // Achse: volle Stunden, beschriftet je nach Länge alle 2 bzw. 3 Std.
  const spanneStd = (bis - von) / 3600;
  const schritt = spanneStd > 18 ? 3 : 2;
  const erste = Math.ceil(von / 3600) * 3600;
  for (let s = erste; s <= bis; s += 3600) {
    const px = x(s);
    const label = uhrzeit(s * 1000, tz);
    const h = Number(label.slice(0, 2));
    teile.push(`<line x1="${px.toFixed(1)}" y1="${yBalkenUnten}" x2="${px.toFixed(1)}" y2="${yBalkenUnten + 3}" stroke="#9CA5AD" stroke-width="1"/>`);
    if (h % schritt === 0) teile.push(`<text x="${px.toFixed(1)}" y="${yAchse}" font-size="9.5" fill="#51606f" text-anchor="middle">${label.slice(0, 2)}</text>`);
  }
  // Legende
  const leg = [
    `<rect x="${L}" y="${H - 9}" width="9" height="7" fill="#1D4ED8"/><text x="${L + 12}" y="${H - 3}" font-size="9" fill="#51606f">Schnee</text>`,
    `<rect x="${L + 52}" y="${H - 9}" width="9" height="7" fill="url(#wv-schraffur-${b.id})" stroke="#1D4ED8" stroke-width="0.6"/><text x="${L + 64}" y="${H - 3}" font-size="9" fill="#51606f">Regen</text>`,
    `<rect x="${L + 100}" y="${H - 9}" width="9" height="7" fill="url(#wv-schraffur-eis-${b.id})" stroke="#7C3AED" stroke-width="0.6"/><text x="${L + 112}" y="${H - 3}" font-size="9" fill="#51606f">gefrierender Regen</text>`,
    `<rect x="${L + 204}" y="${H - 9}" width="9" height="7" fill="#16A34A"/><text x="${L + 216}" y="${H - 3}" font-size="9" fill="#51606f">${f.nachweis?.art === 'fahrt' || b.run_id ? 'Fahrt' : 'Einsatz'}</text>`,
    `<text x="${R}" y="${H - 3}" font-size="9" fill="#51606f" text-anchor="end">${esc(`Niederschlag je Stunde · Band = 15-Min.-Analyse · ${wochentag(von * 1000, tz)} ${uhrzeit(von * 1000, tz)} bis ${wochentag(bis * 1000, tz)} ${uhrzeit(bis * 1000, tz)}`)}</text>`,
  ];
  teile.push(...leg);
  const titel = `Zeitleiste Wetterverlauf: ${b.kurz}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(titel)}"><title>${esc(titel)}</title>${teile.join('')}</svg>`;
}

// ---------------------------------------------------------------------------------------------- Excel

/**
 * Zwei Spalten „Wetter (Kurzsatz)“, „Wetter-Prüfcode“ (nur wenn Wetter-Daten geladen wurden). Nachtrag gekennzeichnet;
 * ohne Beleg der kurze Stand; „nur_pro“/„aus“ leer (keine Pro-Werbung je Zeile, der Schnappschuss steht in „Wetter (archiviert)“).
 */
export function excelWetter(info: WetterInfo | null | undefined, bezug: Bezug): [string | null, string | null] {
  if (!wetterImBericht(info)) return [null, null];
  if (info.stand === 'da' && info.beleg)
    return [info.beleg.stufe === 'nachtrag' ? `${info.beleg.kurz} (aus Stundenwerten nachträglich ermittelt)` : info.beleg.kurz, pruefcode(info.beleg.entry_hash)];
  return [standTextBericht(info.stand, bezug), null];
}
