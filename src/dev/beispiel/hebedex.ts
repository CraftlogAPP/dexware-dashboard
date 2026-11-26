// HebeDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/hebedex?beispiel, docs/beispiel-zugang.md).
// Ein erfundener Stahlbau-Betrieb „Muster Stahlbau GmbH“ in Musterstadt (DE): 6 Standorte (2 Hallen, Lager, Baustelle,
// Lkw-Flotte; 1 abgeschlossen), 35 Anschlag-, Lastaufnahme- und Zurrmittel (2 ausgesondert). Wiederkehrende Prüfung
// durch eine befähigte Person alle 12 Monate, Rissprüfung der Rundstahlketten alle 3 Jahre (src/hebedex/types.ts),
// Messwerte des Ablegereife-Rechners (Kette, Drahtseil, Haken) wie in der App (src/hebedex/rechner.ts).
// Alle Personen sind erfunden (Initial + häufiger Nachname), E-Mails unter .example, Telefon mit Vorwahl 0123.
// Hersteller bewusst leer: keine Markennamen in Bildern.
//
// Was die Übersicht damit zeigt (src/hebedex/pages/Overview.tsx, Fälligkeit src/lib/pruefExport.ts → dueOverview):
//   · Prüfung fällig: 3 (2 überfällig — davon 1 Kette wegen der Rissprüfung —, 1 neu und noch nie geprüft)
//     · + 3 bald fällig · 2 gesperrt · von 33 aktiven Teilen
//   · Gesperrt: 2 (Kette ablegereif nach Rechner, Hebeband mit aufgescheuerter Schlaufe)
//   · Offene Mängel: 3, davon 1× Rot · keine Karte „Erste Schritte“ (Betrieb älter als 30 Tage)
// Schema wie HebeDex/supabase/schema.sql.

import { betrieb, bsp, fristVor, plus, vor, type BeispielDaten, type Zeile } from './typen.ts';
import { checklistFor, type ItemKind } from '../../hebedex/types.ts';

const ORG = bsp(1, 1);
const INHABER = bsp(2, 1);
const LANGE = bsp(2, 2);
const KOCH = bsp(2, 3);
const RICHTER = bsp(2, 4);
const KLEIN = bsp(2, 5);
const SEIT = vor(512, 9, 5, false);

/** Wie fristVor, aber die Prüfung liegt auf einem Werktag (weicht um bis zu 3 Tage aus, Bereich bleibt gleich). */
function fristW(jahre: number, tage: number, hh: number, mm: number): string {
  for (const d of [0, -1, 1, -2, 2, -3, 3]) {
    const iso = fristVor(jahre, tage + d, hh, mm);
    const wt = new Date(iso).getDay();
    if (wt !== 0 && wt !== 6) return iso;
  }
  return fristVor(jahre, tage, hh, mm);
}

const B = betrieb({
  orgId: ORG,
  name: 'Muster Stahlbau GmbH',
  land: 'DE',
  address: 'Hafenstraße 18, 12345 Musterstadt',
  seit: SEIT,
  extra: { is_pro: false, logo_url: null, brand_color: null },
  team: [
    { id: INHABER, email: 'inhaber@muster-stahlbau.example', role: 'owner', seit: SEIT },
    { id: LANGE, email: 'r.lange@muster-stahlbau.example', role: 'admin', seit: vor(505, 11, 0, false) },
    { id: KOCH, email: 'd.koch@muster-stahlbau.example', role: 'worker', seit: vor(498, 6, 45, false) },
    { id: RICHTER, email: 'f.richter@muster-stahlbau.example', role: 'worker', seit: vor(498, 7, 5, false) },
    { id: KLEIN, email: 'e.klein@muster-stahlbau.example', role: 'worker', seit: vor(377, 6, 30, false) },
  ],
});

// befähigte Person für Anschlag- und Zurrmittel im eigenen Betrieb; Rissprüfung durch einen Prüfdienst
const BEFAEHIGT = 'R. Lange';
const PRUEFDIENST = 'J. Hartmann';

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

