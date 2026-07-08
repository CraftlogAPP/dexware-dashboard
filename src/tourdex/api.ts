import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '../lib/orgApi';
import type { SavedPlace, TripData, TripSummary, Vehicle } from './types';

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
