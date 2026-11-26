// RegalDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/regaldex?beispiel, docs/beispiel-zugang.md).
// Ein erfundener Logistikbetrieb „Musterlogistik GmbH“ in Musterstadt (DE): 9 Lager (1 aufgegeben), 44 Regalzeilen
// (3 abgebaut). Wöchentliche Sichtkontrolle durch die beauftragten Personen des Lagers, Experteninspektion nach
// DIN EN 15635 jährlich durch eine externe fachkundige Person (das Lager erfasst sie mit dem eigenen Konto).
// Orts-Modus wie die App: Die Inspektion hängt am ganzen Lager, Schäden nennen die Regalzeile.
// Alle Personen erfunden (Initial + häufiger Nachname), E-Mails unter .example, Telefon mit Vorwahl 0123.
// Hersteller bewusst leer: keine Markennamen in Bildern.
//
// Was die Übersicht damit zeigt (src/regaldex/pages/Overview.tsx, Fälligkeit src/lib/pruefExport.ts → dueOverview):
//   · Inspektion fällig: 2 (1 überfällig, 1 neues Lager ohne Experteninspektion) · + 2 bald fällig · 1 gesperrt
//     · von 8 aktiven Lagern
//   · Offene Schäden: 3, davon 1× Rot · Inspektionen 7 Tage: 9 · keine Karte „Erste Schritte“
// Schema wie RegalDex/supabase/schema.sql + Nachträge (Spalten geprüft wie in tests/beispiel-zugang.test.mjs, Teil 3).

import { CHECKLIST } from '../../regaldex/types.ts';
import { betrieb, bsp, fristVor, liste, plus, vor, type BeispielDaten, type Zeile } from './typen.ts';

const ORG = bsp(1, 11);
const INHABER = bsp(2, 51);
const WEBER = bsp(2, 52);
const SCHULZ = bsp(2, 53);
const SEIT = vor(436, 8, 0, false);
const CHECK_IDS = CHECKLIST.map((c) => c.id);
// externe fachkundige Person für die Experteninspektion (kein Mitglied — das Lager erfasst sie mit dem eigenen Konto)
const FACHKUNDIG = 'R. Vogel';

const B = betrieb({
  orgId: ORG,
  name: 'Musterlogistik GmbH',
  land: 'DE',
  address: 'Logistikring 8, 12345 Musterstadt',
  seit: SEIT,
  extra: { is_pro: false, logo_url: null, brand_color: null },
  team: [
    { id: INHABER, email: 'info@musterlogistik.example', role: 'owner', seit: SEIT },
    { id: WEBER, email: 'd.weber@musterlogistik.example', role: 'admin', seit: vor(431, 9, 40, false) },
    { id: SCHULZ, email: 'm.schulz@musterlogistik.example', role: 'worker', seit: vor(430, 6, 55, false) },
  ],
});

// ---------------------------------------------------------------------------- Lager

