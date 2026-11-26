// FeuerDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/feuerdex?beispiel, docs/beispiel-zugang.md).
// Ein erfundener Betrieb „Musterbetrieb GmbH“ in Musterstadt (DE): 7 Standorte (1 aufgegeben), 32 Feuerlöscher (2
// ausgesondert), Sichtkontrollen etwa vierteljährlich, Sachkundigen-Prüfungen nach DIN 14406-4 (Frist DE 2 Jahre).
// Alle Personen sind erfunden (Initial + häufiger Nachname), E-Mails unter .example, Telefon mit Vorwahl 0123.
// Hersteller bewusst leer: keine Markennamen in Bildern.
//
// Was die Übersicht damit zeigt (src/feuerdex/pages/Overview.tsx, Fälligkeit src/lib/pruefExport.ts → dueOverview):
//   · Prüfung fällig: 3 (2 überfällig, 1 neu und noch nie geprüft) · + 4 bald fällig · 1 gesperrt · von 30 aktiven Löschern
//   · Offene Mängel: 2, davon 1× Rot · Prüfungen 30 Tage: 29 · keine Karte „Erste Schritte“ (Betrieb älter als 30 Tage)
// Schema wie FeuerDex/supabase/schema.sql (geprüft in tests/beispiel-zugang.test.mjs).

import { CHECKLIST } from '../../feuerdex/types.ts';
import { betrieb, bsp, fristVor, liste, plus, vor, type BeispielDaten, type Zeile } from './typen.ts';

const ORG = bsp(1, 1);
const INHABER = bsp(2, 1);
const BECKER = bsp(2, 2);
const WAGNER = bsp(2, 3);
const SEIT = vor(412, 9, 30, false);
const CHECK_IDS = CHECKLIST.map((c) => c.id);
// Sachkundiger des Wartungsdienstes (kein Mitglied des Betriebs — der Inhaber erfasst seine Ergebnisse)
const SACHKUNDIGER = 'J. Hartmann';

const B = betrieb({
  orgId: ORG,
  name: 'Musterbetrieb GmbH',
  land: 'DE',
  address: 'Industriestraße 4, 12345 Musterstadt',
  seit: SEIT,
  extra: { is_pro: false, logo_url: null, brand_color: null },
  team: [
    { id: INHABER, email: 'inhaber@musterbetrieb.example', role: 'owner', seit: SEIT },
    { id: WAGNER, email: 's.wagner@musterbetrieb.example', role: 'admin', seit: vor(405, 10, 5, false) },
    { id: BECKER, email: 'm.becker@musterbetrieb.example', role: 'worker', seit: vor(398, 7, 50, false) },
  ],
});

// ---------------------------------------------------------------------------- Standorte

interface S {
  nr: number;
  name: string;
  address: string;
  notes: string | null;
  lat: number;
  lng: number;
  active?: boolean;
}

const STANDORTE: S[] = [
  { nr: 1, name: 'Verwaltung', address: 'Hauptstraße 12, 12345 Musterstadt', notes: 'Löscherplan hängt am Empfang.', lat: 50.01231, lng: 9.45672 },
  { nr: 2, name: 'Werkhalle 1 – Montage', address: 'Industriestraße 4, 12345 Musterstadt', notes: null, lat: 50.00874, lng: 9.46415 },
  { nr: 3, name: 'Werkhalle 2 – Lackiererei', address: 'Industriestraße 4, 12345 Musterstadt', notes: 'Spritzkabinen nur mit CO₂-Löschern.', lat: 50.00851, lng: 9.46488 },
  { nr: 4, name: 'Lager Süd', address: 'Hafenweg 3, 12345 Musterstadt', notes: 'Zwei Löscher Ende 2025 aus dem Außenlager umgesetzt.', lat: 50.00412, lng: 9.47021 },
  { nr: 5, name: 'Kantine', address: 'Industriestraße 4, 12345 Musterstadt', notes: 'Fettbrandlöscher an der Fritteuse.', lat: 50.00903, lng: 9.46352 },
  { nr: 6, name: 'Fuhrpark', address: 'Industriestraße 4 (Hof), 12345 Musterstadt', notes: 'Löscher in den Fahrzeugen und am Stapler.', lat: 50.00829, lng: 9.46301 },
  { nr: 7, name: 'Außenlager Bahnhofstraße', address: 'Bahnhofstraße 21, 12345 Musterstadt', notes: 'Ende 2025 aufgegeben.', lat: 50.01544, lng: 9.44918, active: false },
];

