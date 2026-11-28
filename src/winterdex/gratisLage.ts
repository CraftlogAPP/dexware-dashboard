// Gratis nach Ablauf von Pro (Entscheidung 25.11.2026, Server: WinterDex/supabase/NACHTRAG-GRATIS-NACH-ABLAUF-2026-11-25.sql).
//
// Nach dem Ende von Pro (Probezeit, Abo, Bonus …) bleiben ALLE Objekte, Strecken und Nachweise sichtbar und exportierbar.
// Neue Einsätze gibt es im Gratis-Paket für 2 SELBST GEWÄHLTE Objekte, Fahrten auf 1 gewählten Strecke — die übrigen werden
// stillgelegt (nichts gelöscht, mit Pro jederzeit wieder aktiv). Vorher läuft eine Nachfrist von 3 Tagen (Alex 28.11.2026,
// vorher 7; Start beim ersten Öffnen nach dem Ende von Pro), in der alles wie gewohnt geht. Die Dauer steht nur am Server —
// Banner und Texte zeigen das Fristende (frist_bis) als Datum, nie eine feste Zahl von Tagen.
//
// Der Server sagt die Lage (RPC gratis_lage) und lehnt nach der Frist selbst ab (hint gratis_auswahl_* / gratis_*_stillgelegt).
// Ist der Nachtrag noch nicht eingespielt (RPC fehlt), gibt es weder Banner noch Fehler — alles bleibt wie bisher.
//
// Bewusst ohne Laufzeit-Imports (nur Typen): Node-Tests laden die Datei direkt (tests/gratis-ablauf.test.mjs).

import type { SupabaseClient } from '@supabase/supabase-js';

/** Antwort von gratis_lage() — Vertrag mit Server und App. */
export interface GratisLage {
  /** true/false = sicher, null = unbekannt (dann sperrt der Server nie) */
  pro: boolean | null;
  aktive_objekte: number;
  aktive_strecken: number;
  limit_objekte: number;
  limit_strecken: number;
  /** Ende der Nachfrist (ISO) oder null */
  frist_bis: string | null;
  bestandsschutz: boolean;
  gesperrt_objekte: boolean;
  gesperrt_strecken: boolean;
}

/** Ablehnung des Servers (hint ohne „gratis_“). */
export type GratisArt = 'auswahl_objekte' | 'objekt_stillgelegt' | 'auswahl_strecken' | 'strecke_stillgelegt';

const HINTS: Record<string, GratisArt> = {
  gratis_auswahl_objekte: 'auswahl_objekte',
  gratis_objekt_stillgelegt: 'objekt_stillgelegt',
  gratis_auswahl_strecken: 'auswahl_strecken',
  gratis_strecke_stillgelegt: 'strecke_stillgelegt',
};

/**
 * Welche Gratis-Ablehnung nach Ablauf von Pro? Erkennt den hint des Servers — und, weil Warteschlangen nur den Text
 * speichern und fail() Fehler in „… konnte nicht gespeichert werden: …“ verpackt, auch den Text.
 */
export function gratisArt(e: unknown): GratisArt | null {
  if (e == null) return null;
  if (typeof e === 'object') {
    const hint = (e as { hint?: unknown }).hint;
    if (typeof hint === 'string' && HINTS[hint]) return HINTS[hint];
  }
  const msg = typeof e === 'string' ? e : typeof e === 'object' ? String((e as { message?: unknown }).message ?? '') : '';
  if (!msg.includes('Gratis-Grenze')) return null;
  if (/Objekte aktiv nutzbar\s*[—–-]\s*wähle/i.test(msg)) return 'auswahl_objekte';
  if (/Dieses Objekt ist stillgelegt/i.test(msg)) return 'objekt_stillgelegt';
  if (/Strecke aktiv nutzbar\s*[—–-]\s*wähle/i.test(msg)) return 'auswahl_strecken';
  if (/Diese Strecke ist stillgelegt/i.test(msg)) return 'strecke_stillgelegt';
  return null;
}

export const istObjektArt = (a: GratisArt): boolean => a === 'auswahl_objekte' || a === 'objekt_stillgelegt';

/** Verständlicher Text zur Ablehnung (ohne „Gratis-Grenze:“). */
export function gratisArtText(a: GratisArt): string {
  switch (a) {
    case 'auswahl_objekte':
      return 'Pro ist beendet und die Nachfrist ist abgelaufen. Im Gratis-Paket sind 2 Objekte aktiv nutzbar — wähle deine 2 Objekte (die übrigen werden stillgelegt, nichts wird gelöscht) oder hol dir WinterDex Pro.';
    case 'objekt_stillgelegt':
      return 'Dieses Objekt ist stillgelegt. Im Gratis-Paket sind 2 Objekte aktiv nutzbar — tausche es gegen ein aktives Objekt oder hol dir WinterDex Pro.';
    case 'auswahl_strecken':
      return 'Pro ist beendet und die Nachfrist ist abgelaufen. Im Gratis-Paket ist 1 Strecke aktiv nutzbar — wähle deine Strecke (die übrigen werden stillgelegt, nichts wird gelöscht) oder hol dir WinterDex Pro.';
    case 'strecke_stillgelegt':
      return 'Diese Strecke ist stillgelegt. Im Gratis-Paket ist 1 Strecke aktiv nutzbar — tausche sie gegen die aktive Strecke oder hol dir WinterDex Pro.';
  }
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Antwort prüfen — alles Unerwartete zählt als „keine Lage“ (kein Banner). */
export function leseLage(data: unknown): GratisLage | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.aktive_objekte !== 'number' || typeof d.aktive_strecken !== 'number') return null;
  return {
    pro: typeof d.pro === 'boolean' ? d.pro : null,
    aktive_objekte: d.aktive_objekte,
    aktive_strecken: d.aktive_strecken,
    limit_objekte: num(d.limit_objekte, 2),
    limit_strecken: num(d.limit_strecken, 1),
    frist_bis: typeof d.frist_bis === 'string' && Number.isFinite(Date.parse(d.frist_bis)) ? d.frist_bis : null,
    bestandsschutz: d.bestandsschutz === true,
    gesperrt_objekte: d.gesperrt_objekte === true,
    gesperrt_strecken: d.gesperrt_strecken === true,
  };
}

