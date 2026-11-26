// CraftDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/craftdex?beispiel, docs/beispiel-zugang.md).
// Persönliches Konto (kein Betrieb): eine erfundene kleine Schreinerei mit 13 Aufträgen — in Arbeit, Angebote,
// abgeschlossen und abgerechnet. Alles in der Tabelle projects (id, user_id, data jsonb, deleted, updated_at) wie der
// CraftDex-Cloud-Sync (src/craftdex/types.ts); Stunden auf 0,5 gerundet wie die App (api.ts → setLoggedHours).
// Kunden nur als „Fam. <häufiger Nachname>“, Initial + Nachname oder erfundene Firma, Telefon mit Vorwahl 0123,
// Adressen erfunden (PLZ 123xx), keine Markennamen.
//
// Was die Übersicht damit zeigt (src/craftdex/pages/Overview.tsx):
//   · In Arbeit 4 (13 Aufträge insgesamt) · Offene Angebote 3 · Abzurechnen 2 · Erfasste Stunden
//   · Anstehende Termine: 5, der erste seit 2 Tagen überfällig · Zuletzt bearbeitet: 8 Aufträge mit Stunden
// Liest die Listen über JSON-Pfade (data->>title …) — der Speicher-Client braucht dafür feld() (client-jsonpfad).
// Schema wie CraftDex/supabase/projects.sql und pro_overrides.sql.

import type { BeispielDaten, Zeile } from './typen.ts';

const NUTZER = 'b0000002-0000-4000-8000-000000000001';

/** Zeitpunkt vor `tage` Tagen um hh:mm (lokal), nie in der Zukunft — als epoch ms wie die App (createdAt/updatedAt) */
function vorMs(tage: number, hh: number, mm: number): number {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  d.setDate(d.getDate() - tage);
  while (d.getDay() === 0) d.setDate(d.getDate() - 1); // sonntags ruht die Werkstatt
  if (d.getTime() > Date.now() - 10 * 60_000) return vorMs(tage + 1, hh, mm);
  return d.getTime();
}

/** Termin in `tage` Tagen (negativ = vorbei), lokale Mitternacht wie das Datumsfeld der App */
function termin(tage: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + tage);
  return d.getTime();
}

type Status = 'quote' | 'in_progress' | 'completed' | 'invoiced';

interface A {
  nr: number;
  title: string;
  kunde?: { name: string; phone?: string; address?: string };
  status: Status;
  soll: number;
  ist: number;
  budget?: number;
  termin?: number;
  /** zuletzt bearbeitet vor … Tagen */
  vor: number;
  /** angelegt vor … Tagen */
  seit: number;
  description?: string;
  steps?: [string, boolean][];
  materials?: [string, string | undefined, boolean][];
  costs?: [string, number][];
}

