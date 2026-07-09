import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { FormDialog, orNull, s, type FormValues } from '../components/form';
import { saveWarehouse } from './api';
import type { Warehouse } from './types';

export function WarehouseDialog({
  warehouse,
  onClose,
  onSaved,
}: {
  warehouse: Warehouse | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const { client } = useAppAuth();
  const { data: org } = useOrg();

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    await saveWarehouse(
      client,
      org.org.id,
      {
        name: s(v.name),
        address: s(v.address),
        operator_name: orNull(v.operator_name),
        operator_contact: orNull(v.operator_contact),
        notes: orNull(v.notes),
        active: v.active === true,
      },
      warehouse === 'new' ? undefined : warehouse,
    );
    onSaved();
  }

  return (
    <FormDialog
      title={warehouse === 'new' ? 'Lager anlegen' : `${warehouse.name} bearbeiten`}
      onClose={onClose}
      onSave={onSave}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'address', label: 'Adresse', required: true },
        { key: 'operator_name', label: 'Betreiber' },
        { key: 'operator_contact', label: 'Betreiber-Kontakt' },
        { key: 'notes', label: 'Notizen', kind: 'textarea' },
        { key: 'active', label: 'Aktiv (wird inspiziert)', kind: 'checkbox' },
      ]}
      initial={
        warehouse === 'new'
          ? { active: true }
          : {
              name: warehouse.name,
              address: warehouse.address,
              operator_name: warehouse.operator_name ?? '',
              operator_contact: warehouse.operator_contact ?? '',
              notes: warehouse.notes ?? '',
              active: warehouse.active,
            }
      }
    />
  );
}
