import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
} from '../feuerdex/types';
import { buildIntervalDue, throwOnError, type DueUnit } from './shared';
import type { DueResult } from './types';

// FeuerDex: Prüfung hängt am einzelnen Feuerlöscher (Sichtkontrolle 90 T /
// Sachkundigen-Prüfung 730 T). Nur nicht-ausgesonderte Löscher an aktiven Standorten.
export async function feuerdexDue(sb: SupabaseClient): Promise<DueResult> {
  const [sites, extinguishers, insp] = await Promise.all([
    sb.from('site').select('id, name, active'),
    sb.from('extinguisher').select('id, site_id, name, retired'),
    sb
      .from('inspection')
      .select('extinguisher_id, type, started_at, canceled')
      .order('started_at', { ascending: false })
      .limit(2000),
  ]);
  throwOnError(sites.error, extinguishers.error, insp.error);

  const activeSiteIds = new Set(
    (sites.data ?? []).filter((s) => s.active).map((s) => s.id),
  );
  const siteName = new Map((sites.data ?? []).map((s) => [s.id, s.name as string]));

  const units: DueUnit[] = (extinguishers.data ?? [])
    .filter((e) => !e.retired && activeSiteIds.has(e.site_id))
    .map((e) => ({ id: e.id, label: e.name, context: siteName.get(e.site_id) }));

  const meta = (insp.data ?? []).map((i) => ({
    unitId: i.extinguisher_id as string,
    type: i.type as string,
    startedAt: i.started_at as string,
    canceled: i.canceled as boolean,
  }));

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/feuerdex',
  );
}
