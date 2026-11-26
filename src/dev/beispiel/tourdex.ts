// TourDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/tourdex?beispiel, docs/beispiel-zugang.md).
// Persönliches Konto (kein Betrieb): ein erfundener Elektro-Meisterbetrieb in Musterstadt mit Firmenwagen und Transporter,
// gut sechs Wochen Fahrten an Werktagen — Arbeitsweg, Kunden, Großhandel, vereinzelt privat. Alles in EINER Tabelle
// sync_items (collection trips / vehicles / places, Blob in data) wie TourDex-Cloud-Sync (src/tourdex/types.ts).
// Personen nur als „Fam. <häufiger Nachname>“, Adressen erfunden (PLZ 123xx), keine Markennamen, Kennzeichen „MU-…“.
//
// Was die Übersicht damit zeigt (src/tourdex/pages/Overview.tsx):
//   · Fahrten (≈ 175), gefahrene km, Anteil geschäftlich (≈ zwei Drittel) · Unbestätigt 3 (Nachmittag des letzten
//     Werktags + eine liegen gebliebene Fahrt, mit KI-Vorschlag) · Letzte Fahrten mit Kategorie und Status (Arbeitsweg,
//     geschäftlich, privat; bestätigt/unbestätigt) · 1 von Hand nachgetragene und 1 stornierte Fahrt (Liste „Fahrten“)
// Liest die Listen über JSON-Pfade (data->>startTime …) — der Speicher-Client braucht dafür feld() (client-jsonpfad).
// Schema wie TourDex/supabase/test/sync_items-annahme.sql (user_id, collection, item_id, data, updated_at, deleted).

import type { BeispielDaten, Zeile } from './typen.ts';

const NUTZER = 'b0000002-0000-4000-8000-000000000001';
const TAG = 86_400_000;

// ---------------------------------------------------------------------------- Zufall mit festem Startwert (gleiche Daten bei jedem Laden)

