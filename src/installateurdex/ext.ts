// Zusatz-Bereiche des Betriebsportals (seit 06.11.2026): Planung (planung/), Geld (geld/), Auswertungen (auswertung/).
// Jeder Bereich hat eine eigene Datenquelle (echt + Beispieldaten) und hängt sich hier mit je EINER Zeile
// pro Anker ein. Anker-Kommentare (// @ext-…) nicht entfernen.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabasePlanung, type PlanungData } from './planung/data';
import { supabaseAuswertung, type AuswertungData } from './auswertung/data';
import { supabaseGeld, type GeldData } from './geld/api';
// @ext-import

export interface ExtData {
  planung: PlanungData;
  auswertung: AuswertungData;
  geld: GeldData;
  // @ext-type
}

/** Echte Daten — gleiche RLS wie die App. */
export function realExt(sb: SupabaseClient): ExtData {
  void sb;
  return {
    planung: supabasePlanung(sb),
    auswertung: supabaseAuswertung(sb),
    geld: supabaseGeld(sb),
    // @ext-real
  };
}