const site = (nr: number) => bsp(3, nr);
const siteRows: Zeile[] = STANDORTE.map((s) => ({
  id: site(s.nr),
  org_id: ORG,
  name: s.name,
  address: s.address,
  lat: s.lat,
  lng: s.lng,
  operator_name: 'Musterbetrieb GmbH',
  operator_contact: 'Haustechnik · 0123 4567-10',
  notes: s.notes,
  active: s.active ?? true,
  created_at: plus(SEIT, 20 + s.nr * 7),
}));

// ---------------------------------------------------------------------------- Feuerlöscher

const ABC = 'Pulver (ABC)';
const SCHAUM = 'Schaum';
const CO2 = 'CO₂ (Kohlendioxid)';
const FETT = 'Fettbrand (F)';
const AUF = 'Aufladelöscher';
const DAU = 'Dauerdrucklöscher';

// [nr, Standort, Bezeichnung, Löschmittel, Bauart, Baujahr, Füllmenge, LE, Notiz, ausgesondert]
type L = [number, number, string, string, string, string, string, string | null, string | null, boolean?];
const LOESCHER: L[] = [
  [1, 1, 'F-01 Empfang EG', SCHAUM, DAU, '2021', '6', '9', null],
  [2, 1, 'F-02 Flur EG Ost', SCHAUM, DAU, '2021', '6', '9', null],
  [3, 1, 'F-03 Teeküche EG', SCHAUM, DAU, '2021', '6', '9', null],
  [4, 1, 'F-04 Treppenhaus 1. OG', SCHAUM, DAU, '2019', '6', '9', null],
  [5, 1, 'F-05 Flur 1. OG West', SCHAUM, DAU, '2019', '6', '9', null],
  [6, 1, 'F-06 Serverraum 1. OG', CO2, DAU, '2022', '5', '5', 'Nur CO₂ — keine Pulverrückstände an der Technik.'],
  [7, 1, 'F-07 Archiv 2. OG', SCHAUM, DAU, '2020', '6', '9', null],
  [8, 1, 'F-08 Treppenhaus 2. OG', SCHAUM, DAU, '2020', '6', '9', null],
  [9, 2, 'F-09 Rolltor Nord', ABC, AUF, '2018', '6', '12', null],
  [10, 2, 'F-10 Säule B3', ABC, AUF, '2018', '6', '12', null],
  [11, 2, 'F-11 Schweißplatz', ABC, AUF, '2020', '12', '15', null],
  [12, 2, 'F-12 Notausgang Süd', SCHAUM, AUF, '2018', '9', '10', null],
  [13, 3, 'F-13 Spritzkabine 1', CO2, DAU, '2021', '5', '5', null],
  [14, 3, 'F-14 Spritzkabine 2', CO2, DAU, '2021', '5', '5', null],
  [15, 3, 'F-15 Farbenlager', SCHAUM, AUF, '2019', '9', '10', null],
  [16, 3, 'F-16 Tor Ost', ABC, DAU, '2009', '6', '12', null],
  [17, 3, 'F-17 Mischraum', SCHAUM, AUF, '2019', '9', '10', null],
  [18, 3, 'F-18 Trockner', CO2, DAU, '2023', '5', '5', null],
  [19, 4, 'F-19 Wareneingang', ABC, AUF, '2017', '6', '12', null],
  [20, 4, 'F-20 Regalgang A', ABC, AUF, '2017', '6', '12', null],
  [21, 4, 'F-21 Regalgang B', ABC, AUF, '2014', '6', '12', 'Aus dem Außenlager umgesetzt.'],
  [22, 4, 'F-22 Stapler-Ladestation', ABC, AUF, '2014', '6', '12', 'Aus dem Außenlager umgesetzt.'],
  [23, 4, 'F-23 Hochregal Gang C', ABC, AUF, '2026', '6', '12', 'Neu beschafft für die Regalerweiterung.'],
  [24, 5, 'F-24 Küche Fritteuse', FETT, AUF, '2022', '6', null, null],
  [25, 5, 'F-25 Speisesaal', SCHAUM, DAU, '2022', '6', '9', null],
  [26, 5, 'F-26 Spülküche', SCHAUM, DAU, '2022', '6', '9', null],
  [27, 6, 'F-27 Transporter 1', ABC, DAU, '2021', '2', '4', null],
  [28, 6, 'F-28 Transporter 2', ABC, DAU, '2021', '2', '4', null],
  [29, 6, 'F-29 Pritschenwagen', ABC, DAU, '2021', '2', '4', null],
  [30, 6, 'F-30 Gabelstapler 1', ABC, DAU, '2020', '6', '12', null],
  [31, 7, 'F-31 Außenlager Tor', ABC, AUF, '2008', '6', '12', 'Ausgesondert, Behälter beschädigt.', true],
  [32, 7, 'F-32 Außenlager Büro', SCHAUM, AUF, '2008', '6', '9', 'Ausgesondert bei Aufgabe des Außenlagers.', true],
];

