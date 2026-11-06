import type { SupabaseClient } from '@supabase/supabase-js';
import {
  expertIntervalDays,
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
} from '../feuerdex/types';
import { buildIntervalDue, loadAll, loadDueMeta, throwOnError, type DueUnit } from './shared';
import type { DueResult } from './types';

// FeuerDex: Prüfung hängt am einzelnen Feuerlöscher (Sichtkontrolle 90 T /
// Sachkundigen-Prüfung land-abhängig: DE/AT 730 T, CH 1095 T).
// Nur nicht-ausgesonderte Löscher an aktiven Standorten.
// Alles vollständig (auch über 1.000 Zeilen): Standorte, Löscher und die nötigen Prüfungen.
export async function feuerdexDue(sb: SupabaseClient): Promise<DueResult> {
  const [sites, extinguishers, org] = await Promise.all([
    loadAll(sb, 'site', 'id, name, active'),
    loadAll(sb, 'extinguisher', 'id, site_id, name, retired'),
    sb.from('org').select('land').limit(1).maybeSingle(),
  ]);
  throwOnError(org.error);
  const intervals = {
    ...INSPECTION_INTERVAL_DAYS,
    expert: expertIntervalDays(org.data?.land),
  };

  const activeSiteIds = new Set(sites.filter((s) => s.active).map((s) => s.id));
  const siteName = new Map(sites.map((s) => [s.id, s.name as string]));

  const units: DueUnit[] = extinguishers
    .filter((e) => !e.retired && activeSiteIds.has(e.site_id))
    .map((e) => ({ id: e.id, label: e.name, context: siteName.get(e.site_id) }));

  const meta = await loadDueMeta(sb, 'extinguisher_id', units.map((u) => u.id), intervals);

  return buildIntervalDue(
    units,
    meta,
    intervals,
    INSPECTION_SHORT,
    '/app/feuerdex',
  );
}
