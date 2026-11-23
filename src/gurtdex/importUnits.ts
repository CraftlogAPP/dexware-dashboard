// GurtDex — PSA gegen Absturz aus einer Excel-/CSV-Liste übernehmen (Adapter). Ablauf, Regeln und Oberfläche:
// pruefen/importUnits.ts + components/ImportWizard.tsx. Hier nur die GurtDex-Felder (wie Formular und Prüfbuch-Export)
// und das Schreiben über api.ts (siteRow/itemRow = dieselben Zeilen wie beim Anlegen von Hand).
// Herstellungsdatum und erste Benutzung werden wie im Formular als „JJJJ-MM“ gespeichert (types.ts → normalizeIsoMonth),
// die Gebrauchsdauer als Zahl — so stimmt die Ablegereife-Rechnung (lifespanEnd) danach genau wie bei Handeingabe.

import { cap, oneLine, pickOption, type ImportField } from '../lib/tableImport';
import type { UnitImportDef, UnitImportSpec } from '../pruefen/importUnits';
import { fetchItems, fetchSites, insertItems, insertSites, itemRow, siteRow, type ItemInput } from './api';
import { GURTDEX_EXPORT } from './exportLists';
import { GURTDEX_VOR_ORT } from './vorOrt';
import { ITEM_CATEGORIES, normalizeIsoMonth, type PsaItem, type Site } from './types';

/** Stammdaten eines PSA-Artikels ohne Standort, Notizen und „ausgesondert“ */
export type ItemData = Omit<ItemInput, 'site_id' | 'notes' | 'retired'>;

const CATEGORY_DEFAULT = 'Sonstige PSAgA';

// Normnummern zählen mit: auf Etiketten und in Prüflisten steht oft nur „EN 361“
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  'Auffanggurt (EN 361)': ['auffanggurt', 'auffanggurte', 'gurt', 'ganzkoerpergurt', 'sicherheitsgurt', 'absturzgurt', 'en361', 'kombigurt'],
  'Halte-/Sitzgurt (EN 358/813)': ['haltegurt', 'sitzgurt', 'huefgurt', 'arbeitsplatzpositionierung', 'en358', 'en813', 'haltesitzgurt'],
  'Verbindungsmittel mit Falldämpfer (EN 354/355)': ['verbindungsmittel', 'falldaempfer', 'bandfalldaempfer', 'lanyard', 'en354', 'en355', 'yverbindungsmittel', 'verbindungsseil'],
  'Höhensicherungsgerät (EN 360)': ['hoehensicherungsgeraet', 'hsg', 'hoehensicherung', 'sicherungsrolle', 'fallbremse', 'en360', 'srl'],
  'Mitlaufendes Auffanggerät (EN 353)': ['mitlaufendesauffanggeraet', 'mitlaufendes', 'auffanggeraet', 'steigschutz', 'steigschutzlaeufer', 'en353', 'seilkuerzer'],
  'Karabiner / Verbindungselement (EN 362)': ['karabiner', 'verbindungselement', 'karabinerhaken', 'schnapphaken', 'schraubkarabiner', 'en362'],
  'Kernmantelseil (EN 1891)': ['kernmantelseil', 'seil', 'statikseil', 'halbstatikseil', 'arbeitsseil', 'en1891'],
  'Bandschlinge / Anschlagmittel (EN 566/795 B)': ['bandschlinge', 'anschlagmittel', 'anschlagschlinge', 'rundschlinge', 'anschlageinrichtung', 'en566', 'en795', 'en795b'],
  'Schutzhelm mit Kinnriemen (EN 397/12492)': ['schutzhelm', 'helm', 'industriehelm', 'steigerhelm', 'kletterhelm', 'en397', 'en12492'],
  'Rettungs-/Abseilgerät (EN 341/1496)': ['rettungsgeraet', 'abseilgeraet', 'rettungshubgeraet', 'rettungsset', 'abseilgeraete', 'en341', 'en1496'],
};

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mae: 3, mar: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 };

/**
 * Monatsangabe → „JJJJ-MM“ wie das Formular. Erkannt wird alles, was die App erkennt (normalizeIsoMonth: 2023-04,
 * 04/2023, 15.04.2023 …), dazu „April 2023“, „04/23“ und ein reines Jahr (→ Januar, also die frühestmögliche Ablegereife).
 * `note`: Hinweis für die Vorschau; nicht Erkanntes bleibt wörtlich stehen (wie im Formular) — ohne Ablegereife-Rechnung.
 */
