// PrüfDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/pruefdex?beispiel, docs/beispiel-zugang.md).
// Ein erfundener Elektrobetrieb „Elektro Muster GmbH“ in Musterstadt prüft ortsveränderliche elektrische Betriebsmittel
// (DGUV Vorschrift 3, DIN VDE 0701-0702 — src/pruefdex/types.ts) bei 8 Kunden: 58 Geräte, Prüfintervalle nach dem
// Richtwert im Geräte-Formular (src/pruefdex/dialogs.tsx: 6 Monate, Baustelle 3, Büro 24, sonst 12).
// Messwerte und Sichtprüfung mit den Schlüsseln der App (types.ts → VISUAL_CHECKS, MEASUREMENTS), Grenzwerte wie
// vorOrt/dguv.ts. Die Frist am Gerät ist die der jüngsten gültigen Prüfung (wie der Server-Trigger), „nicht bestanden“
// = sofort fällig (vorOrt/dguv.ts → nextDueDate).
// PrüfDex hat kein land-Feld und keine Team-Seite im Dashboard (src/pruefdex/PruefdexArea.tsx).
// Alle Personen und Kunden sind erfunden (Initial + häufiger Nachname), E-Mails unter .example, Telefon mit Vorwahl 0123.
// Hersteller bewusst leer: keine Markennamen in Bildern.
//
// Was die Übersicht damit zeigt (src/pruefdex/pages/Overview.tsx):
//   · Geräte 58 · 8 Kunden/Standorte · Überfällig 4 (davon 1 nicht bestanden) · Bald fällig 4
//   · Prüfungen 30 Tage: 29, davon 1 nicht bestanden · keine Karte „Erste Schritte“
// Schema wie PruefDex/supabase/schema.sql + Nachträge.

import { bsp, plus, vor, type BeispielDaten, type Zeile } from './typen.ts';
import { VISUAL_CHECKS } from '../../pruefdex/types.ts';

const ORG = bsp(1, 1);
const INHABER = bsp(2, 1);
const HAHN = bsp(2, 2);
const SEIT = vor(540, 10, 0, false);
const QUALI = 'Elektrofachkraft nach DGUV Vorschrift 3';
const BERGER = `T. Berger (${QUALI})`;
const HAHN_NAME = `N. Hahn (${QUALI})`;

const pad2 = (n: number) => String(n).padStart(2, '0');
const lokal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Prüftag vor `tage` Kalendertagen als YYYY-MM-DD (lokal), auf den Werktag davor gelegt, nie heute oder später */
function tag(tage: number): string {
  return lokal(new Date(vor(tage, 12, 0)));
}

/** Prüftag `monate` Monate und `tage` Tage zurück — für Fristen, die in `x` Tagen ablaufen (Werktag, Bereich bleibt) */
function tagFrist(monate: number, tageBisFaellig: number): string {
  for (const d of [0, -1, 1, -2, 2, -3, 3]) {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    t.setDate(1);
    t.setMonth(t.getMonth() - monate);
    // Monatsende kappen wie addMonths
    const tagImMonat = Math.min(new Date().getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate());
    t.setDate(tagImMonat + tageBisFaellig + d);
    if (t.getDay() !== 0 && t.getDay() !== 6) return lokal(t);
  }
  return tag(monate * 30 - tageBisFaellig);
}

/** Monate auf YYYY-MM-DD addieren, Monatsende gekappt (wie lib/format.ts → addMonthsLocalISO) */
function plusMonate(iso: string, monate: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1 + monate, 1);
  t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return lokal(t);
}

// ---------------------------------------------------------------------------- Betrieb

const org: Zeile[] = [
  {
    id: ORG,
    name: 'Elektro Muster GmbH',
    logo_url: null,
    brand_color: null,
    address: 'Gartenstraße 5, 12345 Musterstadt',
    inspector_name: 'T. Berger',
    inspector_qualification: QUALI,
    is_pro: false,
    created_at: SEIT,
  },
];
const membership: Zeile[] = [
  { id: bsp(9, 900), org_id: ORG, user_id: INHABER, role: 'owner', created_at: SEIT },
  { id: bsp(9, 901), org_id: ORG, user_id: HAHN, role: 'inspector', created_at: vor(402, 8, 15, false) },
];

// ---------------------------------------------------------------------------- Kunden

