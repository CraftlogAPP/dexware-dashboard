// Karte „Heute Nacht“ (Wetter-Guide P2, Bauplan 5.3) — Laden + reine Rechnung (Name bewusst nicht heuteNacht.ts: neben
// HeuteNacht.tsx verwechselt Windows/Vite sonst die Dateien, Memory windows-gross-klein). EIN Datenweg für App, Dashboard und
// Dexware-Modul: RPC heute_nacht(p_org) (Vertrag v1, WinterDex/supabase/NACHTRAG-WETTER-KARTE-2026-11-26.sql, G2).
//   · Sichtbar nur, wenn der SERVER es erlaubt (karte_live: karte_modus 'live' oder Betrieb in karte_orgs) — nie im Client
//     entschieden. Fehlt die RPC (Nachtrag nicht eingespielt) oder antwortet sie null (kein Mitglied): keine Karte.
//   · Paywall (Bauplan 2a): die Karte sieht jeder; „ereignisse“ schickt der Server nur mit Pro/Probe (wg_pro_stand) — der
//     Client zeigt sie nur, wenn sie da sind. Ob Mitteilungen aufs Handy kommen, entscheidet ebenfalls nur der Server.
//   · null heißt IMMER „unbekannt“, nie grün. Lage-Satz und Gründe kommen fertig vom Server (texte.ts im Worker); hier
//     stehen nur die festen Sätze aus Bauplan 5.3 (Ampel-Wörter, Morgen-Satz, Zustände, Fußzeile).
//   · Uhrzeiten in der Ortszeit des Betriebs (nachweisZone), nie per toISOString (Datums-Regeln).
// Getestet in tests/wetter-dashboard.test.mjs (Fixture = echte Antwort der PGlite-Probe aus WinterDex wetter-karte.test).
import type { SupabaseClient } from '@supabase/supabase-js';
import { karteQuelleText } from './wetterQuelle';

export type Ampel = 0 | 1 | 2 | 3;
export type HnArt = 'trocken' | 'schnee' | 'schneeregen' | 'regen' | 'gefrierend';

export interface HnStunde {
  ts: string;
  t: number | null;
  mm: number | null;
  schnee_cm: [number, number] | null;
  art: HnArt | null;
  ampel: Ampel | null;
}
export interface HnAmtlich {
  typ: number;
  stufe: number;
  von: string | null;
  bis: string | null;
  text: string | null;
  gemeinde: string | null;
}
export interface HnEreignis {
  art: string;
  status: string;
  beginn: string | null;
  ende: string | null;
  menge_klasse: number | null;
  objekte: number | null;
  strecken: number | null;
  gemeinde: string | null;
  mitteilung: { art: string | null; at: string | null; titel: string | null; text: string | null } | null;
}
export interface HeuteNacht {
  v: 1;
  karte_live: boolean;
  stand_at: string | null;
  quelle: 'geosphere' | 'open-meteo' | 'gemischt' | null;
  /**
   * quellen/quelle_text (NACHTRAG-WETTER-STAATLICH Teil A, optional — wie App vc48): Quellwerte der gezeigten Zellen und
   * die fertige Fußzeile vom Server (wg_quelle_text). Fehlen sie (ältere SQL-Fassung), gilt nur `quelle` wie bisher. Für
   * staatliche Daten liefert der Server `quelle` = null — die Quelle steht dann nur in quelle_text.
   */
  quellen: string[];
  quelle_text: string | null;
  gebiet: { name: string | null; zellen: number; objekte: number; strecken: number; spanne_km: number | null };
  stunden: HnStunde[];
  ampel_gesamt: Ampel | null;
  lage: { satz: string | null; betroffen_orte: string | null };
  morgen: { zeit: string; erwartet: 'ja' | 'nein' | 'knapp' | null; grund: string | null; gesendet_at: string | null; pro: boolean };
  je_ort: Array<{ art: 'objekt' | 'strecke'; ref_id: string; ampel: Ampel | null; grund: string | null }>;
  amtlich: HnAmtlich[] | null;
  ohne_standort_n: number;
  guide_live_arten: string[];
  guide_gestoert_seit: string | null;
  letzte_mitteilung: { art: string | null; at: string | null; geraete: number | null } | null;
  /** nur mit Pro/Probe (Server); sonst null */
  ereignisse: HnEreignis[] | null;
}

// ---------------------------------------------------------------------------------------------- Lesen (defensiv)

const istObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const zahl = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null);
const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);
const ampel = (x: unknown): Ampel | null => {
  const n = zahl(x);
  return n === 0 || n === 1 || n === 2 || n === 3 ? n : null;
};
const ARTEN: readonly HnArt[] = ['trocken', 'schnee', 'schneeregen', 'regen', 'gefrierend'];
/** Fußzeilen-Text vom Server: eine Zeile, höchstens 300 Zeichen (sonst wie bisher aus `quelle`). */
const quellText = (x: unknown): string | null => {
  const t = typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '';
  return t && t.length <= 300 ? t : null;
};
const art = (x: unknown): HnArt | null => (typeof x === 'string' && (ARTEN as readonly string[]).includes(x) ? (x as HnArt) : null);

