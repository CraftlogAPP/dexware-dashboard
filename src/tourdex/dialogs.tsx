import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FormDialog,
  isoFromLocal,
  localFromIso,
  num,
  s,
  type FieldDef,
  type FormValues,
} from '../components/form';
import { fmtDate, fmtTime } from '../lib/format';
import { insertTrip, updateTripFull } from './api';
import { CATEGORY_LABELS, type TripCategory, type Vehicle } from './types';

/**
 * Gemeinsame Vorbelegung für den Fahrt-Dialog — deckt Nachtragen (existing =
 * null) und Voll-Bearbeiten (existing gesetzt) ab. Bewusst schmal gehalten,
 * damit sowohl die Fahrten-Liste (TripSummary) als auch das Detail (TripData)
 * ohne Umweg mappen können.
 */
export interface TripFormInitial {
  id: string;
  vehicleId: string;
  startAddress: string;
  endAddress: string;
  /** ISO-Timestamp */
  startTime: string;
  /** ISO-Timestamp */
  endTime: string;
  distanceKm: number | null;
  category: TripCategory;
  purpose: string;
  confirmed: boolean;
}

/**
 * Fahrt nachtragen oder bearbeiten. Wird aus Trips.tsx (Liste) und
 * TripDetail.tsx wiederverwendet. Schreibt über insertTrip/updateTripFull —
 * bei der Bearbeitung bleiben GPS-Koordinaten und der path erhalten.
 */
export function TripDialog({
  client,
  userId,
  vehicles,
  existing,
  onClose,
  onSaved,
}: {
  client: SupabaseClient;
  userId: string;
  vehicles: Vehicle[];
  existing: TripFormInitial | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const categoryOptions = (Object.keys(CATEGORY_LABELS) as TripCategory[]).map((c) => ({
    value: c,
    label: CATEGORY_LABELS[c],
  }));
  const vehicleOptions = vehicles.map((v) => ({ value: v.id, label: v.name }));

  const fields: FieldDef[] = [
    { key: 'vehicleId', label: 'Fahrzeug', kind: 'select', required: true, options: vehicleOptions },
    { key: 'startAddress', label: 'Start-Adresse', required: true },
    { key: 'endAddress', label: 'Ziel-Adresse', required: true },
    { key: 'startTime', label: 'Start', kind: 'datetime', required: true },
    { key: 'endTime', label: 'Ende', kind: 'datetime', required: true },
    { key: 'distanceKm', label: 'Strecke (km)', kind: 'number', required: true },
    { key: 'category', label: 'Kategorie', kind: 'select', required: true, options: categoryOptions },
    { key: 'purpose', label: 'Zweck', placeholder: 'z. B. Kundentermin Fa. Muster' },
  ];
  // Nur beim Bearbeiten sichtbar — nachgetragene Fahrten sind (wie in der App)
  // immer sofort bestätigt.
  if (existing) {
    fields.push({
      key: 'confirmed',
      label: 'Bestätigt (fürs Fahrtenbuch freigegeben)',
      kind: 'checkbox',
    });
  }

  async function onSave(v: FormValues) {
    const vehicleId = s(v.vehicleId);
    if (!vehicleId) throw new Error('Bitte ein Fahrzeug wählen.');
    const startTime = isoFromLocal(v.startTime);
    const endTime = isoFromLocal(v.endTime);
    if (!startTime || !endTime) throw new Error('Bitte Start- und Endzeit angeben.');
    if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
      throw new Error('Das Ende muss nach dem Start liegen.');
    }
    const distance = num(v.distanceKm);
    if (distance == null || distance <= 0) {
      throw new Error('Bitte eine gültige Strecke (km) angeben.');
    }
    const input = {
      vehicleId,
      startTime,
      endTime,
      startAddress: s(v.startAddress),
      endAddress: s(v.endAddress),
      distanceKm: Number(distance.toFixed(1)),
      category: s(v.category) as TripCategory,
      purpose: s(v.purpose) || undefined,
    };
    if (existing) {
      await updateTripFull(client, existing.id, { ...input, confirmed: v.confirmed === true });
    } else {
      await insertTrip(client, userId, input);
    }
    onSaved();
  }

  const title = existing
    ? `Fahrt bearbeiten — ${fmtDate(existing.startTime)}, ${fmtTime(existing.startTime)}`
    : 'Fahrt nachtragen';

  return (
    <FormDialog
      title={title}
      onClose={onClose}
      onSave={onSave}
      fields={fields}
      initial={{
        vehicleId: existing?.vehicleId ?? '',
        startAddress: existing?.startAddress ?? '',
        endAddress: existing?.endAddress ?? '',
        startTime: localFromIso(existing?.startTime),
        endTime: localFromIso(existing?.endTime),
        distanceKm: existing?.distanceKm != null ? String(existing.distanceKm) : '',
        category: existing?.category ?? 'business',
        purpose: existing?.purpose ?? '',
        confirmed: existing?.confirmed === true,
      }}
    />
  );
}
