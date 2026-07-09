import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type {
  CheckResult,
  Defect,
  DefectStatus,
  DefectWithPhotos,
  Equipment,
  Inspection,
  InspectionType,
  InspectionWithPhotos,
  Playground,
} from './types';

// Spaltenlisten OHNE Base64-Foto-Spalten — Fotos nur im Detail/Bericht laden!
const INSPECTION_COLS =
  'id, org_id, playground_id, type, started_at, lat, lng, gps_accuracy_m, checklist, notes, performed_by, inspector_name, canceled, cancel_reason, canceled_at, created_at';
const DEFECT_COLS =
  'id, org_id, playground_id, inspection_id, equipment_id, title, description, severity, equipment_blocked, status, reported_by, reporter_name, resolved_at, resolved_by, resolver_name, resolution_note, created_at';
const EQUIPMENT_COLS =
  'id, org_id, playground_id, name, category, manufacturer, install_year, notes, retired, created_at';

/** Einzelner Spielplatz per Primärschlüssel. */
export async function fetchPlayground(
  sb: SupabaseClient,
  id: string,
): Promise<Playground | null> {
  const { data, error } = await sb
    .from('playground')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Spielplatz konnte nicht geladen werden', error);
  return data as Playground | null;
}

export async function fetchPlaygrounds(sb: SupabaseClient): Promise<Playground[]> {
  const { data, error } = await sb
    .from('playground')
    .select('*')
    .order('active', { ascending: false })
    .order('name');
  if (error) fail('Spielplätze konnten nicht geladen werden', error);
  return (data ?? []) as Playground[];
}

/** Geräte-Inventar (ohne Referenzfotos), optional je Spielplatz. */
export async function fetchEquipment(
  sb: SupabaseClient,
  playgroundId?: string,
): Promise<Equipment[]> {
  let q = sb
    .from('equipment')
    .select(EQUIPMENT_COLS)
    .order('retired')
    .order('name');
  if (playgroundId) q = q.eq('playground_id', playgroundId);
  const { data, error } = await q;
  if (error) fail('Geräte konnten nicht geladen werden', error);
  return (data ?? []) as Equipment[];
}

// ── Schreiben (Format identisch zur Mobile-App, supabaseRepository.ts) ──────

export interface PlaygroundInput {
  name: string;
  address: string;
  operator_name: string | null;
  operator_contact: string | null;
  notes: string | null;
  active: boolean;
}

