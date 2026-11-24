import type { SupabaseClient } from '@supabase/supabase-js';
import { signPhotos } from '../lib/photos';
import { fetchAllOf, fetchLatestWindow } from '../lib/completeQueries';
import { readableDbError } from '../lib/orgApi';
import type { DutyTimes, Operation, OperationWithPhotos, Property } from './types';

// Spaltenliste für Einsätze OHNE photo_urls (Base64-Fotos, nur im Detail laden!)
const OPERATION_COLS =
  'id, org_id, property_id, started_at, ended_at, lat, lng, gps_accuracy_m, action, grit_material, grit_amount, weather, notes, performed_by, performer_name, canceled, cancel_reason, canceled_at, created_at';

// GPS-Prüfnachweis-Spalten (gps-pruefnachweis.sql). Einmal je Sitzung prüfen, ob die
// Datenbank sie schon hat — sonst wie bisher ohne sie laden.
const GPS_PROOF_COLS =
  'gps_at, gps_mocked, end_lat, end_lng, end_accuracy_m, end_gps_at, end_mocked, distance_m, end_distance_m, received_at, entry_hash';
let gpsProof: boolean | null = null;
// Kennzeichen „nachgetragen“ vom Server (NACHTRAG-PRUEFUNG-2026-11-21.sql: kein GPS-Beginn und Eingang mehr als 15 Min.
// nach dem Ende). Nur mitladen, wenn die Datenbank die Spalte schon hat — sonst schlüge jede Abfrage fehl.
let nachtragCol: boolean | null = null;
async function opCols(sb: SupabaseClient): Promise<string> {
  const [proof, nachtrag] = await Promise.all([
    gpsProof === null ? columnExists(sb, 'operation', 'entry_hash') : gpsProof,
    nachtragCol === null ? columnExists(sb, 'operation', 'nachgetragen') : nachtragCol,
  ]);
  if (gpsProof === null) gpsProof = proof !== false; // wie bisher: nur „Spalte fehlt“ schaltet ab
  nachtragCol = nachtrag; // unklar (Netz) → diesmal ohne, beim nächsten Mal erneut fragen
  return `${gpsProof ? `${OPERATION_COLS}, ${GPS_PROOF_COLS}` : OPERATION_COLS}${nachtrag ? ', nachgetragen' : ''}`;
}

/** Hat die Datenbank diese Spalte? null = unklar (z. B. kein Netz). */
export async function columnExists(sb: SupabaseClient, table: string, column: string): Promise<boolean | null> {
  const { error } = await sb.from(table).select(column).limit(1);
  if (!error) return true;
  if (error.code === '42703' || error.code === 'PGRST204' || /does not exist|could not find/i.test(error.message)) return false;
  return null;
}

// Verständlich auf Deutsch (z. B. „dafür fehlt dir die Berechtigung“ statt „row-level security policy“)
function fail(msg: string, error: { message: string; code?: string } | null): never {
  throw new Error(`${msg}${error ? `: ${readableDbError(error)}` : ''}`);
}

/** Einzelnes Objekt per Primärschlüssel — statt alle zu laden und zu filtern. */
export async function fetchProperty(
  sb: SupabaseClient,
  id: string,
): Promise<Property | null> {
  const { data, error } = await sb
    .from('property')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) fail('Objekt konnte nicht geladen werden', error);
  return data as Property | null;
}

export async function fetchProperties(sb: SupabaseClient): Promise<Property[]> {
  const { data, error } = await fetchAllOf(() => sb.from('property').select('*'), [['active', false], ['name']]);
  if (error) fail('Objekte konnten nicht geladen werden', error);
  return (data ?? []) as Property[];
}

export interface OperationFilter {
  propertyId?: string;
  /** inklusive, lokale Tagesgrenze */
  from?: Date;
  /** inklusive, lokale Tagesgrenze */
  to?: Date;
  limit?: number;
}

