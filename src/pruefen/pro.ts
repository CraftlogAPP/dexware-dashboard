// Gratis-/Pro-Regel der Prüf-Apps — wie in den Apps (mobile/src/lib/entitlement.ts): Die Gratis-Grenze gilt NUR
// für den Bestand (z. B. 2 Leitern, außer Betrieb genommene zählen nicht). Das Dokumentieren von Prüfungen wird
// nie gesperrt — eine blockierte Pflicht-Dokumentation wäre fatal.
// Ob ein Betrieb Pro hat, sagt der SERVER (RPC org_pro_active: Abo des Inhabers, Suite-Abo, Sonderlizenz).
// Antwortet er nicht eindeutig, gilt „Pro“: nie einen zahlenden Betrieb zu Unrecht sperren.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PruefConfig } from './config';

const cache = new WeakMap<SupabaseClient, { v: boolean; at: number }>();
const FRESH_MS = 5 * 60 * 1000;

export async function fetchOrgPro(sb: SupabaseClient, fresh = false): Promise<boolean> {
  const hit = cache.get(sb);
  if (!fresh && hit && Date.now() - hit.at < FRESH_MS) return hit.v;
  try {
    const { data, error } = await sb.rpc('org_pro_active');
    if (error || data === null || data === undefined) return true; // unklar → nicht sperren (nicht merken)
    const v = data === true;
    cache.set(sb, { v, at: Date.now() });
    return v;
  } catch {
    return true;
  }
}

export interface UnitGate {
  allowed: boolean;
  /** Einheiten im Bestand (ohne außer Betrieb genommene) */
  count: number;
  limit: number;
}

/**
 * Darf eine weitere Einheit in den Bestand (neu anlegen oder wieder in Betrieb nehmen)?
 * Gezählt wird betriebsweit über alle Standorte, wie in der App. Lässt sich die Zahl nicht ermitteln, wird nicht gesperrt.
 */
export async function unitGate(sb: SupabaseClient, cfg: PruefConfig): Promise<UnitGate> {
  const limit = cfg.freeUnits;
  const { count, error } = await sb
    .from(cfg.tables.unit)
    .select('id', { count: 'exact', head: true })
    .eq(cfg.cols.retired, false);
  if (error || count === null) return { allowed: true, count: 0, limit };
  if (count < limit) return { allowed: true, count, limit };
  return { allowed: await fetchOrgPro(sb, true), count, limit };
}

/** Hinweistext an der Gratis-Grenze. */
export function gateText(cfg: PruefConfig): string {
  return `Im Gratis-Paket sind ${cfg.freeUnits} ${cfg.labels.unit.many} im Bestand möglich (außer Betrieb genommene zählen nicht) — unbegrenzt viele gibt es mit Pro. ${cfg.proHow}`;
}
