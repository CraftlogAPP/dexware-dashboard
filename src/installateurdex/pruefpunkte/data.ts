// Datenquelle „Eigene Prüfpunkte & Messwerte“ — gleicher Weg wie die App (mobile/src/data/supabaseRepository.ts
// getCustomChecks/saveCustomChecks): org.checklists lesen bzw. per UPDATE schreiben.
// Regeln am Server (InstallateurDex/supabase/pflichtangaben.sql + NACHTRAG-SICHERHEIT-2026-11-06.sql):
//   Lesen alle Mitglieder · Schreiben nur Inhaber (RLS org_update) · Ändern nur mit Pro (Trigger org_pro_settings_guard,
//   Zurücksetzen auf {} geht immer) · Größe < 64 000 Bytes (org_checklists_object).
// Beispieldaten: pruefpunkte/demo.ts (nur über ext-demo.ts / DemoArea — hier NIE importieren).

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PruefpunkteData {
  /** Roher jsonb-Wert (unbereinigt — für das Mergen beim Speichern). */
  load(orgId: string): Promise<unknown>;
  save(orgId: string, value: Record<string, unknown>): Promise<void>;
}

/** Fehler in einen Satz für den Inhaber übersetzen (wie App CustomChecksScreen.save). */
export function saveErrorText(e: unknown): string {
  const msg = String((e as { message?: unknown })?.message ?? e ?? '');
  const hint = String((e as { hint?: unknown })?.hint ?? '');
  if (/Inhaber/.test(msg)) return msg;
  if (msg === 'pro' || /mit Pro/.test(hint)) return 'Eigene Prüfpunkte ändern geht nur mit Pro. Bestehende Anpassungen bleiben erhalten und wirken weiter.';
  if (/checklists_object|check constraint/i.test(msg)) return 'Die Listen sind zu groß. Bitte Einträge kürzen.';
  return 'Nicht gespeichert — bitte Verbindung prüfen und erneut versuchen.';
}

export function supabasePruefpunkte(sb: SupabaseClient): PruefpunkteData {
  return {
    async load(orgId) {
      const { data, error } = await sb.from('org').select('checklists').eq('id', orgId).maybeSingle();
      if (error) throw new Error(`Prüfpunkte konnten nicht geladen werden: ${error.message}`);
      return (data as { checklists?: unknown } | null)?.checklists ?? {};
    },
    async save(orgId, value) {
      const { data, error } = await sb.from('org').update({ checklists: value }).eq('id', orgId).select('id');
      if (error) throw error;
      // RLS lässt das Update still ins Leere laufen, wenn man nicht Inhaber ist
      if (!data?.length) throw new Error('Nur der Inhaber kann das ändern.');
    },
  };
}
