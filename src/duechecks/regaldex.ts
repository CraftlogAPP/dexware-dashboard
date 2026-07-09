import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
} from '../regaldex/types';
import { buildIntervalDue, throwOnError, type DueUnit } from './shared';
import type { DueResult } from './types';

// RegalDex: Inspektion je Lager (Sichtkontrolle 7 T / Experteninspektion 365 T).
// Nur aktive Lager.
export async function regaldexDue(sb: SupabaseClient): Promise<DueResult> {
  const [warehouses, insp] = await Promise.all([
    sb.from('warehouse').select('id, name, active'),
    sb
      .from('inspection')
      .select('warehouse_id, type, started_at, canceled')
      .order('started_at', { ascending: false })
      .limit(2000),
  ]);
  throwOnError(warehouses.error, insp.error);

  const units: DueUnit[] = (warehouses.data ?? [])
    .filter((w) => w.active)
    .map((w) => ({ id: w.id, label: w.name }));

  const meta = (insp.data ?? []).map((i) => ({
    unitId: i.warehouse_id as string,
    type: i.type as string,
    startedAt: i.started_at as string,
    canceled: i.canceled as boolean,
  }));

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/regaldex',
  );
}
