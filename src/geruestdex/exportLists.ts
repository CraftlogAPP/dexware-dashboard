// GerüstDex — Excel-Listen im Dashboard: Prüfbuch-Übersicht (je Baustelle letzte Prüfung, Prüfung durch die befähigte
// Person fällig am, Sperre, offene Mängel — dazu alle Gerüste) und Prüfungen im Zeitraum. Orts-Modus: die Prüfung
// hängt an der ganzen Baustelle. Reine Logik ohne React; Aufbau der Blätter und Fälligkeit (30 Tage, „bald fällig“
// ab 14 Tagen) in lib/pruefExport.ts bzw. vorOrt.ts — hier nur die GerüstDex-Spalten.

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
import { GERUESTDEX_VOR_ORT } from './vorOrt';
import { CHECKLIST, INSPECTION_LABELS, type Damage, type Inspection, type Scaffold } from './types';

export const GERUESTDEX_EXPORT: PruefExportSpec<Scaffold, Inspection> = {
  cfg: GERUESTDEX_VOR_ORT,
  kindLabels: INSPECTION_LABELS,
  // INSPECTION_SHORT.expert („Befähigte Person“) taugt nicht als Spaltenkopf „… fällig am“
  dueName: 'Prüfung (befähigte Person)',
  bookName: 'Prüfbuch',
  retiredHeader: 'Abgebaut',
  unitColumns: [
    { header: 'Bauart' },
    { header: 'Gerüstsystem' },
    { header: 'Ersteller (Gerüstbaubetrieb)' },
    { header: 'Aufbaudatum (lt. Kennzeichnung)' },
    { header: 'Lastklasse (EN 12811-1)' },
    { header: 'Breitenklasse (EN 12811-1)' },
  ],
  unitCells: (g) => [g.category || null, g.manufacturer, g.erected_by, g.erected_at, g.load_class, g.width_class],
  result: (i) => ({ summary: checklistSummary(i.checklist ?? {}), defects: countDefects(i.checklist, CHECKLIST) }),
};

type BookInput = PruefbuchInput<Scaffold, Inspection, Damage>;
type ListInput = InspectionListInput<Scaffold, Inspection>;

export const pruefbuchSheets = (input: BookInput): XlsxSheet[] => buildPruefbuch(GERUESTDEX_EXPORT, input);
export const inspectionSheets = (input: ListInput): XlsxSheet[] => buildInspectionList(GERUESTDEX_EXPORT, input);
/** „GeruestDex_Pruefbuch_<heute>.xlsx“ */
export const savePruefbuch = (input: BookInput): Promise<void> => exportPruefbuch(GERUESTDEX_EXPORT, input);
/** „GeruestDex_Pruefungen_<von>_bis_<bis>.xlsx“ */
export const saveInspections = (input: ListInput): Promise<void> => exportInspectionList(GERUESTDEX_EXPORT, input);
