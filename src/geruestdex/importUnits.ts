// GerüstDex — Baustellen und ihre Gerüste aus einer Excel-/CSV-Liste übernehmen (Adapter, Orts-Modus). Geprüft wird
// die Baustelle als Ganzes, deshalb legt der Import Baustellen an (Adresse, Auftraggeber, Status) und auf Wunsch ihre
// Gerüste. Ablauf, Regeln und Oberfläche: pruefen/importUnits.ts + components/ImportWizard.tsx. Geschrieben wird über
// api.ts (siteRow/scaffoldRow = dieselben Zeilen wie beim Anlegen von Hand).

import { cap, oneLine, parseDay, pickOption, type ImportField } from '../lib/tableImport';
import type { UnitImportDef, UnitImportSpec } from '../pruefen/importUnits';
import { fetchScaffolds, fetchSites, insertScaffolds, insertSites, scaffoldRow, siteRow, type ScaffoldInput } from './api';
import { GERUESTDEX_EXPORT } from './exportLists';
import { GERUESTDEX_VOR_ORT } from './vorOrt';
import { LOAD_CLASSES, SCAFFOLD_CATEGORIES, WIDTH_CLASSES, type Scaffold, type Site } from './types';

/** Stammdaten eines Gerüsts ohne Baustelle, Notizen und „abgebaut“ */
export type ScaffoldData = Omit<ScaffoldInput, 'site_id' | 'notes' | 'retired'>;

const CATEGORY_DEFAULT = 'Sonstiges';

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  Fassadengerüst: ['fassadengeruest', 'fassade', 'rahmengeruest', 'arbeitsgeruest', 'standgeruest', 'fassadengerueste', 'systemgeruest'],
  'Fahrgerüst (Rollgerüst)': ['fahrgeruest', 'rollgeruest', 'fahrbaresgeruest', 'mobilgeruest', 'alurollgeruest'],
  Raumgerüst: ['raumgeruest', 'flaechengeruest', 'innengeruest', 'deckengeruest'],
  'Schutzgerüst / Fanggerüst': ['schutzgeruest', 'fanggeruest', 'schutzdach', 'schutzwand', 'fangnetz', 'schutzgeruestfanggeruest'],
  Dachfanggerüst: ['dachfanggeruest', 'dachfang', 'dachschutzwand', 'dachfangwand'],
  Hängegerüst: ['haengegeruest', 'haengend', 'haengendesgeruest', 'brueckenhaengegeruest'],
  Traggerüst: ['traggeruest', 'lehrgeruest', 'stuetzgeruest', 'schalungstraggeruest'],
  Bockgerüst: ['bockgeruest', 'bock', 'geruestbock', 'arbeitsbock'],
};

const options = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));
const text = (s: string, n: number) => {
  const v = cap(oneLine(s), n);
  return v ? v : null;
};

// Lastklasse nach EN 12811-1: Nummer oder Flächenlast (kN/m² bzw. kg/m²)
const LOAD_KN = [0.75, 1.5, 2, 3, 4.5, 6];

