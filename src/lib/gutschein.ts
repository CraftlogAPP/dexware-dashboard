// Jahresabo-Dankeschön (Entscheidung Alex 25.11.2026): WinterDex-Jahreskunden bekommen einen persönlichen Code für
// 1 Monat Pro in ObjektDex, SpielDex oder BaumDex. Server = Funktion „gutschein“ im Suite-Projekt
// (dexware-suite/supabase/functions/gutschein, Schnittstelle im Kopf der Datei). Die Anmeldung ist die der jeweiligen
// App (Access-Token + x-dexware-app); der Server prüft sie selbst beim Anmelde-Server der App.
// Reine Logik ohne React — tests/gutschein.test.mjs lädt die Datei direkt.
import { SUITE_ANON, SUITE_URL } from './abo';

export type GutscheinApp = 'objektdex' | 'spieldex' | 'baumdex';
export const GUTSCHEIN_APPS: GutscheinApp[] = ['objektdex', 'spieldex', 'baumdex'];

export interface Gutschein {
  code: string;
  app: GutscheinApp | null;
  gueltig_bis: string;
  eingeloest_am: string | null;
  pro_bis: string | null;
}

export interface GutscheinStatus {
  berechtigt: boolean;
  grund?: 'kein_jahresabo' | 'kein_abo';
  /** Jahresabo noch in der 7-Tage-Probezeit: Dankeschön ab diesem Zeitpunkt */
  probe_bis?: string;
  gutschein: Gutschein | null;
}

export type GutscheinFehlerCode =
  | 'code_unbekannt'
  | 'nicht_dein_code'
  | 'falsche_app'
  | 'abgelaufen'
  | 'schon_eingeloest'
  | 'nicht_berechtigt'
  | 'anmeldung_ungueltig'
  | 'zu_viele_versuche'
  | 'ungueltige_anfrage'
  | 'server';

