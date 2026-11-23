// ToreDex — Tore und Türen aus einer Excel-/CSV-Liste übernehmen (Adapter). Ablauf, Regeln und Oberfläche:
// pruefen/importUnits.ts + components/ImportWizard.tsx. Hier nur die ToreDex-Felder (wie Formular und Prüfbuch-Export)
// und das Schreiben über api.ts (siteRow/gateRow = dieselben Zeilen wie beim Anlegen von Hand).

import { cap, oneLine, pickOption, type ImportField } from '../lib/tableImport';
import type { UnitImportDef, UnitImportSpec } from '../pruefen/importUnits';
import { fetchGates, fetchSites, gateRow, insertGates, insertSites, siteRow, type GateInput } from './api';
import { TOREDEX_EXPORT } from './exportLists';
import { TOREDEX_VOR_ORT } from './vorOrt';
import { GATE_CATEGORIES, GATE_DRIVE_TYPES, type Gate, type Site } from './types';

/** Stammdaten eines Tors ohne Objekt, Notizen und „stillgelegt“ */
export type GateData = Omit<GateInput, 'site_id' | 'notes' | 'retired'>;

const CATEGORY_DEFAULT = 'Sonstige';
const DRIVE_DEFAULT = 'Unbekannt';

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  Sectionaltor: ['sectionaltor', 'sektionaltor', 'sektionstor', 'deckenlauftor', 'industriesectionaltor', 'garagentor', 'sektional', 'sectional'],
  'Rolltor / Rollgitter': ['rolltor', 'rollgitter', 'rolltore', 'rollladentor', 'rollladen', 'rollgittertor', 'rollo', 'rolltorrollgitter'],
  Schiebetor: ['schiebetor', 'schiebetore', 'freitragendesschiebetor', 'laufschienentor', 'schiebegitter'],
  Drehflügeltor: ['drehfluegeltor', 'fluegeltor', 'drehtor', 'einfahrtstor', 'zweifluegeltor', 'einfluegeltor', 'hoftor', 'drehfluegel'],
  Falttor: ['falttor', 'faltschiebetor', 'falttore'],
  Kipptor: ['kipptor', 'schwingtor', 'garagenschwingtor', 'kippschwingtor'],
  Schnelllauftor: ['schnelllauftor', 'schnellauftor', 'schnelllauf', 'spiraltor', 'folienschnelllauftor', 'hochleistungstor'],
  Schranke: ['schranke', 'schrankenanlage', 'parkschranke', 'drehschranke'],
  'Karusselltür / Automatiktür': ['karusselltuer', 'automatiktuer', 'drehtuer', 'schiebetuer', 'automatikschiebetuer', 'automatischetuer', 'karussell'],
};

const DRIVE_SYNONYMS: Record<string, string[]> = {
  Kraftbetätigt: ['kraftbetaetigt', 'elektrisch', 'automatisch', 'motor', 'motorisch', 'antrieb', 'automatik', 'elektromotorisch', 'hydraulisch', 'pneumatisch', 'kraft'],
  Handbetätigt: ['handbetaetigt', 'manuell', 'hand', 'handbetrieb', 'ohneantrieb', 'mechanisch', 'vonhand'],
};

const options = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));
const text = (s: string, n: number) => {
  const v = cap(oneLine(s), n);
  return v ? v : null;
};

/** Felder in der Reihenfolge des Formulars — Überschriften wie Formular und Prüfbuch-Export */
const FIELDS: ImportField[] = [
  { key: 'category', label: 'Torart', exact: ['torart', 'tortyp', 'art', 'typ', 'bauart', 'kategorie'], prefix: ['torart', 'tortyp'] },
  { key: 'drive_type', label: 'Antrieb', exact: ['antrieb', 'antriebsart', 'betaetigung', 'bedienung'], prefix: ['antrieb', 'betaetigung'] },
  { key: 'manufacturer', label: 'Hersteller', exact: ['hersteller', 'marke', 'fabrikat', 'firma'], prefix: ['hersteller', 'fabrikat'] },
  { key: 'build_year', label: 'Baujahr (Typenschild)', exact: ['baujahr', 'herstelljahr', 'herstellungsjahr', 'jahr', 'einbaujahr', 'bj'], prefix: ['baujahr', 'einbau'] },
  {
    key: 'dimensions',
    label: 'Maße B × H (m)',
    exact: ['massebhm', 'masse', 'massebh', 'abmessungen', 'groesse', 'breitexhoehe', 'bxh', 'lichtemasse', 'durchfahrtsmasse'],
    prefix: ['masse', 'abmessung', 'groesse'],
  },
  {
    key: 'serial_no',
    label: 'Serien-/Identnummer',
    exact: ['serienidentnummer', 'seriennummer', 'seriennr', 'identnummer', 'identnr', 'fabriknummer', 'inventarnummer', 'snr'],
    prefix: ['seriennummer', 'identnummer', 'fabriknummer'],
  },
];

