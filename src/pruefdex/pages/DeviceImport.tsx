// Seite „Geräte importieren“ (…/geraete/import) — wie „Gerät anlegen“ für jedes Mitglied des Betriebs (Server-Regel:
// Mitglieder legen Kunden und Geräte an). Lädt Kunden, Geräte und Gratis-Grenze und zeigt den gemeinsamen Import-Ablauf
// (components/ImportWizard.tsx) mit dem PrüfDex-Adapter (importDevices.ts). Nicht in „Vor Ort“: Import ist Schreibtischarbeit.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { ImportWizard } from '../../components/ImportWizard';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { deviceImportAdapter, loadDeviceImport } from '../importDevices';

export function DeviceImport() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const state = useAsync(() => loadDeviceImport(client), [client]);
  const adapter = useMemo(() => (org && state.data ? deviceImportAdapter(client, org.org, state.data) : null), [client, org, state.data]);

  return (
    <>
      <p className="small" style={{ marginBottom: 4 }}>
        <Link to="../geraete">← Alle Geräte</Link>
      </p>
      <h1>Geräte importieren</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Deine Geräteliste aus Excel übernehmen — statt jedes Gerät einzeln anzulegen. Auch die Geräteliste aus PrüfDex (Excel) lässt sich wieder einlesen.
      </p>
      <LoadGuard state={state}>
        {() => adapter && <ImportWizard adapter={adapter} done={{ to: '../geraete', label: 'Zur Geräteliste' }} onSaved={state.refresh} />}
      </LoadGuard>
    </>
  );
}
