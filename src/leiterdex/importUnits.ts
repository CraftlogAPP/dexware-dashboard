// LeiterDex — Leitern & Tritte aus einer Excel-/CSV-Liste übernehmen (Adapter). Ablauf, Regeln und Oberfläche:
// pruefen/importUnits.ts + components/ImportWizard.tsx. Hier nur die LeiterDex-Felder (wie Formular und Prüfbuch-Export)
// und das Schreiben über api.ts (siteRow/ladderRow = dieselben Zeilen wie beim Anlegen von Hand).

import { cap, oneLine, pickOption, type ImportField } from '../lib/tableImport';
import type { UnitImportDef, UnitImportSpec } from '../pruefen/importUnits';
import { fetchLadders, fetchSites, insertLadders, insertSites, ladderRow, siteRow, type LadderInput } from './api';
import { LEITERDEX_EXPORT } from './exportLists';
import { LEITERDEX_VOR_ORT } from './vorOrt';
import { LADDER_CATEGORIES, LADDER_MATERIALS, type Ladder, type Site } from './types';

/** Stammdaten einer Leiter ohne Standort, Notizen und „ausgesondert“ */
export type LadderData = Omit<LadderInput, 'site_id' | 'notes' | 'retired'>;

const CATEGORY_DEFAULT = 'Sonstige';
/** Vorgabe des Formulars beim neuen Eintrag */
const MATERIAL_DEFAULT = 'Aluminium';

/** Andere Schreibweisen der Bauarten (Herstellerkataloge, alte Listen) */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  Anlegeleiter: ['anstellleiter', 'anlegeleiter', 'sprossenanlegeleiter', 'stufenanlegeleiter', 'einteiligeleiter', 'einfacheleiter'],
  Schiebeleiter: ['schiebeleiter', 'zweiteiligeschiebeleiter', 'dreiteiligeschiebeleiter', 'ausziehleiter'],
  Seilzugleiter: ['seilzug', 'seilzugleiter', 'feuerwehrleiter'],
  Stehleiter: ['stehleiter', 'doppelleiter', 'bockleiter', 'stufenstehleiter', 'sprossenstehleiter', 'klappleiter', 'haushaltsleiter', 'malerleiter', 'trittleiter'],
  'Mehrzweck-/Gelenkleiter': ['mehrzweckleiter', 'gelenkleiter', 'kombileiter', 'kombinationsleiter', 'universalleiter', 'vielzweckleiter', 'teleskopgelenkleiter', 'mehrzweck', 'gelenk'],
  Teleskopleiter: ['teleskop', 'teleskopleiter', 'teleskopanlegeleiter'],
  Podestleiter: ['podest', 'podestleiter', 'plattformleiter', 'arbeitsbuehne', 'kommissionierleiter'],
  Tritt: ['tritt', 'stufentritt', 'klapptritt', 'tritthocker', 'elefantenfuss', 'rolltritt', 'trittschemel'],
};

const MATERIAL_SYNONYMS: Record<string, string[]> = {
  Aluminium: ['alu', 'aluminium', 'aluminum', 'leichtmetall'],
  Holz: ['holz', 'holzleiter', 'wood'],
  'GFK/Kunststoff': ['gfk', 'kunststoff', 'glasfaser', 'fiberglas', 'glasfaserverstaerkt', 'isoliert'],
  Stahl: ['stahl', 'eisen', 'verzinkt', 'edelstahl'],
};

const options = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));

/** Felder in der Reihenfolge des Formulars — Überschriften wie Formular und Prüfbuch-Export */
const FIELDS: ImportField[] = [
  { key: 'category', label: 'Bauart', exact: ['bauart', 'leiterart', 'typ', 'art', 'leitertyp', 'bauform', 'kategorie'], prefix: ['bauart', 'leiterart'] },
  { key: 'material', label: 'Material', exact: ['material', 'werkstoff', 'materialart'], prefix: ['material', 'werkstoff'] },
  { key: 'manufacturer', label: 'Hersteller', exact: ['hersteller', 'marke', 'fabrikat', 'firma'], prefix: ['hersteller', 'fabrikat'] },
  {
    key: 'purchase_year',
    label: 'Anschaffungs-/Baujahr',
    exact: ['anschaffungsbaujahr', 'baujahr', 'anschaffungsjahr', 'jahr', 'kaufjahr', 'herstelljahr', 'herstellungsjahr'],
    prefix: ['baujahr', 'anschaffung'],
  },
  {
    key: 'length_m',
    label: 'Länge / Arbeitshöhe (m)',
    exact: ['laengearbeitshoehem', 'laenge', 'laengem', 'arbeitshoehe', 'arbeitshoehem', 'hoehe', 'hoehem', 'leiterlaenge', 'steighoehe'],
    prefix: ['laenge', 'arbeitshoehe', 'leiterlaenge'],
  },
  {
    key: 'rung_count',
    label: 'Sprossen / Stufen',
    exact: ['sprossenstufen', 'sprossenstufenzahl', 'sprossen', 'stufen', 'sprossenzahl', 'stufenzahl', 'anzahlsprossen', 'anzahlstufen'],
    prefix: ['sprossen', 'stufen', 'anzahlsprossen'],
  },
];

