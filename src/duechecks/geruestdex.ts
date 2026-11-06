import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
} from '../geruestdex/types';
import { buildIntervalDue, loadAll, loadDueMeta, type DueUnit } from './shared';
import type { DueResult } from './types';

// GerüstDex: Prüfung hängt an der Baustelle (Inaugenscheinnahme arbeitstäglich
// 1 T / Prüfung durch befähigte Person 30 T). Nur aktive Baustellen.
export async function geruestdexDue(sb: SupabaseClient): Promise<DueResult> {
  // Vollständig (auch über 1.000 Zeilen): alle Objekte und die nötigen Prüfungen.
  const sites = await loadAll(sb, 'site', 'id, name, active');

  const units: DueUnit[] = sites
    .filter((s) => s.active)
    .map((s) => ({ id: s.id, label: s.name }));

  const meta = await loadDueMeta(sb, 'site_id', units.map((u) => u.id), INSPECTION_INTERVAL_DAYS);

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/geruestdex',
  );
}