const KUNDEN: [number, string, string, string][] = [
  [1, 'Bäckerei Muster', 'Hauptstraße 21, 12345 Musterstadt', 'Fr. Weber · 0123 4567-21'],
  [2, 'Gemeinde Musterstadt – Rathaus', 'Marktplatz 1, 12345 Musterstadt', 'Hausmeister · 0123 4567-100'],
  [3, 'Kita Am Musterpark', 'Parkweg 4, 12345 Musterstadt', 'Kita-Leitung · 0123 4567-44'],
  [4, 'Kanzlei Muster & Partner', 'Lindenallee 8, 12345 Musterstadt', 'Sekretariat · 0123 4567-80'],
  [5, 'Autohaus Musterstadt', 'Industriestraße 12, 12345 Musterstadt', 'Werkstattleitung · 0123 4567-50'],
  [6, 'Schreinerei Holzwerk Muster', 'Sägewerkstraße 3, 12345 Musterstadt', 'Hr. Schmitt · 0123 4567-63'],
  [7, 'Hotel Musterhof', 'Am Markt 5, 12345 Musterstadt', 'Rezeption · 0123 4567-70'],
  [8, 'Gemeinde Musterstadt – Bauhof', 'Gewerbering 20, 12345 Musterstadt', 'Bauhofleitung · 0123 4567-120'],
];
const kunde = (n: number) => bsp(3, n);
const customer: Zeile[] = KUNDEN.map(([n, name, address, contact]) => ({
  id: kunde(n),
  org_id: ORG,
  name,
  address,
  contact,
  created_at: plus(SEIT, 60 * 24 * n),
}));

// ---------------------------------------------------------------------------- Geräte

