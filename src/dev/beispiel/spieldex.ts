// SpielDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/spieldex?beispiel, docs/beispiel-zugang.md).
// Eine erfundene „Gemeinde Musterstadt“ (DE), Bauhof kontrolliert 12 Spielplätze (+ 2 stillgelegte): Sichtkontrolle
// wöchentlich (am Stadtpark zweimal), operative Kontrolle etwa alle 3 Monate, Jahreshauptinspektion durch einen externen
// Spielplatzprüfer (DIN EN 1176-7). Alle Personen erfunden, E-Mails unter .example, Telefon mit Vorwahl 0123.
// Hersteller bewusst leer: keine Markennamen in Bildern.
//
// Was die Übersicht damit zeigt (src/spieldex/pages/Overview.tsx, Fälligkeit src/lib/pruefExport.ts → dueOverview):
//   · Kontrolle fällig: 2 (Hauptinspektion überfällig, operative Kontrolle überfällig) · + 3 bald fällig · 1 gesperrt
//     · von 12 aktiven Spielplätzen
//   · Offene Mängel: 4, davon 1× Gefahr · Kontrollen 7 Tage: 13 · keine Karte „Erste Schritte“
// Schema wie SpielDex/supabase/schema.sql (geprüft in tests/beispiel-zugang.test.mjs).

import { CHECKLIST } from '../../spieldex/types.ts';
import { betrieb, bsp, fristVor, liste, plus, vor, type BeispielDaten, type Zeile } from './typen.ts';

const ORG = bsp(1, 2);
const BAUHOF = bsp(2, 11);
const KRUEGER = bsp(2, 12);
const HOFFMANN = bsp(2, 13);
const SEIT = vor(440, 8, 15, false);
const CHECK_IDS = CHECKLIST.map((c) => c.id);
// externer, qualifizierter Spielplatzprüfer (kein Mitglied — der Bauhof erfasst seine Hauptinspektion)
const PRUEFER = 'K. Brandt';

const B = betrieb({
  orgId: ORG,
  name: 'Gemeinde Musterstadt',
  land: 'DE',
  address: 'Rathausplatz 1, 12345 Musterstadt',
  seit: SEIT,
  extra: { is_pro: false, logo_url: null, brand_color: null },
  team: [
    { id: BAUHOF, email: 'bauhof@musterstadt.example', role: 'owner', seit: SEIT },
    { id: KRUEGER, email: 't.krueger@musterstadt.example', role: 'worker', seit: vor(431, 7, 10, false) },
    { id: HOFFMANN, email: 'l.hoffmann@musterstadt.example', role: 'worker', seit: vor(430, 7, 25, false) },
  ],
});

// ---------------------------------------------------------------------------- Spielplätze

interface P {
  nr: number;
  name: string;
  address: string;
  notes?: string;
  operator?: string;
  /** ohne Zaun: Checklisten-Punkt „Zäune, Tore, Zugänge“ entfällt */
  offen?: boolean;
  active?: boolean;
  /** Tage seit dem Anlegen (Standard: beim Einrichten des Betriebs) */
  neu?: number;
}

const PLAETZE: P[] = [
  { nr: 1, name: 'Spielplatz Am Stadtpark', address: 'Parkstraße 2, 12345 Musterstadt', notes: 'Stark besucht — Sichtkontrolle zweimal pro Woche.' },
  { nr: 2, name: 'Spielplatz Lindenallee', address: 'Lindenallee 18, 12345 Musterstadt' },
  { nr: 3, name: 'Waldspielplatz Eichenweg', address: 'Eichenweg (Waldparkplatz), 12345 Musterstadt', notes: 'Naturholzgeräte aus Robinie.', offen: true },
  { nr: 4, name: 'Schulhof Grundschule Nord', address: 'Schulstraße 5, 12345 Musterstadt', operator: 'Gemeinde Musterstadt (Schulträger)' },
  { nr: 5, name: 'Wasserspielplatz Mühlbach', address: 'Mühlenweg 7, 12345 Musterstadt', notes: 'Wasserlauf von November bis April abgestellt.' },
  { nr: 6, name: 'Spielplatz Rosenstraße', address: 'Rosenstraße 31, 12345 Musterstadt' },
  { nr: 7, name: 'Mehrgenerationenpark Marktwiese', address: 'An der Marktwiese, 12345 Musterstadt', offen: true },
  { nr: 8, name: 'Spielplatz Neubaugebiet Kirchberg', address: 'Am Kirchberg 12, 12345 Musterstadt', notes: 'Neu angelegt, Abnahme durch den Spielplatzprüfer vor der Eröffnung.', neu: 72 },
  { nr: 9, name: 'Spielplatz Sportzentrum', address: 'Sportplatzweg 3, 12345 Musterstadt' },
  { nr: 10, name: 'Spielplatz Dorfplatz Oberdorf', address: 'Dorfplatz, OT Oberdorf, 12345 Musterstadt', offen: true },
  { nr: 11, name: 'Kita Sonnenschein – Außengelände', address: 'Gartenweg 4, 12345 Musterstadt', operator: 'Gemeinde Musterstadt (Kita-Träger)' },
  { nr: 12, name: 'Spielplatz Am Weiher', address: 'Weiherstraße 9, 12345 Musterstadt' },
  { nr: 13, name: 'Spielplatz Ahornring', address: 'Ahornring 2, 12345 Musterstadt', notes: 'Wegen Umbau geschlossen, Wiedereröffnung im Frühjahr.', active: false },
  { nr: 14, name: 'Spielplatz Gartenweg', address: 'Gartenweg 30, 12345 Musterstadt', notes: 'Zurückgebaut, die Fläche wird Grünanlage.', active: false },
];

