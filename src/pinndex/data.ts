// PinnDex — Datenquelle. Eine Schnittstelle, zwei Umsetzungen: echt (Supabase, hier) und Beispieldaten (demo.ts).
// Tabellen/Spalten genau nach KONZEPT.md Abschnitt 6. Regeln:
// - Zustandswechsel NUR über RPC job_set_status, Zeit-Korrektur NUR über RPC job_fix_time — nie status/work_seconds direkt.
// - Stammdaten (Titel, Kunde, Termin, Zuweisung) schreibt nur Chef/Büro; die Datenbank (RLS) prüft das selbst.
// - Listen seitenweise laden (PostgREST liefert höchstens 1.000 Zeilen je Abfrage, siehe lib/fetchAll.ts).

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../lib/fetchAll';
import { fail } from '../lib/orgApi';
import { geocodeAddress, type GeoPoint } from './geocode';
import { newId } from './logic';
import type {
  Customer,
  CustomerInput,
  Job,
  JobEvent,
  JobInput,
  JobOutcome,
  JobStatus,
  PinnMember,
  PinnOrg,
  PinnRole,
  TeamCodeInfo,
} from './types';

/**
 * RPC-Namen an einer Stelle — abgeglichen mit PinnDex/supabase/schema.sql + SCHEMA-ABWEICHUNGEN.md (11.11.2026):
 * job_set_status(p_job, p_to, p_event_id, p_client_at, p_note, p_outcome, p_photos),
 * job_fix_time(p_job, p_seconds, p_note, p_event_id), team_code(p_renew), sync_seat_limit(),
 * member_update(p_user, p_role, p_active, p_display_name, p_color).
 */
export const RPC = {
  setStatus: 'job_set_status',
  fixTime: 'job_fix_time',
  teamCode: 'team_code',
  seats: 'sync_seat_limit',
  memberUpdate: 'member_update',
} as const;

export const PHOTO_BUCKET = 'pinn';

// Spalten immer ausdrücklich nennen: member.push_token ist für Clients nicht lesbar (select('*') scheitert)
const JOB_COLS =
  'id, org_id, title, customer_id, customer_name, customer_phone, address, note, scheduled_at, duration_min, urgent, assignee_id, helper_ids, status, seen_at, started_at, finished_at, work_seconds, running_since, lat, lng, done_note, outcome, photos, result_photos, created_by, created_at, updated_at, deleted_at';
const MEMBER_COLS = 'org_id, user_id, role, display_name, color, active, notify_done, created_at';
const CUSTOMER_COLS = 'id, org_id, name, phone, address, note, lat, lng, deleted_at, updated_at';
const EVENT_COLS = 'id, org_id, job_id, actor_id, kind, at, data, seq';

export interface PinnContextData {
  org: PinnOrg;
  me: PinnMember;
}

export interface StatusExtra {
  note?: string | null;
  outcome?: JobOutcome | null;
}

