// SpielDex — Excel-Listen im Dashboard: Kontrollbuch-Übersicht (je Spielplatz letzte Kontrolle, Hauptinspektion und
// operative Kontrolle fällig am, Sperre, offene Mängel — dazu alle Spielgeräte) und Kontrollen im Zeitraum.
// Orts-Modus: die Kontrolle hängt am ganzen Spielplatz. Reine Logik ohne React; Aufbau der Blätter und Fälligkeit in
// lib/pruefExport.ts, Wörter und beide Fristen (Hauptinspektion 365 Tage, operative Kontrolle 90 Tage) aus vorOrt.ts.

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
import { SPIELDEX_VOR_ORT } from './vorOrt';
import { CHECKLIST, INSPECTION_LABELS, INSPECTION_SHORT, type Defect, type Equipment, type Inspection } from './types';

export const SPIELDEX_EXPORT: PruefExportSpec<Equipment, Inspection> = {
  cfg: SPIELDEX_VOR_ORT,
  kindLabels: INSPECTION_LABELS,
  dueName: INSPECTION_SHORT.main,
  // wie der Bericht der App („Kontrollbuch-PDF“)
  bookName: 'Kontrollbuch',
  retiredHeader: 'Abgebaut',
  unitColumns: [{ header: 'Kategorie' }, { header: 'Hersteller' }, { header: 'Baujahr / Aufstelljahr' }],
  unitCells: (e) => [e.category || null, e.manufacturer, e.install_year],
  result: (i) => ({ summary: checklistSummary(i.checklist ?? {}), defects: countDefects(i.checklist, CHECKLIST) }),
};

type BookInput = PruefbuchInput<Equipment, Inspection, Defect>;
type ListInput = InspectionListInput<Equipment, Inspection>;

export const pruefbuchSheets = (input: BookInput): XlsxSheet[] => buildPruefbuch(SPIELDEX_EXPORT, input);
export const inspectionSheets = (input: ListInput): XlsxSheet[] => buildInspectionList(SPIELDEX_EXPORT, input);
/** „SpielDex_Kontrollbuch_<heute>.xlsx“ */
export const savePruefbuch = (input: BookInput): Promise<void> => exportPruefbuch(SPIELDEX_EXPORT, input);
/** „SpielDex_Kontrollen_<von>_bis_<bis>.xlsx“ */
export const saveInspections = (input: ListInput): Promise<void> => exportInspectionList(SPIELDEX_EXPORT, input);
