// Wetter-Guide im Dashboard (Bauplan P4-Teil „Team-Seite“, G8, 5.4) — Laden + feste Texte. Reine Rechnung bis auf die
// zwei Abrufe; getestet in tests/wetter-dashboard.test.mjs.
//
// Mitteilungsarten (G8): NUR JE GERÄT — jede Person stellt sie auf ihrem Handy ein (App → set_push_arten mit dem eigenen
// Push-Token). Der Browser hat keinen Push-Token, Inhaber können Mitarbeitern keine Arten vorgeben (Arbeitsrecht 5.4).
// Je Betrieb gibt es nur die Uhrzeit der Frühwarnung (org.glaette_morgen_zeit, glaetteZeit.ts). Deshalb ruft das Dashboard
// set_push_arten bewusst NICHT auf, sondern zeigt:
//   · wetter_guide_geraete(p_org) — nur Inhaber/Verwalter: je Mitglied aktiv | bekommt_keine | zustellung_fehlgeschlagen
//     (keine Uhrzeiten, keine Plattform, keine Tokens; „ausgeschaltet“ und „kein Handy“ werden nicht unterschieden)
//   · die letzten 10 Mitteilungen aus wetter_push — nur die freigegebenen Spalten (select('*') scheitert absichtlich)
// Fehlt der Nachtrag (NACHTRAG-WETTER-GUIDE), bleibt die Karte wie bisher (nur Uhrzeit).
import type { SupabaseClient } from '@supabase/supabase-js';
import { ladeHeuteNacht, rpcFehlt } from './heuteNachtDaten';

export type GeraetStatus = 'aktiv' | 'bekommt_keine' | 'zustellung_fehlgeschlagen';
export interface GuideGeraete {
  pro: boolean;
  aktiv: number;
  gesamt: number;
  mitglieder: Array<{ name: string; rolle: string; status: GeraetStatus }>;
}
export interface GuideMitteilung {
  id: number;
  kart: string;
  titel: string | null;
  text: string | null;
  geraete: number | null;
  status: string;
  erstellt_at: string;
  gesendet_at: string | null;
}
export interface GuideStand {
  /** Nachtrag WETTER-GUIDE eingespielt (wetter_push lesbar) */
  live: boolean;
  /** null = nicht Inhaber/Verwalter oder nicht ladbar */
  geraete: GuideGeraete | null;
  /** null = gerade nicht ladbar */
  mitteilungen: GuideMitteilung[] | null;
}

/** Spalten, die der Server für Mitglieder freigibt (NACHTRAG-WETTER-GUIDE, grant select (…)) */
export const PUSH_SPALTEN = 'id, kart, titel, text, geraete, status, erstellt_at, gesendet_at';

const GERAET_STATUS: readonly GeraetStatus[] = ['aktiv', 'bekommt_keine', 'zustellung_fehlgeschlagen'];

export function geraeteLesen(x: unknown): GuideGeraete | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (!Array.isArray(o.mitglieder)) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    pro: o.pro === true,
    aktiv: n(o.aktiv),
    gesamt: n(o.gesamt),
    mitglieder: o.mitglieder
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .map((m) => ({
        name: typeof m.name === 'string' ? m.name : '—',
        rolle: typeof m.rolle === 'string' ? m.rolle : 'worker',
        status: (GERAET_STATUS as readonly unknown[]).includes(m.status) ? (m.status as GeraetStatus) : 'bekommt_keine',
      })),
  };
}

/** Tabelle fehlt (Nachtrag nicht eingespielt) — PostgREST: PGRST205 / 42P01 */
const tabelleFehlt = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|does not exist/i.test(e.message ?? ''));

/** Wirft nie. `darf` = Inhaber/Verwalter (nur dann die Geräte-Übersicht — der Server prüft die Rolle selbst noch einmal). */
export async function ladeWetterGuide(sb: SupabaseClient, orgId: string, darf: boolean): Promise<GuideStand> {
  const [push, ger] = await Promise.all([
    Promise.resolve(
      sb.from('wetter_push').select(PUSH_SPALTEN).eq('org_id', orgId).order('erstellt_at', { ascending: false }).limit(10),
    ).catch((e: unknown) => ({ data: null, error: { message: String(e) } })),
    darf
      ? Promise.resolve(sb.rpc('wetter_guide_geraete', { p_org: orgId })).catch((e: unknown) => ({ data: null, error: { message: String(e) }, status: 0 }))
      : Promise.resolve(null),
  ]);
  const pe = (push as { error: { code?: string; message?: string } | null }).error;
  if (tabelleFehlt(pe)) return { live: false, geraete: null, mitteilungen: null };
  const ge = ger as { data: unknown; error: { code?: string; message?: string } | null; status?: number } | null;
  if (ge?.error && rpcFehlt({ ...ge.error, status: ge.status })) return { live: false, geraete: null, mitteilungen: null };
  const rows = (push as { data: unknown }).data;
  return {
    live: true,
    geraete: ge && !ge.error ? geraeteLesen(ge.data) : null,
    mitteilungen: !pe && Array.isArray(rows) ? (rows as GuideMitteilung[]) : null,
  };
}