export interface PinnData {
  /** Alle Mitglieder des Betriebs (auch inaktive — für Namen im Verlauf). */
  members(): Promise<PinnMember[]>;
  customers(): Promise<Customer[]>;
  /** Pinnwand: Karten mit Termin im Zeitraum + alle offenen ohne Termin oder von früher. */
  boardJobs(from: Date, to: Date): Promise<Job[]>;
  /** Erledigt (und auf Wunsch abgesagt) im Zeitraum, neueste zuerst. */
  doneJobs(from: Date, to: Date, withCanceled: boolean): Promise<Job[]>;
  /** Für Zeiten: erledigt im Zeitraum + gerade laufende/pausierte. */
  timeJobs(from: Date, to: Date): Promise<Job[]>;
  job(id: string): Promise<Job | null>;
  events(jobId: string): Promise<JobEvent[]>;
  /** Ereignisse mehrerer Karten bestimmter Arten (z. B. letzte Starts, Korrekturen). */
  eventsOf(jobIds: string[], kinds: JobEvent['kind'][]): Promise<JobEvent[]>;
  /** Anlegen (ohne id) oder Stammdaten ändern (mit id). */
  saveJob(input: JobInput, id?: string): Promise<Job>;
  /** Ziehen auf der Pinnwand: Monteur und/oder Tag ändern. */
  moveJob(id: string, patch: { assignee_id?: string | null; scheduled_at?: string | null }): Promise<void>;
  setStatus(id: string, to: JobStatus, extra?: StatusExtra): Promise<void>;
  fixTime(id: string, seconds: number, note: string): Promise<void>;
  saveCustomer(input: CustomerInput, id?: string): Promise<Customer>;
  deleteCustomer(id: string): Promise<void>;
  teamCode(renew: boolean): Promise<TeamCodeInfo | null>;
  seats(): Promise<{ limit: number; members: number } | null>;
  setRole(userId: string, role: Exclude<PinnRole, 'owner'>): Promise<void>;
  removeMember(userId: string): Promise<void>;
  renameOrg(name: string): Promise<void>;
  /** Chef: Standort beim Starten/Beenden mitschicken (org.share_location) */
  setShareLocation(on: boolean): Promise<void>;
  /** Pin einer Karte setzen/ändern (job.lat/lng) — nach der Adress-Suche */
  setJobPos(id: string, pos: GeoPoint | null): Promise<void>;
  /** Adresse → Koordinaten (austauschbarer Anbieter, siehe geocode.ts). null = nicht gefunden. */
  geocode(address: string, retry?: boolean): Promise<GeoPoint | null>;
  /** Storage-Pfade → anzeigbare Adressen (signiert, 1 h). */
  photoUrls(paths: string[]): Promise<string[]>;
  /**
   * Live: meldet Änderungen an Karten (Realtime auf job, Filter org_id). `onLive(true)` = Verbindung steht.
   * Rückgabe: Abmelden.
   */
  subscribe(onChange: () => void, onLive: (live: boolean) => void): () => void;
}

const OPEN = '(new,seen,running,paused)';

/** Betrieb + eigene Mitgliedschaft des angemeldeten Kontos (1 Konto = 1 Betrieb, wie WinterDex). */
export async function loadPinnContext(sb: SupabaseClient): Promise<PinnContextData | null> {
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data: ms, error: mErr } = await sb.from('member').select(MEMBER_COLS).eq('user_id', uid).eq('active', true).limit(1);
  if (mErr) fail('Mitgliedschaft konnte nicht geladen werden', mErr);
  const me = ms?.[0] as PinnMember | undefined;
  if (!me) return null;
  const { data: org, error: oErr } = await sb.from('org').select('*').eq('id', me.org_id).single();
  if (oErr) fail('Betrieb konnte nicht geladen werden', oErr);
  return { org: org as PinnOrg, me };
}

