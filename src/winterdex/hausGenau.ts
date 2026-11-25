// WinterDex — „hausgenau und eindeutig?“: dieselbe Regel wie der Server beim Nachholen von Standorten
// (WinterDex backend/src/glaette-orte.ts ortAuswerten, Nachprüfung 26.11.2026 zu Tagescheck-Fund 26 — bei Änderungen
// BEIDE Stellen anpassen). Ein Standort aus der Adresse kommt nur dann ins Objekt, wenn PLZ, Straße UND Hausnummer
// passen und ALLE solchen Treffer höchstens 150 m auseinanderliegen. Sonst steht ein falscher Abstand dauerhaft im
// versiegelten Nachweis (operation_seal → distance_m): „Dorfstraße 5, 8200 Gleisdorf“ gibt es in zwei Gemeinden der
// PLZ (4 km auseinander), „Bahnhofstraße 12“ ist kein Treffer für „Hauptstraße 12“. Ein falscher Standort ist schlimmer
// als keiner — ohne Standort legt ihn die App beim ersten Einsatz vor Ort fest.
// Reine Funktionen (kein Netz, kein window) — testbar in Node.

export interface HausPunkt {
  lat: number;
  lng: number;
}

export interface Treffer {
  lat?: string;
  lon?: string;
  address?: Record<string, string | undefined>;
}

export interface HausAdresse {
  zip: string;
  place: string;
  /** „Hauptstraße 12a“ — der Teil direkt vor PLZ/Ort (davor stehende Teile wie Namen fallen weg); null = keiner */
  strasse: string | null;
  /** Hausnummer als Vergleichsschlüssel „12a“ / „12“; null = keine erkannt */
  hausnummer: string | null;
}

/** So weit dürfen Treffer desselben Hauses auseinanderliegen (Gebäude-Umriss, Eingänge, Adresspunkt neben dem Haus). */
export const HAUS_RADIUS_M = 150;

const rad = (g: number) => (g * Math.PI) / 180;
function abstandM(a: HausPunkt, b: HausPunkt): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Straße + Hausnummer aus dem Teil vor PLZ/Ort („Fam. Huber, Hauptstraße 12, 8200 Gleisdorf“ → „Hauptstraße 12“). */
export function strasseVorPlz(address: string): { strasse: string | null; hausnummer: string | null } {
  const re = /(?:^|[\s,])(?:(D|A|CH)\s*-\s*)?(\d{4,5})\s+([^\s,\d][^,]*)/giu;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(address); m; m = re.exec(address)) last = m;
  if (!last) return { strasse: null, hausnummer: null };
  const davor = address.slice(0, last.index + (/^[\s,]/.test(last[0]) ? 1 : 0));
  const teile = davor.split(',').map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const strasse = teile.length ? teile[teile.length - 1].slice(0, 120) : null;
  return { strasse, hausnummer: strasse ? hausnummerSchluessel(strasse) : null };
}

/** Erste Hausnummer einer Straßenangabe: „Straße des 17. Juni 5“ → „5“, „Hauptstraße 12/3“ → „12“, „Am Berg 4 a“ → „4a“. */
export function hausnummerSchluessel(strasse: string): string | null {
  const m = /(?:^|\s)(\d{1,4})\s*([a-z])?(?=\s*(?:$|[/\-–,;]|\s))/iu.exec(strasse);
  return m ? `${Number(m[1])}${(m[2] ?? '').toLowerCase()}` : null;
}

/** Hausnummer eines Nominatim-Treffers („12a“, „12 A“, „10;12“) → Vergleichsschlüssel(e). */
function trefferHausnummern(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  return v
    .split(/[;,]/)
    .map((t) => /^\s*(\d{1,4})\s*([a-z])?\b/iu.exec(t))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => `${Number(m[1])}${(m[2] ?? '').toLowerCase()}`);
}

/** Straßenname ohne Hausnummer: „Hauptstraße 12a“ → „Hauptstraße“, „12 Hauptstraße“ → „Hauptstraße“. */
export function strassenName(strasse: string): string | null {
  const m = /(?:^|\s)(\d{1,4})\s*([a-z])?(?=\s*(?:$|[/\-–,;]|\s))/iu.exec(strasse);
  let name = m ? strasse.slice(0, m.index) : strasse;
  if (m && !name.trim()) name = strasse.slice(m.index + m[0].length);
  name = name.replace(/[\s,;/\-–]+$/u, '').replace(/^[\s,;/\-–]+/u, '').trim();
  return name && /\p{L}{2,}/u.test(name) ? name : null;
}