/** Antwort des Servers → Vertrag v1; unbekannte Fassung oder kaputte Antwort → null (dann keine Karte, nie ein Absturz). */
export function heuteNachtLesen(x: unknown): HeuteNacht | null {
  if (!istObj(x) || x.v !== 1) return null;
  const g = istObj(x.gebiet) ? x.gebiet : {};
  const l = istObj(x.lage) ? x.lage : {};
  const m = istObj(x.morgen) ? x.morgen : {};
  const erw = m.erwartet === 'ja' || m.erwartet === 'nein' || m.erwartet === 'knapp' ? m.erwartet : null;
  const q = x.quelle === 'geosphere' || x.quelle === 'open-meteo' || x.quelle === 'gemischt' ? x.quelle : null;
  const lm = istObj(x.letzte_mitteilung) ? x.letzte_mitteilung : null;
  return {
    v: 1,
    karte_live: x.karte_live === true,
    stand_at: text(x.stand_at),
    quelle: q,
    quellen: Array.isArray(x.quellen) ? x.quellen.filter((s): s is string => typeof s === 'string' && s.length <= 40).slice(0, 12) : [],
    quelle_text: quellText(x.quelle_text),
    gebiet: {
      name: text(g.name),
      zellen: zahl(g.zellen) ?? 0,
      objekte: zahl(g.objekte) ?? 0,
      strecken: zahl(g.strecken) ?? 0,
      spanne_km: zahl(g.spanne_km),
    },
    stunden: (Array.isArray(x.stunden) ? x.stunden : []).filter(istObj).map((s) => {
      const sc = Array.isArray(s.schnee_cm) && s.schnee_cm.length === 2 ? [zahl(s.schnee_cm[0]), zahl(s.schnee_cm[1])] : null;
      return {
        ts: String(s.ts ?? ''),
        t: zahl(s.t),
        mm: zahl(s.mm),
        schnee_cm: sc && sc[0] !== null && sc[1] !== null ? [sc[0], sc[1]] : null,
        art: art(s.art),
        ampel: ampel(s.ampel),
      } satisfies HnStunde;
    }).filter((s) => Number.isFinite(Date.parse(s.ts))),
    ampel_gesamt: ampel(x.ampel_gesamt),
    lage: { satz: text(l.satz), betroffen_orte: text(l.betroffen_orte) },
    morgen: { zeit: text(m.zeit) ?? '02:45', erwartet: erw, grund: text(m.grund), gesendet_at: text(m.gesendet_at), pro: m.pro === true },
    je_ort: (Array.isArray(x.je_ort) ? x.je_ort : [])
      .filter(istObj)
      .filter((o) => (o.art === 'objekt' || o.art === 'strecke') && typeof o.ref_id === 'string')
      .map((o) => ({ art: o.art as 'objekt' | 'strecke', ref_id: o.ref_id as string, ampel: ampel(o.ampel), grund: text(o.grund) })),
    amtlich: Array.isArray(x.amtlich)
      ? x.amtlich.filter(istObj).map((a) => ({ typ: zahl(a.typ) ?? 0, stufe: zahl(a.stufe) ?? 0, von: text(a.von), bis: text(a.bis), text: text(a.text), gemeinde: text(a.gemeinde) }))
      : null,
    ohne_standort_n: zahl(x.ohne_standort_n) ?? 0,
    guide_live_arten: Array.isArray(x.guide_live_arten) ? x.guide_live_arten.filter((a): a is string => typeof a === 'string') : [],
    guide_gestoert_seit: text(x.guide_gestoert_seit),
    letzte_mitteilung: lm ? { art: text(lm.art), at: text(lm.at), geraete: zahl(lm.geraete) } : null,
    // Paywall: nur wenn der Server eine Liste schickt (Pro/Probe) — null bleibt null
    ereignisse: Array.isArray(x.ereignisse)
      ? x.ereignisse.filter(istObj).map((e) => {
          const mi = istObj(e.mitteilung) ? e.mitteilung : null;
          return {
            art: String(e.art ?? ''),
            status: String(e.status ?? ''),
            beginn: text(e.beginn),
            ende: text(e.ende),
            menge_klasse: zahl(e.menge_klasse),
            objekte: zahl(e.objekte),
            strecken: zahl(e.strecken),
            gemeinde: text(e.gemeinde),
            mitteilung: mi ? { art: text(mi.art), at: text(mi.at), titel: text(mi.titel), text: text(mi.text) } : null,
          };
        })
      : null,
  };
}

// ---------------------------------------------------------------------------------------------- Laden

export type HnLadung =
  /** Antwort da (karte_live sagt, ob gezeigt wird) */
  | { art: 'ok'; d: HeuteNacht; abgerufen: number }
  /** Netz/Server gestört — `alt` = letzter Stand dieses Browsers (≤ 12 Std.), sonst null */
  | { art: 'fehler'; alt: { d: HeuteNacht; abgerufen: number } | null; warLive: boolean }
  /** RPC fehlt (Nachtrag nicht eingespielt), kein Mitglied oder unbekannte Fassung → keine Karte */
  | { art: 'aus' };

const SPEICHER = (org: string) => `winterdex.heuteNacht.${org}`;
/** Merker „Karte war für diesen Betrieb freigegeben“ (ohne Ablauf) — nur dann zeigt ein Fehler überhaupt etwas */
const LIVE = (org: string) => `winterdex.heuteNacht.live.${org}`;
const ALT_MAX_MS = 12 * 3_600_000;

