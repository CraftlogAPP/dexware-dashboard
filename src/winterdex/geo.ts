// WinterDex — Standort aus der Objektadresse (Dashboard: Objekt-Formular und Import). Wie die App beim Speichern —
// für Wetter-Rückgriff, Glätte-Frühwarnung und den GPS-Abstand im Nachweis. Über dieselbe Warteschlange wie die
// Adresssuche von PinnDex (Nominatim/OpenStreetMap, ≥ 1,1 s Abstand), aber strenger:
//  - gesucht wird nur mit PLZ und Ort in der Adresse. „Schulweg 3“ allein fand ein Haus in Hamburg, „Hauptstraße 1, 8200“
//    eine Hauptstraße in Berlin — und der falsche Abstand stünde dann dauerhaft im versiegelten Nachweis
//    (operation_seal → distance_m). Ein falscher Standort ist schlimmer als keiner.
//  - nur im Land der PLZ (5-stellig Deutschland, 4-stellig Österreich/Schweiz, Kürzel D-/A-/CH-)
//  - ein Treffer zählt nur, wenn seine PLZ zur Adresse passt (oder er keine hat und der Ort passt)
//  - Ergebnisse nur im Arbeitsspeicher dieser Seite, nicht im Browser-Speicher (Kundenadressen bleiben nicht auf
//    einem gemeinsam genutzten PC liegen)
// Bewusst ohne Abhängigkeit vom Import-Modul (das Formular soll den Excel-Leser nicht mitladen).

import { throttledLookup, type GeoPoint } from '../pinndex/geocode';

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
  if (!where) return Promise.resolve({ point: null, why: 'noPlace' });
  const key = `${placeKey(address)}|${where.countries}`;
  const known = memo.get(key);
  if (known) return Promise.resolve(known);
  return throttledLookup(async (): Promise<LocateResult> => {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&addressdetails=1&accept-language=de' +
      `&countrycodes=${where.countries}&q=${encodeURIComponent(address.trim())}`;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) return { point: null, why: 'notFound' }; // Dienst gestört: nicht merken, beim nächsten Mal neu
      const list = (await res.json()) as unknown;
      let out: LocateResult = { point: null, why: 'notFound' };
      for (const hit of Array.isArray(list) ? (list as Hit[]) : []) {
        const lat = Number(hit.lat);
        const lng = Number(hit.lon);
        const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
        if (valid && hitFits(hit, where)) {
          out = { point: { lat, lng } };
          break;
        }
      }
      memo.set(key, out);
      return out;
    } catch {
      return { point: null, why: 'notFound' }; // offline, Zeitüberschreitung — nicht merken
    } finally {
      window.clearTimeout(t);
    }
  });
}
