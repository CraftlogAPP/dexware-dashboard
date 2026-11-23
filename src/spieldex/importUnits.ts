// SpielDex — Spielplätze und ihre Spielgeräte aus einer Excel-/CSV-Liste übernehmen (Adapter, Orts-Modus). Kontrolliert
// wird der Spielplatz als Ganzes, deshalb legt der Import Spielplätze an (Adresse, Betreiber, Status) und auf Wunsch ihre
// Spielgeräte. Ablauf, Regeln und Oberfläche: pruefen/importUnits.ts + components/ImportWizard.tsx. Geschrieben wird
// über api.ts (playgroundRow/equipmentRow = dieselben Zeilen wie beim Anlegen von Hand).

import { cap, oneLine, type ImportField } from '../lib/tableImport';
import { yearOf, type UnitImportDef, type UnitImportSpec } from '../pruefen/importUnits';
import { equipmentRow, fetchEquipment, fetchPlaygrounds, insertEquipment, insertPlaygrounds, playgroundRow, type EquipmentInput } from './api';
import { SPIELDEX_EXPORT } from './exportLists';
import { SPIELDEX_VOR_ORT } from './vorOrt';
import type { Equipment, Playground } from './types';

/** Stammdaten eines Spielgeräts ohne Spielplatz, Notizen und „abgebaut“ */
export type EquipmentData = Omit<EquipmentInput, 'playground_id' | 'notes' | 'retired'>;

/** Kategorie ist im Formular Freitext (Pflicht) — leer wird „Sonstiges“ */
const CATEGORY_DEFAULT = 'Sonstiges';

const text = (s: string, n: number) => {
  const v = cap(oneLine(s), n);
  return v ? v : null;
};

/** Felder in der Reihenfolge des Formulars — Überschriften wie Formular und Kontrollbuch-Export (Blatt „Spielgeräte“) */
const FIELDS: ImportField[] = [
  { key: 'category', label: 'Kategorie', exact: ['kategorie', 'geraeteart', 'geraetetyp', 'spielgeraeteart', 'art', 'typ', 'geraetegruppe'], prefix: ['kategorie', 'geraeteart', 'geraetetyp'] },
  { key: 'manufacturer', label: 'Hersteller', exact: ['hersteller', 'marke', 'fabrikat', 'firma', 'lieferant'], prefix: ['hersteller', 'fabrikat'] },
  {
    key: 'install_year',
    label: 'Baujahr / Aufstelljahr',
    exact: ['baujahraufstelljahr', 'baujahr', 'aufstelljahr', 'einbaujahr', 'montagejahr', 'jahr', 'aufgestellt', 'errichtet'],
    prefix: ['baujahr', 'aufstell', 'einbau'],
  },
];

export const SPIELDEX_IMPORT_SPEC: UnitImportSpec<Equipment, EquipmentData> = {
  cfg: SPIELDEX_VOR_ORT,
  dueName: SPIELDEX_EXPORT.dueName,
  retiredHeader: SPIELDEX_EXPORT.retiredHeader,
  bookName: SPIELDEX_EXPORT.bookName,
  nameLabel: 'Gerät',
  nameHeaders: ['geraet', 'spielgeraetname', 'geraetebezeichnung', 'geraetenummer', 'inventarnummer'],
  fields: FIELDS,
  siteHeaders: ['spielplatzname', 'anlage', 'spielanlage', 'spielbereich', 'objekt', 'spielstaette'],
  build(get) {
    const hints: string[] = [];
    const category = cap(oneLine(get('category')), 80);
    if (!category) hints.push(`Kategorie fehlt → ${CATEGORY_DEFAULT}`);
    return {
      input: {
        name: cap(oneLine(get('name')), 120),
        category: category || CATEGORY_DEFAULT,
        manufacturer: text(get('manufacturer'), 120),
        install_year: yearOf(get('install_year')),
      },
      hints,
    };
  },
  describe: (e) => [e.category, e.manufacturer, e.install_year ? `Baujahr ${e.install_year}` : ''].filter(Boolean).join(' · '),
  example: [
    { site: 'Spielplatz Stadtpark', siteAddress: 'Parkstraße 1, 8010 Graz', siteOperator: 'Stadtgemeinde', name: 'Doppelschaukel Nest', category: 'Schaukel', manufacturer: 'Kompan', install_year: '2018' },
    { site: 'Spielplatz Stadtpark', name: 'Rutschenturm', category: 'Rutsche', install_year: '2020' },
    { site: 'Spielplatz Schule Nord', siteAddress: 'Schulweg 7, 8020 Graz', siteOperator: 'Volksschule Nord', notes: 'Zugang nur in der Schulzeit', lastInspection: '15.09.2026' },
  ],
};

export const SPIELDEX_IMPORT: UnitImportDef<Equipment, Playground, Equipment, EquipmentData> = {
  spec: SPIELDEX_IMPORT_SPEC,
  api: {
    fetchSites: fetchPlaygrounds,
    fetchUnits: (sb) => fetchEquipment(sb),
    siteRow: (orgId, name, address, extra) =>
      playgroundRow(orgId, {
        name,
        address,
        operator_name: extra?.operator ?? null,
        operator_contact: extra?.contact ?? null,
        notes: extra?.notes ?? null,
        active: extra?.active ?? true,
      }),
    unitRow: (orgId, input, siteId, notes) => equipmentRow(orgId, { ...input, playground_id: siteId, notes, retired: false }),
    insertSites: insertPlaygrounds,
    insertUnits: insertEquipment,
  },
};
