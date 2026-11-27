// Herkunft der Wetter-Momentwerte (Snapshot im Einsatz bzw. in der Fahrt) — Bauplan „Wetter staatlich“ P8, wie die App
// (WinterDex mobile/src/lib/wetterQuelle.ts, vc48; Regel 1: dieselben Namen, dieselbe Reihenfolge, derselbe Wortlaut).
//
// Der Server nennt die Herkunft in `weather.source`: bis Worker 0.8.x immer 'open-meteo'; mit dem Snapshot aus der
// Wetter-Basis 'geosphere', 'dwd', 'meteoschweiz' oder eine Kombination mit '+'; fällt die staatliche Kette aus, liefert er
// ersatzweise wieder 'open-meteo'. Optional `quelle_text` (fertiger Vermerk vom Server). CC BY 4.0 verlangt die RICHTIGE
// Namensnennung: Seiten, Listen und PDFs mit nur alten Datensätzen bleiben Zeichen für Zeichen wie bisher
// (WEATHER_SOURCE), neue nennen ihren Dienst.
// Deutschland und Schweiz (Umstellung auf ICON-D2 des Deutschen Wetterdienstes statt Open-Meteo, beschlossen 27.11.): die
// Vorhersage- und Modellwerte kommen als 'dwd' — auch in der Schweiz, dort ggf. mit Messwerten 'dwd+meteoschweiz';
// Österreich bleibt 'geosphere'. Modellnamen (ICON-D2, ICON-EU, MOSMIX) schickt der Server nie als source (Vertrag
// WinterDex backend/src/wetter/quelle.ts: nur diese vier Namen). Im Endzustand gibt es Open-Meteo nur noch in alten Datensätzen.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type WetterAnbieter = 'geosphere' | 'dwd' | 'meteoschweiz' | 'open-meteo';

/** Feste Reihenfolge (wie wg_quelle_text auf dem Server): staatliche Dienste zuerst, Open-Meteo zuletzt. */
export const ANBIETER_REIHE: readonly WetterAnbieter[] = ['geosphere', 'dwd', 'meteoschweiz', 'open-meteo'];

const CC = '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>';
/**
 * kurz/vermerk/html: Seiten, Listen, PDFs. karte/karteName: Fußzeile der Karte „Heute Nacht“ (ein Dienst bzw. mehrere hinter
 * „Datenquellen: “) — wortgleich mit SQL wg_quelle_text, WinterDex backend/src/wetter/quelle.ts und der App.
 */
export const ANBIETER: Readonly<Record<WetterAnbieter, { kurz: string; vermerk: string; html: string; karte: string; karteName: string }>> = {
  geosphere: {
    kurz: 'GeoSphere Austria',
    vermerk: 'Datenquelle: GeoSphere Austria – data.hub.geosphere.at (CC BY 4.0)',
    html: `Datenquelle: GeoSphere Austria – <a href="https://data.hub.geosphere.at/">data.hub.geosphere.at</a> (${CC})`,
    karte: 'Datenquelle: GeoSphere Austria',
    karteName: 'GeoSphere Austria',
  },
  dwd: {
    kurz: 'Deutscher Wetterdienst',
    vermerk: 'Datenbasis: Deutscher Wetterdienst, eigene Berechnungen (CC BY 4.0)',
    html: `Datenbasis: <a href="https://opendata.dwd.de/">Deutscher Wetterdienst</a>, eigene Berechnungen (${CC})`,
    karte: 'Datenbasis: Deutscher Wetterdienst, eigene Berechnungen',
    karteName: 'Deutscher Wetterdienst (eigene Berechnungen)',
  },
  meteoschweiz: {
    kurz: 'MeteoSchweiz',
    vermerk: 'Quelle: MeteoSchweiz (CC BY 4.0)',
    html: `Quelle: <a href="https://opendatadocs.meteoswiss.ch/">MeteoSchweiz</a> (${CC})`,
    karte: 'Quelle: MeteoSchweiz',
    karteName: 'MeteoSchweiz',
  },
  'open-meteo': {
    kurz: 'Open-Meteo',
    vermerk: 'Wetterdaten: Open-Meteo.com (CC BY 4.0)',
    html: `Wetterdaten: <a href="https://open-meteo.com/">Open-Meteo.com</a> (${CC})`,
    karte: 'Wetterdaten: Open-Meteo.com',
    karteName: 'Open-Meteo.com',
  },
};

/**
 * Fußzeile der Karte aus `heute_nacht.quellen` — dieselbe Regel wie SQL wg_quelle_text (und App/Backend karteQuelleText):
 * nur exakt bekannte Dienste (z. B. 'dwd' für ICON-D2 in DE/CH), feste Reihenfolge, ohne Doppel; ein Dienst → Einzelform,
 * mehrere → „Datenquellen: …“. 'staatlich'/'modell' (Quellwerte der Bewertung) und Unbekanntes nennen keinen Dienst → null.
 */
export function karteQuelleText(quellen: readonly unknown[] | null | undefined): string | null {
  const da = new Set((quellen ?? []).filter((q): q is string => typeof q === 'string'));
  const a = ANBIETER_REIHE.filter((x) => da.has(x));
  if (!a.length) return null;
  return a.length === 1 ? ANBIETER[a[0]].karte : `Datenquellen: ${a.map((x) => ANBIETER[x].karteName).join(', ')}`;
}