export async function fetchOperations(
  sb: SupabaseClient,
  filter: OperationFilter = {},
): Promise<Operation[]> {
  let q = sb
    .from('operation')
    .select(await opCols(sb))
    .order('started_at', { ascending: false })
    .limit(filter.limit ?? 500);
  if (filter.propertyId) q = q.eq('property_id', filter.propertyId);
  if (filter.from) q = q.gte('started_at', filter.from.toISOString());
  if (filter.to) {
    const end = new Date(filter.to);
    end.setHours(23, 59, 59, 999);
    q = q.lte('started_at', end.toISOString());
  }
  const { data, error } = await q;
  if (error) fail('Einsätze konnten nicht geladen werden', error);
  return (data ?? []) as unknown as Operation[];
}

/** Alle Einsätze im Zeitraum, vollständig (seitenweise, ohne 500er-Grenze) und chronologisch — für die Excel-Liste. */
export async function fetchOperationsAll(
  sb: SupabaseClient,
  filter: { propertyId?: string; from: Date; to: Date },
): Promise<Operation[]> {
  const cols = await opCols(sb);
  const end = new Date(filter.to);
  end.setHours(23, 59, 59, 999);
  const { data, error } = await fetchAllOf<Operation>(() => {
    let q = sb.from('operation').select(cols).gte('started_at', filter.from.toISOString()).lte('started_at', end.toISOString());
    if (filter.propertyId) q = q.eq('property_id', filter.propertyId);
    return q;
  }, [['started_at'], ['id']]);
  if (error) fail('Einsätze konnten nicht geladen werden', error);
  return data;
}

/** Minimale Einsatz-Metadaten für KPIs/„letzter Einsatz"-Logik (schmale Spalten, hohes Limit). */
export interface OpMeta {
  id: string;
  property_id: string;
  started_at: string;
  canceled: boolean;
}

export async function fetchOperationMeta(sb: SupabaseClient): Promise<OpMeta[]> {
  // Vollständig: alle Einsätze der letzten 31 Tage (Kennzahlen 24 h / 7 Tage) + je Objekt ohne Einsatz
  // darin der jüngste ältere („letzter Einsatz“) — wie mit kompletter Historie.
  const { data, error } = await fetchLatestWindow<OpMeta>({
    sb,
    table: 'operation',
    cols: 'id, property_id, started_at, canceled',
    dateCol: 'started_at',
    unitCol: 'property_id',
    units: { table: 'property' },
    windowDays: 31,
    canceled: true,
  });
  if (error) fail('Einsatz-Daten konnten nicht geladen werden', error);
  return data;
}

/** Einzelner Einsatz inkl. Beweisfotos (Base64-Daten-URIs). */
export async function fetchOperationWithPhotos(
  sb: SupabaseClient,
  id: string,
): Promise<OperationWithPhotos> {
  const { data, error } = await sb
    .from('operation')
    .select(`${await opCols(sb)}, photo_urls`)
    .eq('id', id)
    .single();
  if (error) fail('Einsatz konnte nicht geladen werden', error);
  return (await signPhotos(sb, withPhotoTotal(data))) as unknown as OperationWithPhotos;
}

// ── Schreiben (Format identisch zur Mobile-App, supabaseRepository.ts) ──────

export interface PropertyInput {
  name: string;
  address: string;
  customer_name: string | null;
  customer_contact: string | null;
  areas: string | null;
  duty_times: DutyTimes;
  notes: string | null;
  active: boolean;
}

