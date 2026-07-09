import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type {
  GeoPoint,
  PlaceType,
  SavedPlace,
  TripCategory,
  TripData,
  TripSummary,
  Vehicle,
} from './types';

/**
 * ID-Erzeugung exakt wie mobile utils/id.ts (`uid`) — der App-Merge läuft über
 * die item_id, daher müssen nachgetragene Einträge dieselbe ID-Form tragen.
 */
function uid(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${time}${rand}`;
}

// Alles liegt in EINER Tabelle sync_items (RLS: jeder sieht nur die eigenen
// Zeilen). Fahrten-Listen selektieren NUR skalare Felder aus dem data-jsonb —
// der volle Blob enthält den GPS-Pfad (path), der groß werden kann.
const TRIP_COLS = [
  'id:item_id',
  'updated_at',
  'vehicle_id:data->>vehicleId',
  'start_time:data->>startTime',
  'end_time:data->>endTime',
  'start_address:data->start->>address',
  'end_address:data->end->>address',
  'distance_km:data->distanceKm',
  'category:data->>category',
  'purpose:data->>purpose',
  'confirmed:data->confirmed',
  'manual:data->manual',
].join(', ');

export async function fetchTripSummaries(sb: SupabaseClient): Promise<TripSummary[]> {
  const { data, error } = await sb
    .from('sync_items')
    .select(TRIP_COLS)
    .eq('collection', 'trips')
    .eq('deleted', false)
    .order('data->>startTime', { ascending: false });
  if (error) fail('Fahrten konnten nicht geladen werden', error);
  return (data ?? []) as unknown as TripSummary[];
}

/**
 * Fahrten eines Fahrzeugs im Zeitraum, älteste zuerst (Fahrtenbuch-Reihenfolge).
 * startTime ist ISO-8601 — der lexikografische Text-Vergleich entspricht der
 * Zeit-Reihenfolge, daher reicht gte/lt auf data->>startTime.
 */
export async function fetchTripsForReport(
  sb: SupabaseClient,
  vehicleId: string,
  from: Date,
  toExclusive: Date,
): Promise<TripSummary[]> {
  const { data, error } = await sb
    .from('sync_items')
    .select(TRIP_COLS)
    .eq('collection', 'trips')
    .eq('deleted', false)
    .eq('data->>vehicleId', vehicleId)
    .gte('data->>startTime', from.toISOString())
    .lt('data->>startTime', toExclusive.toISOString())
    .order('data->>startTime', { ascending: true });
  if (error) fail('Fahrten konnten nicht geladen werden', error);
  return (data ?? []) as unknown as TripSummary[];
}

/** Volle Fahrt inkl. GPS-Pfad und KI-Vorschlag — nur im Detail. */
export async function fetchTrip(
  sb: SupabaseClient,
  id: string,
): Promise<TripData | null> {
  const { data, error } = await sb
    .from('sync_items')
    .select('item_id, deleted, data')
    .eq('collection', 'trips')
    .eq('item_id', id)
    .maybeSingle();
  if (error) fail('Fahrt konnte nicht geladen werden', error);
  if (!data || data.deleted) return null;
  return data.data as TripData;
}

// ── Schreiben (Sync-Format wie mobile services/sync.ts) ─────────────────────
// Read-Modify-Write auf dem data-Blob: nur die editierbaren Felder werden
// ersetzt, GPS-Pfad & Co. bleiben erhalten. updated_at wird hochgesetzt, damit
// der App-Merge („remote wins beim Pull") die Änderung übernimmt.

async function patchSyncItem(
  sb: SupabaseClient,
  collection: 'trips' | 'vehicles' | 'places',
  id: string,
  patch: Record<string, unknown>,
  errorMsg: string,
): Promise<void> {
  const { data, error } = await sb
    .from('sync_items')
    .select('data')
    .eq('collection', collection)
    .eq('item_id', id)
    .single();
  if (error) fail(errorMsg, error);
  const merged: Record<string, unknown> = { ...(data!.data as object) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  const { error: upError } = await sb
    .from('sync_items')
    .update({ data: merged, updated_at: new Date().toISOString() })
    .eq('collection', collection)
    .eq('item_id', id);
  if (upError) fail(errorMsg, upError);
}

/**
 * Wie patchSyncItem, aber der Aufrufer bekommt den vorherigen Blob und baut den
 * neuen selbst — nötig, wenn verschachtelte Felder (start/end) zusammengeführt
 * werden müssen, ohne GPS-Koordinaten (latitude/longitude) und den path zu
 * verlieren. patchSyncItem ersetzt nur Top-Level-Schlüssel und würde start/end
 * komplett überschreiben.
 */
async function transformSyncItem(
  sb: SupabaseClient,
  collection: 'trips' | 'vehicles' | 'places',
  id: string,
  transform: (prev: Record<string, unknown>) => Record<string, unknown>,
  errorMsg: string,
): Promise<void> {
  const { data, error } = await sb
    .from('sync_items')
    .select('data')
    .eq('collection', collection)
    .eq('item_id', id)
    .single();
  if (error) fail(errorMsg, error);
  const merged = transform({ ...(data!.data as Record<string, unknown>) });
  const { error: upError } = await sb
    .from('sync_items')
    .update({ data: merged, updated_at: new Date().toISOString() })
    .eq('collection', collection)
    .eq('item_id', id);
  if (upError) fail(errorMsg, upError);
}

// Gemeinsame Eingabe fürs Nachtragen und Voll-Bearbeiten einer Fahrt.
export interface TripInput {
  vehicleId: string;
  startTime: string; // ISO
  endTime: string; // ISO
  startAddress: string;
  endAddress: string;
  distanceKm: number;
  category: TripCategory;
  purpose: string | undefined;
}

/**
 * Fahrt von Hand nachtragen — Blob-Format wie mobile AddTripScreen/addTrip:
 * confirmed + manual = true, ohne GPS-Koordinaten (0/0) und ohne path. Upsert
 * wie saveVehicle, damit der App-Merge (remote wins beim Pull) die Fahrt zieht.
 */
export async function insertTrip(
  sb: SupabaseClient,
  userId: string,
  input: TripInput,
): Promise<void> {
  const now = new Date().toISOString();
  const trip: TripData = {
    id: uid('trip_'),
    vehicleId: input.vehicleId,
    startTime: input.startTime,
    endTime: input.endTime,
    // Ohne Karten-Auswahl kennt das Dashboard keine Koordinaten — wie in der
    // App bleibt es dann bei 0/0 (dort als „keine Koordinaten" behandelt).
    start: { latitude: 0, longitude: 0, address: input.startAddress },
    end: { latitude: 0, longitude: 0, address: input.endAddress },
    distanceKm: input.distanceKm,
    category: input.category,
    confirmed: true,
    manual: true,
    createdAt: now,
  };
  if (input.purpose) trip.purpose = input.purpose;
  const { error } = await sb.from('sync_items').upsert(
    {
      user_id: userId,
      collection: 'trips',
      item_id: trip.id,
      data: trip,
      updated_at: now,
      deleted: false,
    },
    { onConflict: 'user_id,collection,item_id' },
  );
  if (error) fail('Fahrt konnte nicht angelegt werden', error);
}

/**
 * Fahrt vollständig bearbeiten (inkl. Adressen, Zeiten, Strecke, Fahrzeug).
 * start/end werden verschachtelt gemergt, damit vorhandene GPS-Koordinaten und
 * der path erhalten bleiben.
 */
export async function updateTripFull(
  sb: SupabaseClient,
  id: string,
  edit: TripInput & { confirmed: boolean },
): Promise<void> {
  await transformSyncItem(
    sb,
    'trips',
    id,
    (prev) => {
      const prevStart = (prev.start as GeoPoint | undefined) ?? {
        latitude: 0,
        longitude: 0,
      };
      const prevEnd = (prev.end as GeoPoint | undefined) ?? {
        latitude: 0,
        longitude: 0,
      };
      const next: Record<string, unknown> = {
        ...prev,
        vehicleId: edit.vehicleId,
        startTime: edit.startTime,
        endTime: edit.endTime,
        start: { ...prevStart, address: edit.startAddress },
        end: { ...prevEnd, address: edit.endAddress },
        distanceKm: edit.distanceKm,
        category: edit.category,
        confirmed: edit.confirmed,
      };
      if (edit.purpose) next.purpose = edit.purpose;
      else delete next.purpose;
      return next;
    },
    'Fahrt konnte nicht gespeichert werden',
  );
}

/**
 * Fahrt löschen — Tombstone wie mobile pushDeletions (deleted=true, data={}),
 * damit die Löschung beim nächsten Sync auch die App erreicht.
 */
export async function deleteTrip(
  sb: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await sb.from('sync_items').upsert(
    {
      user_id: userId,
      collection: 'trips',
      item_id: id,
      data: {},
      updated_at: new Date().toISOString(),
      deleted: true,
    },
    { onConflict: 'user_id,collection,item_id' },
  );
  if (error) fail('Fahrt konnte nicht gelöscht werden', error);
}

export interface VehicleInput {
  name: string;
  make: string | undefined;
  model: string | undefined;
  licensePlate: string | undefined;
  type: Vehicle['type'];
  initialOdometerKm: number | undefined;
}

/** Fahrzeug anlegen/ändern (isDefault/Odometer verwaltet die App). */
export async function saveVehicle(
  sb: SupabaseClient,
  userId: string,
  input: VehicleInput,
  existing?: Vehicle,
): Promise<void> {
  if (existing) {
    await patchSyncItem(
      sb,
      'vehicles',
      existing.id,
      { ...input },
      'Fahrzeug konnte nicht gespeichert werden',
    );
    return;
  }
  const vehicle: Vehicle = {
    id: crypto.randomUUID(),
    ...input,
    isDefault: false,
    createdAt: new Date().toISOString(),
  };
  const { error } = await sb.from('sync_items').upsert(
    {
      user_id: userId,
      collection: 'vehicles',
      item_id: vehicle.id,
      data: vehicle,
      updated_at: new Date().toISOString(),
      deleted: false,
    },
    { onConflict: 'user_id,collection,item_id' },
  );
  if (error) fail('Fahrzeug konnte nicht angelegt werden', error);
}

/** Standard-Fahrzeug setzen — genau eines, wie app-seitiges setDefaultVehicle. */
export async function setDefaultVehicle(
  sb: SupabaseClient,
  vehicles: Vehicle[],
  id: string,
): Promise<void> {
  // Erst das Ziel setzen, dann die übrigen zurücksetzen: schlägt unterwegs
  // etwas fehl, gibt es nie NULL Defaults (die App braucht eines für
  // automatisch erfasste Fahrten). Zurückgesetzt wird unabhängig vom
  // isDefault im UI-Snapshot — die App kann den Default inzwischen auf ein
  // anderes Fahrzeug gelegt haben.
  await patchSyncItem(
    sb,
    'vehicles',
    id,
    { isDefault: true },
    'Standard-Fahrzeug konnte nicht gesetzt werden',
  );
  const results = await Promise.allSettled(
    vehicles
      .filter((v) => v.id !== id)
      .map((v) =>
        patchSyncItem(
          sb,
          'vehicles',
          v.id,
          { isDefault: false },
          'Bisheriges Standard-Fahrzeug konnte nicht zurückgesetzt werden',
        ),
      ),
  );
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw (failed as PromiseRejectedResult).reason;
}

/** Ort umbenennen/kategorisieren — Koordinaten bleiben unangetastet. */
export async function updatePlace(
  sb: SupabaseClient,
  id: string,
  patch: {
    label: string;
    type: SavedPlace['type'];
    address: string | undefined;
    defaultCategory: TripCategory | undefined;
  },
): Promise<void> {
  await patchSyncItem(sb, 'places', id, patch, 'Ort konnte nicht gespeichert werden');
}

export interface PlaceInput {
  label: string;
  type: PlaceType;
  address: string | undefined;
  defaultCategory: TripCategory | undefined;
}

/**
 * Ort anlegen — Blob-Format wie mobile addPlace. Ohne Karten-Auswahl kennt das
 * Dashboard keine Koordinaten, daher latitude/longitude = 0. Die App behandelt
 * 0/0 als „keine Koordinaten": Der Ort ist wählbar, aber die automatische
 * Standort-Zuordnung von Fahrten greift erst, wenn die App echte Koordinaten
 * setzt (z. B. beim Speichern aus der Karte).
 */
export async function insertPlace(
  sb: SupabaseClient,
  userId: string,
  input: PlaceInput,
): Promise<void> {
  const now = new Date().toISOString();
  const place: SavedPlace = {
    id: uid('plc_'),
    label: input.label,
    type: input.type,
    latitude: 0,
    longitude: 0,
    createdAt: now,
  };
  if (input.address) place.address = input.address;
  if (input.defaultCategory) place.defaultCategory = input.defaultCategory;
  const { error } = await sb.from('sync_items').upsert(
    {
      user_id: userId,
      collection: 'places',
      item_id: place.id,
      data: place,
      updated_at: now,
      deleted: false,
    },
    { onConflict: 'user_id,collection,item_id' },
  );
  if (error) fail('Ort konnte nicht angelegt werden', error);
}

/** Ort löschen — Tombstone wie mobile pushDeletions. */
export async function deletePlace(
  sb: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await sb.from('sync_items').upsert(
    {
      user_id: userId,
      collection: 'places',
      item_id: id,
      data: {},
      updated_at: new Date().toISOString(),
      deleted: true,
    },
    { onConflict: 'user_id,collection,item_id' },
  );
  if (error) fail('Ort konnte nicht gelöscht werden', error);
}

async function fetchCollection<T>(
  sb: SupabaseClient,
  collection: 'vehicles' | 'places',
  errorMsg: string,
): Promise<T[]> {
  const { data, error } = await sb
    .from('sync_items')
    .select('data')
    .eq('collection', collection)
    .eq('deleted', false);
  if (error) fail(errorMsg, error);
  return (data ?? []).map((row) => row.data as T);
}

export async function fetchVehicles(sb: SupabaseClient): Promise<Vehicle[]> {
  const vehicles = await fetchCollection<Vehicle>(
    sb,
    'vehicles',
    'Fahrzeuge konnten nicht geladen werden',
  );
  // Standard-Fahrzeug zuerst, danach nach Name
  return vehicles.sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      (a.name ?? '').localeCompare(b.name ?? '', 'de'),
  );
}

export async function fetchPlaces(sb: SupabaseClient): Promise<SavedPlace[]> {
  const places = await fetchCollection<SavedPlace>(
    sb,
    'places',
    'Orte konnten nicht geladen werden',
  );
  return places.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', 'de'));
}