// Fehlt die Funktion (Nachtrag noch nicht live), nicht bei jedem Öffnen erneut fragen — gilt bis zum Neuladen der Seite.
let fehlt = false;

const funktionFehlt = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || e.code === '42883' || /could not find the function|function .* does not exist/i.test(e.message ?? '');

/** Lage des eigenen Betriebs; null = keine (RPC fehlt, Fehler, Netz, ohne Betrieb). Wirft nie. */
export async function fetchGratisLage(sb: SupabaseClient): Promise<GratisLage | null> {
  if (fehlt) return null;
  try {
    const { data, error } = await sb.rpc('gratis_lage');
    if (error) {
      if (funktionFehlt(error)) fehlt = true;
      return null;
    }
    return leseLage(data);
  } catch {
    return null;
  }
}

/** Was der Banner zeigt — null = nichts. */
export interface BannerInhalt {
  stufe: 'frist' | 'gesperrt';
  titel: string;
  text: string;
  objekteWaehlen: boolean;
  streckeWaehlen: boolean;
}

/**
 * Banner-Inhalt aus der Lage. Nur bei SICHER kein Pro, über einer Grenze, mit Frist und ohne Bestandsschutz —
 * unbekannt/Pro/Bestandsschutz/innerhalb der Grenzen → nichts (nie zu Unrecht ärgern).
 */
export function bannerInhalt(l: GratisLage | null, fristText: (iso: string) => string): BannerInhalt | null {
  if (!l || l.pro !== false || l.bestandsschutz || !l.frist_bis) return null;
  const obj = l.aktive_objekte > l.limit_objekte;
  const str = l.aktive_strecken > l.limit_strecken;
  if (!obj && !str) return null;
  const nObj = `${l.limit_objekte} ${l.limit_objekte === 1 ? 'Objekt' : 'Objekte'}`;
  const nStr = `${l.limit_strecken} ${l.limit_strecken === 1 ? 'Strecke' : 'Strecken'}`;
  const gesperrt = (obj && l.gesperrt_objekte) || (str && l.gesperrt_strecken);
  if (gesperrt) {
    const beides = obj && l.gesperrt_objekte && str && l.gesperrt_strecken;
    const titel = beides
      ? `Wähle deine ${nObj} und deine Strecke`
      : obj && l.gesperrt_objekte
        ? `Wähle deine ${nObj}`
        : 'Wähle deine Strecke';
    const was = beides ? `${nObj} und ${nStr}` : obj && l.gesperrt_objekte ? nObj : nStr;
    return {
      stufe: 'gesperrt',
      titel,
      text: `Pro ist beendet und die Nachfrist ist abgelaufen. Im Gratis-Paket sind ${was} aktiv nutzbar — neue Einsätze und Fahrten gehen erst nach deiner Auswahl wieder. Alle bisherigen Nachweise bleiben sichtbar und exportierbar.`,
      objekteWaehlen: obj && l.gesperrt_objekte,
      streckeWaehlen: str && l.gesperrt_strecken,
    };
  }
  const alle = obj && str ? 'alle Objekte und Strecken' : obj ? 'alle Objekte' : 'alle Strecken';
  const danach = obj && str ? `${nObj} und ${nStr}` : obj ? nObj : nStr;
  return {
    stufe: 'frist',
    titel: 'Pro ist beendet.',
    text: `Noch bis ${fristText(l.frist_bis)} ${alle} nutzbar – danach ${danach} aktiv. Alle bisherigen Nachweise bleiben sichtbar und exportierbar.`,
    objekteWaehlen: obj,
    streckeWaehlen: str,
  };
}

/**
 * Vorauswahl im Auswahl-Dialog: das Pflicht-Ziel (z. B. das gerade abgelehnte, stillgelegte Objekt), dann die zuletzt
 * dokumentierten, dann nach Tour-Reihenfolge — höchstens `limit`.
 */
export function vorauswahl(
  ids: string[],
  zuletzt: Map<string, string>,
  limit: number,
  pflicht?: string | null,
): string[] {
  const out: string[] = [];
  if (pflicht && ids.includes(pflicht)) out.push(pflicht);
  const nachZeit = ids
    .filter((id) => zuletzt.has(id) && !out.includes(id))
    .sort((a, b) => Date.parse(zuletzt.get(b) ?? '') - Date.parse(zuletzt.get(a) ?? ''));
  for (const id of [...nachZeit, ...ids]) {
    if (out.length >= limit) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// Banner und Listen nach einer Auswahl auffrischen (Dialog → Banner, Objektliste, Außendienst)
const EVENT = 'wd-gratis-lage';
export function meldeGratisAenderung(): void {
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ohne Fenster (Test) */
  }
}
export function aufGratisAenderung(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
