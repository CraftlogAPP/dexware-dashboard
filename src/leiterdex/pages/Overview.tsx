import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDefects,
  fetchInspectionMeta,
  fetchInspections,
  fetchLadders,
  fetchSites,
  type InspMeta,
} from '../api';
import { InspectionBadge } from '../badges';
import {
  checklistSummary,
  ladderNameMap,
  lastInspectionByType,
  siteNameMap,
} from '../labels';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
  type Defect,
  type Inspection,
  type InspectionType,
  type Ladder,
  type Site,
} from '../types';

interface OverviewData {
  sites: Site[];
  ladders: Ladder[];
  /** schmale Metadaten (bis 2000 jüngste Prüfungen) für KPIs + Fälligkeit */
  meta: InspMeta[];
  /** die 10 jüngsten Prüfungen in voller Breite für die Tabelle */
  recentInspections: Inspection[];
  openDefects: Defect[];
}

const DUE_TYPES: InspectionType[] = ['visual', 'expert'];

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [sites, ladders, meta, recentInspections, openDefects] = await Promise.all([
      fetchSites(client),
      fetchLadders(client),
      fetchInspectionMeta(client, { limit: 2000 }),
      fetchInspections(client, { limit: 10 }),
      fetchDefects(client, { status: 'open' }),
    ]);
    return { sites, ladders, meta, recentInspections, openDefects };
  }, [client]);

  return (
    <>
      <h1>Übersicht</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} · Prüfpflichten im Blick — live aus der LeiterDex-App.
        </p>
      )}

      <LoadGuard state={state}>
        {({ sites, ladders, meta, recentInspections, openDefects }) => {
          const activeSites = sites.filter((s) => s.active);
          const activeSiteIds = new Set(activeSites.map((s) => s.id));
          const activeLadders = ladders.filter(
            (l) => !l.retired && activeSiteIds.has(l.site_id),
          );
          const siteNames = siteNameMap(sites);
          const ladderNames = ladderNameMap(ladders);
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const valid = meta.filter((i) => !i.canceled);
          const insp30 = valid.filter(
            (i) => now - new Date(i.started_at).getTime() <= 30 * dayMs,
          );
          const redCount = openDefects.filter((d) => d.severity === 'red').length;

          const lastByType = lastInspectionByType(meta);
          const isOverdue = (ladder: Ladder, type: InspectionType): boolean => {
            const last = lastByType.get(`${ladder.id}:${type}`);
            return (
              !last ||
              now - new Date(last.started_at).getTime() >
                INSPECTION_INTERVAL_DAYS[type] * dayMs
            );
          };
          const dueLadders = activeLadders.filter((l) =>
            DUE_TYPES.some((t) => isOverdue(l, t)),
          );

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Aktive Standorte</div>
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
                      ? `davon ${redCount}× Rot — aussondern!`
                      : 'keine roten Mängel'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Prüfung fällig</div>
                  <div className="kpi-value">{dueLadders.length}</div>
                  <div className="kpi-sub">von {activeLadders.length} aktiven Leitern</div>
                </div>
              </div>

              {dueLadders.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige Prüfungen</h2>
                    <Link to="leitern" className="small">
                      Alle Leitern →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Leiter</th>
                          <th>Standort</th>
                          {DUE_TYPES.map((t) => (
                            <th key={t}>
                              {INSPECTION_SHORT[t]} (alle {INSPECTION_INTERVAL_DAYS[t]} T)
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dueLadders.slice(0, 8).map((l) => (
                          <tr key={l.id}>
                            <td>
                              <Link to={`standorte/${l.site_id}`}>{l.name}</Link>
                            </td>
                            <td className="wrap muted">
                              {siteNames.get(l.site_id) ?? '—'}
                            </td>
                            {DUE_TYPES.map((t) => {
                              const last = lastByType.get(`${l.id}:${t}`);
                              return (
                                <td key={t}>
                                  {last ? (
                                    fmtDateTime(last.started_at)
                                  ) : (
                                    <span className="muted">noch nie</span>
                                  )}{' '}
                                  {isOverdue(l, t) && (
                                    <span className="badge red">überfällig</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                        <th>Standort</th>
                        <th>Leiter</th>
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
                            {ladderNames.get(i.ladder_id) ?? '—'}
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
