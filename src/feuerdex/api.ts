import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type {
  CheckResult,
  Defect,
  DefectStatus,
  DefectWithPhotos,
  Extinguisher,
  Inspection,
  InspectionType,
  InspectionWithPhotos,
  Site,
} from './types';

// Spaltenlisten OHNE Base64-Foto-Spalten — Fotos nur im Detail/Bericht laden!
const INSPECTION_COLS =
  'id, org_id, site_id, extinguisher_id, type, started_at, lat, lng, gps_accuracy_m, checklist, notes, performed_by, inspector_name, canceled, cancel_reason, canceled_at, created_at';
const DEFECT_COLS =
  'id, org_id, site_id, inspection_id, extinguisher_id, title, description, severity, extinguisher_blocked, status, reported_by, reporter_name, resolved_at, resolved_by, resolver_name, resolution_note, created_at';
const EXTINGUISHER_COLS =
  'id, org_id, site_id, name, category, build_type, manufacturer, purchase_year, filling_kg, rating_le, notes, retired, created_at';

/** Einzelner Standort per Primärschlüssel. */
export async function fetchSite(sb: SupabaseClient, id: string): Promise<Site | null> {
  const { data, error } = await sb
    .from('site')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Standort konnte nicht geladen werden', error);
  return data as Site | null;
}

export async function fetchSites(sb: SupabaseClient): Promise<Site[]> {
  const { data, error } = await sb
    .from('site')
    .select('*')
    .order('active', { ascending: false })
    .order('name');
  if (error) fail('Standorte konnten nicht geladen werden', error);
  return (data ?? []) as Site[];
}

/** Feuerlöscher-Inventar (ohne Referenzfotos), optional je Standort. */
export async function fetchExtinguishers(
  sb: SupabaseClient,
  siteId?: string,
): Promise<Extinguisher[]> {
  let q = sb.from('extinguisher').select(EXTINGUISHER_COLS).order('retired').order('name');
  if (siteId) q = q.eq('site_id', siteId);
  const { data, error } = await q;
  if (error) fail('Feuerlöscher konnten nicht geladen werden', error);
  return (data ?? []) as Extinguisher[];
}

// ── Schreiben (Format identisch zur Mobile-App, supabaseRepository.ts) ──────

export interface SiteInput {
  name: string;
  address: string;
  operator_name: string | null;
  operator_contact: string | null;
  notes: string | null;
  active: boolean;
}

