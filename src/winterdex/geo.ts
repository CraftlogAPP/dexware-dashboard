// WinterDex — Standort aus der Objektadresse (Dashboard: Objekt-Formular und Import). Wie die App beim Speichern —
// für Wetter-Rückgriff, Glätte-Frühwarnung und den GPS-Abstand im Nachweis. Über dieselbe Warteschlange wie die
// Adresssuche von PinnDex (Nominatim/OpenStreetMap, ≥ 1,1 s Abstand), aber strenger:
//  - gesucht wird nur mit PLZ und Ort in der Adresse. „Schulweg 3“ allein fand ein Haus in Hamburg, „Hauptstraße 1, 8200“
//    eine Hauptstraße in Berlin — und der falsche Abstand stünde dann dauerhaft im versiegelten Nachweis
//    (operation_seal → distance_m). Ein falscher Standort ist schlimmer als keiner.
//  - nur im Land der PLZ (5-stellig Deutschland, 4-stellig Österreich/Schweiz, Kürzel D-/A-/CH-)
//  - ein Treffer zählt nur, wenn seine PLZ zur Adresse passt (oder er keine hat und der Ort passt)
//  - seit 26.11.2026 nur HAUSGENAU und EINDEUTIG (hausGenau.ts, gleiche Regel wie der Server beim Nachholen): PLZ, Straße
//    UND Hausnummer passen, alle solchen Treffer ≤ 150 m auseinander — vorher reichte der erste Treffer mit passender PLZ
//    (auch nur Straße/PLZ-Gebiet oder ein gleichnamiges Haus im Nachbarort)
//  - Ergebnisse nur im Arbeitsspeicher dieser Seite, nicht im Browser-Speicher (Kundenadressen bleiben nicht auf
//    einem gemeinsam genutzten PC liegen)
//  - seit 26.11.2026 (Datenschutz, Regel 1 zum Server): an Nominatim geht NUR „Straße Hausnummer, PLZ Ort“ (suchText) —
//    wie der Server (WinterDex backend/src/glaette-orte.ts). Vorher ging das ganze Adressfeld mit, also auch Zusätze
//    davor wie „Fam. Müller, …“; die Datenschutzerklärung (Buchstaben d2 und j) beschreibt genau diese Form.
// Bewusst ohne Abhängigkeit vom Import-Modul (das Formular soll den Excel-Leser nicht mitladen).

import { throttledLookup, type GeoPoint } from '../pinndex/geocode';
import { hausgenauerPunkt, strasseVorPlz } from './hausGenau';

export type LocateResult = { point: GeoPoint; why?: undefined } | { point: null; why: 'noPlace' | 'notFound' };

export interface AddressPlace {
  zip: string;
  place: string;
  /** Länder für die Suche: 5-stellig Deutschland, 4-stellig Österreich/Schweiz, mit Kürzel D-/A-/CH- genau das */
  countries: string;
}

/**
 * PLZ und Ort aus einer Adresse („…, A-8200 Gleisdorf“). Ohne beides lässt sich der Standort nicht sicher bestimmen:
 * „Hauptplatz 1“ allein findet irgendeinen Hauptplatz im deutschsprachigen Raum.
 */
export function addressPlace(address: string): AddressPlace | null {
  const re = /(?:^|[\s,])(?:(D|A|CH)\s*-\s*)?(\d{4,5})\s+([^\s,\d][^,]*)/giu;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(address); m; m = re.exec(address)) last = m;
  if (!last) return null;
  const place = last[3].trim();
  if (!/\p{L}{2,}/u.test(place)) return null;
  const pre = last[1]?.toUpperCase();
  const zip = last[2];
  const countries = pre === 'D' ? 'de' : pre === 'A' ? 'at' : pre === 'CH' ? 'ch' : zip.length === 5 ? 'de' : 'at,ch';
  return { zip, place, countries };
}

/**
 * Suchtext für Nominatim: nur „Straße Hausnummer, PLZ Ort“ — der Teil direkt vor PLZ/Ort und PLZ/Ort selbst, ohne
 * Länderkürzel (das Land steht in countrycodes). Teile davor („Fam. Müller, Hauptstraße 5, 8010 Graz“) fallen weg,
 * genau wie beim Server (glaette-orte.ts: `${strasse}, ${zip} ${place}`). null = keine PLZ mit Ort in der Adresse.
 */
export function suchText(address: string): string | null {
  const where = addressPlace(address);
  if (!where) return null;
  const { strasse } = strasseVorPlz(address);
  return `${strasse ? `${strasse}, ` : ''}${where.zip} ${where.place}`;
}

/** Für Orts-Vergleiche: klein, Umlaute ausgeschrieben, „St.“ = „Sankt“, nur Buchstaben/Ziffern. */
const placeKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\bst\.?\s/g, 'sankt ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

interface Hit {
  lat?: string;
  lon?: string;
  address?: Record<string, string | undefined>;
}

const PLACE_KEYS = ['city', 'town', 'village', 'municipality', 'hamlet', 'suburb', 'city_district', 'locality'];

/** Passt der Treffer zur Adresse? PLZ gleich — oder keine PLZ im Treffer und der Ort stimmt. */
export function hitFits(hit: Hit, where: Pick<AddressPlace, 'zip' | 'place'>): boolean {
  const a = hit.address ?? {};
  if (a.postcode) return a.postcode.split(/[;,]/).some((p) => p.replace(/\D/g, '') === where.zip);
  const want = placeKey(where.place);
  return PLACE_KEYS.some((k) => {
    const have = placeKey(a[k] ?? '');
    return have.length >= 3 && (` ${want} `.includes(` ${have} `) || ` ${have} `.includes(` ${want} `));
  });
}

const TIMEOUT_MS = 8000;
const memo = new Map<string, LocateResult>();

/** Adresse → Standort. Ohne PLZ/Ort oder ohne passenden Treffer: kein Standort (dann in der App vor Ort festlegen). */
export function locateAddress(address: string): Promise<LocateResult> {
  const where = addressPlace(address);
  const q = suchText(address);
  if (!where || !q) return Promise.resolve({ point: null, why: 'noPlace' });
  const key = `${placeKey(address)}|${where.countries}`;
  const known = memo.get(key);
  if (known) return Promise.resolve(known);
  return throttledLookup(async (): Promise<LocateResult> => {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&addressdetails=1&accept-language=de' +
      `&countrycodes=${where.countries}&q=${encodeURIComponent(q)}`;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) return { point: null, why: 'notFound' }; // Dienst gestört: nicht merken, beim nächsten Mal neu
      const list = (await res.json()) as unknown;
      // nur hausgenau + eindeutig (sonst kein Standort — ein falscher stünde im versiegelten Nachweis)
      const punkt = hausgenauerPunkt(list, { zip: where.zip, place: where.place, ...strasseVorPlz(address) });
      const out: LocateResult = punkt ? { point: { lat: punkt.lat, lng: punkt.lng } } : { point: null, why: 'notFound' };
      memo.set(key, out);
      return out;
    } catch {
      return { point: null, why: 'notFound' }; // offline, Zeitüberschreitung — nicht merken
    } finally {
      window.clearTimeout(t);
    }
  });
}
