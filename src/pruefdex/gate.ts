// Gratis-Grenzen von PrüfDex — wie in der App (mobile/src/lib/entitlement.ts): ohne Pro 3 Geräte und 5 Prüfungen.
// Geräte: gezählt wird der Bestand in Betrieb (ausgesonderte zählen nicht). Prüfungen: stornierte zählen mit —
// sonst ließe sich die Grenze per Stornieren umgehen.
// Ob der Betrieb Pro hat, sagt der Server (RPC org_pro_active: Abo des Inhabers, Suite-Abo, Sonderlizenz).
// Seit 25.11.2026 (Paywall dicht): Lässt sich die Zahl nicht ermitteln → „gleich nochmal“ (vorher: erlaubt). Antwortet der
// Server zur Pro-Frage nicht eindeutig → letzter sicherer Stand dieses Kontos (src/lib/proStand.ts), sonst „gleich nochmal“.
// Der Server lehnt seit NACHTRAG-PAYWALL-2026-11-25 selbst ab (istGratisGrenze).

import type { SupabaseClient } from '@supabase/supabase-js';
import { GRENZE_UNKLAR, ProUnklarError, orgProFuerGrenze } from '../lib/proStand';
import { FREE_LIMITS } from './vorOrt/rows';

export interface Gate {
  allowed: boolean;
  count: number;
  limit: number;
}

async function decide(sb: SupabaseClient, count: number | null, limit: number): Promise<Gate> {
  if (count === null) throw new ProUnklarError(GRENZE_UNKLAR);
  if (count < limit) return { allowed: true, count, limit };
  return { allowed: await orgProFuerGrenze(sb, 'pruefdex'), count, limit };
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
