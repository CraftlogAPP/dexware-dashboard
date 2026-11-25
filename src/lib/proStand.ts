// Pro-Status für Gratis-Grenzen — EIN Baustein für alle App-Bereiche (Muster WinterDex 25.11.2026, 136de79).
//
// Jede Pro-Quelle (RPC org_pro_active, RevenueCat/Suite über die Abo-Auskunft …) antwortet mit drei Zuständen:
//   true  = sicher Pro · false = sicher kein Pro · null = nicht feststellbar (Anbieter gestört, Netz weg, RPC fehlt).
// Eine SICHERE Antwort wird gemerkt: 5 Minuten im Speicher, als „letzter sicherer Stand“ 35 Tage im Browser —
// je App UND Konto (Schlüssel `<app>.orgPro.<Nutzer-ID>`; WinterDex nutzt damit denselben Schlüssel wie bisher).
// Bei Unklarheit gilt der letzte sichere Stand. Gibt es keinen:
//   · GRENZEN (Anlegen, Wieder-Aktivieren, Import, Team-Code) — proFuerGrenze()/orgProFuerGrenze() werfen
//     ProUnklarError mit dem Text „gleich nochmal“ — weder still erlauben (Leck) noch einen Zahlenden falsch sperren.
//   · ANZEIGE (Wasserzeichen, Excel-Liste, Hinweise) — fetchOrgPro()/proFuerAnzeige(): Pro (einen zahlenden Betrieb
//     nie wegen einer Störung mit Wasserzeichen ärgern).
// Vorher galt in den meisten Bereichen „im Zweifel Pro“ → bei jeder Störung waren Grenzen und Import offen.
//
// Bewusst ohne Laufzeit-Imports (nur Typen): Node-Tests laden die Datei direkt (tests/pro-stand.test.mjs).

import type { SupabaseClient } from '@supabase/supabase-js';

/** Meldung, wenn der Pro-Status gerade nicht sicher feststellbar ist (statt still zu erlauben oder falsch zu sperren). */
export const PRO_UNKLAR =
  'Der Pro-Status deines Betriebs lässt sich gerade nicht prüfen (der Abo-Dienst antwortet nicht). Bitte in einer Minute noch einmal versuchen.';

/** Meldung, wenn der Bestand für die Gratis-Grenze gerade nicht gezählt werden kann (Server antwortet nicht). */
export const GRENZE_UNKLAR =
  'Die Gratis-Grenze lässt sich gerade nicht prüfen (der Server antwortet nicht). Bitte in einer Minute noch einmal versuchen.';

export class ProUnklarError extends Error {
  constructor(message: string = PRO_UNKLAR) {
    super(message);
    this.name = 'ProUnklarError';
  }
}

/** Eine Pro-Quelle: sichere Antwort true/false, null = unklar. Darf werfen (zählt als unklar). */
export type ProQuelle = () => Promise<boolean | null>;

const FRESH_MS = 5 * 60 * 1000;
/** So lange gilt der letzte sichere Stand bei einer Störung (wie der Server: 35 Tage). */
const LETZTER_MS = 35 * 24 * 60 * 60 * 1000;
const frisch = new Map<string, { v: boolean; at: number }>();

const schluessel = (app: string, uid: string) => `${app}.orgPro.${uid}`;

