// Mitteilungs-Center (Glocke oben rechts) im WinterDex-Dashboard — Laden + reine Rechnung. EIN Datenweg für App und
// Dashboard: RPC meine_mitteilungen(p_org) (Vertrag v1, WinterDex/supabase/NACHTRAG-MITTEILUNGEN-2026-11-26.sql):
//   {v:1, mitteilungen:[{id, kart, art_name, titel, text, kurz, zeit, kritisch}]}, neueste zuerst, höchstens 200.
//   · Was in der Liste steht, entscheidet NUR der Server: nur wirklich gesendete Mitteilungen (status 'gesendet') der
//     letzten 30 Tage an den Betrieb bzw. an mich — dieselben wie am Handy. Der Browser filtert nichts weg.
//   · „Gelesen“ gibt es am Server bewusst NICHT (Versprechen AVV § 4a / Datenschutz f). Der Stand „zuletzt geöffnet“
//     liegt nur in diesem Browser (localStorage je Betrieb) und wird nie gesendet — die RPC bekommt nur p_org.
//   · RPC fehlt (Nachtrag nicht eingespielt), kein Mitglied ({v:1, fehler:'kein_mitglied'}, null oder 42501) oder
//     unbekannte Fassung → keine Glocke. Netzfehler bzw. andere Absage (z. B. 'nicht_angemeldet') → der letzte Stand
//     bleibt stehen (siehe mitteilungenKontext.ts).
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
  if (!istObj(x) || x.v !== 1 || absageVon(x) !== null) return null;
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
 * Absage des Servers im Vertrag v1 (NACHTRAG-MITTEILUNGEN): {v:1, fehler:'kein_mitglied'|'nicht_angemeldet', mitteilungen:[]}.
 * Das ist KEINE leere Liste — sonst stünde eine Glocke „Keine Mitteilungen“ da, obwohl der Server gar nichts zeigen darf.
 * Rückgabe: Fehlerwort oder null (keine Absage).
 */
export function absageVon(x: unknown): string | null {
  if (!istObj(x) || x.fehler === undefined || x.fehler === null || x.fehler === false) return null;
  return typeof x.fehler === 'string' && x.fehler.trim() !== '' ? x.fehler.trim() : 'unbekannt';
}

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
    // Absage im Vertrag: kein Mitglied → keine Glocke; sonst (z. B. Anmeldung gerade abgelaufen) wie eine Störung —
    // der letzte Stand bleibt, beim nächsten Abruf geht es weiter
    const absage = absageVon(data);
    if (absage === 'kein_mitglied') return { art: 'aus' };
    if (absage) return { art: 'fehler' };
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

// ---------------------------------------------------------------------------------------------- Box „Mitteilung“ (Vertrag v2, A)

/**
 * Klick auf eine Mitteilung (Glocke oder Seite „Alle Mitteilungen“) öffnet eine Box über der Seite — keine eigene
 * Detailseite mehr (Alex 26.11., wie das Antippen am Handy). „Zur Karte“ führt zur Karte „Heute Nacht“ (aufgeklappt):
 * im Außendienst auf den Reiter Objekte, sonst auf die Übersicht des Dashboards.
 */
export const KARTE_ANKER = 'heute-nacht';

/** Ziel von „Zur Karte“ je nachdem, wo man gerade ist (Außendienst bleibt im Außendienst). */
export function kartePfad(basis: string, pathname: string): string {
  const ad = `${basis}/aussendienst`;
  const imAussendienst = pathname === ad || pathname.startsWith(`${ad}/`);
  return `${imAussendienst ? ad : basis}#${KARTE_ANKER}`;
}

/** Zeile unter dem Titel in der Box: „Vorabend-Lage · Mi, 25.11.2026, 19:00 Uhr“ (Art nur, wenn der Titel sie nicht nennt) */
export function boxZeile(m: Pick<Mitteilung, 'titel' | 'art_name' | 'ms'>, tz: string): string {
  return artZeigen(m) ? `${m.art_name} · ${vollZeit(m.ms, tz)}` : vollZeit(m.ms, tz);
}

// ---------------------------------------------------------------------------------------------- Hinweis „Neu“ (F, nur dieser Browser)

