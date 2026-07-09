import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type {
  CheckResult,
  Damage,
  DamageStatus,
  DamageWithPhotos,
  Inspection,
  InspectionType,
  InspectionWithPhotos,
  Rack,
  Warehouse,
} from './types';

// Spaltenlisten OHNE Base64-Foto-Spalten — Fotos nur im Detail/Bericht laden!
const INSPECTION_COLS =
  'id, org_id, warehouse_id, type, started_at, lat, lng, gps_accuracy_m, checklist, notes, performed_by, inspector_name, canceled, cancel_reason, canceled_at, created_at';
const DAMAGE_COLS =
  'id, org_id, warehouse_id, inspection_id, rack_id, title, description, severity, rack_blocked, status, reported_by, reporter_name, resolved_at, resolved_by, resolver_name, resolution_note, created_at';
const RACK_COLS =
  'id, org_id, warehouse_id, name, category, manufacturer, install_year, bay_load_kg, field_load_kg, notes, retired, created_at';

/** Einzelnes Lager per Primärschlüssel. */
export async function fetchWarehouse(
  sb: SupabaseClient,
  id: string,
): Promise<Warehouse | null> {
  const { data, error } = await sb
    .from('warehouse')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Lager konnte nicht geladen werden', error);
  return data as Warehouse | null;
}

export async function fetchWarehouses(sb: SupabaseClient): Promise<Warehouse[]> {
  const { data, error } = await sb
    .from('warehouse')
    .select('*')
    .order('active', { ascending: false })
    .order('name');
  if (error) fail('Lager konnten nicht geladen werden', error);
  return (data ?? []) as Warehouse[];
}

/** Regalzeilen-Inventar (ohne Referenzfotos), optional je Lager. */
export async function fetchRacks(
  sb: SupabaseClient,
  warehouseId?: string,
): Promise<Rack[]> {
  let q = sb.from('rack').select(RACK_COLS).order('retired').order('name');
  if (warehouseId) q = q.eq('warehouse_id', warehouseId);
  const { data, error } = await q;
  if (error) fail('Regalzeilen konnten nicht geladen werden', error);
  return (data ?? []) as Rack[];
}

// ── Schreiben (Format identisch zur Mobile-App, supabaseRepository.ts) ──────

export interface WarehouseInput {
  name: string;
  address: string;
  operator_name: string | null;
  operator_contact: string | null;
  notes: string | null;
  active: boolean;
}

/** Lager anlegen/ändern — Upsert wie app-seitiges saveWarehouse. */
export async function saveWarehouse(
  sb: SupabaseClient,
  orgId: string,
  input: WarehouseInput,
  existing?: Warehouse,
): Promise<void> {
  const { error } = await sb.from('warehouse').upsert({
    id: existing?.id ?? crypto.randomUUID(),
    org_id: orgId,
    name: input.name,
    address: input.address,
    lat: existing?.lat ?? null,
    lng: existing?.lng ?? null,
    operator_name: input.operator_name,
    operator_contact: input.operator_contact,
    notes: input.notes,
    active: input.active,
    created_at: existing?.created_at ?? new Date().toISOString(),
  });
  if (error) fail('Lager konnte nicht gespeichert werden', error);
}

export interface RackInput {
  warehouse_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  install_year: string | null;
  bay_load_kg: string | null;
  field_load_kg: string | null;
  notes: string | null;
  retired: boolean;
}

/** Regalzeile anlegen/ändern — Upsert wie app-seitiges saveRack (photo_url bleibt unangetastet). */
export async function saveRack(
  sb: SupabaseClient,
  orgId: string,
  input: RackInput,
  existing?: Rack,
): Promise<void> {
  const { error } = await sb.from('rack').upsert({
    id: existing?.id ?? crypto.randomUUID(),
    org_id: orgId,
    ...input,
    created_at: existing?.created_at ?? new Date().toISOString(),
  });
  if (error) fail('Regalzeile konnte nicht gespeichert werden', error);
}

export interface InspectionInput {
  warehouse_id: string;
  type: InspectionType;
  started_at: string;
  checklist: Record<string, CheckResult>;
  notes: string | null;
  inspector_name: string | null;
}

/** Inspektion nachtragen (append-only, wie app-seitiges addInspection — ohne GPS/Fotos). */
export async function addInspection(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  input: InspectionInput,
): Promise<void> {
  const { error } = await sb.from('inspection').insert({
    id: crypto.randomUUID(),
    org_id: orgId,
    warehouse_id: input.warehouse_id,
    type: input.type,
    started_at: input.started_at,
    lat: null,
    lng: null,
    gps_accuracy_m: null,
    checklist: input.checklist,
    photo_urls: [],
    notes: input.notes,
    performed_by: userId,
    inspector_name: input.inspector_name,
    created_at: new Date().toISOString(),
  });
  if (error) fail('Inspektion konnte nicht gespeichert werden', error);
}

/** Inspektion stornieren — bleibt sichtbar, wird nur gekennzeichnet (RPC wie die App). */
export async function cancelInspection(
  sb: SupabaseClient,
  id: string,
  reason: string,
): Promise<void> {
  const { error } = await sb.rpc('cancel_inspection', {
    p_inspection: id,
    p_reason: reason,
  });
  if (error) fail('Inspektion konnte nicht storniert werden', error);
}

export interface DamageInput {
  warehouse_id: string;
  rack_id: string | null;
  title: string;
  description: string | null;
  severity: Damage['severity'];
  rack_blocked: boolean;
  reporter_name: string | null;
}

