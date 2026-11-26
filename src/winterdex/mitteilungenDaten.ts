// Mitteilungs-Center (Glocke oben rechts) im WinterDex-Dashboard — Laden + reine Rechnung. EIN Datenweg für App und
// Dashboard: RPC meine_mitteilungen(p_org) (Vertrag v1, WinterDex/supabase/NACHTRAG-MITTEILUNGEN-2026-11-26.sql):
//   {v:1, mitteilungen:[{id, kart, art_name, titel, text, kurz, zeit, kritisch}]}, neueste zuerst, höchstens 200.
//   · Was in der Liste steht, entscheidet NUR der Server: nur wirklich gesendete Mitteilungen (status 'gesendet') der
//     letzten 30 Tage an den Betrieb bzw. an mich — dieselben wie am Handy. Der Browser filtert nichts weg.
//   · „Gelesen“ gibt es am Server bewusst NICHT (Versprechen AVV § 4a / Datenschutz f). Der Stand „zuletzt geöffnet“
//     liegt nur in diesem Browser (localStorage je Betrieb) und wird nie gesendet — die RPC bekommt nur p_org.
//   · RPC fehlt (Nachtrag nicht eingespielt), kein Mitglied oder unbekannte Fassung → keine Glocke. Netzfehler → der
//     letzte Stand bleibt stehen (siehe mitteilungenKontext.ts).
//   · Tage und Uhrzeiten in der Ortszeit des Betriebs (nachweisZone, Europe/Vienna), nie per toISOString (Datums-Regeln).
//   · Am Handy kommt nur der kurze Text („kurz“, ≤ 110 Zeichen); hier steht immer der VOLLE Text („text“).
// Getestet in tests/mitteilungen.test.mjs.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ortsTeile, rpcFehlt, uhrzeit, wochentag } from './heuteNachtDaten';
import { ART_NAME } from './wetterGuide';

export interface Mitteilung {
  /** wetter_push.id (als Text — bigint kann als Zahl oder Text kommen) */
  id: string;
  /** 'K1' … 'K10', 'TEST' */
  kart: string;
  art_name: string;
  titel: string;
  /** voller Text (in der App und hier) */
  text: string;
  /** kurzer Text am Handy (≤ 110 Zeichen) — nur zur Info, angezeigt wird `text` */
  kurz: string | null;
  /** gesendet_at bzw. erstellt_at (ISO vom Server) */
  zeit: string;
  /** dieselbe Zeit in ms (zum Rechnen) */
  ms: number;
  kritisch: boolean;
}

/** höchstens so viele (wie der Server) */
export const MAX_MITTEILUNGEN = 200;

// ---------------------------------------------------------------------------------------------- Lesen (defensiv)

const istObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);

/** Name der Art (Server-Wort bevorzugt, sonst das feste Wort aus G10, sonst „Mitteilung“) */
export function artName(kart: string, vomServer?: string | null): string {
  return text(vomServer) ?? ART_NAME[kart] ?? 'Mitteilung';
}

/** Antwort des Servers → Liste (neueste zuerst, ohne Doppel); unbekannte Fassung oder kaputte Antwort → null. */
export function mitteilungenLesen(x: unknown): Mitteilung[] | null {
  if (!istObj(x) || x.v !== 1) return null;
  const roh = Array.isArray(x.mitteilungen) ? x.mitteilungen : [];
  const gesehen = new Set<string>();
  const out: Mitteilung[] = [];
  for (const m of roh) {
    if (!istObj(m)) continue;
    const id = typeof m.id === 'number' && Number.isFinite(m.id) ? String(m.id) : text(m.id);
    const zeit = text(m.zeit);
    const ms = zeit ? Date.parse(zeit) : NaN;
    if (!id || !zeit || !Number.isFinite(ms) || gesehen.has(id)) continue;
    gesehen.add(id);
    const kart = text(m.kart) ?? '';
    const name = artName(kart, typeof m.art_name === 'string' ? m.art_name : null);
    const kurz = text(m.kurz);
    out.push({
      id,
      kart,
      art_name: name,
      titel: text(m.titel) ?? name,
      text: text(m.text) ?? kurz ?? '',
      kurz,
      zeit,
      ms,
      kritisch: m.kritisch === true,
    });
  }
  // neueste zuerst (der Server sortiert schon — hier nur zur Sicherheit, bei gleicher Zeit die höhere id zuerst)
  out.sort((a, b) => b.ms - a.ms || b.id.localeCompare(a.id, 'de', { numeric: true }));
  return out.slice(0, MAX_MITTEILUNGEN);
}