/**
 * Bestandsnutzer sehen im Dashboard EINMAL den Hinweis „Neu: Heute Nacht und Mitteilungen“. Merker nur in diesem Browser,
 * je Konto (nicht je Betrieb — der Hinweis gilt der Person), nur „1“ — nie an den Server.
 *   · Neuanlage im Browser (Onboarding: Betrieb angelegt / Team beigetreten) setzt den Merker gleich mit — wer den
 *     Schritt „Wetter-Guide & Mitteilungen“ gesehen hat, bekommt den Hinweis nicht noch einmal.
 *   · Betrieb erst vor Kurzem angelegt (in der App, < NEU_ANLAGE_MS): ebenfalls kein Hinweis „Neu“ (die App erklärt es
 *     im Onboarding). Unlesbares Anlegedatum zählt als Bestand.
 */
export const NEU_HINWEIS_KEY = (uid: string) => `winterdex.hinweis.neu-mitteilungen.${uid}`;
export const NEU_ANLAGE_MS = 3 * 24 * 3_600_000;

/** Hinweis „Neu“ fällig? Wirft nie (gesperrter Speicher → kein Hinweis, lieber zu selten als bei jedem Besuch). */
export function neuHinweisFaellig(uid: string | null | undefined, orgAngelegt: string | null | undefined, jetzt: number): boolean {
  if (!uid) return false;
  const angelegt = typeof orgAngelegt === 'string' ? Date.parse(orgAngelegt) : NaN;
  if (Number.isFinite(angelegt) && jetzt - angelegt < NEU_ANLAGE_MS) return false;
  try {
    return localStorage.getItem(NEU_HINWEIS_KEY(uid)) === null;
  } catch {
    return false;
  }
}

/** Hinweis „Neu“ gesehen (bzw. Onboarding durchlaufen). Wirft nie. */
export function neuHinweisMerken(uid: string | null | undefined): void {
  if (!uid) return;
  try {
    localStorage.setItem(NEU_HINWEIS_KEY(uid), '1');
  } catch {
    /* privater Modus / voll — dann eben ohne Merker */
  }
}

// ---------------------------------------------------------------------------------------------- feste Texte

/** Wo man die Mitteilungen ein- und ausschaltet (je Handy, Vertrag 7) — das Dashboard schaltet nichts (G8). */
export const EINSTELLEN_HINWEIS = 'Ein- und ausschalten je Handy: WinterDex-App → Einstellungen → Mitteilungen.';
/** Leere Liste mit Pro (bzw. Pro-Stand unklar — nie zu Unrecht „Pro“ zeigen) */
export const LEER_PRO = 'Noch keine Mitteilungen in den letzten 30 Tagen.';
/** Leere Liste ohne Pro: ruhig, ohne Kauf-Knopf */
export const LEER_FREE = 'Hier erscheinen Glätte-Frühwarnung und Wetter-Hinweise (WinterDex Pro).';
/** Text bei leerer Liste: nur bei SICHER kein Pro (false) der Pro-Hinweis */
export function leerText(pro: boolean | null | undefined): string {
  return pro === false ? LEER_FREE : LEER_PRO;
}
export const SEITE_TEXT = 'Dieselben Mitteilungen wie am Handy – hier immer mit vollem Text. Gezeigt werden die letzten 30 Tage, ein Klick öffnet die Mitteilung.';

/**
 * Kurz erklärt — Onboarding-Schritt „Wetter-Guide & Mitteilungen“ (neue Betriebe im Browser) und einmaliger Hinweis
 * „Neu“ (Bestand). Begriffe wie in der App (G): Wetter-Guide, Glätte-Frühwarnung, Schnee-Wecker, Mitteilungen.
 * Nie „verpasst nichts“, „schützt vor Haftung“, „garantiert“. Den Schnee-Wecker nennen die Texte nur, wenn der Server ihn
 * freigegeben hat (K10 in guide_live_arten, wie die Box „Neu in WinterDex 0.7.15“ der App) — nie etwas versprechen, das
 * man in der App nicht findet: erklaerPunkte(wecker).
 * Im Außendienst (Handy-Ansicht im Browser, Prüfpunkt Runde 2) eigene Texte: Die Karte steht dort eingeklappt über der
 * Objektliste, man tippt statt zu klicken, und Mitteilungen aufs Handy bzw. den Schnee-Wecker gibt es nur in der App —
 * der Browser bekommt keine (viele Außendienst-Nutzer haben ein iPhone ohne die App).
 */
