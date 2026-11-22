// PrüfDex — gemeinsame Schritte der Excel-Knöpfe (Geräteliste, Prüfungen). Ohne Pro-Sperre: auch das
// Prüflisten-PDF ist im Dashboard frei — die eigenen Daten gehören dem Betrieb.
import { downloadXlsx, ExportNotice, type XlsxSheet } from '../lib/xlsx';
import { EXPORT_TZ, type ExportPeriod } from './exportLists';

/** Zeitraum aus den Filterfeldern prüfen (yyyy-mm-dd, lokale Kalendertage). */
export function checkPeriod(from: string, to: string): ExportPeriod {
  if (!from || !to) throw new ExportNotice('Bitte Von- und Bis-Datum wählen.');
  if (from > to) throw new ExportNotice('„Von“ liegt nach „Bis“ — bitte den Zeitraum prüfen.');
  return { from, to };
}

/** Datei speichern — Name ohne Endung, z. B. „PruefDex_Pruefungen_2026-08-22_bis_2026-11-22“. */
export function saveSheets(fileName: string, title: string, sheets: XlsxSheet[]): Promise<void> {
  return downloadXlsx(fileName, sheets, { title, creator: 'Dexware PrüfDex', timeZone: EXPORT_TZ });
}
