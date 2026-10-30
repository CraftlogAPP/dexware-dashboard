import type { SupabaseClient } from '@supabase/supabase-js';
import { crackDue, expertDue, fmtDate, type DueInfo, type LiftingItem } from '../hebedex/types';
import { throwOnError } from './shared';
import type { DueItem, DueResult } from './types';

// HebeDex: Fälligkeit je Teil wie in der App — wiederkehrende Prüfung DE alle 12 Monate,
// AT jedes Kalenderjahr / längstens 15 Monate; Rundstahlketten zusätzlich Rissprüfung
// alle 3 Jahre. Nur nicht-ausgesonderte Teile an aktiven Standorten; Sichtkontrollen
// vor Gebrauch sind freiwillig dokumentiert und lösen nichts aus.
export async function hebedexDue(sb: SupabaseClient): Promise<DueResult> {
  const [org, sites, items, insp] = await Promise.all([
    sb.from('org').select('land').limit(1).maybeSingle(),
    sb.from('site').select('id, name, active'),
    sb.from('lifting_item').select('id, site_id, name, kind, build_year, created_at, retired'),
    sb
      .from('inspection')
      .select('item_id, type, started_at, canceled')
      .in('type', ['expert', 'crack'])
      .order('started_at', { ascending: false })
      .limit(3000),
  ]);
  throwOnError(org.error, sites.error, items.error, insp.error);

  const land = (org.data?.land as string | undefined) ?? 'DE';
  const activeSiteIds = new Set((sites.data ?? []).filter((s) => s.active).map((s) => s.id));
  const siteName = new Map((sites.data ?? []).map((s) => [s.id, s.name as string]));
  const last = new Map<string, string>(); // `${item_id}:${type}` → jüngstes started_at
  for (const i of insp.data ?? []) {
    if (i.canceled) continue;
    const key = `${i.item_id}:${i.type}`;
    if (!last.has(key)) last.set(key, i.started_at as string);
  }

  const scored: (DueItem & { sort: number })[] = [];
  const push = (it: { id: string; site_id: string; name: string }, what: string, d: DueInfo | undefined) => {
    if (!d || (d.state !== 'overdue' && d.state !== 'never')) return;
    const ctx = siteName.get(it.site_id);
    const state = d.state === 'never' ? 'noch nie geprüft' : `überfällig seit ${fmtDate(d.dueAt!)}`;
    scored.push({
      id: `${it.id}:${what}`,
      label: it.name,
      sublabel: `${ctx ? `${ctx} — ` : ''}${what} ${state}`,
      route: '/app/hebedex',
      sort: d.daysLeft === null ? Number.MAX_SAFE_INTEGER : -d.daysLeft,
    });
  };
  for (const it of (items.data ?? []) as Pick<LiftingItem, 'id' | 'site_id' | 'name' | 'kind' | 'build_year' | 'created_at' | 'retired'>[]) {
    if (it.retired || !activeSiteIds.has(it.site_id)) continue;
    push(it, 'Wiederkehrende Prüfung', expertDue(last.get(`${it.id}:expert`), land));
    push(it, 'Rissprüfung', crackDue(it, last.get(`${it.id}:crack`)));
  }
  scored.sort((a, b) => b.sort - a.sort);
  const list = scored.map(({ sort: _sort, ...item }) => item);
  return { count: list.length, items: list };
}
