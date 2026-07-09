import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type {
  Customer,
  Device,
  Inspection,
  InspectionResult,
  InspectionWithPhotos,
} from './types';

// Spaltenlisten OHNE Base64-Foto-Spalten — Fotos nur im Detail laden!
const DEVICE_COLS =
  'id, org_id, customer_id, qr_code, name, device_type, manufacturer, serial_number, protection_class, location_note, interval_months, next_due_date, created_at';
const INSPECTION_COLS =
  'id, org_id, device_id, inspected_at, inspector_name, visual_checks, measurements, result, next_due_date, notes, created_at';

export async function fetchCustomers(sb: SupabaseClient): Promise<Customer[]> {
  const { data, error } = await sb.from('customer').select('*').order('name');
  if (error) fail('Kunden konnten nicht geladen werden', error);
  return (data ?? []) as Customer[];
}

/** Einzelnes Gerät per Primärschlüssel. */
export async function fetchDevice(
  sb: SupabaseClient,
  id: string,
): Promise<Device | null> {
  const { data, error } = await sb
    .from('device')
    .select(DEVICE_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Gerät konnte nicht geladen werden', error);
  return data as Device | null;
}

export async function fetchDevices(
  sb: SupabaseClient,
  opts: { customerId?: string } = {},
): Promise<Device[]> {
  let q = sb
    .from('device')
    .select(DEVICE_COLS)
    .order('next_due_date', { ascending: true, nullsFirst: false })
    .order('name');
  if (opts.customerId) q = q.eq('customer_id', opts.customerId);
  const { data, error } = await q;
  if (error) fail('Geräte konnten nicht geladen werden', error);
  return (data ?? []) as Device[];
}

// ── Schreiben (Format identisch zur Mobile-App, supabaseRepository.ts) ──────

export interface CustomerInput {
  name: string;
  address: string | null;
  contact: string | null;
}

/** Kunde anlegen/ändern — Upsert wie app-seitiges saveCustomer. */
export async function saveCustomer(
  sb: SupabaseClient,
  orgId: string,
  input: CustomerInput,
  existing?: Customer,
): Promise<void> {
  const { error } = await sb.from('customer').upsert({
    id: existing?.id ?? crypto.randomUUID(),
    org_id: orgId,
    name: input.name,
    address: input.address,
    contact: input.contact,
  });
  if (error) fail('Kunde konnte nicht gespeichert werden', error);
}

export interface DeviceInput {
  customer_id: string | null;
  qr_code: string | null;
  name: string;
  device_type: string | null;
  manufacturer: string | null;
  serial_number: string | null;
  protection_class: Device['protection_class'];
  location_note: string | null;
  interval_months: number;
  next_due_date: string | null;
}

/** Gerät anlegen/ändern — Upsert wie app-seitiges saveDevice (photo_url bleibt unangetastet). */
export async function saveDevice(
  sb: SupabaseClient,
  orgId: string,
  input: DeviceInput,
  existing?: Device,
): Promise<void> {
  const { error } = await sb.from('device').upsert({
    id: existing?.id ?? crypto.randomUUID(),
    org_id: orgId,
    ...input,
    created_at: existing?.created_at ?? new Date().toISOString(),
  });
  if (error) fail('Gerät konnte nicht gespeichert werden', error);
}

export interface InspectionInput {
  device_id: string;
  inspected_at: string;
  inspector_name: string | null;
  visual_checks: Record<string, boolean>;
  measurements: Record<string, string>;
  result: InspectionResult;
  next_due_date: string | null;
  notes: string | null;
}

/** Prüfung erfassen + nächste Frist am Gerät fortschreiben (wie die App). */
export async function addInspection(
  sb: SupabaseClient,
  orgId: string,
  input: InspectionInput,
): Promise<string | null> {
  const { error } = await sb.from('inspection').insert({
    id: crypto.randomUUID(),
    org_id: orgId,
    ...input,
    photo_urls: [],
    created_at: new Date().toISOString(),
  });
  if (error) fail('Prüfung konnte nicht gespeichert werden', error);
  const { error: upError } = await sb
    .from('device')
    .update({ next_due_date: input.next_due_date })
    .eq('id', input.device_id);
  // Prüfung ist schon gespeichert — Throw hieße Dialog offen + Duplikat bei Retry.
  return upError
    ? `Die Prüfung wurde gespeichert, aber die Prüffrist am Gerät konnte nicht aktualisiert werden (${upError.message}). Bitte nicht erneut speichern.`
    : null;
}

export interface InspectionFilter {
  deviceId?: string;
  result?: InspectionResult;
  /** inklusive, ISO-Datum (inspected_at ist ein date) */
  from?: string;
  to?: string;
  limit?: number;
}

export async function fetchInspections(
  sb: SupabaseClient,
  filter: InspectionFilter = {},
): Promise<Inspection[]> {
  let q = sb
    .from('inspection')
    .select(INSPECTION_COLS)
    .order('inspected_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 500);
  if (filter.deviceId) q = q.eq('device_id', filter.deviceId);
  if (filter.result) q = q.eq('result', filter.result);
  if (filter.from) q = q.gte('inspected_at', filter.from);
  if (filter.to) q = q.lte('inspected_at', filter.to);
  const { data, error } = await q;
  if (error) fail('Prüfungen konnten nicht geladen werden', error);
  return (data ?? []) as Inspection[];
}

/** Minimale Prüf-Metadaten für KPIs/„letzte Prüfung"-Logik. */
export interface InspMeta {
  id: string;
  device_id: string;
  inspected_at: string;
  result: InspectionResult;
}

export async function fetchInspectionMeta(
  sb: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<InspMeta[]> {
  const { data, error } = await sb
    .from('inspection')
    .select('id, device_id, inspected_at, result')
    .order('inspected_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 2000);
  if (error) fail('Prüf-Daten konnten nicht geladen werden', error);
  return (data ?? []) as InspMeta[];
}

/** Einzelne Prüfung inkl. Beweisfotos (Base64-Daten-URIs). */
export async function fetchInspectionWithPhotos(
  sb: SupabaseClient,
  id: string,
): Promise<InspectionWithPhotos> {
  const { data, error } = await sb
    .from('inspection')
    .select(`${INSPECTION_COLS}, photo_urls`)
    .eq('id', id)
    .single();
  if (error) fail('Prüfung konnte nicht geladen werden', error);
  return data as InspectionWithPhotos;
}