export type ErklaerOrt = 'dashboard' | 'aussendienst';
export interface ErklaerPunkt {
  art: 'karte' | 'glocke' | 'handy' | 'wecker';
  titel: string;
  text: string;
  /** nur mit WinterDex Pro */
  pro?: boolean;
}
export const ERKLAER_PUNKTE: ReadonlyArray<ErklaerPunkt> = [
  {
    art: 'karte',
    titel: 'Heute Nacht',
    text: 'Die Karte auf der Übersicht zeigt, wie die Nacht für deine Objekte wird: ab wann Glätte oder Schnee möglich ist und welche Objekte betroffen sind – sobald sie einen Standort haben.',
  },
  {
    art: 'glocke',
    titel: 'Glocke oben rechts',
    text: 'Dort stehen die Mitteilungen der letzten 30 Tage mit vollem Text. Ein Klick öffnet die Mitteilung.',
  },
  {
    art: 'handy',
    titel: 'Mitteilungen aufs Handy',
    text: 'Welche Mitteilungen dein Handy bekommt – etwa die Glätte-Frühwarnung –, stellst du in der WinterDex-App ein: Einstellungen → Mitteilungen.',
  },
];
/** Pflicht-Hinweis zum Schnee-Wecker (G) */
export const WECKER_HINWEIS = 'Der Schnee-Wecker ersetzt keinen eigenen Wecker.';
/** Schnee-Wecker (Pro) — wortgleich mit der App (NEU_0715_WECKER), dazu der Pflicht-Hinweis */
export const WECKER_PUNKT: ErklaerPunkt = {
  art: 'wecker',
  titel: 'Schnee-Wecker',
  text: `Weckt dich, wenn bei deinen Objekten Schnee kommt – 1 Stunde vorher oder wenn er einsetzt. ${WECKER_HINWEIS}`,
  pro: true,
};
/** Dieselben Punkte im Außendienst — gleiche Titel, Texte passend zur Handy-Ansicht im Browser */
export const ERKLAER_PUNKTE_AUSSENDIENST: ReadonlyArray<ErklaerPunkt> = [
  {
    art: 'karte',
    titel: 'Heute Nacht',
    text: 'Die Karte über deinen Objekten zeigt, wie die Nacht wird: ab wann Glätte oder Schnee möglich ist und welche Objekte betroffen sind. Antippen klappt sie auf.',
  },
  {
    art: 'glocke',
    titel: 'Glocke oben rechts',
    text: 'Dort stehen die Mitteilungen der letzten 30 Tage mit vollem Text. Antippen öffnet die Mitteilung.',
  },
  {
    art: 'handy',
    titel: 'Mitteilungen aufs Handy',
    text: 'Mitteilungen direkt aufs Handy – etwa die Glätte-Frühwarnung – kommen über die WinterDex-App: Einstellungen → Mitteilungen. Hier im Browser stehen sie unter der Glocke.',
  },
];
/** Schnee-Wecker im Außendienst: weckt nur die App, nicht der Browser */
export const WECKER_PUNKT_AUSSENDIENST: ErklaerPunkt = {
  ...WECKER_PUNKT,
  text: `In der WinterDex-App: weckt dich, wenn bei deinen Objekten Schnee kommt – 1 Stunde vorher oder wenn er einsetzt. ${WECKER_HINWEIS}`,
};
/** Punkte für Onboarding-Schritt und Hinweis „Neu“; den Schnee-Wecker nur, wenn er am Server freigegeben ist */
export function erklaerPunkte(wecker: boolean, ort: ErklaerOrt = 'dashboard'): ReadonlyArray<ErklaerPunkt> {
  const punkte = ort === 'aussendienst' ? ERKLAER_PUNKTE_AUSSENDIENST : ERKLAER_PUNKTE;
  return wecker ? [...punkte, ort === 'aussendienst' ? WECKER_PUNKT_AUSSENDIENST : WECKER_PUNKT] : punkte;
}
/** Schnee-Wecker am Server freigegeben? (heute_nacht: guide_live_arten enthält K10) */
export function weckerFrei(liveArten: readonly string[] | null | undefined): boolean {
  return Array.isArray(liveArten) && liveArten.includes('K10');
}
/** Pro-Hinweis ohne Kauf-Druck (Inhaber im Onboarding; Hinweis „Neu“ nur bei sicher kein Pro) */
export const PRO_HINWEIS = 'Mitteilungen aufs Handy gibt es mit WinterDex Pro.';
