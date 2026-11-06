import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDateTime } from '../lib/format';
import { fetchLatestWindow } from '../lib/completeQueries';
import { loadAll, throwOnError } from './shared';
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
  // Vollständig (auch über 1.000 Zeilen): alle Objekte; Einsätze der letzten 7 Tage und je
  // aktivem Objekt ohne Einsatz darin der jüngste ältere (für „Letzter Einsatz …").
  const properties = (await loadAll(sb, 'property', 'id, name, active')).filter((p) => p.active);
  const ops = await fetchLatestWindow<{ property_id: string; started_at: string; canceled: boolean }>({
    sb,
    table: 'operation',
    cols: 'id, property_id, started_at, canceled',
    dateCol: 'started_at',
    unitCol: 'property_id',
    units: properties.map((p) => p.id),
    windowDays: 7,
    canceled: true,
  });
  throwOnError(ops.error);

  const lastByProp = new Map<string, string>();
  for (const o of ops.data) {
    if (o.canceled) continue;
    if (!lastByProp.has(o.property_id)) lastByProp.set(o.property_id, o.started_at);
  }

  const now = Date.now();
  const scored: (DueItem & { sort: number })[] = [];
  for (const p of properties) {
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
