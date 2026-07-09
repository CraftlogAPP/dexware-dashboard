import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDateTime } from '../lib/format';
import { throwOnError } from './shared';
import type { DueItem, DueResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
// „Fällig" = aktives Objekt ohne dokumentierten Einsatz in den letzten 48 h
// (identisch zur WinterDex-Übersicht „> 48 h ohne Einsatz").
const STALE_MS = 2 * DAY_MS;

// Winterdienst ist saisonal: außerhalb Oktober–April würde die 48-h-Regel
// jedes aktive Objekt dauerhaft als fällig melden — im Sommer stumm bleiben.
function inSeason(d = new Date()): boolean {
  const m = d.getMonth(); // 0-basiert: Okt=9 … Dez=11, Jan=0 … Apr=3
  return m >= 9 || m <= 3;
}

export async function winterdexDue(sb: SupabaseClient): Promise<DueResult> {
  if (!inSeason()) return { count: 0, items: [] };
  const [properties, ops] = await Promise.all([
    sb.from('property').select('id, name, active'),
    sb
      .from('operation')
      .select('property_id, started_at, canceled')
      .order('started_at', { ascending: false })
      .limit(2000),
  ]);
  throwOnError(properties.error, ops.error);

  const lastByProp = new Map<string, string>();
  for (const o of ops.data ?? []) {
    if (o.canceled) continue;
    if (!lastByProp.has(o.property_id)) lastByProp.set(o.property_id, o.started_at);
  }

  const now = Date.now();
  const scored: (DueItem & { sort: number })[] = [];
  for (const p of properties.data ?? []) {
    if (!p.active) continue;
    const last = lastByProp.get(p.id);
    const ageMs = last ? now - new Date(last).getTime() : Infinity;
    if (ageMs > STALE_MS) {
      scored.push({
        id: p.id,
        label: p.name,
        sublabel: last
          ? `Letzter Einsatz ${fmtDateTime(last)}`
          : 'Noch nie dokumentiert',
        route: '/app/winterdex',
        sort: ageMs === Infinity ? Number.MAX_SAFE_INTEGER : ageMs,
      });
    }
  }
  scored.sort((a, b) => b.sort - a.sort);
  const items = scored.map(({ sort: _sort, ...item }) => item);
  return { count: items.length, items };
}
