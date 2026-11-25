import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from '../components/OrgContext';
import { FormDialog, orNull, s, type FormValues } from '../components/form';
import { saveSite } from './api';
import { mitGrenzText, siteGate, siteGateText } from '../pruefen/pro';
import { GERUESTDEX_VOR_ORT } from './vorOrt';
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
    // Gratis-Grenze wie in der App (1 aktive Baustelle): Anlegen und Wieder-Aktivieren zählen — sonst ließe sich die
    // Grenze per Stilllegen → neu anlegen → wieder aktivieren umgehen. Pro laut Server; unklar → letzter sicherer Stand, sonst „gleich nochmal“.
    const becomesActive = v.active === true && (site === 'new' || !site.active);
    if (becomesActive && !(await siteGate(client, GERUESTDEX_VOR_ORT)).allowed) throw new Error(siteGateText(GERUESTDEX_VOR_ORT));
    // Lehnt der Server ab (NACHTRAG-PAYWALL-2026-11-25, z. B. zweiter Tab), kommt derselbe Hinweis.
    await mitGrenzText(
      saveSite(
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
      ),
      siteGateText(GERUESTDEX_VOR_ORT),
    );
    onSaved();
  }

  return (
    <FormDialog
      title={site === 'new' ? 'Baustelle anlegen' : `${site.name} bearbeiten`}
      onClose={onClose}
      onSave={onSave}
      fields={[
        { key: 'name', label: 'Name', required: true, placeholder: 'z. B. BV Musterstraße 12' },
        { key: 'address', label: 'Adresse', required: true },
        { key: 'operator_name', label: 'Auftraggeber / Bauherr' },
        { key: 'operator_contact', label: 'Auftraggeber-Kontakt' },
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