export const TOREDEX_IMPORT_SPEC: UnitImportSpec<Gate, GateData> = {
  cfg: TOREDEX_VOR_ORT,
  dueName: TOREDEX_EXPORT.dueName,
  retiredHeader: TOREDEX_EXPORT.retiredHeader,
  nameLabel: 'Bezeichnung',
  nameHeaders: ['tornummer', 'tornr', 'tor', 'nummer', 'torbezeichnung'],
  fields: FIELDS,
  serialKey: 'serial_no',
  serialOf: (g) => g.serial_no,
  siteGenus: 'n',
  build(get) {
    const hints: string[] = [];
    const cat = pickOption(get('category'), options(GATE_CATEGORIES), CATEGORY_SYNONYMS, CATEGORY_DEFAULT);
    if (cat.how === 'unknown') hints.push(`Torart „${oneLine(get('category'))}“ unbekannt → ${CATEGORY_DEFAULT}`);
    if (cat.how === 'empty') hints.push(`Torart fehlt → ${CATEGORY_DEFAULT}`);
    const drive = pickOption(get('drive_type'), options(GATE_DRIVE_TYPES), DRIVE_SYNONYMS, DRIVE_DEFAULT);
    if (drive.how === 'unknown') hints.push(`Antrieb „${oneLine(get('drive_type'))}“ unbekannt → ${DRIVE_DEFAULT}`);
    return {
      input: {
        name: cap(oneLine(get('name')), 120),
        category: cat.value,
        drive_type: drive.value,
        manufacturer: text(get('manufacturer'), 120),
        build_year: text(get('build_year'), 10),
        dimensions: text(get('dimensions'), 40),
        serial_no: text(get('serial_no'), 80),
      },
      hints,
    };
  },
  describe: (g) => [g.category, g.drive_type !== DRIVE_DEFAULT ? g.drive_type : '', g.manufacturer, g.dimensions, g.serial_no ? `Nr. ${g.serial_no}` : '']
    .filter(Boolean)
    .join(' · '),
  example: [
    { site: 'Logistikzentrum', siteAddress: 'Industriestraße 12, 4020 Linz', name: 'T-01 Rampe 1', category: 'Sectionaltor', drive_type: 'Kraftbetätigt', manufacturer: 'Hörmann', build_year: '2015', dimensions: '3 × 3,5', serial_no: 'H-123456', lastInspection: '03.04.2025' },
    { site: 'Logistikzentrum', name: 'T-02 Schnelllauf', category: 'Schnelllauftor', drive_type: 'elektrisch', manufacturer: 'Efaflex' },
    { site: 'Tiefgarage Nord', name: 'Einfahrt', category: 'Rolltor', drive_type: 'Motor', notes: 'Wartungsvertrag bis 2027' },
  ],
};

export const TOREDEX_IMPORT: UnitImportDef<Gate, Site, Gate, GateData> = {
  spec: TOREDEX_IMPORT_SPEC,
  api: {
    fetchSites,
    fetchUnits: (sb) => fetchGates(sb),
    siteRow: (orgId, name, address) =>
      siteRow(orgId, { name, address, operator_name: null, operator_contact: null, notes: null, active: true }),
    unitRow: (orgId, input, siteId, notes) => gateRow(orgId, { ...input, site_id: siteId, notes, retired: false }),
    insertSites,
    insertUnits: insertGates,
  },
};
