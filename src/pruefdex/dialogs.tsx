import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FormDialog,
  num,
  orNull,
  s,
  type FieldDef,
  type FormValues,
} from '../components/form';
import { fmtDate, toInputDate } from '../lib/format';
import { addInspection, saveDevice, updateInspection } from './api';
import {
  MEASUREMENTS,
  VISUAL_CHECKS,
  type Customer,
  type Device,
  type Inspection,
  type InspectionResult,
  type ProtectionClass,
} from './types';

/** Fällige Folgeprüfung: Prüfdatum + Intervall des Geräts (Monate). */
function plusMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return toInputDate(d);
}

/**
 * Geräte-Anlegen/-Bearbeiten-Dialog — aus Devices.tsx extrahiert, damit die
 * Geräte-Detailseite denselben Dialog nutzen kann.
 */
export function DeviceDialog({
  client,
  orgId,
  customers,
  device,
  onClose,
  onSaved,
}: {
  client: SupabaseClient;
  orgId: string;
  customers: Customer[];
  device: Device | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  async function onSave(v: FormValues) {
    await saveDevice(
      client,
      orgId,
      {
        customer_id: orNull(v.customer_id),
        qr_code: orNull(v.qr_code),
        name: s(v.name),
        device_type: orNull(v.device_type),
        manufacturer: orNull(v.manufacturer),
        serial_number: orNull(v.serial_number),
        protection_class:
          (orNull(v.protection_class) as ProtectionClass | null) ?? null,
        location_note: orNull(v.location_note),
        interval_months: num(v.interval_months) ?? 12,
        next_due_date: orNull(v.next_due_date),
      },
      device === 'new' ? undefined : device,
    );
    onSaved();
  }

  return (
    <FormDialog
      title={device === 'new' ? 'Gerät anlegen' : `${device.name} bearbeiten`}
      onClose={onClose}
      onSave={onSave}
      fields={[
        { key: 'name', label: 'Gerät', required: true, placeholder: 'z. B. Bohrmaschine' },
        { key: 'device_type', label: 'Gerätetyp', placeholder: 'z. B. Handwerkzeug' },
        { key: 'qr_code', label: 'QR-Code / Etikett' },
        { key: 'manufacturer', label: 'Hersteller' },
        { key: 'serial_number', label: 'Seriennummer' },
        {
          key: 'protection_class',
          label: 'Schutzklasse',
          kind: 'select',
          options: [
            { value: 'I', label: 'SK I (Schutzleiter)' },
            { value: 'II', label: 'SK II (Schutzisolierung)' },
            { value: 'III', label: 'SK III (Schutzkleinspannung)' },
          ],
        },
        {
          key: 'customer_id',
          label: 'Kunde/Standort',
          kind: 'select',
          options: customers.map((c) => ({ value: c.id, label: c.name })),
        },
        { key: 'location_note', label: 'Standort-Notiz', placeholder: 'z. B. Werkstatt Regal 3' },
        {
          key: 'interval_months',
          label: 'Prüfintervall (Monate)',
          kind: 'number',
          required: true,
          hint: 'DGUV V3: üblich 6–24 Monate je nach Beanspruchung',
        },
        {
          key: 'next_due_date',
          label: 'Nächste Prüfung',
          kind: 'date',
          hint: 'Wird bei jeder erfassten Prüfung automatisch fortgeschrieben',
        },
      ]}
      initial={
        device === 'new'
          ? { interval_months: '12' }
          : {
              name: device.name,
              device_type: device.device_type ?? '',
              qr_code: device.qr_code ?? '',
              manufacturer: device.manufacturer ?? '',
              serial_number: device.serial_number ?? '',
              protection_class: device.protection_class ?? '',
              customer_id: device.customer_id ?? '',
              location_note: device.location_note ?? '',
              interval_months: String(device.interval_months),
              next_due_date: device.next_due_date ?? '',
            }
      }
    />
  );
}

/**
 * Prüfung erfassen/bearbeiten — aus Inspections.tsx extrahiert. `fixedDeviceId`
 * bindet den Dialog an ein Gerät (Geräte-Detailseite); beim Bearbeiten ist das
 * Gerät ohnehin fest (die App ändert die Gerätezuordnung einer Prüfung nie).
 */
export function InspectionDialog({
  client,
  orgId,
  devices,
  fixedDeviceId,
  inspection,
  onClose,
  onSaved,
}: {
  client: SupabaseClient;
  orgId: string;
  devices: Device[];
  fixedDeviceId?: string;
  inspection?: Inspection;
  onClose: () => void;
  /** warning ist die Teilerfolg-Meldung aus add/updateInspection (oder null). */
  onSaved: (warning: string | null) => void;
}) {
  const lockedDeviceId = inspection?.device_id ?? fixedDeviceId;

  async function onSave(v: FormValues) {
    const deviceIdSel = lockedDeviceId ?? s(v.device_id);
    const inspectedAt = s(v.inspected_at);
    const device = devices.find((d) => d.id === deviceIdSel);
    const measurements: Record<string, string> = {};
    for (const m of MEASUREMENTS) {
      const val = s(v[`m_${m.key}`]);
      if (val) measurements[m.key] = val;
    }
    const checks: Record<string, boolean> = {};
    for (const c of VISUAL_CHECKS) checks[c.key] = v[`vc_${c.key}`] === true;
    const payload = {
      device_id: deviceIdSel,
      inspected_at: inspectedAt,
      inspector_name: orNull(v.inspector_name),
      visual_checks: checks,
      measurements,
      result: s(v.result) as InspectionResult,
      next_due_date:
        orNull(v.next_due_date) ??
        (device ? plusMonths(inspectedAt, device.interval_months) : null),
      notes: orNull(v.notes),
    };
    const warning = inspection
      ? await updateInspection(client, { id: inspection.id, ...payload })
      : await addInspection(client, orgId, payload);
    onSaved(warning);
  }

  const fields: FieldDef[] = [
    ...(lockedDeviceId
      ? []
      : [
          {
            key: 'device_id',
            label: 'Gerät',
            kind: 'select' as const,
            required: true,
            options: devices.map((d) => ({ value: d.id, label: d.name })),
          },
        ]),
    { key: 'inspected_at', label: 'Prüfdatum', kind: 'date', required: true },
    { key: 'inspector_name', label: 'Geprüft von' },
    {
      key: 'result',
      label: 'Ergebnis',
      kind: 'select',
      required: true,
      options: [
        { value: 'passed', label: 'Bestanden' },
        { value: 'failed', label: 'Nicht bestanden' },
      ],
    },
    ...VISUAL_CHECKS.map((c) => ({
      key: `vc_${c.key}`,
      label: c.label,
      kind: 'checkbox' as const,
    })),
    ...MEASUREMENTS.map((m) => ({
      key: `m_${m.key}`,
      label: `${m.label} (${m.unit})`,
      hint: m.hint,
    })),
    {
      key: 'next_due_date',
      label: 'Nächste Prüfung',
      kind: 'date',
      hint: 'Leer lassen = automatisch aus dem Prüfintervall des Geräts',
    },
    { key: 'notes', label: 'Notizen', kind: 'textarea' },
  ];

  const initial: FormValues = inspection
    ? {
        inspected_at: inspection.inspected_at,
        inspector_name: inspection.inspector_name ?? '',
        result: inspection.result,
        next_due_date: inspection.next_due_date ?? '',
        notes: inspection.notes ?? '',
        // gespeicherte visual_checks/measurements auf die vc_/m_-Feldkeys mappen
        ...Object.fromEntries(
          VISUAL_CHECKS.map((c) => [`vc_${c.key}`, inspection.visual_checks[c.key] === true]),
        ),
        ...Object.fromEntries(
          MEASUREMENTS.map((m) => [`m_${m.key}`, inspection.measurements[m.key] ?? '']),
        ),
      }
    : {
        inspected_at: toInputDate(new Date()),
        result: 'passed',
        ...Object.fromEntries(VISUAL_CHECKS.map((c) => [`vc_${c.key}`, true])),
      };

  return (
    <FormDialog
      title={
        inspection
          ? `Prüfung vom ${fmtDate(inspection.inspected_at)} bearbeiten`
          : 'DGUV-V3-Prüfung erfassen'
      }
      submitLabel="Prüfung speichern"
      onClose={onClose}
      onSave={onSave}
      fields={fields}
      initial={initial}
    />
  );
}