export function monthOf(raw: string): { value: string | null; note: string } {
  const t = oneLine(raw);
  if (!t) return { value: null, note: '' };
  const iso = normalizeIsoMonth(t);
  if (iso) return { value: iso, note: '' };
  const norm = t.toLowerCase().replace(/ä/g, 'ae');
  let r = /^([a-z]{3})[a-z]*\.?\s*(\d{4})$/.exec(norm);
  if (r && MONTHS[r[1]]) {
    const v = normalizeIsoMonth(`${r[2]}-${MONTHS[r[1]]}`);
    if (v) return { value: v, note: '' };
  }
  r = /^(\d{1,2})[./-](\d{2})$/.exec(t);
  if (r) {
    const yy = +r[2];
    const now = new Date().getFullYear() % 100;
    const v = normalizeIsoMonth(`${yy <= now + 1 ? 2000 + yy : 1900 + yy}-${r[1]}`);
    if (v) return { value: v, note: '' };
  }
  r = /^(\d{4})$/.exec(t);
  if (r) {
    const v = normalizeIsoMonth(`${r[1]}-01`);
    if (v) return { value: v, note: 'nur das Jahr → als Januar übernommen (frühestmögliche Ablegereife)' };
  }
  return { value: cap(t, 20), note: 'nicht als Monat erkannt — Ablegereife wird nicht berechnet, bitte als JJJJ-MM eintragen' };
}

/** „10“, „10 Jahre“, „10 J.“ → „10“ (wie das Formular, das eine Zahl erwartet); anderes bleibt wörtlich. */
export function yearsOf(raw: string): { value: string | null; note: string } {
  const t = oneLine(raw);
  if (!t) return { value: null, note: '' };
  const r = /^(\d{1,2})(?:[.,]0+)?\s*(?:j|jahr|jahre|a|years?)?\.?$/i.exec(t);
  if (r) return { value: String(+r[1]), note: '' };
  return { value: cap(t, 20), note: `Gebrauchsdauer „${t}“ ist keine Zahl — Ablegereife wird nicht berechnet` };
}

const options = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));
const text = (s: string, n: number) => {
  const v = cap(oneLine(s), n);
  return v ? v : null;
};

/** Felder in der Reihenfolge des Formulars — Überschriften wie Formular und Prüfbuch-Export */
const FIELDS: ImportField[] = [
  { key: 'category', label: 'Ausrüstungsart', exact: ['ausruestungsart', 'art', 'typ', 'kategorie', 'psaart', 'geraeteart', 'ausruestung'], prefix: ['ausruestungsart', 'psaart'] },
  { key: 'manufacturer', label: 'Hersteller', exact: ['hersteller', 'marke', 'fabrikat', 'firma'], prefix: ['hersteller', 'fabrikat'] },
  { key: 'model', label: 'Typ / Modell', exact: ['typmodell', 'typmodelletikett', 'modell', 'typenbezeichnung', 'produkt', 'artikel', 'produktname'], prefix: ['typmodell', 'modell'] },
  {
    key: 'serial_no',
    label: 'Seriennummer',
    exact: ['seriennummer', 'seriennummeretiketten365', 'seriennr', 'snr', 'chargennummer', 'charge', 'losnummer', 'inventarnummer', 'identnummer'],
    prefix: ['seriennummer', 'seriennr', 'chargen'],
  },
  {
    key: 'manufacture_date',
    label: 'Herstellungsdatum',
    exact: ['herstellungsdatum', 'herstellungsdatumablegereife', 'herstelldatum', 'herstellungsmonat', 'herstellungsjahr', 'baujahr', 'produktionsdatum', 'hergestellt'],
    prefix: ['herstellungs', 'herstelldatum', 'produktionsdatum'],
  },
  {
    key: 'first_use_date',
    label: 'Erste Benutzung',
    exact: ['erstebenutzung', 'erstebenutzungoptional', 'ersteinsatz', 'inbetriebnahme', 'erstgebrauch', 'gebrauchab', 'ausgabedatum'],
    prefix: ['erstebenutzung', 'ersteinsatz', 'inbetriebnahme'],
  },
  {
    key: 'max_life_years',
    label: 'Max. Gebrauchsdauer (Jahre)',
    exact: ['maxgebrauchsdauerjahre', 'maxgebrauchsdauerltherstellerjahre', 'gebrauchsdauer', 'lebensdauer', 'maxlebensdauer', 'nutzungsdauer', 'gebrauchsdauerjahre', 'lebensdauerjahre'],
    prefix: ['maxgebrauchsdauer', 'gebrauchsdauer', 'lebensdauer', 'nutzungsdauer'],
  },
  {
    key: 'wearer_name',
    label: 'Träger/in',
    exact: ['traegerin', 'traeger', 'zugeordnetertraegerinpersoenlichepsa', 'mitarbeiter', 'mitarbeiterin', 'benutzer', 'nutzer', 'person', 'zugeordnet'],
    prefix: ['traeger', 'zugeordnete', 'mitarbeiter'],
  },
];