/**
 * Wetter-Guide für diesen Betrieb freigegeben? Erst dann zeigt das Dashboard Wetter-Guide-Teile (Geräte, Mitteilungen):
 * Testbetrieb in karte_orgs bzw. Karte live (karte_live) oder Mitteilungsarten live geschaltet (guide_live_arten).
 * Vorher (Schatten/Testbetrieb) sehen Kunden nichts Neues — die Freischaltung macht Alex (Einbau Schritt 5).
 */
export async function guideFreigegeben(sb: SupabaseClient, orgId: string): Promise<boolean> {
  const l = await ladeHeuteNacht(sb, orgId);
  return l.art === 'ok' && (l.d.karte_live || l.d.guide_live_arten.length > 0);
}

/** Nur die Geräte-Übersicht (Karte „Heute Nacht“: „Wetter-Guide aktiv auf X von Y Handys“). Wirft nie; null = nicht da. */
export async function ladeGeraete(sb: SupabaseClient, orgId: string): Promise<GuideGeraete | null> {
  try {
    const { data, error } = await sb.rpc('wetter_guide_geraete', { p_org: orgId });
    return error ? null : geraeteLesen(data);
  } catch {
    return null;
  }
}

/** Begriffe (G10): Wetter-Guide = Oberbegriff; K2 Glätte-Frühwarnung; K1 Vorabend-Lage */
export const ART_NAME: Record<string, string> = {
  K1: 'Vorabend-Lage',
  K2: 'Glätte-Frühwarnung',
  K4: 'Schnee kommt',
  K5: 'Achtung Glatteis',
  K7: 'Schneefall vorbei',
  K8: 'Update Schneefall',
  K9: 'Amtliche Warnung',
  TEST: 'Test',
};
export const STATUS_WORT: Record<string, string> = {
  gesendet: 'gesendet',
  vorgemerkt: 'wird gesendet',
  fehler: 'nicht gesendet (Fehler)',
  keine_geraete: 'kein Handy angemeldet',
};
export const GERAET_WORT: Record<GeraetStatus, string> = {
  aktiv: 'aktiv',
  bekommt_keine: 'bekommt keine',
  zustellung_fehlgeschlagen: 'Zustellung fehlgeschlagen',
};

/** Haftung (Bauplan 5.4, wortgleich mit der App) */
export const HAFTUNG =
  'Der Wetter-Guide ist eine Hilfe ohne Gewähr. Er ersetzt nicht deine Kontrolle vor Ort und entbindet nicht von der Räum- und Streupflicht. Vorhersagen können danebenliegen, Mitteilungen verspätet oder gar nicht ankommen (z. B. Nicht stören, Energiesparen, kein Netz). Keine Mitteilung heißt nicht, dass es nicht glatt ist. Maßgeblich sind die amtlichen Warnungen.';
export const QUELLEN = ['Datenquelle: GeoSphere Austria – data.hub.geosphere.at (CC BY 4.0)', 'Wetterdaten: Open-Meteo.com (CC BY 4.0)'];

/** Wie die Arten je Handy eingestellt werden (G8) — Dashboard schaltet nichts */
export const ARTEN_HINWEIS =
  'Welche Mitteilungen ein Handy bekommt, stellt jede Person in der WinterDex-App unter „Einstellungen“ selbst ein. Inhaber und Verwalter legen hier nur die Uhrzeit der Frühwarnung fest. Mitteilungen gibt es nur mit Pro – den Versand prüft der Server.';

/** „Bekommt keine“ unterscheidet bewusst nicht zwischen „kein Handy“ und „ausgeschaltet“ */
export const GERAETE_HINWEIS =
  '„Bekommt keine“ heißt: kein Handy angemeldet oder Mitteilungen auf dem Handy ausgeschaltet. Mehr zeigt WinterDex bewusst nicht (keine Uhrzeiten, kein „gelesen“).';

export type Bewertung = 'nicht' | 'betriebsvereinbarung';

/**
 * Vorlage „Mitarbeiter-Info“ (Bauplan 5.4) mit Betrieb und Anschrift. `bewertung`: Leistungsbewertung „nicht“ oder „nur
 * nach Betriebsvereinbarung vom …“ (Datum frei; leer → Platzhalter „…“).
 */
export function mitarbeiterInfo(betrieb: string, anschrift: string | null, bewertung: Bewertung, bvDatum = ''): string {
  const wer = [betrieb.trim(), anschrift?.trim()].filter(Boolean).join(', ');
  const bew = bewertung === 'nicht' ? 'nicht' : `nur nach Betriebsvereinbarung vom ${bvDatum.trim() || '…'}`;
  return (
    'WinterDex speichert beim Dokumentieren eines Einsatzes Ihren Namen, Zeitpunkt, die GPS-Position bei Beginn/Ende und Fotos, ' +
    'beim ‚Strecke fahren‘ den gefahrenen Weg mit Uhrzeit, bis Sie die Fahrt beenden. Nachweise enthalten außerdem die Wetterlage am ' +
    'Objekt (z. B. Ende des Schneefalls). Zweck: Nachweis der Räum- und Streupflicht gegenüber Auftraggebern, Behörden und ' +
    `Versicherungen. Verantwortlich: ${wer || '…'}. Eine Leistungsbewertung einzelner Personen anhand dieser Daten erfolgt ${bew}. ` +
    'Wetter-Hinweise auf Ihrem Gerät schalten Sie in der App unter Einstellungen → Wetter-Guide selbst ein oder aus.'
  );
}