const pg = (nr: number) => bsp(3, 100 + nr);
const lage = (nr: number): [number, number] => [49.98712 + ((nr * 37) % 11) * 0.0019, 9.61834 + ((nr * 53) % 13) * 0.0023];
const playgroundRows: Zeile[] = PLAETZE.map((p) => ({
  id: pg(p.nr),
  org_id: ORG,
  name: p.name,
  address: p.address,
  lat: lage(p.nr)[0],
  lng: lage(p.nr)[1],
  operator_name: p.operator ?? 'Gemeinde Musterstadt – Bauhof',
  operator_contact: 'Bauhof · 0123 4567-30',
  notes: p.notes ?? null,
  active: p.active ?? true,
  created_at: p.neu ? vor(p.neu, 10, 0) : plus(SEIT, 30 + p.nr * 5),
}));

// ---------------------------------------------------------------------------- Spielgeräte

// [Spielplatz, Gerät, Kategorie, Baujahr, abgebaut?]
type G = [number, string, string, string, boolean?];
const GERAETE: G[] = [
  [1, 'Doppelschaukel', 'Schaukel', '2016'],
  [1, 'Nestschaukel', 'Schaukel', '2019'],
  [1, 'Rutschenturm mit Kletterwand', 'Rutsche', '2016'],
  [1, 'Seilbahn', 'Seilbahn', '2018'],
  [1, 'Sandkasten mit Sonnensegel', 'Sandspielbereich', '2016'],
  [1, 'Federwippe Pferd', 'Federwipper', '2012'],
  [1, 'Drehkarussell', 'Karussell', '2014'],
  [2, 'Doppelschaukel', 'Schaukel', '2011'],
  [2, 'Kletterturm mit Rutsche', 'Rutsche', '2011'],
  [2, 'Federwippe Biene', 'Federwipper', '2015'],
  [2, 'Sandkasten', 'Sandspielbereich', '2011'],
  [3, 'Balancierparcours', 'Balancieranlage', '2020'],
  [3, 'Kletternetz zwischen Robinienstämmen', 'Klettergerät', '2020'],
  [3, 'Hangrutsche', 'Rutsche', '2020'],
  [3, 'Baumhaus-Plattform', 'Klettergerät', '2021'],
  [4, 'Klettergerüst', 'Klettergerät', '2013'],
  [4, 'Reckstangen (3 Höhen)', 'Turngerät', '2013'],
  [4, 'Doppelschaukel', 'Schaukel', '2017'],
  [5, 'Wasserpumpe mit Matschtisch', 'Wasserspiel', '2022'],
  [5, 'Wasserlauf mit Stauwehr', 'Wasserspiel', '2022'],
  [5, 'Nestschaukel', 'Schaukel', '2022'],
  [5, 'Sandbagger', 'Sandspielbereich', '2022'],
  [6, 'Doppelschaukel', 'Schaukel', '2008'],
  [6, 'Anbaurutsche', 'Rutsche', '2008'],
  [6, 'Balkenwippe', 'Wippe', '2010'],
  [6, 'Sandkasten', 'Sandspielbereich', '2008'],
  [7, 'Kletterpyramide (Netz)', 'Klettergerät', '2023'],
  [7, 'Nestschaukel', 'Schaukel', '2023'],
  [7, 'Boulderfelsen', 'Klettergerät', '2023'],
  [7, 'Balancierstrecke', 'Balancieranlage', '2023'],
  [8, 'Spielkombination Burg', 'Klettergerät', '2026'],
  [8, 'Doppelschaukel', 'Schaukel', '2026'],
  [8, 'Federwippe Ente', 'Federwipper', '2026'],
  [8, 'Sandspielbereich mit Kran', 'Sandspielbereich', '2026'],
  [9, 'Kletterturm', 'Klettergerät', '2015'],
  [9, 'Doppelschaukel', 'Schaukel', '2015'],
  [9, 'Drehscheibe', 'Karussell', '2015'],
  [10, 'Doppelschaukel', 'Schaukel', '2010'],
  [10, 'Anbaurutsche', 'Rutsche', '2010'],
  [10, 'Sandkasten', 'Sandspielbereich', '2010'],
  [11, 'Spielhaus', 'Spielhaus', '2019'],
  [11, 'Rutschenhügel', 'Rutsche', '2019'],
  [11, 'Nestschaukel', 'Schaukel', '2019'],
  [11, 'Matschbereich', 'Sandspielbereich', '2019'],
  [11, 'Balancierbalken', 'Balancieranlage', '2019'],
  [12, 'Doppelschaukel', 'Schaukel', '2017'],
  [12, 'Kletterkombination', 'Klettergerät', '2017'],
  [12, 'Federwippe Ente', 'Federwipper', '2017'],
  [13, 'Seilzirkus', 'Klettergerät', '2009'],
  [13, 'Doppelschaukel', 'Schaukel', '2009'],
  [14, 'Holzrutsche', 'Rutsche', '2004', true],
];

