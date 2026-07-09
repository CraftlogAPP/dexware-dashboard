// Geteilte Bearbeiten-/Erfassen-Dialoge — von Listen- UND Detail-Seiten genutzt.
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { FormDialog, num, orNull, s, type FormValues } from '../components/form';
import { toInputDate } from '../lib/format';
import {
  addLicenseCheck,
  addUvvInspection,
  insertDriver,
  insertVehicle,
  updateDriver,
  updateVehicle,
} from './api';
import type { Driver, UvvResult, Vehicle, VehicleType } from './types';
import { CHECK_ITEMS, UVV_RESULT_LABEL, VEHICLE_TYPE_LABEL } from './types';

export function VehicleDialog({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: Vehicle | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const { client } = useAppAuth();
  const { data: org } = useOrg();

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    const input = {
      plate: s(v.plate),
      name: orNull(v.name),
      type: s(v.type) as VehicleType,
      first_registration: orNull(v.first_registration),
      last_uvv: orNull(v.last_uvv),
    };
    if (vehicle === 'new') await insertVehicle(client, org.org.id, input);
    else await updateVehicle(client, vehicle.id, input);
    onSaved();
  }

  return (
    <FormDialog
      title={vehicle === 'new' ? 'Fahrzeug anlegen' : `${vehicle.plate} bearbeiten`}
      onClose={onClose}
      onSave={onSave}
      fields={[
        { key: 'plate', label: 'Kennzeichen', required: true, placeholder: 'z. B. W-12345X' },
        { key: 'name', label: 'Bezeichnung', placeholder: 'z. B. Sprinter Bau' },
        {
          key: 'type',
          label: 'Typ',
          kind: 'select',
          required: true,
          options: (Object.keys(VEHICLE_TYPE_LABEL) as VehicleType[]).map((t) => ({
            value: t,
            label: VEHICLE_TYPE_LABEL[t],
          })),
        },
        { key: 'first_registration', label: 'Erstzulassung', kind: 'date' },
        {
          key: 'last_uvv',
          label: 'Letzte bestandene UVV',
          kind: 'date',
          hint: 'UVV gilt 12 Monate — daraus errechnet sich die Fälligkeit',
        },
      ]}
      initial={
        vehicle === 'new'
          ? { type: 'pkw' }
          : {
              plate: vehicle.plate,
              name: vehicle.name ?? '',
              type: vehicle.type,
              first_registration: vehicle.first_registration ?? '',
              last_uvv: vehicle.last_uvv ?? '',
            }
      }
    />
  );
}

export function UvvDialog({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { client } = useAppAuth();
  const { data: org } = useOrg();

  async function onInspect(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    const checklist: Record<string, boolean> = {};
    for (const item of CHECK_ITEMS) checklist[item.id] = v[`chk_${item.id}`] === true;
    const warning = await addUvvInspection(client, org.org.id, {
      vehicle_id: vehicle.id,
      date: s(v.date),
      inspector: s(v.inspector),
      result: s(v.result) as UvvResult,
      defects: orNull(v.defects),
      checklist,
    });
    onSaved();
    if (warning) alert(warning);
  }

  return (
    <FormDialog
      title={`UVV-Prüfung erfassen — ${vehicle.plate}`}
      submitLabel="Prüfung speichern"
      onClose={onClose}
      onSave={onInspect}
      fields={[
        { key: 'date', label: 'Prüfdatum', kind: 'date', required: true },
        { key: 'inspector', label: 'Prüfer', required: true },
        {
          key: 'result',
          label: 'Ergebnis',
          kind: 'select',
          required: true,
          options: (Object.keys(UVV_RESULT_LABEL) as UvvResult[]).map((r) => ({
            value: r,
            label: UVV_RESULT_LABEL[r],
          })),
        },
        { key: 'defects', label: 'Festgestellte Mängel', kind: 'textarea' },
        ...CHECK_ITEMS.map((item) => ({
          key: `chk_${item.id}`,
          label: item.label,
          kind: 'checkbox' as const,
        })),
      ]}
      initial={{
        date: toInputDate(new Date()),
        result: 'bestanden',
        ...Object.fromEntries(CHECK_ITEMS.map((item) => [`chk_${item.id}`, true])),
      }}
    />
  );
}

export function DriverDialog({
  driver,
  onClose,
  onSaved,
}: {
  driver: Driver | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const { client } = useAppAuth();
  const { data: org } = useOrg();

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    const input = {
      name: s(v.name),
      license_classes: orNull(v.license_classes),
      check_interval_months: num(v.check_interval_months) ?? 6,
      last_check: orNull(v.last_check),
      active: v.active === true,
    };
    if (driver === 'new') await insertDriver(client, org.org.id, input);
    else await updateDriver(client, driver.id, input);
    onSaved();
  }

  return (
    <FormDialog
      title={driver === 'new' ? 'Fahrer anlegen' : `${driver.name} bearbeiten`}
      onClose={onClose}
      onSave={onSave}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'license_classes', label: 'Führerscheinklassen', placeholder: 'z. B. B, BE, C1' },
        {
          key: 'check_interval_months',
          label: 'Kontroll-Intervall (Monate)',
          kind: 'number',
          required: true,
          hint: 'Üblich sind 6 Monate',
        },
        { key: 'last_check', label: 'Letzte Führerscheinkontrolle', kind: 'date' },
        { key: 'active', label: 'Aktiv (Kontrollen fällig)', kind: 'checkbox' },
      ]}
      initial={
        driver === 'new'
          ? { check_interval_months: '6', active: true }
          : {
              name: driver.name,
              license_classes: driver.license_classes ?? '',
              check_interval_months: String(driver.check_interval_months),
              last_check: driver.last_check ?? '',
              active: driver.active,
            }
      }
    />
  );
}

export function LicenseCheckDialog({
  driver,
  onClose,
  onSaved,
}: {
  driver: Driver;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { client } = useAppAuth();
  const { data: org } = useOrg();

  async function onCheck(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    const warning = await addLicenseCheck(client, org.org.id, {
      driver_id: driver.id,
      date: s(v.date),
      checked_by: s(v.checked_by),
    });
    onSaved();
    if (warning) alert(warning);
  }

  return (
    <FormDialog
      title={`Führerscheinkontrolle — ${driver.name}`}
      submitLabel="Kontrolle speichern"
      onClose={onClose}
      onSave={onCheck}
      fields={[
        { key: 'date', label: 'Kontrolldatum', kind: 'date', required: true },
        { key: 'checked_by', label: 'Kontrolliert von', required: true },
      ]}
      initial={{ date: toInputDate(new Date()) }}
    />
  );
}
