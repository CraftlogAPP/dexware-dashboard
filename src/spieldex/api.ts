import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type {
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