/** PostgREST meldet eine fehlende Funktion mit PGRST202 (bzw. 404) — dann gibt es die Karte (noch) nicht. */
export function rpcFehlt(err: { code?: string; status?: number; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === 'PGRST202' || err.code === '42883' || err.status === 404 || /could not find the function/i.test(err.message ?? '');
}

function merken(org: string, d: HeuteNacht, abgerufen: number) {
  try {
    localStorage.setItem(SPEICHER(org), JSON.stringify({ d, abgerufen }));
    localStorage.setItem(LIVE(org), '1');
  } catch {
    /* privater Modus / voll — die Karte geht trotzdem */
  }
}
function vergessen(org: string) {
  try {
    localStorage.removeItem(SPEICHER(org));
    localStorage.removeItem(LIVE(org));
  } catch {
    /* egal */
  }
}
function warLive(org: string): boolean {
  try {
    return localStorage.getItem(LIVE(org)) === '1';
  } catch {
    return false;
  }
}
export function letzterStand(org: string, jetzt = Date.now()): { d: HeuteNacht; abgerufen: number } | null {
  try {
    const roh = localStorage.getItem(SPEICHER(org));
    if (!roh) return null;
    const x = JSON.parse(roh) as { d?: unknown; abgerufen?: unknown };
    const d = heuteNachtLesen(x.d);
    const ab = zahl(x.abgerufen);
    if (!d || ab === null || jetzt - ab > ALT_MAX_MS || ab > jetzt + 60_000) return null;
    return { d, abgerufen: ab };
  } catch {
    return null;
  }
}

/**
 * heute_nacht(p_org) per POST (supabase.rpc; die RPC schreibt zuletzt_benutzt). Wirft nie. Ein erfolgreicher Stand wird
 * im Browser gemerkt (nur dieser Betrieb, höchstens 12 Std. gezeigt) — damit zeigt die Karte im Funkloch „Stand 16:40,
 * offline“ statt nichts. Ist die Karte für den Betrieb nicht freigegeben, wird nichts gemerkt.
 */
export async function ladeHeuteNacht(sb: SupabaseClient, orgId: string, jetzt = () => Date.now()): Promise<HnLadung> {
  try {
    const { data, error, status } = await sb.rpc('heute_nacht', { p_org: orgId });
    if (error) {
      if (rpcFehlt({ ...error, status })) return { art: 'aus' };
      return { art: 'fehler', alt: letzterStand(orgId, jetzt()), warLive: warLive(orgId) };
    }
    const d = heuteNachtLesen(data);
    if (!d) {
      vergessen(orgId);
      return { art: 'aus' };
    }
    const t = jetzt();
    if (d.karte_live) merken(orgId, d, t);
    else vergessen(orgId);
    return { art: 'ok', d, abgerufen: t };
  } catch {
    return { art: 'fehler', alt: letzterStand(orgId, jetzt()), warLive: warLive(orgId) };
  }
}

// ---------------------------------------------------------------------------------------------- Zeit (Ortszeit)

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, o: Intl.DateTimeFormatOptions, key: string): Intl.DateTimeFormat {
  const k = `${tz}|${key}`;
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('de-DE', { timeZone: tz, ...o });
    fmtCache.set(k, f);
  }
  return f;
}
/** Uhrzeit „19:05“ in der Zone des Betriebs */
export function uhrzeit(ms: number, tz: string): string {
  return fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'hm').format(new Date(ms));
}
/** Teile in der Zone: Jahr, Monat, Tag, Stunde, Minute */
export function ortsTeile(ms: number, tz: string): { j: number; mo: number; t: number; h: number; mi: number } {
  const p: Record<string, number> = {};
  for (const x of fmt(tz, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }, 'teile').formatToParts(new Date(ms)))
    if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { j: p.year, mo: p.month, t: p.day, h: p.hour % 24, mi: p.minute };
}
/** „Do“ (ohne Punkt) */
export function wochentag(ms: number, tz: string): string {
  return fmt(tz, { weekday: 'short' }, 'wt').format(new Date(ms)).replace(/\.$/, '');
}
/** „19:05“ heute, sonst „Mi 19:05“ */
export function standText(ms: number, jetzt: number, tz: string): string {
  const a = ortsTeile(ms, tz);
  const b = ortsTeile(jetzt, tz);
  const gleich = a.j === b.j && a.mo === b.mo && a.t === b.t;
  return gleich ? uhrzeit(ms, tz) : `${wochentag(ms, tz)} ${uhrzeit(ms, tz)}`;
}

/** Saison 1.10.–30.4. (Ortszeit) — dann ist die Karte immer da, sonst erst ab gelb. */
export function inSaison(jetzt: number, tz: string): boolean {
  const { mo } = ortsTeile(jetzt, tz);
  return mo >= 10 || mo <= 4;
}

/** Titel: 15:00–03:59 „Heute Nacht“, sonst „Heute“ (Bauplan 5.3). */
export function hnTitel(jetzt: number, tz: string): 'Heute Nacht' | 'Heute' {
  const { h } = ortsTeile(jetzt, tz);
  return h >= 15 || h < 4 ? 'Heute Nacht' : 'Heute';
}

// ---------------------------------------------------------------------------------------------- Ampel

export interface AmpelAnzeige {
  wort: string;
  /** CSS-Stufe hn-a0 … hn-a3 bzw. hn-au (unbekannt) */
  klasse: string;
  /** kurzes Zeichen zusätzlich zur Farbe (nie nur Farbe) */
  zeichen: string;
}

/** Ampel-Wort (5.3): grün „Glätte unwahrscheinlich“ · gelb „Glätte möglich“ · orange „Glätte wahrscheinlich“ · rot
 * „Eisregen-Gefahr“ (gefrierender Regen in Sicht) bzw. „Starke Glätte“ · morgens bei Lage ab orange „Glätte jetzt“. */