const text = (s: string, n: number) => {
  const v = cap(oneLine(s), n);
  return v ? v : null;
};

export const LEITERDEX_IMPORT_SPEC: UnitImportSpec<Ladder, LadderData> = {
  cfg: LEITERDEX_VOR_ORT,
  dueName: LEITERDEX_EXPORT.dueName,
  retiredHeader: LEITERDEX_EXPORT.retiredHeader,
  nameLabel: 'Bezeichnung',
  nameHeaders: ['leiternummer', 'leiternr', 'inventarnummer', 'inventarnr', 'nummer'],
  fields: FIELDS,
  build(get) {
    const hints: string[] = [];
    const cat = pickOption(get('category'), options(LADDER_CATEGORIES), CATEGORY_SYNONYMS, CATEGORY_DEFAULT);
    if (cat.how === 'unknown') hints.push(`Bauart „${oneLine(get('category'))}“ unbekannt → ${CATEGORY_DEFAULT}`);
    if (cat.how === 'empty') hints.push(`Bauart fehlt → ${CATEGORY_DEFAULT}`);
    // Material steht oft mit in der Bauart („Alu-Stehleiter“)
    const matRaw = get('material') || (/(alu|holz|gfk|kunststoff|stahl)/i.test(get('category')) ? get('category') : '');
    const mat = pickOption(matRaw, options(LADDER_MATERIALS), MATERIAL_SYNONYMS, MATERIAL_DEFAULT);
    if (mat.how === 'unknown') hints.push(`Material „${oneLine(get('material'))}“ unbekannt → ${MATERIAL_DEFAULT}`);
    if (mat.how === 'empty') hints.push(`Material fehlt → ${MATERIAL_DEFAULT}`);
    return {
      input: {
        name: cap(oneLine(get('name')), 120),
        category: cat.value,
        material: mat.value,
        manufacturer: text(get('manufacturer'), 120),
        purchase_year: text(get('purchase_year'), 10),
        length_m: text(get('length_m'), 20),
        rung_count: text(get('rung_count'), 20),
      },
      hints,
    };
  },
  describe: (l) => [l.category, l.material, l.manufacturer, l.length_m ? `${l.length_m} m` : '', l.rung_count ? `${l.rung_count} Sprossen` : '']
    .filter(Boolean)
    .join(' · '),
  example: [
    { site: 'Halle 1', siteAddress: 'Industriestraße 5, 8020 Graz', name: 'L-001', category: 'Stehleiter', material: 'Aluminium', manufacturer: 'Zarges', purchase_year: '2021', length_m: '2,0', rung_count: '6', notes: 'Stufen-Stehleiter beim Tor', lastInspection: '15.03.2026' },
    { site: 'Halle 1', name: 'L-002', category: 'Mehrzweckleiter', material: 'Alu', manufacturer: 'Hymer', purchase_year: '2019', length_m: '4,5', rung_count: '3x9' },
    { site: 'Werkstatt', name: 'T-01', category: 'Tritt', material: 'Kunststoff', notes: '' },
  ],
};

export const LEITERDEX_IMPORT: UnitImportDef<Ladder, Site, Ladder, LadderData> = {
  spec: LEITERDEX_IMPORT_SPEC,
  api: {
    fetchSites,
    fetchUnits: (sb) => fetchLadders(sb),
    siteRow: (orgId, name, address) =>
      siteRow(orgId, { name, address, operator_name: null, operator_contact: null, notes: null, active: true }),
    unitRow: (orgId, input, siteId, notes) => ladderRow(orgId, { ...input, site_id: siteId, notes, retired: false }),
    insertSites,
    insertUnits: insertLadders,
  },
};