const geraetId = (i: number) => bsp(4, 100 + i);
const equipmentRows: Zeile[] = GERAETE.map(([p, name, category, install_year, retired], i) => ({
  id: geraetId(i + 1),
  org_id: ORG,
  playground_id: pg(p),
  name,
  category,
  manufacturer: null,
  install_year,
  notes: retired ? 'Abgebaut beim Rückbau des Spielplatzes.' : null,
  photo_url: null,
  retired: retired ?? false,
  created_at: PLAETZE[p - 1].neu ? vor(PLAETZE[p - 1].neu!, 10, 30) : plus(SEIT, 60 + i),
}));
const geraet = (p: number, name: string) => geraetId(GERAETE.findIndex((g) => g[0] === p && g[1] === name) + 1);

// ---------------------------------------------------------------------------- Kontrollen

const inspections: Zeile[] = [];
const merker = new Map<string, Zeile>();

function kontrolle(opt: {
  p: number;
  type: 'visual' | 'operational' | 'main';
  at: string;
  wer: string;
  von: string;
  maengel?: string[];
  notes?: string | null;
  merke?: string;
}): void {
  const nr = inspections.length + 1;
  const [lat, lng] = lage(opt.p);
  const z: Zeile = {
    id: bsp(5, 1000 + nr),
    org_id: ORG,
    playground_id: pg(opt.p),
    type: opt.type,
    started_at: opt.at,
    lat: lat + (nr % 5) * 0.00002,
    lng: lng - (nr % 3) * 0.00002,
    gps_accuracy_m: 5 + (nr % 8),
    checklist: liste(CHECK_IDS, opt.maengel ?? [], PLAETZE[opt.p - 1].offen ? ['fence_gates'] : []),
    photo_urls: [],
    notes: opt.notes ?? null,
    performed_by: opt.von,
    inspector_name: opt.wer,
    canceled: false,
    cancel_reason: null,
    canceled_at: null,
    created_at: plus(opt.at, opt.type === 'visual' ? 1 : 4),
  };
  inspections.push(z);
  if (opt.merke) merker.set(opt.merke, z);
}

const v = (p: number, at: string, wer: 'T. Krüger' | 'L. Hoffmann', extra: Partial<Parameters<typeof kontrolle>[0]> = {}) =>
  kontrolle({ p, type: 'visual', at, wer, von: wer === 'T. Krüger' ? KRUEGER : HOFFMANN, ...extra });

