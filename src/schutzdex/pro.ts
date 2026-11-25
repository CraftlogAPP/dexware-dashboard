// Gratis-Grenze von SchutzDex — wie in der App (src/lib/purchases.ts → FREE_LIMITS, src/screens/MembersScreen.tsx):
// ohne Pro höchstens 2 AKTIVE Mitarbeiter (inaktive zählen nicht). Die zweite Grenze der App — 1 Unterweisung — greift
// nur beim Anlegen einer Unterweisung; das gibt es im Browser nicht (KI-Erstellung nur in der App).
// Das DURCHFÜHREN einer Unterweisung ist in der App nie gesperrt — hier auch nicht.
//
// Pro-Auskunft: SchutzDex hat KEINE Server-Auskunft in seiner Datenbank (kein org_pro_active wie die Prüf-Apps).
// Die App fragt RevenueCat und den Suite-Server; das Dashboard liest dasselbe über src/lib/aboProStand.ts: Einzel-Abo
// „pro“, Suite-Abo, SchutzDex Pro aus der Sammel-App (&app=schutzdex) und das vom Server vergebene Frei-/Testkonto
// (app_metadata.pro, wie compPro in der App).
// Seit 25.11.2026 (Paywall dicht): Antwortet ein Anbieter nicht eindeutig, gilt der letzte sichere Stand dieses Kontos;
// gibt es keinen, sperrt die GRENZE mit „gleich nochmal“ (vorher: „im Zweifel Pro“ = Grenze offen). Lässt sich die Zahl
// der Mitarbeiter nicht ermitteln, ebenso (vorher: erlaubt).

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../apps/registry';
import { aboProStand } from '../lib/aboProStand';
import { GRENZE_UNKLAR, ProUnklarError, proFuerAnzeige, proFuerGrenze } from '../lib/proStand';
import { FREE_LIMITS } from './vorOrt/rows';

/** Pro-Stand (true/false, null = nicht feststellbar und kein letzter sicherer Stand). */
export function schutzProStand(app: AppConfig, session: Session | null): Promise<boolean | null> {
  return aboProStand(app, session, { metaPro: true, appParam: 'schutzdex' });
}

/** Für ANZEIGE: unklar ohne letzten Stand → Pro (nie zu Unrecht ärgern). */
export async function fetchSchutzPro(app: AppConfig, session: Session): Promise<boolean> {
  return proFuerAnzeige(await schutzProStand(app, session));
}

export interface MemberGate {
  allowed: boolean;
  /** aktive Mitarbeiter */
  count: number;
  limit: number;
}

/**
 * Darf ein weiterer Mitarbeiter aktiv sein (neu anlegen oder wieder aktiv setzen)?
 * `proStand` liefert true/false/null (null = unklar). Lässt sich die Zahl nicht ermitteln oder ist Pro unklar,
 * wirft es ProUnklarError („gleich nochmal“) — nie still erlauben.
 */
export async function memberGate(sb: SupabaseClient, proStand: () => Promise<boolean | null>): Promise<MemberGate> {
  const limit = FREE_LIMITS.members;
  const { count, error } = await sb.from('member').select('id', { count: 'exact', head: true }).eq('aktiv', true);
  if (error || typeof count !== 'number') throw new ProUnklarError(GRENZE_UNKLAR);
  if (count < limit) return { allowed: true, count, limit };
  return { allowed: proFuerGrenze(await proStand().catch(() => null)), count, limit };
}

export const MEMBER_GATE_TEXT = `Im Free-Tarif sind max. ${FREE_LIMITS.members} aktive Mitarbeiter möglich. Mit SchutzDex Pro ist die Anzahl unbegrenzt. Pro schließt du in der SchutzDex-App unter „Mehr“ ab oder hier unter „Abo“.`;