const HOF = 'Hafenstraße 18, 12345 Musterstadt';
const STANDORTE: S[] = [
  { nr: 1, name: 'Halle 1 – Stahlbau', address: HOF, notes: 'Hallenkran 10 t, Anschlagmittel am Gerätewagen.', lat: 50.00612, lng: 9.47718 },
  { nr: 2, name: 'Halle 2 – Montage', address: HOF, notes: 'Vormontage, Kettenzug am Schwenkkran.', lat: 50.00588, lng: 9.47791 },
  { nr: 3, name: 'Lager Anschlagmittel', address: HOF, notes: 'Prüfplatz und Ersatzteile, Ausgabe nur über die Lagerliste.', lat: 50.00631, lng: 9.47664 },
  { nr: 4, name: 'Baustelle Logistikzentrum', address: 'Industriepark Süd 3, 12345 Musterstadt', notes: 'Hallenmontage mit Mobilkran, Container 2.', lat: 49.99214, lng: 9.48802 },
  { nr: 5, name: 'Lkw-Flotte (Zurrmittel)', address: `${HOF} (Hof)`, notes: 'Zurrgurte und -ketten bleiben auf den Fahrzeugen.', lat: 50.00655, lng: 9.47602 },
  { nr: 6, name: 'Baustelle Fußgängerbrücke Stadtpark', address: 'Am Stadtpark, 12345 Musterstadt', notes: 'Abgeschlossen.', lat: 50.01397, lng: 9.45188, active: false },
];

const site = (nr: number) => bsp(3, nr);
const siteRows: Zeile[] = STANDORTE.map((s) => ({
  id: site(s.nr),
  org_id: ORG,
  name: s.name,
  address: s.address,
  lat: s.lat,
  lng: s.lng,
  operator_name: 'Muster Stahlbau GmbH',
  operator_contact: 'Lager · 0123 4567-40',
  notes: s.notes,
  active: s.active ?? true,
  is_demo: false,
  created_at: plus(SEIT, 25 + s.nr * 9),
}));

// ---------------------------------------------------------------------------- Teile

