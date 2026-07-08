import type { SupabaseClient } from '@supabase/supabase-js';
import { fail, type OrgContextData } from '../lib/orgApi';
import type {
  Driver,
  LicenseCheck,
  OrgMember,
  UvvInspection,
  Vehicle,
} from './types';

/**
 * Org-Kontext für KfzDex: eigenes Mandanten-Modell mit Tabelle `org_member`
 * (statt `membership`) und Rollen owner/member. RLS liefert nur Orgs mit
 * eigener Mitgliedschaft — die Rolle ergibt sich aus owner_user_id.
 */
export async function fetchKfzOrgContext(
  sb: SupabaseClient,
): Promise<OrgContextData | null> {
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const { data, error } = await sb.from('org').select('*').limit(1).maybeSingle();
  if (error) fail('Betrieb konnte nicht geladen werden', error);
  if (!data) return null;

  return {
    org: data,
    role: data.owner_user_id === uid ? 'owner' : 'worker',
  };
}

/** Permanenter Beitrittscode des Betriebs (steht direkt auf der org-Zeile). */
export async function fetchInviteCode(sb: SupabaseClient): Promise<string | null> {
  const { data, error } = await sb
    .from('org')
    .select('invite_code')
    .limit(1)
    .maybeSingle();
  if (error) fail('Einladungscode konnte nicht geladen werden', error);
  return (data?.invite_code as string | undefined) ?? null;
}

export async function fetchOrgMembers(sb: SupabaseClient): Promise<OrgMember[]> {
  const { data, error } = await sb
    .from('org_member')
    .select('*')
    .order('created_at');
  if (error) fail('Team konnte nicht geladen werden', error);
  return (data ?? []) as OrgMember[];
}

export async function fetchVehicles(sb: SupabaseClient): Promise<Vehicle[]> {
  const { data, error } = await sb.from('vehicle').select('*').order('plate');
  if (error) fail('Fahrzeuge konnten nicht geladen werden', error);
  return (data ?? []) as Vehicle[];
}

export async function fetchDrivers(sb: SupabaseClient): Promise<Driver[]> {
  const { data, error } = await sb
    .from('driver')
    .select('*')
    .order('active', { ascending: false })
    .order('name');
  if (error) fail('Fahrer konnten nicht geladen werden', error);
  return (data ?? []) as Driver[];
}

export async function fetchUvvInspections(
  sb: SupabaseClient,
  filter: { vehicleId?: string; limit?: number } = {},
): Promise<UvvInspection[]> {
  let q = sb
    .from('uvv_inspection')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 500);
  if (filter.vehicleId) q = q.eq('vehicle_id', filter.vehicleId);
  const { data, error } = await q;
  if (error) fail('UVV-Prüfungen konnten nicht geladen werden', error);
  return (data ?? []) as UvvInspection[];
}

export async function fetchLicenseChecks(
  sb: SupabaseClient,
  filter: { driverId?: string; limit?: number } = {},
): Promise<LicenseCheck[]> {
  let q = sb
    .from('license_check')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 500);
  if (filter.driverId) q = q.eq('driver_id', filter.driverId);
  const { data, error } = await q;
  if (error) fail('Führerscheinkontrollen konnten nicht geladen werden', error);
  return (data ?? []) as LicenseCheck[];
}
