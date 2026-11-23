// Seite „<Geräte> importieren“ bzw. bei den Orts-Apps „<Orte> importieren“ der Prüf-Apps (…/<standorte>/import, nur
// Inhaber — wie das Anlegen laut Server-Regel).
// Lädt Standorte, Bestand und Gratis-Grenze und zeigt den gemeinsamen Import-Ablauf (components/ImportWizard.tsx) mit
// dem Adapter der App (src/<app>/importUnits.ts). Nicht in „Vor Ort“: Import ist Schreibtischarbeit.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAppAuth } from '../auth/AppAuthContext';
import { ImportWizard } from '../components/ImportWizard';
import { useOrg } from '../components/OrgContext';
import { LoadGuard, useAsync } from '../components/ui';
import type { Org } from '../lib/orgApi';
import { isSiteMode, sitesPathOf } from './config';
import { loadUnitImport, unitImportAdapter, type ImportSite, type UnitImportData, type UnitImportDef } from './importUnits';

export function UnitImportPage<U extends { id: string; name: string }, S extends ImportSite, R extends { id: string }, I>({
  def,
}: {
  def: UnitImportDef<U, S, R, I>;
}) {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const owner = org?.role === 'owner';
  const { cfg } = def.spec;
  const U = cfg.labels.unit;
  const S = cfg.labels.site;
  const back = `../${sitesPathOf(cfg)}`;
  // Orts-Apps: geprüft wird der Ort — importiert werden Orte und auf Wunsch ihr Bestand
  const siteMode = isSiteMode(cfg);
  const what = siteMode ? S.many : U.many;
  const book = def.spec.bookName ?? 'Prüfbuch';
  const state = useAsync(async () => (owner ? loadUnitImport(def, client) : null), [client, owner, def]);

  return (
    <>
      <p className="small" style={{ marginBottom: 4 }}>
        <Link to={back}>← Alle {S.many}</Link>
      </p>
      <h1>{what} importieren</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {siteMode
          ? `Deine Liste aus Excel übernehmen — ${S.many} und auf Wunsch ihre ${U.many}, statt alles einzeln anzulegen. Auch das ${book} (Excel) lässt sich wieder einlesen.`
          : `Deine Liste aus Excel übernehmen — statt alles einzeln anzulegen. Auch das ${book} (Excel) lässt sich wieder einlesen.`}
      </p>
      {!owner || !org ? (
        <div className="info-box">{what} importieren kann nur der Inhaber des Betriebs.</div>
      ) : (
        <LoadGuard state={state}>
          {(d) => d && <Flow def={def} client={client} org={org.org} data={d} back={back} sitesLabel={S.many} onSaved={state.refresh} />}
        </LoadGuard>
      )}
    </>
  );
}

function Flow<U extends { id: string; name: string }, S extends ImportSite, R extends { id: string }, I>({
  def,
  client,
  org,
  data,
  back,
  sitesLabel,
  onSaved,
}: {
  def: UnitImportDef<U, S, R, I>;
  client: SupabaseClient;
  org: Org;
  data: UnitImportData<U>;
  back: string;
  sitesLabel: string;
  onSaved: () => void;
}) {
  const adapter = useMemo(() => unitImportAdapter(def, client, org, data), [def, client, org, data]);
  return <ImportWizard adapter={adapter} done={{ to: back, label: `Zur Liste „${sitesLabel}“` }} onSaved={onSaved} />;
}