/** Art extra nennen? Nur wenn der Titel sie nicht schon enthält („❄️ Schnee-Wecker“, „Amtliche Warnung“) */
export function artZeigen(m: Pick<Mitteilung, 'titel' | 'art_name'>): boolean {
  return !m.titel.toLocaleLowerCase('de').includes(m.art_name.toLocaleLowerCase('de'));
}

// ---------------------------------------------------------------------------------------------- Laden

export type MtLadung =
  /** Antwort da (Liste darf leer sein) */
  | { art: 'ok'; orgId: string; liste: Mitteilung[]; abgerufen: number }
  /** Netz/Server gestört — der letzte Stand bleibt stehen */
  | { art: 'fehler' }
  /** RPC fehlt (Nachtrag nicht eingespielt), kein Mitglied oder unbekannte Fassung → keine Glocke */
  | { art: 'aus' };

/** kein Mitglied: der Server antwortet null oder verweigert (42501) */
const keinRecht = (e: { code?: string } | null | undefined) => !!e && e.code === '42501';

/**
 * meine_mitteilungen(p_org) per POST (supabase.rpc). Wirft nie. Schickt NUR p_org — nie einen Gelesen-Stand, nie
 * Geräte- oder Personendaten (p_seit bleibt beim Standard des Servers: 30 Tage).
 */
export async function ladeMitteilungen(sb: SupabaseClient, orgId: string, jetzt = () => Date.now()): Promise<MtLadung> {
  try {
    const { data, error, status } = await sb.rpc('meine_mitteilungen', { p_org: orgId });
    if (error) {
      if (rpcFehlt({ ...error, status }) || keinRecht(error)) return { art: 'aus' };
      return { art: 'fehler' };
    }
    const liste = mitteilungenLesen(data);
    if (!liste) return { art: 'aus' };
    return { art: 'ok', orgId, liste, abgerufen: jetzt() };
  } catch {
    return { art: 'fehler' };
  }
}

// ---------------------------------------------------------------------------------------------- Gruppen (Ortszeit)

export type MtGruppe = 'Heute' | 'Gestern' | 'Älter';

/** Kalendertag in der Zone als fortlaufende Zahl (Tage seit 1970) — sommerzeitfest */
function tagNr(ms: number, tz: string): number {
  const p = ortsTeile(ms, tz);
  return Math.round(Date.UTC(p.j, p.mo - 1, p.t) / 86_400_000);
}

/** Heute / Gestern / Älter nach dem Kalendertag in der Ortszeit des Betriebs (Zukunft = Heute, z. B. bei schiefer Uhr). */
export function gruppeVon(ms: number, jetzt: number, tz: string): MtGruppe {
  const d = tagNr(jetzt, tz) - tagNr(ms, tz);
  return d <= 0 ? 'Heute' : d === 1 ? 'Gestern' : 'Älter';
}

/** Liste → Gruppen in fester Reihenfolge (nur nicht leere), innerhalb neueste zuerst. */
export function gruppieren(liste: readonly Mitteilung[], jetzt: number, tz: string): Array<{ gruppe: MtGruppe; eintraege: Mitteilung[] }> {
  const reihe: MtGruppe[] = ['Heute', 'Gestern', 'Älter'];
  const je = new Map<MtGruppe, Mitteilung[]>(reihe.map((g) => [g, []]));
  for (const m of liste) je.get(gruppeVon(m.ms, jetzt, tz))!.push(m);
  return reihe.filter((g) => je.get(g)!.length > 0).map((g) => ({ gruppe: g, eintraege: je.get(g)! }));
}

const zwei = (n: number) => String(n).padStart(2, '0');

/** Uhrzeit in der Liste: heute/gestern „06:38“ (die Gruppe sagt den Tag), älter „Di 24.11., 06:38“. */
export function eintragZeit(ms: number, jetzt: number, tz: string): string {
  if (gruppeVon(ms, jetzt, tz) !== 'Älter') return uhrzeit(ms, tz);
  const p = ortsTeile(ms, tz);
  return `${wochentag(ms, tz)} ${zwei(p.t)}.${zwei(p.mo)}., ${uhrzeit(ms, tz)}`;
}

