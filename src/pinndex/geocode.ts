// PinnDex — Adresse → Koordinaten (für den Pin auf der Live-Karte). EINE Stelle, damit der Anbieter austauschbar bleibt:
// heute Nominatim (OpenStreetMap), kostenlos und ohne Schlüssel. Regeln von Nominatim (operations.osmfoundation.org/policies/nominatim):
// höchstens 1 Anfrage pro Sekunde, keine Suche bei jedem Tastendruck, Ergebnisse zwischenspeichern.
// → Aufruf nur beim Speichern bzw. auf Knopfdruck, Warteschlange mit ≥ 1,1 s Abstand, Ergebnis im Browser gemerkt
//   (und vom Aufrufer beim Kunden gespeichert). Fehlschlag = null → ohne Pin speichern.
// Datenschutz: Die Adresse geht an die OpenStreetMap Foundation (Server in der EU/UK) — gehört in die Datenschutzerklärung.

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Geocoder {
  find(address: string): Promise<GeoPoint | null>;
}

const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 8000;
const CACHE_KEY = 'pinn-geo-cache-v1';
const CACHE_MAX = 300;

let lastCall = 0;
let queue: Promise<unknown> = Promise.resolve();

const norm = (a: string) => a.trim().replace(/\s+/g, ' ').toLowerCase();

function readCache(): Record<string, GeoPoint | 0> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, GeoPoint | 0>;
  } catch {
    return {};
  }
}
function writeCache(key: string, v: GeoPoint | 0) {
  try {
    const c = readCache();
    c[key] = v;
    const keys = Object.keys(c);
    if (keys.length > CACHE_MAX) for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete c[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* privates Fenster — dann eben ohne Zwischenspeicher */
  }
}

/** Nominatim (OpenStreetMap). Nur DE/AT/CH, eine Fundstelle, deutsche Namen. */
export const nominatim: Geocoder = {
  async find(address) {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=de,at,ch&accept-language=de&q=' + encodeURIComponent(address);
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    // Netz-/Dienstfehler werfen (werden NICHT als „nicht gefunden“ gemerkt), leeres Ergebnis = null
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Adress-Suche: HTTP ${res.status}`);
      const list = (await res.json()) as { lat?: string; lon?: string }[];
      const hit = list[0];
      const lat = Number(hit?.lat);
      const lng = Number(hit?.lon);
      return hit && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
    } finally {
      window.clearTimeout(t);
    }
  },
};

/** Austauschbarer Anbieter (z. B. später ein bezahlter Dienst mit EU-Servern). */
let provider: Geocoder = nominatim;
export function setGeocoder(g: Geocoder) {
  provider = g;
}

/**
 * Adresse → Koordinaten, mit Zwischenspeicher und Warteschlange (≥ 1,1 s zwischen zwei Anfragen, auch bei mehreren
 * gleichzeitigen Aufrufen). Nicht gefundene Adressen werden ebenfalls gemerkt (kein erneutes Nachfragen beim nächsten Speichern).
 */
export function geocodeAddress(address: string, opts: { retry?: boolean } = {}): Promise<GeoPoint | null> {
  const key = norm(address);
  if (key.length < 4) return Promise.resolve(null);
  const cached = readCache()[key];
  if (cached && !opts.retry) return Promise.resolve(cached);
  if (cached === 0 && !opts.retry) return Promise.resolve(null);
  const run = queue.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    try {
      const p = await provider.find(address.trim());
      writeCache(key, p ?? 0);
      return p;
    } catch {
      return null; // offline, Zeitüberschreitung, Dienst nicht erreichbar → ohne Pin, beim nächsten Mal neu versuchen
    }
  });
  queue = run.catch(() => null);
  return run;
}