const loescher = (nr: number) => bsp(4, nr);
const proNr = new Map(LOESCHER.map((l) => [l[0], l]));
const extinguisherRows: Zeile[] = LOESCHER.map(([nr, s, name, category, build_type, purchase_year, filling_kg, rating_le, notes, retired]) => ({
  id: loescher(nr),
  org_id: ORG,
  site_id: site(s),
  name,
  category,
  build_type,
  manufacturer: null,
  purchase_year,
  filling_kg,
  rating_le,
  notes,
  photo_url: null,
  retired: retired ?? false,
  // der neue Löscher kam vor 12 Tagen dazu, alle anderen beim Einrichten des Betriebs
  created_at: nr === 23 ? vor(12, 11, 5) : plus(SEIT, 60 + nr),
}));

// ---------------------------------------------------------------------------- Prüfungen

/** Ohne Manometer (Aufladelöscher, CO₂) entfällt der Punkt „Druckanzeige“ — wie „n. z.“ in der App */
function entfaellt(nr: number): string[] {
  const l = proNr.get(nr)!;
  return l[4] === AUF || l[3] === CO2 ? ['gauge'] : [];
}

const inspections: Zeile[] = [];
let pNr = 0;
const prId = new Map<string, string>();

function pruefung(opt: {
  nr: number;
  type: 'visual' | 'expert';
  at: string;
  wer: string;
  von: string;
  maengel?: string[];
  notes?: string | null;
  /** im Dashboard nachgetragen (ohne GPS), z. B. aus dem Protokoll des Wartungsdienstes */
  nachgetragen?: boolean;
  storno?: string;
  merke?: string;
}): void {
  const l = proNr.get(opt.nr)!;
  const s = STANDORTE[l[1] - 1];
  const id = bsp(5, ++pNr);
  if (opt.merke) prId.set(opt.merke, id);
  const jitter = (pNr % 7) * 0.00003;
  inspections.push({
    id,
    org_id: ORG,
    site_id: site(s.nr),
    extinguisher_id: loescher(opt.nr),
    type: opt.type,
    started_at: opt.at,
    lat: opt.nachgetragen ? null : s.lat + jitter,
    lng: opt.nachgetragen ? null : s.lng - jitter,
    gps_accuracy_m: opt.nachgetragen ? null : 4 + (pNr % 9),
    checklist: liste(CHECK_IDS, opt.maengel ?? [], entfaellt(opt.nr)),
    photo_urls: [],
    notes: opt.notes ?? null,
    performed_by: opt.von,
    inspector_name: opt.wer,
    canceled: !!opt.storno,
    cancel_reason: opt.storno ?? null,
    canceled_at: opt.storno ? plus(opt.at, 9) : null,
    created_at: opt.nachgetragen ? plus(SEIT, 3 * 24 * 60 + pNr) : plus(opt.at, 2),
  });
}