/** Für Straßen-Vergleiche (Gleichheit, kein Teiltreffer): „Dr.-Karl-Renner-Str.“ = „Doktor Karl Renner Straße“. */
export function strassenSchluessel(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/str\.|str\b/g, 'strasse')
    .replace(/\bst\.\s*|\bsankt\b/g, 'st ')
    .replace(/\bdr\.\s*|\bdoktor\b/g, 'dr ')
    .replace(/\bprof\.\s*|\bprofessor\b/g, 'prof ')
    .replace(/[^a-z0-9]+/g, '');
}

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
const PLACE_KEYS = ['city', 'town', 'village', 'municipality', 'hamlet', 'suburb', 'city_district', 'locality'];

function ortPasst(hit: Treffer, place: string): boolean {
  const a = hit.address ?? {};
  const want = placeKey(place);
  return PLACE_KEYS.some((k) => {
    const have = placeKey(a[k] ?? '');
    return have.length >= 3 && (` ${want} `.includes(` ${have} `) || ` ${have} `.includes(` ${want} `));
  });
}

/** PLZ gleich — oder keine PLZ im Treffer und der Ort stimmt (wie geo.ts hitFits). */
function trefferPasst(hit: Treffer, where: Pick<HausAdresse, 'zip' | 'place'>): boolean {
  const a = hit.address ?? {};
  if (a.postcode) return a.postcode.split(/[;,]/).some((p) => p.replace(/\D/g, '') === where.zip);
  return ortPasst(hit, where.place);
}

const trefferPunkt = (h: Treffer): HausPunkt | null => {
  const lat = Number(h.lat);
  const lng = Number(h.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
};

const STRASSEN_KEYS = ['road', 'pedestrian', 'footway', 'path', 'cycleway', 'square', 'place'];
/** Nur wenn der Treffer GAR KEIN Straßen-Feld hat (Adresse „Ortsteil Hausnummer“): der Ortsteil als Straßenname. */
const ORTSTEIL_KEYS = ['hamlet', 'isolated_dwelling', 'village', 'locality', 'neighbourhood', 'suburb', 'quarter', 'farm'];

/** Liegt der Treffer an der gesuchten Straße? (Nominatim lässt bei unpassenden Anfragen Teile der Adresse weg.) */
export function strassePasst(hit: Treffer, name: string | null): boolean {
  if (!name) return false;
  const want = strassenSchluessel(name);
  if (want.length < 3) return false;
  const a = hit.address ?? {};
  const strassen = STRASSEN_KEYS.map((k) => a[k]).filter((v): v is string => typeof v === 'string' && !!v.trim());
  const namen = strassen.length ? strassen : ORTSTEIL_KEYS.map((k) => a[k]).filter((v): v is string => typeof v === 'string' && !!v.trim());
  return namen.some((v) => strassenSchluessel(v) === want);
}

/**
 * Standort fürs Objekt aus einer Nominatim-Antwort (format=jsonv2, addressdetails=1): nur hausgenau und eindeutig,
 * sonst null (dann ohne Standort — die App legt ihn vor Ort fest).
 */
export function hausgenauerPunkt(list: unknown, where: HausAdresse): HausPunkt | null {
  if (!where.hausnummer) return null;
  const name = where.strasse ? strassenName(where.strasse) : null;
  const haus = (Array.isArray(list) ? (list as Treffer[]) : []).filter(
    (h) => h && trefferPunkt(h) && trefferPasst(h, where) && strassePasst(h, name) && trefferHausnummern(h.address?.house_number).includes(where.hausnummer!),
  );
  if (!haus.length) return null;
  for (let i = 0; i < haus.length; i++)
    for (let j = i + 1; j < haus.length; j++) if (abstandM(trefferPunkt(haus[i])!, trefferPunkt(haus[j])!) > HAUS_RADIUS_M) return null;
  return trefferPunkt(haus[0]);
}