// [nr, Standort, Bezeichnung, Typ, WLL/LC kg, Nutzlänge m, Nenndicke/Ø mm, Herstelljahr, Farbe, Etikett-Nr., Notiz]
type T = [number, number, string, ItemKind, number | null, string | null, string | null, string, string | null, string | null, string | null];
const TEILE: T[] = [
  [1, 1, 'K-01 Kette 2-strängig', 'chain', 4250, '2', '10', '2021', null, 'K21-0417', null],
  [2, 1, 'K-02 Kette 4-strängig', 'chain', 6700, '2', '10', '2019', null, 'K19-0233', 'Mit Verkürzungshaken.'],
  [3, 1, 'HB-01 Hebeband 2 t', 'webbing_sling', 2000, '3', null, '2024', 'grün', 'HB24-1102', null],
  [4, 1, 'HB-02 Hebeband 2 t', 'webbing_sling', 2000, '4', null, '2024', 'grün', 'HB24-1103', null],
  [5, 1, 'HB-03 Hebeband 3 t', 'webbing_sling', 3000, '4', null, '2023', 'gelb', 'HB23-0815', null],
  [6, 1, 'RS-01 Rundschlinge 5 t', 'round_sling', 5000, '3', null, '2023', 'rot', 'RS23-0310', null],
  [7, 1, 'T-01 Traverse 5 t', 'beam', 5000, null, null, '2018', null, 'TR18-005', 'Eigengewicht 180 kg.'],
  [8, 1, 'H-01 Lasthaken mit Wirbel', 'hook', 3200, null, null, '2022', null, 'LH22-031', null],
  [9, 2, 'K-03 Kette 1-strängig', 'chain', 3150, '1,5', '10', '2022', null, 'K22-0108', null],
  [10, 2, 'HB-04 Hebeband 1 t', 'webbing_sling', 1000, '2', null, '2025', 'violett', 'HB25-0402', null],
  [11, 2, 'HB-05 Hebeband 1 t', 'webbing_sling', 1000, '2', null, '2025', 'violett', 'HB25-0403', null],
  [12, 2, 'SCH-01 Schäkel 4,75 t', 'shackle', 4750, null, null, '2023', null, null, null],
  [13, 2, 'SCH-02 Schäkel 4,75 t', 'shackle', 4750, null, null, '2023', null, null, null],
  [14, 2, 'KZ-01 Kettenzug 1 t', 'hoist', 1000, '3', null, '2021', null, 'KZ21-007', 'Am Schwenkkran, Prüfung zusammen mit dem Kran.'],
  [15, 2, 'HK-01 Hebeklemme 1 t', 'clamp', 1000, null, null, '2020', null, 'HK20-012', 'Nur für Bleche bis 20 mm.'],
  [16, 3, 'S-01 Drahtseil 12 mm', 'wire_rope', 2000, '4', '12', '2022', null, 'DS22-0601', null],
  [17, 3, 'S-02 Drahtseil 16 mm', 'wire_rope', 3500, '6', '16', '2020', null, 'DS20-0219', null],
  [18, 3, 'RS-02 Rundschlinge 2 t', 'round_sling', 2000, '2', null, '2024', 'grün', 'RS24-0715', null],
  [19, 3, 'RS-03 Rundschlinge 3 t', 'round_sling', 3000, '3', null, '2026', 'gelb', 'RS26-0912', 'Neu, noch nicht ausgegeben.'],
  [20, 3, 'SCH-03 Schäkel 8,5 t', 'shackle', 8500, null, null, '2024', null, null, null],
  [21, 4, 'K-04 Kette 2-strängig', 'chain', 4250, '3', '10', '2020', null, 'K20-0921', null],
  [22, 4, 'HB-06 Hebeband 2 t', 'webbing_sling', 2000, '6', null, '2023', 'grün', 'HB23-1207', null],
  [23, 4, 'HB-07 Hebeband 4 t', 'webbing_sling', 4000, '6', null, '2023', 'grau', 'HB23-1208', null],
  [24, 4, 'SCH-04 Schäkel 6,5 t', 'shackle', 6500, null, null, '2022', null, null, null],
  [25, 4, 'T-02 Traverse 10 t', 'beam', 10000, null, null, '2016', null, 'TR16-010', 'Mit dem Mobilkran auf der Baustelle.'],
  [26, 5, 'ZG-01 Zurrgurt 8 m', 'lashing_strap', 2500, '8', null, '2025', null, 'ZG25-01', null],
  [27, 5, 'ZG-02 Zurrgurt 8 m', 'lashing_strap', 2500, '8', null, '2025', null, 'ZG25-02', null],
  [28, 5, 'ZG-03 Zurrgurt 8 m', 'lashing_strap', 2500, '8', null, '2024', null, 'ZG24-07', null],
  [29, 5, 'ZG-04 Zurrgurt 8 m', 'lashing_strap', 2500, '8', null, '2024', null, 'ZG24-08', null],
  [30, 5, 'ZG-05 Zurrgurt 10 m', 'lashing_strap', 2500, '10', null, '2022', null, 'ZG22-11', null],
  [31, 5, 'ZG-06 Zurrgurt 10 m', 'lashing_strap', 2500, '10', null, '2022', null, 'ZG22-12', null],
  [32, 5, 'ZK-01 Zurrkette 8 mm', 'lashing_chain', 4000, '3,5', '8', '2024', null, 'ZK24-01', null],
  [33, 5, 'ZK-02 Zurrkette 8 mm', 'lashing_chain', 4000, '3,5', '8', '2024', null, 'ZK24-02', null],
  [34, 2, 'HB-08 Hebeband 2 t (alt)', 'webbing_sling', 2000, '3', null, '2019', 'grün', 'HB19-0544', null],
  [35, 6, 'RS-09 Rundschlinge 2 t (alt)', 'round_sling', 2000, '2', null, '2015', 'grün', 'RS15-0098', null],
];

