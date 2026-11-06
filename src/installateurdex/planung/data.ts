// Datenquelle der Planung (Plantafel + Zeiten) — gleiche Tabellen und RLS wie die App:
//   appointment (InstallateurDex/supabase/plantafel.sql), time_entry (zeit.sql),
//   service_request.scheduled_at (termin.sql) und RPC set_request_status.
// Beispieldaten: planung/demo.ts (nur über ext-demo.ts / DemoArea — hier NIE importieren).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../../lib/orgApi';
import { fetchAllRows } from '../fetchAll';
import type { Appt, ApptInput, ApptStatus, PlanRequest, TimeEntry, TimePatch } from './logic';

export interface PlanungData {
  /** Eigene Nutzer-ID (auth.uid()). `role` brauchen nur die Beispieldaten (Ansicht Inhaber/Mitarbeiter). */
  myUserId(role: Role): Promise<string | null>;
  /** Termine mit Beginn in [from, to) — alle im Betrieb sehen alle (appt_select). */
  appointments(from: Date, to: Date): Promise<Appt[]>;
  createAppointment(orgId: string, input: ApptInput): Promise<void>;
  updateAppointment(id: string, input: ApptInput): Promise<void>;
  setAppointmentStatus(id: string, status: ApptStatus): Promise<void>;
  deleteAppointment(id: string): Promise<void>;
  /** Anfragen mit vom Kunden gewähltem Termin in [from, to), ohne erledigte/abgelehnte. */
  scheduledRequests(from: Date, to: Date): Promise<PlanRequest[]>;
  /** Offene Anfragen (neu / Termin geplant) — für die Auswahl „Anfrage“ im Termin-Dialog. */
  openRequests(): Promise<PlanRequest[]>;
  /** Anfrage „Termin geplant“ setzen (wie die App nach dem Speichern eines Termins zu einer neuen Anfrage). */
  markRequestScheduled(id: string): Promise<void>;
  /** Zeiten mit Beginn in [from, to). Inhaber: alle im Betrieb, sonst nur die eigenen (time_select). */
  timeEntries(from: Date, to: Date): Promise<TimeEntry[]>;
  updateTimeEntry(id: string, patch: TimePatch): Promise<void>;
  deleteTimeEntry(id: string): Promise<void>;
}

const APPT_COLS =
  'id, org_id, site_id, asset_id, request_id, assigned_to, assigned_name, title, note, starts_at, ends_at, status, created_by, created_at, updated_at';
const REQ_COLS = 'id, site_id, asset_id, kind, status, contact_name, created_at, scheduled_at, scheduled_end';
const TIME_COLS = 'id, org_id, user_id, user_name, kind, started_at, ended_at, site_id, note, edited_by, edited_at, created_at';

type PgError = { message: string; code?: string; details?: string | null; hint?: string | null } | null;

/** Datenbank-Fehler verständlich auf Deutsch. */
function apptError(msg: string, e: PgError): never {
  if (!e) throw new Error(msg);
  // RLS bzw. appointment_guard (dort mit deutscher Meldung, z. B. „Monteur gehört nicht zum Betrieb“)
  if (e.code === '42501') {
    const own = /Betrieb/.test(e.message) ? e.message : 'Für andere planen darf nur der Inhaber.';
    throw new Error(`${msg}: ${own}`);
  }
  if (e.code === '23514') throw new Error(`${msg}: Zeit oder Text ungültig (Ende nach Beginn, höchstens 14 Stunden, Titel bis 120 Zeichen).`);
  if (e.code === '23503') throw new Error(`${msg}: Objekt, Anlage oder Anfrage gibt es nicht mehr — bitte neu laden.`);
  if (e.code === '42P01' || e.code === 'PGRST205') throw new Error(`${msg}: Die Plantafel ist in der Datenbank noch nicht eingerichtet (plantafel.sql).`);
  throw new Error(`${msg}: ${e.message}`);
}

function timeError(msg: string, e: PgError): never {
  if (!e) throw new Error(msg);
  if (e.code === '42501') throw new Error(`${msg}: Keine Berechtigung.`);
  if (e.code === '23514') throw new Error(`${msg}: Ende muss nach dem Beginn liegen, höchstens 24 Stunden je Eintrag.`);
  if (e.code === '42P01' || e.code === 'PGRST205') throw new Error(`${msg}: Die Zeiterfassung ist in der Datenbank noch nicht eingerichtet (zeit.sql).`);
  throw new Error(`${msg}: ${e.message}`);
}

const NO_ROW = 'Keine Berechtigung oder der Eintrag wurde inzwischen gelöscht — bitte neu laden.';

