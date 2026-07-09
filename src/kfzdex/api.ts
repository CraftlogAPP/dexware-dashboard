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

// ── Schreiben (Format identisch zur Mobile-App, src/lib/queries.ts) ─────────

export interface VehicleInput {
  plate: string;
  name: string | null;
  type: Vehicle['type'];
  first_registration: string | null;
  last_uvv: string | null;
}

export async function insertVehicle(
  sb: SupabaseClient,
  orgId: string,
  input: VehicleInput,
): Promise<void> {
  const { error } = await sb.from('vehicle').insert({ org_id: orgId, ...input });
  if (error) fail('Fahrzeug konnte nicht angelegt werden', error);
}

export async function updateVehicle(
  sb: SupabaseClient,
  id: string,
  input: VehicleInput,
): Promise<void> {
  const { error } = await sb
    .from('vehicle')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail('Fahrzeug konnte nicht gespeichert werden', error);
}

/** Fahrzeug löschen — wie die App; UVV-Prüfungen hängen per FK-Cascade dran. */
export async function deleteVehicle(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('vehicle').delete().eq('id', id);
  if (error) fail('Fahrzeug konnte nicht gelöscht werden', error);
}

export interface DriverInput {
  name: string;
  license_classes: string | null;
  check_interval_months: number;
  last_check: string | null;
  active: boolean;
}

export async function insertDriver(
  sb: SupabaseClient,
  orgId: string,
  input: DriverInput,
): Promise<void> {
  const { error } = await sb.from('driver').insert({ org_id: orgId, ...input });
  if (error) fail('Fahrer konnte nicht angelegt werden', error);
}

export async function updateDriver(
  sb: SupabaseClient,
  id: string,
  input: DriverInput,
): Promise<void> {
  const { error } = await sb
    .from('driver')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail('Fahrer konnte nicht gespeichert werden', error);
}

/** Fahrer löschen — wie die App; Führerscheinkontrollen hängen per FK-Cascade dran. */
export async function deleteDriver(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('driver').delete().eq('id', id);
  if (error) fail('Fahrer konnte nicht gelöscht werden', error);
}

/** UVV-Prüfung erfassen + letzte UVV am Fahrzeug fortschreiben (wie die App). */
export async function addUvvInspection(
  sb: SupabaseClient,
  orgId: string,
  input: {
    vehicle_id: string;
    date: string;
    inspector: string;
    result: UvvInspection['result'];
    defects: string | null;
    checklist: Record<string, boolean>;
  },
): Promise<string | null> {
  const { error } = await sb.from('uvv_inspection').insert({ org_id: orgId, ...input });
  if (error) fail('UVV-Prüfung konnte nicht gespeichert werden', error);
  if (input.result !== 'bestanden') return null;
  // Bestandene Prüfung startet die 12-Monats-Frist neu (wie die App).
  const { error: upError } = await sb
    .from('vehicle')
    .update({ last_uvv: input.date, updated_at: new Date().toISOString() })
    .eq('id', input.vehicle_id);
  // Die Prüfung ist zu diesem Zeitpunkt schon gespeichert — ein Throw hielte
  // den Dialog offen und ein erneutes Speichern legte ein Duplikat an.
  return upError
    ? `Die Prüfung wurde gespeichert, aber die UVV-Frist am Fahrzeug konnte nicht aktualisiert werden (${upError.message}). Bitte nicht erneut speichern.`
    : null;
}

/** Führerscheinkontrolle erfassen + letzte Kontrolle am Fahrer fortschreiben. */
export async function addLicenseCheck(
  sb: SupabaseClient,
  orgId: string,
  input: { driver_id: string; date: string; checked_by: string },
): Promise<string | null> {
  const { error } = await sb
    .from('license_check')
    .insert({ org_id: orgId, ...input, photo_uri: null });
  if (error) fail('Führerscheinkontrolle konnte nicht gespeichert werden', error);
  const { error: upError } = await sb
    .from('driver')
    .update({ last_check: input.date, updated_at: new Date().toISOString() })
    .eq('id', input.driver_id);
  // Kontrolle ist schon gespeichert — Throw hieße Dialog offen + Duplikat bei Retry.
  return upError
    ? `Die Kontrolle wurde gespeichert, aber das Kontrolldatum am Fahrer konnte nicht aktualisiert werden (${upError.message}). Bitte nicht erneut speichern.`
    : null;
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
