// ToreDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/toredex?beispiel, docs/beispiel-zugang.md).
// Eine erfundene Hausverwaltung „Muster Immobilien GmbH“ in Musterstadt (DE): 7 Objekte (1 verkauft), 27 Tore und
// Türen (1 stillgelegt). Sichtkontrolle durch Hausmeister und Haustechnik etwa monatlich, Sachkundigen-Prüfung nach
// ASR A1.7 jährlich durch einen externen Sachkundigen (die Haustechnik erfasst sie mit dem eigenen Konto).
// Alle Personen sind erfunden (Initial + häufiger Nachname), E-Mails unter .example, Telefon mit Vorwahl 0123.
// Hersteller und Seriennummern bewusst leer: keine Markennamen in Bildern.
//
// Was die Übersicht damit zeigt (src/toredex/pages/Overview.tsx, Fälligkeit src/lib/pruefExport.ts → dueOverview):
//   · Prüfung fällig: 3 (2 überfällig, 1 neu und noch nie geprüft) · + 4 bald fällig · 1 gesperrt · von 26 aktiven Toren
//   · Offene Mängel: 3, davon 1× Rot · Prüfungen 30 Tage: 28 · keine Karte „Erste Schritte“ (Betrieb älter als 30 Tage)
// Schema wie ToreDex/supabase/schema.sql + Nachträge (Spalten geprüft wie in tests/beispiel-zugang.test.mjs, Teil 3).

import { CHECKLIST } from '../../toredex/types.ts';
import { betrieb, bsp, fristVor, liste, plus, vor, type BeispielDaten, type Zeile } from './typen.ts';

const ORG = bsp(1, 13);
const INHABER = bsp(2, 31);
const KLEIN = bsp(2, 32);
const RICHTER = bsp(2, 33);
const SEIT = vor(398, 9, 0, false);
const CHECK_IDS = CHECKLIST.map((c) => c.id);
// externer Sachkundiger des Torservice (kein Mitglied — die Haustechnik erfasst die Prüfung mit ihrem Konto)
const SACHKUNDIGER = 'P. Wolf';

const B = betrieb({
  orgId: ORG,
  name: 'Muster Immobilien GmbH',
  land: 'DE',
  address: 'Am Markt 3, 12345 Musterstadt',
  seit: SEIT,
  extra: { is_pro: false, logo_url: null, brand_color: null },
  team: [
    { id: INHABER, email: 'verwaltung@muster-immobilien.example', role: 'owner', seit: SEIT },
    { id: KLEIN, email: 'b.klein@muster-immobilien.example', role: 'admin', seit: vor(391, 10, 20, false) },
    { id: RICHTER, email: 'k.richter@muster-immobilien.example', role: 'worker', seit: vor(390, 7, 45, false) },
  ],
});

// ---------------------------------------------------------------------------- Objekte

interface O {
  nr: number;
  name: string;
  address: string;
  notes: string | null;
  lat: number;
  lng: number;
  active?: boolean;
}

const OBJEKTE: O[] = [
  { nr: 1, name: 'Wohnpark Lindenhof – Tiefgarage', address: 'Lindenallee 12, 12345 Musterstadt', notes: 'Torsteuerung im Technikraum UG, Schlüssel beim Hausmeister.', lat: 49.87214, lng: 8.65127 },
  { nr: 2, name: 'Logistikhalle Hafenweg', address: 'Hafenweg 3, 12345 Musterstadt', notes: 'Vier Rampentore an der Ostseite, Mieter arbeitet im Zweischichtbetrieb.', lat: 49.86533, lng: 8.67402 },
  { nr: 3, name: 'Bürohaus Am Markt', address: 'Am Markt 3, 12345 Musterstadt', notes: null, lat: 49.87511, lng: 8.65588 },
  { nr: 4, name: 'Gewerbepark Industriestraße', address: 'Industriestraße 20, 12345 Musterstadt', notes: 'Halle A und B vermietet, Einfahrt gemeinsam.', lat: 49.86902, lng: 8.66951 },
  { nr: 5, name: 'Seniorenwohnanlage Rosenstraße', address: 'Rosenstraße 31, 12345 Musterstadt', notes: 'Automatiktür im Haupteingang barrierefrei, Öffnungszeit verlängert.', lat: 49.87833, lng: 8.64912 },
  { nr: 6, name: 'Ärztehaus Bahnhofstraße', address: 'Bahnhofstraße 8, 12345 Musterstadt', notes: null, lat: 49.87395, lng: 8.66214 },
  { nr: 7, name: 'Lagerhalle Gartenweg', address: 'Gartenweg 30, 12345 Musterstadt', notes: 'Ende 2025 verkauft.', lat: 49.88041, lng: 8.64433, active: false },
];