const teil = (nr: number) => bsp(4, nr);
const proNr = new Map(TEILE.map((t) => [t[0], t]));
const AUSGESONDERT: Record<number, { tage: number; grund: string }> = {
  34: { tage: 41, grund: 'An der Kante eingeschnitten — Ablegekriterium erreicht.' },
  35: { tage: 203, grund: 'Schutzhülle durchgescheuert, Einlage sichtbar.' },
};
const itemRows: Zeile[] = TEILE.map(([nr, s, name, kind, wll_kg, length_m, nominal_mm, build_year, color, serial_no, notes]) => {
  const aus = AUSGESONDERT[nr];
  return {
    id: teil(nr),
    org_id: ORG,
    site_id: site(s),
    name,
    kind,
    wll_kg,
    length_m,
    nominal_mm,
    rope_kind: kind === 'wire_rope' ? 'strand' : null,
    manufacturer: null,
    serial_no,
    build_year,
    color,
    notes,
    photo_url: null,
    retired: !!aus,
    retired_at: aus ? vor(aus.tage, 15, 20) : null,
    retire_reason: aus?.grund ?? null,
    retire_photo: null,
    is_demo: false,
    // die neue Rundschlinge kam vor 6 Tagen dazu, alle anderen beim Einrichten des Betriebs
    created_at: nr === 19 ? vor(6, 11, 40) : plus(SEIT, 70 + nr * 2),
  };
});

// ---------------------------------------------------------------------------- Prüfungen

/** Checkliste des Teil-Typs (types.ts → checklistFor): alle Punkte ok, einzelne als Mangel */
function liste(nr: number, maengel: string[] = []): Record<string, string> {
  return Object.fromEntries(checklistFor(proNr.get(nr)![3]).map((c) => [c.id, maengel.includes(c.id) ? 'defect' : 'ok']));
}

/** Messwerte des Ablegereife-Rechners bei der wiederkehrenden Prüfung (Text wie eingegeben, wie in der App) */
const MESSUNG: Record<number, Record<string, string>> = {
  1: { nominal: '10', d1: '9,7', d2: '9,8', pitchMeasured: '30,3' },
  2: { nominal: '10', d1: '8,9', d2: '9,0', pitchMeasured: '30,9' },
  8: { openingNew: '38', openingMeasured: '38,6' },
  9: { nominal: '10', d1: '9,8', d2: '9,8', pitchMeasured: '30,2' },
  14: { openingNew: '30', openingMeasured: '30,4' },
  16: { ropeKind: 'strand', b3: '0', b6: '1', b30: '2' },
  17: { ropeKind: 'strand', b3: '0', b6: '0', b30: '1' },
  21: { nominal: '10', d1: '9,6', d2: '9,7', pitchMeasured: '30,5' },
  32: { nominal: '8', d1: '7,9', d2: '7,9', pitchMeasured: '24,2' },
  33: { nominal: '8', d1: '7,8', d2: '7,9', pitchMeasured: '24,3' },
};

const inspections: Zeile[] = [];
let pNr = 0;
const prId = new Map<string, string>();

function pruefung(opt: {
  nr: number;
  type: 'visual' | 'expert' | 'crack';
  at: string;
  wer: string;
  von: string;
  maengel?: string[];
  notes?: string | null;
  /** im Dashboard nachgetragen (ohne GPS), z. B. aus dem Bericht des Prüfdienstes */
  nachgetragen?: boolean;
  storno?: string;
  merke?: string;
}): void {
  const t = proNr.get(opt.nr)!;
  const s = STANDORTE[t[1] - 1];
  const id = bsp(5, ++pNr);
  if (opt.merke) prId.set(opt.merke, id);
  const jitter = (pNr % 7) * 0.00003;
  inspections.push({
    id,
    org_id: ORG,
    site_id: site(s.nr),
    item_id: teil(opt.nr),
    type: opt.type,
    started_at: opt.at,
    lat: opt.nachgetragen ? null : s.lat + jitter,
    lng: opt.nachgetragen ? null : s.lng - jitter,
    gps_accuracy_m: opt.nachgetragen ? null : 4 + (pNr % 9),
    checklist: opt.type === 'crack' ? {} : liste(opt.nr, opt.maengel),
    measurements: opt.type === 'expert' ? (MESSUNG[opt.nr] ?? {}) : {},
    photo_urls: [],
    notes: opt.notes ?? null,
    performed_by: opt.von,
    inspector_name: opt.wer,
    canceled: !!opt.storno,
    cancel_reason: opt.storno ?? null,
    canceled_at: opt.storno ? plus(opt.at, 6) : null,
    created_at: opt.nachgetragen ? plus(opt.at, 3 * 24 * 60 + 25) : plus(opt.at, 2),
  });
}