// Jüngste Woche (bestimmt „Kontrollen 7 Tage“ und die Tabelle „Letzte Kontrollen“)
kontrolle({
  p: 1,
  type: 'operational',
  at: vor(1, 11, 20),
  wer: 'T. Krüger',
  von: KRUEGER,
  maengel: ['wear'],
  notes: 'Operative Kontrolle mit Funktionsprüfung aller Geräte.',
  merke: 'P1-op',
});
v(12, vor(1, 10, 5), 'T. Krüger');
v(6, vor(1, 9, 20), 'T. Krüger', { maengel: ['fall_protection'], merke: 'P6' });
v(2, vor(1, 8, 40), 'T. Krüger');
kontrolle({
  p: 9,
  type: 'main',
  at: vor(1, 13, 30),
  wer: PRUEFER,
  von: BAUHOF,
  notes: 'Jahreshauptinspektion nach DIN EN 1176-7 durch qualifizierten Spielplatzprüfer, Prüfbericht liegt im Bauhof.',
});
v(7, vor(2, 11, 30), 'L. Hoffmann');
v(5, vor(2, 10, 50), 'L. Hoffmann');
v(4, vor(2, 10, 10), 'L. Hoffmann');
v(3, vor(2, 9, 15), 'L. Hoffmann');
v(8, vor(2, 8, 30), 'L. Hoffmann');
v(11, vor(3, 9, 45), 'L. Hoffmann', { maengel: ['fence_gates'], merke: 'P11' });
v(10, vor(3, 8, 50), 'L. Hoffmann');
v(1, vor(4, 8, 10), 'T. Krüger');

// Frühere Wochen: Sichtkontrolle je Spielplatz im Wochenrhythmus (Stadtpark zweimal)
const TAG_IM_RHYTHMUS: Record<number, [number, 'T. Krüger' | 'L. Hoffmann', number]> = {
  1: [1, 'T. Krüger', 11], 2: [1, 'T. Krüger', 8], 3: [2, 'L. Hoffmann', 9], 4: [2, 'L. Hoffmann', 10],
  5: [2, 'L. Hoffmann', 10], 6: [1, 'T. Krüger', 9], 7: [2, 'L. Hoffmann', 11], 8: [2, 'L. Hoffmann', 8],
  9: [2, 'L. Hoffmann', 13], 10: [3, 'L. Hoffmann', 8], 11: [3, 'L. Hoffmann', 9], 12: [1, 'T. Krüger', 10],
};
for (let w = 1; w <= 9; w++) {
  for (let p = 1; p <= 12; p++) {
    const [tag, wer, h] = TAG_IM_RHYTHMUS[p];
    const neu = PLAETZE[p - 1].neu;
    if (neu && tag + 7 * w > neu - 3) continue;
    const extra: Partial<Parameters<typeof kontrolle>[0]> = {};
    if (p === 2 && w === 2) Object.assign(extra, { maengel: ['furniture'], merke: 'P2' });
    if (p === 4 && w === 1) Object.assign(extra, { maengel: ['glass_waste'], merke: 'P4' });
    v(p, vor(tag + 7 * w, h, (p * 7) % 50), wer, extra);
  }
  v(1, vor(4 + 7 * w, 8, 10), 'T. Krüger');
}

// Operative Kontrollen (alle 90 Tage; die Hauptinspektion zählt mit) — Abstand bestimmt „Operative Kontrolle“ in der Übersicht
for (const [p, tage, wer, merke, maengel] of [
  [2, 45, 'T. Krüger'],
  [3, 97, 'L. Hoffmann'], // seit 7 Tagen überfällig
  [4, 80, 'L. Hoffmann'], // in 10 Tagen fällig
  [5, 60, 'L. Hoffmann'],
  [6, 38, 'T. Krüger'],
  [7, 52, 'L. Hoffmann'],
  [9, 66, 'T. Krüger', 'P9-op', ['missing_parts']],
  [10, 30, 'L. Hoffmann', 'P10-op', ['foundations']],
  [11, 24, 'L. Hoffmann'],
  [12, 71, 'T. Krüger'],
  [1, 91, 'T. Krüger'],
] as [number, number, 'T. Krüger' | 'L. Hoffmann', string?, string[]?][]) {
  kontrolle({ p, type: 'operational', at: vor(tage, 13, 15), wer, von: wer === 'T. Krüger' ? KRUEGER : HOFFMANN, merke, maengel });
}

// Jahreshauptinspektionen (externer Spielplatzprüfer, meist im Frühjahr)
const HAUPT = 'Jahreshauptinspektion nach DIN EN 1176-7, Prüfbericht liegt im Bauhof.';
for (const [p, at] of [
  [1, vor(212, 8, 30)],
  [2, vor(212, 11, 0)],
  [3, vor(210, 9, 0)],
  [4, vor(205, 8, 0)],
  [6, vor(212, 13, 30)],
  [11, vor(205, 10, 30)],
  [12, vor(211, 9, 15)],
  [5, fristVor(1, 15, 10, 0)], // in 15 Tagen fällig
  [7, fristVor(1, 20, 9, 30)], // in 20 Tagen fällig
  [10, fristVor(1, -12, 14, 0)], // seit 12 Tagen überfällig
  [8, vor(70, 10, 0)], // Abnahme vor der Eröffnung
] as [number, string][]) {
  kontrolle({ p, type: 'main', at, wer: PRUEFER, von: BAUHOF, notes: p === 8 ? 'Abnahme vor der Eröffnung nach DIN EN 1176-7, ohne Beanstandung.' : HAUPT });
}