const site = (nr: number) => bsp(3, 300 + nr);
const siteRows: Zeile[] = OBJEKTE.map((o) => ({
  id: site(o.nr),
  org_id: ORG,
  name: o.name,
  address: o.address,
  lat: o.lat,
  lng: o.lng,
  operator_name: 'Muster Immobilien GmbH',
  operator_contact: 'Haustechnik · 0123 4567-20',
  notes: o.notes,
  active: o.active ?? true,
  created_at: plus(SEIT, 30 + o.nr * 9),
}));

// ---------------------------------------------------------------------------- Tore und Türen

const SECT = 'Sectionaltor';
const ROLL = 'Rolltor / Rollgitter';
const SCHIEBE = 'Schiebetor';
const DREH = 'Drehflügeltor';
const FALT = 'Falttor';
const KIPP = 'Kipptor';
const SCHNELL = 'Schnelllauftor';
const SCHRANKE = 'Schranke';
const AUTO = 'Karusselltür / Automatiktür';
const KRAFT = 'Kraftbetätigt';
const HAND = 'Handbetätigt';

// [nr, Objekt, Bezeichnung, Torart, Antrieb, Baujahr, Maße B × H, Schlupftür, Notiz, stillgelegt]
type T = [number, number, string, string, string, string, string | null, boolean, string | null, boolean?];
const TORE: T[] = [
  [1, 1, 'T-01 Einfahrt Tiefgarage', ROLL, KRAFT, '2012', '5,0 × 2,3', false, null],
  [2, 1, 'T-02 Ausfahrt Tiefgarage', ROLL, KRAFT, '2012', '5,0 × 2,3', false, null],
  [3, 1, 'T-03 Schranke Besucherparkplatz', SCHRANKE, KRAFT, '2018', null, false, null],
  [4, 1, 'T-04 Müllraum', DREH, HAND, '2012', '2,5 × 2,0', false, null],
  [5, 2, 'T-05 Rampentor 1', SECT, KRAFT, '2016', '3,0 × 3,2', false, null],
  [6, 2, 'T-06 Rampentor 2', SECT, KRAFT, '2016', '3,0 × 3,2', false, null],
  [7, 2, 'T-07 Rampentor 3', SECT, KRAFT, '2016', '3,0 × 3,2', false, null],
  [8, 2, 'T-08 Rampentor 4', SECT, KRAFT, '2016', '3,0 × 3,2', false, null],
  [9, 2, 'T-09 Schnelllauftor Kommissionierung', SCHNELL, KRAFT, '2026', '3,5 × 4,0', false, 'Neu eingebaut, Prüfung vor der ersten Inbetriebnahme ist beim Torservice angefragt.'],
  [10, 2, 'T-10 Hoftor Einfahrt', SCHIEBE, KRAFT, '2016', '8,0 × 2,0', false, null],
  [11, 3, 'T-11 Haupteingang', AUTO, KRAFT, '2019', '2,0 × 2,2', false, null],
  [12, 3, 'T-12 Tiefgarage', ROLL, KRAFT, '2009', '4,5 × 2,2', false, null],
  [13, 3, 'T-13 Anlieferung Hof', SECT, KRAFT, '2009', '3,0 × 3,0', false, null],
  [14, 4, 'T-14 Einfahrt Gewerbepark', SCHIEBE, KRAFT, '2014', '10,0 × 2,0', false, null],
  [15, 4, 'T-15 Halle A Tor 1', SECT, KRAFT, '2014', '4,0 × 4,5', true, null],
  [16, 4, 'T-16 Halle A Tor 2', SECT, KRAFT, '2014', '4,0 × 4,5', true, null],
  [17, 4, 'T-17 Halle B Falttor', FALT, KRAFT, '2008', '5,0 × 4,5', false, null],
  [18, 4, 'T-18 Halle B Rolltor', ROLL, KRAFT, '2008', '4,0 × 4,0', false, null],
  [19, 4, 'T-19 Schranke Mitarbeiterparkplatz', SCHRANKE, KRAFT, '2020', null, false, null],
  [20, 5, 'T-20 Haupteingang', AUTO, KRAFT, '2017', '2,2 × 2,2', false, null],
  [21, 5, 'T-21 Gartentor', DREH, HAND, '2017', '1,5 × 1,2', false, null],
  [22, 5, 'T-22 Garage Hausmeister', KIPP, HAND, '2017', '2,5 × 2,1', false, null],
  [23, 5, 'T-23 Tiefgarage', SECT, KRAFT, '2017', '5,0 × 2,2', false, null],
  [24, 6, 'T-24 Haupteingang', AUTO, KRAFT, '2021', '2,0 × 2,2', false, null],
  [25, 6, 'T-25 Tiefgarage', ROLL, KRAFT, '2021', '5,5 × 2,3', false, null],
  [26, 6, 'T-26 Schranke Patientenparkplatz', SCHRANKE, KRAFT, '2021', null, false, null],
  [27, 7, 'T-27 Hallentor', SECT, KRAFT, '2004', '4,0 × 4,0', false, 'Mit dem Verkauf der Halle übergeben.', true],
];

