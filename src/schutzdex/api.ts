import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import { fetchAllOf } from '../lib/completeQueries';
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
  const { data, error } = await fetchAllOf(() => sb.from('member').select('*'), [['aktiv', false], ['name']]);
  if (error) fail('Mitarbeiter konnten nicht geladen werden', error);
  return (data ?? []) as Member[];
}

export async function fetchBriefings(sb: SupabaseClient): Promise<Briefing[]> {
  const { data, error } = await fetchAllOf(() => sb.from('briefing').select(BRIEFING_COLS), [['created_at', false]]);
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

/**
 * Mitarbeiter löschen — wie die App (deleteMember). Bestehende Nachweise bleiben
 * erhalten (completion.member_id ist FK „on delete set null", signed_name bleibt);
 * offene Zuweisungen werden per Cascade (assignment.member_id) mitgelöscht.
 */
export async function deleteMember(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('member').delete().eq('id', id);
  if (error) fail('Mitarbeiter konnte nicht gelöscht werden', error);
}

/** Anzahl der Nachweise, die auf diese Unterweisung verweisen — für die
 * Lösch-Warnung (wie die App, countBriefingCompletions). */
export async function countBriefingCompletions(
  sb: SupabaseClient,
  briefingId: string,
): Promise<number> {
  const { count, error } = await sb
    .from('completion')
    .select('id', { count: 'exact', head: true })
    .eq('briefing_id', briefingId);
  if (error) fail('Anzahl der Nachweise konnte nicht ermittelt werden', error);
  return count ?? 0;
}

/**
 * Unterweisung löschen — wie die App (deleteBriefing). Bestehende Nachweise
 * bleiben erhalten (completion.briefing_id ist FK „on delete set null");
 * Zuweisungen werden per Cascade (assignment.briefing_id) mitgelöscht.
 */
export async function deleteBriefing(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('briefing').delete().eq('id', id);
  if (error) fail('Unterweisung konnte nicht gelöscht werden', error);
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
  const build = () => {
    let q = sb.from('assignment').select('*');
    if (filter.memberId) q = q.eq('member_id', filter.memberId);
    if (filter.status) q = q.eq('status', filter.status);
    return q;
  };
  // Ohne limit vollständig (Kennzahlen offen/überfällig, je Mitarbeiter/Unterweisung) — auch über 1.000 Zuweisungen.
  const { data, error } = filter.limit
    ? await build()
        .order('faellig_am', { ascending: true, nullsFirst: false })
        .order('id')
        .limit(filter.limit)
    : await fetchAllOf(build, [['faellig_am', true, { nullsFirst: false }]]);
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
  const build = () => {
    const q = sb.from('completion').select('*');
    return filter.memberId ? q.eq('member_id', filter.memberId) : q;
  };
  // Ohne limit vollständig (Nachweisliste, letzter Nachweis je Mitarbeiter) — auch über 1.000 Nachweise.
  const { data, error } = filter.limit
    ? await build()
        .order('abgeschlossen_am', { ascending: false })
        .order('id', { ascending: false })
        .limit(filter.limit)
    : await fetchAllOf(build, [['abgeschlossen_am', false], ['id', false]]);
  if (error) fail('Nachweise konnten nicht geladen werden', error);
  return (data ?? []) as Completion[];
}

/** Exakte Anzahl der Nachweise seit `since` (count statt Zeilen zählen). */
export async function countCompletionsSince(sb: SupabaseClient, since: Date): Promise<number> {
  const { count, error } = await sb
    .from('completion')
    .select('id', { count: 'exact', head: true })
    .gte('abgeschlossen_am', since.toISOString());
  if (error) fail('Anzahl der Nachweise konnte nicht ermittelt werden', error);
  return count ?? 0;
}
