// RegalDex — Lager und ihre Regalzeilen aus einer Excel-/CSV-Liste übernehmen (Adapter, Orts-Modus). Inspiziert wird
// das Lager als Ganzes, deshalb legt der Import Lager an (Adresse, Betreiber, Status) und auf Wunsch ihre Regalzeilen.
// Ablauf, Regeln und Oberfläche: pruefen/importUnits.ts + components/ImportWizard.tsx. Geschrieben wird über api.ts
// (warehouseRow/rackRow = dieselben Zeilen wie beim Anlegen von Hand).

import { cap, oneLine, type ImportField } from '../lib/tableImport';
import { yearOf, type UnitImportDef, type UnitImportSpec } from '../pruefen/importUnits';
import { fetchRacks, fetchWarehouses, insertRacks, insertWarehouses, rackRow, warehouseRow, type RackInput } from './api';
import { REGALDEX_EXPORT } from './exportLists';
import { REGALDEX_VOR_ORT } from './vorOrt';
import type { Rack, Warehouse } from './types';

/** Stammdaten einer Regalzeile ohne Lager, Notizen und „abgebaut“ */
export type RackData = Omit<RackInput, 'warehouse_id' | 'notes' | 'retired'>;

/** Kategorie ist im Formular Freitext (Pflicht) — leer wird „Sonstiges“ */
const CATEGORY_DEFAULT = 'Sonstiges';

const text = (s: string, n: number) => {
  const v = cap(oneLine(s), n);
  return v ? v : null;
};

/**
 * Last in kg wie im Formular („1000“): „1.000 kg“, „1000kg“, „2,5 t“, „1.5 t“; steht in der Überschrift „(t)“ oder
 * „Tonnen“, gilt die Zahl als Tonnen. Anderes bleibt wörtlich (mit Hinweis).
 */
export function kgOf(raw: string, header: string, label: string): { value: string | null; note: string } {
  const t = oneLine(raw);
  if (!t) return { value: null, note: '' };
  const r = /^(\d{1,3}(?:[.\s']\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(kg|t|to|tonnen)?\.?$/i.exec(t);
  if (r) {
    const n = Number(`${r[1].replace(/[.\s']/g, '')}.${r[2] ?? '0'}`);
    const tons = r[3] ? /^t/i.test(r[3]) : /\(t\)|tonne/i.test(header);
    const kg = Math.round((tons ? n * 1000 : n) * 10) / 10;
    if (Number.isFinite(kg) && kg > 0) return { value: String(kg).replace('.', ','), note: '' };
  }
  return { value: cap(t, 20), note: `${label} „${t}“ ist keine Zahl in kg — wörtlich übernommen` };
}

/** Felder in der Reihenfolge des Formulars — Überschriften wie Formular und Prüfbuch-Export (Blatt „Regalzeilen“) */
const FIELDS: ImportField[] = [
  { key: 'category', label: 'Kategorie', exact: ['kategorie', 'regalart', 'regaltyp', 'art', 'typ', 'bauart', 'regalsystem'], prefix: ['kategorie', 'regalart', 'regaltyp'] },
  { key: 'manufacturer', label: 'Hersteller', exact: ['hersteller', 'marke', 'fabrikat', 'firma'], prefix: ['hersteller', 'fabrikat'] },
  {
    key: 'install_year',
    label: 'Baujahr / Aufstelljahr',
    exact: ['baujahraufstelljahr', 'baujahr', 'aufstelljahr', 'einbaujahr', 'montagejahr', 'jahr', 'aufgestellt', 'montiert'],
    prefix: ['baujahr', 'aufstell', 'montage'],
  },
  {
    key: 'bay_load_kg',
    label: 'Fachlast (kg)',
    exact: ['fachlastkg', 'fachlast', 'fachlastt', 'tragfaehigkeitjefach', 'fachtragfaehigkeit', 'lastjefach', 'fachbelastung', 'ebenenlast'],
    prefix: ['fachlast', 'fachtrag'],
  },
  {
    key: 'field_load_kg',
    label: 'Feldlast (kg)',
    exact: ['feldlastkg', 'feldlast', 'feldlastt', 'tragfaehigkeitjefeld', 'feldtragfaehigkeit', 'lastjefeld', 'feldbelastung'],
    prefix: ['feldlast', 'feldtrag'],
  },
];

export const REGALDEX_IMPORT_SPEC: UnitImportSpec<Rack, RackData> = {
  cfg: REGALDEX_VOR_ORT,
  dueName: REGALDEX_EXPORT.dueName,
  retiredHeader: REGALDEX_EXPORT.retiredHeader,
  bookName: REGALDEX_EXPORT.bookName,
  nameLabel: 'Regalzeile',
  nameHeaders: ['regal', 'regalnummer', 'regalnr', 'zeile', 'regalbezeichnung', 'regalzeilennummer'],
  fields: FIELDS,
  siteGenus: 'n',
  siteHeaders: ['lagername', 'halle', 'lagerhalle', 'lagerstandort', 'werk'],
  build(get, headerOf) {
    const hints: string[] = [];
    const category = cap(oneLine(get('category')), 80);
    if (!category) hints.push(`Kategorie fehlt → ${CATEGORY_DEFAULT}`);
    const bay = kgOf(get('bay_load_kg'), headerOf('bay_load_kg'), 'Fachlast');
    if (bay.note) hints.push(bay.note);
    const field = kgOf(get('field_load_kg'), headerOf('field_load_kg'), 'Feldlast');
    if (field.note) hints.push(field.note);
    return {
      input: {
        name: cap(oneLine(get('name')), 120),
        category: category || CATEGORY_DEFAULT,
        manufacturer: text(get('manufacturer'), 120),
        install_year: yearOf(get('install_year')),
        bay_load_kg: bay.value,
        field_load_kg: field.value,
      },
      hints,
    };
  },
  describe: (r) =>
    [r.category, r.manufacturer, r.install_year ? `Baujahr ${r.install_year}` : '', r.bay_load_kg ? `Fachlast ${r.bay_load_kg} kg` : '', r.field_load_kg ? `Feldlast ${r.field_load_kg} kg` : '']
      .filter(Boolean)
      .join(' · '),
  example: [
    { site: 'Zentrallager', siteAddress: 'Logistikstraße 4, 4600 Wels', siteOperator: 'Muster Logistik GmbH', name: 'Zeile A01', category: 'Palettenregal', manufacturer: 'SSI Schäfer', install_year: '2019', bay_load_kg: '2000', field_load_kg: '8000' },
    { site: 'Zentrallager', name: 'Zeile A02', category: 'Palettenregal', bay_load_kg: '2 t', field_load_kg: '8.000 kg' },
    { site: 'Außenlager Hof', siteAddress: 'Hofweg 2, 4600 Wels', notes: 'Schlüssel beim Pförtner', lastInspection: '20.10.2026' },
  ],
};

export const REGALDEX_IMPORT: UnitImportDef<Rack, Warehouse, Rack, RackData> = {
  spec: REGALDEX_IMPORT_SPEC,
  api: {
    fetchSites: fetchWarehouses,
    fetchUnits: (sb) => fetchRacks(sb),
    siteRow: (orgId, name, address, extra) =>
      warehouseRow(orgId, {
        name,
        address,
        operator_name: extra?.operator ?? null,
        operator_contact: extra?.contact ?? null,
        notes: extra?.notes ?? null,
        active: extra?.active ?? true,
      }),
    unitRow: (orgId, input, siteId, notes) => rackRow(orgId, { ...input, warehouse_id: siteId, notes, retired: false }),
    insertSites: insertWarehouses,
    insertUnits: insertRacks,
  },
};