function speicher(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Sichere Antwort merken (privates Fenster / gesperrter Speicher: dann eben ohne Merker). */
export function merkeStand(app: string, uid: string | null, v: boolean): void {
  if (!uid) return;
  try {
    speicher()?.setItem(schluessel(app, uid), JSON.stringify({ v, at: Date.now() }));
  } catch {
    /* Speicher gesperrt */
  }
}

/** Letzter sicherer Stand dieses Kontos in dieser App (höchstens 35 Tage alt), sonst null. */
export function letzterStand(app: string, uid: string | null): boolean | null {
  if (!uid) return null;
  try {
    const j = JSON.parse(speicher()?.getItem(schluessel(app, uid)) ?? 'null') as { v?: unknown; at?: unknown } | null;
    if (j && typeof j.v === 'boolean' && typeof j.at === 'number' && Date.now() - j.at < LETZTER_MS) return j.v;
  } catch {
    /* kaputter Eintrag: wie keiner */
  }
  return null;
}

/**
 * Pro-Stand aus einer beliebigen Quelle: frische sichere Antwort (gemerkt), sonst der letzte sichere Stand, sonst null.
 * `fresh` = den 5-Minuten-Speicher überspringen (Grenzen fragen immer frisch).
 */
export async function proStand(app: string, uid: string | null, quelle: ProQuelle, fresh = false): Promise<boolean | null> {
  const k = `${app}|${uid ?? ''}`;
  const hit = uid ? frisch.get(k) : undefined;
  if (!fresh && hit && Date.now() - hit.at < FRESH_MS) return hit.v;
  let v: boolean | null = null;
  try {
    const a = await quelle();
    v = typeof a === 'boolean' ? a : null;
  } catch {
    v = null;
  }
  if (v !== null) {
    if (uid) frisch.set(k, { v, at: Date.now() });
    merkeStand(app, uid, v);
    return v;
  }
  return letzterStand(app, uid);
}

/** Für GRENZEN: unklar (null) → ProUnklarError mit dem Text „gleich nochmal“. */
export function proFuerGrenze(v: boolean | null): boolean {
  if (v === null) throw new ProUnklarError();
  return v;
}

/** Für ANZEIGE (Wasserzeichen, Excel, Hinweise): unklar ohne letzten Stand → Pro (nie zu Unrecht ärgern). */
export function proFuerAnzeige(v: boolean | null): boolean {
  return v ?? true;
}

// ---------------------------------------------------------------------------- Betriebe mit org_pro_active (Server)

async function nutzerId(sb: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/** Quelle RPC org_pro_active (Abo des Inhabers, Team-Stufen, Suite, Sonderlizenz, Bonus …): true/false, sonst null. */
export function orgProQuelle(sb: SupabaseClient): ProQuelle {
  return async () => {
    const { data, error } = await sb.rpc('org_pro_active');
    return !error && typeof data === 'boolean' ? data : null;
  };
}

/** Pro des Betriebs (RPC org_pro_active) mit letztem sicherem Stand: true/false, null = nicht feststellbar. */
export async function orgProStand(sb: SupabaseClient, app: string, fresh = false): Promise<boolean | null> {
  return proStand(app, await nutzerId(sb), orgProQuelle(sb), fresh);
}

/** Für ANZEIGE (Wasserzeichen, Excel-Liste, Hinweise): letzter sicherer Stand, sonst Pro. */
export async function fetchOrgPro(sb: SupabaseClient, app: string, fresh = false): Promise<boolean> {
  return proFuerAnzeige(await orgProStand(sb, app, fresh));
}

/** Für GRENZEN (Anlegen, Wieder-Aktivieren, Import, Team-Code): immer frisch; unklar → letzter Stand, sonst ProUnklarError. */
export async function orgProFuerGrenze(sb: SupabaseClient, app: string): Promise<boolean> {
  return proFuerGrenze(await orgProStand(sb, app, true));
}

// ---------------------------------------------------------------------------- Server-Ablehnungen erkennen

type FehlerArt = { hint?: unknown; message?: unknown; details?: unknown };
const art = (e: unknown): FehlerArt => (typeof e === 'object' && e !== null ? (e as FehlerArt) : {});

/**
 * Hat der SERVER wegen einer Gratis-Grenze abgelehnt? Auslöser der Nachträge 25.11.2026 (NACHTRAG-GRATIS-GRENZE /
 * NACHTRAG-PAYWALL): errcode P0001, hint `gratis_grenze_<tabelle>`, Text beginnt mit „Gratis-Grenze:“.
 * Erkennt auch in fail() verpackte Fehler („Objekt konnte nicht gespeichert werden: Gratis-Grenze: …“).
 */
export function istGratisGrenze(e: unknown): boolean {
  const err = art(e);
  return (
    (typeof err.hint === 'string' && err.hint.startsWith('gratis_grenze')) ||
    (typeof err.message === 'string' && err.message.includes('Gratis-Grenze'))
  );
}

/** Hat der Server einen Team-Beitritt abgelehnt, weil der Betrieb kein Pro hat („team needs pro“)? */
export function istTeamNeedsPro(e: unknown): boolean {
  const err = art(e);
  return (
    (typeof err.hint === 'string' && err.hint === 'team_needs_pro') ||
    (typeof err.message === 'string' && /team needs pro/i.test(err.message))
  );
}

/**
 * Text einer Server-Ablehnung (Grenze) ohne Technik-Vorsatz: „Objekt konnte nicht gespeichert werden: Gratis-Grenze: X“
 * → „X“; sonst null (kein Grenz-Fehler).
 */
export function grenzText(e: unknown): string | null {
  if (!istGratisGrenze(e)) return null;
  const msg = art(e).message;
  if (typeof msg !== 'string') return null;
  const i = msg.indexOf('Gratis-Grenze');
  return (i >= 0 ? msg.slice(i).replace(/^Gratis-Grenze:\s*/, '') : msg).trim() || null;
}
