import { useState } from 'react';
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { FormDialog, orNull, s, type FormValues } from '../components/form';
import { saveProperty, fetchProperties, neuesObjekt } from './api';
import { locateAddress } from './geo';
import { FREE_PROPERTIES, GRENZE_OBJEKTE, istGratisGrenze, orgProFuerGrenze } from './pro';
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
  // Neues Objekt: Kennung EINMAL je Dialog — „Speichern“ nach verlorener Antwort schreibt dieselbe Zeile (kein Doppel,
  // keine falsche Gratis-Grenze; wie App 737a926 propertyGate(eigeneId), Tagescheck 26.11.2026 Fund 45)
  const [neu] = useState(neuesObjekt);
  const eigeneId = property === 'new' ? neu.id : property.id;

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    // Gratis-Paket: höchstens 2 aktive Objekte (wie in der App) — gilt fürs Anlegen und fürs Wieder-Aktivieren.
    // Pro-Status unklar (Abo-Dienst gestört, kein letzter Stand) → ProUnklarError mit freundlichem Text (nicht still erlauben).
    const wasActive = property !== 'new' && property.active;
    if (v.active === true && !wasActive) {
      // eigene Kennung nie mitzählen — auch nicht, wenn der erste Versuch schon angekommen war
      const others = (await fetchProperties(client)).filter((p) => p.active && p.id !== eigeneId).length;
      if (others >= FREE_PROPERTIES && !(await orgProFuerGrenze(client))) throw new Error(GRENZE_OBJEKTE);
    }
    // Wie die App: ohne Standort die Adresse in Koordinaten umrechnen (Wetter-Rückgriff, Glätte-Frühwarnung,
    // GPS-Abstand im Nachweis). Nur mit PLZ und Ort (sonst eher ein falscher Ort als keiner — siehe geo.ts).
    // Best effort — klappt es nicht, wird trotzdem gespeichert.
    const address = s(v.address);
    const location = noLocation ? ((await locateAddress(address)).point ?? undefined) : undefined;
    // Der Server prüft die Grenze selbst (z. B. zweites Gerät hat inzwischen angelegt) — seine Ablehnung verständlich zeigen.
    try {
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
        property === 'new' ? neu : undefined,
      );
    } catch (e) {
      if (istGratisGrenze(e)) throw new Error(GRENZE_OBJEKTE);
      throw e;
    }
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
            ? 'Mit PLZ und Ort (z. B. „Hauptplatz 1, 8200 Gleisdorf“) wird beim Speichern daraus der Standort bestimmt (über OpenStreetMap) — für Glätte-Frühwarnung und GPS-Abstand.'
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
