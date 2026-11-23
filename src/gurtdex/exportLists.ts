// GurtDex — Excel-Listen im Dashboard: Prüfbuch-Übersicht (alle PSA-Artikel mit Fälligkeit der Sachkundigen-Prüfung,
// Ablegereife und offenen Mängeln) und Prüfungen im Zeitraum. Reine Logik ohne React; Aufbau der Blätter und
// Fälligkeit in lib/pruefExport.ts, Wörter und Frist aus vorOrt.ts. Ablegereife mit denselben Helfern wie die
// Standort-Seite (types.ts → lifespanEnd / lifespanWarning).

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
import { toInputDate } from '../lib/format';
import type { XlsxSheet } from '../lib/xlsx';
import { checklistSummary } from './labels';
import { GURTDEX_VOR_ORT } from './vorOrt';
import {
  CHECKLIST,
  INSPECTION_LABELS,
  INSPECTION_SHORT,
  lifespanEnd,
  lifespanWarning,
  type Defect,
  type Inspection,
  type PsaItem,
} from './types';

export const GURTDEX_EXPORT: PruefExportSpec<PsaItem, Inspection> = {
  cfg: GURTDEX_VOR_ORT,
  kindLabels: INSPECTION_LABELS,
  dueName: INSPECTION_SHORT.expert,
  bookName: 'Prüfbuch',
  retiredHeader: 'Ausgesondert',
  unitColumns: [
    { header: 'Ausrüstungsart' },
    { header: 'Hersteller' },
    { header: 'Typ / Modell' },
    { header: 'Seriennummer' },
    { header: 'Herstellungsdatum' },
    { header: 'Erste Benutzung' },
    { header: 'Max. Gebrauchsdauer (Jahre)' },
    { header: 'Träger/in' },
  ],
  unitCells: (p) => [
    p.category || null,
    p.manufacturer,
    p.model,
    p.serial_no,
    p.manufacture_date,
    p.first_use_date,
    p.max_life_years,
    p.wearer_name,
  ],
  result: (i) => ({ summary: checklistSummary(i.checklist ?? {}), defects: countDefects(i.checklist, CHECKLIST) }),
  // Ablegereife wie auf der Standort-Seite: nur für Artikel in Benutzung
  unitExtra: {
    columns: [{ header: 'Ablegereif ab (Herstellerangabe)', kind: 'date' }, { header: 'Ablegereife' }],
    cells: (p, { retired }) => {
      if (retired) return [null, null];
      const end = lifespanEnd(p);
      return [end ? toInputDate(end) : null, lifespanWarning(p) ?? null];
    },
  },
};

type BookInput = PruefbuchInput<PsaItem, Inspection, Defect>;
type ListInput = InspectionListInput<PsaItem, Inspection>;

export const pruefbuchSheets = (input: BookInput): XlsxSheet[] => buildPruefbuch(GURTDEX_EXPORT, input);
export const inspectionSheets = (input: ListInput): XlsxSheet[] => buildInspectionList(GURTDEX_EXPORT, input);
/** „GurtDex_Pruefbuch_<heute>.xlsx“ */
export const savePruefbuch = (input: BookInput): Promise<void> => exportPruefbuch(GURTDEX_EXPORT, input);
/** „GurtDex_Pruefungen_<von>_bis_<bis>.xlsx“ */
export const saveInspections = (input: ListInput): Promise<void> => exportInspectionList(GURTDEX_EXPORT, input);