interface W {
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

const LAGER: W[] = [
  { nr: 1, name: 'Halle 1 – Palettenlager', address: 'Logistikring 8, 12345 Musterstadt', notes: null, lat: 52.38214, lng: 9.80127 },
  { nr: 2, name: 'Halle 2 – Kommissionierung', address: 'Logistikring 8, 12345 Musterstadt', notes: 'Zweischichtbetrieb, Schmalgangstapler.', lat: 52.38251, lng: 9.80233 },
  { nr: 3, name: 'Halle 3 – Hochregallager', address: 'Logistikring 10, 12345 Musterstadt', notes: 'Regalhöhe 12 m, Gänge 01 bis 06.', lat: 52.38302, lng: 9.80411 },
  { nr: 4, name: 'Tiefkühllager', address: 'Logistikring 10, 12345 Musterstadt', notes: 'Minus 24 °C — Korrosion und Frostschäden besonders beachten.', lat: 52.38327, lng: 9.80466 },
  { nr: 5, name: 'Kragarmlager Hof', address: 'Logistikring 8 (Hof), 12345 Musterstadt', notes: 'Profile und Rohre, überdacht.', lat: 52.38188, lng: 9.80052 },
  { nr: 6, name: 'Ersatzteillager Werkstatt', address: 'Logistikring 8, 12345 Musterstadt', notes: null, lat: 52.38233, lng: 9.80081 },
  { nr: 7, name: 'Außenlager Hafen', address: 'Hafenweg 3, 12345 Musterstadt', notes: 'Angemietete Halle, Schlüssel beim Pförtner.', lat: 52.37624, lng: 9.81955 },
  { nr: 8, name: 'Halle 4 – Erweiterung', address: 'Logistikring 12, 12345 Musterstadt', notes: 'Neu aufgestellt, Abnahme der Regalanlage durch die fachkundige Person ist angefragt.', lat: 52.38355, lng: 9.80602, neu: 9 },
  { nr: 9, name: 'Zwischenlager Bahnhofstraße', address: 'Bahnhofstraße 21, 12345 Musterstadt', notes: 'Mietvertrag Ende 2025 ausgelaufen, Regale abgebaut.', lat: 52.37911, lng: 9.78944, active: false },
];

const lager = (nr: number) => bsp(3, 500 + nr);
const warehouseRows: Zeile[] = LAGER.map((w) => ({
  id: lager(w.nr),
  org_id: ORG,
  name: w.name,
  address: w.address,
  lat: w.lat,
  lng: w.lng,
  operator_name: 'Musterlogistik GmbH',
  operator_contact: 'Lagerleitung · 0123 4567-50',
  notes: w.notes,
  active: w.active ?? true,
  created_at: w.neu ? vor(w.neu, 11, 0) : plus(SEIT, 30 + w.nr * 8),
}));

// ---------------------------------------------------------------------------- Regalzeilen

const PAL = 'Palettenregal';
const FACH = 'Fachbodenregal';
const KRAG = 'Kragarmregal';
const EINF = 'Einfahrregal';
const DURCH = 'Durchlaufregal';
const BUEHNE = 'Mehrgeschossanlage';

// [Lager, Bezeichnung, Kategorie, Aufstelljahr, Fachlast kg, Feldlast kg, abgebaut?]
type R = [number, string, string, string, string | null, string | null, boolean?];
const zeilen = (w: number, namen: string[], cat: string, jahr: string, fach: string | null, feld: string | null, retired?: boolean): R[] =>
  namen.map((n) => [w, n, cat, jahr, fach, feld, retired]);
const REGALE: R[] = [
  ...zeilen(1, ['Zeile A01', 'Zeile A02', 'Zeile A03', 'Zeile A04', 'Zeile A05', 'Zeile A06', 'Zeile A07', 'Zeile A08'], PAL, '2015', '2000', '9000'),
  ...zeilen(2, ['Zeile K01', 'Zeile K02', 'Zeile K03', 'Zeile K04'], PAL, '2019', '1500', '7500'),
  ...zeilen(2, ['Zeile K05', 'Zeile K06'], DURCH, '2021', '300', null),
  ...zeilen(3, ['Gang 01', 'Gang 02', 'Gang 03', 'Gang 04', 'Gang 05', 'Gang 06'], PAL, '2018', '2000', '14000'),
  ...zeilen(4, ['TK-01', 'TK-02'], EINF, '2017', '1000', null),
  ...zeilen(4, ['TK-03'], PAL, '2017', '1500', '7500'),
  ...zeilen(5, ['KA-01', 'KA-02', 'KA-03'], KRAG, '2012', '800', '9600'),
  ...zeilen(6, ['E-01', 'E-02', 'E-03', 'E-04'], FACH, '2010', '150', '1500'),
  ...zeilen(6, ['E-05 Lagerbühne'], BUEHNE, '2016', null, null),
  ...zeilen(7, ['H-01', 'H-02', 'H-03', 'H-04'], PAL, '2009', '2000', '8000'),
  ...zeilen(8, ['N-01', 'N-02', 'N-03', 'N-04', 'N-05', 'N-06'], PAL, '2026', '2000', '9000'),
  ...zeilen(9, ['Z-01', 'Z-02', 'Z-03'], PAL, '2008', '1000', '6000', true),
];

const regal = (i: number) => bsp(4, 500 + i);
const regalId = (w: number, name: string) => regal(REGALE.findIndex((r) => r[0] === w && r[1] === name) + 1);
const rackRows: Zeile[] = REGALE.map(([w, name, category, install_year, bay_load_kg, field_load_kg, retired], i) => ({
  id: regal(i + 1),
  org_id: ORG,
  warehouse_id: lager(w),
  name,
  category,
  manufacturer: null,
  install_year,
  bay_load_kg,
  field_load_kg,
  notes: retired ? 'Abgebaut mit Aufgabe des Zwischenlagers.' : null,
  photo_url: null,
  retired: retired ?? false,
  created_at: LAGER[w - 1].neu ? vor(LAGER[w - 1].neu!, 11, 20) : plus(SEIT, 90 + i),
}));

// ---------------------------------------------------------------------------- Inspektionen

const inspections: Zeile[] = [];
const merker = new Map<string, Zeile>();

function inspektion(opt: {
  w: number;
  type: 'visual' | 'expert';
  at: string;
  wer: string;
  von: string;
  maengel?: string[];
  notes?: string | null;
  storno?: string;
  merke?: string;
}): void {
  const nr = inspections.length + 1;
  const l = LAGER[opt.w - 1];
  const z: Zeile = {
    id: bsp(5, 5000 + nr),
    org_id: ORG,
    warehouse_id: lager(opt.w),
    type: opt.type,
    started_at: opt.at,
    lat: l.lat + (nr % 5) * 0.00002,
    lng: l.lng - (nr % 3) * 0.00002,
    gps_accuracy_m: 5 + (nr % 8),
    checklist: liste(CHECK_IDS, opt.maengel ?? []),
    photo_urls: [],
    notes: opt.notes ?? null,
    performed_by: opt.von,
    inspector_name: opt.wer,
    canceled: !!opt.storno,
    cancel_reason: opt.storno ?? null,
    canceled_at: opt.storno ? plus(opt.at, 7) : null,
    created_at: plus(opt.at, opt.type === 'visual' ? 1 : 5),
  };
  inspections.push(z);
  if (opt.merke) merker.set(opt.merke, z);
}

const EXPERTE = 'Experteninspektion nach DIN EN 15635, Prüfbericht liegt im Lagerbüro.';
const ex = (w: number, at: string, extra: Partial<Parameters<typeof inspektion>[0]> = {}) =>
  inspektion({ w, type: 'expert', at, wer: FACHKUNDIG, von: WEBER, notes: EXPERTE, ...extra });

// Experteninspektionen (DIN EN 15635: mindestens alle 12 Monate) — die jeweils letzte je Lager
ex(1, vor(1, 15, 30), { maengel: ['load_signs'], merke: 'L1-ex' });
ex(2, vor(96, 9, 0));
ex(3, vor(200, 8, 30));
ex(4, fristVor(1, 11, 10, 0)); // in 11 Tagen fällig
ex(5, fristVor(1, 26, 13, 0)); // in 26 Tagen fällig
ex(6, vor(60, 14, 0));
ex(7, fristVor(1, -16, 9, 30), { notes: 'Experteninspektion nach DIN EN 15635. Folgetermin wegen Umbau der Halle verschoben.' }); // seit 16 Tagen überfällig
ex(9, vor(330, 10, 0));
// frühere Runde (Vorjahr)
ex(1, vor(372, 9, 0));
ex(2, vor(410, 9, 0));
// Halle 4 ist neu: noch keine Experteninspektion

// Wöchentliche Sichtkontrollen durch die beauftragten Personen
const WER: Record<number, ['D. Weber' | 'M. Schulz', number, number]> = {
  // Lager: [Person, Tag im Wochenrhythmus (1 = gestern), Uhrzeit]
  1: ['M. Schulz', 1, 7], 2: ['D. Weber', 2, 7], 3: ['M. Schulz', 2, 13], 4: ['D. Weber', 3, 8],
  5: ['M. Schulz', 3, 14], 6: ['D. Weber', 4, 10], 7: ['M. Schulz', 4, 13],
};
const v = (w: number, at: string, extra: Partial<Parameters<typeof inspektion>[0]> = {}) => {
  const wer = WER[w][0];
  inspektion({ w, type: 'visual', at, wer, von: wer === 'D. Weber' ? WEBER : SCHULZ, ...extra });
};
for (let woche = 0; woche < 10; woche++) {
  for (let w = 1; w <= 7; w++) {
    const [, tag, h] = WER[w];
    const extra: Partial<Parameters<typeof inspektion>[0]> = {};
    if (woche === 0 && w === 2) Object.assign(extra, { maengel: ['uprights', 'impact_protection'], merke: 'L2' });
    if (woche === 0 && w === 3) Object.assign(extra, { maengel: ['beams'], merke: 'L3' });
    if (woche === 2 && w === 1) Object.assign(extra, { maengel: ['beam_locks'], merke: 'L1-alt' });
    if (woche === 1 && w === 4) Object.assign(extra, { maengel: ['impact_protection'], merke: 'L4' });
    v(w, vor(tag + 7 * woche, h, (w * 11) % 50), extra);
  }
}
v(5, vor(10, 14, 40), { storno: 'Doppelt erfasst' });
// Halle 4: erste Sichtkontrolle nach dem Aufbau
inspektion({ w: 8, type: 'visual', at: vor(1, 14, 20), wer: 'D. Weber', von: WEBER, notes: 'Erste Sichtkontrolle nach dem Aufbau, Belastungsschilder angebracht.' });

// ---------------------------------------------------------------------------- Schäden

const damages: Zeile[] = [];
function schaden(opt: {
  merke: string;
  regal: string | null;
  title: string;
  description: string;
  severity: 'green' | 'amber' | 'red';
  blocked: boolean;
  behoben?: { nachMin: number; wer: [string, string]; note: string };
}): void {
  const k = merker.get(opt.merke)!;
  const w = LAGER.findIndex((x) => lager(x.nr) === k.warehouse_id) + 1;
  const at = plus(String(k.started_at), 4);
  damages.push({
    id: bsp(6, 500 + damages.length + 1),
    org_id: ORG,
    warehouse_id: k.warehouse_id,
    inspection_id: k.id,
    rack_id: opt.regal ? regalId(w, opt.regal) : null,
    title: opt.title,
    description: opt.description,
    severity: opt.severity,
    rack_blocked: opt.blocked,
    photo_urls: [],
    status: opt.behoben ? 'resolved' : 'open',
    reported_by: k.performed_by,
    reporter_name: k.type === 'expert' ? 'D. Weber' : k.inspector_name,
    resolved_at: opt.behoben ? plus(at, opt.behoben.nachMin) : null,
    resolved_by: opt.behoben?.wer[1] ?? null,
    resolver_name: opt.behoben?.wer[0] ?? null,
    resolution_note: opt.behoben?.note ?? null,
    resolution_photo_urls: [],
    created_at: at,
  });
}

schaden({
  merke: 'L2',
  regal: 'Zeile K03',
  title: 'Stütze stark verformt — Anfahrschaden',
  description: 'Stütze vorn links, untere Ebene: Delle 12 mm in Gassenrichtung (Grenzwert 5 mm), Anfahrschutz eingedrückt. Feld entlastet und abgesperrt, Austausch der Stütze ist beauftragt.',
  severity: 'red',
  blocked: true,
});
schaden({
  merke: 'L3',
  regal: 'Gang 04',
  title: 'Traverse bleibend durchgebogen',
  description: 'Feld 12, dritte Ebene: Traverse nach dem Entladen weiter durchgebogen, Grenzwert überschritten. Ware umgelagert, Feld wird nicht neu belegt. Instandsetzung binnen 4 Wochen.',
  severity: 'amber',
  blocked: false,
});
schaden({
  merke: 'L1-ex',
  regal: 'Zeile A05',
  title: 'Belastungsschild fehlt',
  description: 'Nach dem Umbau der Zeile nicht wieder angebracht. Neues Schild mit Fach- und Feldlast ist bestellt.',
  severity: 'green',
  blocked: false,
});
schaden({
  merke: 'L1-alt',
  regal: 'Zeile A02',
  title: 'Sicherungsstifte fehlen',
  description: 'Feld 4, zweite Ebene: Aushebesicherung an beiden Seiten der Traverse fehlt.',
  severity: 'amber',
  blocked: true,
  behoben: { nachMin: 50, wer: ['M. Schulz', SCHULZ], note: 'Sicherungsstifte eingesetzt, alle Traversen der Zeile kontrolliert.' },
});
schaden({
  merke: 'L4',
  regal: 'TK-03',
  title: 'Anfahrschutz verformt',
  description: 'Eckschutz an der Gangeinfahrt eingedrückt, Stütze dahinter ohne Befund.',
  severity: 'green',
  blocked: false,
  behoben: { nachMin: 2 * 24 * 60, wer: ['D. Weber', WEBER], note: 'Anfahrschutz ausgetauscht.' },
});

export const daten: BeispielDaten = {
  app: 'regaldex',
  nutzer: { id: INHABER, email: 'info@musterlogistik.example' },
  tabellen: {
    org: B.org,
    membership: B.membership,
    warehouse: warehouseRows,
    rack: rackRows,
    inspection: inspections,
    damage: damages,
  },
  rpc: {
    list_members: () => B.mitglieder,
  },
};