type SK = 'I' | 'II' | 'III';
// [nr, Kunde, Bezeichnung, Art, Schutzklasse, Intervall (Monate), Standort beim Kunden, Leitungslänge (m) oder null]
type G = [number, number, string, string, SK, number, string | null, string | null];
const GERAETE: G[] = [
  [1, 1, 'Teigknetmaschine', 'Küchengerät', 'I', 12, 'Backstube', null],
  [2, 1, 'Brotschneidemaschine', 'Küchengerät', 'I', 12, 'Verkauf', null],
  [3, 1, 'Kaffeemaschine Verkauf', 'Küchengerät', 'I', 12, 'Verkauf', null],
  [4, 1, 'Kühlvitrine', 'Kühlgerät', 'I', 12, 'Verkauf', null],
  [5, 1, 'Verlängerungskabel 5 m', 'Leitung', 'I', 12, 'Backstube', '5'],
  [6, 1, 'Kassensystem Netzteil', 'Bürogerät', 'II', 12, 'Verkauf', null],
  [7, 2, 'PC-Arbeitsplatz Bürgerbüro 1', 'Bürogerät', 'I', 24, 'Bürgerbüro, Platz 1', null],
  [8, 2, 'PC-Arbeitsplatz Bürgerbüro 2', 'Bürogerät', 'I', 24, 'Bürgerbüro, Platz 2', null],
  [9, 2, 'Monitor 27″ Bürgerbüro', 'Bürogerät', 'II', 24, 'Bürgerbüro, Platz 1', null],
  [10, 2, 'Laserdrucker Bürgerbüro', 'Bürogerät', 'I', 24, 'Bürgerbüro', null],
  [11, 2, 'Kaffeevollautomat Teeküche', 'Küchengerät', 'I', 24, 'Teeküche 1. OG', null],
  [12, 2, 'Wasserkocher Teeküche', 'Küchengerät', 'I', 24, 'Teeküche 1. OG', null],
  [13, 2, 'Mehrfachsteckdose 5-fach', 'Leitung', 'I', 24, 'Sitzungssaal', '3'],
  [14, 2, 'Beamer Sitzungssaal', 'Bürogerät', 'I', 24, 'Sitzungssaal', null],
  [15, 3, 'Wasserkocher Küche', 'Küchengerät', 'I', 12, 'Küche', null],
  [16, 3, 'Kühlschrank Küche', 'Kühlgerät', 'I', 12, 'Küche', null],
  [17, 3, 'Musikanlage Gruppenraum', 'Unterhaltung', 'II', 12, 'Gruppe Igel', null],
  [18, 3, 'Staubsauger', 'Reinigung', 'II', 12, 'Abstellraum', null],
  [19, 3, 'Verlängerungskabel 10 m', 'Leitung', 'I', 12, 'Turnraum', '10'],
  [20, 3, 'Bügeleisen', 'Haushalt', 'I', 12, 'Wäscheraum', null],
  [21, 3, 'Laminiergerät', 'Bürogerät', 'II', 12, 'Büro Kita-Leitung', null],
  [22, 4, 'PC-Arbeitsplatz Empfang', 'Bürogerät', 'I', 24, 'Empfang', null],
  [23, 4, 'Multifunktionsdrucker', 'Bürogerät', 'I', 24, 'Flur', null],
  [24, 4, 'Aktenvernichter', 'Bürogerät', 'II', 24, 'Sekretariat', null],
  [25, 4, 'Kühlschrank Personalraum', 'Kühlgerät', 'I', 24, 'Personalraum', null],
  [26, 4, 'Mikrowelle Personalraum', 'Küchengerät', 'I', 24, 'Personalraum', null],
  [27, 5, 'Winkelschleifer 125 mm', 'Handwerkzeug', 'II', 6, 'Werkstatt', null],
  [28, 5, 'Bohrmaschine', 'Handwerkzeug', 'II', 6, 'Werkstatt', null],
  [29, 5, 'Batterieladegerät', 'Ladegerät', 'I', 6, 'Werkstatt', null],
  [30, 5, 'Handleuchte LED', 'Leuchte', 'III', 6, 'Werkstatt', null],
  [31, 5, 'Hochdruckreiniger', 'Reinigung', 'I', 6, 'Waschhalle', '10'],
  [32, 5, 'Heißluftgebläse', 'Handwerkzeug', 'II', 6, 'Werkstatt', null],
  [33, 5, 'Kompressor fahrbar', 'Maschine', 'I', 6, 'Werkstatt', null],
  [34, 5, 'Netzteil Diagnosegerät', 'Ladegerät', 'II', 6, 'Annahme', null],
  [35, 5, 'Staubsauger Werkstatt', 'Reinigung', 'II', 6, 'Werkstatt', null],
  [36, 5, 'Kabeltrommel 25 m', 'Leitung', 'I', 6, 'Waschhalle', '25'],
  [37, 6, 'Tischkreissäge', 'Maschine', 'I', 6, 'Werkstatt', null],
  [38, 6, 'Absauganlage mobil', 'Maschine', 'I', 6, 'Werkstatt', null],
  [39, 6, 'Bandschleifer', 'Handwerkzeug', 'II', 6, 'Werkstatt', null],
  [40, 6, 'Ladegerät Akku 18 V', 'Ladegerät', 'II', 6, 'Werkstatt', null],
  [41, 6, 'Stichsäge', 'Handwerkzeug', 'II', 6, 'Werkstatt', null],
  [42, 6, 'Handkreissäge', 'Handwerkzeug', 'II', 3, 'Baustellen-Container', null],
  [43, 6, 'Kabeltrommel 50 m', 'Leitung', 'I', 3, 'Baustellen-Container', '50'],
  [44, 6, 'Baustrahler LED', 'Leuchte', 'I', 3, 'Baustellen-Container', null],
  [45, 7, 'Kaffeemaschine Frühstücksraum', 'Küchengerät', 'I', 12, 'Frühstücksraum', null],
  [46, 7, 'Toaster Frühstücksraum', 'Küchengerät', 'I', 12, 'Frühstücksraum', null],
  [47, 7, 'Mehrfachsteckdose Rezeption', 'Leitung', 'I', 12, 'Rezeption', '1,5'],
  [48, 7, 'Staubsauger Etage 1', 'Reinigung', 'II', 12, 'Etage 1', null],
  [49, 7, 'Staubsauger Etage 2', 'Reinigung', 'II', 12, 'Etage 2', null],
  [50, 7, 'Bügeleisen Wäscherei', 'Haushalt', 'I', 12, 'Wäscherei', null],
  [51, 7, 'Wasserkocher Zimmer 104', 'Küchengerät', 'I', 12, 'Zimmer 104', null],
  [52, 8, 'Bohrhammer', 'Handwerkzeug', 'II', 6, 'Werkstatt', null],
  [53, 8, 'Heckenschere elektrisch', 'Gartengerät', 'II', 6, 'Gerätehalle', null],
  [54, 8, 'Kettensäge elektrisch', 'Gartengerät', 'II', 6, 'Gerätehalle', null],
  [55, 8, 'Winkelschleifer 230 mm', 'Handwerkzeug', 'II', 6, 'Werkstatt', null],
  [56, 8, 'Kabeltrommel 25 m Bauhof', 'Leitung', 'I', 3, 'Fahrzeug 2', '25'],
  [57, 8, 'Baustrahler Bauhof', 'Leuchte', 'I', 3, 'Fahrzeug 2', null],
  [58, 8, 'Bautrockner', 'Maschine', 'I', 3, 'Gerätehalle', null],
];
const geraet = (nr: number) => bsp(4, nr);
const proNr = new Map(GERAETE.map((g) => [g[0], g]));

