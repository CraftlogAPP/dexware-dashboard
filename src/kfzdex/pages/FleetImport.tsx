// Seiten „Fahrzeuge importieren“ (…/fahrzeuge/import) und „Fahrer importieren“ (…/fahrer/import) — wie „Fahrzeug
// anlegen“ bzw. „Fahrer anlegen“ für jedes Mitglied des Betriebs (Server-Regel: Mitglieder legen Fahrzeuge und Fahrer
// an). Gemeinsamer Import-Ablauf (components/ImportWizard.tsx) mit den KfzDex-Adaptern (importFleet.ts).
// Nicht in „Vor Ort“: Import ist Schreibtischarbeit.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { ImportWizard } from '../../components/ImportWizard';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { driverImportAdapter, loadDriverImport, loadVehicleImport, vehicleImportAdapter } from '../importFleet';

export function VehicleImport() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const state = useAsync(() => loadVehicleImport(client), [client]);
  const adapter = useMemo(() => (org && state.data ? vehicleImportAdapter(client, org.org, state.data) : null), [client, org, state.data]);
  return (
    <>
      <p className="small" style={{ marginBottom: 4 }}>
        <Link to="../fahrzeuge">← Alle Fahrzeuge</Link>
      </p>
      <h1>Fahrzeuge importieren</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Deine Fahrzeugliste aus Excel übernehmen — statt jedes Fahrzeug einzeln anzulegen. Auch die Fuhrpark-Liste aus KfzDex (Excel) lässt sich wieder einlesen.
      </p>
      <LoadGuard state={state}>
        {() => adapter && <ImportWizard adapter={adapter} done={{ to: '../fahrzeuge', label: 'Zu den Fahrzeugen' }} onSaved={state.refresh} />}
      </LoadGuard>
    </>
  );
}

export function DriverImport() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const state = useAsync(() => loadDriverImport(client), [client]);
  const adapter = useMemo(() => (org && state.data ? driverImportAdapter(client, org.org, state.data) : null), [client, org, state.data]);
  return (
    <>
      <p className="small" style={{ marginBottom: 4 }}>
        <Link to="../fahrer">← Alle Fahrer</Link>
      </p>
      <h1>Fahrer importieren</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Deine Fahrerliste aus Excel übernehmen — statt jeden Fahrer einzeln anzulegen. Aus der Fuhrpark-Liste von KfzDex das Blatt „Fahrer“ kopieren und einfügen.
      </p>
      <LoadGuard state={state}>
        {() => adapter && <ImportWizard adapter={adapter} done={{ to: '../fahrer', label: 'Zu den Fahrern' }} onSaved={state.refresh} />}
      </LoadGuard>
    </>
  );
}
