import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
} from '../spieldex/types';
import { buildIntervalDue, loadAll, loadDueMeta, type DueUnit } from './shared';
import type { DueResult } from './types';

// SpielDex: Kontrolle je Spielplatz (visuell 7 T / operativ 90 T /
// Jahreshauptinspektion 365 T). Nur aktive Spielplätze.
export async function spieldexDue(sb: SupabaseClient): Promise<DueResult> {
  // Vollständig (auch über 1.000 Zeilen): alle Objekte und die nötigen Prüfungen.
  const playgrounds = await loadAll(sb, 'playground', 'id, name, active');

  const units: DueUnit[] = playgrounds
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, label: p.name }));

  const meta = await loadDueMeta(sb, 'playground_id', units.map((u) => u.id), INSPECTION_INTERVAL_DAYS);

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/spieldex',
  );
}