export function ampelAnzeige(a: Ampel | null, opts: { eisregen?: boolean; jetztLage?: boolean } = {}): AmpelAnzeige {
  if (a === null) return { wort: 'Lage unbekannt', klasse: 'hn-au', zeichen: '?' };
  if (a >= 2 && opts.jetztLage) return { wort: 'Glätte jetzt', klasse: `hn-a${a}`, zeichen: '!' };
  if (a === 0) return { wort: 'Glätte unwahrscheinlich', klasse: 'hn-a0', zeichen: '✓' };
  if (a === 1) return { wort: 'Glätte möglich', klasse: 'hn-a1', zeichen: '!' };
  if (a === 2) return { wort: 'Glätte wahrscheinlich', klasse: 'hn-a2', zeichen: '!' };
  return { wort: opts.eisregen ? 'Eisregen-Gefahr' : 'Starke Glätte', klasse: 'hn-a3', zeichen: '!' };
}

const ART_RANG: Record<HnArt, number> = { trocken: 0, regen: 1, schneeregen: 2, schnee: 3, gefrierend: 4 };
export const ART_WORT: Record<HnArt, string> = {
  trocken: 'trocken',
  regen: 'Regen',
  schneeregen: 'Schneeregen',
  schnee: 'Schnee',
  gefrierend: 'gefrierender Regen',
};

// ---------------------------------------------------------------------------------------------- Streifen

export interface HnSpalte {
  /** Beginn (ms) */
  von: number;
  /** Stunden in der Spalte (1 oder 2) */
  dauer: 1 | 2;
  t: number | null;
  mm: number | null;
  schnee: [number, number] | null;
  art: HnArt | null;
  ampel: Ampel | null;
}

/** Zwei Stunden zusammenlegen: Gefahr wird nie weggemittelt; grün/trocken nur, wenn beide bekannt sind. */
function zusammen(a: HnStunde, b: HnStunde | undefined): HnSpalte {
  const von = Date.parse(a.ts);
  if (!b) return { von, dauer: 1, t: a.t, mm: a.mm, schnee: a.schnee_cm, art: a.art, ampel: a.ampel };
  const amp = (() => {
    const x = [a.ampel, b.ampel];
    const max = Math.max(...x.map((v) => v ?? -1));
    if (max >= 1) return max as Ampel;
    return x.every((v) => v === 0) ? 0 : null;
  })();
  const artW = (() => {
    const x = [a.art, b.art];
    const r = Math.max(...x.map((v) => (v ? ART_RANG[v] : -1)));
    if (r >= 1) return (Object.keys(ART_RANG) as HnArt[]).find((k) => ART_RANG[k] === r)!;
    return x.every((v) => v === 'trocken') ? 'trocken' : null;
  })();
  const ts = [a.t, b.t].filter((v): v is number => v !== null);
  const mm = a.mm === null && b.mm === null ? null : Math.round(((a.mm ?? 0) + (b.mm ?? 0)) * 100) / 100;
  const sc = a.schnee_cm || b.schnee_cm ? ([(a.schnee_cm?.[0] ?? 0) + (b.schnee_cm?.[0] ?? 0), (a.schnee_cm?.[1] ?? 0) + (b.schnee_cm?.[1] ?? 0)].map((v) => Math.round(v * 10) / 10) as [number, number]) : null;
  return { von, dauer: 2, t: ts.length ? Math.min(...ts) : null, mm, schnee: sc, art: artW, ampel: amp };
}

/** Streifen „jetzt + 12 h“: 12 Spalten à 1 Std. (breit) bzw. 6 Spalten à 2 Std. (schmal, Handy). */
export function streifen(stunden: HnStunde[], spalten: 12 | 6): HnSpalte[] {
  const s = stunden.slice(0, 12);
  if (spalten === 12) return s.map((x) => zusammen(x, undefined));
  const out: HnSpalte[] = [];
  for (let i = 0; i < s.length; i += 2) out.push(zusammen(s[i], s[i + 1]));
  return out;
}

const zahlDe = (n: number, stellen = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: stellen, minimumFractionDigits: 0 });
/** Menge einer Spalte: Schnee als Spanne in cm, sonst Niederschlag in mm; trocken/unbekannt leer */
export function mengeText(s: Pick<HnSpalte, 'art' | 'mm' | 'schnee'>): string {
  if (!s.art || s.art === 'trocken') return '';
  if ((s.art === 'schnee' || s.art === 'schneeregen') && s.schnee && s.schnee[1] > 0) {
    const [lo, hi] = s.schnee;
    return lo === hi ? `${zahlDe(lo)} cm` : `${zahlDe(lo)}–${zahlDe(hi)} cm`;
  }
  if (s.mm !== null && s.mm > 0) return `${zahlDe(s.mm)} mm`;
  return '';
}
/** „−3°“ / „0°“ / „–“ (unbekannt). Nie „−0°“: −0,3 rundet auf 0 und bekommt kein Minus (wie App tempText). */
export function gradText(t: number | null): string {
  if (t === null || !Number.isFinite(t)) return '–';
  const r = Math.round(t);
  return `${r < 0 ? '−' : ''}${Math.abs(r)}°`;
}

/**
 * Hell [Sonnenaufgang, Sonnenuntergang] in Minuten nach Mitternacht, Ortszeit (mit Sommerzeit), je Monat (Jan–Dez) zur
 * Monatsmitte — grob für die Mitte von Deutschland, Österreich und der Schweiz (ca. 48° N, 11° O); gleiche Tabelle wie die
 * App (WinterDex mobile/src/lib/heuteNacht.ts). Nur für das Symbol „trocken“ (Sonne bzw. Mond hinter einer Wolke) — keine
 * Aussage über Bewölkung oder Glätte.
 */
