import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { PruefErsteSchritte } from '../../components/ErsteSchritte';
import { GERUESTDEX_VOR_ORT } from '../vorOrt';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDamages,
  fetchInspectionMeta,
  fetchInspections,
  fetchScaffolds,
  fetchSites,
  type InspMeta,
} from '../api';
import { dueKpiPrefix, dueOverview } from '../../lib/pruefExport';
import { FaelligTabelle } from '../../pruefen/FaelligTabelle';
import { InspectionBadge } from '../badges';
import { GERUESTDEX_EXPORT } from '../exportLists';
import { checklistSummary, siteNameMap } from '../labels';
import {
  type Damage,
  type Inspection,
  type Scaffold,
  type Site,
} from '../types';

interface OverviewData {
  sites: Site[];
  scaffolds: Scaffold[];
  /** schmale Metadaten (bis 2000 jüngste Prüfungen) für KPIs + Fälligkeit */
  meta: InspMeta[];
  /** die 10 jüngsten Prüfungen in voller Breite für die Tabelle */
  recentInspections: Inspection[];
  openDamages: Damage[];
}

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [sites, scaffolds, meta, recentInspections, openDamages] =
      await Promise.all([
        fetchSites(client),
        fetchScaffolds(client),
        fetchInspectionMeta(client),
        fetchInspections(client, { limit: 10 }),
        fetchDamages(client, { status: 'open' }),
      ]);
    return { sites, scaffolds, meta, recentInspections, openDamages };
  }, [client]);

  return (
    <>
      <h1>Übersicht</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} · Prüfpflichten im Blick — live aus der GerüstDex-App.
        </p>
      )}

      <LoadGuard state={state}>
        {({ sites, scaffolds, meta, recentInspections, openDamages }) => {
          const activeSites = sites.filter((s) => s.active);
          const activeSiteIds = new Set(activeSites.map((s) => s.id));
          const activeScaffolds = scaffolds.filter(
            (sc) => !sc.retired && activeSiteIds.has(sc.site_id),
          );
          const siteNames = siteNameMap(sites);
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const valid = meta.filter((i) => !i.canceled);
          const insp30 = valid.filter(
            (i) => now - new Date(i.started_at).getTime() <= 30 * dayMs,
          );
          const redCount = openDamages.filter((d) => d.severity === 'red').length;

          // Fälligkeit wie App, „Vor Ort“ und Excel-Prüfbuch: Prüfung durch die befähigte Person alle 30 Tage, „bald fällig“ ab 14 Tagen, Kalendertage
          const due = dueOverview(GERUESTDEX_EXPORT, { org: orgCtx?.org, sites, units: scaffolds, inspections: meta, openDefects: openDamages });

          return (
            <>
              <PruefErsteSchritte cfg={GERUESTDEX_VOR_ORT} stock={sites.length} first={valid.length > 0} />
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Aktive Baustellen</div>
                  <div className="kpi-value">{activeSites.length}</div>
                  <div className="kpi-sub">{sites.length} insgesamt</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Prüfungen 30 Tage</div>
                  <div className="kpi-value">{insp30.length}</div>
                  <div className="kpi-sub">ohne Stornos</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Offene Mängel</div>
                  <div className="kpi-value">{openDamages.length}</div>
                  <div className="kpi-sub">
                    {redCount > 0
                      ? `davon ${redCount}× Rot — Gerüst sperren!`
                      : 'keine roten Mängel'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Prüfung fällig</div>
                  <div className="kpi-value">{due.due}</div>
                  <div className="kpi-sub">
                    {dueKpiPrefix(due)}von {due.total} aktiven Baustellen ·{' '}
                    {activeScaffolds.length} Gerüste
                  </div>
                </div>
              </div>

              {due.list.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige Prüfungen</h2>
                    <Link to="baustellen" className="small">
                      Alle Baustellen →
                    </Link>
                  </div>
                  <FaelligTabelle due={due} />
                </>
              )}

              <div className="section-head">
                <h2>Letzte Prüfungen</h2>
                <Link to="pruefungen" className="small">
                  Alle Prüfungen →
                </Link>
              </div>
              {recentInspections.length === 0 ? (
                <div className="card empty">
                  Noch keine Prüfungen dokumentiert. Sobald dein Team in der App
                  dokumentiert, erscheint hier alles live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Zeitpunkt</th>
                        <th>Baustelle</th>
                        <th>Prüfart</th>
                        <th>Ergebnis</th>
                        <th>Geprüft von</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInspections.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <Link to={`pruefungen/${i.id}`}>
                              {fmtDateTime(i.started_at)}
                            </Link>
                          </td>
                          <td className="wrap">{siteNames.get(i.site_id) ?? '—'}</td>
                          <td>
                            <InspectionBadge type={i.type} canceled={i.canceled} />
                          </td>
                          <td className="muted wrap">{checklistSummary(i.checklist)}</td>
                          <td className="muted">{i.inspector_name ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
