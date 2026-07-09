import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDate } from '../lib/format';
import { dueStatus } from '../pruefdex/labels';
import { throwOnError } from './shared';
import type { DueItem, DueResult } from './types';

// PrüfDex: je Gerät ein gespeichertes next_due_date. Fällig = überfällig
// (Datum < heute) oder bald fällig (≤ 1 Monat) — analog Übersichts-Ampel.
export async function pruefdexDue(sb: SupabaseClient): Promise<DueResult> {
  const [devices, customers] = await Promise.all([
    sb.from('device').select('id, name, next_due_date, customer_id'),
    sb.from('customer').select('id, name'),
  ]);
  throwOnError(devices.error, customers.error);

  const custName = new Map((customers.data ?? []).map((c) => [c.id, c.name as string]));

  const scored: (DueItem & { sort: number })[] = [];
  for (const d of devices.data ?? []) {
    const status = dueStatus(d.next_due_date);
    if (status !== 'overdue' && status !== 'soon') continue;
    const cust = d.customer_id ? custName.get(d.customer_id) : null;
    const state = status === 'overdue' ? 'überfällig' : 'bald fällig';
    scored.push({
      id: d.id,
      label: d.name,
      sublabel: `${cust ? `${cust} — ` : ''}Prüfung ${state} (${fmtDate(d.next_due_date)})`,
      route: '/app/pruefdex',
      // überfällig vor bald fällig, innerhalb dessen frühestes Datum zuerst
      sort:
        (status === 'overdue' ? 2e13 : 1e13) -
        new Date(d.next_due_date + 'T00:00:00').getTime(),
    });
  }
  scored.sort((a, b) => b.sort - a.sort);
  const items = scored.map(({ sort: _sort, ...item }) => item);
  return { count: items.length, items };
}
