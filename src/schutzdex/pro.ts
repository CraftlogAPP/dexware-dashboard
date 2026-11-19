// Gratis-Grenze von SchutzDex — wie in der App (src/lib/purchases.ts → FREE_LIMITS, src/screens/MembersScreen.tsx):
// ohne Pro höchstens 2 AKTIVE Mitarbeiter (inaktive zählen nicht). Die zweite Grenze der App — 1 Unterweisung — greift
// nur beim Anlegen einer Unterweisung; das gibt es im Browser nicht (KI-Erstellung nur in der App).
// Das DURCHFÜHREN einer Unterweisung ist in der App nie gesperrt — hier auch nicht.
//
// Pro-Auskunft: SchutzDex hat KEINE Server-Auskunft in seiner Datenbank (kein org_pro_active wie die Prüf-Apps).
// Die App fragt RevenueCat und den Suite-Server; das Dashboard liest dasselbe über src/lib/abo.ts (wie die Abo-Seite):
// Einzel-Abo „pro“, Suite-Abo, dazu das vom Server vergebene Frei-/Testkonto (app_metadata.pro, wie compPro in der App).
// Antwortet der Anbieter nicht eindeutig, gilt „Pro“: nie einen zahlenden Betrieb zu Unrecht sperren.

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../apps/registry';
import { loadAboInfo } from '../lib/abo';
import { FREE_LIMITS } from './vorOrt/rows';

const cache = new WeakMap<Session, { v: boolean; at: number }>();
const FRESH_MS = 60_000;

export async function fetchSchutzPro(app: AppConfig, session: Session): Promise<boolean> {
  if (session.user.app_metadata?.pro === true) return true;
  const hit = cache.get(session);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.v;
  try {
    const abo = await loadAboInfo(app, session);
    const v = !!(abo.pro?.active || abo.suite?.active || abo.suiteBackendActive);
    // Suite-Server hat nicht geantwortet: ein Suite-Abo aus einer anderen App könnte übersehen sein → nicht sperren (nicht merken)
    if (!v && abo.suiteBackendUnknown) return true;
    cache.set(session, { v, at: Date.now() });
    return v;
  } catch {
    return true; // unklar → nicht sperren (nicht merken)
  }
}

export interface MemberGate {
  allowed: boolean;
  /** aktive Mitarbeiter */
  count: number;
  limit: number;
}

/**
 * Darf ein weiterer Mitarbeiter aktiv sein (neu anlegen oder wieder aktiv setzen)?
 * Lässt sich die Zahl nicht ermitteln, wird nicht gesperrt.
 */
export async function memberGate(sb: SupabaseClient, isPro: () => Promise<boolean>): Promise<MemberGate> {
  const limit = FREE_LIMITS.members;
  const { count, error } = await sb.from('member').select('id', { count: 'exact', head: true }).eq('aktiv', true);
  if (error || count === null) return { allowed: true, count: 0, limit };
  if (count < limit) return { allowed: true, count, limit };
  return { allowed: await isPro().catch(() => true), count, limit };
}

export const MEMBER_GATE_TEXT = `Im Free-Tarif sind max. ${FREE_LIMITS.members} aktive Mitarbeiter möglich. Mit SchutzDex Pro ist die Anzahl unbegrenzt. Pro schließt du in der SchutzDex-App unter „Mehr“ ab oder hier unter „Abo“.`;
