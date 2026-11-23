// HebeDex — Excel-Listen im Dashboard: Prüfbuch-Übersicht (alle Anschlag-, Lastaufnahme- und Zurrmittel mit
// wiederkehrender Prüfung, Rissprüfung der Ketten und offenen Mängeln) und Prüfungen im Zeitraum (mit Messwerten des
// Ablegereife-Rechners). Reine Logik ohne React; Aufbau der Blätter in lib/pruefExport.ts.
// Fristen mit den HebeDex-Helfern wie Übersicht und Standort-Seite (types.ts → expertDue, crackDue):
// DE/CH 12 Monate, AT spätestens nach 15 Monaten bzw. am 31.12. des Folgejahres; Rundstahlketten Rissprüfung alle 3 Jahre.

import {
  buildInspectionList,
  buildPruefbuch,
  dueStatusText,
  exportInspectionList,
  exportPruefbuch,
  type InspectionListInput,
  type PruefbuchInput,
  type PruefExportSpec,
} from '../lib/pruefExport';
import { toInputDate } from '../lib/format';
import type { XlsxSheet } from '../lib/xlsx';
import { checklistSummary } from './labels';
import { HEBEDEX_VOR_ORT } from './vorOrt';
import {
  CRACK_INTERVAL_YEARS,
  INSPECTION_LABELS,
  INSPECTION_SHORT,
  ROPE_KIND_LABELS,
  crackDue,
  expertDue,
  kindInfo,
  measureResult,
  type Defect,
  type Inspection,
  type LiftingItem,
} from './types';

export const HEBEDEX_EXPORT: PruefExportSpec<LiftingItem, Inspection> = {
  cfg: HEBEDEX_VOR_ORT,
  kindLabels: INSPECTION_LABELS,
  dueName: INSPECTION_SHORT.expert,
  bookName: 'Prüfbuch',
  retiredHeader: 'Ausgesondert',
  unitColumns: [
    { header: 'Typ' },
    { header: 'Tragfähigkeit WLL / Zurrkraft LC (kg)', kind: 'int' },
    { header: 'Nutzlänge (m)' },
    { header: 'Nenndicke / Seildurchmesser (mm)' },
    { header: 'Drahtseil-Bauart' },
    { header: 'Farbe' },
    { header: 'Hersteller' },
    { header: 'Etikett- / Seriennummer' },
    { header: 'Herstelljahr' },
    { header: 'Ausgesondert am', kind: 'date' },
    { header: 'Grund der Aussonderung' },
    { header: 'Beispieldaten' },
  ],
  unitCells: (e) => [
    kindInfo(e.kind).label,
    e.wll_kg,
    e.length_m,
    e.nominal_mm,
    e.rope_kind ? ROPE_KIND_LABELS[e.rope_kind] : null,
    e.color,
    e.manufacturer,
    e.serial_no,
    e.build_year,
    e.retired ? e.retired_at : null,
    e.retired ? e.retire_reason : null,
    e.is_demo ? 'ja' : 'nein',
  ],
  // wie der PDF-Bericht: Kurzfassung mit der Checkliste des Teil-Typs; gezählt werden alle Punkte mit „Mangel“
  result: (i, item) => {
    const list = i.checklist ?? {};
    return { summary: checklistSummary(list, item?.kind), defects: Object.values(list).filter((v) => v === 'defect').length };
  },
  unitDue: (_item, { org, lastOf }) => expertDue(lastOf('expert'), org.land),
  unitExtra: {
    columns: [{ header: 'Rissprüfung fällig am', kind: 'date' }, { header: 'Rissprüfung' }],
    // nur Typen mit Rissprüfung (Rundstahlkette); ohne Rissprüfung zählt Herstelljahr bzw. Anlagedatum (crackDue)
    cells: (e, { retired, lastOf }) => {
      const info = retired ? undefined : crackDue(e, lastOf('crack'));
      return info ? [info.dueAt ? toInputDate(info.dueAt) : null, dueStatusText(info)] : [null, null];
    },
  },
  inspectionExtra: {
    columns: [{ header: 'Messwerte (Ablegereife-Rechner)' }],
    cells: (i, item) => {
      const m = item ? measureResult(item, i.measurements) : undefined;
      return [m ? `${m.text}${m.red ? ' — Ablegekriterium erreicht' : ''}` : null];
    },
  },
  dueRuleText: (org) =>
    org.land === 'AT'
      ? 'Wiederkehrende Prüfung mindestens einmal im Kalenderjahr, höchstens 15 Monate Abstand — fällig am früheren Termin von „letzte gültige Prüfung + 15 Monate“ und 31.12. des Folgejahres (AM-VO § 8)'
      : 'Wiederkehrende Prüfung alle 12 Monate ab der letzten gültigen Prüfung dieser Art',
  extraRules: [
    [
      'Rissprüfung',
      `nur Rundstahlketten: alle ${CRACK_INTERVAL_YEARS} Jahre ab der letzten gültigen Rissprüfung, ohne Rissprüfung ab Herstelljahr bzw. Anlagedatum.`,
    ],
  ],
};

type BookInput = PruefbuchInput<LiftingItem, Inspection, Defect>;
type ListInput = InspectionListInput<LiftingItem, Inspection>;

export const pruefbuchSheets = (input: BookInput): XlsxSheet[] => buildPruefbuch(HEBEDEX_EXPORT, input);
export const inspectionSheets = (input: ListInput): XlsxSheet[] => buildInspectionList(HEBEDEX_EXPORT, input);
/** „HebeDex_Pruefbuch_<heute>.xlsx“ */
export const savePruefbuch = (input: BookInput): Promise<void> => exportPruefbuch(HEBEDEX_EXPORT, input);
/** „HebeDex_Pruefungen_<von>_bis_<bis>.xlsx“ */
export const saveInspections = (input: ListInput): Promise<void> => exportInspectionList(HEBEDEX_EXPORT, input);