// ---------------------------------------------------------------------------- Prüfungen

/** Messwerte je Schutzklasse (Schlüssel wie types.ts → MEASUREMENTS), leicht gestreut, alle im Grenzwert */
function messung(nr: number, fehler?: Record<string, string>): Record<string, string> {
  const [, , , , sk, , , laenge] = proNr.get(nr)!;
  const s = (nr * 37) % 11;
  const m: Record<string, string> = {};
  if (laenge) m.leitungslaenge = laenge;
  if (sk === 'I') {
    const basis = laenge && Number(laenge.replace(',', '.')) > 5 ? 0.18 + Number(laenge.replace(',', '.')) * 0.012 : 0.06;
    m.schutzleiterwiderstand = (basis + s * 0.01).toFixed(2).replace('.', ',');
    m.isolationswiderstand = String(180 + s * 23);
    m.ableitstrom = (0.08 + s * 0.03).toFixed(2).replace('.', ',');
  } else if (sk === 'II') {
    m.isolationswiderstand = String(250 + s * 31);
    m.ableitstrom = (0.02 + s * 0.01).toFixed(2).replace('.', ',');
  } else {
    m.isolationswiderstand = String(40 + s * 7);
  }
  return { ...m, ...(fehler ?? {}) };
}

const inspection: Zeile[] = [];
let pNr = 0;
/** jüngste gültige Prüfung je Gerät → Frist am Gerät (wie der Server-Trigger) */
const frist = new Map<number, { am: string; due: string }>();

function pruefung(opt: {
  nr: number;
  am: string;
  uhr: [number, number];
  wer: string;
  von: string;
  failed?: { visual: string[]; mess?: Record<string, string>; notes: string };
  notes?: string | null;
  storno?: string;
}): void {
  const [, , , , , intervall] = proNr.get(opt.nr)!;
  const [y, m, d] = opt.am.split('-').map(Number);
  const zeit = new Date(y, m - 1, d, opt.uhr[0], opt.uhr[1]).toISOString();
  const result = opt.failed ? 'failed' : 'passed';
  const due = result === 'passed' ? plusMonate(opt.am, intervall) : opt.am;
  pNr++;
  inspection.push({
    id: bsp(5, pNr),
    org_id: ORG,
    device_id: geraet(opt.nr),
    inspected_at: opt.am,
    inspector_name: opt.wer,
    visual_checks: Object.fromEntries(VISUAL_CHECKS.map((c) => [c.key, !(opt.failed?.visual ?? []).includes(c.key)])),
    measurements: messung(opt.nr, opt.failed?.mess),
    result,
    next_due_date: due,
    notes: opt.failed?.notes ?? opt.notes ?? null,
    photo_urls: [],
    performed_by: opt.von,
    canceled: !!opt.storno,
    cancel_reason: opt.storno ?? null,
    canceled_at: opt.storno ? plus(zeit, 8) : null,
    created_at: plus(zeit, 3),
  });
  if (!opt.storno) {
    const alt = frist.get(opt.nr);
    if (!alt || alt.am <= opt.am) frist.set(opt.nr, { am: opt.am, due });
  }
}

