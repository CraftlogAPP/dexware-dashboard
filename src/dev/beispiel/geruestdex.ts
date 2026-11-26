// GerüstDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/geruestdex?beispiel, docs/beispiel-zugang.md).
// Ein erfundenes Bauunternehmen „Musterbau GmbH“ in Musterstadt (DE): 9 Baustellen (2 abgeschlossen), 22 Gerüste
// (2 abgebaut), aufgebaut von einem erfundenen Gerüstbauer. Inaugenscheinnahme durch die Nutzer arbeitstäglich,
// Prüfung durch die befähigte Person (Bauleitung) nach der Montage, nach Änderungen und bei Standzeit alle 30 Tage
// (TRBS 2121-1, Frist wie die App: src/geruestdex/types.ts → INSPECTION_INTERVAL_DAYS, „bald fällig“ ab 14 Tagen).
// Orts-Modus wie die App: Die Prüfung hängt an der ganzen Baustelle, Mängel nennen das Gerüst.
// Alle Personen erfunden (Initial + häufiger Nachname), E-Mails unter .example, Telefon mit Vorwahl 0123.
// Gerüstsystem (Hersteller) bewusst leer: keine Markennamen in Bildern.
//
// Was die Übersicht damit zeigt (src/geruestdex/pages/Overview.tsx, Fälligkeit src/lib/pruefExport.ts → dueOverview):
//   · Prüfung fällig: 2 (1 überfällig, 1 neue Baustelle noch nie geprüft) · + 3 bald fällig · 1 gesperrt
//     · von 7 aktiven Baustellen · 20 Gerüste
//   · Offene Mängel: 3, davon 1× Rot · Prüfungen 30 Tage: gut 100 (je nach Wochentag) · keine Karte „Erste Schritte“
//   Fristen auf Werktage gelegt: „Fällig in …“ zeigt je nach Wochentag 1–2 Tage weniger als hier geplant.
// Schema wie GeruestDex/supabase/schema.sql + Nachträge (Spalten geprüft wie in tests/beispiel-zugang.test.mjs, Teil 3).

import { CHECKLIST, INSPECTION_INTERVAL_DAYS } from '../../geruestdex/types.ts';
import { betrieb, bsp, liste, plus, vor, type BeispielDaten, type Zeile } from './typen.ts';

const ORG = bsp(1, 12);
const INHABER = bsp(2, 61);
const NEUMANN = bsp(2, 62);
const ZIMMERMANN = bsp(2, 63);
const BRAUN = bsp(2, 64);
const SEIT = vor(512, 8, 0, false);
const CHECK_IDS = CHECKLIST.map((c) => c.id);
const FRIST = INSPECTION_INTERVAL_DAYS.expert; // 30 Tage
const TAG = 86_400_000;
const GERUESTBAU = 'Muster Gerüstbau GmbH';

const B = betrieb({
  orgId: ORG,
  name: 'Musterbau GmbH',
  land: 'DE',
  address: 'Bauhofstraße 2, 12345 Musterstadt',
  seit: SEIT,
  extra: { is_pro: false, logo_url: null, brand_color: null },
  team: [
    { id: INHABER, email: 'info@musterbau.example', role: 'owner', seit: SEIT },
    { id: NEUMANN, email: 'f.neumann@musterbau.example', role: 'admin', seit: vor(506, 9, 30, false) },
    { id: ZIMMERMANN, email: 's.zimmermann@musterbau.example', role: 'worker', seit: vor(505, 6, 50, false) },
    { id: BRAUN, email: 'a.braun@musterbau.example', role: 'worker', seit: vor(505, 6, 55, false) },
  ],
});

