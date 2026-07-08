import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type { DocumentData, DocumentSummary, Project } from './types';

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

export async function fetchProjects(sb: SupabaseClient): Promise<Project[]> {
  const { data, error } = await sb.from('projects').select('data');
  if (error) fail('Projekte konnten nicht geladen werden', error);
  return (data ?? [])
    .map((row) => row.data as Project)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'de'));
}
