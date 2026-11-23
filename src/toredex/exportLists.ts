// ToreDex — Excel-Listen im Dashboard: Prüfbuch-Übersicht (alle Tore mit Fälligkeit der Sachkundigen-Prüfung und
// offenen Mängeln) und Prüfungen im Zeitraum. Reine Logik ohne React; Aufbau der Blätter und Fälligkeit in
// lib/pruefExport.ts, Wörter (Objekt, Tor) und Frist aus vorOrt.ts — hier nur die ToreDex-Spalten.

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
import { TOREDEX_VOR_ORT } from './vorOrt';
import { CHECKLIST, INSPECTION_LABELS, INSPECTION_SHORT, type Defect, type Gate, type Inspection } from './types';

export const TOREDEX_EXPORT: PruefExportSpec<Gate, Inspection> = {
  cfg: TOREDEX_VOR_ORT,
  kindLabels: INSPECTION_LABELS,
  dueName: INSPECTION_SHORT.expert,
  bookName: 'Prüfbuch',
  retiredHeader: 'Stillgelegt',
  unitColumns: [
    { header: 'Torart' },
    { header: 'Antrieb' },
    { header: 'Hersteller' },
    { header: 'Baujahr (Typenschild)' },
    { header: 'Maße B × H (m)' },
    { header: 'Serien-/Identnummer' },
  ],
  unitCells: (g) => [g.category || null, g.drive_type || null, g.manufacturer, g.build_year, g.dimensions, g.serial_no],
  result: (i) => ({ summary: checklistSummary(i.checklist ?? {}), defects: countDefects(i.checklist, CHECKLIST) }),
};

type BookInput = PruefbuchInput<Gate, Inspection, Defect>;
type ListInput = InspectionListInput<Gate, Inspection>;

export const pruefbuchSheets = (input: BookInput): XlsxSheet[] => buildPruefbuch(TOREDEX_EXPORT, input);
export const inspectionSheets = (input: ListInput): XlsxSheet[] => buildInspectionList(TOREDEX_EXPORT, input);
/** „ToreDex_Pruefbuch_<heute>.xlsx“ */
export const savePruefbuch = (input: BookInput): Promise<void> => exportPruefbuch(TOREDEX_EXPORT, input);
/** „ToreDex_Pruefungen_<von>_bis_<bis>.xlsx“ */
export const saveInspections = (input: ListInput): Promise<void> => exportInspectionList(TOREDEX_EXPORT, input);