export function supabaseData(sb: SupabaseClient, orgId: string): PinnData {
  const jobs = () => sb.from('job').select(JOB_COLS).eq('org_id', orgId).is('deleted_at', null);

  async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>, msg: string) {
    const { data, error } = await fetchAllRows<T>(build);
    if (error) fail(msg, error);
    return data;
  }

  return {
    async members() {
      const { data, error } = await sb.from('member').select(MEMBER_COLS).eq('org_id', orgId).order('created_at').order('user_id');
      if (error) fail('Team konnte nicht geladen werden', error);
      return (data ?? []) as PinnMember[];
    },

    customers() {
      return all<Customer>(
        (f, t) => sb.from('customer').select(CUSTOMER_COLS).eq('org_id', orgId).is('deleted_at', null).order('name').order('id').range(f, t),
        'Kunden konnten nicht geladen werden',
      );
    },

    async boardJobs(from, to) {
      // Drei einfache Abfragen statt eines or()-Filters mit Zeitstempeln (Punkte/Doppelpunkte in or() sind fehleranfällig)
      const [inRange, undated, overdue] = await Promise.all([
        all<Job>(
          (f, t) => jobs().gte('scheduled_at', from.toISOString()).lt('scheduled_at', to.toISOString()).order('scheduled_at').order('id').range(f, t),
          'Aufträge konnten nicht geladen werden',
        ),
        all<Job>(
          (f, t) => jobs().filter('status', 'in', OPEN).is('scheduled_at', null).order('created_at').order('id').range(f, t),
          'Offene Aufträge konnten nicht geladen werden',
        ),
        all<Job>(
          (f, t) => jobs().filter('status', 'in', OPEN).lt('scheduled_at', from.toISOString()).order('scheduled_at').order('id').range(f, t),
          'Offene Aufträge konnten nicht geladen werden',
        ),
      ]);
      const byId = new Map<string, Job>();
      for (const j of [...inRange, ...undated, ...overdue]) byId.set(j.id, j);
      return [...byId.values()];
    },

    async doneJobs(from, to, withCanceled) {
      const done = await all<Job>(
        (f, t) => jobs().eq('status', 'done').gte('finished_at', from.toISOString()).lt('finished_at', to.toISOString()).order('finished_at', { ascending: false }).order('id').range(f, t),
        'Erledigte Aufträge konnten nicht geladen werden',
      );
      if (!withCanceled) return done;
      const canceled = await all<Job>(
        (f, t) => jobs().eq('status', 'canceled').gte('updated_at', from.toISOString()).lt('updated_at', to.toISOString()).order('updated_at', { ascending: false }).order('id').range(f, t),
        'Abgesagte Aufträge konnten nicht geladen werden',
      );
      return [...done, ...canceled];
    },

    async timeJobs(from, to) {
      const [done, running] = await Promise.all([
        all<Job>(
          (f, t) => jobs().eq('status', 'done').gte('finished_at', from.toISOString()).lt('finished_at', to.toISOString()).order('finished_at').order('id').range(f, t),
          'Zeiten konnten nicht geladen werden',
        ),
        all<Job>(
          (f, t) => jobs().in('status', ['running', 'paused']).lt('started_at', to.toISOString()).order('started_at').order('id').range(f, t),
          'Laufende Aufträge konnten nicht geladen werden',
        ),
      ]);
      return [...done, ...running];
    },

    async job(id) {
      const { data, error } = await jobs().eq('id', id).maybeSingle();
      if (error) fail('Auftrag konnte nicht geladen werden', error);
      return (data as Job | null) ?? null;
    },

    async events(jobId) {
      const { data, error } = await sb.from('job_event').select(EVENT_COLS).eq('job_id', jobId).order('at').order('seq');
      if (error) fail('Verlauf konnte nicht geladen werden', error);
      return (data ?? []) as JobEvent[];
    },

    async eventsOf(jobIds, kinds) {
      if (!jobIds.length) return [];
      const out: JobEvent[] = [];
      // in()-Listen in Häppchen (URL-Länge)
      for (let i = 0; i < jobIds.length; i += 120) {
        const part = jobIds.slice(i, i + 120);
        const rows = await all<JobEvent>(
          (f, t) => sb.from('job_event').select(EVENT_COLS).in('job_id', part).in('kind', kinds).order('at').order('seq').range(f, t),
          'Verlauf konnte nicht geladen werden',
        );
        out.push(...rows);
      }
      return out;
    },

    async saveJob(input, id) {
      if (id) {
        const { data, error } = await sb.from('job').update(input).eq('id', id).eq('org_id', orgId).select(JOB_COLS).single();
        if (error) fail('Auftrag konnte nicht gespeichert werden', error);
        return data as Job;
      }
      // created_by/status/… setzt der Server (Spaltenrechte erlauben nur Stammdaten + id/org_id)
      const row = { ...input, id: newId(), org_id: orgId };
      const { data, error } = await sb.from('job').insert(row).select(JOB_COLS).single();
      if (error) fail('Auftrag konnte nicht angelegt werden', error);
      return data as Job;
    },

    async moveJob(id, patch) {
      const { error } = await sb.from('job').update(patch).eq('id', id).eq('org_id', orgId);
      if (error) fail('Auftrag konnte nicht verschoben werden', error);
    },

    async setStatus(id, to, extra) {
      const { error } = await sb.rpc(RPC.setStatus, {
        p_job: id,
        p_to: to,
        p_client_at: new Date().toISOString(),
        p_note: extra?.note ?? null,
        p_outcome: extra?.outcome ?? null,
        p_event_id: newId(),
      });
      if (error) fail('Zustand konnte nicht geändert werden', error);
    },

    async fixTime(id, seconds, note) {
      const { error } = await sb.rpc(RPC.fixTime, { p_job: id, p_seconds: Math.max(0, Math.round(seconds)), p_note: note, p_event_id: newId() });
      if (error) fail('Zeit konnte nicht korrigiert werden', error);
    },

    async saveCustomer(input, id) {
      if (id) {
        const { data, error } = await sb.from('customer').update(input).eq('id', id).eq('org_id', orgId).select(CUSTOMER_COLS).single();
        if (error) fail('Kunde konnte nicht gespeichert werden', error);
        return data as Customer;
      }
      const { data, error } = await sb.from('customer').insert({ ...input, id: newId(), org_id: orgId }).select(CUSTOMER_COLS).single();
      if (error) fail('Kunde konnte nicht angelegt werden', error);
      return data as Customer;
    },

    async deleteCustomer(id) {
      const { error } = await sb.from('customer').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('org_id', orgId);
      if (error) fail('Kunde konnte nicht gelöscht werden', error);
    },

    async teamCode(renew) {
      const { data, error } = await sb.rpc(RPC.teamCode, { p_renew: renew });
      if (error) fail('Team-Code konnte nicht geladen werden', error);
      const r = (Array.isArray(data) ? data[0] : data) as { code?: string; expires_at?: string | null; team_code?: string; team_code_expires?: string | null } | string | null;
      if (!r) return null;
      if (typeof r === 'string') return { code: r, expires_at: null };
      const code = r.code ?? r.team_code;
      return code ? { code, expires_at: r.expires_at ?? r.team_code_expires ?? null } : null;
    },

    async seats() {
      const { data, error } = await sb.rpc(RPC.seats);
      if (error) return null; // Anzeige ist Komfort — Team-Seite nie blockieren
      const r = (Array.isArray(data) ? data[0] : data) as { seat_limit?: number; members?: number } | number | null;
      if (r == null) return null;
      if (typeof r === 'number') return { limit: r, members: 0 };
      return { limit: r.seat_limit ?? 3, members: r.members ?? 0 };
    },

    async setRole(userId, role) {
      const { error } = await sb.rpc(RPC.memberUpdate, { p_user: userId, p_role: role });
      if (error) fail('Rolle konnte nicht geändert werden', error);
    },

    // „Entfernen“ = active false (Name bleibt für alte Karten/Zeiten; offene Karten werden wieder „nicht zugewiesen“)
    async removeMember(userId) {
      const { error } = await sb.rpc(RPC.memberUpdate, { p_user: userId, p_active: false });
      if (error) fail('Mitglied konnte nicht entfernt werden', error);
    },

    async renameOrg(name) {
      const { error } = await sb.from('org').update({ name }).eq('id', orgId);
      if (error) fail('Betrieb konnte nicht gespeichert werden', error);
    },

    async setShareLocation(on) {
      const { error } = await sb.from('org').update({ share_location: on }).eq('id', orgId);
      if (error) fail('Einstellung konnte nicht gespeichert werden', error);
    },

    async setJobPos(id, pos) {
      const { error } = await sb.from('job').update({ lat: pos?.lat ?? null, lng: pos?.lng ?? null }).eq('id', id).eq('org_id', orgId);
      if (error) fail('Pin konnte nicht gespeichert werden', error);
    },

    geocode: (address, retry) => geocodeAddress(address, { retry }),

    async photoUrls(paths) {
      const clean = paths.filter((p) => typeof p === 'string' && p.startsWith(`${orgId}/`));
      if (!clean.length) return [];
      const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(clean, 3600);
      if (error) fail('Fotos konnten nicht geladen werden', error);
      return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u);
    },

    subscribe(onChange, onLive) {
      let ch: RealtimeChannel | null = sb
        .channel(`pinn-job-${orgId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'job', filter: `org_id=eq.${orgId}` }, () => onChange())
        .subscribe((status) => onLive(status === 'SUBSCRIBED'));
      return () => {
        if (ch) void sb.removeChannel(ch);
        ch = null;
        onLive(false);
      };
    },
  };
}
