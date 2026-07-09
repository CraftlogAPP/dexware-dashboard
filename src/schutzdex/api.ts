import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type {
  Assignment,
  AssignmentStatus,
  Briefing,
  Completion,
  Member,
} from './types';

// Unterweisungs-Listen ohne die großen jsonb-Spalten content/questions.
const BRIEFING_COLS =
  'id, org_id, titel, thema, land, branche, taetigkeit, generiert_von, version, created_at';

export async function fetchMembers(sb: SupabaseClient): Promise<Member[]> {
  const { data, error } = await sb
    .from('member')
    .select('*')
    .order('aktiv', { ascending: false })
    .order('name');
  if (error) fail('Mitarbeiter konnten nicht geladen werden', error);
  return (data ?? []) as Member[];
}

export async function fetchBriefings(sb: SupabaseClient): Promise<Briefing[]> {
  const { data, error } = await sb
    .from('briefing')
    .select(BRIEFING_COLS)
    .order('created_at', { ascending: false });
  if (error) fail('Unterweisungen konnten nicht geladen werden', error);
  return (data ?? []) as Briefing[];
}

// ── Schreiben (Format identisch zur App, src/lib/queries.ts) ────────────────

export interface MemberInput {
  name: string;
  taetigkeit: string | null;
  email: string | null;
  telefon: string | null;
  eintritt_am: string | null;
  aktiv: boolean;
}

export async function insertMember(
  sb: SupabaseClient,
  orgId: string,
  input: MemberInput,
): Promise<void> {
  const { error } = await sb.from('member').insert({ org_id: orgId, ...input });
  if (error) fail('Mitarbeiter konnte nicht angelegt werden', error);
}

export async function updateMember(
  sb: SupabaseClient,
  id: string,
  input: MemberInput,
): Promise<void> {
  const { error } = await sb.from('member').update(input).eq('id', id);
  if (error) fail('Mitarbeiter konnte nicht gespeichert werden', error);
}

export interface AssignmentInput {
  briefing_id: string;
  member_id: string;
  faellig_am: string | null;
  wiederholung: string;
}

/** Unterweisung einem Mitarbeiter zuweisen (Status startet 'offen'). */
export async function addAssignment(
  sb: SupabaseClient,
  orgId: string,
  input: AssignmentInput,
): Promise<void> {
  const { error } = await sb.from('assignment').insert({ org_id: orgId, ...input });
  if (error) fail('Zuweisung konnte nicht angelegt werden', error);
}

export interface AssignmentFilter {
  memberId?: string;
  status?: AssignmentStatus;
  limit?: number;
}

export async function fetchAssignments(
  sb: SupabaseClient,
  filter: AssignmentFilter = {},
): Promise<Assignment[]> {
  let q = sb
    .from('assignment')
    .select('*')
    .order('faellig_am', { ascending: true, nullsFirst: false })
    .limit(filter.limit ?? 1000);
  if (filter.memberId) q = q.eq('member_id', filter.memberId);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) fail('Zuweisungen konnten nicht geladen werden', error);
  return (data ?? []) as Assignment[];
}

export interface CompletionFilter {
  memberId?: string;
  limit?: number;
}

export async function fetchCompletions(
  sb: SupabaseClient,
  filter: CompletionFilter = {},
): Promise<Completion[]> {
  let q = sb
    .from('completion')
    .select('*')
    .order('abgeschlossen_am', { ascending: false })
    .limit(filter.limit ?? 1000);
  if (filter.memberId) q = q.eq('member_id', filter.memberId);
  const { data, error } = await q;
  if (error) fail('Nachweise konnten nicht geladen werden', error);
  return (data ?? []) as Completion[];
}