const HELL: readonly (readonly [number, number])[] = [
  [480, 1005], [450, 1050], [390, 1110], [390, 1200], [335, 1245], [315, 1275],
  [330, 1270], [370, 1230], [415, 1165], [455, 1105], [445, 1000], [475, 980],
];
/** Dunkel zu dieser Ortszeit? monat 1–12, minute 0–1439. */
export function istNacht(monat: number, minute: number): boolean {
  const h = HELL[Math.min(12, Math.max(1, Math.round(monat))) - 1];
  return minute < h[0] || minute >= h[1];
}
/** Spalte nachts? Gemessen an ihrer Mitte in der Ortszeit des Betriebs, z. B. 16–18 Uhr im November → 17:00 → Nacht. */
export function spalteNachts(s: Pick<HnSpalte, 'von' | 'dauer'>, tz: string): boolean {
  if (!Number.isFinite(s.von)) return false;
  const o = ortsTeile(s.von + Math.max(1, s.dauer) * 1_800_000, tz);
  return istNacht(o.mo, o.h * 60 + o.mi);
}

// ---------------------------------------------------------------------------------------------- Sätze

/** Stand älter als 3 Std. → kein „voraussichtlich“ mehr (5.3). */
export const MORGEN_STAND_MAX_MS = 3 * 3_600_000;

/** Minuten „02:45“ → 165 */
const minuten = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Ende des K2-Fensters 10:00 Ortszeit (risiko.ts REGELN.k2.endeMin): ab dann gilt morgen.erwartet schon für MORGEN. */
export const K2_ENDE_MIN = 10 * 60;

export type MorgenTon = 'ja' | 'nein' | 'knapp' | 'gesendet' | 'keine';
export interface MorgenSatz {
  satz: string;
  grund: string | null;
  ton: MorgenTon;
}

/**
 * Morgen-Satz (5.3). Pro: „Frühwarnung 02:45: voraussichtlich ja / voraussichtlich nein / knapp – kann kommen“; danach
 * „Frühwarnung 02:45 gesendet ✓“ bzw. „Um 02:45 keine Frühwarnung gesendet.“ — nur die Tatsache aus glaette_versand, ohne
 * Begründung (ob um 02:45 überhaupt gewertet wurde, weiß die Karte nicht) und nur bis 10:00 (danach ist morgen.erwartet
 * schon die Prognose für den nächsten Morgen). Ohne Pro kommt keine Frühwarnung → neutral „Glätte bis 10:00:
 * voraussichtlich ja …“ (nie eine Ankündigung, die nicht aufs Handy kommt). Ohne Daten oder Stand > 3 Std.: null.
 */
export function morgenSatz(d: HeuteNacht, jetzt: number, tz: string, abgerufen = jetzt): MorgenSatz | null {
  const z = d.morgen.zeit;
  if (d.morgen.gesendet_at) return { satz: `Frühwarnung ${z} gesendet ✓`, grund: null, ton: 'gesendet' };
  const stand = d.stand_at ? Date.parse(d.stand_at) : NaN;
  // ohne Daten oder zu alt (auch: im Funkloch gezeigter alter Stand) → kein Satz
  if (!Number.isFinite(stand) || jetzt - stand > MORGEN_STAND_MAX_MS || jetzt - abgerufen > MORGEN_STAND_MAX_MS) return null;
  const { h, mi } = ortsTeile(jetzt, tz);
  const jetztMin = h * 60 + mi;
  const weck = minuten(z) ?? 165;
  // nach der Weckzeit (+ Wiederholungen 30/60 min) bis 10:00: die Prüfung ist gelaufen
  if (jetztMin >= weck + 75 && jetztMin < K2_ENDE_MIN) return d.morgen.pro ? { satz: `Um ${z} keine Frühwarnung gesendet.`, grund: null, ton: 'keine' } : null;
  if (jetztMin >= weck && jetztMin < weck + 75) return null; // läuft gerade
  const vor = d.morgen.pro ? `Frühwarnung ${z}:` : 'Glätte bis 10:00:';
  if (d.morgen.erwartet === 'ja') return { satz: `${vor} voraussichtlich ja`, grund: d.morgen.grund, ton: 'ja' };
  if (d.morgen.erwartet === 'knapp') return { satz: `${vor} knapp – kann kommen`, grund: d.morgen.grund, ton: 'knapp' };
  if (d.morgen.erwartet === 'nein') return { satz: `${vor} voraussichtlich nein`, grund: null, ton: 'nein' };
  return null;
}

const warnt = (m: MorgenSatz | null): boolean => !!m && (m.ton === 'ja' || m.ton === 'knapp');

/**
 * Ampel der Karte. ampel_gesamt umfasst nur jetzt + 12 Std., die Frühwarnung aber bis 10:00 (abends also mehr). Erwartet
 * der Server dort „ja“/„knapp“, ist die Karte nie grün/unbekannt, sondern mindestens gelb („Glätte möglich“) — sonst stünde
 * „✓ Glätte unwahrscheinlich“ über „Frühwarnung 02:45: voraussichtlich ja“.
 */
export function kartenAmpel(d: HeuteNacht, m: MorgenSatz | null): Ampel | null {
  const a = d.ampel_gesamt;
  return warnt(m) && (a === null || a < 1) ? 1 : a;
}

/** Kopf der Karte aus EINER Rechnung (Karte, Bildschirmleser): Morgen-Satz, Ampel-Anzeige, aufgeklappt ab gelb. */
export function kartenKopf(d: HeuteNacht, jetzt: number, tz: string, abgerufen = jetzt): { m: MorgenSatz | null; amp: AmpelAnzeige; gefahr: boolean } {
  const m = morgenSatz(d, jetzt, tz, abgerufen);
  const a = kartenAmpel(d, m);
  return { m, amp: ampelAnzeige(a, { eisregen: eisregenInSicht(d), jetztLage: glaetteJetzt(d, jetzt, tz) }), gefahr: (a ?? 0) >= 1 };
}