/** Schaden melden (wie app-seitiges addDamage — ohne Fotos). */
export async function addDamage(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  input: DamageInput,
): Promise<void> {
  const { error } = await sb.from('damage').insert({
    id: crypto.randomUUID(),
    org_id: orgId,
    warehouse_id: input.warehouse_id,
    inspection_id: null,
    rack_id: input.rack_id,
    title: input.title,
    description: input.description,
    severity: input.severity,
    rack_blocked: input.rack_blocked,
    photo_urls: [],
    reported_by: userId,
    reporter_name: input.reporter_name,
    created_at: new Date().toISOString(),
  });
  if (error) fail('Schaden konnte nicht gespeichert werden', error);
}

/** Schaden als instandgesetzt markieren (additiv, RPC wie die App). */
export async function resolveDamage(
  sb: SupabaseClient,
  id: string,
  note: string,
  resolverName: string,
): Promise<void> {
  const { error } = await sb.rpc('resolve_damage', {
    p_damage: id,
    p_note: note,
    p_resolver_name: resolverName,
    p_photos: [],
  });
  if (error) fail('Schaden konnte nicht als behoben markiert werden', error);
}

export interface InspectionFilter {
  warehouseId?: string;
  type?: InspectionType;
  /** inklusive, lokale Tagesgrenze */
  from?: Date;
  /** inklusive, lokale Tagesgrenze */
  to?: Date;
  limit?: number;
}

export async function fetchInspections(
  sb: SupabaseClient,
  filter: InspectionFilter = {},
): Promise<Inspection[]> {
  let q = sb
    .from('inspection')
    .select(INSPECTION_COLS)
    .order('started_at', { ascending: false })
    .limit(filter.limit ?? 500);
  if (filter.warehouseId) q = q.eq('warehouse_id', filter.warehouseId);
  if (filter.type) q = q.eq('type', filter.type);
  if (filter.from) q = q.gte('started_at', filter.from.toISOString());
  if (filter.to) {
    const end = new Date(filter.to);
    end.setHours(23, 59, 59, 999);
    q = q.lte('started_at', end.toISOString());
  }
  const { data, error } = await q;
  if (error) fail('Inspektionen konnten nicht geladen werden', error);
  return (data ?? []) as Inspection[];
}

/** Minimale Inspektions-Metadaten für KPIs/Fälligkeits-Logik (schmale Spalten, hohes Limit). */
export interface InspMeta {
  id: string;
  warehouse_id: string;
  type: InspectionType;
  started_at: string;
  canceled: boolean;
}

export async function fetchInspectionMeta(
  sb: SupabaseClient,
  opts: { limit?: number } = {},
): Promise<InspMeta[]> {
  const { data, error } = await sb
    .from('inspection')
    .select('id, warehouse_id, type, started_at, canceled')
    .order('started_at', { ascending: false })
    .limit(opts.limit ?? 2000);
  if (error) fail('Inspektions-Daten konnten nicht geladen werden', error);
  return (data ?? []) as InspMeta[];
}

/** Einzelne Inspektion inkl. Beweisfotos (Base64-Daten-URIs). */
export async function fetchInspectionWithPhotos(
  sb: SupabaseClient,
  id: string,
): Promise<InspectionWithPhotos> {
  const { data, error } = await sb
    .from('inspection')
    .select(`${INSPECTION_COLS}, photo_urls`)
    .eq('id', id)
    .single();
  if (error) fail('Inspektion konnte nicht geladen werden', error);
  return data as InspectionWithPhotos;
}

export interface DamageFilter {
  warehouseId?: string;
  inspectionId?: string;
  status?: DamageStatus;
  limit?: number;
}

export async function fetchDamages(
  sb: SupabaseClient,
  filter: DamageFilter = {},
): Promise<Damage[]> {
  let q = sb
    .from('damage')
    .select(DAMAGE_COLS)
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 500);
  if (filter.warehouseId) q = q.eq('warehouse_id', filter.warehouseId);
  if (filter.inspectionId) q = q.eq('inspection_id', filter.inspectionId);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) fail('Schäden konnten nicht geladen werden', error);
  return (data ?? []) as Damage[];
}

/** Inspektionen eines Lagers im Zeitraum inkl. Fotos — nur für den PDF-Bericht. */
export async function fetchInspectionsForReport(
  sb: SupabaseClient,
  warehouseId: string,
  from: Date,
  to: Date,
): Promise<InspectionWithPhotos[]> {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  const { data, error } = await sb
    .from('inspection')
    .select(`${INSPECTION_COLS}, photo_urls`)
    .eq('warehouse_id', warehouseId)
    .gte('started_at', from.toISOString())
    .lte('started_at', end.toISOString())
    .order('started_at');
  if (error) fail('Berichtsdaten konnten nicht geladen werden', error);
  return (data ?? []) as InspectionWithPhotos[];
}

/** Schäden eines Lagers im Zeitraum inkl. Fotos — nur für den PDF-Bericht. */
export async function fetchDamagesForReport(
  sb: SupabaseClient,
  warehouseId: string,
  from: Date,
  to: Date,
): Promise<DamageWithPhotos[]> {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  const { data, error } = await sb
    .from('damage')
    .select(`${DAMAGE_COLS}, photo_urls, resolution_photo_urls`)
    .eq('warehouse_id', warehouseId)
    .gte('created_at', from.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at');
  if (error) fail('Schäden für den Bericht konnten nicht geladen werden', error);
  return (data ?? []) as DamageWithPhotos[];
}
