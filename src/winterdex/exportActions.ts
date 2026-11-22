// WinterDex — gemeinsame Schritte der Excel-Knöpfe (Einsätze, Strecken, Strecke, Objekte).
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadXlsx, ExportNotice, type XlsxSheet } from '../lib/xlsx';
import { EXPORT_TZ, type ExportPeriod } from './exportLists';
import { fetchOrgPro, PRO_HOW, PRO_MAILTO } from './pro';

/** Zeitraum aus den Filterfeldern prüfen (yyyy-mm-dd, lokale Kalendertage). */
export function checkPeriod(from: string, to: string): ExportPeriod {
  if (!from || !to) throw new ExportNotice('Bitte Von- und Bis-Datum wählen.');
  if (from > to) throw new ExportNotice('„Von“ liegt nach „Bis“ — bitte den Zeitraum prüfen.');
  return { from, to };
}

/** Einsatz- und Fahrtenliste gehören zu Pro (Server-Auskunft; unklar = erlaubt, wie überall). */
export async function requirePro(sb: SupabaseClient): Promise<void> {
  if (await fetchOrgPro(sb)) return;
  throw new ExportNotice(`Die Excel-Liste zum Abrechnen gehört zu WinterDex Pro. ${PRO_HOW}`, {
    href: PRO_MAILTO,
    label: 'E-Mail schreiben',
  });
}

/** Datei speichern — Name ohne Endung, z. B. „WinterDex_Einsaetze_2026-11-01_bis_2026-11-22“. */
export function saveSheets(fileName: string, title: string, sheets: XlsxSheet[]): Promise<void> {
  return downloadXlsx(fileName, sheets, { title, creator: 'Dexware WinterDex', timeZone: EXPORT_TZ });
}
