// Appübergreifende Fälligkeits-Anzeige: ein Adapter pro App liefert eine
// einheitliche Liste fälliger Punkte für Kachel-Badges + Glocken-Popup.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DueItem {
  /** stabiler Key für React-Listen (z. B. `${objektId}:${prüfart}`) */
  id: string;
  /** Kurzname des betroffenen Objekts (Leiter, Gerät, Fahrzeug …) */
  label: string;
  /** Kontext + Art der Fälligkeit (z. B. „Werkstatt Nord — Regelmäßige Prüfung überfällig") */
  sublabel?: string;
  /** Zielroute im Dashboard beim Klick (Bereichs-Übersicht/Fälligkeitsliste) */
  route: string;
}

export interface DueResult {
  count: number;
  items: DueItem[];
}

/** Bekommt den (bereits eingeloggten) supabase-Client der App, liefert die Fälligkeiten. */
export type DueAdapter = (sb: SupabaseClient) => Promise<DueResult>;
