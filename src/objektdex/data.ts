// ObjektDex — Datenzugriff hinter einer Schnittstelle: Supabase (echter Betrieb) oder Beispieldaten (demo.ts, nur Dev).
// Regeln (SCHEMA.md): Einsätze/Mängel nie ändern — nur Storno (Inhaber) bzw. „erledigt“ per RPC.
// Listen seitenweise (fetchAllRows) mit fester Sortierung, Tagesgrenzen Europe/Berlin.
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../lib/fetchAll';
import { fail } from '../lib/orgApi';
import { addDays, dayToUTC, type Day } from './turnus';
import { parseRole } from './types';
import type {
  OdDefect,
  OdMember,
  OdOperation,
  OdProperty,
  OdService,
  OdShareLink,
  OdSollIstRow,
  OdTodayRow,
  PropertyInput,
  ServiceInput,
} from './types';

export interface OdData {
  listProperties(): Promise<OdProperty[]>;
  saveProperty(p: PropertyInput): Promise<void>;
  setPropertyActive(id: string, active: boolean): Promise<void>;
  /** alle Leistungen des Betriebs, auch beendete */
  listServices(): Promise<OdService[]>;
  saveService(s: ServiceInput): Promise<void>;
  setServiceActive(id: string, active: boolean): Promise<void>;
  /** Einsätze im Zeitraum (Berliner Tage, beide einschließlich), neueste zuerst, ohne Fotodaten */
  listOperations(opts: { from: Day; to: Day; propertyId?: string }): Promise<OdOperation[]>;
  cancelOperation(id: string, reason: string): Promise<void>;
  listDefects(): Promise<OdDefect[]>;
  resolveDefect(id: string, note: string, name: string): Promise<void>;
  /** Fotos als anzeigbare Links (signiert, 10 Minuten) je Eintrag */
  photos(kind: 'operation' | 'defect', ids: string[]): Promise<Map<string, string[]>>;
  todayOverview(day: Day): Promise<OdTodayRow[]>;
  sollIst(propertyId: string, from: Day, to: Day): Promise<OdSollIstRow[]>;
  listShareLinks(): Promise<OdShareLink[]>;
  /** liefert den Token GENAU EINMAL */
  createShareLink(propertyId: string, label: string): Promise<string>;
  revokeShareLink(id: string): Promise<void>;
  listMembers(): Promise<OdMember[]>;
  teamCode(renew: boolean): Promise<{ code: string; expires_at: string; use_count: number } | null>;
  removeMember(membershipId: string): Promise<void>;
  /** Verwalter ernennen ('admin') / zurückstufen ('worker') — nur der Inhaber (Server prüft selbst) */
  setMemberRole(userId: string, role: 'admin' | 'worker'): Promise<void>;
}

// ---------------------------------------------------------------------------- Berliner Tagesgrenzen

const berlinParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
/** Abstand Berlin ↔ UTC in Minuten zu einem Zeitpunkt (Sommerzeit 120, Winterzeit 60). */
function berlinOffsetMin(ms: number): number {
  const p = berlinParts.formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms) / 60000);
}
/** Berliner Mitternacht eines Tages als ISO-Zeitpunkt (für Filter auf timestamptz). */
export function berlinStartIso(day: Day): string {
  const utc = dayToUTC(day);
  return new Date(utc - berlinOffsetMin(utc) * 60000).toISOString();
}

// ---------------------------------------------------------------------------- Supabase

const OP_COLS =
  'id, property_id, started_at, ended_at, lat, lng, gps_accuracy_m, gps_mocked, service_ids, services, photo_count, notes, ' +
  'performer_name, received_at, distance_m, entry_hash, canceled, cancel_reason, canceled_at';
const DEFECT_COLS =
  'id, property_id, operation_id, text, photo_count, reporter_name, created_at, entry_hash, status, resolved_at, resolved_name, resolved_note';

