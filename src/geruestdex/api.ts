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
  Scaffold,
  Site,
} from './types';

// Spaltenlisten OHNE Base64-Foto-Spalten — Fotos nur im Detail/Bericht laden!
const INSPECTION_COLS =
  'id, org_id, site_id, type, started_at, lat, lng, gps_accuracy_m, checklist, notes, performed_by, inspector_name, canceled, cancel_reason, canceled_at, created_at';
const DAMAGE_COLS =
  'id, org_id, site_id, inspection_id, scaffold_id, title, description, severity, scaffold_blocked, status, reported_by, reporter_name, resolved_at, resolved_by, resolver_name, resolution_note, created_at';
const SCAFFOLD_COLS =
  'id, org_id, site_id, name, category, manufacturer, erected_by, erected_at, load_class, width_class, notes, retired, created_at';

/** Einzelne Baustelle per Primärschlüssel. */
export async function fetchSite(sb: SupabaseClient, id: string): Promise<Site | null> {
  const { data, error } = await sb
    .from('site')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Baustelle konnte nicht geladen werden', error);
  return data as Site | null;
}

export async function fetchSites(sb: SupabaseClient): Promise<Site[]> {
  const { data, error } = await sb
    .from('site')
    .select('*')
    .order('active', { ascending: false })
    .order('name');
  if (error) fail('Baustellen konnten nicht geladen werden', error);
  return (data ?? []) as Site[];
}

/** Gerüst-Inventar (ohne Referenzfotos), optional je Baustelle. */
export async function fetchScaffolds(
  sb: SupabaseClient,
  siteId?: string,
): Promise<Scaffold[]> {
  let q = sb.from('scaffold').select(SCAFFOLD_COLS).order('retired').order('name');
  if (siteId) q = q.eq('site_id', siteId);
  const { data, error } = await q;
  if (error) fail('Gerüste konnten nicht geladen werden', error);
  return (data ?? []) as Scaffold[];
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

/** Baustelle anlegen/ändern — Upsert wie app-seitiges saveSite. */
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
  if (error) fail('Baustelle konnte nicht gespeichert werden', error);
}

export interface ScaffoldInput {
  site_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  erected_by: string | null;
  erected_at: string | null;
  load_class: string | null;
  width_class: string | null;
  notes: string | null;
  retired: boolean;
}

/** Gerüst anlegen/ändern — Upsert wie app-seitiges saveScaffold (photo_url bleibt unangetastet). */
export async function saveScaffold(
  sb: SupabaseClient,
  orgId: string,
  input: ScaffoldInput,
  existing?: Scaffold,
): Promise<void> {
  const { error } = await sb.from('scaffold').upsert({
    id: existing?.id ?? crypto.randomUUID(),
    org_id: orgId,
    ...input,
    created_at: existing?.created_at ?? new Date().toISOString(),
  });
  if (error) fail('Gerüst konnte nicht gespeichert werden', error);
}

export interface InspectionInput {
  site_id: string;
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

export interface DamageInput {
  site_id: string;
  scaffold_id: string | null;
  title: string;
  description: string | null;
  severity: Damage['severity'];
  scaffold_blocked: boolean;
  reporter_name: string | null;
}

/** Mangel melden (wie app-seitiges addDamage — ohne Fotos). */
export async function addDamage(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  input: DamageInput,
): Promise<void> {
  const { error } = await sb.from('damage').insert({
    id: crypto.randomUUID(),
    org_id: orgId,
    site_id: input.site_id,
    inspection_id: null,
    scaffold_id: input.scaffold_id,
    title: input.title,
    description: input.description,
    severity: input.severity,
    scaffold_blocked: input.scaffold_blocked,
    photo_urls: [],
    reported_by: userId,
    reporter_name: input.reporter_name,
    created_at: new Date().toISOString(),
  });
  if (error) fail('Mangel konnte nicht gespeichert werden', error);
}

/** Mangel als behoben markieren (additiv, RPC wie die App). */
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
  if (error) fail('Mangel konnte nicht als behoben markiert werden', error);
}

export interface InspectionFilter {
  siteId?: string;
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
    .select('id, site_id, type, started_at, canceled')
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

export interface DamageFilter {
  siteId?: string;
  scaffoldId?: string;
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
  if (filter.siteId) q = q.eq('site_id', filter.siteId);
  if (filter.scaffoldId) q = q.eq('scaffold_id', filter.scaffoldId);
  if (filter.inspectionId) q = q.eq('inspection_id', filter.inspectionId);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) fail('Mängel konnten nicht geladen werden', error);
  return (data ?? []) as Damage[];
}

/** Prüfungen einer Baustelle im Zeitraum inkl. Fotos — nur für den PDF-Bericht. */
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

/** Mängel einer Baustelle im Zeitraum inkl. Fotos — nur für den PDF-Bericht. */
export async function fetchDamagesForReport(
  sb: SupabaseClient,
  siteId: string,
  from: Date,
  to: Date,
): Promise<DamageWithPhotos[]> {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  const { data, error } = await sb
    .from('damage')
    .select(`${DAMAGE_COLS}, photo_urls, resolution_photo_urls`)
    .eq('site_id', siteId)
    .gte('created_at', from.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at');
  if (error) fail('Mängel für den Bericht konnten nicht geladen werden', error);
  return (data ?? []) as DamageWithPhotos[];
}