// ---------------------------------------------------------------------------- Mängel

const defects: Zeile[] = [];
function mangel(opt: {
  merke: string;
  geraet: string | null;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'danger';
  blocked: boolean;
  behoben?: { nachMin: number; wer: [string, string]; note: string };
}): void {
  const k = merker.get(opt.merke)!;
  const p = PLAETZE.findIndex((x) => pg(x.nr) === k.playground_id) + 1;
  const at = plus(String(k.started_at), 4);
  const wer = String(k.inspector_name);
  defects.push({
    id: bsp(6, 100 + defects.length + 1),
    org_id: ORG,
    playground_id: k.playground_id,
    inspection_id: k.id,
    equipment_id: opt.geraet ? geraet(p, opt.geraet) : null,
    title: opt.title,
    description: opt.description,
    severity: opt.severity,
    equipment_blocked: opt.blocked,
    photo_urls: [],
    status: opt.behoben ? 'resolved' : 'open',
    reported_by: k.performed_by,
    reporter_name: wer,
    resolved_at: opt.behoben ? plus(at, opt.behoben.nachMin) : null,
    resolved_by: opt.behoben?.wer[1] ?? null,
    resolver_name: opt.behoben?.wer[0] ?? null,
    resolution_note: opt.behoben?.note ?? null,
    resolution_photo_urls: [],
    created_at: at,
  });
}

mangel({
  merke: 'P1-op',
  geraet: 'Doppelschaukel',
  title: 'Schaukelkette: Kettenglied stark verschlissen',
  description: 'Oberes Kettenglied links mit deutlichem Materialabtrag. Sitz abgenommen, Schaukel mit Flatterband gesperrt. Ersatzkette ist bestellt.',
  severity: 'danger',
  blocked: true,
});
mangel({
  merke: 'P6',
  geraet: 'Doppelschaukel',
  title: 'Fallschutz unter der Schaukel ausgewaschen',
  description: 'Kuhle unter beiden Sitzen, Füllhöhe deutlich unter Soll. Sand wird diese Woche nachgefüllt.',
  severity: 'medium',
  blocked: false,
});
mangel({
  merke: 'P11',
  geraet: null,
  title: 'Eingangstor schließt nicht selbsttätig',
  description: 'Federscharnier zu schwach, das Tor bleibt offen stehen. Kita-Leitung ist informiert, Scharnier bestellt.',
  severity: 'medium',
  blocked: false,
});
mangel({
  merke: 'P2',
  geraet: null,
  title: 'Sitzbank am Sandkasten: Latte gesplittert',
  description: 'Rückenlehne gesplittert, Kanten vorläufig abgeschliffen. Latte wird im Winter getauscht.',
  severity: 'low',
  blocked: false,
});
mangel({
  merke: 'P4',
  geraet: null,
  title: 'Glasscherben im Fallschutzbereich',
  description: 'Scherben einer Flasche unter dem Klettergerüst.',
  severity: 'medium',
  blocked: false,
  behoben: { nachMin: 25, wer: ['L. Hoffmann', HOFFMANN], note: 'Scherben entfernt, Kies durchgerecht.' },
});
mangel({
  merke: 'P9-op',
  geraet: 'Drehscheibe',
  title: 'Abdeckkappe an der Achse fehlt',
  description: 'Schraubenkopf liegt offen.',
  severity: 'low',
  blocked: false,
  behoben: { nachMin: 6 * 24 * 60, wer: ['T. Krüger', KRUEGER], note: 'Neue Abdeckkappe gesetzt.' },
});
mangel({
  merke: 'P10-op',
  geraet: 'Anbaurutsche',
  title: 'Fundament am Rutschenpfosten freigelegt',
  description: 'Betonkante durch Auswaschung sichtbar.',
  severity: 'medium',
  blocked: false,
  behoben: { nachMin: 2 * 24 * 60, wer: ['L. Hoffmann', HOFFMANN], note: 'Fallschutzkies aufgefüllt, Fundament wieder 20 cm überdeckt.' },
});

export const daten: BeispielDaten = {
  app: 'spieldex',
  nutzer: { id: BAUHOF, email: 'bauhof@musterstadt.example' },
  tabellen: {
    org: B.org,
    membership: B.membership,
    playground: playgroundRows,
    equipment: equipmentRows,
    inspection: inspections,
    defect: defects,
  },
  rpc: {
    list_members: () => B.mitglieder,
  },
};