/** Werktag vor `tage` Kalendertagen um hh:mm (Samstag/Sonntag → Freitag davor) */
function werktag(tage: number, hh: number, mm: number): Date {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  d.setDate(d.getDate() - tage);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

/**
 * Prüfung durch die befähigte Person, deren 30-Tage-Frist in `tageBisFaellig` Tagen abläuft (negativ = überfällig).
 * Fällt der Tag aufs Wochenende, liegt die Prüfung am Freitag davor (die Restzeit wird 1–2 Tage kürzer).
 */
function frist(tageBisFaellig: number, hh: number, mm: number): string {
  return werktag(FRIST - tageBisFaellig, hh, mm).toISOString();
}

/** „03.11.2026“ — Aufbaudatum wie in der App (Freitext), lokale Zeit */
function datum(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------- Baustellen

interface S {
  nr: number;
  name: string;
  address: string;
  notes: string | null;
  /** angelegt vor so vielen Tagen; das Gerüst steht ab dem Tag danach */
  seit: number;
  /** jüngste Prüfung durch die befähigte Person (ISO) — null = noch keine */
  letzte: string | null;
  /** Wer die Inaugenscheinnahme macht */
  nutzer: 'S. Zimmermann' | 'A. Braun';
  active?: boolean;
  lat: number;
  lng: number;
}

const BAUSTELLEN: S[] = [
  { nr: 1, name: 'Wohnanlage Lindenhof, Haus A', address: 'Lindenallee 12, 12345 Musterstadt', notes: 'Fassadendämmung und Fenstertausch, Bauzeit bis Frühjahr.', seit: 121, letzte: frist(5, 7, 30), nutzer: 'S. Zimmermann', lat: 48.13712, lng: 11.52418 },
  { nr: 2, name: 'Wohnanlage Lindenhof, Haus B', address: 'Lindenallee 14, 12345 Musterstadt', notes: null, seit: 119, letzte: frist(12, 8, 0), nutzer: 'S. Zimmermann', lat: 48.13744, lng: 11.52502 },
  { nr: 3, name: 'Sanierung Grundschule Nord', address: 'Schulstraße 5, 12345 Musterstadt', notes: 'Schulbetrieb läuft weiter — Zugänge abgesperrt, Schutzdach über dem Haupteingang.', seit: 96, letzte: frist(9, 9, 15), nutzer: 'A. Braun', lat: 48.14388, lng: 11.51833 },
  { nr: 4, name: 'Fassadensanierung Rathaus', address: 'Rathausplatz 1, 12345 Musterstadt', notes: 'Natursteinarbeiten, Lastklasse 4.', seit: 72, letzte: vor(9, 10, 0), nutzer: 'A. Braun', lat: 48.13921, lng: 11.53105 },
  { nr: 5, name: 'Neubau Ärztehaus Bahnhofstraße', address: 'Bahnhofstraße 8, 12345 Musterstadt', notes: null, seit: 152, letzte: vor(1, 14, 30), nutzer: 'S. Zimmermann', lat: 48.13355, lng: 11.53766 },
  { nr: 6, name: 'Dachsanierung Sporthalle', address: 'Sportplatzweg 3, 12345 Musterstadt', notes: 'Dachfanggerüste an beiden Traufen.', seit: 83, letzte: frist(-4, 8, 30), nutzer: 'A. Braun', lat: 48.14702, lng: 11.52966 },
  { nr: 7, name: 'Anbau Kita Sonnenschein', address: 'Gartenweg 4, 12345 Musterstadt', notes: 'Gerüst gestern aufgebaut — vor der ersten Benutzung prüfen.', seit: 2, letzte: null, nutzer: 'S. Zimmermann', lat: 48.13588, lng: 11.51247 },
  { nr: 8, name: 'Gewerbehalle Industriestraße', address: 'Industriestraße 20, 12345 Musterstadt', notes: 'Abgeschlossen, Gerüst abgebaut.', seit: 330, letzte: null, nutzer: 'A. Braun', active: false, lat: 48.12841, lng: 11.54412 },
  { nr: 9, name: 'Mehrfamilienhaus Gartenweg', address: 'Gartenweg 30, 12345 Musterstadt', notes: 'Abgeschlossen, Gerüst abgebaut.', seit: 280, letzte: null, nutzer: 'S. Zimmermann', active: false, lat: 48.13499, lng: 11.51102 },
];

// Auftraggeber / Bauherr je Baustelle (erfunden)
const GEMEINDE: [string, string] = ['Gemeinde Musterstadt', 'Bauamt · 0123 4567-0'];
const BAUHERR: Record<number, [string, string]> = {
  1: ['Wohnbau Musterstadt eG', 'Technik · 0123 4567-80'],
  2: ['Wohnbau Musterstadt eG', 'Technik · 0123 4567-80'],
  3: GEMEINDE,
  4: GEMEINDE,
  5: ['Praxisgemeinschaft Bahnhofstraße', 'Verwaltung · 0123 4567-90'],
  6: GEMEINDE,
  7: GEMEINDE,
  8: ['Musterbetrieb GmbH', 'Haustechnik · 0123 4567-10'],
  9: ['Eigentümergemeinschaft Gartenweg 30', 'Hausverwaltung · 0123 4567-85'],
};

const site = (nr: number) => bsp(3, 600 + nr);
const angelegt = (s: S) => vor(s.seit, 8, 30);
/** Tag des Aufbaus = Werktag nach dem Anlegen (nie in der Zukunft) */
function aufgebaut(s: S): string {
  const d = new Date(Date.parse(angelegt(s)) + TAG);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.getTime() < Date.now() - TAG / 2 ? d.toISOString() : vor(1, 8, 30);
}
const siteRows: Zeile[] = BAUSTELLEN.map((s) => ({
  id: site(s.nr),
  org_id: ORG,
  name: s.name,
  address: s.address,
  lat: s.lat,
  lng: s.lng,
  operator_name: BAUHERR[s.nr][0],
  operator_contact: BAUHERR[s.nr][1],
  notes: s.notes,
  active: s.active ?? true,
  created_at: angelegt(s),
}));

// ---------------------------------------------------------------------------- Gerüste

const FASSADE = 'Fassadengerüst';
const ROLL = 'Fahrgerüst (Rollgerüst)';
const RAUM = 'Raumgerüst';
const SCHUTZ = 'Schutzgerüst / Fanggerüst';
const DACHFANG = 'Dachfanggerüst';
const LK3 = '3 (2,00 kN/m²)';
const LK4 = '4 (3,00 kN/m²)';

// [Baustelle, Bezeichnung, Bauart, Lastklasse, Breitenklasse, abgebaut?]
type G = [number, string, string, string | null, string | null, boolean?];
const GERUESTE: G[] = [
  [1, 'Fassade Nord', FASSADE, LK3, 'W09'],
  [1, 'Fassade Süd', FASSADE, LK3, 'W09'],
  [1, 'Dachfang West', DACHFANG, null, null],
  [2, 'Fassade Nord', FASSADE, LK3, 'W09'],
  [2, 'Fassade Süd', FASSADE, LK3, 'W09'],
  [2, 'Dachfang Ost', DACHFANG, null, null],
  [3, 'Fassade Hof', FASSADE, LK3, 'W09'],
  [3, 'Schutzdach Haupteingang', SCHUTZ, null, null],
  [3, 'Rollgerüst Aula', ROLL, null, null],
  [4, 'Fassade Marktseite', FASSADE, LK4, 'W09'],
  [4, 'Fassade Süd', FASSADE, LK4, 'W09'],
  [4, 'Schutzdach Eingang', SCHUTZ, null, null],
  [5, 'Fassade Bahnhofstraße', FASSADE, LK3, 'W09'],
  [5, 'Fassade Rückseite', FASSADE, LK3, 'W06'],
  [5, 'Raumgerüst Foyer', RAUM, LK3, 'W12'],
  [6, 'Dachfang Nord', DACHFANG, null, null],
  [6, 'Dachfang Süd', DACHFANG, null, null],
  [6, 'Giebel West', FASSADE, LK3, 'W06'],
  [7, 'Fassade Anbau', FASSADE, LK3, 'W09'],
  [7, 'Treppenaufgang', FASSADE, LK3, 'W06'],
  [8, 'Fassade Halle', FASSADE, LK3, 'W09', true],
  [9, 'Fassade Straßenseite', FASSADE, LK3, 'W09', true],
];

const geruestId = (i: number) => bsp(4, 600 + i);
const geruest = (s: number, name: string) => geruestId(GERUESTE.findIndex((g) => g[0] === s && g[1] === name) + 1);
const scaffoldRows: Zeile[] = GERUESTE.map(([s, name, category, load_class, width_class, retired], i) => {
  const b = BAUSTELLEN[s - 1];
  return {
    id: geruestId(i + 1),
    org_id: ORG,
    site_id: site(s),
    name,
    category,
    manufacturer: null,
    erected_by: category === ROLL ? null : GERUESTBAU,
    erected_at: datum(aufgebaut(b)),
    load_class,
    width_class,
    notes: retired ? 'Abgebaut nach Bauende.' : category === ROLL ? 'Eigenes Rollgerüst, Aufbau nach Aufbau- und Verwendungsanleitung.' : null,
    photo_url: null,
    retired: retired ?? false,
    created_at: plus(angelegt(b), 45 + i),
  };
});

// ---------------------------------------------------------------------------- Prüfungen

const inspections: Zeile[] = [];
const merker = new Map<string, Zeile>();

function pruefung(opt: {
  s: number;
  type: 'visual' | 'expert';
  at: string;
  wer: string;
  von: string;
  maengel?: string[];
  notes?: string | null;
  merke?: string;
}): void {
  const nr = inspections.length + 1;
  const b = BAUSTELLEN[opt.s - 1];
  const z: Zeile = {
    id: bsp(5, 6000 + nr),
    org_id: ORG,
    site_id: site(opt.s),
    type: opt.type,
    started_at: opt.at,
    lat: b.lat + (nr % 5) * 0.00002,
    lng: b.lng - (nr % 3) * 0.00002,
    gps_accuracy_m: 4 + (nr % 9),
    checklist: liste(CHECK_IDS, opt.maengel ?? []),
    photo_urls: [],
    notes: opt.notes ?? null,
    performed_by: opt.von,
    inspector_name: opt.wer,
    canceled: false,
    cancel_reason: null,
    canceled_at: null,
    created_at: plus(opt.at, opt.type === 'visual' ? 1 : 6),
  };
  inspections.push(z);
  if (opt.merke) merker.set(opt.merke, z);
}

const bp = (s: number, at: string, notes: string) => pruefung({ s, type: 'expert', at, wer: 'F. Neumann', von: NEUMANN, notes });

// Prüfung durch die befähigte Person: nach der Montage, dann bei Standzeit alle 4 Wochen (die jüngste bestimmt die Frist)
for (const b of BAUSTELLEN) {
  // neue Baustelle (Kita): Gerüst steht, Prüfung nach der Montage steht noch aus
  if (!b.letzte && b.active !== false) continue;
  const montage = plus(aufgebaut(b), 6 * 60);
  const ende = b.active === false ? Date.parse(angelegt(b)) + 150 * TAG : Date.now();
  if (Date.parse(montage) < ende) bp(b.nr, montage, 'Prüfung nach der Montage, Gerüst freigegeben.');
  if (!b.letzte) {
    // abgeschlossene Baustellen: Wiederholungen bis zum Abbau
    if (b.active === false) for (let t = Date.parse(montage) + 28 * TAG; t < ende; t += 28 * TAG) bp(b.nr, new Date(t).toISOString(), 'Wiederkehrende Prüfung (Standzeit), Gerüst freigegeben.');
    continue;
  }
  const letzte = Date.parse(b.letzte);
  const frueher: number[] = [];
  for (let t = letzte - 28 * TAG; t > Date.parse(montage) + 7 * TAG; t -= 28 * TAG) frueher.push(t);
  for (const t of frueher.reverse()) {
    const d = new Date(t);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    bp(b.nr, d.toISOString(), 'Wiederkehrende Prüfung (Standzeit), Gerüst freigegeben.');
  }
  bp(
    b.nr,
    b.letzte,
    b.nr === 5
      ? 'Nach der Aufstockung um zwei Lagen erneut geprüft, Gerüst freigegeben.'
      : b.nr === 4
        ? 'Nach dem Umbau des Schutzdachs erneut geprüft, Gerüst freigegeben.'
        : 'Wiederkehrende Prüfung (Standzeit), Gerüst freigegeben.',
  );
}

// Inaugenscheinnahme durch die Nutzer an jedem Arbeitstag (gelegentlich ruht eine Baustelle, z. B. bei Regen)
const arbeitstage: number[] = [];
for (let t = 1; t <= 45; t++) {
  const d = new Date(Date.now() - t * TAG);
  if (d.getDay() !== 0 && d.getDay() !== 6) arbeitstage.push(t);
}
// [Baustelle, Index des Arbeitstags (0 = jüngster), Mängel, Merker]
const MIT_MANGEL: [number, number, string[], string][] = [
  [2, 0, ['marking'], 'B2'],
  [4, 1, ['anchors'], 'B4'],
  [3, 3, ['environment'], 'B3'],
  [1, 8, ['side_protection'], 'B1'],
  [3, 13, ['foundation'], 'B3-alt'],
];
const UHR: Record<number, [number, number]> = { 1: [7, 5], 2: [7, 15], 3: [7, 0], 4: [7, 10], 5: [6, 50], 6: [7, 20] };
arbeitstage.forEach((t, idx) => {
  for (const b of BAUSTELLEN) {
    if (b.active === false || !UHR[b.nr]) continue;
    const at = werktag(t, UHR[b.nr][0], UHR[b.nr][1]);
    // erst ab dem Tag nach der Prüfung nach der Montage
    if (at.getTime() <= Date.parse(aufgebaut(b)) + TAG) continue;
    // Rathaus: seit dem roten Mangel gesperrt — keine Benutzung, keine Inaugenscheinnahme
    if (b.nr === 4 && idx < 1) continue;
    if ((b.nr * 3 + idx) % 9 === 0 && !MIT_MANGEL.some((m) => m[0] === b.nr && m[1] === idx)) continue;
    const m = MIT_MANGEL.find((x) => x[0] === b.nr && x[1] === idx);
    pruefung({
      s: b.nr,
      type: 'visual',
      at: at.toISOString(),
      wer: b.nutzer,
      von: b.nutzer === 'S. Zimmermann' ? ZIMMERMANN : BRAUN,
      maengel: m?.[2],
      merke: m?.[3],
    });
  }
});

// ---------------------------------------------------------------------------- Mängel

const damages: Zeile[] = [];
function mangel(opt: {
  merke: string;
  geruest: string | null;
  title: string;
  description: string;
  severity: 'green' | 'amber' | 'red';
  blocked: boolean;
  behoben?: { nachMin: number; wer: [string, string]; note: string };
}): void {
  const k = merker.get(opt.merke)!;
  const s = BAUSTELLEN.findIndex((x) => site(x.nr) === k.site_id) + 1;
  const at = plus(String(k.started_at), 5);
  damages.push({
    id: bsp(6, 600 + damages.length + 1),
    org_id: ORG,
    site_id: k.site_id,
    inspection_id: k.id,
    scaffold_id: opt.geruest ? geruest(s, opt.geruest) : null,
    title: opt.title,
    description: opt.description,
    severity: opt.severity,
    scaffold_blocked: opt.blocked,
    photo_urls: [],
    status: opt.behoben ? 'resolved' : 'open',
    reported_by: k.performed_by,
    reporter_name: k.inspector_name,
    resolved_at: opt.behoben ? plus(at, opt.behoben.nachMin) : null,
    resolved_by: opt.behoben?.wer[1] ?? null,
    resolver_name: opt.behoben?.wer[0] ?? null,
    resolution_note: opt.behoben?.note ?? null,
    resolution_photo_urls: [],
    created_at: at,
  });
}

mangel({
  merke: 'B4',
  geruest: 'Fassade Süd',
  title: 'Verankerung in Lage 3 entfernt',
  description: 'Feld 4 bis 6, dritte Lage: zwei Gerüsthalter vom Fensterbauer ausgebaut. Gerüst komplett gesperrt, Zugänge mit „Zutritt verboten“ abgesperrt. Gerüstbauer ist informiert, Freigabe erst nach erneuter Prüfung.',
  severity: 'red',
  blocked: true,
});
mangel({
  merke: 'B2',
  geruest: 'Fassade Nord',
  title: 'Gerüstkennzeichnung schwer lesbar',
  description: 'Aushang am Zugang verblasst, Lastklasse kaum zu lesen. Neuer Aushang beim Gerüstbauer angefordert.',
  severity: 'green',
  blocked: false,
});
mangel({
  merke: 'B3',
  geruest: 'Fassade Hof',
  title: 'Schutznetz an Feld 7 eingerissen',
  description: 'Riss etwa 30 cm, mit Kabelbindern provisorisch geschlossen. Netz wird beim nächsten Umbau getauscht.',
  severity: 'green',
  blocked: false,
});
mangel({
  merke: 'B1',
  geruest: 'Fassade Süd',
  title: 'Seitenschutz in Lage 4 unvollständig',
  description: 'Zwischenholm in Feld 3 fehlt. Bereich abgesperrt.',
  severity: 'amber',
  blocked: true,
  behoben: { nachMin: 3 * 60, wer: ['F. Neumann', NEUMANN], note: 'Zwischenholm eingebaut, Bereich wieder freigegeben.' },
});
mangel({
  merke: 'B3-alt',
  geruest: 'Fassade Hof',
  title: 'Fußspindel ohne Unterlage',
  description: 'Spindel in Feld 1 stand direkt auf dem Pflaster. Bereich abgesperrt.',
  severity: 'amber',
  blocked: true,
  behoben: { nachMin: 2 * 60, wer: ['F. Neumann', NEUMANN], note: 'Lastverteilende Bohle untergelegt, Spindel nachgestellt.' },
});

export const daten: BeispielDaten = {
  app: 'geruestdex',
  nutzer: { id: INHABER, email: 'info@musterbau.example' },
  tabellen: {
    org: B.org,
    membership: B.membership,
    site: siteRows,
    scaffold: scaffoldRows,
    inspection: inspections,
    damage: damages,
  },
  rpc: {
    list_members: () => B.mitglieder,
  },
};
