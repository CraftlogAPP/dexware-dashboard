// Einsatz erfassen im Browser (Übergang fürs iPhone, 19.11.2026): Datenzugriff hinter einer
// Schnittstelle — Supabase (echter Betrieb) oder Beispieldaten (demo.ts, nur Dev-Server).
// Geschrieben wird EXAKT wie in der Android-App (mobile/src/data/supabaseRepository.ts → pushOperation):
// gleiche Spalten, gleiche Foto-Pfade <org>/<einsatz>/<n>.jpg im privaten Bucket „photos“.
// Abstand zum Objekt, Server-Eingang und Prüfcode ergänzt der Server selbst (Trigger operation_seal).

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllOf } from '../../lib/completeQueries';
import { fetchRoute, fetchRoutes, fetchRuns } from '../routes';
import type { OperationAction, Property, WeatherSnapshot } from '../types';
import type { LatLng, Route, RunMeta, Track } from '../routes';

export interface TodayOp {
  id: string;
  property_id: string;
  started_at: string;
  canceled: boolean;
}

/** Einsatz-Zeile ohne Fotos — so, wie sie in die Tabelle operation geht. */
export interface OperationRow {
  id: string;
  org_id: string;
  property_id: string;
  started_at: string;
  ended_at: string | null;
  lat: number | null;
  lng: number | null;
  gps_accuracy_m: number | null;
  gps_at: string | null;
  gps_mocked: boolean | null;
  end_lat: number | null;
  end_lng: number | null;
  end_accuracy_m: number | null;
  end_gps_at: string | null;
  end_mocked: boolean | null;
  action: OperationAction;
  grit_material: string | null;
  grit_amount: string | null;
  weather: WeatherSnapshot | null;
  notes: string | null;
  performed_by: string;
  performer_name: string | null;
  created_at: string;
}

export interface WeatherResult {
  weather: WeatherSnapshot | null;
  /** Server nicht erreicht (Funkloch, Zeitüberschreitung) — ein späterer Versuch kann klappen. */
  netError: boolean;
}

/** Strecke (Vorlage) — die 8 Felder, die auch die App sendet; Länge, Ersteller und Datum setzt der Server. */
export interface RouteRow {
  id: string;
  org_id: string;
  name: string;
  notes: string | null;
  path: LatLng[];
  source: 'recorded' | 'objects';
  property_ids: string[];
  active: boolean;
}

/** Fahrt ohne Fotos — so, wie sie in die Tabelle route_run geht (Abdeckung, Länge, Prüfcode rechnet der Server). */
export interface RunRow {
  id: string;
  org_id: string;
  route_id: string | null;
  started_at: string;
  ended_at: string;
  track: Track;
  gaps: [string, string][];
  gps_mocked: true | null;
  action: OperationAction;
  grit_material: string | null;
  grit_amount: string | null;
  weather: WeatherSnapshot | null;
  notes: string | null;
  performed_by: string;
  performer_name: string | null;
  created_at: string;
}

export interface EinsatzBackend {
  /** Strecken des Betriebs (ohne Linie). Wirft RoutesMissingError, wenn die Datenbank sie noch nicht kennt. */
  listRoutes(): Promise<Route[]>;
  /** Eine Strecke mit Linie. */
  getRoute(id: string): Promise<Route | null>;
  /** Strecke anlegen/ändern (nur Inhaber) — Upsert wie die App. */
  saveRoute(row: RouteRow): Promise<void>;
  /** Fahrten seit lokaler Mitternacht (für „heute gefahren“). */
  listTodayRuns(): Promise<RunMeta[]>;
  /** Jüngste Fahrten einer Strecke. */
  listRouteRuns(routeId: string, limit: number): Promise<RunMeta[]>;
  /** Fahrt anlegen; „ID gibt es schon“ (Wiederholung) zählt als Erfolg. */
  insertRun(row: RunRow, photoUrls: string[]): Promise<void>;
  /** Pro des Betriebs laut Server (Abo, Team, Kommunal-Lizenz, Suite). Im Zweifel true — nie zu Unrecht sperren. */
  isPro(): Promise<boolean>;
  listProperties(): Promise<Property[]>;
  /** Einsätze seit lokaler Mitternacht (für „heute erledigt“). */
  listTodayOps(): Promise<TodayOp[]>;
  /** Foto hochladen; „gibt es schon“ (Wiederholung nach Abbruch) zählt als Erfolg. */
  uploadPhoto(path: string, blob: Blob): Promise<void>;
  /** Einsatz anlegen; „ID gibt es schon“ (Wiederholung) zählt als Erfolg. */
  insertOperation(row: OperationRow, photoUrls: string[]): Promise<void>;
  weather(lat: number, lng: number, timeoutMs?: number): Promise<WeatherResult>;
}