function rundgang(
  nrs: number[],
  start: string,
  schritt: number,
  rest: Omit<Parameters<typeof pruefung>[0], 'nr' | 'at'>,
  extra: Record<number, Partial<Parameters<typeof pruefung>[0]>> = {},
): void {
  nrs.forEach((nr, i) => pruefung({ ...rest, nr, at: plus(start, i * schritt), ...(extra[nr] ?? {}) }));
}

const WP = { type: 'expert' as const, wer: BEFAEHIGT, von: LANGE };
const RISS = {
  type: 'crack' as const,
  wer: PRUEFDIENST,
  von: INHABER,
  nachgetragen: true,
  notes: 'Magnetpulverprüfung durch den Prüfdienst, Bescheinigung liegt bei. Keine Risse.',
};

// Wiederkehrende Prüfung (befähigte Person, alle 12 Monate) — die jeweils letzte je Teil
// Halle 1: gestern geprüft — die Kette K-02 zuletzt, mit Rechner-Ergebnis „ablegereif“
rundgang([1, 3, 4, 5, 6, 7, 8, 2], vor(1, 13, 0), 11, WP, {
  2: { maengel: ['chainWear'], merke: 'K-02', notes: 'Glieddicke an der Auflagestelle unter dem Grenzwert — gesperrt.' },
  8: { notes: 'Feder der Sicherungsfalle neu, Funktion in Ordnung.' },
});
rundgang([9, 10, 11, 12, 13, 15], fristW(1, 200, 9, 10), 9, WP);
pruefung({ ...WP, nr: 14, at: fristW(1, 27, 13, 40), notes: 'Zusammen mit dem Schwenkkran geprüft.' });
rundgang([16, 17, 18, 20], fristW(1, 300, 8, 20), 12, WP);
rundgang([21, 22, 23, 24], fristW(1, 100, 10, 0), 10, WP);
// Traverse T-02: seit Beginn der Baustelle nicht mehr geprüft — Frist seit 11 Tagen abgelaufen
pruefung({ ...WP, nr: 25, at: fristW(1, -11, 14, 15) });
rundgang([26, 27, 28, 29, 32, 33], fristW(1, 280, 7, 30), 6, WP);
// ZG-05/06: Frist läuft in gut zwei Wochen ab
rundgang([30, 31], fristW(1, 16, 7, 40), 6, WP);
// ausgesonderte Teile: letzte Prüfungen vor der Aussonderung
rundgang([34], fristW(1, 140, 9, 30), 0, WP);
rundgang([35], fristW(2, 160, 10, 5), 0, WP);
// Vorjahres-Runde (Prüfhistorie)
rundgang([1, 2, 3, 4, 5, 6, 7, 8], fristW(1, -12, 8, 10), 11, WP);

// Rissprüfung der Rundstahlketten (alle 3 Jahre, Prüfdienst, im Dashboard nachgetragen)
pruefung({ ...RISS, nr: 1, at: fristW(3, 410, 10, 0) });
pruefung({ ...RISS, nr: 2, at: fristW(3, 520, 10, 30) });
pruefung({ ...RISS, nr: 9, at: fristW(3, 790, 11, 0) });
// K-04: Rissprüfung seit einigen Tagen überfällig (Kette ist auf der Baustelle)
pruefung({ ...RISS, nr: 21, at: fristW(3, -6, 9, 45) });

