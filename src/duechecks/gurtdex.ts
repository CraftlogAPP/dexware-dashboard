import type { SupabaseClient } from '@supabase/supabase-js';
import { INSPECTION_INTERVAL_DAYS, INSPECTION_SHORT } from '../gurtdex/types';
import { buildIntervalDue, throwOnError, type DueUnit } from './shared';
import type { DueResult } from './types';

// GurtDex: Prüfung hängt am einzelnen PSA-Artikel (Sicht-/Funktionskontrolle
// 30 T / Sachkundigen-Prüfung 365 T, DGUV G 312-906 / EN 365 — landesunabhängig).
// Nur nicht-ausgesonderte Artikel an aktiven Standorten.
export async function gurtdexDue(sb: SupabaseClient): Promise<DueResult> {
  const [sites, items, insp] = await Promise.all([
    sb.from('site').select('id, name, active'),
    sb.from('psa_item').select('id, site_id, name, retired'),
    sb
      .from('inspection')
      .select('item_id, type, started_at, canceled')
      .order('started_at', { ascending: false })
      .limit(2000),
  ]);
  throwOnError(sites.error, items.error, insp.error);

  const activeSiteIds = new Set(
    (sites.data ?? []).filter((s) => s.active).map((s) => s.id),
  );
  const siteName = new Map((sites.data ?? []).map((s) => [s.id, s.name as string]));

  const units: DueUnit[] = (items.data ?? [])
    .filter((g) => !g.retired && activeSiteIds.has(g.site_id))
    .map((g) => ({ id: g.id, label: g.name, context: siteName.get(g.site_id) }));

  const meta = (insp.data ?? []).map((i) => ({
    unitId: i.item_id as string,
    type: i.type as string,
    startedAt: i.started_at as string,
    canceled: i.canceled as boolean,
  }));

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/gurtdex',
  );
}