/** Volle Zeit in der Detailansicht: „Do, 26.11.2026, 06:38 Uhr“ */
export function vollZeit(ms: number, tz: string): string {
  const p = ortsTeile(ms, tz);
  return `${wochentag(ms, tz)}, ${zwei(p.t)}.${zwei(p.mo)}.${p.j}, ${uhrzeit(ms, tz)} Uhr`;
}

// ---------------------------------------------------------------------------------------------- Symbol je Art

export type MtSymbol = 'abend' | 'frueh' | 'schnee' | 'glatteis' | 'vorbei' | 'update' | 'amtlich' | 'wecker' | 'test' | 'info';

const SYMBOL: Record<string, MtSymbol> = {
  K1: 'abend',
  K2: 'frueh',
  K4: 'schnee',
  K5: 'glatteis',
  K7: 'vorbei',
  K8: 'update',
  K9: 'amtlich',
  K10: 'wecker',
  TEST: 'test',
};

/** Symbol je Art (immer zusätzlich zum Wort — nie nur Symbol) */
export function artSymbol(kart: string): MtSymbol {
  return SYMBOL[kart] ?? 'info';
}

// ---------------------------------------------------------------------------------------------- „neu seit zuletzt geöffnet“ (nur dieser Browser)

/** Schlüssel je Betrieb — enthält nur die Zeit der neuesten gesehenen Mitteilung, nichts sonst */
export const GESEHEN_KEY = (org: string) => `winterdex.mitteilungen.gesehen.${org}`;

/** Noch nie geöffnet (neuer Browser): nur die letzten 24 Std. zählen als neu — kein Zähler „37“ beim ersten Besuch. */
export const ERSTER_BLICK_MS = 24 * 3_600_000;

/** Zuletzt gesehen (ms) oder null (nie geöffnet, privater Modus, Unsinn im Speicher). Wirft nie. */
export function gesehenLesen(org: string): number | null {
  try {
    const roh = localStorage.getItem(GESEHEN_KEY(org));
    if (roh === null || roh.trim() === '') return null;
    const n = Number(roh);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Glocke/Seite geöffnet: Zeit der neuesten Mitteilung merken (Server-Zeit, nicht die Uhr des PCs). Geht nie zurück
 * (ein anderer Tab hat vielleicht schon Neueres gesehen). Gibt den neuen Stand zurück. Wirft nie.
 */
export function gesehenMerken(org: string, neuesteMs: number | null | undefined): number | null {
  const alt = gesehenLesen(org);
  if (neuesteMs === null || neuesteMs === undefined || !Number.isFinite(neuesteMs)) return alt;
  const neu = alt === null ? neuesteMs : Math.max(alt, neuesteMs);
  try {
    localStorage.setItem(GESEHEN_KEY(org), String(neu));
  } catch {
    /* privater Modus / voll — der Zähler bleibt dann bis zum Neuladen auf 0 */
  }
  return neu;
}

/** Ist die Mitteilung neu (seit dem letzten Öffnen bzw. beim ersten Besuch: aus den letzten 24 Std.)? */
export function istNeu(m: Pick<Mitteilung, 'ms'>, gesehen: number | null, jetzt: number): boolean {
  return gesehen === null ? m.ms > jetzt - ERSTER_BLICK_MS : m.ms > gesehen;
}

/** Zähler an der Glocke */
export function neuZahl(liste: readonly Mitteilung[], gesehen: number | null, jetzt: number): number {
  return liste.reduce((n, m) => n + (istNeu(m, gesehen, jetzt) ? 1 : 0), 0);
}

/** „3“, ab 100 „99+“, 0 → '' (kein Punkt) */
export function zaehlerText(n: number): string {
  return n <= 0 ? '' : n > 99 ? '99+' : String(n);
}

// ---------------------------------------------------------------------------------------------- feste Texte

/** Wo man die Mitteilungen ein- und ausschaltet (je Handy, Vertrag 7) — das Dashboard schaltet nichts (G8). */
export const EINSTELLEN_HINWEIS = 'Ein- und ausschalten je Handy: WinterDex-App → Einstellungen → Mitteilungen.';
export const LEER_TEXT = 'Keine Mitteilungen in den letzten 30 Tagen.';
export const SEITE_TEXT = 'Dieselben Mitteilungen wie am Handy – hier immer mit vollem Text. Gezeigt werden die letzten 30 Tage.';
