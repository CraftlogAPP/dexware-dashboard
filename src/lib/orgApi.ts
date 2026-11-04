// Org/Team-Zugriffe — das Mandanten-Modell (org, membership, invite,
// list_members/create_invite-RPCs) ist in allen Dex-Apps identisch.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface Org {
  id: string;
  name: string;
  land: 'DE' | 'AT' | 'CH';
  address: string | null;
  created_at: string;
}

export type Role = 'owner' | 'worker' | 'inspector';

export interface OrgContextData {
  org: Org;
  role: Role;
}

export interface Member {
  membership_id: string;
  user_id: string;
  email: string;
  role: Role;
  joined_at: string;
}

export function fail(msg: string, error: { message: string } | null): never {
  throw new Error(`${msg}${error ? `: ${error.message}` : ''}`);
}

/**
 * Org + eigene Rolle des eingeloggten Users (Modell: 1 User = 1 Betrieb).
 * select('*') statt fester Spaltenliste: die org-Tabellen der Apps sind
 * ähnlich, aber nicht identisch (z. B. hat PrüfDex kein `land`).
 */
export async function fetchOrgContext(
  sb: SupabaseClient,
): Promise<OrgContextData | null> {
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const { data: ms, error: mErr } = await sb
    .from('membership')
    .select('org_id, role')
    .eq('user_id', uid)
    .limit(1);
  if (mErr) fail('Mitgliedschaft konnte nicht geladen werden', mErr);
  if (!ms || ms.length === 0) return null;

  const { data: org, error: oErr } = await sb
    .from('org')
    .select('*')
    .eq('id', ms[0].org_id)
    .single();
  if (oErr) fail('Betrieb konnte nicht geladen werden', oErr);

  return { org: org as Org, role: ms[0].role as Role };
}

/**
 * Org-Kontext für Apps OHNE membership-Tabelle (z. B. SchutzDex):
 * dort gehört die org direkt dem Auth-User (owner_user_id), Rolle ist
 * immer 'owner'.
 */
export async function fetchOwnerOrgContext(
  sb: SupabaseClient,
): Promise<OrgContextData | null> {
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const { data, error } = await sb
    .from('org')
    .select('*')
    .eq('owner_user_id', uid)
    .limit(1);
  if (error) fail('Betrieb konnte nicht geladen werden', error);
  if (!data || data.length === 0) return null;

  return { org: data[0] as Org, role: 'owner' };
}

export async function fetchMembers(sb: SupabaseClient): Promise<Member[]> {
  const { data, error } = await sb.rpc('list_members');
  if (error) fail('Team konnte nicht geladen werden', error);
  return (data ?? []) as Member[];
}

/** Owner: Mitglied aus dem Betrieb entfernen (RPC wie die App, remove_member). */
export async function removeMember(
  sb: SupabaseClient,
  membershipId: string,
): Promise<void> {
  const { error } = await sb.rpc('remove_member', { p_membership: membershipId });
  if (error) fail('Mitglied konnte nicht entfernt werden', error);
}

/** Betriebsdaten ändern — Name + Land, wie app-seitiges saveSettings. */
export async function updateOrg(
  sb: SupabaseClient,
  orgId: string,
  input: { name: string; land?: Org['land'] },
): Promise<void> {
  const { error } = await sb.from('org').update(input).eq('id', orgId);
  if (error) fail('Betrieb konnte nicht gespeichert werden', error);
}

export interface TeamCode {
  code: string;
  expires_at: string;
  use_count: number;
}

/** true, wenn die RPC in dieser App (noch) nicht existiert → älteres Modell nutzen. */
const missingRpc = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || /could not find the function|does not exist/i.test(e.message ?? ''));

/**
 * Owner: EIN Team-Code für alle Mitarbeiter (seit 03.11.2026: 30 Tage, beliebig oft
 * einlösbar). renew = true macht den alten sofort ungültig. null = App kennt den
 * Team-Code noch nicht (dann Einzelcode über createInvite).
 */
export async function fetchTeamCode(sb: SupabaseClient, renew = false): Promise<TeamCode | null> {
  const { data, error } = await sb.rpc('team_code', { p_renew: renew });
  if (missingRpc(error)) return null;
  if (error) fail('Team-Code konnte nicht geladen werden', error);
  const r = (Array.isArray(data) ? data[0] : data) as TeamCode | undefined;
  return r?.code ? r : null;
}

/**
 * Owner: Teamgröße mit dem Abo abgleichen (Server fragt RevenueCat: Pro 20 · Team 50 ·
 * Team XL 100 · größer per Vertrag). null = App hat noch keine Teamgrößen-Stufen.
 */
export async function fetchSeats(sb: SupabaseClient): Promise<{ limit: number; members: number } | null> {
  const { data, error } = await sb.rpc('sync_seat_limit');
  if (missingRpc(error)) return null;
  if (error) return null; // Anzeige ist Komfort — nie die Team-Seite blockieren
  const r = (Array.isArray(data) ? data[0] : data) as { seat_limit?: number; members?: number } | undefined;
  return r ? { limit: r.seat_limit ?? 20, members: r.members ?? 0 } : null;
}

/** Owner: 7 Tage gültigen Beitrittscode erzeugen (Präfix je App, z. B. WD-/SD-/RD-). */
export async function createInvite(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.rpc('create_invite');
  if (error) fail('Einladungscode konnte nicht erstellt werden', error);
  return data as string;
}