export const GURTDEX_IMPORT_SPEC: UnitImportSpec<PsaItem, ItemData> = {
  cfg: GURTDEX_VOR_ORT,
  dueName: GURTDEX_EXPORT.dueName,
  retiredHeader: GURTDEX_EXPORT.retiredHeader,
  nameLabel: 'Bezeichnung / Nummer',
  nameHeaders: ['bezeichnungnummer', 'psanummer', 'psanr', 'nummer', 'artikelnummer'],
  fields: FIELDS,
  serialKey: 'serial_no',
  serialOf: (p) => p.serial_no,
  build(get) {
    const hints: string[] = [];
    const cat = pickOption(get('category'), options(ITEM_CATEGORIES), CATEGORY_SYNONYMS, CATEGORY_DEFAULT);
    if (cat.how === 'unknown') hints.push(`Ausrüstungsart „${oneLine(get('category'))}“ unbekannt → ${CATEGORY_DEFAULT}`);
    if (cat.how === 'empty') hints.push(`Ausrüstungsart fehlt → ${CATEGORY_DEFAULT}`);
    const made = monthOf(get('manufacture_date'));
    if (made.note) hints.push(`Herstellungsdatum: ${made.note}`);
    const first = monthOf(get('first_use_date'));
    if (first.note) hints.push(`Erste Benutzung: ${first.note}`);
    const life = yearsOf(get('max_life_years'));
    if (life.note) hints.push(life.note);
    return {
      input: {
        name: cap(oneLine(get('name')), 120),
        category: cat.value,
        manufacturer: text(get('manufacturer'), 120),
        model: text(get('model'), 120),
        serial_no: text(get('serial_no'), 80),
        manufacture_date: made.value,
        first_use_date: first.value,
        max_life_years: life.value,
        wearer_name: text(get('wearer_name'), 120),
      },
      hints,
    };
  },
  describe: (p) =>
    [p.category, p.manufacturer, p.serial_no ? `Nr. ${p.serial_no}` : '', p.manufacture_date ? `hergestellt ${p.manufacture_date}` : '', p.max_life_years ? `${p.max_life_years} Jahre` : '']
      .filter(Boolean)
      .join(' · '),
  example: [
    { site: 'Lager Graz', siteAddress: 'Lagerstraße 3, 8020 Graz', name: 'PSA-01 Kolonne Süd', category: 'Auffanggurt (EN 361)', manufacturer: 'Petzl', model: 'Newton', serial_no: '23A0815', manufacture_date: '2023-04', first_use_date: '2023-06', max_life_years: '10', wearer_name: 'M. Krause', lastInspection: '14.03.2025' },
    { site: 'Lager Graz', name: 'HSG 1', category: 'HSG', manufacturer: 'Skylotec', serial_no: 'H-2201', manufacture_date: '01/2022' },
    { site: 'Baustelle Nord', name: 'Verbindungsmittel 3', category: 'Falldämpfer', manufacture_date: '05/2019', max_life_years: '8 Jahre', notes: 'Kolonne Nord' },
  ],
};

export const GURTDEX_IMPORT: UnitImportDef<PsaItem, Site, PsaItem, ItemData> = {
  spec: GURTDEX_IMPORT_SPEC,
  api: {
    fetchSites,
    fetchUnits: (sb) => fetchItems(sb),
    siteRow: (orgId, name, address) =>
      siteRow(orgId, { name, address, operator_name: null, operator_contact: null, notes: null, active: true }),
    unitRow: (orgId, input, siteId, notes) => itemRow(orgId, { ...input, site_id: siteId, notes, retired: false }),
    insertSites,
    insertUnits: insertItems,
  },
};
