// LeiterDex — Excel-Listen im Dashboard: Prüfbuch-Übersicht (alle Leitern & Tritte mit Fälligkeit und offenen Mängeln)
// und Prüfungen im Zeitraum. Reine Logik ohne React; Aufbau der Blätter und Fälligkeit in lib/pruefExport.ts,
// Wörter und Frist aus vorOrt.ts — hier nur die LeiterDex-Spalten.

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
import { LEITERDEX_VOR_ORT } from './vorOrt';
import { CHECKLIST, INSPECTION_LABELS, INSPECTION_SHORT, type Defect, type Inspection, type Ladder } from './types';

export const LEITERDEX_EXPORT: PruefExportSpec<Ladder, Inspection> = {
  cfg: LEITERDEX_VOR_ORT,
  kindLabels: INSPECTION_LABELS,
  dueName: INSPECTION_SHORT.expert,
  bookName: 'Prüfbuch',
  retiredHeader: 'Ausgesondert',
  unitColumns: [
    { header: 'Bauart' },
    { header: 'Material' },
    { header: 'Hersteller' },
    { header: 'Anschaffungs-/Baujahr' },
    { header: 'Länge / Arbeitshöhe (m)' },
    { header: 'Sprossen / Stufen' },
  ],
  unitCells: (l) => [l.category || null, l.material || null, l.manufacturer, l.purchase_year, l.length_m, l.rung_count],
  result: (i) => ({ summary: checklistSummary(i.checklist ?? {}), defects: countDefects(i.checklist, CHECKLIST) }),
};

type BookInput = PruefbuchInput<Ladder, Inspection, Defect>;
type ListInput = InspectionListInput<Ladder, Inspection>;

export const pruefbuchSheets = (input: BookInput): XlsxSheet[] => buildPruefbuch(LEITERDEX_EXPORT, input);
export const inspectionSheets = (input: ListInput): XlsxSheet[] => buildInspectionList(LEITERDEX_EXPORT, input);
/** „LeiterDex_Pruefbuch_<heute>.xlsx“ */
export const savePruefbuch = (input: BookInput): Promise<void> => exportPruefbuch(LEITERDEX_EXPORT, input);
/** „LeiterDex_Pruefungen_<von>_bis_<bis>.xlsx“ */
export const saveInspections = (input: ListInput): Promise<void> => exportInspectionList(LEITERDEX_EXPORT, input);
