// Datenzugriff des Betriebsportals. EINE Schnittstelle, zwei Umsetzungen:
//  - supabaseData(client): echtes Supabase-Projekt (gleiche RLS wie die App)
//  - demoData() in demo.ts: Beispieldaten im Speicher (nur Dev-Server, solange es kein Projekt gibt)
// Die Seiten kennen nur InstData — so lässt sich alles ohne Backend durchklicken.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchMembers, fail, type Member } from '../lib/orgApi';
import { signPhotos } from '../lib/photos';
import { withGpsProof } from '../lib/gpsProof';
import { fetchAllRows } from './fetchAll';
import {
  SERVICE_TYPES,
  isLeakFound,
  type Asset,
  type Defect,
  type DefectStatus,
  type DefectWithPhotos,
  type Job,
  type JobMeta,
  type JobWithPhotos,
  type LeakInfo,
  type OpenFollowUp,
  openFollowUpsFromJobs,
  type ReminderLog,
  type RequestStatus,
  type ServiceRequest,
  type Site,
  type Slot,
} from './types';

export interface OrgSettingsInput {
  public_phone: string | null;
  public_email: string | null;
  website: string | null;
  maintenance_prices: Record<string, number>;
  reminder_mail: boolean;
  reminder_days: number;
}

export interface InstData {
  /** true = Beispieldaten ohne Server */
  readonly demo: boolean;
  sites(): Promise<Site[]>;
  site(id: string): Promise<Site | null>;
  assets(opts?: { siteId?: string }): Promise<Asset[]>;
  asset(id: string): Promise<Asset | null>;
  /** Letzte gültige Wartung/Inbetriebnahme je Anlage (asset_id → ISO-Zeitpunkt). */
  lastService(): Promise<Map<string, string>>;
  /** Letzte dokumentierte Dichtheitskontrolle je Anlage (F-Gas, measurements.leakResult nicht leer). */
  lastLeakCheck(): Promise<Map<string, LeakInfo>>;
  /** Nicht stornierte Einsätze ab einem Zeitpunkt (Kennzahl „diese Woche"). */
  jobsSince(from: Date): Promise<JobMeta[]>;
  jobs(filter: { siteId?: string; itemId?: string; limit?: number }): Promise<Job[]>;
  /** Offene Folgeeinsätze (am längsten wartende zuerst). */
  openFollowUps(): Promise<OpenFollowUp[]>;
  jobsForReport(filter: { siteId?: string; itemId?: string }): Promise<JobWithPhotos[]>;
  defects(filter: { siteId?: string; itemId?: string; status?: DefectStatus }): Promise<Defect[]>;
  defectsForReport(filter: { siteId?: string; itemId?: string }): Promise<DefectWithPhotos[]>;
  /** Wie viele Einsätze/Empfehlungen es insgesamt gibt — für den Hinweis, wenn die Akte gekappt ist (akteLimitNote.ts). */
  reportCounts(filter: { siteId?: string; itemId?: string }): Promise<{ jobs: number; defects: number }>;
  requests(filter?: { status?: RequestStatus; siteId?: string; assetId?: string }): Promise<ServiceRequest[]>;
  request(id: string): Promise<ServiceRequest | null>;
  /** Anzahl neuer Anfragen (Navigation). */
  newRequestCount(): Promise<number>;
  setRequestStatus(id: string, status: RequestStatus, note: string): Promise<void>;
  /** 1–3 Zeitfenster vorschlagen (RPC propose_slots) → Schlüssel für den Kunden-Link. */
  proposeSlots(id: string, slots: Slot[]): Promise<string>;
  /** Vom Kunden gewählte Termine ab `from`, aufsteigend (ohne erledigte/abgelehnte Anfragen). */
  appointments(from: Date): Promise<ServiceRequest[]>;
  saveOrgSettings(orgId: string, input: OrgSettingsInput): Promise<void>;
  reminders(limit: number): Promise<ReminderLog[]>;
  members(): Promise<Member[]>;
  /** CSV-Import (nur Inhaber — RLS site_insert/item_insert): neue Objekte bzw. Anlagen anlegen. */
  insertSites(rows: NewSite[]): Promise<void>;
  insertAssets(rows: NewAsset[]): Promise<void>;
}