/**
 * Zusatz zum Morgen-Satz, wenn die Geräte-Zeile nicht zu sehen ist (eingeklappt, Außendienst im Browser, Mitarbeiter):
 * die Frühwarnung kommt nur über die App aufs Handy, nie in den Browser. Nur Pro und nur bei „ja“/„knapp“.
 */
export function morgenHandyHinweis(d: HeuteNacht, m: MorgenSatz | null): string | null {
  return d.morgen.pro && warnt(m) ? 'kommt nur über die WinterDex-App aufs Handy' : null;
}

const STUFE_WORT: Record<number, string> = { 1: 'Gelbe', 2: 'Orange', 3: 'Rote' };
const TYP_WORT: Record<number, string> = { 3: 'Schneewarnung', 4: 'Glatteiswarnung' };
/** „Amtlich: Gelbe Glatteiswarnung bis Do 09:00 – Graz (GeoSphere Austria)“ — Stufe immer als Wort */
export function amtlichArt(a: Pick<HnAmtlich, 'stufe' | 'typ'>): string {
  return `${STUFE_WORT[a.stufe] ?? ''} ${TYP_WORT[a.typ] ?? 'Wetterwarnung'}`.trim();
}
export function amtlichZeile(a: HnAmtlich, tz: string): string {
  const art = amtlichArt(a);
  const bisMs = a.bis ? Date.parse(a.bis) : NaN;
  const bis = Number.isFinite(bisMs) ? ` bis ${wochentag(bisMs, tz)} ${uhrzeit(bisMs, tz)}` : '';
  return `Amtlich: ${art}${bis}${a.gemeinde ? ` – ${a.gemeinde}` : ''} (GeoSphere Austria)`;
}

/** Betroffene Warn-Orte (Ampel ≥ 1 in 12 Std.) — Zahlen, nie Namen */
export function betroffen(d: HeuteNacht): { objekte: string[]; strecken: number } {
  const o = d.je_ort.filter((x) => (x.ampel ?? 0) >= 1);
  return { objekte: o.filter((x) => x.art === 'objekt').map((x) => x.ref_id), strecken: o.filter((x) => x.art === 'strecke').length };
}

/**
 * Zeile „Betroffen: 14 Objekte · 2 Strecken“ → „noch 8 von 14 betroffenen offen“ → „alle betroffenen Objekte erledigt ✓“.
 * `erledigt` = Objekte mit (nicht storniertem) Einsatz heute; nur tagsüber gezählt (abends gilt die Lage der Nacht).
 */
export function betroffenZeile(d: HeuteNacht, erledigt: ReadonlySet<string> | null): string | null {
  const b = betroffen(d);
  const n = b.objekte.length;
  if (!n && !b.strecken) return null;
  const teile = [n ? `${n} ${n === 1 ? 'Objekt' : 'Objekte'}` : '', b.strecken ? `${b.strecken} ${b.strecken === 1 ? 'Strecke' : 'Strecken'}` : ''].filter(Boolean).join(' · ');
  if (erledigt && n) {
    const offen = b.objekte.filter((id) => !erledigt.has(id)).length;
    if (offen === 0) return `alle betroffenen Objekte erledigt ✓${b.strecken ? ` · ${b.strecken} ${b.strecken === 1 ? 'Strecke' : 'Strecken'} betroffen` : ''}`;
    if (offen < n) return `noch ${offen} von ${n} betroffenen offen`;
  }
  return `Betroffen: ${teile}`;
}

/**
 * Fußzeile: „Vorhersage, Stand 19:05 · Datenquelle: GeoSphere Austria · ohne Gewähr“. Liefert der Server `quelle_text`
 * (Wetter staatlich: GeoSphere Austria, Deutscher Wetterdienst, MeteoSchweiz bzw. ersatzweise Open-Meteo.com — nur die
 * Quellen der gezeigten Zellen), steht genau dieser Text da; sonst wie bisher aus `quelle`; fehlen beide, bildet das
 * Dashboard ihn mit derselben Regel aus `quellen` (karteQuelleText, z. B. 'dwd' = ICON-D2 in Deutschland und der Schweiz →
 * „Datenbasis: Deutscher Wetterdienst, eigene Berechnungen“).
 */
export function fussZeile(
  d: Pick<HeuteNacht, 'stand_at' | 'quelle'> & { quelle_text?: string | null; quellen?: readonly string[] | null },
  jetzt: number,
  tz: string,
): string {
  const stand = d.stand_at && Number.isFinite(Date.parse(d.stand_at)) ? `Stand ${standText(Date.parse(d.stand_at), jetzt, tz)}` : 'Stand unbekannt';
  const quelle =
    quellText(d.quelle_text) ??
    (d.quelle === 'geosphere'
      ? 'Datenquelle: GeoSphere Austria'
      : d.quelle === 'open-meteo'
        ? 'Wetterdaten: Open-Meteo.com'
        : d.quelle === 'gemischt'
          ? 'Datenquellen: GeoSphere Austria und Open-Meteo.com'
          : karteQuelleText(d.quellen) ?? '');
  return [`Vorhersage, ${stand}`, quelle, 'ohne Gewähr'].filter(Boolean).join(' · ');
}