// Sichtkontrolle vor Gebrauch (dokumentiert zu Einsatzbeginn)
rundgang([21, 23, 24, 25, 22], vor(2, 6, 50), 4, { type: 'visual', wer: 'D. Koch', von: KOCH }, {
  22: { maengel: ['seams', 'eyes'], merke: 'HB-06', notes: 'Schlaufe aufgescheuert, Band aussortiert.' },
});
rundgang([9, 10, 11, 12, 13, 14, 15], vor(7, 7, 5), 4, { type: 'visual', wer: 'F. Richter', von: RICHTER });
rundgang([26, 27, 28, 29, 30, 31, 32, 33], vor(10, 6, 30), 3, { type: 'visual', wer: 'E. Klein', von: KLEIN }, {
  28: { maengel: ['marking'], merke: 'ZG-03' },
});
pruefung({ nr: 30, type: 'visual', at: vor(10, 6, 41), wer: 'E. Klein', von: KLEIN, storno: 'Doppelt erfasst' });
rundgang([21, 22, 23, 24, 25], vor(18, 6, 45), 4, { type: 'visual', wer: 'D. Koch', von: KOCH });
rundgang([1, 2, 3, 4, 5, 6, 7, 8], vor(25, 7, 0), 4, { type: 'visual', wer: 'F. Richter', von: RICHTER }, {
  8: { maengel: ['latch'], merke: 'H-01' },
});
rundgang([21, 22, 23, 24, 25], vor(32, 6, 40), 4, { type: 'visual', wer: 'D. Koch', von: KOCH });
rundgang([26, 27, 28, 29, 30, 31, 32, 33], vor(41, 6, 35), 3, { type: 'visual', wer: 'E. Klein', von: KLEIN });
rundgang([34], vor(41, 14, 50), 0, { type: 'visual', wer: 'F. Richter', von: RICHTER, maengel: ['webbing'] });

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
  const t = proNr.get(opt.nr)!;
  const at = plus(String(insp.started_at), 4);
  defects.push({
    id: bsp(6, defects.length + 1),
    org_id: ORG,
    site_id: site(t[1]),
    inspection_id: insp.id,
    item_id: teil(opt.nr),
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
  nr: 2,
  merke: 'K-02',
  title: 'Ablegereif: Glieddicke −10,5 %',
  description: 'Gemessen d1 8,9 mm und d2 9,0 mm bei Nenndicke 10 mm (Grenze −10 %). Kette gesperrt und gekennzeichnet, Ersatzkette bestellt.',
  severity: 'red',
  blocked: true,
  reporter: [BEFAEHIGT, LANGE],
});
mangel({
  nr: 22,
  merke: 'HB-06',
  title: 'Schlaufe aufgescheuert',
  description: 'Schutzschlauch an der Schlaufe durchgescheuert, tragende Naht angegriffen. Gesperrt, Bewertung durch den Fachbetrieb angefragt.',
  severity: 'amber',
  blocked: true,
  reporter: ['D. Koch', KOCH],
});
mangel({
  nr: 28,
  merke: 'ZG-03',
  title: 'Etikett stark verschmutzt',
  description: 'Zurrkraft noch lesbar. Etikett reinigen, bei der nächsten Prüfung erneut bewerten.',
  severity: 'green',
  blocked: false,
  reporter: ['E. Klein', KLEIN],
});
mangel({
  nr: 8,
  merke: 'H-01',
  title: 'Sicherungsfalle schließt nicht selbsttätig',
  description: 'Feder der Hakensicherung lahm, Falle bleibt offen stehen. Bis zur Instandsetzung gesperrt.',
  severity: 'amber',
  blocked: true,
  reporter: ['F. Richter', RICHTER],
  behoben: { nachMin: 2 * 24 * 60 + 95, wer: [BEFAEHIGT, LANGE], note: 'Feder der Sicherungsfalle getauscht (Originalteil), Funktion geprüft.' },
});

export const daten: BeispielDaten = {
  app: 'hebedex',
  nutzer: { id: INHABER, email: 'inhaber@muster-stahlbau.example' },
  tabellen: {
    org: B.org,
    membership: B.membership,
    site: siteRows,
    lifting_item: itemRows,
    inspection: inspections,
    defect: defects,
  },
  rpc: {
    list_members: () => B.mitglieder,
  },
};
