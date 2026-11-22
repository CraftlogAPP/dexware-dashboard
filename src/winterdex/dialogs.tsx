import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { FormDialog, orNull, s, type FormValues } from '../components/form';
import { geocodeAddress } from '../pinndex/geocode';
import { saveProperty, fetchProperties } from './api';
import { FREE_PROPERTIES, PRO_HOW, fetchOrgPro } from './pro';
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
  const noLocation = property === 'new' || property.lat == null || property.lng == null;

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    // Gratis-Paket: höchstens 2 aktive Objekte (wie in der App) — gilt fürs Anlegen und fürs Wieder-Aktivieren.
    const wasActive = property !== 'new' && property.active;
    if (v.active === true && !wasActive) {
      const others = (await fetchProperties(client)).filter((p) => p.active && (property === 'new' || p.id !== property.id)).length;
      if (others >= FREE_PROPERTIES && !(await fetchOrgPro(client, true))) {
        throw new Error(`Im Gratis-Paket sind ${FREE_PROPERTIES} aktive Objekte möglich. ${PRO_HOW}`);
      }
    }
    // Wie die App: ohne Standort die Adresse in Koordinaten umrechnen (Wetter-Rückgriff, Glätte-Frühwarnung,
    // GPS-Abstand im Nachweis). Best effort — klappt es nicht, wird trotzdem gespeichert.
    const address = s(v.address);
    const location = noLocation ? ((await geocodeAddress(address)) ?? undefined) : undefined;
    await saveProperty(
      client,
      org.org.id,
      {
        name: s(v.name),
        address,
        customer_name: orNull(v.customer_name),
        customer_contact: orNull(v.customer_contact),
        areas: orNull(v.areas),
        duty_times: { mo_fr: s(v.duty_mo_fr), sa: s(v.duty_sa), so: s(v.duty_so) },
        notes: orNull(v.notes),
        active: v.active === true,
      },
      property === 'new' ? undefined : property,
      location,
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
        {
          key: 'address',
          label: 'Adresse',
          required: true,
          hint: noLocation
            ? 'Beim Speichern wird daraus der Standort bestimmt (über OpenStreetMap) — für Glätte-Frühwarnung und GPS-Abstand.'
            : undefined,
        },
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
