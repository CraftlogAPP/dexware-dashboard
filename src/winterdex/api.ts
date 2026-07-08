import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Member,
  Operation,
  OperationWithPhotos,
  Org,
  Property,
  Role,
} from './types';

// Spaltenliste für Einsätze OHNE photo_urls (Base64-Fotos, nur im Detail laden!)
const OPERATION_COLS =
  'id, org_id, property_id, started_at, ended_at, lat, lng, gps_accuracy_m, action, grit_material, grit_amount, weather, notes, performed_by, performer_name, canceled, cancel_reason, canceled_at, created_at';

export interface OrgContext {
  org: Org;
  role: Role;
}

function fail(msg: string, error: { message: string } | null): never {
  throw new Error(`${msg}${error ? `: ${error.message}` : ''}`);
}

/** Org + eigene Rolle des eingeloggten Users (Modell: 1 User = 1 Betrieb). */
export async function fetchOrgContext(sb: SupabaseClient): Promise<OrgContext | null> {
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

export async function fetchProperties(sb: SupabaseClient): Promise<Property[]> {
  const { data, error } = await sb
    .from('property')
    .select('*')
    .order('active', { ascending: false })
    .order('name');
  if (error) fail('Objekte konnten nicht geladen werden', error);
  return (data ?? []) as Property[];
}

export interface OperationFilter {
  propertyId?: string;
  /** inklusive, lokale Tagesgrenze */
  from?: Date;
  /** inklusive, lokale Tagesgrenze */
  to?: Date;
  limit?: number;
}

export async function fetchOperations(
  sb: SupabaseClient,
  filter: OperationFilter = {},
): Promise<Operation[]> {
  let q = sb
    .from('operation')
    .select(OPERATION_COLS)
    .order('started_at', { ascending: false })
    .limit(filter.limit ?? 500);
  if (filter.propertyId) q = q.eq('property_id', filter.propertyId);
  if (filter.from) q = q.gte('started_at', filter.from.toISOString());
  if (filter.to) {
    const end = new Date(filter.to);
    end.setHours(23, 59, 59, 999);
    q = q.lte('started_at', end.toISOString());
  }
  const { data, error } = await q;
  if (error) fail('Einsätze konnten nicht geladen werden', error);
  return (data ?? []) as Operation[];
}

/** Einzelner Einsatz inkl. Beweisfotos (Base64-Daten-URIs). */
export async function fetchOperationWithPhotos(
  sb: SupabaseClient,
  id: string,
): Promise<OperationWithPhotos> {
  const { data, error } = await sb
    .from('operation')
    .select(`${OPERATION_COLS}, photo_urls`)
    .eq('id', id)
    .single();
  if (error) fail('Einsatz konnte nicht geladen werden', error);
  return data as OperationWithPhotos;
}

/** Einsätze eines Objekts im Zeitraum inkl. Fotos — nur für den PDF-Bericht. */
export async function fetchOperationsForReport(
  sb: SupabaseClient,
  propertyId: string,
  from: Date,
  to: Date,
): Promise<OperationWithPhotos[]> {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  const { data, error } = await sb
    .from('operation')
    .select(`${OPERATION_COLS}, photo_urls`)
    .eq('property_id', propertyId)
    .gte('started_at', from.toISOString())
    .lte('started_at', end.toISOString())
    .order('started_at');
  if (error) fail('Berichtsdaten konnten nicht geladen werden', error);
  return (data ?? []) as OperationWithPhotos[];
}

export async function fetchMembers(sb: SupabaseClient): Promise<Member[]> {
  const { data, error } = await sb.rpc('list_members');
  if (error) fail('Team konnte nicht geladen werden', error);
  return (data ?? []) as Member[];
}

/** Owner: 7 Tage gültigen Beitrittscode erzeugen (WD-XXXXXX). */
export async function createInvite(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.rpc('create_invite');
  if (error) fail('Einladungscode konnte nicht erstellt werden', error);
  return data as string;
}