function zufall(start: number) {
  let a = start >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = zufall(240611);

// ---------------------------------------------------------------------------- Orte

interface Ort {
  key: string;
  label: string;
  type: 'home' | 'office' | 'client' | 'other';
  address: string;
  lat: number;
  lng: number;
  defaultCategory?: 'business' | 'private' | 'commute';
}

const ORTE: Ort[] = [
  { key: 'buero', label: 'Büro und Lager', type: 'office', address: 'Werkstraße 7, 12345 Musterstadt', lat: 50.00874, lng: 9.46415, defaultCategory: 'business' },
  { key: 'zuhause', label: 'Zuhause', type: 'home', address: 'Birkenweg 3, 12349 Musterstadt', lat: 50.03512, lng: 9.40236 },
  { key: 'grosshandel', label: 'Elektro-Großhandel', type: 'other', address: 'Gewerbering 21, 12351 Neudorf', lat: 49.93107, lng: 9.56922, defaultCategory: 'business' },
  { key: 'becker', label: 'Fam. Becker (Neubau)', type: 'client', address: 'Lindenallee 14, 12347 Musterstadt', lat: 50.02236, lng: 9.49531, defaultCategory: 'business' },
  { key: 'hv', label: 'Hausverwaltung Musterstadt', type: 'client', address: 'Marktplatz 5, 12345 Musterstadt', lat: 50.01231, lng: 9.45672, defaultCategory: 'business' },
  { key: 'halle', label: 'Gemeindehalle Altheim', type: 'client', address: 'Schulstraße 10, 12361 Altheim', lat: 49.88264, lng: 9.27118, defaultCategory: 'business' },
  { key: 'weber', label: 'Fam. Weber', type: 'client', address: 'Am Sportplatz 2, 12351 Neudorf', lat: 49.94013, lng: 9.55381, defaultCategory: 'business' },
  { key: 'kita', label: 'Kita Regenbogen', type: 'client', address: 'Kirchgasse 6, 12357 Bergen', lat: 50.10192, lng: 9.57810, defaultCategory: 'business' },
  { key: 'schulz', label: 'Fam. Schulz', type: 'client', address: 'Hauptstraße 48, 12357 Bergen', lat: 50.09727, lng: 9.58702, defaultCategory: 'business' },
];
// Weitere Ziele ohne gespeicherten Ort (z. B. privat)
const SONST: Record<string, Omit<Ort, 'key' | 'label' | 'type'>> = {
  baumarkt: { address: 'Industriestraße 30, 12345 Musterstadt', lat: 50.00421, lng: 9.47566 },
  sport: { address: 'Waldstraße 44, 12349 Musterstadt', lat: 50.04417, lng: 9.42940 },
};
const ort = (k: string) => ORTE.find((o) => o.key === k) ?? { key: k, label: k, type: 'other' as const, ...SONST[k] };

// Straßen-km zwischen zwei Orten (Luftlinie × Umwegfaktor, auf 0,1 km)
function km(a: string, b: string): number {
  const p = ort(a);
  const q = ort(b);
  const dy = (p.lat - q.lat) * 111.2;
  const dx = (p.lng - q.lng) * 111.2 * Math.cos((p.lat * Math.PI) / 180);
  const x = Math.round(Math.hypot(dx, dy) * (1.28 + rnd() * 0.12) * 10) / 10;
  // GPS-Strecken sind praktisch nie glatte Kilometer
  return Number.isInteger(x) ? x + 0.2 : x;
}

// ---------------------------------------------------------------------------- Fahrzeuge

const FIRMENWAGEN = '7c1e0b52-2f4a-4d0e-9a51-3e6f2b9d4a01';
const TRANSPORTER = '7c1e0b52-2f4a-4d0e-9a51-3e6f2b9d4a02';
const SEIT = Date.now() - 214 * TAG;

const fahrzeuge = [
  { id: FIRMENWAGEN, name: 'Firmenwagen', licensePlate: 'MU-EL 240', type: 'car', initialOdometerKm: 48210, isDefault: true, createdAt: new Date(SEIT).toISOString() },
  { id: TRANSPORTER, name: 'Transporter', licensePlate: 'MU-EL 241', type: 'van', initialOdometerKm: 91350, isDefault: false, createdAt: new Date(SEIT + 3 * TAG).toISOString() },
];

// ---------------------------------------------------------------------------- Fahrten

/** Kalendertag vor `tage` Tagen um hh:mm (lokal) — ohne Werktag-Verschiebung, der Tagesplan prüft den Wochentag selbst */
function zeit(tage: number, hh: number, mm: number): Date {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  d.setDate(d.getDate() - tage);
  return d;
}

const ZWECK: Record<string, string> = {
  becker: 'Neubau Fam. Becker: Installation EG',
  hv: 'Hausverwaltung Musterstadt: Zählerschrank Haus 2',
  halle: 'Gemeindehalle Altheim: Prüfung ortsfester Anlagen',
  weber: 'Fam. Weber: Angebot Wallbox, Aufmaß',
  kita: 'Kita Regenbogen: Notbeleuchtung warten',
  grosshandel: 'Material abholen',
  schulz: 'Fam. Schulz: Störung Herd',
};

interface Fahrt {
  tage: number;
  hh: number;
  mm: number;
  von: string;
  nach: string;
  kat: 'business' | 'private' | 'commute';
  fz: string;
  zweck?: string;
  manuell?: boolean;
  offen?: boolean;
  ki?: { category: 'business' | 'private' | 'commute'; confidence: number; reason: string; purpose?: string };
  storno?: string;
}

const fahrten: Fahrt[] = [];
// Tagesplan je Werktag (reihum): ein oder zwei Kunden — so wechseln Ziele und Fahrzeuge in der Liste
const PLAN: string[][] = [['becker'], ['hv', 'weber'], ['becker'], ['halle'], ['kita', 'schulz'], ['becker'], ['hv', 'becker'], ['weber'], ['halle'], ['kita']];
let k = 0;
for (let tage = 45; tage >= 1; tage--) {
  const wtag = zeit(tage, 12, 0).getDay();
  if (wtag === 0) continue;
  if (wtag === 6) {
    // Samstag gelegentlich privat
    if (tage % 3 === 0) {
      fahrten.push({ tage, hh: 10, mm: 5, von: 'zuhause', nach: 'baumarkt', kat: 'private', fz: FIRMENWAGEN });
      fahrten.push({ tage, hh: 11, mm: 20, von: 'baumarkt', nach: 'zuhause', kat: 'private', fz: FIRMENWAGEN });
    }
    continue;
  }
  const kunden = PLAN[k++ % PLAN.length];
  // Großbaustellen mit dem Transporter (Material), sonst Firmenwagen
  const fz = kunden.includes('becker') || kunden.includes('halle') ? TRANSPORTER : FIRMENWAGEN;
  fahrten.push({ tage, hh: 6, mm: 45 + Math.floor(rnd() * 15), von: 'zuhause', nach: 'buero', kat: 'commute', fz: FIRMENWAGEN });
  let hier = 'buero';
  let hh = 7;
  let mm = 25 + Math.floor(rnd() * 10);
  // Montag und Donnerstag morgens Material beim Großhandel
  if (wtag === 1 || wtag === 4) {
    fahrten.push({ tage, hh, mm, von: hier, nach: 'grosshandel', kat: 'business', fz, zweck: ZWECK.grosshandel });
    hier = 'grosshandel';
    hh = 8;
    mm = 20 + Math.floor(rnd() * 15);
  }
  for (const kunde of kunden) {
    fahrten.push({ tage, hh, mm, von: hier, nach: kunde, kat: 'business', fz, zweck: ZWECK[kunde] });
    hier = kunde;
    hh = 12;
    mm = 30 + Math.floor(rnd() * 20);
  }
  fahrten.push({ tage, hh: 15, mm: 10 + Math.floor(rnd() * 30), von: hier, nach: 'buero', kat: 'business', fz, zweck: ZWECK[hier] });
  fahrten.push({ tage, hh: 16, mm: 45 + Math.floor(rnd() * 12), von: 'buero', nach: 'zuhause', kat: 'commute', fz: FIRMENWAGEN });
  // dienstags abends Sport (privat)
  if (wtag === 2) {
    fahrten.push({ tage, hh: 18, mm: 30, von: 'zuhause', nach: 'sport', kat: 'private', fz: FIRMENWAGEN });
    fahrten.push({ tage, hh: 20, mm: 15, von: 'sport', nach: 'zuhause', kat: 'private', fz: FIRMENWAGEN });
  }
}

// Noch nicht bestätigt (automatisch erfasst, mit KI-Vorschlag; bestätigt wird in der App, Overview.tsx): die Fahrten vom
// Nachmittag des letzten Werktags und eine liegen gebliebene Fahrt ein paar Werktage davor
const werktage = [...new Set(fahrten.filter((f) => f.kat === 'commute').map((f) => f.tage))].sort((x, y) => x - y);
const offen = [
  ...fahrten.filter((f) => f.tage === werktage[0] && f.hh >= 12),
  ...fahrten.filter((f) => f.tage === werktage[3] && f.kat === 'business' && f.hh < 12).slice(-1),
];
for (const f of offen) {
  f.offen = true;
  f.ki =
    f.kat === 'commute'
      ? { category: 'commute', confidence: 0.96, reason: 'Fahrt zwischen „Zuhause“ und „Büro und Lager“ — wie an den Vortagen.' }
      : f.kat === 'private'
        ? { category: 'private', confidence: 0.81, reason: 'Abendliche Fahrt ohne Kundenbezug, gleiches Ziel wie an anderen Abenden.' }
        : { category: 'business', confidence: 0.93, reason: `Ziel ist ein gespeicherter Ort („${ort(f.nach === 'buero' ? f.von : f.nach).label}“).`, purpose: f.zweck };
  delete f.zweck;
}

// Von Hand nachgetragen (Handy vergessen) und eine stornierte Doppelerfassung, gut drei Wochen her
const tagNachtrag = werktage.find((t) => t >= 19) ?? werktage[werktage.length - 1];
const nachgetragen = fahrten.find((f) => f.tage === tagNachtrag && f.kat === 'business');
if (nachgetragen) {
  nachgetragen.manuell = true;
  fahrten.push({ ...nachgetragen, mm: nachgetragen.mm + 1, storno: 'Doppelt nachgetragen — die Fahrt steht schon im Fahrtenbuch.' });
}

/** item_id wie mobile utils/id.ts → uid('trip_'): Zeit (Basis 36) + 8 Zeichen */
function tripId(t: Date, n: number): string {
  return `trip_${t.getTime().toString(36)}${(n * 2654435761).toString(36).padStart(8, '0').slice(-8)}`;
}

function punkt(o: { lat: number; lng: number; address: string }) {
  return { latitude: o.lat, longitude: o.lng, address: o.address };
}

const trips: Zeile[] = fahrten.map((f, n) => {
  const start = zeit(f.tage, f.hh, f.mm);
  const strecke = km(f.von, f.nach);
  const dauer = Math.round((strecke / (strecke < 8 ? 28 : 46)) * 60 + 4 + rnd() * 5);
  const ende = new Date(start.getTime() + dauer * 60_000);
  const a = ort(f.von);
  const b = ort(f.nach);
  const id = tripId(start, n + 1);
  // GPS-Pfad (nur automatisch erfasste Fahrten): Punkte etwa alle 400 m entlang der Strecke
  const punkte = Math.max(6, Math.min(60, Math.round(strecke * 2.5)));
  const pfad = f.manuell
    ? undefined
    : Array.from({ length: punkte }, (_, i) => {
        const s = i / (punkte - 1);
        const bogen = Math.sin(s * Math.PI) * 0.004;
        return {
          latitude: Math.round((a.lat + (b.lat - a.lat) * s + bogen) * 1e5) / 1e5,
          longitude: Math.round((a.lng + (b.lng - a.lng) * s - bogen) * 1e5) / 1e5,
          timestamp: start.getTime() + Math.round(s * dauer * 60_000),
        };
      });
  const data: Record<string, unknown> = {
    id,
    vehicleId: f.fz,
    startTime: start.toISOString(),
    endTime: ende.toISOString(),
    start: f.manuell ? { latitude: 0, longitude: 0, address: a.address } : punkt(a),
    end: f.manuell ? { latitude: 0, longitude: 0, address: b.address } : punkt(b),
    distanceKm: strecke,
    category: f.ki?.category ?? f.kat,
    confirmed: !f.offen,
    manual: !!f.manuell,
    createdAt: (f.manuell ? new Date(start.getTime() + 2 * TAG) : ende).toISOString(),
  };
  if (f.zweck) data.purpose = f.zweck;
  if (f.ki) data.aiSuggestion = f.ki;
  if (pfad) data.path = pfad;
  if (f.storno) {
    data.canceled = true;
    data.cancelReason = f.storno;
    data.canceledAt = new Date(start.getTime() + 2 * TAG + 3 * 3_600_000).toISOString();
  }
  const geaendert = f.storno ? (data.canceledAt as string) : f.offen ? ende.toISOString() : new Date(ende.getTime() + 20 * 3_600_000).toISOString();
  return { user_id: NUTZER, collection: 'trips', item_id: id, data, updated_at: geaendert, deleted: false };
});

const places: Zeile[] = ORTE.map((o, i) => {
  const p: Record<string, unknown> = {
    id: `plc_${(SEIT + i * 97_000_000).toString(36)}${String(1000 + i * 37).padStart(8, '0').slice(-8)}`,
    label: o.label,
    type: o.type,
    latitude: o.lat,
    longitude: o.lng,
    address: o.address,
    createdAt: new Date(SEIT + i * 4 * TAG).toISOString(),
  };
  if (o.defaultCategory) p.defaultCategory = o.defaultCategory;
  return { user_id: NUTZER, collection: 'places', item_id: p.id, data: p, updated_at: p.createdAt, deleted: false };
});

const vehicles: Zeile[] = fahrzeuge.map((v) => ({ user_id: NUTZER, collection: 'vehicles', item_id: v.id, data: v, updated_at: v.createdAt, deleted: false }));

export const daten: BeispielDaten = {
  app: 'tourdex',
  nutzer: { id: NUTZER, email: 'fahrtenbuch@elektro-muster.example' },
  tabellen: { sync_items: [...vehicles, ...places, ...trips] },
};
