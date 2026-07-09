import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type { DocType, DocumentData, DocumentSummary, Project } from './types';

// Listen-Select: NUR skalare/kleine Felder aus dem data-jsonb — der volle
// Blob enthält den Dokument-Scan als Base64 (imageBase64).
const DOC_COLS = [
  'id:client_id',
  'updated_at',
  'title:data->>title',
  'type:data->>type',
  'project_id:data->>projectId',
  'ai_type:data->analysis->>documentType',
  'summary:data->analysis->>summary',
  'deadlines:data->analysis->deadlines',
  'notes:data->>notes',
  'created_at:data->>createdAt',
].join(', ');

export async function fetchDocumentSummaries(
  sb: SupabaseClient,
): Promise<DocumentSummary[]> {
  const { data, error } = await sb
    .from('documents')
    .select(DOC_COLS)
    .order('data->>createdAt', { ascending: false });
  if (error) fail('Dokumente konnten nicht geladen werden', error);
  return (data ?? []) as unknown as DocumentSummary[];
}

/** Volles Dokument inkl. Scan-Bild und Analyse — nur im Detail. */
export async function fetchDocument(
  sb: SupabaseClient,
  id: string,
): Promise<DocumentData | null> {
  const { data, error } = await sb
    .from('documents')
    .select('client_id, data')
    .eq('client_id', id)
    .maybeSingle();
  if (error) fail('Dokument konnte nicht geladen werden', error);
  return data ? (data.data as DocumentData) : null;
}

// ── Schreiben (Sync-Format wie App syncService.js, "neueste Änderung gewinnt")
// Read-Modify-Write auf dem data-Blob: Scan-Bild & KI-Analyse bleiben erhalten.
// data.updatedAt + updated_at werden hochgesetzt, damit der App-Merge die
// Dashboard-Änderung übernimmt.

export interface DocumentHeadInput {
  title: string;
  type: DocType;
  projectId: string | null;
  /** Freitext-Notizen; null entfernt das Feld. */
  notes: string | null;
}

export async function updateDocumentHead(
  sb: SupabaseClient,
  id: string,
  input: DocumentHeadInput,
): Promise<void> {
  const { data, error } = await sb
    .from('documents')
    .select('data')
    .eq('client_id', id)
    .single();
  if (error) fail('Dokument konnte nicht geladen werden', error);
  const now = new Date().toISOString();
  const merged = {
    ...(data!.data as DocumentData),
    title: input.title,
    type: input.type,
    projectId: input.projectId,
    notes: input.notes ?? undefined,
    updatedAt: now,
  };
  const { error: upError } = await sb
    .from('documents')
    .update({ data: merged, updated_at: now })
    .eq('client_id', id);
  if (upError) fail('Dokument konnte nicht gespeichert werden', upError);
}

/** Dokument hart löschen — wie App SyncService.removeDocument (RLS scoped den User). */
export async function deleteDocument(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('documents').delete().eq('client_id', id);
  if (error) fail('Dokument konnte nicht gelöscht werden', error);
}

/**
 * Projekt (Ordner) löschen — wie App storage.js deleteProject: zuerst die
 * projectId der zugehörigen Dokumente lösen (Blob-Merge + updatedAt, damit die
 * Dokumente ohne Projekt erhalten bleiben), dann die Projekt-Zeile hart löschen.
 */
export async function deleteProject(
  sb: SupabaseClient,
  userId: string,
  project: Project,
  memberDocs: DocumentSummary[],
): Promise<void> {
  for (const doc of memberDocs) {
    const { data, error } = await sb
      .from('documents')
      .select('data')
      .eq('client_id', doc.id)
      .single();
    if (error) fail('Dokument konnte nicht geladen werden', error);
    const now = new Date().toISOString();
    const merged = {
      ...(data!.data as DocumentData),
      projectId: null,
      updatedAt: now,
    };
    const { error: upError } = await sb
      .from('documents')
      .update({ data: merged, updated_at: now })
      .eq('client_id', doc.id);
    if (upError) fail('Dokument konnte nicht gespeichert werden', upError);
  }
  const { error } = await sb
    .from('projects')
    .delete()
    .eq('user_id', userId)
    .eq('client_id', project.id);
  if (error) fail('Projekt konnte nicht gelöscht werden', error);
}

/** Projekt (Dokumenten-Ordner) anlegen/umbenennen — Upsert wie app-seitiges pushProject. */
export async function saveProject(
  sb: SupabaseClient,
  userId: string,
  name: string,
  existing?: Project,
): Promise<void> {
  const now = new Date().toISOString();
  const project = {
    ...(existing ?? { id: crypto.randomUUID(), createdAt: now }),
    name,
    updatedAt: now,
  };
  const { error } = await sb.from('projects').upsert(
    {
      user_id: userId,
      client_id: project.id,
      data: project,
      updated_at: now,
    },
    { onConflict: 'user_id,client_id' },
  );
  if (error) fail('Projekt konnte nicht gespeichert werden', error);
}

export async function fetchProjects(sb: SupabaseClient): Promise<Project[]> {
  const { data, error } = await sb.from('projects').select('data');
  if (error) fail('Projekte konnten nicht geladen werden', error);
  return (data ?? [])
    .map((row) => row.data as Project)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'de'));
}