const AUFTRAEGE: A[] = [
  {
    nr: 1,
    title: 'Einbauschrank Dachschräge',
    kunde: { name: 'Fam. Becker', phone: '0123 4567-31', address: 'Lindenallee 14, 12347 Musterstadt' },
    status: 'in_progress',
    soll: 32,
    ist: 18.5,
    budget: 3800,
    termin: 9,
    vor: 0,
    seit: 26,
    description: 'Schrank in die Dachschräge im Schlafzimmer (2. OG), Korpus Birke Multiplex, Fronten weiß lackiert. Links zwei Schiebetüren, rechts drei Schubkästen unter der Schräge.',
    steps: [
      ['Aufmaß vor Ort, Schräge mit Winkel aufgenommen', true],
      ['Zeichnung und Zuschnittliste', true],
      ['Platten zuschneiden und kanten', true],
      ['Korpusse verleimen', true],
      ['Fronten grundieren und lackieren', true],
      ['Schubkästen bauen, Auszüge montieren', false],
      ['Einbau vor Ort, Anpassen an die Schräge', false],
      ['Schiebetüren einhängen und einstellen', false],
    ],
    materials: [
      ['Birke Multiplex 19 mm', '8 Platten', true],
      ['MDF 16 mm für Fronten', '3 Platten', true],
      ['Vollauszüge 450 mm', '3 Paar', true],
      ['Schiebetürbeschlag', '1 Satz', false],
      ['Kantenumleimer Birke', '25 m', true],
      ['Weißlack seidenmatt', '2 × 2,5 l', true],
      ['Sockelblende', '2,4 m', false],
    ],
    costs: [
      ['Plattenmaterial Birke Multiplex', 742.4],
      ['MDF-Platten', 168.9],
      ['Auszüge und Topfbänder', 236.5],
      ['Schiebetürbeschlag', 214.0],
      ['Lack und Grundierung', 118.6],
      ['Kleinteile, Leim, Schrauben', 47.3],
    ],
  },
  {
    nr: 2,
    title: 'Küchenfronten erneuern',
    kunde: { name: 'K. Schmidt', phone: '0123 4567-48', address: 'Gartenstraße 9, 12345 Musterstadt' },
    status: 'in_progress',
    soll: 24,
    ist: 21,
    budget: 2450,
    termin: 4,
    vor: 1,
    seit: 33,
    description: '14 Fronten und 3 Blenden neu, Eiche furniert, geölt. Korpusse bleiben, Scharniere werden getauscht.',
    steps: [
      ['Fronten aufmessen, Bohrbild Scharniere aufnehmen', true],
      ['Furnierplatten zuschneiden', true],
      ['Kanten anleimen, schleifen', true],
      ['Ölen (2 Durchgänge)', true],
      ['Alte Fronten abbauen, neue montieren', false],
    ],
    materials: [
      ['Spanplatte Eiche furniert 19 mm', '4 Platten', true],
      ['Eiche-Kante 23 mm', '40 m', true],
      ['Hartwachsöl', '1 l', true],
      ['Topfscharniere mit Dämpfung', '28 Stück', true],
      ['Griffleisten Edelstahl', '17 Stück', false],
    ],
    costs: [
      ['Furnierplatten', 612.0],
      ['Kantenmaterial', 96.4],
      ['Scharniere', 178.6],
      ['Griffleisten', 204.0],
      ['Öl und Schleifmittel', 58.9],
    ],
  },
  {
    nr: 3,
    title: 'Haustür einstellen und abdichten',
    kunde: { name: 'Hausverwaltung Musterstadt', phone: '0123 4567-10', address: 'Marktplatz 5, 12345 Musterstadt' },
    status: 'in_progress',
    soll: 4,
    ist: 2.5,
    budget: 380,
    termin: -2,
    vor: 3,
    seit: 12,
    description: 'Haus 2: Tür schleift unten, Zugluft an der Bandseite. Bänder nachstellen, Dichtung erneuern, Bodendichtung prüfen.',
    steps: [
      ['Besichtigung, Ursache gefunden (Band abgesackt)', true],
      ['Bänder nachgestellt', true],
      ['Dichtung umlaufend tauschen', false],
      ['Bodendichtung einstellen', false],
    ],
    materials: [
      ['Türdichtung umlaufend', '6 m', true],
      ['Absenkdichtung 1000 mm', '1 Stück', false],
    ],
    costs: [
      ['Dichtungsprofil', 38.5],
      ['Absenkdichtung', 89.9],
    ],
  },
  {
    nr: 4,
    title: 'Werkbank für die Werkstatt',
    status: 'in_progress',
    soll: 12,
    ist: 7,
    budget: 650,
    vor: 6,
    seit: 40,
    description: 'Eigene Hobelbank-Ersatz: Buche-Platte 60 mm, Untergestell mit Schubkästen, eine Vorderzange.',
    steps: [
      ['Plattenrohlinge verleimen', true],
      ['Platte abrichten und schleifen', true],
      ['Untergestell bauen', true],
      ['Vorderzange montieren', false],
      ['Schubkästen', false],
    ],
    materials: [
      ['Buche Leimholz 40 mm', '2 Platten', true],
      ['Vorderzangen-Spindel', '1 Stück', false],
    ],
    costs: [
      ['Buche Leimholz', 318.0],
      ['Zangenspindel', 129.0],
    ],
  },
  {
    nr: 5,
    title: 'Terrasse mit Lärchendielen',
    kunde: { name: 'Fam. Weber', phone: '0123 4567-55', address: 'Am Sportplatz 2, 12355 Neudorf' },
    status: 'quote',
    soll: 40,
    ist: 1.5,
    budget: 6900,
    termin: 24,
    vor: 2,
    seit: 9,
    description: 'Ca. 28 m² Terrasse, Unterkonstruktion auf Stelzlagern, Lärche sibirisch glatt, verdeckte Befestigung. Angebot nach Aufmaß verschickt.',
    steps: [['Aufmaß und Gefälle geprüft', true], ['Angebot verschickt', true], ['Material bestellen (nach Zusage)', false]],
    materials: [['Lärche Terrassendielen 27 × 145 mm', '≈ 210 m', false], ['Unterkonstruktion Lärche 45 × 70 mm', '≈ 95 m', false]],
    costs: [],
  },
  {
    nr: 6,
    title: 'Treppe schleifen und ölen',
    kunde: { name: 'M. Hoffmann', phone: '0123 4567-62', address: 'Ahornweg 11, 12349 Musterstadt' },
    status: 'quote',
    soll: 14,
    ist: 0.5,
    budget: 1250,
    termin: 38,
    vor: 5,
    seit: 6,
    steps: [['Besichtigung', true], ['Angebot schreiben', true]],
    materials: [],
    costs: [],
  },
  {
    nr: 7,
    title: 'Innentüren tauschen (4 Stück)',
    kunde: { name: 'Fam. Schulz', phone: '0123 4567-77', address: 'Hauptstraße 48, 12357 Bergen' },
    status: 'quote',
    soll: 10,
    ist: 0,
    budget: 2980,
    vor: 8,
    seit: 8,
    steps: [],
    materials: [],
    costs: [],
  },
  {
    nr: 8,
    title: 'Fensterbänke innen (6 Stück)',
    kunde: { name: 'Fam. Neumann', phone: '0123 4567-84', address: 'Rosenstraße 3, 12351 Neudorf' },
    status: 'completed',
    soll: 8,
    ist: 9,
    budget: 920,
    termin: -6,
    vor: 4,
    seit: 24,
    steps: [['Aufmaß', true], ['Zuschnitt Eiche massiv', true], ['Ölen', true], ['Einbau', true]],
    materials: [['Eiche massiv 26 mm', '1 Platte', true]],
    costs: [['Eiche massiv', 284.0], ['Montagekleber, Silikon', 31.7]],
  },
  {
    nr: 9,
    title: 'Regalwand Büro',
    kunde: { name: 'Steuerbüro Klein', phone: '0123 4567-90', address: 'Bahnhofstraße 21, 12345 Musterstadt' },
    status: 'completed',
    soll: 16,
    ist: 15.5,
    budget: 1900,
    vor: 7,
    seit: 31,
    steps: [['Aufmaß', true], ['Korpusse fertigen', true], ['Lackieren', true], ['Montage an der Wand', true]],
    materials: [['MDF 19 mm', '5 Platten', true], ['Weißlack', '2,5 l', true]],
    costs: [['MDF-Platten', 281.5], ['Lack', 64.3], ['Wandbefestigung', 22.8]],
  },
  { nr: 10, title: 'Kinderhochbett Kiefer', kunde: { name: 'Fam. Wolf' }, status: 'invoiced', soll: 18, ist: 19.5, budget: 1650, vor: 12, seit: 45, costs: [['Kiefer Leimholz', 296.0], ['Beschläge', 54.2]] },
  { nr: 11, title: 'Gartenhaus: Dach neu eindecken', kunde: { name: 'Fam. Richter' }, status: 'invoiced', soll: 20, ist: 22, budget: 2400, vor: 19, seit: 58, costs: [['Rauspund 19 mm', 412.0], ['Bitumenschindeln', 236.8]] },
  { nr: 12, title: 'Badmöbel nach Maß', kunde: { name: 'Fam. Koch' }, status: 'invoiced', soll: 26, ist: 27.5, budget: 3100, vor: 27, seit: 74, costs: [['HPL-Platten', 534.0], ['Auszüge', 188.4]] },
  { nr: 13, title: 'Carport ausbessern', kunde: { name: 'Fam. Meyer' }, status: 'invoiced', soll: 6, ist: 5.5, budget: 540, vor: 41, seit: 52, costs: [['Douglasie Kantholz', 142.5]] },
];

