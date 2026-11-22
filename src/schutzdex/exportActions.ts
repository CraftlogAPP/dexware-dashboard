// SchutzDex — Excel-Knopf „Unterweisungen“ (Seite „Nachweise“): alles vollständig laden, Datei speichern.
// Gratis: SchutzDex sperrt im Dashboard keine Auswertungen (Pro begrenzt nur die Zahl aktiver Mitarbeiter, pro.ts).
// Nur der Inhaber hat ein Konto (keine Rollen) — er sieht auf den Seiten ohnehin alles.
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadXlsx } from '../lib/xlsx';
import { todayLocalISO } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { fetchAssignments, fetchBriefings, fetchCompletionsForExport, fetchMembers } from './api';
import { briefingSheets, EXPORT_TZ } from './exportLists';

/** Frisch geladen, damit gerade Unterschriebenes dabei ist. Nachweise ohne Unterschrift-Daten. */
export async function exportBriefings(sb: SupabaseClient, org: Org | null | undefined): Promise<void> {
  if (!org) throw new Error('Betrieb nicht geladen.');
  const [members, briefings, completions, assignments] = await Promise.all([
    fetchMembers(sb),
    fetchBriefings(sb),
    fetchCompletionsForExport(sb),
    fetchAssignments(sb),
  ]);
  const sheets = briefingSheets({ org, members, briefings, completions, assignments });
  await downloadXlsx(`SchutzDex_Unterweisungen_${todayLocalISO()}`, sheets, {
    title: 'SchutzDex Unterweisungen',
    creator: 'Dexware SchutzDex',
    timeZone: EXPORT_TZ,
  });
}