/** Neues Objekt aus dem Import. active/is_demo/created_at kommen per DB-Default. */
export interface NewSite {
  id: string;
  org_id: string;
  name: string;
  address: string;
  operator_name: string | null;
  operator_contact: string | null;
  customer_email: string | null;
}

/** Neue Anlage aus dem Import. qr_token, retired, is_demo, created_at kommen per DB-Default. */
export interface NewAsset {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
  kind: Asset['kind'];
  manufacturer: string | null;
  model: string | null;
  serial_no: string | null;
  build_year: string | null;
  install_date: string | null;
  interval_months: number | null;
  contract: boolean;
  contract_price: number | null;
}

// Spaltenlisten OHNE Base64-Spalten (Fotos, Unterschriften) — die nur im Druck laden!
const ASSET_COLS =
  'id, org_id, site_id, name, kind, manufacturer, model, serial_no, build_year, install_date, power_kw, refrigerant, refrigerant_kg, interval_months, contract, contract_price, warranty_until, warranty_note, remote_service, fgas_hermetic, fgas_leak_detection, location, qr_token, notes, retired, retired_at, retire_reason, is_demo, created_at';

/** numeric kommt je nach Weg als Zahl oder Text — immer als Zahl (oder null) weitergeben. */
function normAsset(r: Asset): Asset {
  const p = r.contract_price as unknown;
  return { ...r, contract: r.contract === true, contract_price: p === null || p === undefined || p === '' ? null : Number(p) };
}
const JOB_COLS =
  'id, org_id, site_id, item_id, type, started_at, lat, lng, gps_accuracy_m, checklist, measurements, work_done, materials, work_minutes, recommendations, follow_up, notes, inspector_name, customer_signer_name, canceled, cancel_reason, canceled_at, created_at';
const DEFECT_COLS =
  'id, org_id, site_id, inspection_id, item_id, title, description, severity, item_blocked, status, reporter_name, resolved_at, resolver_name, resolution_note, created_at';

/** true, wenn die RPC (noch) nicht existiert — dann mit der Ersatzabfrage weiter. */
const missingRpc = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === 'PGRST202' || /could not find the function|does not exist/i.test(e.message ?? ''));

/** Höchstzahl Einsätze bzw. Empfehlungen je gedruckter Akte (die neuesten) — Hinweis: akteLimitNote.ts */
export const REPORT_JOB_LIMIT = 500;
export const REPORT_DEFECT_LIMIT = 500;

/** Höchstzahl Fotos je gedruckter Akte (wie die App: Bericht bleibt druckbar). */
export const REPORT_PHOTO_LIMIT = 80;

const STORAGE_PREFIX = 'storage:';
const SIGN_SECONDS = 3600;

