// RegalDex — Excel-Listen im Dashboard: Prüfbuch-Übersicht (je Lager letzte Inspektion, Experteninspektion fällig am,
// Sperre, offene Schäden — dazu alle Regalzeilen) und Inspektionen im Zeitraum. Orts-Modus: die Inspektion hängt am
// ganzen Lager. Reine Logik ohne React; Aufbau der Blätter und Fälligkeit in lib/pruefExport.ts, Wörter (Inspektion,
// Schaden) und Frist aus vorOrt.ts — hier nur die RegalDex-Spalten.

import {
  buildInspectionList,
  buildPruefbuch,
  countDefects,
  exportInspectionList,
  exportPruefbuch,
  type InspectionListInput,
  type PruefbuchInput,
  type PruefExportSpec,
} from '../lib/pruefExport';
import type { XlsxSheet } from '../lib/xlsx';
import { checklistSummary } from './labels';
import { REGALDEX_VOR_ORT } from './vorOrt';
import { CHECKLIST, INSPECTION_LABELS, INSPECTION_SHORT, type Damage, type Inspection, type Rack } from './types';

export const REGALDEX_EXPORT: PruefExportSpec<Rack, Inspection> = {
  cfg: REGALDEX_VOR_ORT,
  kindLabels: INSPECTION_LABELS,
  dueName: INSPECTION_SHORT.expert,
  bookName: 'Prüfbuch',
  retiredHeader: 'Abgebaut',
  unitColumns: [
    { header: 'Kategorie' },
    { header: 'Hersteller' },
    { header: 'Baujahr / Aufstelljahr' },
    { header: 'Fachlast (kg)' },
    { header: 'Feldlast (kg)' },
  ],
  unitCells: (r) => [r.category || null, r.manufacturer, r.install_year, r.bay_load_kg, r.field_load_kg],
  result: (i) => ({ summary: checklistSummary(i.checklist ?? {}), defects: countDefects(i.checklist, CHECKLIST) }),
};

type BookInput = PruefbuchInput<Rack, Inspection, Damage>;
type ListInput = InspectionListInput<Rack, Inspection>;

export const pruefbuchSheets = (input: BookInput): XlsxSheet[] => buildPruefbuch(REGALDEX_EXPORT, input);
export const inspectionSheets = (input: ListInput): XlsxSheet[] => buildInspectionList(REGALDEX_EXPORT, input);
/** „RegalDex_Pruefbuch_<heute>.xlsx“ */
export const savePruefbuch = (input: BookInput): Promise<void> => exportPruefbuch(REGALDEX_EXPORT, input);
/** „RegalDex_Inspektionen_<von>_bis_<bis>.xlsx“ */
export const saveInspections = (input: ListInput): Promise<void> => exportInspectionList(REGALDEX_EXPORT, input);