/** Prüftermin beim Kunden: Geräte nacheinander, 7 Minuten Abstand */
function termin(
  nrs: number[],
  am: string,
  start: [number, number],
  wer: [string, string],
  extra: Record<number, Partial<Parameters<typeof pruefung>[0]>> = {},
): void {
  nrs.forEach((nr, i) => {
    const min = start[0] * 60 + start[1] + i * 7;
    pruefung({ nr, am, uhr: [Math.floor(min / 60), min % 60], wer: wer[0], von: wer[1], ...(extra[nr] ?? {}) });
  });
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const TB: [string, string] = [BERGER, INHABER];
const NH: [string, string] = [HAHN_NAME, HAHN];

// frühere Prüftermine (Prüfhistorie: jeweils ein Intervall zurück)
termin(range(1, 6), tagFrist(12, -15), [7, 30], TB);
termin(range(7, 14), tagFrist(24, -6), [8, 0], NH);
termin(range(15, 20), tagFrist(12, -1), [13, 30], TB);
termin(range(27, 35), tagFrist(6, -22), [7, 45], NH);
termin(range(45, 47), tagFrist(24, 12), [9, 0], TB);
termin(range(48, 51), tagFrist(19, 0), [10, 30], TB);
termin(range(42, 44), tagFrist(6, -5), [7, 0], NH);

// aktuelle Termine — die jeweils letzte Prüfung je Gerät
// Rathaus (Büro, alle 24 Monate): vor einer Woche
termin(range(7, 14), tag(6), [8, 0], NH);
// Kita: gestern — Verlängerungskabel als letztes, nicht bestanden → sofort fällig (Nachprüfung nach Instandsetzung)
termin([15, 16, 17, 18, 20, 19], tag(1), [13, 30], TB, {
  19: {
    failed: {
      visual: ['leitung', 'knickschutz'],
      mess: { isolationswiderstand: '0,4' },
      notes: 'Mantel am Stecker eingerissen, Isolationswiderstand zu niedrig. Leitung gesperrt und an die Kita-Leitung übergeben, Ersatz empfohlen.',
    },
  },
});
// Bäckerei: vor gut zwei Wochen
termin(range(1, 6), tag(15), [6, 30], TB, { 2: { notes: 'Schutzabdeckung fest, Not-Aus geprüft.' } });
pruefung({ nr: 4, am: tag(15), uhr: [7, 2], wer: BERGER, von: INHABER, storno: 'Doppelt erfasst' });
// Autohaus (Werkstatt, alle 6 Monate): vor drei Wochen — die Kabeltrommel war an dem Tag nicht im Haus
termin(range(27, 35), tag(22), [7, 45], NH);
// Kabeltrommel 25 m: Frist läuft in knapp drei Wochen ab
termin([36], tagFrist(6, 20), [14, 10], NH);
// Schreinerei: Werkstatt vor vier Monaten, Baustellen-Geräte (alle 3 Monate) seit einigen Tagen überfällig
termin(range(37, 41), tagFrist(4, 0), [7, 15], TB);
termin(range(42, 44), tagFrist(3, -5), [7, 0], NH);
// Hotel: Frühstücksraum und Rezeption in knapp zwei Wochen fällig, Etagen und Wäscherei später geprüft
termin(range(45, 47), tagFrist(12, 12), [9, 0], TB);
termin(range(48, 51), tagFrist(7, 0), [10, 30], TB);
// Kanzlei (Büro, alle 24 Monate): vor gut einem Jahr
termin(range(22, 26), tagFrist(14, 0), [8, 15], NH);
// Bauhof: Werkzeug alle 6 Monate, Baustellen-Geräte alle 3 Monate
termin(range(52, 55), tagFrist(2, -10), [7, 0], TB);
termin(range(56, 58), tagFrist(1, -10), [7, 40], TB);

// ---------------------------------------------------------------------------- Geräte-Zeilen (Frist aus der jüngsten Prüfung)

const device: Zeile[] = GERAETE.map(([nr, k, name, art, sk, intervall, ort]) => ({
  id: geraet(nr),
  org_id: ORG,
  customer_id: kunde(k),
  qr_code: `PD-${String(nr + 100).padStart(4, '0')}`,
  name,
  device_type: art,
  manufacturer: null,
  serial_number: null,
  protection_class: sk,
  location_note: ort,
  interval_months: intervall,
  next_due_date: frist.get(nr)?.due ?? null,
  photo_url: null,
  retired: false,
  retired_at: null,
  // das Laminiergerät kam vor 5 Tagen dazu (noch ungeprüft), alle anderen beim Anlegen des Kunden
  created_at: nr === 21 ? vor(5, 16, 10) : plus(SEIT, 60 * 24 * k + nr * 3),
}));

export const daten: BeispielDaten = {
  app: 'pruefdex',
  nutzer: { id: INHABER, email: 'inhaber@elektro-muster.example' },
  tabellen: { org, membership, customer, device, inspection },
};
