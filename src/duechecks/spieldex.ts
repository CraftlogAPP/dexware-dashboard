import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
} from '../spieldex/types';
import { buildIntervalDue, throwOnError, type DueUnit } from './shared';
import type { DueResult } from './types';

// SpielDex: Kontrolle je Spielplatz (visuell 7 T / operativ 90 T /
// Jahreshauptinspektion 365 T). Nur aktive Spielplätze.
export async function spieldexDue(sb: SupabaseClient): Promise<DueResult> {
  const [playgrounds, insp] = await Promise.all([
    sb.from('playground').select('id, name, active'),
    sb
      .from('inspection')
      .select('playground_id, type, started_at, canceled')
      .order('started_at', { ascending: false })
      .limit(2000),
  ]);
  throwOnError(playgrounds.error, insp.error);

  const units: DueUnit[] = (playgrounds.data ?? [])
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, label: p.name }));

  const meta = (insp.data ?? []).map((i) => ({
    unitId: i.playground_id as string,
    type: i.type as string,
    startedAt: i.started_at as string,
    canceled: i.canceled as boolean,
  }));

  return buildIntervalDue(
    units,
    meta,
    INSPECTION_INTERVAL_DAYS,
    INSPECTION_SHORT,
    '/app/spieldex',
  );
}