const id = (nr: number) => `${(1_760_000_000_000 + nr * 7_919_000).toString(36)}${String(nr * 7919).padStart(6, '0')}`;

const projects: Zeile[] = AUFTRAEGE.map((a) => {
  const geaendert = vorMs(a.vor, 7 + ((a.nr * 5) % 10), (a.nr * 17) % 60);
  const angelegt = Math.min(vorMs(a.seit, 8, (a.nr * 23) % 60), geaendert - 3_600_000);
  const data: Record<string, unknown> = {
    id: id(a.nr),
    title: a.title,
    category: 'handwerk',
    estimatedHours: a.soll,
    loggedHours: a.ist,
    steps: (a.steps ?? []).map(([title, done], i) => ({ id: `s_${id(a.nr)}${i}`, title, done })),
    materials: (a.materials ?? []).map(([name, amount, done], i) => ({ id: `m_${id(a.nr)}${i}`, name, ...(amount ? { amount } : {}), done })),
    costs: (a.costs ?? []).map(([name, price], i) => ({ id: `c_${id(a.nr)}${i}`, name, price })),
    status: a.status,
    createdAt: angelegt,
    updatedAt: geaendert,
  };
  if (a.description) data.description = a.description;
  if (a.budget != null) data.budget = a.budget;
  if (a.termin != null) data.deadline = { date: termin(a.termin) };
  if (a.kunde) data.customer = a.kunde;
  return { id: id(a.nr), user_id: NUTZER, data, deleted: false, updated_at: new Date(geaendert).toISOString() };
});

export const daten: BeispielDaten = {
  app: 'craftdex',
  nutzer: { id: NUTZER, email: 'werkstatt@schreinerei-muster.example' },
  tabellen: {
    projects,
    // manuelle Freischaltung (src/craftdex/pro.ts → craftProStand): keine — Pro kommt im Beispiel aus dem Abo (netz.ts)
    pro_overrides: [],
  },
};

