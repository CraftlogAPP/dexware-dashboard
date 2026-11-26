// LeiterDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/leiterdex?beispiel, docs/beispiel-zugang.md).
// Ein erfundener Handwerksbetrieb „Muster Haustechnik GmbH“ in Musterstadt (DE): 7 Standorte (Werkstatt, Büro, drei
// Servicewagen, Baustelle; 1 abgeschlossene Baustelle), 20 Leitern und Tritte (1 ausgesondert). Sichtkontrolle durch
// die Monteure etwa monatlich, regelmäßige Prüfung durch die befähigte Person des Betriebs alle 12 Monate
// (org.expert_interval_days = 365). Alle Personen erfunden (Initial + häufiger Nachname), E-Mails unter .example,
// Telefon mit Vorwahl 0123. Hersteller bewusst leer: keine Markennamen in Bildern.
//
// Was die Übersicht damit zeigt (src/leiterdex/pages/Overview.tsx, Fälligkeit src/lib/pruefExport.ts → dueOverview):
//   · Prüfung fällig: 2 (1 überfällig, 1 neu und noch nie geprüft) · + 4 bald fällig · 1 gesperrt · von 19 aktiven Leitern
//   · Offene Mängel: 3, davon 1× Rot · Prüfungen 30 Tage: 21 · keine Karte „Erste Schritte“ (Betrieb älter als 30 Tage)
// Schema wie LeiterDex/supabase/schema.sql + Nachträge (Spalten geprüft wie in tests/beispiel-zugang.test.mjs, Teil 3).

import { CHECKLIST } from '../../leiterdex/types.ts';
import { betrieb, bsp, fristVor, liste, plus, vor, type BeispielDaten, type Zeile } from './typen.ts';

const ORG = bsp(1, 14);
const INHABER = bsp(2, 41);
const SCHAEFER = bsp(2, 42);
const KOCH = bsp(2, 43);
const LEHMANN = bsp(2, 44);
const SEIT = vor(405, 8, 40, false);
const CHECK_IDS = CHECKLIST.map((c) => c.id);

