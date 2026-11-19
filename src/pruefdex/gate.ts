// Gratis-Grenzen von PrüfDex — wie in der App (mobile/src/lib/entitlement.ts): ohne Pro 3 Geräte und 5 Prüfungen.
// Geräte: gezählt wird der Bestand in Betrieb (ausgesonderte zählen nicht). Prüfungen: stornierte zählen mit —
// sonst ließe sich die Grenze per Stornieren umgehen.
// Ob der Betrieb Pro hat, sagt der Server (RPC org_pro_active: Abo des Inhabers, Suite-Abo, Sonderlizenz).
// Lässt sich die Zahl nicht ermitteln oder antwortet der Server nicht eindeutig, wird NICHT gesperrt.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchOrgPro } from '../pruefen/pro';
import { FREE_LIMITS } from './vorOrt/rows';

export interface Gate {
  allowed: boolean;
  count: number;
  limit: number;
}

async function decide(sb: SupabaseClient, count: number | null, limit: number): Promise<Gate> {
  if (count === null) return { allowed: true, count: 0, limit };
  if (count < limit) return { allowed: true, count, limit };
  return { allowed: await fetchOrgPro(sb, true), count, limit };
}

/** Darf ein weiteres Gerät in den Bestand (neu anlegen oder wieder in Betrieb nehmen)? */
export async function deviceGate(sb: SupabaseClient): Promise<Gate> {
  let { count, error } = await sb.from('device').select('id', { count: 'exact', head: true }).eq('retired', false);
  // Datenbank ohne die Spalte „retired“ (vor dem Update 2026-10-29): alle Geräte zählen
  if (error) ({ count, error } = await sb.from('device').select('id', { count: 'exact', head: true }));
  return decide(sb, error ? null : count, FREE_LIMITS.devices);
}

/**
 * Darf eine weitere Prüfung dokumentiert werden?
 * @param waiting Prüfungen, die auf diesem Gerät noch auf die Übertragung warten (zählen schon mit, wie in der App)
 */
export async function inspectionGate(sb: SupabaseClient, waiting = 0): Promise<Gate> {
  const { count, error } = await sb.from('inspection').select('id', { count: 'exact', head: true });
  return decide(sb, error || count === null ? null : count + waiting, FREE_LIMITS.inspections);
}

const PRO_HOW = 'Pro schließt du in der PrüfDex-App unter „Mehr“ ab oder hier unter „Abo“. Fragen dazu? Schreib uns an support@dexware.app.';

export const GATE_TEXT = {
  devices: `Kostenlos sind bis zu ${FREE_LIMITS.devices} Geräte drin (ausgesonderte zählen nicht). Mit PrüfDex Pro prüfst du unbegrenzt viele Geräte. ${PRO_HOW}`,
  inspections: `Kostenlos sind ${FREE_LIMITS.inspections} Prüfungen drin (stornierte zählen mit). Mit PrüfDex Pro dokumentierst du unbegrenzt viele Prüfungen. ${PRO_HOW}`,
} as const;
