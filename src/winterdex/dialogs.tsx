import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { FormDialog, orNull, s, type FormValues } from '../components/form';
import { saveProperty } from './api';
import type { Property } from './types';

export function PropertyDialog({
  property,
  onClose,
  onSaved,
}: {
  property: Property | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const { client } = useAppAuth();
  const { data: org } = useOrg();

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    await saveProperty(
      client,
      org.org.id,
      {
        name: s(v.name),
        address: s(v.address),
        customer_name: orNull(v.customer_name),
        customer_contact: orNull(v.customer_contact),
        areas: orNull(v.areas),
        duty_times: { mo_fr: s(v.duty_mo_fr), sa: s(v.duty_sa), so: s(v.duty_so) },
        notes: orNull(v.notes),
        active: v.active === true,
      },
      property === 'new' ? undefined : property,
    );
    onSaved();
  }

  return (
    <FormDialog
      title={property === 'new' ? 'Objekt anlegen' : `${property.name} bearbeiten`}
      onClose={onClose}
      onSave={onSave}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'address', label: 'Adresse', required: true },
        { key: 'customer_name', label: 'Auftraggeber' },
        { key: 'customer_contact', label: 'Auftraggeber-Kontakt' },
        { key: 'areas', label: 'Flächen', hint: 'z. B. Gehweg, Parkplatz, Zufahrt' },
        { key: 'duty_mo_fr', label: 'Pflichtzeiten Mo–Fr', placeholder: 'z. B. 6–22 Uhr' },
        { key: 'duty_sa', label: 'Pflichtzeiten Samstag', placeholder: 'z. B. 7–22 Uhr' },
        { key: 'duty_so', label: 'Pflichtzeiten Sonn-/Feiertag', placeholder: 'z. B. 8–22 Uhr' },
        { key: 'notes', label: 'Notizen', kind: 'textarea' },
        { key: 'active', label: 'Aktiv (wird im Winterdienst berücksichtigt)', kind: 'checkbox' },
      ]}
      initial={
        property === 'new'
          ? { active: true }
          : {
              name: property.name,
              address: property.address,
              customer_name: property.customer_name ?? '',
              customer_contact: property.customer_contact ?? '',
              areas: property.areas ?? '',
              duty_mo_fr: property.duty_times?.mo_fr ?? '',
              duty_sa: property.duty_times?.sa ?? '',
              duty_so: property.duty_times?.so ?? '',
              notes: property.notes ?? '',
              active: property.active,
            }
      }
    />
  );
}
