// Kartenausschnitt im Außendienst — wie die App (WinterDex mobile/src/lib/mapRegion.ts, 25.11.2026): Die Karte startet
// bei den eigenen Objekten, nicht in einer Europa-Übersicht. Ohne Objekt-Standort: eigener Standort (nur mit SCHON
// erteilter Erlaubnis), sonst das Land des Betriebs.
//
// Bewusst ohne Laufzeit-Imports: Node-Tests laden die Datei direkt (tests/gratis-ablauf.test.mjs).

export type Land = 'DE' | 'AT' | 'CH';
/** Welche Objekte die Chips hervorheben: alle, nur heute offene (orange) oder nur erledigte (grün). */
export type KartenFilter = 'alle' | 'offen' | 'erledigt';

export interface Box {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Ganzes Land (um die Landesgrenzen) — Start, wenn weder Objekt-Standorte noch der eigene Standort bekannt sind. */
export const LAND_BOX: Record<Land, Box> = {
  AT: { minLat: 46.37, maxLat: 49.02, minLng: 9.53, maxLng: 17.16 },
  DE: { minLat: 47.27, maxLat: 55.06, minLng: 5.87, maxLng: 15.04 },
  CH: { minLat: 45.82, maxLat: 47.81, minLng: 5.96, maxLng: 10.49 },
};

/** Einzelnes Objekt (oder eng beieinander): höchstens so nah — Straßenebene, gut 600 m auf dem Handy. */
export const STRASSE_ZOOM = 16;
/** Eigener Standort ohne Objekte: Stadtteil-Ebene. */
export const STADTTEIL_ZOOM = 14;

/** Rechteck um alle Punkte; null ohne Punkte. */
export function boxOf(points: readonly (readonly [number, number])[]): Box | null {
  let b: Box | null = null;
  for (const [lat, lng] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!b) b = { minLat: lat, maxLat: lat, minLng: lng, maxLng: lng };
    else {
      if (lat < b.minLat) b.minLat = lat;
      if (lat > b.maxLat) b.maxLat = lat;
      if (lng < b.minLng) b.minLng = lng;
      if (lng > b.maxLng) b.maxLng = lng;
    }
  }
  return b;
}

/** Schlüssel eines Ausschnitts (5 Stellen ≈ 1 m) — ändert er sich, wird nachgeführt. */
export function boxKey(b: Box | null): string {
  return b ? [b.minLat, b.maxLat, b.minLng, b.maxLng].map((x) => x.toFixed(5)).join(',') : '-';
}

/** Land aus der Zeitzone des Browsers — nur, wenn das Land des Betriebs nicht bekannt ist. */
export function landAusZeitzone(tz?: string): Land {
  let zone = tz;
  if (zone === undefined) {
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    } catch {
      zone = '';
    }
  }
  if (zone === 'Europe/Vienna') return 'AT';
  if (zone === 'Europe/Zurich' || zone === 'Europe/Busingen') return 'CH';
  return 'DE';
}

/** Chip antippen: auf genau diese Objekte; nochmal tippen = wieder alle. */
export function naechsterFilter(jetzt: KartenFilter, getippt: KartenFilter): KartenFilter {
  return getippt === jetzt && getippt !== 'alle' ? 'alle' : getippt;
}

/** Eigener Standort ohne Nachfrage: nur, wenn der Browser die Erlaubnis SCHON hat (die Karte fragt nicht ungefragt). */
export async function standortOhneNachfrage(timeoutMs = 2500): Promise<{ lat: number; lng: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions?.query) return null;
    const st = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (st.state !== 'granted') return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { maximumAge: 10 * 60 * 1000, timeout: timeoutMs, enableHighAccuracy: false },
      );
    });
  } catch {
    return null;
  }
}

/** „Mein Standort“: ausdrücklich getippt → hier darf der Browser nach der Erlaubnis fragen. */
export function meinStandort(): Promise<{ lat: number; lng: number } | 'verweigert' | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => resolve(e.code === 1 ? 'verweigert' : null),
      { maximumAge: 60 * 1000, timeout: 15000, enableHighAccuracy: true },
    );
  });
}
