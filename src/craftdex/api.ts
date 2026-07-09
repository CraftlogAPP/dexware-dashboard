import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type { ProjectData, ProjectStatus, ProjectSummary } from './types';

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

// ── Schreiben (Sync-Format wie App storage/sync.ts, "neueste Änderung gewinnt")
// Read-Modify-Write auf dem data-Blob: nur Kopf-Felder werden ersetzt, Schritte/
// Material/Fotos bleiben erhalten. data.updatedAt (epoch ms) + updated_at werden
// hochgesetzt, damit der App-Merge die Dashboard-Änderung übernimmt.

export interface ProjectHeadInput {
  title: string;
  category: string;
  status: ProjectStatus;
  description: string | undefined;
  estimatedHours: number | null;
  budget: number | null;
  customerName: string | undefined;
  /** epoch ms oder null (Termin entfernen) */
  deadlineMs: number | null;
}

export async function updateProjectHead(
  sb: SupabaseClient,
  id: string,
  input: ProjectHeadInput,
): Promise<void> {
  const { data, error } = await sb
    .from('projects')
    .select('data')
    .eq('id', id)
    .single();
  if (error) fail('Auftrag konnte nicht geladen werden', error);
  const now = Date.now();
  const prev = data!.data as ProjectData;
  const merged: ProjectData = {
    ...prev,
    title: input.title,
    category: input.category,
    status: input.status,
    description: input.description,
    estimatedHours: input.estimatedHours ?? prev.estimatedHours ?? 0,
    budget: input.budget ?? undefined,
    deadline: input.deadlineMs != null ? { date: input.deadlineMs } : undefined,
    customer: input.customerName
      ? { ...prev.customer, name: input.customerName }
      : prev.customer,
    updatedAt: now,
  };
  const { error: upError } = await sb
    .from('projects')
    .update({ data: merged, updated_at: new Date(now).toISOString() })
    .eq('id', id);
  if (upError) fail('Auftrag konnte nicht gespeichert werden', upError);
}

/** Neuen Auftrag anlegen — minimaler Blob, die App normalisiert defensiv. */
export async function insertProject(
  sb: SupabaseClient,
  userId: string,
  input: ProjectHeadInput,
): Promise<void> {
  const now = Date.now();
  const project: ProjectData = {
    id: crypto.randomUUID(),
    title: input.title,
    category: input.category,
    status: input.status,
    description: input.description,
    estimatedHours: input.estimatedHours ?? 0,
    loggedHours: 0,
    steps: [],
    materials: [],
    costs: [],
    budget: input.budget ?? undefined,
    deadline: input.deadlineMs != null ? { date: input.deadlineMs } : undefined,
    customer: input.customerName ? { name: input.customerName } : undefined,
    createdAt: now,
    updatedAt: now,
  };
  const { error } = await sb.from('projects').upsert(
    {
      user_id: userId,
      id: project.id,
      data: project,
      updated_at: new Date(now).toISOString(),
      deleted: false,
    },
    { onConflict: 'user_id,id' },
  );
  if (error) fail('Auftrag konnte nicht angelegt werden', error);
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
