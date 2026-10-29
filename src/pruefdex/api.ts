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
const DEVICE_COLS_BASE =
  'id, org_id, customer_id, qr_code, name, device_type, manufacturer, serial_number, protection_class, location_note, interval_months, next_due_date, created_at';
const INSPECTION_COLS_BASE =
  'id, org_id, device_id, inspected_at, inspector_name, visual_checks, measurements, result, next_due_date, notes, created_at';

// Ab dem Datenbank-Update 2026-10-29 gibt es Storno-/Aussondern-Spalten. Fehlen sie noch,
// fällt das Dashboard einmalig auf die alten Spalten zurück und läuft unverändert weiter.
let hasAppendOnly = true;
const devCols = () => (hasAppendOnly ? `${DEVICE_COLS_BASE}, retired, retired_at` : DEVICE_COLS_BASE);
const inspCols = () =>
  hasAppendOnly ? `${INSPECTION_COLS_BASE}, canceled, cancel_reason, canceled_at` : INSPECTION_COLS_BASE;
const isUnknownColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find/i.test(e.message ?? ''));
async function withColumnFallback<R extends { error: { code?: string; message: string } | null }>(
  run: () => PromiseLike<R>,
): Promise<R> {
  const r = await run();
  if (hasAppendOnly && isUnknownColumn(r.error)) {
    hasAppendOnly = false;
    return run();
  }
  return r;
}

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
  const { data, error } = await withColumnFallback(() =>
    sb.from('device').select(devCols()).eq('id', id).maybeSingle(),
  );
  if (error) fail('Gerät konnte nicht geladen werden', error);
  return data as unknown as Device | null;
}

/** Ohne includeRetired nur Geräte in Betrieb (Fristen, KPIs). */
export async function fetchDevices(
  sb: SupabaseClient,
  opts: { customerId?: string; includeRetired?: boolean } = {},
): Promise<Device[]> {
  const { data, error } = await withColumnFallback(() => {
    let q = sb
      .from('device')
      .select(devCols())
      .order('next_due_date', { ascending: true, nullsFirst: false })
      .order('name');
    if (opts.customerId) q = q.eq('customer_id', opts.customerId);
    return q;
  });
  if (error) fail('Geräte konnten nicht geladen werden', error);
  const list = (data ?? []) as unknown as Device[];
  return opts.includeRetired ? list : list.filter((d) => !d.retired);
}

// ── Schreiben (Format identisch zur Mobile-App, supabaseRepository.ts) ──────

export interface CustomerInput {
  name: string;
  address: string | null;
  contact: string | null;
}

/** Kunde löschen — wie app-seitiges deleteCustomer. Geräte bleiben erhalten
 * (device.customer_id ist FK „on delete set null"), verlieren nur die Zuordnung. */
export async function deleteCustomer(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('customer').delete().eq('id', id);
  if (error) fail('Kunde konnte nicht gelöscht werden', error);
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

/** Aussondern statt löschen (wie die App) — die Prüfhistorie bleibt erhalten. */
export async function setDeviceRetired(sb: SupabaseClient, id: string, retired: boolean): Promise<void> {
  const { error } = await sb
    .from('device')
    .update({ retired, retired_at: retired ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) fail(isUnknownColumn(error) ? 'Aussondern ist erst nach dem Datenbank-Update möglich' : 'Gerät konnte nicht gespeichert werden', error);
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

/** Prüfung stornieren (unveränderlich, wie die App) + Geräte-Frist aus der jüngsten gültigen Prüfung neu berechnen. */
export async function cancelInspection(
  sb: SupabaseClient,
  id: string,
  deviceId: string,
  reason: string,
): Promise<string | null> {
  const { error } = await sb.rpc('cancel_inspection', { p_inspection: id, p_reason: reason.trim() });
  if (error) {
    fail(
      /cancel_inspection|PGRST202/i.test(`${error.code} ${error.message}`)
        ? 'Stornieren ist erst nach dem Datenbank-Update möglich'
        : 'Prüfung konnte nicht storniert werden',
      error,
    );
  }
  const failMsg = await recomputeDeviceDue(sb, deviceId);
  return failMsg
    ? `Die Prüfung wurde storniert, aber die Prüffrist am Gerät konnte nicht neu berechnet werden (${failMsg}). Bitte am Gerät prüfen.`
    : null;
}

/**
 * Frist des Geräts aus der jüngsten verbleibenden Prüfung neu setzen (null, wenn
 * keine mehr existiert) — wie die App (recomputeDue). Als „neueste" gilt dieselbe
 * Sortierung wie in fetchInspections (inspected_at, dann created_at absteigend);
 * das created_at löst Gleichstände beim reinen Datums-Feld inspected_at auf.
 * Gibt die DB-Fehlermeldung zurück, wenn die Neuberechnung nach der Primär-
 * schreiboperation fehlschlägt, sonst null.
 */
async function recomputeDeviceDue(
  sb: SupabaseClient,
  deviceId: string,
): Promise<string | null> {
  const { data, error: selError } = await sb
    .from('inspection')
    .select('next_due_date')
    .eq('device_id', deviceId)
    .eq('canceled', false)
    .order('inspected_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (selError) return selError.message;
  const due = data?.[0]?.next_due_date ?? null;
  const { error: upError } = await sb
    .from('device')
    .update({ next_due_date: due })
    .eq('id', deviceId);
  return upError ? upError.message : null;
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
  const { data, error } = await withColumnFallback(() => {
    let q = sb
      .from('inspection')
      .select(inspCols())
      .order('inspected_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(filter.limit ?? 500);
    if (filter.deviceId) q = q.eq('device_id', filter.deviceId);
    if (filter.result) q = q.eq('result', filter.result);
    if (filter.from) q = q.gte('inspected_at', filter.from);
    if (filter.to) q = q.lte('inspected_at', filter.to);
    return q;
  });
  if (error) fail('Prüfungen konnten nicht geladen werden', error);
  return (data ?? []) as unknown as Inspection[];
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
  const { data, error } = await withColumnFallback(() =>
    sb
      .from('inspection')
      .select(hasAppendOnly ? 'id, device_id, inspected_at, result, canceled' : 'id, device_id, inspected_at, result')
      .order('inspected_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 2000),
  );
  if (error) fail('Prüf-Daten konnten nicht geladen werden', error);
  // KPIs und „letzte Prüfung" nur aus gültigen (nicht stornierten) Prüfungen.
  return ((data ?? []) as unknown as (InspMeta & { canceled?: boolean })[]).filter((i) => !i.canceled);
}

/** Einzelne Prüfung inkl. Beweisfotos (Base64-Daten-URIs). */
export async function fetchInspectionWithPhotos(
  sb: SupabaseClient,
  id: string,
): Promise<InspectionWithPhotos> {
  const { data, error } = await withColumnFallback(() =>
    sb.from('inspection').select(`${inspCols()}, photo_urls`).eq('id', id).single(),
  );
  if (error) fail('Prüfung konnte nicht geladen werden', error);
  return data as unknown as InspectionWithPhotos;
}
