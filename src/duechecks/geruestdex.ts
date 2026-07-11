import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
} from '../geruestdex/types';
import { buildIntervalDue, throwOnError, type DueUnit } from './shared';
import type { DueResult } from './types';

// GerüstDex: Prüfung hängt an der Baustelle (Inaugenscheinnahme arbeitstäglich
// 1 T / Prüfung durch befähigte Person 30 T). Nur aktive Baustellen.
export async function geruestdexDue(sb: SupabaseClient): Promise<DueResult> {
  const [sites, insp] = await Promise.all([
    sb.from('site').select('id, name, active'),
    sb
      .from('inspection')
      .select('site_id, type, started_at, canceled')
      .order('started_at', { ascending: false })
      .limit(2000),
  ]);
  throwOnError(sites.error, insp.error);

  const units: DueUnit[] = (sites.data ?? [])
    .filter((s) => s.active)
    .map((s) => ({ id: s.id, label: s.name }));

  const meta = (insp.data ?? []).map((i) => ({
    unitId: i.site_id as string,
    type: i.type as string,
    startedAt: i.started_at as string,
    canceled: i.canceled as boolean,
  }));

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/geruestdex',
  );
}