export function supabaseData(sb: SupabaseClient, orgId: string): OdData {
  const STORAGE = 'storage:';
  return {
    async listProperties() {
      const { data, error } = await fetchAllRows<OdProperty>((a, b) => sb.from('property').select('*').order('name').order('id').range(a, b));
      if (error) fail('Objekte konnten nicht geladen werden', error);
      return data;
    },
    async saveProperty(p) {
      const row = { name: p.name.trim(), address: p.address.trim(), customer_name: p.customer_name, customer_contact: p.customer_contact, contact_person: p.contact_person, notes: p.notes };
      const q = p.id ? sb.from('property').update(row).eq('id', p.id).select('id') : sb.from('property').insert({ ...row, org_id: orgId }).select('id');
      const { data, error } = await q;
      if (error) fail('Objekt nicht gespeichert', error);
      if (!data?.length) throw new Error('Objekt nicht gespeichert: Objekte verwaltet nur der Inhaber.');
    },
    async setPropertyActive(id, active) {
      const { data, error } = await sb.from('property').update({ active }).eq('id', id).select('id');
      if (error) fail('Objekt nicht geändert', error);
      if (!data?.length) throw new Error('Nicht geändert: nur der Inhaber kann Objekte pausieren.');
    },
    async listServices() {
      const { data, error } = await fetchAllRows<OdService>((a, b) => sb.from('service').select('*').order('sort').order('name').order('id').range(a, b));
      if (error) fail('Leistungen konnten nicht geladen werden', error);
      return data.map((s) => ({ ...s, weekdays: (s.weekdays ?? []).map(Number) }));
    },
    async saveService(s) {
      const row = {
        name: s.name.trim(),
        cadence: s.cadence,
        weekdays: s.cadence === 'weekly' || s.cadence === 'biweekly' ? s.weekdays : [],
        month_day: s.cadence === 'monthly' ? s.month_day ?? 1 : null,
        start_on: s.start_on,
        notes: s.notes,
      };
      const q = s.id
        ? sb.from('service').update(row).eq('id', s.id).select('id')
        : sb.from('service').insert({ ...row, org_id: orgId, property_id: s.property_id, template_key: s.template_key ?? null }).select('id');
      const { data, error } = await q;
      if (error) fail('Leistung nicht gespeichert', error);
      if (!data?.length) throw new Error('Leistung nicht gespeichert: Leistungen verwaltet nur der Inhaber.');
    },
    async setServiceActive(id, active) {
      const { data, error } = await sb.from('service').update({ active }).eq('id', id).select('id');
      if (error) fail('Leistung nicht geändert', error);
      if (!data?.length) throw new Error('Nicht geändert: Leistungen verwaltet nur der Inhaber.');
    },
    async listOperations({ from, to, propertyId }) {
      const fromIso = berlinStartIso(from);
      const toIso = berlinStartIso(addDays(to, 1));
      const { data, error } = await fetchAllRows<OdOperation>((a, b) => {
        let q = sb.from('operation').select(OP_COLS).gte('started_at', fromIso).lt('started_at', toIso);
        if (propertyId) q = q.eq('property_id', propertyId);
        return q.order('started_at', { ascending: false }).order('id').range(a, b);
      });
      if (error) fail('Einsätze konnten nicht geladen werden', error);
      return data;
    },
    async cancelOperation(id, reason) {
      const { error } = await sb.rpc('cancel_operation', { p_operation: id, p_reason: reason });
      if (error) fail('Nicht storniert', error);
    },
    async listDefects() {
      const { data, error } = await fetchAllRows<OdDefect>((a, b) => sb.from('defect').select(DEFECT_COLS).order('created_at', { ascending: false }).order('id').range(a, b));
      if (error) fail('Mängel konnten nicht geladen werden', error);
      return data;
    },
    async resolveDefect(id, note, name) {
      const { error } = await sb.rpc('resolve_defect', { p_defect: id, p_note: note.trim() || null, p_name: name.trim() || null });
      if (error) fail('Nicht als erledigt gespeichert', error);
    },
    async photos(kind, ids) {
      const out = new Map<string, string[]>();
      if (!ids.length) return out;
      const rows: { id: string; photo_urls: string[] }[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await sb.from(kind).select('id, photo_urls').in('id', ids.slice(i, i + 100));
        if (error) fail('Fotos konnten nicht geladen werden', error);
        rows.push(...((data ?? []) as { id: string; photo_urls: string[] }[]));
      }
      const paths = [...new Set(rows.flatMap((r) => (r.photo_urls ?? []).filter((u) => u.startsWith(STORAGE)).map((u) => u.slice(STORAGE.length))))];
      const signed = new Map<string, string>();
      for (let i = 0; i < paths.length; i += 100) {
        const { data } = await sb.storage.from('photos').createSignedUrls(paths.slice(i, i + 100), 600);
        for (const d of data ?? []) if (d.path && d.signedUrl) signed.set(d.path, d.signedUrl);
      }
      for (const r of rows) {
        out.set(
          r.id,
          (r.photo_urls ?? [])
            .map((u) => (u.startsWith(STORAGE) ? signed.get(u.slice(STORAGE.length)) ?? '' : u))
            .filter(Boolean),
        );
      }
      return out;
    },
    async todayOverview(day) {
      const { data, error } = await sb.rpc('today_overview', { p_day: day });
      if (error) fail('Heute-Übersicht konnte nicht geladen werden', error);
      return (data ?? []) as OdTodayRow[];
    },
    async sollIst(propertyId, from, to) {
      const { data, error } = await sb.rpc('soll_ist', { p_property: propertyId, p_from: from, p_to: to });
      if (error) fail('Soll/Ist konnte nicht geladen werden', error);
      return (data ?? []) as OdSollIstRow[];
    },
    async listShareLinks() {
      const { data, error } = await fetchAllRows<OdShareLink>((a, b) =>
        sb.from('share_link').select('id, property_id, label, created_at, revoked_at, last_viewed_at, view_count').order('created_at', { ascending: false }).order('id').range(a, b),
      );
      if (error) fail('Links konnten nicht geladen werden', error);
      return data;
    },
    async createShareLink(propertyId, label) {
      const { data, error } = await sb.rpc('create_share_link', { p_property: propertyId, p_label: label.trim() || null });
      if (error) {
        if (/too many/i.test(error.message)) throw new Error('Höchstens 5 offene Links je Objekt — bitte zuerst einen alten widerrufen.');
        fail('Link nicht erstellt', error);
      }
      return String(data);
    },
    async revokeShareLink(id) {
      const { error } = await sb.rpc('revoke_share_link', { p_link: id });
      if (error) fail('Link nicht widerrufen', error);
    },
    async listMembers() {
      const { data, error } = await sb.rpc('list_members');
      if (error) fail('Team konnte nicht geladen werden', error);
      return ((data ?? []) as OdMember[]).map((m) => ({ ...m, role: parseRole(m.role) }));
    },
    async teamCode(renew) {
      const { data, error } = await sb.rpc('team_code', { p_renew: renew });
      if (error) fail('Team-Code nicht verfügbar', error);
      const r = Array.isArray(data) ? data[0] : data;
      return r ?? null;
    },
    async removeMember(membershipId) {
      const { error } = await sb.rpc('remove_member', { p_membership: membershipId });
      if (error) {
        if (/Verwalter kann nur der Inhaber/i.test(error.message)) throw new Error('Verwalter kann nur der Inhaber entfernen.');
        fail('Mitglied nicht entfernt', error);
      }
    },
    async setMemberRole(userId, role) {
      const { error } = await sb.rpc('set_member_role', { p_user: userId, p_role: role });
      if (error) {
        if (/nur der Inhaber/i.test(error.message)) throw new Error('Verwalter ernennen darf nur der Inhaber des Betriebs.');
        fail('Rolle nicht geändert', error);
      }
    },
  };
}