const B = betrieb({
  orgId: ORG,
  name: 'Muster Haustechnik GmbH',
  land: 'DE',
  address: 'Industriestraße 4, 12345 Musterstadt',
  seit: SEIT,
  // Frist der regelmäßigen Prüfung je Betrieb (LeiterDex: org.expert_interval_days, Standard 365)
  extra: { is_pro: false, logo_url: null, brand_color: null, expert_interval_days: 365 },
  team: [
    { id: INHABER, email: 'info@muster-haustechnik.example', role: 'owner', seit: SEIT },
    { id: SCHAEFER, email: 't.schaefer@muster-haustechnik.example', role: 'admin', seit: vor(400, 9, 15, false) },
    { id: KOCH, email: 'j.koch@muster-haustechnik.example', role: 'worker', seit: vor(399, 7, 30, false) },
    { id: LEHMANN, email: 'm.lehmann@muster-haustechnik.example', role: 'worker', seit: vor(399, 7, 35, false) },
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
  /** Tage seit dem Anlegen (Standard: beim Einrichten des Betriebs) */
  neu?: number;
}

const HOF = 'Industriestraße 4 (Hof), 12345 Musterstadt';
const STANDORTE: S[] = [
  { nr: 1, name: 'Werkstatt & Lager', address: 'Industriestraße 4, 12345 Musterstadt', notes: 'Leitern hängen an der Leiterwand neben dem Rolltor.', lat: 51.31242, lng: 9.47731 },
  { nr: 2, name: 'Bürogebäude', address: 'Hauptstraße 12, 12345 Musterstadt', notes: null, lat: 51.31688, lng: 9.48925 },
  { nr: 3, name: 'Servicewagen 1', address: HOF, notes: 'Kundendienst Heizung und Sanitär, Schiebeleiter auf dem Dachträger.', lat: 51.31259, lng: 9.47702 },
  { nr: 4, name: 'Servicewagen 2', address: HOF, notes: 'Elektro — Leitern mit isolierenden Holmen.', lat: 51.31262, lng: 9.47711 },
  { nr: 5, name: 'Servicewagen 3', address: HOF, notes: 'Elektro und Baustellenbetreuung.', lat: 51.31266, lng: 9.47719 },
  { nr: 6, name: 'Baustelle Schulzentrum Nord', address: 'Schulstraße 5, 12345 Musterstadt', notes: 'Baucontainer am Nordeingang, Leitern bleiben bis Bauende vor Ort.', lat: 51.32411, lng: 9.48133, neu: 68 },
  { nr: 7, name: 'Baustelle Wohnanlage Lindenhof', address: 'Lindenallee 12, 12345 Musterstadt', notes: 'Bauvorhaben abgeschlossen, Leitern zurück in der Werkstatt.', lat: 51.30957, lng: 9.49402, active: false },
];

const site = (nr: number) => bsp(3, 400 + nr);
const siteRows: Zeile[] = STANDORTE.map((s) => ({
  id: site(s.nr),
  org_id: ORG,
  name: s.name,
  address: s.address,
  lat: s.lat,
  lng: s.lng,
  operator_name: 'Muster Haustechnik GmbH',
  operator_contact: 'Werkstatt · 0123 4567-40',
  notes: s.notes,
  active: s.active ?? true,
  created_at: s.neu ? vor(s.neu, 9, 10) : plus(SEIT, 25 + s.nr * 6),
}));

// ---------------------------------------------------------------------------- Leitern und Tritte

const ANLEGE = 'Anlegeleiter';
const SCHIEBE = 'Schiebeleiter';
const STEH = 'Stehleiter';
const MEHR = 'Mehrzweck-/Gelenkleiter';
const PODEST = 'Podestleiter';
const TRITT = 'Tritt';
const ALU = 'Aluminium';
const HOLZ = 'Holz';
const GFK = 'GFK/Kunststoff';

// [nr, Standort, Bezeichnung, Bauart, Material, Anschaffungsjahr, Länge (m), Sprossen/Stufen, Notiz, ausgesondert]
type L = [number, number, string, string, string, string, string | null, string | null, string | null, boolean?];
const LEITERN: L[] = [
  [1, 1, 'L-01 Anlegeleiter Hof', ANLEGE, ALU, '2018', '4,5', '15', null],
  [2, 1, 'L-02 Stehleiter Werkstatt', STEH, ALU, '2020', '2,0', '7', null],
  [3, 1, 'L-03 Mehrzweckleiter Lager', MEHR, ALU, '2019', '3,4', '12', null],
  [4, 1, 'L-04 Podestleiter Regallager', PODEST, ALU, '2021', '1,7', '6', null],
  [5, 1, 'L-05 Tritt Lager', TRITT, ALU, '2022', null, '3', null],
  [6, 1, 'L-06 Holzstehleiter Malerecke', STEH, HOLZ, '2011', '2,5', '8', null],
  [7, 2, 'L-07 Tritt Büro EG', TRITT, ALU, '2020', null, '2', null],
  [8, 2, 'L-08 Tritt Archiv', TRITT, GFK, '2023', null, '2', null],
  [9, 2, 'L-09 Stehleiter Haustechnik', STEH, ALU, '2017', '1,7', '6', null],
  [10, 3, 'L-10 Schiebeleiter SW 1', SCHIEBE, ALU, '2019', '5,4', '20', null],
  [11, 3, 'L-11 Stehleiter SW 1', STEH, ALU, '2024', '1,5', '5', null],
  [12, 4, 'L-12 Schiebeleiter SW 2', SCHIEBE, GFK, '2020', '5,4', '20', 'Isolierende Holme für Elektroarbeiten.'],
  [13, 4, 'L-13 Stehleiter SW 2', STEH, GFK, '2025', '1,8', '6', null],
  [14, 5, 'L-14 Mehrzweckleiter SW 3', MEHR, ALU, '2021', '3,4', '12', null],
  [15, 5, 'L-15 Stehleiter SW 3', STEH, GFK, '2021', '1,8', '6', null],
  [16, 6, 'L-16 Anlegeleiter Bau 1', ANLEGE, ALU, '2022', '5,0', '17', null],
  [17, 6, 'L-17 Anlegeleiter Bau 2', ANLEGE, ALU, '2022', '5,0', '17', null],
  [18, 6, 'L-18 Podestleiter Bau', PODEST, ALU, '2022', '2,1', '7', null],
  [19, 6, 'L-19 Stehleiter Bau', STEH, ALU, '2026', '2,0', '7', 'Neu beschafft, die Erstprüfung durch die befähigte Person steht aus.'],
  [20, 1, 'L-20 Anlegeleiter (alt)', ANLEGE, ALU, '2009', '4,0', '13', 'Ausgesondert: Holm nach Sturz verbogen, unbrauchbar gemacht.', true],
];

const leiter = (nr: number) => bsp(4, 400 + nr);
const proNr = new Map(LEITERN.map((l) => [l[0], l]));
const ladderRows: Zeile[] = LEITERN.map(([nr, s, name, category, material, purchase_year, length_m, rung_count, notes, retired]) => ({
  id: leiter(nr),
  org_id: ORG,
  site_id: site(s),
  name,
  category,
  material,
  manufacturer: null,
  purchase_year,
  length_m,
  rung_count,
  notes,
  photo_url: null,
  retired: retired ?? false,
  // neue Stehleiter vor 6 Tagen, alle anderen beim Einrichten des Betriebs (die Baustellen-Leitern kamen aus der Werkstatt)
  created_at: nr === 19 ? vor(6, 10, 25) : plus(SEIT, 90 + nr),
}));

// ---------------------------------------------------------------------------- Prüfungen

/** Punkte, die an dieser Bauart nicht vorkommen — wie „n. z.“ in der App */
function entfaellt(nr: number): string[] {
  const [, , , art, material] = proNr.get(nr)!;
  const out: string[] = [];
  if (![STEH, PODEST, MEHR].includes(art)) out.push('spreader');
  if (art !== MEHR) out.push('joints');
  if (art !== SCHIEBE) out.push('hooks');
  if (![TRITT, PODEST].includes(art)) out.push('platform');
  if (![ANLEGE, SCHIEBE, MEHR].includes(art)) out.push('accessories');
  if (material !== HOLZ) out.push('wood');
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
  /** Standort zur Zeit der Prüfung, wenn die Leiter seither umgesetzt wurde */
  ort?: number;
}): void {
  const sNr = opt.ort ?? proNr.get(opt.nr)![1];
  const s = STANDORTE[sNr - 1];
  const id = bsp(5, 4000 + ++pNr);
  if (opt.merke) prId.set(opt.merke, id);
  const jitter = (pNr % 7) * 0.00003;
  inspections.push({
    id,
    org_id: ORG,
    site_id: site(s.nr),
    ladder_id: leiter(opt.nr),
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
    canceled_at: opt.storno ? plus(opt.at, 5) : null,
    created_at: plus(opt.at, 1),
  });
}

type Rest = Omit<Parameters<typeof pruefung>[0], 'nr' | 'at'>;
type Extra = Record<number, Partial<Parameters<typeof pruefung>[0]>>;

/** Rundgang: mehrere Leitern nacheinander, `schritt` Minuten Abstand */
function rundgang(nrs: number[], start: string, schritt: number, rest: Rest, extra: Extra = {}): void {
  nrs.forEach((nr, i) => pruefung({ ...rest, nr, at: plus(start, i * schritt), ...(extra[nr] ?? {}) }));
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// Regelmäßige Prüfung durch die befähigte Person des Betriebs (Werkstattmeister)
const bp: Rest = { type: 'expert', wer: 'T. Schäfer', von: SCHAEFER };
const koch: Rest = { type: 'visual', wer: 'J. Koch', von: KOCH };
const lehmann: Rest = { type: 'visual', wer: 'M. Lehmann', von: LEHMANN };

// Regelmäßige Prüfungen — die jeweils letzte je Leiter
rundgang(range(1, 6), vor(150, 13, 0), 12, bp);
rundgang(range(7, 9), vor(200, 15, 0), 10, bp);
// Servicewagen 1: Schiebeleiter seit 11 Tagen überfällig (Wagen war in der Werkstatt)
pruefung({ ...bp, nr: 10, at: fristVor(1, -11, 7, 20) });
pruefung({ ...bp, nr: 11, at: vor(160, 7, 10), notes: 'Erstprüfung nach der Anschaffung.' });
pruefung({ ...bp, nr: 12, at: fristVor(1, 23, 7, 15) });
pruefung({ ...bp, nr: 13, at: vor(60, 7, 25), notes: 'Erstprüfung nach der Anschaffung.' });
// Servicewagen 3: gestern geprüft
rundgang([14, 15], vor(1, 15, 30), 10, bp, { 14: { notes: 'Gelenke nachgefettet, Arretierungen rasten sauber ein.' } });
// Baustellen-Leitern: vor dem Umsetzen noch in der Werkstatt geprüft, Frist läuft in 8 Tagen ab
rundgang(range(16, 18), fristVor(1, 8, 9, 0), 15, { ...bp, ort: 1 });
pruefung({ ...bp, nr: 20, at: vor(320, 13, 0) });
// L-19 ist neu und noch nie geprüft

// Sichtkontrollen (etwa monatlich) — aktuelle Runde
rundgang(range(16, 19), vor(1, 7, 40), 5, koch);
rundgang(range(1, 6), vor(3, 7, 15), 6, koch, { 6: { maengel: ['stiles', 'wood'], merke: 'L-06' } });
rundgang([10, 11], vor(8, 7, 10), 5, lehmann);
rundgang([12, 13], vor(8, 7, 25), 5, lehmann, { 12: { maengel: ['marking'], merke: 'L-12' } });
rundgang([14, 15], vor(9, 7, 5), 5, lehmann);
rundgang(range(7, 9), vor(15, 16, 0), 6, koch, { 9: { maengel: ['cleanliness'], merke: 'L-09' } });
pruefung({ ...koch, nr: 8, at: vor(15, 16, 20), storno: 'Falsche Leiter ausgewählt' });
// frühere Runden (etwa ein und zwei Monate zurück)
for (const [nrs, tage, rest, extra] of [
  [range(16, 18), 33, koch],
  [range(1, 6), 34, koch, { 1: { maengel: ['feet'], merke: 'L-01' } }],
  [[10, 11], 38, lehmann],
  [[12, 13], 38, lehmann, { 13: { maengel: ['spreader'], merke: 'L-13' } }],
  [[14, 15], 40, lehmann],
  [range(7, 9), 46, koch],
  [range(16, 18), 61, koch],
  [range(1, 6), 64, koch],
  [[10, 11, 12, 13], 68, lehmann],
  [[14, 15], 71, lehmann],
  [range(7, 9), 76, koch],
] as [number[], number, Rest, Extra?][]) {
  rundgang(nrs, vor(tage, 7, 30), 6, rest, extra);
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
  const [, s] = proNr.get(opt.nr)!;
  const at = plus(String(insp.started_at), 3);
  defects.push({
    id: bsp(6, 400 + defects.length + 1),
    org_id: ORG,
    site_id: site(s),
    inspection_id: insp.id,
    ladder_id: leiter(opt.nr),
    title: opt.title,
    description: opt.description,
    severity: opt.severity,
    ladder_blocked: opt.blocked,
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
  nr: 6,
  merke: 'L-06',
  title: 'Holm gerissen',
  description: 'Längsriss im linken Holm unterhalb der dritten Stufe. Leiter mit Sperranhänger gekennzeichnet und aus der Werkstatt genommen, Ersatz ist bestellt.',
  severity: 'red',
  blocked: true,
});
mangel({
  nr: 12,
  merke: 'L-12',
  title: 'Prüfplakette unleserlich',
  description: 'Plakette ausgeblichen, das Prüfdatum ist nicht mehr zu lesen. Neue Plakette bei der nächsten Prüfung.',
  severity: 'green',
  blocked: false,
});
mangel({
  nr: 9,
  merke: 'L-09',
  title: 'Stufen mit Farbresten verschmutzt',
  description: 'Farbreste auf den unteren zwei Stufen. Wird gereinigt.',
  severity: 'green',
  blocked: false,
});
mangel({
  nr: 13,
  merke: 'L-13',
  title: 'Spreizgurt eingerissen',
  description: 'Gurt auf der rechten Seite etwa zur Hälfte eingerissen. Leiter gesperrt und aus dem Wagen genommen.',
  severity: 'amber',
  blocked: true,
  behoben: { nachMin: 26 * 60, wer: ['T. Schäfer', SCHAEFER], note: 'Spreizgurt gegen Originalteil getauscht, Leiter wieder freigegeben.' },
});
mangel({
  nr: 1,
  merke: 'L-01',
  title: 'Fußkappe fehlt',
  description: 'Fußkappe am rechten Holm fehlt, Leiter rutscht auf glattem Boden.',
  severity: 'amber',
  blocked: true,
  behoben: { nachMin: 3 * 60, wer: ['T. Schäfer', SCHAEFER], note: 'Beide Fußkappen gegen Originalteile getauscht.' },
});

export const daten: BeispielDaten = {
  app: 'leiterdex',
  nutzer: { id: INHABER, email: 'info@muster-haustechnik.example' },
  tabellen: {
    org: B.org,
    membership: B.membership,
    site: siteRows,
    ladder: ladderRows,
    inspection: inspections,
    defect: defects,
  },
  rpc: {
    list_members: () => B.mitglieder,
  },
};
