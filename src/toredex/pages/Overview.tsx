import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDefects,
  fetchGates,
  fetchInspectionMeta,
  fetchInspections,
  fetchSites,
  type InspMeta,
} from '../api';
import { dueOverview } from '../../lib/pruefExport';
import { FaelligTabelle } from '../../pruefen/FaelligTabelle';
import { InspectionBadge } from '../badges';
import { TOREDEX_EXPORT } from '../exportLists';
import {
  checklistSummary,
  gateNameMap,
  siteNameMap,
} from '../labels';
import {
  type Defect,
  type Gate,
  type Inspection,
  type Site,
} from '../types';

interface OverviewData {
  sites: Site[];
  gates: Gate[];
  /** schmale Metadaten (bis 2000 jüngste Prüfungen) für KPIs + Fälligkeit */
  meta: InspMeta[];
  /** die 10 jüngsten Prüfungen in voller Breite für die Tabelle */
  recentInspections: Inspection[];
  openDefects: Defect[];
}

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [sites, gates, meta, recentInspections, openDefects] =
      await Promise.all([
        fetchSites(client),
        fetchGates(client),
        fetchInspectionMeta(client),
        fetchInspections(client, { limit: 10 }),
        fetchDefects(client, { status: 'open' }),
      ]);
    return { sites, gates, meta, recentInspections, openDefects };
  }, [client]);

  return (
    <>
      <h1>Übersicht</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} · Prüfpflichten im Blick — live aus der ToreDex-App.
        </p>
      )}

      <LoadGuard state={state}>
        {({ sites, gates, meta, recentInspections, openDefects }) => {
          const activeSites = sites.filter((s) => s.active);
          const siteNames = siteNameMap(sites);
          const gateNames = gateNameMap(gates);
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const valid = meta.filter((i) => !i.canceled);
          const insp30 = valid.filter(
            (i) => now - new Date(i.started_at).getTime() <= 30 * dayMs,
          );
          const redCount = openDefects.filter((d) => d.severity === 'red').length;

          // Fälligkeit wie App, „Vor Ort“ und Excel-Prüfbuch: Sachkundigen-Prüfung jährlich, Kalendertage
          const due = dueOverview(TOREDEX_EXPORT, { org: orgCtx?.org, sites, units: gates, inspections: meta });

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Aktive Objekte</div>
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
                  <div className="kpi-value">{openDefects.length}</div>
                  <div className="kpi-sub">
                    {redCount > 0
                      ? `davon ${redCount}× Rot — Tor stilllegen!`
                      : 'keine roten Mängel'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Prüfung fällig</div>
                  <div className="kpi-value">{due.due}</div>
                  <div className="kpi-sub">
                    {due.soon > 0 ? `+ ${due.soon} bald fällig · ` : ''}von {due.total} aktiven Toren
                  </div>
                </div>
              </div>

              {due.list.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige Prüfungen</h2>
                    <Link to="objekte" className="small">
                      Alle Objekte →
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
                        <th>Objekt</th>
                        <th>Tor</th>
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
                          <td className="wrap muted">
                            {gateNames.get(i.gate_id) ?? '—'}
                          </td>
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
