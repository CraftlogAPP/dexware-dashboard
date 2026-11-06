import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
} from '../regaldex/types';
import { buildIntervalDue, loadAll, loadDueMeta, type DueUnit } from './shared';
import type { DueResult } from './types';

// RegalDex: Inspektion je Lager (Sichtkontrolle 7 T / Experteninspektion 365 T).
// Nur aktive Lager.
export async function regaldexDue(sb: SupabaseClient): Promise<DueResult> {
  // Vollständig (auch über 1.000 Zeilen): alle Objekte und die nötigen Prüfungen.
  const warehouses = await loadAll(sb, 'warehouse', 'id, name, active');

  const units: DueUnit[] = warehouses
    .filter((w) => w.active)
    .map((w) => ({ id: w.id, label: w.name }));

  const meta = await loadDueMeta(sb, 'warehouse_id', units.map((u) => u.id), INSPECTION_INTERVAL_DAYS);

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/regaldex',
  );
}
