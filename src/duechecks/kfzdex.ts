import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDate } from '../lib/format';
import { licenseDue, uvvDue, type DueInfo } from '../kfzdex/due';
import type { Driver, Vehicle } from '../kfzdex/types';
import { throwOnError } from './shared';
import type { DueItem, DueResult } from './types';

const STATE_LABEL: Record<DueInfo['status'], string> = {
  ok: '',
  soon: 'bald fällig',
  overdue: 'überfällig',
  missing: 'noch nie geprüft',
};

function sortKey(due: DueInfo): number {
  if (due.status === 'missing') return Number.MAX_SAFE_INTEGER;
  return -(due.days ?? 0); // je überfälliger (days negativ), desto höher
}

// KfzDex: UVV-Prüfung je Fahrzeug (12 Monate) + Führerscheinkontrolle je aktivem
// Fahrer (Intervall am Fahrer). Fällig = überfällig / bald fällig / noch nie.
export async function kfzdexDue(sb: SupabaseClient): Promise<DueResult> {
  const [vehicles, drivers] = await Promise.all([
    sb.from('vehicle').select('id, plate, name, type, last_uvv'),
    sb.from('driver').select('id, name, active, last_check, check_interval_months'),
  ]);
  throwOnError(vehicles.error, drivers.error);

  const scored: (DueItem & { sort: number })[] = [];

  for (const v of (vehicles.data ?? []) as Vehicle[]) {
    const due = uvvDue(v);
    if (due.status === 'ok') continue;
    scored.push({
      id: `veh:${v.id}`,
      label: v.plate,
      sublabel: `UVV ${STATE_LABEL[due.status]}${due.dueDate ? ` (fällig ${fmtDate(due.dueDate.toISOString())})` : ''}`,
      route: '/app/kfzdex',
      sort: sortKey(due),
    });
  }

  for (const d of (drivers.data ?? []) as Driver[]) {
    if (!d.active) continue;
    const due = licenseDue(d);
    if (due.status === 'ok') continue;
    scored.push({
      id: `drv:${d.id}`,
      label: d.name,
      sublabel: `Führerscheinkontrolle ${STATE_LABEL[due.status]}${due.dueDate ? ` (fällig ${fmtDate(due.dueDate.toISOString())})` : ''}`,
      route: '/app/kfzdex',
      sort: sortKey(due),
    });
  }

  scored.sort((a, b) => b.sort - a.sort);
  const items = scored.map(({ sort: _sort, ...item }) => item);
  return { count: items.length, items };
}
