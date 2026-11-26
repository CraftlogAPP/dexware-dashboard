// Gratis-Grenze von CraftDex — wie in der App (src/context/SubscriptionContext.tsx FREE_PROJECT_LIMIT, HomeScreen.onAdd):
// ohne Pro höchstens 2 eigene Aufträge (Beispiel-Aufträge „seed-…“ und gelöschte zählen nicht). Bis 25.11.2026 prüfte das
// Dashboard beim „Auftrag anlegen“ GAR NICHT (Paywall-Audit Abschnitt 8).
// Pro wie in der App: RevenueCat (pro/suite), Suite-Abo aus einer anderen App, CraftDex Pro aus der Sammel-App
// (&app=craftdex) und die manuelle Freischaltung (Tabelle pro_overrides.is_pro). Seit 26.11.2026 ist CraftDex nicht mehr im
// Suite-Abo: eine Suite zählt nur noch als Bestand (src/lib/abo.ts), der Text wirbt deshalb nicht mehr mit ihr. Unklar → letzter sicherer Stand dieses
// Kontos, gibt es keinen → „gleich nochmal“ (nie still erlauben, nie einen Zahlenden falsch sperren).

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../apps/registry';
import { aboProStand } from '../lib/aboProStand';
import { GRENZE_UNKLAR, ProUnklarError, proFuerGrenze } from '../lib/proStand';

export const FREE_PROJECT_LIMIT = 2;

export const PROJECT_GATE_TEXT = `Im Gratis-Paket sind ${FREE_PROJECT_LIMIT} Aufträge möglich (Beispiel-Aufträge zählen nicht) — unbegrenzt viele gibt es mit CraftDex Pro. Pro schließt du in der CraftDex-App ab.`;

/** Pro-Stand dieses Kontos: true/false, null = nicht feststellbar und kein letzter sicherer Stand. */
export function craftProStand(app: AppConfig, session: Session | null, sb: SupabaseClient): Promise<boolean | null> {
  return aboProStand(app, session, {
    appParam: 'craftdex',
    // Manuelle Freischaltung (Reviewer/Support) wie fetchOverride() der App
    extra: async () => {
      if (!session) return null;
      const { data, error } = await sb.from('pro_overrides').select('is_pro').eq('user_id', session.user.id).maybeSingle();
      if (error) return null;
      return (data as { is_pro?: unknown } | null)?.is_pro === true;
    },
  });
}

/** Darf ein weiterer Auftrag angelegt werden? Zählung oder Pro unklar → ProUnklarError („gleich nochmal“). */
export async function projectGate(sb: SupabaseClient, pro: () => Promise<boolean | null>): Promise<{ allowed: boolean; count: number; limit: number }> {
  const { count, error } = await sb
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('deleted', false)
    .not('id', 'like', 'seed-%');
  if (error || typeof count !== 'number') throw new ProUnklarError(GRENZE_UNKLAR);
  if (count < FREE_PROJECT_LIMIT) return { allowed: true, count, limit: FREE_PROJECT_LIMIT };
  return { allowed: proFuerGrenze(await pro().catch(() => null)), count, limit: FREE_PROJECT_LIMIT };
}