/** Standort anlegen/ändern — Upsert wie app-seitiges saveSite. */
export async function saveSite(
  sb: SupabaseClient,
  orgId: string,
  input: SiteInput,
  existing?: Site,
): Promise<void> {
  const { error } = await sb.from('site').upsert({
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
  if (error) fail('Standort konnte nicht gespeichert werden', error);
}

export interface ExtinguisherInput {
  site_id: string;
  name: string;
  category: string;
  build_type: string;
  manufacturer: string | null;
  purchase_year: string | null;
  filling_kg: string | null;
  rating_le: string | null;
  notes: string | null;
  retired: boolean;
}

/** Feuerlöscher anlegen/ändern — Upsert wie app-seitiges saveExtinguisher (photo_url bleibt unangetastet). */
export async function saveExtinguisher(
  sb: SupabaseClient,
  orgId: string,
  input: ExtinguisherInput,
  existing?: Extinguisher,
): Promise<void> {
  const { error } = await sb.from('extinguisher').upsert({
    id: existing?.id ?? crypto.randomUUID(),
    org_id: orgId,
    ...input,
    created_at: existing?.created_at ?? new Date().toISOString(),
  });
  if (error) fail('Feuerlöscher konnte nicht gespeichert werden', error);
}

export interface InspectionInput {
  site_id: string;
  extinguisher_id: string;
  type: InspectionType;
  started_at: string;
  checklist: Record<string, CheckResult>;
  notes: string | null;
  inspector_name: string | null;
}

/** Prüfung nachtragen (append-only, wie app-seitiges addInspection — ohne GPS/Fotos). */
export async function addInspection(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  input: InspectionInput,
): Promise<void> {
  const { error } = await sb.from('inspection').insert({
    id: crypto.randomUUID(),
    org_id: orgId,
    site_id: input.site_id,
    extinguisher_id: input.extinguisher_id,
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
  if (error) fail('Prüfung konnte nicht gespeichert werden', error);
}

/** Prüfung stornieren — bleibt sichtbar, wird nur gekennzeichnet (RPC wie die App). */
export async function cancelInspection(
  sb: SupabaseClient,
  id: string,
  reason: string,
): Promise<void> {
  const { error } = await sb.rpc('cancel_inspection', {
    p_inspection: id,
    p_reason: reason,
  });
  if (error) fail('Prüfung konnte nicht storniert werden', error);
}

export interface DefectInput {
  site_id: string;
  extinguisher_id: string;
  title: string;
  description: string | null;
  severity: Defect['severity'];
  extinguisher_blocked: boolean;
  reporter_name: string | null;
}

/** Mangel melden (wie app-seitiges addDefect — ohne Fotos). */
export async function addDefect(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  input: DefectInput,
): Promise<void> {
  const { error } = await sb.from('defect').insert({
    id: crypto.randomUUID(),
    org_id: orgId,
    site_id: input.site_id,
    inspection_id: null,
    extinguisher_id: input.extinguisher_id,
    title: input.title,
    description: input.description,
    severity: input.severity,
    extinguisher_blocked: input.extinguisher_blocked,
    photo_urls: [],
    reported_by: userId,
    reporter_name: input.reporter_name,
    created_at: new Date().toISOString(),
  });
  if (error) fail('Mangel konnte nicht gespeichert werden', error);
}

/** Mangel als instandgesetzt markieren (additiv, RPC wie die App). */
export async function resolveDefect(
  sb: SupabaseClient,
  id: string,
  note: string,
  resolverName: string,
): Promise<void> {
  const { error } = await sb.rpc('resolve_defect', {
    p_defect: id,
    p_note: note,
    p_resolver_name: resolverName,
    p_photos: [],
  });
  if (error) fail('Mangel konnte nicht als behoben markiert werden', error);
}

export interface InspectionFilter {
  siteId?: string;
  extinguisherId?: string;
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
  if (filter.siteId) q = q.eq('site_id', filter.siteId);
  if (filter.extinguisherId) q = q.eq('extinguisher_id', filter.extinguisherId);
  if (filter.type) q = q.eq('type', filter.type);
  if (filter.from) q = q.gte('started_at', filter.from.toISOString());
  if (filter.to) {
    const end = new Date(filter.to);
    end.setHours(23, 59, 59, 999);
    q = q.lte('started_at', end.toISOString());
  }
  const { data, error } = await q;
  if (error) fail('Prüfungen konnten nicht geladen werden', error);
  return (data ?? []) as Inspection[];
}

/** Minimale Prüf-Metadaten für KPIs/Fälligkeits-Logik (schmale Spalten, hohes Limit). */
export interface InspMeta {
  id: string;
  site_id: string;
  extinguisher_id: string;
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
    .select('id, site_id, extinguisher_id, type, started_at, canceled')
    .order('started_at', { ascending: false })
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

export interface DefectFilter {
  siteId?: string;
  extinguisherId?: string;
  inspectionId?: string;
  status?: DefectStatus;
  limit?: number;
}

export async function fetchDefects(
  sb: SupabaseClient,
  filter: DefectFilter = {},
): Promise<Defect[]> {
  let q = sb
    .from('defect')
    .select(DEFECT_COLS)
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 500);
  if (filter.siteId) q = q.eq('site_id', filter.siteId);
  if (filter.extinguisherId) q = q.eq('extinguisher_id', filter.extinguisherId);
  if (filter.inspectionId) q = q.eq('inspection_id', filter.inspectionId);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) fail('Mängel konnten nicht geladen werden', error);
  return (data ?? []) as Defect[];
}

/** Prüfungen eines Standorts im Zeitraum inkl. Fotos — nur für den PDF-Bericht. */
export async function fetchInspectionsForReport(
  sb: SupabaseClient,
  siteId: string,
  from: Date,
  to: Date,
): Promise<InspectionWithPhotos[]> {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  const { data, error } = await sb
    .from('inspection')
    .select(`${INSPECTION_COLS}, photo_urls`)
    .eq('site_id', siteId)
    .gte('started_at', from.toISOString())
    .lte('started_at', end.toISOString())
    .order('started_at');
  if (error) fail('Berichtsdaten konnten nicht geladen werden', error);
  return (data ?? []) as InspectionWithPhotos[];
}

/** Mängel eines Standorts im Zeitraum inkl. Fotos — nur für den PDF-Bericht. */
export async function fetchDefectsForReport(
  sb: SupabaseClient,
  siteId: string,
  from: Date,
  to: Date,
): Promise<DefectWithPhotos[]> {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  const { data, error } = await sb
    .from('defect')
    .select(`${DEFECT_COLS}, photo_urls, resolution_photo_urls`)
    .eq('site_id', siteId)
    .gte('created_at', from.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at');
  if (error) fail('Mängel für den Bericht konnten nicht geladen werden', error);
  return (data ?? []) as DefectWithPhotos[];
}
