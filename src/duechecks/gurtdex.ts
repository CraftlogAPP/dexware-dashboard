import type { SupabaseClient } from '@supabase/supabase-js';
import { INSPECTION_INTERVAL_DAYS, INSPECTION_SHORT } from '../gurtdex/types';
import { buildIntervalDue, loadAll, loadDueMeta, type DueUnit } from './shared';
import type { DueResult } from './types';

// GurtDex: Prüfung hängt am einzelnen PSA-Artikel (Sicht-/Funktionskontrolle
// 30 T / Sachkundigen-Prüfung 365 T, DGUV G 312-906 / EN 365 — landesunabhängig).
// Nur nicht-ausgesonderte Artikel an aktiven Standorten.
export async function gurtdexDue(sb: SupabaseClient): Promise<DueResult> {
  // Vollständig (auch über 1.000 Zeilen): Standorte, Objekte und die nötigen Prüfungen.
  const [sites, items] = await Promise.all([
    loadAll(sb, 'site', 'id, name, active'),
    loadAll(sb, 'psa_item', 'id, site_id, name, retired'),
  ]);

  const activeSiteIds = new Set(
    sites.filter((s) => s.active).map((s) => s.id),
  );
  const siteName = new Map(sites.map((s) => [s.id, s.name as string]));

  const units: DueUnit[] = items
    .filter((g) => !g.retired && activeSiteIds.has(g.site_id))
    .map((g) => ({ id: g.id, label: g.name, context: siteName.get(g.site_id) }));

  const meta = await loadDueMeta(sb, 'item_id', units.map((u) => u.id), INSPECTION_INTERVAL_DAYS);

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/gurtdex',
  );
}