export function supabaseData(sb: SupabaseClient): InstData {
  // Signierte Foto-Links je Pfad merken: Die Inbox lädt alle 30 s still neu — mit jedes Mal neuen
  // Links würde der Browser die Fotos ständig neu laden. Erneuert wird erst 10 Minuten vor Ablauf.
  const signed = new Map<string, { url: string; until: number }>();

  async function withRequestPhotos(rows: ServiceRequest[]): Promise<ServiceRequest[]> {
    const now = Date.now();
    const pathOf = (v: string | null | undefined) => (v && v.startsWith(STORAGE_PREFIX) ? v.slice(STORAGE_PREFIX.length) : null);
    const missing = [
      ...new Set(rows.map((r) => pathOf(r.photo_url)).filter((p): p is string => !!p && !((signed.get(p)?.until ?? 0) > now + 600_000))),
    ];
    for (let i = 0; i < missing.length; i += 100) {
      const { data } = await sb.storage.from('photos').createSignedUrls(missing.slice(i, i + 100), SIGN_SECONDS);
      for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, { url: s.signedUrl, until: now + SIGN_SECONDS * 1000 });
    }
    return rows.map((r) => {
      const p = pathOf(r.photo_url);
      if (p) return { ...r, photo_url: signed.get(p)?.url ?? null };
      // Nur Bild-Daten oder https durchlassen — alles andere nicht als Bildquelle verwenden.
      const ok = typeof r.photo_url === 'string' && /^(data:image\/|https:\/\/)/.test(r.photo_url);
      return ok ? r : { ...r, photo_url: null };
    });
  }

  return {
    demo: false,

    async sites() {
      // select('*'): customer_email/reminder_opt_in gibt es erst mit anfragen.sql — so fehlt nichts, wenn es noch nicht eingespielt ist.
      // Vollständig (Kennzahlen, Wartungsliste, CSV): seitenweise, stabile Sortierung mit id zuletzt.
      const { data, error } = await fetchAllRows<Site>((from, to) =>
        sb.from('site').select('*').order('active', { ascending: false }).order('name').order('id').range(from, to),
      );
      if (error) fail('Objekte konnten nicht geladen werden', error);
      return data;
    },

    async site(id) {
      const { data, error } = await sb.from('site').select('*').eq('id', id).maybeSingle();
      if (error) fail('Objekt konnte nicht geladen werden', error);
      return data as Site | null;
    },

    async assets(opts = {}) {
      // Vollständig (früher limit(5000) — der Server liefert aber höchstens 1.000 Zeilen je Abfrage)
      const { data, error } = await fetchAllRows<Asset>((from, to) => {
        let q = sb.from('asset').select(ASSET_COLS).order('retired').order('name').order('id');
        if (opts.siteId) q = q.eq('site_id', opts.siteId);
        return q.range(from, to);
      });
      if (error) fail('Anlagen konnten nicht geladen werden', error);
      return data.map(normAsset);
    },

    async asset(id) {
      const { data, error } = await sb.from('asset').select(ASSET_COLS).eq('id', id).maybeSingle();
      if (error) fail('Anlage konnte nicht geladen werden', error);
      return data ? normAsset(data as Asset) : null;
    },

    async lastService() {
      // Schnellweg: Server rechnet max(started_at) je Anlage (portal.sql). Auch RPC-Ergebnisse kappt der Server bei
      // 1.000 Zeilen (= Anlagen) → seitenweise. Fehlt die RPC, Ersatz über alle gültigen Wartungen (ebenfalls seitenweise).
      const { data, error } = await fetchAllRows<{ asset_id: string; last_service: string }>((from, to) =>
        sb.rpc('portal_last_service').order('asset_id').range(from, to),
      );
      const map = new Map<string, string>();
      if (!error) {
        for (const r of data) map.set(r.asset_id, r.last_service);
        return map;
      }
      if (!missingRpc(error)) fail('Wartungsstand konnte nicht geladen werden', error);
      const { data: rows, error: e2 } = await fetchAllRows<{ item_id: string; started_at: string }>((from, to) =>
        sb
          .from('inspection')
          .select('item_id, started_at')
          .eq('canceled', false)
          .in('type', SERVICE_TYPES)
          .order('started_at', { ascending: false })
          .order('id')
          .range(from, to),
      );
      if (e2) fail('Wartungsstand konnte nicht geladen werden', e2);
      for (const r of rows) {
        if (!map.has(r.item_id)) map.set(r.item_id, r.started_at);
      }
      return map;
    },

    async lastLeakCheck() {
      // Wie leakInfoByItem in der App bzw. asset_leak_check in fgas.sql: nicht storniert, leakResult gefüllt;
      // mit Ergebnis der letzten Kontrolle („undicht" → Nachkontrolle nach 1 Monat).
      // Server filtert vor (wenige Zeilen: nur Kältemittel-Einträge), die Leerzeichen-Prüfung macht der Client.
      // Vollständig, seitenweise (früher limit(10000) — gekappt bei 1.000).
      const { data, error } = await fetchAllRows<{ item_id: string; started_at: string; leak: string | null }>((from, to) =>
        sb
          .from('inspection')
          .select('item_id, started_at, leak:measurements->>leakResult')
          .eq('canceled', false)
          .not('measurements->>leakResult', 'is', null)
          .neq('measurements->>leakResult', '')
          .order('started_at', { ascending: false })
          .order('id')
          .range(from, to),
      );
      if (error) fail('Dichtheitskontrollen konnten nicht geladen werden', error);
      const map = new Map<string, LeakInfo>();
      for (const r of data) {
        if (!String(r.leak ?? '').trim() || map.has(r.item_id)) continue;
        map.set(r.item_id, { at: r.started_at, open: isLeakFound(r.leak) });
      }
      return map;
    },

    async openFollowUps() {
      // Schnellweg: Server rechnet (portal.sql), seitenweise wegen der 1.000-Zeilen-Grenze. Fehlt die RPC, Ersatz über
      // alle Einsätze (seitenweise; früher nur die jüngsten 5.000, gekappt bei 1.000).
      const { data, error } = await fetchAllRows<OpenFollowUp>((from, to) =>
        sb.rpc('portal_open_follow_ups').order('started_at').order('inspection_id').range(from, to),
      );
      if (!error) return data;
      if (!missingRpc(error)) fail('Folgeeinsätze konnten nicht geladen werden', error);
      const { data: rows, error: e2 } = await fetchAllRows<Parameters<typeof openFollowUpsFromJobs>[0][number]>((from, to) =>
        sb
          .from('inspection')
          .select('id, site_id, item_id, started_at, created_at, canceled, follow_up, inspector_name')
          .order('started_at', { ascending: false })
          .order('id')
          .range(from, to),
      );
      if (e2) {
        // Datenbank ohne folgeeinsatz.sql: keine Folgeeinsätze statt Fehlerseite
        if (/follow_up/.test(e2.message ?? '')) return [];
        fail('Folgeeinsätze konnten nicht geladen werden', e2);
      }
      return openFollowUpsFromJobs(rows);
    },

    async jobsSince(from) {
      // Kennzahl „diese Woche": vollständig zählen (seitenweise)
      const { data, error } = await fetchAllRows<JobMeta>((a, b) =>
        sb
          .from('inspection')
          .select('id, site_id, item_id, type, started_at, inspector_name')
          .eq('canceled', false)
          .gte('started_at', from.toISOString())
          .order('started_at', { ascending: false })
          .order('id')
          .range(a, b),
      );
      if (error) fail('Einsätze konnten nicht geladen werden', error);
      return data;
    },

    async jobs(filter) {
      let q = sb.from('inspection').select(JOB_COLS).order('started_at', { ascending: false }).limit(filter.limit ?? 300);
      if (filter.siteId) q = q.eq('site_id', filter.siteId);
      if (filter.itemId) q = q.eq('item_id', filter.itemId);
      const { data, error } = await q;
      if (error) fail('Einsätze konnten nicht geladen werden', error);
      return (data ?? []) as unknown as Job[];
    },

    async jobsForReport(filter) {
      let q = sb
        .from('inspection')
        .select(`${JOB_COLS}, photo_urls, signature, customer_signature`)
        // die NEUESTEN Einsätze (früher aufsteigend → es kamen die ältesten 500); Hinweis im Druck: akteLimitNote.ts
        .order('started_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(REPORT_JOB_LIMIT);
      if (filter.siteId) q = q.eq('site_id', filter.siteId);
      if (filter.itemId) q = q.eq('item_id', filter.itemId);
      const { data, error } = await q;
      if (error) fail('Daten für die Akte konnten nicht geladen werden', error);
      // capPhotos erwartet aufsteigende Reihenfolge (behält die Fotos der jüngsten Einsätze)
      const rows = capPhotos(((data ?? []) as unknown as JobWithPhotos[]).reverse());
      return (await withGpsProof(sb, 'inspection', await signPhotos(sb, rows))) as JobWithPhotos[];
    },

    async defects(filter) {
      // Vollständig: offene Empfehlungen zählen auf Start/Kunden (früher die neuesten 500)
      const { data, error } = await fetchAllRows<Defect>((from, to) => {
        let q = sb.from('defect').select(DEFECT_COLS).order('created_at', { ascending: false }).order('id');
        if (filter.siteId) q = q.eq('site_id', filter.siteId);
        if (filter.itemId) q = q.eq('item_id', filter.itemId);
        if (filter.status) q = q.eq('status', filter.status);
        return q.range(from, to);
      });
      if (error) fail('Empfehlungen konnten nicht geladen werden', error);
      return data;
    },

    async defectsForReport(filter) {
      let q = sb
        .from('defect')
        .select(`${DEFECT_COLS}, photo_urls, resolution_photo_urls`)
        // die NEUESTEN Empfehlungen (früher die ältesten 500), danach wieder aufsteigend
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(REPORT_DEFECT_LIMIT);
      if (filter.siteId) q = q.eq('site_id', filter.siteId);
      if (filter.itemId) q = q.eq('item_id', filter.itemId);
      const { data, error } = await q;
      if (error) fail('Empfehlungen für die Akte konnten nicht geladen werden', error);
      return (await signPhotos(sb, ((data ?? []) as DefectWithPhotos[]).reverse())) as DefectWithPhotos[];
    },

    async reportCounts(filter) {
      // nur zählen (head), keine Zeilen laden
      const count = async (table: 'inspection' | 'defect') => {
        let q = sb.from(table).select('id', { count: 'exact', head: true });
        if (filter.siteId) q = q.eq('site_id', filter.siteId);
        if (filter.itemId) q = q.eq('item_id', filter.itemId);
        const { count: n, error } = await q;
        if (error) fail('Akte konnte nicht gezählt werden', error);
        return n ?? 0;
      };
      const [jobs, defects] = await Promise.all([count('inspection'), count('defect')]);
      return { jobs, defects };
    },

    async requests(filter = {}) {
      let q = sb.from('service_request').select('*').order('created_at', { ascending: false }).limit(500);
      if (filter.status) q = q.eq('status', filter.status);
      if (filter.siteId) q = q.eq('site_id', filter.siteId);
      if (filter.assetId) q = q.eq('asset_id', filter.assetId);
      const { data, error } = await q;
      if (error) fail('Anfragen konnten nicht geladen werden', error);
      return withRequestPhotos((data ?? []) as ServiceRequest[]);
    },

    async request(id) {
      const { data, error } = await sb.from('service_request').select('*').eq('id', id).maybeSingle();
      if (error) fail('Anfrage konnte nicht geladen werden', error);
      return data ? (await withRequestPhotos([data as ServiceRequest]))[0] : null;
    },

    async newRequestCount() {
      const { count, error } = await sb
        .from('service_request')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new');
      if (error) return 0; // Anzeige in der Navigation ist Komfort — nie blockieren
      return count ?? 0;
    },

    async setRequestStatus(id, status, note) {
      const { error } = await sb.rpc('set_request_status', { p_id: id, p_status: status, p_note: note });
      if (error) fail('Anfrage konnte nicht gespeichert werden', error);
    },

    async proposeSlots(id, slots) {
      const { data, error } = await sb.rpc('propose_slots', { p_id: id, p_slots: slots });
      if (error) fail('Termine konnten nicht vorgeschlagen werden', error);
      if (typeof data !== 'string' || !/^[0-9a-f]{32}$/.test(data)) throw new Error('Termine konnten nicht vorgeschlagen werden: kein Schlüssel');
      return data;
    },

    async appointments(from) {
      const { data, error } = await sb
        .from('service_request')
        .select('*')
        .gte('scheduled_at', from.toISOString())
        .not('status', 'in', '(done,dismissed)')
        .order('scheduled_at', { ascending: true })
        .limit(50);
      if (error) fail('Termine konnten nicht geladen werden', error);
      return withRequestPhotos((data ?? []) as ServiceRequest[]);
    },

    async saveOrgSettings(orgId, input) {
      // org_update-Policy: nur Inhaber. plan/extra_seats schützt der Trigger org_protect_plan.
      const { error } = await sb.from('org').update(input).eq('id', orgId);
      if (error) fail('Einstellungen konnten nicht gespeichert werden', error);
    },

    async reminders(limit) {
      const { data, error } = await sb
        .from('maintenance_reminder')
        .select('id, asset_id, site_id, due_date, email, sent_at')
        .order('sent_at', { ascending: false })
        .limit(limit);
      if (error) return []; // Tabelle fehlt (anfragen.sql noch nicht eingespielt) → einfach leer
      return (data ?? []) as ReminderLog[];
    },

    members() {
      return fetchMembers(sb);
    },

    async insertSites(rows) {
      if (!rows.length) return;
      const { error } = await sb.from('site').insert(rows);
      if (error) fail('Objekte konnten nicht angelegt werden', error);
    },

    async insertAssets(rows) {
      if (!rows.length) return;
      const { error } = await sb.from('asset').insert(rows);
      if (error) fail('Anlagen konnten nicht angelegt werden', error);
    },
  };
}

/** Fotos über alle Einsätze hinweg begrenzen (jüngste Einsätze zuerst) — der Bericht bleibt druckbar. */
function capPhotos(rows: JobWithPhotos[]): JobWithPhotos[] {
  let left = REPORT_PHOTO_LIMIT;
  const out = [...rows];
  for (let i = out.length - 1; i >= 0; i--) {
    const photos = Array.isArray(out[i].photo_urls) ? out[i].photo_urls : [];
    const keep = photos.slice(0, Math.max(0, left));
    left -= keep.length;
    out[i] = { ...out[i], photo_urls: keep };
  }
  return out;
}