/** Spielplatz anlegen/ändern — Upsert wie app-seitiges savePlayground. */
export async function savePlayground(
  sb: SupabaseClient,
  orgId: string,
  input: PlaygroundInput,
  existing?: Playground,
): Promise<void> {
  const { error } = await sb.from('playground').upsert({
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
  if (error) fail('Spielplatz konnte nicht gespeichert werden', error);
}

export interface InspectionInput {
  playground_id: string;
  type: InspectionType;
  started_at: string;
  checklist: Record<string, CheckResult>;
  notes: string | null;
  inspector_name: string | null;
}

/** Kontrolle nachtragen (append-only, wie app-seitiges addInspection — ohne GPS/Fotos). */
export async function addInspection(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  input: InspectionInput,
): Promise<void> {
  const { error } = await sb.from('inspection').insert({
    id: crypto.randomUUID(),
    org_id: orgId,
    playground_id: input.playground_id,
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
  if (error) fail('Kontrolle konnte nicht gespeichert werden', error);
}

/** Kontrolle stornieren — bleibt sichtbar, wird nur gekennzeichnet (RPC wie die App). */
export async function cancelInspection(
  sb: SupabaseClient,
  id: string,
  reason: string,
): Promise<void> {
  const { error } = await sb.rpc('cancel_inspection', {
    p_inspection: id,
    p_reason: reason,
  });
  if (error) fail('Kontrolle konnte nicht storniert werden', error);
}

export interface DefectInput {
  playground_id: string;
  equipment_id: string | null;
  title: string;
  description: string | null;
  severity: Defect['severity'];
  equipment_blocked: boolean;
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
    playground_id: input.playground_id,
    inspection_id: null,
    equipment_id: input.equipment_id,
    title: input.title,
    description: input.description,
    severity: input.severity,
    equipment_blocked: input.equipment_blocked,
    photo_urls: [],
    reported_by: userId,
    reporter_name: input.reporter_name,
    created_at: new Date().toISOString(),
  });
  if (error) fail('Mangel konnte nicht gespeichert werden', error);
}

/** Mangel als behoben markieren (additiv, RPC wie die App). */
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
  playgroundId?: string;
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
  if (filter.playgroundId) q = q.eq('playground_id', filter.playgroundId);
  if (filter.type) q = q.eq('type', filter.type);
  if (filter.from) q = q.gte('started_at', filter.from.toISOString());
  if (filter.to) {
    const end = new Date(filter.to);
    end.setHours(23, 59, 59, 999);
    q = q.lte('started_at', end.toISOString());
  }
  const { data, error } = await q;
  if (error) fail('Kontrollen konnten nicht geladen werden', error);
  return (data ?? []) as Inspection[];
}

/** Minimale Kontroll-Metadaten für KPIs/Fälligkeits-Logik (schmale Spalten, hohes Limit). */
export interface InspMeta {
  id: string;
  playground_id: string;
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
    .select('id, playground_id, type, started_at, canceled')
    .order('started_at', { ascending: false })
    .limit(opts.limit ?? 2000);
  if (error) fail('Kontroll-Daten konnten nicht geladen werden', error);
  return (data ?? []) as InspMeta[];
}

/** Einzelne Kontrolle inkl. Beweisfotos (Base64-Daten-URIs). */
export async function fetchInspectionWithPhotos(
  sb: SupabaseClient,
  id: string,
): Promise<InspectionWithPhotos> {
  const { data, error } = await sb
    .from('inspection')
    .select(`${INSPECTION_COLS}, photo_urls`)
    .eq('id', id)
    .single();
  if (error) fail('Kontrolle konnte nicht geladen werden', error);
  return data as InspectionWithPhotos;
}

export interface DefectFilter {
  playgroundId?: string;
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
  if (filter.playgroundId) q = q.eq('playground_id', filter.playgroundId);
  if (filter.inspectionId) q = q.eq('inspection_id', filter.inspectionId);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) fail('Mängel konnten nicht geladen werden', error);
  return (data ?? []) as Defect[];
}

/** Kontrollen eines Spielplatzes im Zeitraum inkl. Fotos — nur für den PDF-Bericht. */
export async function fetchInspectionsForReport(
  sb: SupabaseClient,
  playgroundId: string,
  from: Date,
  to: Date,
): Promise<InspectionWithPhotos[]> {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  const { data, error } = await sb
    .from('inspection')
    .select(`${INSPECTION_COLS}, photo_urls`)
    .eq('playground_id', playgroundId)
    .gte('started_at', from.toISOString())
    .lte('started_at', end.toISOString())
    .order('started_at');
  if (error) fail('Berichtsdaten konnten nicht geladen werden', error);
  return (data ?? []) as InspectionWithPhotos[];
}

/** Mängel eines Spielplatzes im Zeitraum inkl. Fotos — nur für den PDF-Bericht. */
export async function fetchDefectsForReport(
  sb: SupabaseClient,
  playgroundId: string,
  from: Date,
  to: Date,
): Promise<DefectWithPhotos[]> {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  const { data, error } = await sb
    .from('defect')
    .select(`${DEFECT_COLS}, photo_urls, resolution_photo_urls`)
    .eq('playground_id', playgroundId)
    .gte('created_at', from.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at');
  if (error) fail('Mängel für den Bericht konnten nicht geladen werden', error);
  return (data ?? []) as DefectWithPhotos[];
}
