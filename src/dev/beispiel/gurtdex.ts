// GurtDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/gurtdex?beispiel, docs/beispiel-zugang.md).
// Ein erfundener Dachdecker-Betrieb „Muster Dachtechnik GmbH“ in Musterstadt (DE): 7 Standorte (Werkhof, Kolonnen,
// Servicewagen, Baustelle; 1 abgeschlossen), 30 PSA-Artikel gegen Absturz (2 ausgesondert). Sicht-/Funktionskontrollen
// etwa monatlich je Kolonne, Sachkundigen-Prüfung nach DGUV Grundsatz 312-906 / EN 365 jährlich (src/gurtdex/types.ts).
// Alle Personen sind erfunden (Initial + häufiger Nachname), E-Mails unter .example, Telefon mit Vorwahl 0123.
// Hersteller und Modell bewusst leer: keine Markennamen in Bildern.
//
// Was die Übersicht damit zeigt (src/gurtdex/pages/Overview.tsx, Fälligkeit src/lib/pruefExport.ts → dueOverview):
//   · Prüfung fällig: 3 (2 überfällig, 1 neu und noch nie geprüft) · + 3 bald fällig · 2 gesperrt · von 28 aktiven Artikeln
//   · gesperrt = 1 Rot-Mangel mit Sperr-Vermerk (Falldämpfer ausgelöst) + 1 ablegereif (Gebrauchsdauer seit dem Ersten
//     dieses Monats überschritten, Abzeichen „Ablegereif“) → Kennzahl „Ablegereif“: 1
//   · Offene Mängel: 3, davon 1× Rot · Prüfungen 30 Tage: 30 · keine Karte „Erste Schritte“ (Betrieb älter als 30 Tage)
// Schema wie GurtDex/supabase/schema.sql.

import { CHECKLIST } from '../../gurtdex/types.ts';
import { betrieb, bsp, fristVor, liste, plus, vor, type BeispielDaten, type Zeile } from './typen.ts';

const ORG = bsp(1, 1);
const INHABER = bsp(2, 1);
const WOLF = bsp(2, 2);
const KRAUSE = bsp(2, 3);
const BRAUN = bsp(2, 4);
const NEUMANN = bsp(2, 5);
const SCHULZ = bsp(2, 6);
const SEIT = vor(436, 8, 40, false);
const CHECK_IDS = CHECKLIST.map((c) => c.id);

/**
 * Wie fristVor, aber die Prüfung liegt auf einem Werktag: weicht um bis zu 3 Tage aus. Die Resttage bleiben dabei im
 * selben Bereich (überfällig / bald fällig / in Ordnung), weil die Wunschwerte weit genug von den Grenzen liegen.
 */
function fristW(jahre: number, tage: number, hh: number, mm: number): string {
  for (const d of [0, -1, 1, -2, 2, -3, 3]) {
    const iso = fristVor(jahre, tage + d, hh, mm);
    const wt = new Date(iso).getDay();
    if (wt !== 0 && wt !== 6) return iso;
  }
  return fristVor(jahre, tage, hh, mm);
}