export const PHOTO_BUCKET = 'photos';
export const STORAGE_PREFIX = 'storage:';

const GPS_PROOF_COLS = ['gps_at', 'gps_mocked', 'end_lat', 'end_lng', 'end_accuracy_m', 'end_gps_at', 'end_mocked'] as const;

const missingColumn = (e: { code?: string; message?: string }) =>
  e.code === '42703' || e.code === 'PGRST204' || /does not exist|could not find/i.test(e.message ?? '');

/** Netz weg / Zeitüberschreitung? Dann bleibt der Einsatz auf dem Gerät und wird später gesendet. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const err = e as { name?: string; message?: string; originalError?: unknown } | null;
  if (err?.name === 'StorageUnknownError' || err?.name === 'AbortError') return true;
  const m = String(err?.message ?? e ?? '');
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|timeout|zeitüberschreitung|aborted|offline/i.test(m);
}

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout (Zeitüberschreitung)')), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Wetter-Snapshot vom winterdex-backend (Cloudflare Worker → Open-Meteo), wie die App. */
export async function requestWeather(
  cfg: { url: string; token: string } | undefined,
  lat: number,
  lng: number,
  timeoutMs = 12000,
): Promise<WeatherResult> {
  if (!cfg?.url || !cfg.token) return { weather: null, netError: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(`${cfg.url.replace(/\/+$/, '')}/weather/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ lat, lng }),
        signal: controller.signal,
      });
    } catch {
      return { weather: null, netError: true };
    }
    if (!res.ok) return { weather: null, netError: res.status >= 500 || res.status === 429 };
    const data = (await res.json().catch(() => null)) as { weather?: WeatherSnapshot } | null;
    return { weather: data?.weather ?? null, netError: false };
  } finally {
    clearTimeout(timer);
  }
}

export function supabaseBackend(
  sb: SupabaseClient,
  weatherCfg: { url: string; token: string } | undefined,
): EinsatzBackend {
  return {
    async listProperties() {
      const { data, error } = await fetchAllOf(() => sb.from('property').select('*'), [['name']]);
      if (error) throw error;
      return (data ?? []) as Property[];
    },

    async listTodayOps() {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const { data, error } = await fetchAllOf(
        () =>
          sb
            .from('operation')
            .select('id, property_id, started_at, canceled')
            .gte('started_at', midnight.toISOString()),
        [['started_at']],
      );
      if (error) throw error;
      return (data ?? []) as unknown as TodayOp[];
    },

    async uploadPhoto(path, blob) {
      const { error } = await withTimeout(
        sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false }),
        60000,
      );
      if (error && !/exists|duplicate/i.test(error.message ?? '')) throw error;
    },

    async insertOperation(row, photoUrls) {
      const full: Record<string, unknown> = { ...row, photo_urls: photoUrls };
      let { error } = await withTimeout(sb.from('operation').insert(full), 30000);
      // Datenbank noch ohne GPS-Prüfnachweis-Spalten: ohne sie speichern (Nachweis nie blockieren) — wie die App.
      if (error && missingColumn(error)) {
        for (const k of GPS_PROOF_COLS) delete full[k];
        ({ error } = await withTimeout(sb.from('operation').insert(full), 30000));
      }
      if (error && error.code !== '23505') throw error; // 23505 = ID schon vorhanden (Wiederholung)
    },

    weather: (lat, lng, timeoutMs) => requestWeather(weatherCfg, lat, lng, timeoutMs),

    listRoutes: () => fetchRoutes(sb),
    getRoute: (id) => fetchRoute(sb, id),

    async saveRoute(row) {
      const { error } = await withTimeout(sb.from('route').upsert(row), 20000);
      if (error) throw error;
    },

    async listTodayRuns() {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      return fetchRuns(sb, { from: midnight, all: true });
    },

    listRouteRuns: (routeId, limit) => fetchRuns(sb, { routeId, limit }),

    async insertRun(row, photoUrls) {
      const { error } = await withTimeout(sb.from('route_run').insert({ ...row, photo_urls: photoUrls }), 30000);
      if (error && error.code !== '23505') throw error; // 23505 = ID schon vorhanden (Wiederholung)
    },

    async isPro() {
      try {
        const { data, error } = await withTimeout(sb.rpc('org_pro_active'), 10000);
        if (error || data === null || data === undefined) return true;
        return data === true;
      } catch {
        return true;
      }
    },
  };
}
