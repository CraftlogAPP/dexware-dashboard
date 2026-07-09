import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { FormDialog, orNull, s, type FormValues } from '../components/form';
import { saveSite } from './api';
import type { Site } from './types';

export function SiteDialog({
  site,
  onClose,
  onSaved,
}: {
  site: Site | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const { client } = useAppAuth();
  const { data: org } = useOrg();

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    await saveSite(
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
      site === 'new' ? undefined : site,
    );
    onSaved();
  }

  return (
    <FormDialog
      title={site === 'new' ? 'Standort anlegen' : `${site.name} bearbeiten`}
      onClose={onClose}
      onSave={onSave}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'z. B. Werkstatt Nord' },
        { key: 'address', label: 'Adresse', required: true },
        { key: 'operator_name', label: 'Betreiber' },
        { key: 'operator_contact', label: 'Betreiber-Kontakt' },
        { key: 'notes', label: 'Notizen', kind: 'textarea' },
        { key: 'active', label: 'Aktiv (wird geprüft)', kind: 'checkbox' },
      ]}
      initial={
        site === 'new'
          ? { active: true }
          : {
              name: site.name,
              address: site.address,
              operator_name: site.operator_name ?? '',
              operator_contact: site.operator_contact ?? '',
              notes: site.notes ?? '',
              active: site.active,
            }
      }
    />
  );
}
