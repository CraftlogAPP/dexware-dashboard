import type { SupabaseClient } from '@supabase/supabase-js';
import type { Operation, OperationWithPhotos, Property } from './types';

// Spaltenliste für Einsätze OHNE photo_urls (Base64-Fotos, nur im Detail laden!)
const OPERATION_COLS =
  'id, org_id, property_id, started_at, ended_at, lat, lng, gps_accuracy_m, action, grit_material, grit_amount, weather, notes, performed_by, performer_name, canceled, cancel_reason, canceled_at, created_at';

function fail(msg: string, error: { message: string } | null): never {
  throw new Error(`${msg}${error ? `: ${error.message}` : ''}`);
}

/** Einzelnes Objekt per Primärschlüssel — statt alle zu laden und zu filtern. */
export async function fetchProperty(
  sb: SupabaseClient,
  id: string,
): Promise<Property | null> {
  const { data, error } = await sb
    .from('property')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Objekt konnte nicht geladen werden', error);
  return data as Property | null;
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

/** Minimale Einsatz-Metadaten für KPIs/„letzter Einsatz"-Logik (schmale Spalten, hohes Limit). */
export interface OpMeta {
  id: string;
  property_id: string;
  started_at: string;
  canceled: boolean;
}

export async function fetchOperationMeta(
  sb: SupabaseClient,
  opts: { from?: Date; limit?: number } = {},
): Promise<OpMeta[]> {
  let q = sb
    .from('operation')
    .select('id, property_id, started_at, canceled')
    .order('started_at', { ascending: false })
    .limit(opts.limit ?? 2000);
  if (opts.from) q = q.gte('started_at', opts.from.toISOString());
  const { data, error } = await q;
  if (error) fail('Einsatz-Daten konnten nicht geladen werden', error);
  return (data ?? []) as OpMeta[];
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

