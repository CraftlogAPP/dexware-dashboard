// ObjektDex — Seite „Objekte aus Excel“ (…/objekte/import): gemeinsamer Import-Ablauf (components/ImportWizard.tsx) mit dem
// ObjektDex-Adapter (../importObjekte.ts). Nur der Inhaber (RLS property_insert). Import ist Schreibtischarbeit.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ImportWizard } from '../../components/ImportWizard';
import { LoadGuard, useAsync } from '../../components/ui';
import { useOd } from '../context';
import { ladeObjektImport, objektImportAdapter } from '../importObjekte';

export function ObjekteImport() {
  const { data, role, base } = useOd();
  const state = useAsync(() => ladeObjektImport(data), [data]);
  const adapter = useMemo(() => (state.data ? objektImportAdapter(data, state.data) : null), [data, state.data]);
  return (
    <>
      <p className="small" style={{ marginBottom: 4 }}>
        <Link to={`${base}/objekte`}>← Objekte</Link>
      </p>
      <h1>Objekte aus Excel</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Deine Objektliste aus Excel übernehmen — statt jedes Objekt einzeln anzulegen. Die Objektliste aus WinterDex (Excel) passt
        direkt. Du nutzt WinterDex? Noch einfacher: <Link to={`${base}/aus-winterdex`}>Aus WinterDex übernehmen</Link>.
      </p>
      {role !== 'owner' ? (
        <div className="info-box">Objekte legt in ObjektDex nur der Inhaber an.</div>
      ) : (
        <LoadGuard state={state}>
          {() => adapter && <ImportWizard adapter={adapter} done={{ to: `${base}/objekte`, label: 'Zu den Objekten' }} onSaved={state.refresh} />}
        </LoadGuard>
      )}
    </>
  );
}
