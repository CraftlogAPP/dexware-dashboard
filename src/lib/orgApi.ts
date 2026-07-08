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

export type Role = 'owner' | 'worker';

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

/** Org + eigene Rolle des eingeloggten Users (Modell: 1 User = 1 Betrieb). */
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
    .select('id, name, land, address, created_at')
    .eq('id', ms[0].org_id)
    .single();
  if (oErr) fail('Betrieb konnte nicht geladen werden', oErr);

  return { org: org as Org, role: ms[0].role as Role };
}

export async function fetchMembers(sb: SupabaseClient): Promise<Member[]> {
  const { data, error } = await sb.rpc('list_members');
  if (error) fail('Team konnte nicht geladen werden', error);
  return (data ?? []) as Member[];
}

/** Owner: 7 Tage gültigen Beitrittscode erzeugen (Präfix je App, z. B. WD-/SD-/RD-). */
export async function createInvite(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.rpc('create_invite');
  if (error) fail('Einladungscode konnte nicht erstellt werden', error);
  return data as string;
}