/** Fehler des Servers mit Code und den Zusatzfeldern (app, pro_bis, grund, probe_bis). */
export class GutscheinFehler extends Error {
  code: GutscheinFehlerCode;
  extra: { app?: GutscheinApp | null; pro_bis?: string | null; grund?: string; probe_bis?: string };
  constructor(code: GutscheinFehlerCode, extra: GutscheinFehler['extra'] = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}

export const APP_NAME: Record<GutscheinApp, string> = { objektdex: 'ObjektDex', spieldex: 'SpielDex', baumdex: 'BaumDex' };

/** Kurz-Nutzen je App für die Auswahl-Karten (ruhig, ohne Werbesprache). */
export const APP_NUTZEN: Record<GutscheinApp, { titel: string; text: string }> = {
  objektdex: {
    titel: 'Hausbetreuung, Grünpflege, Reinigung',
    text: 'Leistungen mit Turnus abhaken, Fotos und Mängel, PDF mit Soll/Ist für den Auftraggeber. Runden funktionieren wie deine Strecken.',
  },
  spieldex: {
    titel: 'Spielplätze kontrollieren',
    text: 'Sicht-, Funktions- und Jahreskontrolle nach EN 1176-7, Gerät für Gerät, Kontrollbuch als PDF.',
  },
  baumdex: {
    titel: 'Bäume kontrollieren',
    text: 'Baumkataster mit Karte, Kontroll-Fristen und Maßnahmen. Gilt für den ganzen Betrieb.',
  },
};

/** Wo der Code eingelöst wird — für die Anleitung unter dem Code. */
export function einloeseWeg(app: GutscheinApp): { app: string; web: string; webText: string } {
  if (app === 'baumdex') {
    return {
      app: 'BaumDex-Portal im Browser: Abo → „Code einlösen“ (als Admin des Betriebs)',
      web: 'https://baumdex.dexware.app/subscribe#gutschein',
      webText: 'baumdex.dexware.app → Abo',
    };
  }
  return {
    app: `In der ${APP_NAME[app]}-App: Einstellungen → „Code einlösen“`,
    web: `/app/${app}/code-einloesen`,
    webText: `hier im ${APP_NAME[app]}-Dashboard`,
  };
}

/** Website der App mit Herkunft (messbar), im Browser nie ein Play-Link. */
export function websiteLink(app: GutscheinApp): string {
  return `https://${app}.dexware.app/?utm_source=winterdex&utm_medium=dashboard&utm_campaign=dankeschoen`;
}

const CODE_RE = /^WD-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

/** Eingabe wie der Server vereinheitlichen: Groß/klein, Leerzeichen und Striche egal. null = kann kein Code sein. */
export function normalisiereCode(eingabe: string): string | null {
  const s = eingabe.toUpperCase().replace(/[\s\-–—_.]/g, '');
  const roh = s.startsWith('WD') ? s.slice(2) : s;
  if (roh.length !== 8) return null;
  const code = `WD-${roh.slice(0, 4)}-${roh.slice(4)}`;
  return CODE_RE.test(code) ? code : null;
}

/** Während des Tippens: Großbuchstaben, „WD-“ davor, Strich nach 4 Zeichen. Höchstens 12 Zeichen. */
export function formatiereEingabe(eingabe: string): string {
  const s = eingabe.toUpperCase().replace(/[^0-9A-Z]/g, '');
  // Anfang von „WD“ unverändert lassen (sonst würde aus dem getippten „W“ sofort „WD-W“, und die Rücktaste hinge an „WD-“)
  if (s === '' || s === 'W' || s === 'WD') return s;
  const roh = (s.startsWith('WD') ? s.slice(2) : s).slice(0, 8);
  return `WD-${roh.slice(0, 4)}${roh.length > 4 ? '-' + roh.slice(4) : ''}`;
}

/** Datum in Wien (die Fristen enden um 23:59:59 Ortszeit — angezeigt wird dieser Tag). */
export function datumWien(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-AT', { timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Verständlicher Text zu einem Fehler. kontext: wo er auftrat (Einlösen braucht andere Worte als Wählen). */
export function fehlerText(f: GutscheinFehler | Error, kontext: 'einloesen' | 'waehlen' | 'status' = 'einloesen'): string {
  if (!(f instanceof GutscheinFehler)) return 'Das hat gerade nicht geklappt. Bitte versuche es gleich noch einmal.';
  const app = f.extra.app ? APP_NAME[f.extra.app] : null;
  switch (f.code) {
    case 'code_unbekannt':
      return 'Diesen Code kennen wir nicht. Bitte prüfe die Schreibweise: WD-XXXX-XXXX (es kommen kein 0, O, 1 und I vor).';
    case 'nicht_dein_code':
      return 'Dieser Code gehört zu einem anderen Konto. Melde dich mit der E-Mail-Adresse an, mit der du WinterDex nutzt.';
    case 'falsche_app':
      return app
        ? `Dieser Code gilt für ${app}. Solange er nicht eingelöst ist, kannst du die App in WinterDex unter „Dein Dankeschön“ ändern.`
        : 'Dieser Code gilt für eine andere App.';
    case 'abgelaufen':
      return 'Dieser Code ist abgelaufen — Codes gelten ein Jahr.';
    case 'schon_eingeloest':
      return f.extra.pro_bis && app
        ? `Dieser Code ist schon eingelöst: ${app} Pro läuft bis ${datumWien(f.extra.pro_bis)}.`
        : 'Dieser Code ist schon eingelöst.';
    case 'nicht_berechtigt':
      if (kontext === 'einloesen') return 'Dieser Code kann nicht eingelöst werden, weil das WinterDex-Jahresabo vorzeitig beendet wurde (z. B. erstattet).';
      if (f.extra.probe_bis) return `Dein Dankeschön gibt es nach der ersten Abbuchung deines Jahresabos, ab ${datumWien(f.extra.probe_bis)}.`;
      return 'Das Dankeschön gibt es für WinterDex im Jahresabo.';
    case 'anmeldung_ungueltig':
      return 'Deine Anmeldung ist abgelaufen. Bitte melde dich ab und neu an.';
    case 'zu_viele_versuche':
      return 'Zu viele Versuche in kurzer Zeit. Bitte warte eine Stunde und versuche es dann noch einmal.';
    default:
      return 'Das hat gerade nicht geklappt. Bitte versuche es gleich noch einmal.';
  }
}

const BEKANNT: GutscheinFehlerCode[] = [
  'code_unbekannt', 'nicht_dein_code', 'falsche_app', 'abgelaufen', 'schon_eingeloest', 'nicht_berechtigt',
  'anmeldung_ungueltig', 'zu_viele_versuche', 'ungueltige_anfrage', 'server',
];

/**
 * Ein Aufruf an den Server. token = Access-Token der App, absender = x-dexware-app.
 * Wirft GutscheinFehler (auch bei Netzfehler: 'server'). fetchFn nur für Tests.
 */
export async function gutscheinAufruf<T>(
  token: string | null | undefined,
  absender: string,
  body: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  if (!token) throw new GutscheinFehler('anmeldung_ungueltig');
  let res: Response;
  try {
    res = await fetchFn(`${SUITE_URL}/gutschein`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUITE_ANON, Authorization: `Bearer ${token}`, 'x-dexware-app': absender },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GutscheinFehler('server');
  }
  const j = (await res.json().catch(() => null)) as (Record<string, unknown> & { fehler?: string }) | null;
  if (!res.ok || !j) {
    const code = (BEKANNT as string[]).includes(String(j?.fehler)) ? (j!.fehler as GutscheinFehlerCode) : 'server';
    throw new GutscheinFehler(code, {
      app: (j?.app as GutscheinApp | undefined) ?? null,
      pro_bis: (j?.pro_bis as string | undefined) ?? null,
      grund: j?.grund as string | undefined,
      probe_bis: j?.probe_bis as string | undefined,
    });
  }
  return j as T;
}

/** Schnittstelle für die Seiten (echter Server oder Beispieldaten der Vorschau). */
export interface DankeschoenApi {
  status(): Promise<GutscheinStatus>;
  waehlen(app: GutscheinApp): Promise<Gutschein>;
}
export interface EinloesenApi {
  einloesen(code: string): Promise<{ pro_bis: string }>;
}

type TokenQuelle = () => Promise<string | null | undefined>;

export function dankeschoenApi(token: TokenQuelle, fetchFn?: typeof fetch): DankeschoenApi {
  return {
    status: async () => gutscheinAufruf<GutscheinStatus>(await token(), 'winterdex', { aktion: 'status' }, fetchFn),
    waehlen: async (app) =>
      (await gutscheinAufruf<{ gutschein: Gutschein }>(await token(), 'winterdex', { aktion: 'waehlen', app }, fetchFn)).gutschein,
  };
}

export function einloesenApi(token: TokenQuelle, app: GutscheinApp, fetchFn?: typeof fetch): EinloesenApi {
  return {
    einloesen: async (code) => {
      const r = await gutscheinAufruf<{ ok: boolean; pro_bis: string }>(await token(), app, { aktion: 'einloesen', code }, fetchFn);
      return { pro_bis: r.pro_bis };
    },
  };
}
