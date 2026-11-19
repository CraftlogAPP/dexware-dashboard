// Datenzugriff von „Vor Ort“ (KfzDex) hinter einer Schnittstelle — Supabase (echter Betrieb) oder Beispieldaten
// (demo.tsx, nur Dev-Server). Geschrieben wird wie in der App (src/lib/queries.ts): erst der Nachweis mit fester ID,
// dann wird die Frist am Fahrzeug bzw. Fahrer nur VORGEZOGEN, nie zurückgesetzt.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isNetworkError } from '../../pruefen/backend';
import { fetchOrgPro } from '../../pruefen/pro';
import { fetchDrivers, fetchVehicles } from '../api';
import type { Driver, Vehicle } from '../types';
import type { LicenseRow, UvvRow } from './rows';

export interface Fleet {
  vehicles: Vehicle[];
  drivers: Driver[];
}

export interface DueBump {
  table: 'vehicle' | 'driver';
  col: 'last_uvv' | 'last_check';
  id: string;
  date: string;
}

export interface KfzBackend {
  loadFleet(): Promise<Fleet>;
  /** Nachweis anlegen; „ID gibt es schon“ (Wiederholung nach Abbruch) zählt als Erfolg. */
  insertProof(kind: 'uvv' | 'license', row: UvvRow | LicenseRow): Promise<void>;
  /** Frist nur vorziehen: schreibt nur, wenn am Server noch kein oder ein älteres Datum steht. */
  bumpDue(b: DueBump): Promise<void>;
  /** Pro des Betriebs laut Server. Im Zweifel true — nie zu Unrecht sperren. */
  isPro(): Promise<boolean>;
}

type DbError = { code?: string; message?: string };

function withTimeout<T>(p: PromiseLike<T>, ms = 20000): Promise<T> {
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

const TABLE = { uvv: 'uvv_inspection', license: 'license_check' } as const;

export function supabaseKfzBackend(sb: SupabaseClient): KfzBackend {
  return {
    async loadFleet() {
      const [vehicles, drivers] = await Promise.all([fetchVehicles(sb), fetchDrivers(sb)]);
      return { vehicles, drivers };
    },

    async insertProof(kind, row) {
      const { error } = (await withTimeout(sb.from(TABLE[kind]).insert(row as unknown as Record<string, unknown>))) as { error: DbError | null };
      if (error && error.code !== '23505') throw error; // 23505 = ID schon vorhanden (Wiederholung)
    },

    async bumpDue(b) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new Error(`Ungültiges Datum: ${b.date}`);
      // Trifft das Update 0 Zeilen (Server ist schon weiter oder der Datensatz ist gelöscht), gilt das als erledigt.
      const { error } = (await withTimeout(
        sb
          .from(b.table)
          .update({ [b.col]: b.date, updated_at: new Date().toISOString() })
          .eq('id', b.id)
          .or(`${b.col}.is.null,${b.col}.lt.${b.date}`),
      )) as { error: DbError | null };
      if (error) throw error;
    },

    isPro: () => fetchOrgPro(sb, true),
  };
}

// --- Fuhrpark laden; der letzte Stand wird je Konto gemerkt (Tiefgarage, Halle: Erfassen geht auch ohne Netz) ---

const cacheKey = (userId: string) => `dexware-kfzdex-vorort:${userId}`;

export interface FleetState extends Fleet {
  /** true = ohne Netz aus dem Gerätespeicher geladen (Stand vom letzten Laden) */
  offline: boolean;
}

export async function loadFleet(be: KfzBackend, userId: string): Promise<FleetState> {
  try {
    const fleet = await be.loadFleet();
    try {
      localStorage.setItem(cacheKey(userId), JSON.stringify(fleet));
    } catch {
      /* nur Komfort */
    }
    return { ...fleet, offline: false };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    let cached: Fleet | null = null;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey(userId)) ?? 'null') as Fleet | null;
    } catch {
      cached = null;
    }
    if (!cached?.vehicles || !cached.drivers) throw new Error('Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.');
    return { vehicles: cached.vehicles, drivers: cached.drivers, offline: true };
  }
}

// --- Gratis-Grenze wie in der App: 1 Fahrzeug, 2 Fahrer (gezählt wird alles, auch inaktive Fahrer) ----------------

export interface FleetGate {
  allowed: boolean;
  count: number;
  limit: number;
}

/**
 * Darf ein weiteres Fahrzeug bzw. ein weiterer Fahrer angelegt werden? Lässt sich die Zahl nicht ermitteln oder
 * antwortet der Server zur Pro-Frage nicht eindeutig, wird nicht gesperrt.
 */
export async function fleetGate(sb: SupabaseClient, table: 'vehicle' | 'driver', limit: number): Promise<FleetGate> {
  const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true });
  if (error || count === null) return { allowed: true, count: 0, limit };
  if (count < limit) return { allowed: true, count, limit };
  return { allowed: await fetchOrgPro(sb, true), count, limit };
}

export const GATE_TEXT = {
  vehicle:
    'Kostenlos ist 1 Fahrzeug drin. Mit KfzDex Pro ist dein ganzer Fuhrpark dabei — ein Preis für den ganzen Betrieb. Pro schließt du in der KfzDex-App unter „Abo“ ab. Fragen dazu? Schreib uns an support@dexware.app.',
  driver:
    'Kostenlos sind bis zu 2 Fahrer drin. Mit KfzDex Pro ist dein ganzes Team dabei — ein Preis für den ganzen Betrieb. Pro schließt du in der KfzDex-App unter „Abo“ ab. Fragen dazu? Schreib uns an support@dexware.app.',
} as const;