const tor = (nr: number) => bsp(4, 300 + nr);
const proNr = new Map(TORE.map((t) => [t[0], t]));
const gateRows: Zeile[] = TORE.map(([nr, o, name, category, drive_type, build_year, dimensions, , notes, retired]) => ({
  id: tor(nr),
  org_id: ORG,
  site_id: site(o),
  name,
  category,
  drive_type,
  manufacturer: null,
  build_year,
  dimensions,
  serial_no: null,
  notes,
  photo_url: null,
  retired: retired ?? false,
  // das Schnelllauftor kam vor 9 Tagen dazu, alle anderen beim Einrichten des Betriebs
  created_at: nr === 9 ? vor(9, 10, 40) : plus(SEIT, 120 + nr),
}));

// ---------------------------------------------------------------------------- Prüfungen

/** Punkte, die am Tor nicht vorkommen — wie „n. z.“ in der App */
function entfaellt(nr: number): string[] {
  const [, , , art, antrieb, , , schlupf] = proNr.get(nr)!;
  const out: string[] = [];
  if (!schlupf) out.push('wicket_door');
  // Absturzsicherung nur bei senkrecht bewegten Torblättern
  if (![SECT, ROLL, SCHNELL, KIPP].includes(art)) out.push('fall_protection');
  // ohne Antrieb: keine Schließkante, keine Lichtschranke, keine Kraftbegrenzung, keine Elektrik
  if (antrieb === HAND) out.push('closing_edge', 'photocell', 'force_limit', 'electrical');
  return out;
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
  storno?: string;
  merke?: string;
}): void {
  const [, o] = proNr.get(opt.nr)!;
  const s = OBJEKTE[o - 1];
  const id = bsp(5, 3000 + ++pNr);
  if (opt.merke) prId.set(opt.merke, id);
  const jitter = (pNr % 7) * 0.00003;
  inspections.push({
    id,
    org_id: ORG,
    site_id: site(s.nr),
    gate_id: tor(opt.nr),
    type: opt.type,
    started_at: opt.at,
    lat: s.lat + jitter,
    lng: s.lng - jitter,
    gps_accuracy_m: 4 + (pNr % 9),
    checklist: liste(CHECK_IDS, opt.maengel ?? [], entfaellt(opt.nr)),
    photo_urls: [],
    notes: opt.notes ?? null,
    performed_by: opt.von,
    inspector_name: opt.wer,
    canceled: !!opt.storno,
    cancel_reason: opt.storno ?? null,
    canceled_at: opt.storno ? plus(opt.at, 6) : null,
    created_at: plus(opt.at, 2),
  });
}

