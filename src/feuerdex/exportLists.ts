// FeuerDex — Excel-Listen im Dashboard: Prüfbuch-Übersicht (alle Feuerlöscher mit Fälligkeit der Sachkundigen-Prüfung
// und offenen Mängeln) und Prüfungen im Zeitraum. Reine Logik ohne React; Aufbau der Blätter und Fälligkeit in
// lib/pruefExport.ts, Wörter und Frist (DE/AT 2 Jahre, CH 3 Jahre) aus vorOrt.ts — hier nur die FeuerDex-Spalten.

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
import { FEUERDEX_VOR_ORT } from './vorOrt';
import { CHECKLIST, INSPECTION_LABELS, INSPECTION_SHORT, type Defect, type Extinguisher, type Inspection } from './types';

export const FEUERDEX_EXPORT: PruefExportSpec<Extinguisher, Inspection> = {
  cfg: FEUERDEX_VOR_ORT,
  kindLabels: INSPECTION_LABELS,
  dueName: INSPECTION_SHORT.expert,
  bookName: 'Prüfbuch',
  retiredHeader: 'Ausgesondert',
  unitColumns: [
    { header: 'Löschmittel' },
    { header: 'Bauart' },
    { header: 'Hersteller' },
    { header: 'Baujahr (Typenschild)' },
    { header: 'Füllmenge (kg bzw. l)' },
    { header: 'Löschmitteleinheiten (LE)' },
  ],
  unitCells: (e) => [e.category || null, e.build_type || null, e.manufacturer, e.purchase_year, e.filling_kg, e.rating_le],
  result: (i) => ({ summary: checklistSummary(i.checklist ?? {}), defects: countDefects(i.checklist, CHECKLIST) }),
};

type BookInput = PruefbuchInput<Extinguisher, Inspection, Defect>;
type ListInput = InspectionListInput<Extinguisher, Inspection>;

export const pruefbuchSheets = (input: BookInput): XlsxSheet[] => buildPruefbuch(FEUERDEX_EXPORT, input);
export const inspectionSheets = (input: ListInput): XlsxSheet[] => buildInspectionList(FEUERDEX_EXPORT, input);
/** „FeuerDex_Pruefbuch_<heute>.xlsx“ */
export const savePruefbuch = (input: BookInput): Promise<void> => exportPruefbuch(FEUERDEX_EXPORT, input);
/** „FeuerDex_Pruefungen_<von>_bis_<bis>.xlsx“ */
export const saveInspections = (input: ListInput): Promise<void> => exportInspectionList(FEUERDEX_EXPORT, input);
