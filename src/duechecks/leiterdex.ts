import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
} from '../leiterdex/types';
import { buildIntervalDue, throwOnError, type DueUnit } from './shared';
import type { DueResult } from './types';

// LeiterDex: Prüfung hängt an der einzelnen Leiter (Sichtkontrolle 30 T /
// regelmäßige Prüfung 365 T). Nur nicht-ausgesonderte Leitern an aktiven Standorten.
export async function leiterdexDue(sb: SupabaseClient): Promise<DueResult> {
  const [sites, ladders, insp] = await Promise.all([
    sb.from('site').select('id, name, active'),
    sb.from('ladder').select('id, site_id, name, retired'),
    sb
      .from('inspection')
      .select('ladder_id, type, started_at, canceled')
      .order('started_at', { ascending: false })
      .limit(2000),
  ]);
  throwOnError(sites.error, ladders.error, insp.error);

  const activeSiteIds = new Set(
    (sites.data ?? []).filter((s) => s.active).map((s) => s.id),
  );
  const siteName = new Map((sites.data ?? []).map((s) => [s.id, s.name as string]));

  const units: DueUnit[] = (ladders.data ?? [])
    .filter((l) => !l.retired && activeSiteIds.has(l.site_id))
    .map((l) => ({ id: l.id, label: l.name, context: siteName.get(l.site_id) }));

  const meta = (insp.data ?? []).map((i) => ({
    unitId: i.ladder_id as string,
    type: i.type as string,
    startedAt: i.started_at as string,
    canceled: i.canceled as boolean,
  }));

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/leiterdex',
  );
}
