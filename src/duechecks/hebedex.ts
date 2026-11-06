import type { SupabaseClient } from '@supabase/supabase-js';
import { crackDue, expertDue, fmtDate, type DueInfo, type LiftingItem } from '../hebedex/types';
import { loadAll, loadDueMeta, throwOnError } from './shared';
import type { DueItem, DueResult } from './types';

type ItemRow = Pick<LiftingItem, 'id' | 'site_id' | 'name' | 'kind' | 'build_year' | 'created_at' | 'retired'>;

// HebeDex: Fälligkeit je Teil wie in der App — wiederkehrende Prüfung DE alle 12 Monate,
// AT jedes Kalenderjahr / längstens 15 Monate; Rundstahlketten zusätzlich Rissprüfung
// alle 3 Jahre. Nur nicht-ausgesonderte Teile an aktiven Standorten; Sichtkontrollen
// vor Gebrauch sind freiwillig dokumentiert und lösen nichts aus.
// Vollständig (auch über 1.000 Zeilen): Standorte, Teile und die nötigen Prüfungen.
export async function hebedexDue(sb: SupabaseClient): Promise<DueResult> {
  const [org, sites, items] = await Promise.all([
    sb.from('org').select('land').limit(1).maybeSingle(),
    loadAll(sb, 'site', 'id, name, active'),
    loadAll<ItemRow>(sb, 'lifting_item', 'id, site_id, name, kind, build_year, created_at, retired'),
  ]);
  throwOnError(org.error);

  const land = (org.data?.land as string | undefined) ?? 'DE';
  const activeSiteIds = new Set(sites.filter((s) => s.active).map((s) => s.id));
  const siteName = new Map(sites.map((s) => [s.id, s.name as string]));
  const activeItems = items.filter((it) => !it.retired && activeSiteIds.has(it.site_id));
  // Fenster: längstens 15 Monate (AT) bzw. 3 Jahre Rissprüfung — ältere jüngste Prüfungen werden nachgeladen.
  const insp = await loadDueMeta(sb, 'item_id', activeItems.map((it) => it.id), { expert: 15 * 31, crack: 3 * 365 });
  const last = new Map<string, string>(); // `${item_id}:${type}` → jüngstes started_at
  for (const i of insp) {
    if (i.canceled) continue;
    const key = `${i.unitId}:${i.type}`;
    if (!last.has(key)) last.set(key, i.startedAt);
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
  for (const it of activeItems) {
    push(it, 'Wiederkehrende Prüfung', expertDue(last.get(`${it.id}:expert`), land));
    push(it, 'Rissprüfung', crackDue(it, last.get(`${it.id}:crack`)));
  }
  scored.sort((a, b) => b.sort - a.sort);
  const list = scored.map(({ sort: _sort, ...item }) => item);
  return { count: list.length, items: list };
}