type Rest = Omit<Parameters<typeof pruefung>[0], 'nr' | 'at'>;

/** Rundgang: mehrere Tore nacheinander, `schritt` Minuten Abstand */
function rundgang(nrs: number[], start: string, schritt: number, rest: Rest, extra: Record<number, Partial<Parameters<typeof pruefung>[0]>> = {}): void {
  nrs.forEach((nr, i) => pruefung({ ...rest, nr, at: plus(start, i * schritt), ...(extra[nr] ?? {}) }));
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const sk: Rest = { type: 'expert', wer: SACHKUNDIGER, von: KLEIN };

// Sachkundigen-Prüfungen (ASR A1.7, jährlich) — die jeweils letzte je Tor
rundgang(range(1, 4), vor(130, 9, 0), 25, sk);
// Rampentor 1 und 2: Frist läuft in 19 Tagen ab, Termin mit dem Torservice steht noch aus
rundgang([5, 6], fristVor(1, 19, 8, 30), 20, sk);
// Rampentor 3 und 4 nach dem Federtausch erneut geprüft (wesentliche Instandsetzung)
rundgang([7, 8], vor(95, 10, 15), 25, sk, {
  7: { notes: 'Nach dem Tausch beider Torsionsfedern erneut geprüft.' },
  8: { notes: 'Nach dem Tausch beider Torsionsfedern erneut geprüft.' },
});
pruefung({ ...sk, nr: 10, at: fristVor(1, 24, 9, 40) });
pruefung({ ...sk, nr: 11, at: fristVor(1, 28, 11, 0) });
// Bürohaus: Tiefgarage und Anlieferung seit 6 Tagen überfällig
rundgang([12, 13], fristVor(1, -6, 9, 0), 30, sk);
rundgang(range(14, 19), vor(160, 8, 0), 25, sk, {
  17: { notes: 'Falttor: Laufwagen nachgestellt, Endlagen neu eingelernt.' },
});
rundgang(range(20, 23), vor(48, 9, 30), 25, sk);
// Ärztehaus: gestern geprüft
rundgang(range(24, 26), vor(1, 13, 10), 30, sk, {
  24: { notes: 'Sensoren und Not-Aus geprüft, Prüfplakette erneuert.' },
});
pruefung({ ...sk, nr: 27, at: vor(300, 10, 0) });
// T-09 (Schnelllauftor) ist neu und noch nie geprüft

// Sichtkontrollen (etwa monatlich) — aktuelle Runde
const klein: Rest = { type: 'visual', wer: 'B. Klein', von: KLEIN };
const richter: Rest = { type: 'visual', wer: 'K. Richter', von: RICHTER };
rundgang(range(20, 22), vor(1, 7, 50), 8, klein);
pruefung({ ...klein, nr: 23, at: vor(1, 15, 40), maengel: ['marking'], merke: 'T-23' });
rundgang(range(1, 4), vor(6, 7, 30), 10, richter, { 2: { maengel: ['photocell'], merke: 'T-02' } });
rundgang(range(14, 19), vor(6, 13, 0), 10, richter, { 15: { maengel: ['springs_cables', 'body_function'], merke: 'T-15' } });
rundgang([5, 6, 7, 8, 10], vor(13, 8, 0), 8, richter);
pruefung({ ...richter, nr: 6, at: vor(13, 8, 50), storno: 'Doppelt erfasst' });
rundgang(range(11, 13), vor(20, 9, 0), 10, klein);
rundgang(range(24, 26), vor(27, 10, 0), 10, klein, { 26: { maengel: ['marking'], merke: 'T-26' } });
// frühere Runden (etwa ein und zwei Monate zurück)
for (const [nrs, tage, rest, extra] of [
  [range(20, 23), 33, klein],
  [range(1, 4), 36, richter],
  [range(14, 19), 36, richter, { 14: { maengel: ['guides_rollers'], merke: 'T-14' } }],
  [[5, 6, 7, 8, 10], 43, richter],
  [range(11, 13), 50, klein],
  [range(24, 26), 57, klein],
  [range(20, 23), 64, klein],
  [range(1, 4), 66, richter],
  [range(14, 19), 67, richter],
  [[5, 6, 7, 8, 10], 73, richter],
  [range(11, 13), 80, klein],
  [range(24, 26), 87, klein],
] as [number[], number, Rest, Record<number, Partial<Parameters<typeof pruefung>[0]>>?][]) {
  rundgang(nrs, vor(tage, 9, 0), 10, rest, extra);
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
  behoben?: { nachMin: number; wer: [string, string]; note: string };
}): void {
  const insp = inspections.find((i) => i.id === prId.get(opt.merke))!;
  const [, o] = proNr.get(opt.nr)!;
  const at = plus(String(insp.started_at), 3);
  defects.push({
    id: bsp(6, 300 + defects.length + 1),
    org_id: ORG,
    site_id: site(o),
    inspection_id: insp.id,
    gate_id: tor(opt.nr),
    title: opt.title,
    description: opt.description,
    severity: opt.severity,
    gate_blocked: opt.blocked,
    photo_urls: [],
    status: opt.behoben ? 'resolved' : 'open',
    reported_by: insp.performed_by,
    reporter_name: insp.inspector_name,
    resolved_at: opt.behoben ? plus(at, opt.behoben.nachMin) : null,
    resolved_by: opt.behoben ? opt.behoben.wer[1] : null,
    resolver_name: opt.behoben ? opt.behoben.wer[0] : null,
    resolution_note: opt.behoben?.note ?? null,
    resolution_photo_urls: [],
    created_at: at,
  });
}