/** Rundgang: mehrere Löscher nacheinander, `schritt` Minuten Abstand */
function rundgang(nrs: number[], start: string, schritt: number, rest: Omit<Parameters<typeof pruefung>[0], 'nr' | 'at'>, extra: Record<number, Partial<Parameters<typeof pruefung>[0]>> = {}): void {
  nrs.forEach((nr, i) => pruefung({ ...rest, nr, at: plus(start, i * schritt), ...(extra[nr] ?? {}) }));
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Sachkundigen-Prüfungen (DIN 14406-4) — die jeweils letzte je Löscher
rundgang(range(1, 8), vor(340, 8, 30), 7, { type: 'expert', wer: SACHKUNDIGER, von: INHABER }, {
  1: { notes: 'Instandhaltung durch den Wartungsdienst, neue Prüfplakette angebracht.' },
});
// Werkhalle 1: Frist läuft in 24 Tagen ab (vor der App geprüft, im Dashboard nachgetragen)
rundgang(range(9, 12), fristVor(2, 24, 13, 0), 9, {
  type: 'expert',
  wer: SACHKUNDIGER,
  von: INHABER,
  nachgetragen: true,
  notes: 'Nachgetragen aus dem Prüfprotokoll des Wartungsdienstes.',
});
rundgang(range(13, 18), vor(190, 9, 0), 8, { type: 'expert', wer: SACHKUNDIGER, von: INHABER });
rundgang([19, 20], vor(125, 10, 15), 8, { type: 'expert', wer: SACHKUNDIGER, von: INHABER });
// aus dem Außenlager umgesetzt: Frist seit 9 Tagen abgelaufen
rundgang([21, 22], fristVor(2, -9, 14, 10), 10, {
  type: 'expert',
  wer: SACHKUNDIGER,
  von: INHABER,
  nachgetragen: true,
  notes: 'Nachgetragen aus dem Prüfprotokoll des Wartungsdienstes (Außenlager).',
});
// F-23 ist neu und noch nie geprüft
rundgang(range(24, 26), vor(1, 14, 50), 7, { type: 'expert', wer: SACHKUNDIGER, von: INHABER }, {
  24: { notes: 'Fettbrandlöscher instand gehalten, Plakette erneuert.' },
});
rundgang(range(27, 30), vor(150, 7, 40), 6, { type: 'expert', wer: SACHKUNDIGER, von: INHABER });

// Sichtkontrollen (ASR A2.2) — aktuelle Runde
rundgang([9, 10], vor(1, 8, 5), 7, { type: 'visual', wer: 'M. Becker', von: BECKER });
pruefung({ nr: 11, type: 'visual', at: vor(1, 13, 30), wer: 'M. Becker', von: BECKER });
pruefung({ nr: 12, type: 'visual', at: vor(1, 15, 40), wer: 'M. Becker', von: BECKER, maengel: ['signage'], merke: 'F-12', notes: 'Schild F001 erneuern.' });
rundgang(range(1, 8), vor(4, 9, 10), 6, { type: 'visual', wer: 'M. Becker', von: BECKER });
pruefung({ nr: 3, type: 'visual', at: vor(4, 9, 25), wer: 'M. Becker', von: BECKER, storno: 'Doppelt erfasst' });
rundgang(range(13, 18), vor(8, 8, 40), 6, { type: 'visual', wer: 'S. Wagner', von: WAGNER }, {
  16: { maengel: ['gauge', 'body'], merke: 'F-16' },
});
rundgang([19, 20, 21, 22], vor(15, 13, 30), 6, { type: 'visual', wer: 'S. Wagner', von: WAGNER }, {
  20: { maengel: ['location'], merke: 'F-20' },
});
rundgang(range(27, 30), vor(22, 7, 45), 5, { type: 'visual', wer: 'M. Becker', von: BECKER }, {
  29: { maengel: ['seal'], merke: 'F-29' },
});
// frühere Runden (etwa ein Vierteljahr und ein halbes Jahr zurück)
for (const [nrs, tage, wer, von] of [
  [range(1, 8), 95, 'M. Becker', BECKER],
  [range(9, 12), 92, 'M. Becker', BECKER],
  [range(13, 18), 99, 'S. Wagner', WAGNER],
  [[19, 20, 21, 22], 106, 'S. Wagner', WAGNER],
  [range(24, 26), 90, 'S. Wagner', WAGNER],
  [range(27, 30), 113, 'M. Becker', BECKER],
  [range(1, 8), 186, 'S. Wagner', WAGNER],
  [range(9, 12), 183, 'M. Becker', BECKER],
  [[19, 20], 197, 'S. Wagner', WAGNER],
  [range(24, 26), 181, 'S. Wagner', WAGNER],
  [range(27, 30), 204, 'M. Becker', BECKER],
] as [number[], number, string, string][]) {
  rundgang(nrs, vor(tage, 9, 0), 6, { type: 'visual', wer, von });
}

// ---------------------------------------------------------------------------- Mängel

const defects: Zeile[] = [];
function mangel(opt: {
  nr: number;
  merke: string;
  title: string;
  description: string;
  severity: 'green' | 'amber' | 'red';
  blocked: boolean;
  reporter: [string, string];
  behoben?: { nachMin: number; wer: [string, string]; note: string };
}): void {
  const insp = inspections.find((i) => i.id === prId.get(opt.merke))!;
  const l = proNr.get(opt.nr)!;
  const at = plus(String(insp.started_at), 3);
  defects.push({
    id: bsp(6, defects.length + 1),
    org_id: ORG,
    site_id: site(l[1]),
    inspection_id: insp.id,
    extinguisher_id: loescher(opt.nr),
    title: opt.title,
    description: opt.description,
    severity: opt.severity,
    extinguisher_blocked: opt.blocked,
    photo_urls: [],
    status: opt.behoben ? 'resolved' : 'open',
    reported_by: opt.reporter[1],
    reporter_name: opt.reporter[0],
    resolved_at: opt.behoben ? plus(at, opt.behoben.nachMin) : null,
    resolved_by: opt.behoben ? opt.behoben.wer[1] : null,
    resolver_name: opt.behoben ? opt.behoben.wer[0] : null,
    resolution_note: opt.behoben?.note ?? null,
    resolution_photo_urls: [],
    created_at: at,
  });
}

mangel({
  nr: 16,
  merke: 'F-16',
  title: 'Behälter korrodiert, Druckanzeige im roten Bereich',
  description: 'Rost am Behälterboden, Zeiger im roten Bereich. Löscher entnommen und gekennzeichnet, Ersatzlöscher aus dem Lager gestellt. Austausch beim Wartungsdienst angefragt.',
  severity: 'red',
  blocked: true,
  reporter: ['S. Wagner', WAGNER],
});
mangel({
  nr: 12,
  merke: 'F-12',
  title: 'Brandschutzzeichen F001 verblasst',
  description: 'Schild über dem Löscher kaum noch lesbar. Langnachleuchtendes Schild ist bestellt.',
  severity: 'green',
  blocked: false,
  reporter: ['M. Becker', BECKER],
});
mangel({
  nr: 29,
  merke: 'F-29',
  title: 'Plombe fehlt',
  description: 'Plombe und Sicherungsstift fehlen — möglicher Teileinsatz. Löscher aus dem Fahrzeug genommen, Ersatz aus der Werkstatt eingelegt.',
  severity: 'amber',
  blocked: true,
  reporter: ['M. Becker', BECKER],
  behoben: { nachMin: 3 * 24 * 60 + 200, wer: ['A. Schneider', INHABER], note: 'Vom Wartungsdienst geprüft, neu verplombt und wieder ins Fahrzeug gelegt.' },
});
mangel({
  nr: 20,
  merke: 'F-20',
  title: 'Zugang durch Paletten verstellt',
  description: 'Löscher hinter abgestellten Paletten kaum erreichbar.',
  severity: 'green',
  blocked: false,
  reporter: ['S. Wagner', WAGNER],
  behoben: { nachMin: 40, wer: ['S. Wagner', WAGNER], note: 'Paletten umgestellt, Bodenmarkierung vor dem Löscher erneuert.' },
});

export const daten: BeispielDaten = {
  app: 'feuerdex',
  nutzer: { id: INHABER, email: 'inhaber@musterbetrieb.example' },
  tabellen: {
    org: B.org,
    membership: B.membership,
    site: siteRows,
    extinguisher: extinguisherRows,
    inspection: inspections,
    defect: defects,
  },
  rpc: {
    list_members: () => B.mitglieder,
  },
};