/** Amtliche Warnungen nicht angebunden (G7: nur Österreich) */
export function amtlichHinweis(d: HeuteNacht, land: string | null | undefined): string | null {
  if (d.amtlich !== null || d.gebiet.zellen === 0) return null;
  const wo = land === 'DE' ? 'für Deutschland' : land === 'CH' ? 'für die Schweiz' : 'für diesen Standort';
  return `Amtliche Warnungen ${wo}: nicht angebunden.`;
}

export type HnZustand =
  | 'karte'
  /** Warn-Orte da, aber noch keine Werte (erster Lauf steht aus) */
  | 'neu'
  /** nur Objekte ohne Standort */
  | 'ohne_standort';

export function hnZustand(d: HeuteNacht): HnZustand {
  if (d.gebiet.zellen === 0) return 'ohne_standort';
  if (!d.stand_at && d.stunden.every((s) => s.ampel === null && s.t === null)) return 'neu';
  return 'karte';
}

/**
 * Sichtbar? (5.3) Nur wenn der Server es freigibt (karte_live), 1.10.–30.4. immer, sonst erst ab gelb; nie ohne Warn-Ort —
 * Ausnahme: nur Objekte ohne Standort → Hinweis, aber nur für Inhaber/Verwalter (die den Standort eintragen können).
 */
export function hnSichtbar(d: HeuteNacht, jetzt: number, tz: string, darfObjekte: boolean, abgerufen = jetzt): boolean {
  if (!d.karte_live) return false;
  if (d.gebiet.zellen === 0) return darfObjekte && d.ohne_standort_n > 0 && inSaison(jetzt, tz);
  return inSaison(jetzt, tz) || kartenKopf(d, jetzt, tz, abgerufen).gefahr || (amtlichAktuell(d.amtlich, jetzt)?.length ?? 0) > 0;
}

/** Eisregen in den nächsten 12 Std.? (rot heißt dann „Eisregen-Gefahr“) */
export function eisregenInSicht(d: HeuteNacht): boolean {
  return d.stunden.slice(0, 12).some((s) => s.art === 'gefrierend' && (s.ampel ?? 0) >= 1);
}

/** „Glätte jetzt“: morgens (04:00–11:59) und die laufende Stunde ab orange */
export function glaetteJetzt(d: HeuteNacht, jetzt: number, tz: string): boolean {
  const { h } = ortsTeile(jetzt, tz);
  return h >= 4 && h < 12 && (d.stunden[0]?.ampel ?? 0) >= 2;
}

/** Ein Satz für Bildschirmleser (5.3): Titel, Lage, Tiefstwert, Ampel, Morgen-Satz */
export function vorleseSatz(d: HeuteNacht, jetzt: number, tz: string, abgerufen = jetzt): string {
  const titel = hnTitel(jetzt, tz);
  const { m, amp } = kartenKopf(d, jetzt, tz, abgerufen);
  const ts = d.stunden.slice(0, 12).map((s) => s.t).filter((t): t is number => t !== null);
  const tmin = ts.length ? Math.round(Math.min(...ts)) : null;
  const teile = [
    `${titel}: ${d.lage.satz ? d.lage.satz.replace(/\.$/, '') : 'Wetterlage'}.`,
    tmin !== null ? `Tiefste Temperatur ${tmin < 0 ? 'minus ' : ''}${Math.abs(tmin)} Grad.` : '',
    `${amp.wort}.`,
    m ? `${m.satz.replace(' ✓', '')}.` : '',
  ];
  return teile.filter(Boolean).join(' ');
}

const EREIGNIS_WORT: Record<string, string> = {
  schnee: 'Schneefall',
  eisregen: 'Gefrierender Regen',
  schnee_ende: 'Schneefall vorbei',
  amtlich: 'Amtliche Warnung',
};
const MENGE_KLASSE = ['0–1 cm', '1–3 cm', '3–5 cm', '5–10 cm', 'über 10 cm'];

// ---------------------------------------------------------------------------------------------- Nur Aktuelles (27.11.)
// Alex 27.11.: Auf der Übersicht stand am Freitag noch die amtliche Warnung vom Donnerstag („Gelbe Schneewarnung von Do,
// 26.11. 00:00 bis Do, 26.11. 14:00“): Das Ereignis lief am Server bis Fr 08:00 weiter (Folgewarnung), die Karte zeigte
// dazu den Wortlaut der ersten Mitteilung von Do 07:12. Die Karte zeigt deshalb nur, was jetzt noch gilt bzw. heute/die
// kommende Nacht betrifft; der volle Verlauf (30 Tage) bleibt auf der Seite „Alle Mitteilungen“. Reine Rechnung, Zeiten in
// der Ortszeit des Betriebs (ortsTeile), nie per toISOString.

/** Ereignis ohne Gültigkeitsende und ohne Zustand „läuft“/„angekündigt“: höchstens so lange nach Beginn bzw. Mitteilung aktuell. */
export const EREIGNIS_ALT_MS = 24 * 3_600_000;
/** Der Wortlaut einer Mitteilung gilt als aktuell, wenn sie heute (Ortszeit) oder vor höchstens 12 Std. kam. */
export const WORTLAUT_FRISCH_MS = 12 * 3_600_000;
/** „Schneefall vorbei“ (K7) bleibt nach dem Ende noch so lange stehen (wie das 6-Std.-Fenster des Servers). */
export const VORBEI_ZEIGEN_MS = 6 * 3_600_000;

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const x = Date.parse(iso);
  return Number.isFinite(x) ? x : null;
};
const gleicherTag = (a: number, b: number, tz: string): boolean => {
  const x = ortsTeile(a, tz);
  const y = ortsTeile(b, tz);
  return x.j === y.j && x.mo === y.mo && x.t === y.t;
};

