import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { FormDialog, orNull, s, type FormValues } from '../components/form';
import { savePlayground } from './api';
import { siteGate, siteGateText } from '../pruefen/pro';
import { SPIELDEX_VOR_ORT } from './vorOrt';
import type { Playground } from './types';

export function PlaygroundDialog({
  playground,
  onClose,
  onSaved,
}: {
  playground: Playground | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const { client } = useAppAuth();
  const { data: org } = useOrg();

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    // Gratis-Grenze wie in der App (1 aktiver Spielplatz): Anlegen und Wieder-Aktivieren zählen — sonst ließe sich die
    // Grenze per Stilllegen → neu anlegen → wieder aktivieren umgehen. Pro laut Server, im Zweifel erlaubt.
    const becomesActive = v.active === true && (playground === 'new' || !playground.active);
    if (becomesActive && !(await siteGate(client, SPIELDEX_VOR_ORT)).allowed) throw new Error(siteGateText(SPIELDEX_VOR_ORT));
    await savePlayground(
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
      playground === 'new' ? undefined : playground,
    );
    onSaved();
  }

  return (
    <FormDialog
      title={playground === 'new' ? 'Spielplatz anlegen' : `${playground.name} bearbeiten`}
      onClose={onClose}
      onSave={onSave}
      fields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'address', label: 'Adresse', required: true },
        { key: 'operator_name', label: 'Betreiber' },
        { key: 'operator_contact', label: 'Betreiber-Kontakt' },
        { key: 'notes', label: 'Notizen', kind: 'textarea' },
        { key: 'active', label: 'Aktiv (wird kontrolliert)', kind: 'checkbox' },
      ]}
      initial={
        playground === 'new'
          ? { active: true }
          : {
              name: playground.name,
              address: playground.address,
              operator_name: playground.operator_name ?? '',
              operator_contact: playground.operator_contact ?? '',
              notes: playground.notes ?? '',
              active: playground.active,
            }
      }
    />
  );
}