/** Zeile der Tabelle property — EINE Stelle für Formular und Import (Format wie app-seitiges saveProperty). */
export function propertyRow(
  orgId: string,
  input: PropertyInput,
  existing?: Property,
  location?: { lat: number; lng: number } | null,
): Property {
  return {
    id: existing?.id ?? crypto.randomUUID(),
    org_id: orgId,
    name: input.name,
    address: input.address,
    lat: location?.lat ?? existing?.lat ?? null,
    lng: location?.lng ?? existing?.lng ?? null,
    customer_name: input.customer_name,
    customer_contact: input.customer_contact,
    areas: input.areas,
    duty_times: input.duty_times,
    notes: input.notes,
    active: input.active,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
}

/** Objekt anlegen/ändern — Upsert wie app-seitiges saveProperty. */
export async function saveProperty(
  sb: SupabaseClient,
  orgId: string,
  input: PropertyInput,
  existing?: Property,
  /** neuer Standort (z. B. „Hier stehe ich“) — sonst bleibt der bisherige */
  location?: { lat: number; lng: number },
): Promise<void> {
  const { error } = await sb.from('property').upsert(propertyRow(orgId, input, existing, location));
  if (error) fail('Objekt konnte nicht gespeichert werden', error);
}

/**
 * Mehrere neue Objekte auf einmal anlegen (Import). Nur insert — vorhandene Objekte werden nie überschrieben.
 * Eine schon vorhandene id (Paket war angekommen, nur die Antwort ging verloren) zählt als angelegt.
 */
export async function insertProperties(sb: SupabaseClient, rows: Property[]): Promise<void> {
  const { error } = await sb.from('property').insert(rows);
  if (error && !(rows.length === 1 && error.code === '23505')) fail('Objekte konnten nicht angelegt werden', error);
}

/** Wie die App „Hier stehe ich“: Standort eines Objekts setzen (nur Inhaber — Server-Regel). */
export async function savePropertyLocation(sb: SupabaseClient, p: Property, lat: number, lng: number): Promise<void> {
  await saveProperty(
    sb,
    p.org_id,
    {
      name: p.name,
      address: p.address,
      customer_name: p.customer_name,
      customer_contact: p.customer_contact,
      areas: p.areas,
      duty_times: p.duty_times ?? {},
      notes: p.notes,
      active: p.active,
    },
    p,
    { lat, lng },
  );
}

export interface OperationInput {
  property_id: string;
  started_at: string;
  ended_at: string | null;
  action: Operation['action'];
  grit_material: string | null;
  grit_amount: string | null;
  notes: string | null;
  performer_name: string | null;
}

/** Einsatz nachtragen (append-only, wie app-seitiges addOperation — ohne GPS/Fotos). */
export async function addOperation(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  input: OperationInput,
): Promise<void> {
  const { error } = await sb.from('operation').insert({
    id: crypto.randomUUID(),
    org_id: orgId,
    property_id: input.property_id,
    started_at: input.started_at,
    ended_at: input.ended_at,
    lat: null,
    lng: null,
    gps_accuracy_m: null,
    action: input.action,
    grit_material: input.grit_material,
    grit_amount: input.grit_amount,
    photo_urls: [],
    weather: null,
    notes: input.notes,
    performed_by: userId,
    performer_name: input.performer_name,
    created_at: new Date().toISOString(),
  });
  if (error) fail('Einsatz konnte nicht gespeichert werden', error);
}

/** Einsatz stornieren — bleibt sichtbar, wird nur gekennzeichnet (RPC wie die App). */
export async function cancelOperation(
  sb: SupabaseClient,
  id: string,
  reason: string,
): Promise<void> {
  const { error } = await sb.rpc('cancel_operation', {
    p_operation: id,
    p_reason: reason,
  });
  if (error) fail('Einsatz konnte nicht storniert werden', error);
}

/** Einsätze eines Objekts im Zeitraum inkl. Fotos — nur für den PDF-Bericht. */
export async function fetchOperationsForReport(
  sb: SupabaseClient,
  propertyId: string,
  from: Date,
  to: Date,
): Promise<OperationWithPhotos[]> {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  const cols = `${await opCols(sb)}, photo_urls`;
  // Vollständig (auch über 1.000 Einsätze im Zeitraum).
  const { data, error } = await fetchAllOf(
    () =>
      sb
        .from('operation')
        .select(cols)
        .eq('property_id', propertyId)
        .gte('started_at', from.toISOString())
        .lte('started_at', end.toISOString()),
    [['started_at']],
  );
  if (error) fail('Berichtsdaten konnten nicht geladen werden', error);
  return (await signPhotos(sb, (data ?? []).map(withPhotoTotal))) as unknown as OperationWithPhotos[];
}

/** Gespeicherte Fotozahl merken, bevor nicht signierbare Pfade beim Signieren wegfallen (Bericht nennt die echte Zahl). */
function withPhotoTotal<T>(row: T): T {
  const r = row as Record<string, unknown>;
  return { ...r, photo_total: Array.isArray(r.photo_urls) ? r.photo_urls.length : 0 } as T;
}

