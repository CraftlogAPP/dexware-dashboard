import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
} from '../leiterdex/types';
import { buildIntervalDue, loadAll, loadDueMeta, type DueUnit } from './shared';
import type { DueResult } from './types';

// LeiterDex: Prüfung hängt an der einzelnen Leiter (Sichtkontrolle 30 T /
// regelmäßige Prüfung 365 T). Nur nicht-ausgesonderte Leitern an aktiven Standorten.
export async function leiterdexDue(sb: SupabaseClient): Promise<DueResult> {
  // Vollständig (auch über 1.000 Zeilen): Standorte, Objekte und die nötigen Prüfungen.
  const [sites, ladders] = await Promise.all([
    loadAll(sb, 'site', 'id, name, active'),
    loadAll(sb, 'ladder', 'id, site_id, name, retired'),
  ]);

  const activeSiteIds = new Set(
    sites.filter((s) => s.active).map((s) => s.id),
  );
  const siteName = new Map(sites.map((s) => [s.id, s.name as string]));

  const units: DueUnit[] = ladders
    .filter((l) => !l.retired && activeSiteIds.has(l.site_id))
    .map((l) => ({ id: l.id, label: l.name, context: siteName.get(l.site_id) }));

  const meta = await loadDueMeta(sb, 'ladder_id', units.map((u) => u.id), INSPECTION_INTERVAL_DAYS);

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/leiterdex',
  );
}