/** „3“, „LK 3“, „Lastklasse 3“, „3 (2,00 kN/m²)“, „2 kN/m²“, „200 kg/m²“ → Wert der Auswahl; null = leer/unbekannt */
export function loadClassOf(raw: string): { value: string | null; note: string } {
  const t = oneLine(raw);
  if (!t) return { value: null, note: '' };
  const exact = LOAD_CLASSES.find((c) => c === t);
  if (exact) return { value: exact, note: '' };
  const num = (s: string) => Number(s.replace(',', '.'));
  let r = /(\d+(?:[.,]\d+)?)\s*kn/i.exec(t);
  let i = r ? LOAD_KN.indexOf(num(r[1])) : -1;
  if (i < 0 && (r = /(\d+(?:[.,]\d+)?)\s*kg/i.exec(t))) i = LOAD_KN.indexOf(num(r[1]) / 100);
  if (i < 0 && (r = /^(?:lk|lastklasse|lastkl\.?|klasse)?\s*([1-6])(?:\s|\(|$)/i.exec(t))) i = +r[1] - 1;
  if (i >= 0) return { value: LOAD_CLASSES[i], note: '' };
  return { value: null, note: `Lastklasse „${t}“ unbekannt → unbekannt` };
}

/** „W09“, „W 9“, „09“, „0,9 m“, „90 cm“ → W09; null = leer/unbekannt */
export function widthClassOf(raw: string): { value: string | null; note: string } {
  const t = oneLine(raw);
  if (!t) return { value: null, note: '' };
  let n: number | null = null;
  let r: RegExpExecArray | null;
  if ((r = /^(?:w|breitenklasse|bk)?\s*0?(\d{1,2})$/i.exec(t))) n = +r[1];
  else if ((r = /^(\d+(?:[.,]\d+)?)\s*m$/i.exec(t))) n = Math.round(Number(r[1].replace(',', '.')) * 10);
  else if ((r = /^(\d{2,3})\s*cm$/i.exec(t))) n = Math.round(+r[1] / 10);
  const v = n === null ? undefined : WIDTH_CLASSES.find((c) => c === `W${String(n).padStart(2, '0')}`);
  if (v) return { value: v, note: '' };
  return { value: null, note: `Breitenklasse „${t}“ unbekannt → unbekannt` };
}

/** Felder in der Reihenfolge des Formulars — Überschriften wie Formular und Prüfbuch-Export (Blatt „Gerüste“) */
const FIELDS: ImportField[] = [
  { key: 'category', label: 'Bauart', exact: ['bauart', 'geruestart', 'geruesttyp', 'art', 'typ', 'kategorie'], prefix: ['bauart', 'geruestart'] },
  { key: 'manufacturer', label: 'Gerüstsystem', exact: ['geruestsystem', 'system', 'hersteller', 'fabrikat', 'systemhersteller'], prefix: ['geruestsystem', 'hersteller'] },
  { key: 'erected_by', label: 'Ersteller (Gerüstbaubetrieb)', exact: ['erstellergeruestbaubetrieb', 'ersteller', 'geruestbaubetrieb', 'geruestbauer', 'aufgebautvon', 'errichter', 'geruestersteller'], prefix: ['ersteller', 'geruestbau'] },
  {
    key: 'erected_at',
    label: 'Aufbaudatum (lt. Kennzeichnung)',
    exact: ['aufbaudatumltkennzeichnung', 'aufbaudatum', 'aufgebautam', 'errichtetam', 'erstelltam', 'aufbau', 'freigabedatum'],
    prefix: ['aufbaudatum', 'aufgebaut', 'errichtet'],
  },
  { key: 'load_class', label: 'Lastklasse (EN 12811-1)', exact: ['lastklasseen128111', 'lastklasse', 'lk', 'lastkl'], prefix: ['lastklasse'] },
  { key: 'width_class', label: 'Breitenklasse (EN 12811-1)', exact: ['breitenklasseen128111', 'breitenklasse', 'bk', 'breite'], prefix: ['breitenklasse'] },
];

export const GERUESTDEX_IMPORT_SPEC: UnitImportSpec<Scaffold, ScaffoldData> = {
  cfg: GERUESTDEX_VOR_ORT,
  dueName: GERUESTDEX_EXPORT.dueName,
  retiredHeader: GERUESTDEX_EXPORT.retiredHeader,
  bookName: GERUESTDEX_EXPORT.bookName,
  nameLabel: 'Bezeichnung',
  nameHeaders: ['geruestbezeichnung', 'geruestnummer', 'geruestnr', 'abschnitt', 'bauabschnitt'],
  fields: FIELDS,
  siteLabels: { operator: 'Auftraggeber / Bauherr', contact: 'Auftraggeber-Kontakt' },
  siteGenus: 'f',
  siteHeaders: ['bauvorhaben', 'bv', 'projekt', 'bauprojekt', 'objekt', 'einsatzstelle'],
  build(get) {
    const hints: string[] = [];
    const cat = pickOption(get('category'), options(SCAFFOLD_CATEGORIES), CATEGORY_SYNONYMS, CATEGORY_DEFAULT);
    if (cat.how === 'unknown') hints.push(`Bauart „${oneLine(get('category'))}“ unbekannt → ${CATEGORY_DEFAULT}`);
    if (cat.how === 'empty') hints.push(`Bauart fehlt → ${CATEGORY_DEFAULT}`);
    const load = loadClassOf(get('load_class'));
    if (load.note) hints.push(load.note);
    const width = widthClassOf(get('width_class'));
    if (width.note) hints.push(width.note);
    // Aufbaudatum wie im Formular (TT.MM.JJJJ); Unbekanntes bleibt wörtlich
    const at = oneLine(get('erected_at'));
    return {
      input: {
        name: cap(oneLine(get('name')), 120),
        category: cat.value,
        manufacturer: text(get('manufacturer'), 120),
        erected_by: text(get('erected_by'), 160),
        erected_at: at ? (parseDay(at) ?? cap(at, 40)) : null,
        load_class: load.value,
        width_class: width.value,
      },
      hints,
    };
  },
  describe: (g) => [g.category, g.manufacturer, g.load_class ? `LK ${g.load_class.split(' ')[0]}` : '', g.width_class ?? '', g.erected_at ? `aufgebaut ${g.erected_at}` : '']
    .filter(Boolean)
    .join(' · '),
  example: [
    { site: 'BV Musterstraße 12', siteAddress: 'Musterstraße 12, 8010 Graz', siteOperator: 'Muster Bau GmbH', name: 'Fassade Nord', category: 'Fassadengerüst', manufacturer: 'Layher Blitz', erected_by: 'Gerüstbau Huber', erected_at: '05.07.2026', load_class: '3', width_class: 'W09' },
    { site: 'BV Musterstraße 12', name: 'Fassade Süd', category: 'Fassade', load_class: '4 (3,00 kN/m²)', width_class: 'W06' },
    { site: 'Halle 2 Innenausbau', siteAddress: 'Industriepark 5, 8020 Graz', siteOperator: 'Stadtwerke Graz', notes: 'Zufahrt über Tor 3', lastInspection: '03.11.2026' },
  ],
};

export const GERUESTDEX_IMPORT: UnitImportDef<Scaffold, Site, Scaffold, ScaffoldData> = {
  spec: GERUESTDEX_IMPORT_SPEC,
  api: {
    fetchSites,
    fetchUnits: (sb) => fetchScaffolds(sb),
    siteRow: (orgId, name, address, extra) =>
      siteRow(orgId, {
        name,
        address,
        operator_name: extra?.operator ?? null,
        operator_contact: extra?.contact ?? null,
        notes: extra?.notes ?? null,
        active: extra?.active ?? true,
      }),
    unitRow: (orgId, input, siteId, notes) => scaffoldRow(orgId, { ...input, site_id: siteId, notes, retired: false }),
    insertSites,
    insertUnits: insertScaffolds,
  },
};