mangel({
  nr: 15,
  merke: 'T-15',
  title: 'Torsionsfeder gebrochen',
  description: 'Feder rechts gebrochen, Torblatt hängt schief. Tor stillgelegt, Antrieb abgeschaltet und mit Schild gekennzeichnet, Mieter informiert. Torservice ist beauftragt.',
  severity: 'red',
  blocked: true,
});
mangel({
  nr: 2,
  merke: 'T-02',
  title: 'Lichtschranke reagiert verzögert',
  description: 'Tor stoppt erst nach etwa einer Sekunde. Optiken gereinigt, keine Besserung. Fachbetrieb beauftragt, bis dahin Ausfahrt nur unter Sicht.',
  severity: 'amber',
  blocked: false,
});
mangel({
  nr: 23,
  merke: 'T-23',
  title: 'Warnaufkleber am Torblatt verblasst',
  description: 'Warnhinweis „Tor schließt automatisch“ kaum noch lesbar. Neue Aufkleber sind bestellt.',
  severity: 'green',
  blocked: false,
});
mangel({
  nr: 14,
  merke: 'T-14',
  title: 'Laufrolle ausgeschlagen',
  description: 'Schiebetor läuft unruhig, untere Laufrolle mit deutlichem Spiel. Tor bis zur Reparatur offen gestellt.',
  severity: 'amber',
  blocked: true,
  behoben: { nachMin: 2 * 24 * 60 + 180, wer: ['B. Klein', KLEIN], note: 'Laufrolle vom Torservice getauscht, Probelauf ohne Befund.' },
});
mangel({
  nr: 26,
  merke: 'T-26',
  title: 'Reflexstreifen am Schrankenbaum beschädigt',
  description: 'Zwei Streifen abgerissen, Schrankenbaum bei Dunkelheit schlecht zu sehen.',
  severity: 'green',
  blocked: false,
  behoben: { nachMin: 3 * 24 * 60, wer: ['B. Klein', KLEIN], note: 'Neue Reflexstreifen aufgeklebt.' },
});

export const daten: BeispielDaten = {
  app: 'toredex',
  nutzer: { id: INHABER, email: 'verwaltung@muster-immobilien.example' },
  tabellen: {
    org: B.org,
    membership: B.membership,
    site: siteRows,
    gate: gateRows,
    inspection: inspections,
    defect: defects,
  },
  rpc: {
    list_members: () => B.mitglieder,
  },
};