export function supabasePlanung(sb: SupabaseClient): PlanungData {
  return {
    async myUserId() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.id ?? null;
    },

    async appointments(from, to) {
      // seitenweise (Server liefert höchstens 1.000 Zeilen je Abfrage), stabil sortiert mit id zuletzt
      const { data, error } = await fetchAllRows<Appt>((a, b) =>
        sb
          .from('appointment')
          .select(APPT_COLS)
          .gte('starts_at', from.toISOString())
          .lt('starts_at', to.toISOString())
          .order('starts_at')
          .order('id')
          .range(a, b),
      );
      if (error) apptError('Termine konnten nicht geladen werden', error);
      return data;
    },

    async createAppointment(orgId, input) {
      // id + created_by kommen per DB-Default (gen_random_uuid(), auth.uid()).
      const { error } = await sb.from('appointment').insert({ ...input, org_id: orgId });
      if (error) apptError('Termin nicht gespeichert', error);
    },

    async updateAppointment(id, input) {
      // RLS appt_update: Inhaber oder der zugeteilte Monteur — sonst 0 Zeilen (kein Fehler) → selbst prüfen.
      const { data, error } = await sb.from('appointment').update(input).eq('id', id).select('id');
      if (error) apptError('Termin nicht gespeichert', error);
      if (!data?.length) throw new Error(`Termin nicht gespeichert: ${NO_ROW}`);
    },

    async setAppointmentStatus(id, status) {
      const { data, error } = await sb.from('appointment').update({ status }).eq('id', id).select('id');
      if (error) apptError('Status nicht gespeichert', error);
      if (!data?.length) throw new Error(`Status nicht gespeichert: ${NO_ROW}`);
    },

    async deleteAppointment(id) {
      // RLS appt_delete: Inhaber, oder selbst angelegt UND sich selbst zugeteilt.
      const { data, error } = await sb.from('appointment').delete().eq('id', id).select('id');
      if (error) apptError('Termin nicht gelöscht', error);
      if (!data?.length) throw new Error(`Termin nicht gelöscht: ${NO_ROW}`);
    },

    async scheduledRequests(from, to) {
      const { data, error } = await sb
        .from('service_request')
        .select(REQ_COLS)
        .gte('scheduled_at', from.toISOString())
        .lt('scheduled_at', to.toISOString())
        .not('status', 'in', '(done,dismissed)')
        .order('scheduled_at')
        .order('id')
        .limit(1000);
      // Ohne termin.sql gibt es scheduled_at nicht — dann einfach keine Kundentermine statt Fehlerseite.
      if (error) {
        if (/scheduled_at/.test(error.message)) return [];
        throw new Error(`Kundentermine konnten nicht geladen werden: ${error.message}`);
      }
      return (data ?? []) as PlanRequest[];
    },

    async openRequests() {
      const { data, error } = await sb
        .from('service_request')
        .select(REQ_COLS)
        .in('status', ['new', 'scheduled'])
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) {
        // ältere Datenbank ohne termin.sql: ohne scheduled_* noch einmal
        const { data: d2, error: e2 } = await sb
          .from('service_request')
          .select('id, site_id, asset_id, kind, status, contact_name, created_at')
          .in('status', ['new', 'scheduled'])
          .order('created_at', { ascending: false })
          .limit(300);
        if (e2) throw new Error(`Anfragen konnten nicht geladen werden: ${e2.message}`);
        return ((d2 ?? []) as Omit<PlanRequest, 'scheduled_at' | 'scheduled_end'>[]).map((r) => ({ ...r, scheduled_at: null, scheduled_end: null }));
      }
      return (data ?? []) as PlanRequest[];
    },

    async markRequestScheduled(id) {
      // p_note null: vorhandene Notiz bleibt (coalesce in set_request_status).
      const { error } = await sb.rpc('set_request_status', { p_id: id, p_status: 'scheduled', p_note: null });
      if (error) throw new Error(`Anfrage-Status nicht gesetzt: ${error.message}`);
    },

    async timeEntries(from, to) {
      // Monat × Team kann über 1.000 Zeilen haben → seitenweise, sonst wären Bericht und CSV still unvollständig
      const { data, error } = await fetchAllRows<TimeEntry>((a, b) =>
        sb
          .from('time_entry')
          .select(TIME_COLS)
          .gte('started_at', from.toISOString())
          .lt('started_at', to.toISOString())
          .order('started_at', { ascending: true })
          .order('id')
          .range(a, b),
      );
      if (error) timeError('Zeiten konnten nicht geladen werden', error);
      return data;
    },

    async updateTimeEntry(id, patch) {
      // RLS time_update: eigene bis 7 Tage, Inhaber alle. Fremde Korrektur vermerkt der Trigger (edited_by/edited_at).
      const { data, error } = await sb.from('time_entry').update(patch).eq('id', id).select('id');
      if (error) timeError('Zeit nicht gespeichert', error);
      if (!data?.length) throw new Error(`Zeit nicht gespeichert: ${NO_ROW}`);
    },

    async deleteTimeEntry(id) {
      // RLS time_delete: nur eigene, bis 24 Stunden nach dem Anlegen.
      const { data, error } = await sb.from('time_entry').delete().eq('id', id).select('id');
      if (error) timeError('Zeit nicht gelöscht', error);
      if (!data?.length) throw new Error('Zeit nicht gelöscht: Löschen geht nur bei eigenen Einträgen bis 24 Stunden nach dem Anlegen.');
    },
  };
}
