import type { SupabaseClient } from '@supabase/supabase-js';
import { INSPECTION_INTERVAL_DAYS, INSPECTION_SHORT } from '../toredex/types';
import { buildIntervalDue, loadAll, loadDueMeta, type DueUnit } from './shared';
import type { DueResult } from './types';

// ToreDex: Prüfung hängt am einzelnen Tor (Sichtkontrolle 30 T /
// Sachkundigen-Prüfung 365 T, ASR A1.7 — landesunabhängig).
// Nur nicht-stillgelegte Tore an aktiven Objekten.
export async function toredexDue(sb: SupabaseClient): Promise<DueResult> {
  // Vollständig (auch über 1.000 Zeilen): Standorte, Objekte und die nötigen Prüfungen.
  const [sites, gates] = await Promise.all([
    loadAll(sb, 'site', 'id, name, active'),
    loadAll(sb, 'gate', 'id, site_id, name, retired'),
  ]);

  const activeSiteIds = new Set(
    sites.filter((s) => s.active).map((s) => s.id),
  );
  const siteName = new Map(sites.map((s) => [s.id, s.name as string]));

  const units: DueUnit[] = gates
    .filter((g) => !g.retired && activeSiteIds.has(g.site_id))
    .map((g) => ({ id: g.id, label: g.name, context: siteName.get(g.site_id) }));

  const meta = await loadDueMeta(sb, 'gate_id', units.map((u) => u.id), INSPECTION_INTERVAL_DAYS);

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/toredex',
  );
}
