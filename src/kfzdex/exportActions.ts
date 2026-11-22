// KfzDex — Excel-Knopf „Fuhrpark“ (Fahrzeuge- und Fahrer-Seite): alles vollständig laden, Datei speichern.
// Gratis und für alle Rollen: KfzDex sperrt im Dashboard keine Auswertungen (Pro begrenzt nur die Anzahl der
// Fahrzeuge/Fahrer beim Anlegen), und beide Seiten zeigen jeder Rolle den ganzen Fuhrpark.
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadXlsx } from '../lib/xlsx';
import { todayLocalISO } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { fetchDrivers, fetchLicenseChecksAll, fetchUvvInspectionsAll, fetchVehicles } from './api';
import { EXPORT_TZ, fleetSheets } from './exportLists';

/** Frisch geladen, damit gerade Erfasstes dabei ist. */
export async function exportFleet(sb: SupabaseClient, org: Org | null | undefined): Promise<void> {
  if (!org) throw new Error('Betrieb nicht geladen.');
  const [vehicles, drivers, inspections, checks] = await Promise.all([
    fetchVehicles(sb),
    fetchDrivers(sb),
    fetchUvvInspectionsAll(sb),
    fetchLicenseChecksAll(sb),
  ]);
  const sheets = fleetSheets({ org, vehicles, drivers, inspections, checks });
  await downloadXlsx(`KfzDex_Fuhrpark_${todayLocalISO()}`, sheets, {
    title: 'KfzDex Fuhrpark',
    creator: 'Dexware KfzDex',
    timeZone: EXPORT_TZ,
  });
}