/** Amtliche Warnungen, die noch gelten (Ende in der Zukunft; ohne Ende: wie vom Server, der nur laufende schickt). */
export function amtlichAktuell(liste: HnAmtlich[] | null, jetzt: number): HnAmtlich[] | null {
  if (!liste) return liste;
  return liste.filter((a) => {
    const bis = ms(a.bis);
    return bis === null || bis > jetzt;
  });
}

/** Wortlaut der letzten Mitteilung noch aktuell? (heute gesendet oder ≤ 12 Std.; nie aus der Zukunft) */
export function wortlautFrisch(e: HnEreignis, jetzt: number, tz: string): boolean {
  const at = ms(e.mitteilung?.at);
  if (at === null || at > jetzt + 5 * 60_000) return false;
  return jetzt - at <= WORTLAUT_FRISCH_MS || gleicherTag(at, jetzt, tz);
}

/**
 * Gehört das Ereignis auf die Übersicht?
 *   · beendet → nur mit frischer „Schneefall vorbei“-Mitteilung (K7, ≤ 6 Std.); sonst gilt nichts mehr davon (auch eine
 *     vorzeitig aufgehobene amtliche Warnung nicht)
 *   · Gültigkeitsende vorbei → nein (z. B. amtliche Warnung abgelaufen, auch wenn der Server sie noch als laufend führt)
 *   · läuft / angekündigt → ja (der Server sagt, dass es gilt)
 *   · sonst: mit Ende in der Zukunft ja, ohne Ende nur, wenn Beginn bzw. letzte Mitteilung ≤ 24 Std. zurückliegen
 */
export function ereignisAktuell(e: HnEreignis, jetzt: number): boolean {
  const ende = ms(e.ende);
  const at = ms(e.mitteilung?.at);
  const atOk = at !== null && at <= jetzt + 5 * 60_000;
  if (e.status === 'beendet') return e.mitteilung?.art === 'K7' && atOk && jetzt - at <= VORBEI_ZEIGEN_MS;
  if (ende !== null && ende <= jetzt) return false;
  if (e.status === 'laeuft' || e.status === 'angekuendigt' || ende !== null) return true;
  const bezug = Math.max(atOk ? at : -Infinity, ms(e.beginn) ?? -Infinity);
  return Number.isFinite(bezug) && jetzt - bezug <= EREIGNIS_ALT_MS;
}

/** Ereignisse für die Übersicht: nur aktuelle (Reihenfolge des Servers) und wie viele weggelassen wurden. */
export function aktuelleEreignisse(liste: HnEreignis[] | null, jetzt: number): { zeigen: HnEreignis[]; ausgeblendet: number } {
  if (!liste) return { zeigen: [], ausgeblendet: 0 };
  const zeigen = liste.filter((e) => ereignisAktuell(e, jetzt));
  return { zeigen, ausgeblendet: liste.length - zeigen.length };
}

/**
 * Ereignis des Wetter-Guides (nur Pro) als Zeile — bevorzugt der gesendete Wortlaut (Server, ohne Namen), aber nur, wenn er
 * aktuell ist (wortlautFrisch); sonst die Zeile aus den heutigen Werten des Ereignisses. Ein Beginn vor heute steht nicht
 * mehr da (läuft schon), nur noch das Ende.
 */
export function ereignisZeile(e: HnEreignis, jetzt: number, tz: string): string {
  if (e.mitteilung?.titel && e.mitteilung.text && wortlautFrisch(e, jetzt, tz)) {
    const um = e.mitteilung.at && Number.isFinite(Date.parse(e.mitteilung.at)) ? ` (${standText(Date.parse(e.mitteilung.at), jetzt, tz)})` : '';
    return `${e.mitteilung.titel}${um}: ${e.mitteilung.text}`;
  }
  const t = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? standText(Date.parse(iso), jetzt, tz) : null);
  const beginn = ms(e.beginn);
  const von = beginn !== null && beginn < jetzt && !gleicherTag(beginn, jetzt, tz) ? null : t(e.beginn);
  const bis = t(e.ende);
  const menge = e.menge_klasse !== null && MENGE_KLASSE[e.menge_klasse] ? `ca. ${MENGE_KLASSE[e.menge_klasse]}` : '';
  const orte = e.objekte ? `${e.objekte} ${e.objekte === 1 ? 'Objekt' : 'Objekte'}${e.gemeinde ? ` (${e.gemeinde})` : ''}` : e.gemeinde ?? '';
  return [EREIGNIS_WORT[e.art] ?? 'Wetterereignis', von ? `ab ca. ${von}` : '', bis ? `bis ca. ${bis}` : '', menge, orte].filter(Boolean).join(' · ');
}

/** Objekte mit Einsatz heute (Ortszeit) — nur tagsüber (04:00–14:59) gezählt, sonst null (abends zählt die Nacht). */
export function erledigtHeute(ops: ReadonlyArray<{ property_id: string; started_at: string; canceled: boolean }> | null | undefined, jetzt: number, tz: string): Set<string> | null {
  if (!ops) return null;
  const j = ortsTeile(jetzt, tz);
  if (j.h < 4 || j.h >= 15) return null;
  const out = new Set<string>();
  for (const o of ops) {
    if (o.canceled) continue;
    const ms = Date.parse(o.started_at);
    if (!Number.isFinite(ms) || ms > jetzt + 60_000) continue;
    const t = ortsTeile(ms, tz);
    if (t.j === j.j && t.mo === j.mo && t.t === j.t) out.add(o.property_id);
  }
  return out;
}
