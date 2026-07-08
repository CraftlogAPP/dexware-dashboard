import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type { ProjectData, ProjectSummary } from './types';

// Listen-Select: NUR skalare Felder aus dem data-jsonb — der volle Blob
// enthält Base64-Fotos (photoBase64 am Projekt und an jedem Schritt).
const SUMMARY_COLS = [
  'id',
  'updated_at',
  'title:data->>title',
  'category:data->>category',
  'status:data->>status',
  'estimated_hours:data->estimatedHours',
  'logged_hours:data->loggedHours',
  'budget:data->budget',
  'deadline_ms:data->deadline->date',
  'customer_name:data->customer->>name',
  'created_ms:data->createdAt',
].join(', ');

export async function fetchProjectSummaries(
  sb: SupabaseClient,
): Promise<ProjectSummary[]> {
  const { data, error } = await sb
    .from('projects')
    .select(SUMMARY_COLS)
    .eq('deleted', false)
    .order('updated_at', { ascending: false });
  if (error) fail('Aufträge konnten nicht geladen werden', error);
  return (data ?? []) as unknown as ProjectSummary[];
}

/** Volles Projekt inkl. Schritten/Material/Kosten/Fotos — nur im Detail. */
export async function fetchProject(
  sb: SupabaseClient,
  id: string,
): Promise<ProjectData | null> {
  const { data, error } = await sb
    .from('projects')
    .select('id, deleted, data')
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Auftrag konnte nicht geladen werden', error);
  if (!data || data.deleted) return null;
  const p = data.data as ProjectData;
  // Alte Blobs defensiv normalisieren (wie migrateProject in der App).
  return {
    ...p,
    steps: p.steps ?? [],
    materials: p.materials ?? [],
    costs: p.costs ?? [],
  };
}