/** „YYYY-MM“ vor `monate` Monaten und `jahre` Jahren (für Herstellungsdaten relativ zu heute) */
function monatVor(jahre: number, monate: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monate);
  return `${d.getFullYear() - jahre}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const B = betrieb({
  orgId: ORG,
  name: 'Muster Dachtechnik GmbH',
  land: 'DE',
  address: 'Gewerbering 7, 12345 Musterstadt',
  seit: SEIT,
  extra: { is_pro: false, logo_url: null, brand_color: null },
  team: [
    { id: INHABER, email: 'inhaber@muster-dachtechnik.example', role: 'owner', seit: SEIT },
    { id: WOLF, email: 'k.wolf@muster-dachtechnik.example', role: 'admin', seit: vor(431, 10, 15, false) },
    { id: KRAUSE, email: 'm.krause@muster-dachtechnik.example', role: 'worker', seit: vor(428, 7, 5, false) },
    { id: BRAUN, email: 's.braun@muster-dachtechnik.example', role: 'worker', seit: vor(428, 7, 20, false) },
    { id: NEUMANN, email: 't.neumann@muster-dachtechnik.example', role: 'worker', seit: vor(301, 6, 55, false) },
    { id: SCHULZ, email: 'p.schulz@muster-dachtechnik.example', role: 'worker', seit: vor(214, 7, 10, false) },
  ],
});

// Sachkundiger für PSA gegen Absturz (DGUV G 312-906) im eigenen Betrieb
const SACHKUNDIGER = 'K. Wolf';

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

const WERKHOF = 'Gewerbering 7, 12345 Musterstadt';
const STANDORTE: S[] = [
  { nr: 1, name: 'Werkhof – PSA-Lager', address: WERKHOF, notes: 'Prüfplatz, Ersatzausrüstung und Rettungsgeräte.', lat: 50.02117, lng: 9.43862 },
  { nr: 2, name: 'Kolonne Nord', address: WERKHOF, notes: 'Steildach, Kolonnenführer M. Krause.', lat: 50.02131, lng: 9.43905 },
  { nr: 3, name: 'Kolonne Süd', address: WERKHOF, notes: 'Steildach und Fassade, Kolonnenführer S. Braun.', lat: 50.02125, lng: 9.43891 },
  { nr: 4, name: 'Flachdach-Team', address: WERKHOF, notes: 'Abdichtung, Arbeiten am Seil mit Höhensicherungsgerät.', lat: 50.02109, lng: 9.43877 },
  { nr: 5, name: 'Servicewagen Reparaturdienst', address: `${WERKHOF} (Hof)`, notes: 'Ausrüstung bleibt im Fahrzeug.', lat: 50.02098, lng: 9.43841 },
  { nr: 6, name: 'Baustelle Hallenbad', address: 'Am Stadtpark 2, 12345 Musterstadt', notes: 'Dachsanierung, Anschlagpunkte vom Bauherrn.', lat: 50.01482, lng: 9.45237 },
  { nr: 7, name: 'Baustelle Schulzentrum', address: 'Schulweg 10, 12345 Musterstadt', notes: 'Abgeschlossen, Ausrüstung zurück im Werkhof.', lat: 50.02655, lng: 9.44513, active: false },
];

const site = (nr: number) => bsp(3, nr);
const siteRows: Zeile[] = STANDORTE.map((s) => ({
  id: site(s.nr),
  org_id: ORG,
  name: s.name,
  address: s.address,
  lat: s.lat,
  lng: s.lng,
  operator_name: 'Muster Dachtechnik GmbH',
  operator_contact: 'Lager · 0123 4567-30',
  notes: s.notes,
  active: s.active ?? true,
  created_at: plus(SEIT, 30 + s.nr * 11),
}));

// ---------------------------------------------------------------------------- PSA-Artikel

const GURT = 'Auffanggurt (EN 361)';
const VM = 'Verbindungsmittel mit Falldämpfer (EN 354/355)';
const HSG = 'Höhensicherungsgerät (EN 360)';
const MITL = 'Mitlaufendes Auffanggerät (EN 353)';
const KARA = 'Karabiner / Verbindungselement (EN 362)';
const SEIL = 'Kernmantelseil (EN 1891)';
const BAND = 'Bandschlinge / Anschlagmittel (EN 566/795 B)';
const HELM = 'Schutzhelm mit Kinnriemen (EN 397/12492)';
const RETT = 'Rettungs-/Abseilgerät (EN 341/1496)';

/**
 * Ablegereif seit dem Ersten dieses Monats: Herstellung im selben Monat vor 10 Jahren, Gebrauchsdauer 10 Jahre
 * (types.ts → lifespanExpired). Die Sichtkontrollen vor über 30 Tagen lagen damit noch vor der Ablegereife.
 */
const ABLEGEREIF_HERGESTELLT = monatVor(10, 0);

// [nr, Standort, Bezeichnung, Kategorie, Seriennummer, Herstellung, max. Jahre, Träger/in, Notiz, ausgesondert]
type A = [number, number, string, string, string | null, string, string | null, string | null, string | null, boolean?];
const ARTIKEL: A[] = [
  [1, 1, 'HSG 1 – Prüfplatz', HSG, 'H-2105-11', '2021-05', null, null, null],
  [2, 1, 'Rettungsgerät 1', RETT, 'R-2202-04', '2022-02', '10', null, 'Für die Rettung aus dem Gurt, Übung zweimal im Jahr.'],
  [3, 1, 'Kernmantelseil 30 m', SEIL, 'KS-2009-30', '2020-09', '10', null, null],
  [4, 1, 'Bandschlinge 1,2 m (Set 1)', BAND, null, '2019-06', '10', null, '4 Schlingen im Beutel.'],
  [5, 1, 'Ersatzgurt R1', GURT, '25-C-1147', '2025-09', '10', null, 'Ersatz für Gurt 03 (Ablegereife), noch nicht ausgegeben.'],
  [6, 2, 'Gurt 01 – Kolonne Nord', GURT, '21-A-0412', '2021-04', '10', 'M. Krause', null],
  [7, 2, 'Gurt 02 – Kolonne Nord', GURT, '21-A-0413', '2021-04', '10', 'T. Neumann', null],
  [8, 2, 'Gurt 03 – Kolonne Nord', GURT, '16-A-0127', ABLEGEREIF_HERGESTELLT, '10', 'J. Vogel', 'Ersatz liegt im Werkhof (Ersatzgurt R1).'],
  [9, 2, 'VM 01 Falldämpfer 1,8 m', VM, 'VM-2206-01', '2022-06', '10', null, null],
  [10, 2, 'VM 02 Falldämpfer 1,8 m', VM, 'VM-2206-02', '2022-06', '10', null, null],
  [11, 2, 'Helm 01', HELM, null, '2023-01', '8', 'M. Krause', null],
  [12, 2, 'Mitlaufendes Auffanggerät 1', MITL, 'MA-2008-01', '2020-08', '10', null, 'Mit 20-m-Seil für die Kirchturm-Arbeiten.'],
  [13, 3, 'Gurt 04 – Kolonne Süd', GURT, '22-B-0908', '2022-09', '10', 'S. Braun', null],
  [14, 3, 'Gurt 05 – Kolonne Süd', GURT, '22-B-0909', '2022-09', '10', 'L. Hoffmann', null],
  [15, 3, 'Gurt 06 – Kolonne Süd', GURT, '19-B-1102', '2019-11', '10', 'P. Schulz', null],
  [16, 3, 'VM 03 Falldämpfer 2 m', VM, 'VM-2003-03', '2020-03', '10', null, null],
  [17, 3, 'VM 04 Falldämpfer 2 m', VM, 'VM-2305-04', '2023-05', '10', null, null],
  [18, 3, 'Karabiner-Set S1 (4 Stk.)', KARA, null, '2021-10', null, null, 'Schraubkarabiner, Stahl.'],
  [19, 3, 'Helm 02', HELM, null, '2022-04', '8', 'S. Braun', null],
  [20, 4, 'Gurt 07 – Flachdach', GURT, '23-D-0215', '2023-02', '10', 'R. Fischer', null],
  [21, 4, 'Gurt 08 – Flachdach', GURT, '23-D-0216', '2023-02', '10', 'A. Weber', null],
  [22, 4, 'HSG 2 (6 m)', HSG, 'H-2004-06', '2020-04', null, null, 'Hersteller-Revision im Frühjahr.'],
  [23, 4, 'Seil-Set Flachdach 20 m', SEIL, 'KS-1805-20', '2018-05', '10', null, null],
  [24, 5, 'Gurt 09 – Servicewagen', GURT, '20-S-0611', '2020-06', '10', null, 'Für den Reparaturdienst, wechselnde Träger.'],
  [25, 5, 'VM 05 Falldämpfer 1,8 m', VM, 'VM-2006-05', '2020-06', '10', null, null],
  [26, 5, 'Rettungsset Servicewagen', RETT, 'R-2101-02', '2021-01', '10', null, null],
  [27, 6, 'Bandschlinge 2 m (Hallenbad)', BAND, null, '2024-01', '10', null, null],
  [28, 6, 'HSG 3 (10 m)', HSG, 'H-2401-10', '2024-01', null, null, null],
  [29, 7, 'Gurt 10 (alt)', GURT, '12-A-0033', '2012-01', '10', null, 'Ausgesondert: Gebrauchsdauer erreicht.', true],
  [30, 7, 'VM 06 (alt)', VM, 'VM-1404-06', '2014-04', '10', null, 'Ausgesondert: Falldämpfer-Hülle eingerissen.', true],
];

const artikel = (nr: number) => bsp(4, nr);
const proNr = new Map(ARTIKEL.map((a) => [a[0], a]));
const itemRows: Zeile[] = ARTIKEL.map(([nr, s, name, category, serial_no, manufacture_date, max_life_years, wearer_name, notes, retired]) => ({
  id: artikel(nr),
  org_id: ORG,
  site_id: site(s),
  name,
  category,
  manufacturer: null,
  model: null,
  serial_no,
  manufacture_date,
  first_use_date: null,
  max_life_years,
  wearer_name,
  notes,
  photo_url: null,
  retired: retired ?? false,
  // der Ersatzgurt kam vor 9 Tagen dazu, alle anderen beim Einrichten des Betriebs
  created_at: nr === 5 ? vor(9, 10, 20) : plus(SEIT, 80 + nr * 3),
}));

// ---------------------------------------------------------------------------- Prüfungen

/** Punkte, die beim Artikeltyp nicht zutreffen — „n. z.“ wie in der App */
function entfaellt(nr: number): string[] {
  const kat = proNr.get(nr)![3];
  switch (kat) {
    case GURT:
      return ['rope', 'srl'];
    case VM:
      return ['rope', 'srl'];
    case HSG:
      return ['rope', 'adjusters'];
    case MITL:
      return ['webbing', 'srl', 'adjusters', 'plastic'];
    case KARA:
      return ['webbing', 'seams', 'rope', 'absorber', 'srl', 'adjusters', 'plastic'];
    case SEIL:
      return ['webbing', 'connectors', 'absorber', 'srl', 'adjusters', 'plastic'];
    case BAND:
      return ['rope', 'metal', 'connectors', 'absorber', 'srl', 'adjusters', 'plastic'];
    case HELM:
      return ['webbing', 'rope', 'metal', 'connectors', 'absorber', 'srl'];
    case RETT:
      return ['webbing', 'absorber', 'adjusters'];
    default:
      return [];
  }
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
  const a = proNr.get(opt.nr)!;
  const s = STANDORTE[a[1] - 1];
  const id = bsp(5, ++pNr);
  if (opt.merke) prId.set(opt.merke, id);
  const jitter = (pNr % 7) * 0.00003;
  inspections.push({
    id,
    org_id: ORG,
    site_id: site(s.nr),
    item_id: artikel(opt.nr),
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
    canceled_at: opt.storno ? plus(opt.at, 7) : null,
    created_at: plus(opt.at, 2),
  });
}

/** Rundgang: mehrere Artikel nacheinander, `schritt` Minuten Abstand */
function rundgang(
  nrs: number[],
  start: string,
  schritt: number,
  rest: Omit<Parameters<typeof pruefung>[0], 'nr' | 'at'>,
  extra: Record<number, Partial<Parameters<typeof pruefung>[0]>> = {},
): void {
  nrs.forEach((nr, i) => pruefung({ ...rest, nr, at: plus(start, i * schritt), ...(extra[nr] ?? {}) }));
}

const SK = { type: 'expert' as const, wer: SACHKUNDIGER, von: WOLF };

// Sachkundigen-Prüfungen (DGUV G 312-906 / EN 365, jährlich) — die jeweils letzte je Artikel
rundgang([1, 2, 3, 4], fristW(1, 95, 8, 30), 14, SK, { 2: { notes: 'Rettungsübung mit beiden Kolonnen durchgeführt.' } });
rundgang([6, 7, 8, 9, 10, 11, 12], fristW(1, 150, 9, 0), 12, SK, {
  8: { notes: 'Gebrauchsdauer endet in wenigen Monaten — Ersatzgurt bestellt.' },
});
rundgang([13, 14, 15, 16, 17, 18, 19], fristW(1, 240, 8, 45), 12, SK);
// Flachdach-Team: gestern Nachmittag im Werkhof geprüft (zeitgleich lief die Sichtkontrolle auf der Baustelle)
rundgang([20, 21, 22, 23], vor(1, 14, 51), 10, SK, { 22: { notes: 'Einzug und Blockierfunktion geprüft, Revision durch den Hersteller im Frühjahr.' } });
// Servicewagen: Frist läuft in gut zwei Wochen ab
rundgang([24, 25, 26], fristW(1, 19, 14, 10), 11, SK);
// Hallenbad: Frist seit einigen Tagen abgelaufen (Ausrüstung war auf der Baustelle)
rundgang([27, 28], fristW(1, -6, 10, 20), 10, SK);
// ausgesonderte Artikel (Baustelle Schulzentrum)
rundgang([29, 30], fristW(2, 120, 9, 15), 10, SK);
// Vorjahres-Runden (Prüfhistorie)
rundgang([6, 7, 8, 9, 10, 11, 12], fristW(2, 152, 9, 10), 12, SK);
rundgang([13, 14, 15, 16, 18, 19], fristW(2, 244, 8, 40), 12, SK);

// Sicht-/Funktionskontrollen (dokumentiert etwa monatlich) — aktuelle Runde
rundgang([28, 27], vor(1, 15, 12), 6, { type: 'visual', wer: 'T. Neumann', von: NEUMANN }, {
  27: { maengel: ['marking'], merke: 'BS-HB', notes: 'Etikett ausgebleicht, Seriennummer kaum lesbar.' },
});
rundgang([20, 21, 22, 23], vor(3, 7, 25), 5, { type: 'visual', wer: 'P. Schulz', von: SCHULZ });
rundgang([6, 7, 9, 10, 11, 12], vor(6, 7, 10), 5, { type: 'visual', wer: 'M. Krause', von: KRAUSE });
pruefung({ nr: 10, type: 'visual', at: vor(6, 7, 31), wer: 'M. Krause', von: KRAUSE, storno: 'Doppelt erfasst' });
rundgang([13, 14, 15, 16, 17, 18, 19], vor(9, 6, 50), 5, { type: 'visual', wer: 'S. Braun', von: BRAUN }, {
  16: { maengel: ['absorber'], merke: 'VM-03', notes: 'Sturzindikator aufgerissen.' },
  19: { maengel: ['plastic'], merke: 'HELM-02' },
});
rundgang([24, 25, 26], vor(13, 8, 10), 6, { type: 'visual', wer: 'P. Schulz', von: SCHULZ });
rundgang([1, 2, 3, 4], vor(20, 14, 0), 8, { type: 'visual', wer: SACHKUNDIGER, von: WOLF });
// frühere Runden (etwa monatlich)
for (const [nrs, tage, wer, von] of [
  [[6, 7, 8, 9, 10, 11, 12], 36, 'M. Krause', KRAUSE],
  [[13, 14, 15, 16, 17, 18, 19], 39, 'S. Braun', BRAUN],
  [[20, 21, 22, 23], 33, 'P. Schulz', SCHULZ],
  [[24, 25, 26], 44, 'P. Schulz', SCHULZ],
  [[6, 7, 8, 9, 10, 11, 12], 66, 'M. Krause', KRAUSE],
  [[13, 14, 15, 16, 17, 18, 19], 70, 'S. Braun', BRAUN],
  [[20, 21, 22, 23], 63, 'P. Schulz', SCHULZ],
  [[1, 2, 3, 4], 51, SACHKUNDIGER, WOLF],
] as [number[], number, string, string][]) {
  rundgang(nrs, vor(tage, 7, 15), 5, { type: 'visual', wer, von }, tage === 39 ? { 14: { maengel: ['adjusters'], merke: 'GURT-05' } } : {});
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
  const a = proNr.get(opt.nr)!;
  const at = plus(String(insp.started_at), 3);
  defects.push({
    id: bsp(6, defects.length + 1),
    org_id: ORG,
    site_id: site(a[1]),
    inspection_id: insp.id,
    item_id: artikel(opt.nr),
    title: opt.title,
    description: opt.description,
    severity: opt.severity,
    item_blocked: opt.blocked,
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
  merke: 'VM-03',
  title: 'Falldämpfer ausgelöst',
  description:
    'Sturzindikator aufgerissen, Bandfalldämpfer teilweise ausgelöst — nach Abrutschen auf dem Gerüstbelag. Sofort der Benutzung entzogen, gekennzeichnet und im Werkhof verwahrt. Ersatz ist bestellt.',
  severity: 'red',
  blocked: true,
  reporter: ['S. Braun', BRAUN],
});
mangel({
  nr: 27,
  merke: 'BS-HB',
  title: 'Etikett schwer lesbar',
  description: 'Etikett durch UV ausgebleicht, Seriennummer kaum noch lesbar. Bei der Sachkundigen-Prüfung neu kennzeichnen.',
  severity: 'green',
  blocked: false,
  reporter: ['T. Neumann', NEUMANN],
});
mangel({
  nr: 19,
  merke: 'HELM-02',
  title: 'Kinnriemen-Polster fehlt',
  description: 'Polster am Kinnriemen verloren, Riemen und Verschluss in Ordnung. Ersatzteil bestellt.',
  severity: 'green',
  blocked: false,
  reporter: ['S. Braun', BRAUN],
});
mangel({
  nr: 14,
  merke: 'GURT-05',
  title: 'Schnalle am Brustgurt rastet schwer ein',
  description: 'Steckschnalle rastet nur mit Nachdrücken ein. Bis zur Klärung durch den Hersteller nicht benutzen.',
  severity: 'amber',
  blocked: true,
  reporter: ['S. Braun', BRAUN],
  behoben: { nachMin: 6 * 24 * 60 + 130, wer: [SACHKUNDIGER, WOLF], note: 'Vom Hersteller instand gesetzt, Schnalle getauscht. Freigabe liegt der Prüfakte bei.' },
});

export const daten: BeispielDaten = {
  app: 'gurtdex',
  nutzer: { id: INHABER, email: 'inhaber@muster-dachtechnik.example' },
  tabellen: {
    org: B.org,
    membership: B.membership,
    site: siteRows,
    psa_item: itemRows,
    inspection: inspections,
    defect: defects,
  },
  rpc: {
    list_members: () => B.mitglieder,
  },
};