/** Zusatz, sobald ein staatlicher Dienst genannt wird (kein Anschein einer Billigung; Wortlaut wie QUELLEN_ZEILE). */
export const NICHT_BETEILIGT = 'Ausgewertet von WinterDex; die genannten Stellen sind daran nicht beteiligt.';

const NAMEN: Readonly<Record<string, WetterAnbieter>> = {
  geosphere: 'geosphere',
  'geosphere-austria': 'geosphere',
  dwd: 'dwd',
  meteoschweiz: 'meteoschweiz',
  'open-meteo': 'open-meteo',
  openmeteo: 'open-meteo',
};

const feld = (w: unknown, k: string): unknown => (w && typeof w === 'object' ? (w as Record<string, unknown>)[k] : undefined);
/** Ein Snapshot zählt, sobald er da ist (das Dashboard zeigt auch Werte ohne Temperatur). */
const istWert = (w: unknown): boolean => !!w && typeof w === 'object';

/**
 * Dienste aus `source`, feste Reihenfolge, ohne Doppel. Fehlt `source` (leer/kein Text), gilt der Datensatz als alt
 * (bis 0.8.x kam jeder Momentwert von Open-Meteo) → ['open-meteo']. Unbekannte Namen zählen nicht (nie falsch zuordnen).
 */
export function anbieterAus(source: unknown): WetterAnbieter[] {
  if (typeof source !== 'string' || !source.trim()) return ['open-meteo'];
  const da = new Set<WetterAnbieter>();
  for (const teil of source.toLowerCase().split(/[+,;/\s]+/)) {
    const a = NAMEN[teil.trim()];
    if (a) da.add(a);
  }
  return ANBIETER_REIHE.filter((a) => da.has(a));
}

/** Vermerk des Servers am Datensatz (optional) — nur kurzer, einzeiliger Text. */
function serverVermerk(w: unknown): string | null {
  const t = feld(w, 'quelle_text');
  if (typeof t !== 'string') return null;
  const s = t.replace(/\s+/g, ' ').trim();
  return s && s.length <= 300 ? s : null;
}

/** Nur Open-Meteo (bzw. alte Datensätze) oder gar kein Wert → alles bleibt wie bisher (WEATHER_SOURCE). Unbekannte zählen nicht. */
export function nurOpenMeteo(ws: readonly unknown[]): boolean {
  return ws.filter(istWert).every((w) => {
    if (serverVermerk(w)) return false;
    const a = anbieterAus(feld(w, 'source'));
    return a.length === 0 || (a.length === 1 && a[0] === 'open-meteo');
  });
}

/** Kurzname(n) für „(…)“ hinter dem Momentwert: „Open-Meteo“, „GeoSphere Austria“, „GeoSphere Austria, MeteoSchweiz“. */
export function momentQuelleKurz(w: unknown): string | null {
  if (!istWert(w)) return null;
  const a = anbieterAus(feld(w, 'source'));
  return a.length ? a.map((x) => ANBIETER[x].kurz).join(', ') : null;
}

/** Überschrift des Momentwerts: alt „Modell-Momentwert bei Beginn“ (Open-Meteo), sonst neutral „Momentwert bei Beginn“. */
export function momentTitel(w: unknown): string {
  return !istWert(w) || nurOpenMeteo([w]) ? 'Modell-Momentwert bei Beginn' : 'Momentwert bei Beginn';
}

type Vermerk = { text: string; html: string };
function vermerkeAlle(ws: readonly unknown[]): Vermerk[] {
  const da = new Set<WetterAnbieter>();
  const extra: string[] = [];
  for (const w of ws.filter(istWert)) {
    const sv = serverVermerk(w);
    if (sv) {
      if (!extra.includes(sv)) extra.push(sv);
    } else for (const x of anbieterAus(feld(w, 'source'))) da.add(x);
  }
  const fest = ANBIETER_REIHE.filter((a) => da.has(a)).map((a) => ({ text: ANBIETER[a].vermerk, html: ANBIETER[a].html }));
  return [...fest, ...extra.filter((e) => !fest.some((f) => f.text === e)).map((e) => ({ text: e, html: esc(e) }))];
}

/** Vermerke (CC BY) aller gezeigten Momentwerte — feste Reihenfolge, ohne Doppel; Server-Vermerke danach. */
export function momentVermerke(ws: readonly unknown[]): string[] {
  return vermerkeAlle(ws).map((v) => v.text);
}

/**
 * Quellenzeile unter Tabellen/Seiten und in Excel-Listen: nur alte Datensätze → genau `WEATHER_SOURCE` wie bisher; sonst
 * die vorkommenden Vermerke (mit „nicht beteiligt“; zusatz = false für eine Klammer hinter einem einzelnen Wert).
 */
export function wetterQuelle(ws: readonly unknown[] | unknown, bisher: string, zusatz = true): string {
  const liste = Array.isArray(ws) ? ws : [ws];
  if (nurOpenMeteo(liste)) return bisher;
  const v = momentVermerke(liste).join(' · ');
  return zusatz ? `${v}. ${NICHT_BETEILIGT}` : v;
}

/** Dasselbe als HTML mit Links (Druck-/PDF-Ansichten): nur alte Datensätze → genau `WEATHER_SOURCE_HTML` wie bisher. */
export function wetterQuelleHtml(ws: readonly unknown[], bisherHtml: string): string {
  if (nurOpenMeteo(ws)) return bisherHtml;
  return `${vermerkeAlle(ws).map((v) => v.html).join(' · ')}. ${esc(NICHT_BETEILIGT)}`;
}
