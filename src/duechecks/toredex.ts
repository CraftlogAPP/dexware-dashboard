import type { SupabaseClient } from '@supabase/supabase-js';
import { INSPECTION_INTERVAL_DAYS, INSPECTION_SHORT } from '../toredex/types';
import { buildIntervalDue, throwOnError, type DueUnit } from './shared';
import type { DueResult } from './types';

// ToreDex: Prüfung hängt am einzelnen Tor (Sichtkontrolle 30 T /
// Sachkundigen-Prüfung 365 T, ASR A1.7 — landesunabhängig).
// Nur nicht-stillgelegte Tore an aktiven Objekten.
export async function toredexDue(sb: SupabaseClient): Promise<DueResult> {
  const [sites, gates, insp] = await Promise.all([
    sb.from('site').select('id, name, active'),
    sb.from('gate').select('id, site_id, name, retired'),
    sb
      .from('inspection')
      .select('gate_id, type, started_at, canceled')
      .order('started_at', { ascending: false })
      .limit(2000),
  ]);
  throwOnError(sites.error, gates.error, insp.error);

  const activeSiteIds = new Set(
    (sites.data ?? []).filter((s) => s.active).map((s) => s.id),
  );
  const siteName = new Map((sites.data ?? []).map((s) => [s.id, s.name as string]));

  const units: DueUnit[] = (gates.data ?? [])
    .filter((g) => !g.retired && activeSiteIds.has(g.site_id))
    .map((g) => ({ id: g.id, label: g.name, context: siteName.get(g.site_id) }));

  const meta = (insp.data ?? []).map((i) => ({
    unitId: i.gate_id as string,
    type: i.type as string,
    startedAt: i.started_at as string,
    canceled: i.canceled as boolean,
  }));

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/toredex',
  );
}
