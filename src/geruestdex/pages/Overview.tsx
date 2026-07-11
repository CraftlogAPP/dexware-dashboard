import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDamages,
  fetchInspectionMeta,
  fetchInspections,
  fetchScaffolds,
  fetchSites,
  type InspMeta,
} from '../api';
import { InspectionBadge } from '../badges';
import { checklistSummary, lastInspectionByType, siteNameMap } from '../labels';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
  type Damage,
  type Inspection,
  type InspectionType,
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

const DUE_TYPES: InspectionType[] = ['visual', 'expert'];

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [sites, scaffolds, meta, recentInspections, openDamages] =
      await Promise.all([
        fetchSites(client),
        fetchScaffolds(client),
        fetchInspectionMeta(client, { limit: 2000 }),
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

          // Fälligkeit hängt an der BAUSTELLE (Prüfung ist je Baustelle
          // dokumentiert): Inaugenscheinnahme arbeitstäglich (1 T),
          // Prüfung durch befähigte Person alle 30 T.
          const lastByType = lastInspectionByType(meta);
          const isOverdue = (site: Site, type: InspectionType): boolean => {
            const last = lastByType.get(`${site.id}:${type}`);
            return (
              !last ||
              now - new Date(last.started_at).getTime() >
                INSPECTION_INTERVAL_DAYS[type] * dayMs
            );
          };
          const dueSites = activeSites.filter((s) =>
            DUE_TYPES.some((t) => isOverdue(s, t)),
          );

          return (
            <>
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
                  <div className="kpi-value">{dueSites.length}</div>
                  <div className="kpi-sub">
                    von {activeSites.length} aktiven Baustellen ·{' '}
                    {activeScaffolds.length} Gerüste
                  </div>
                </div>
              </div>

              {dueSites.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige Prüfungen</h2>
                    <Link to="baustellen" className="small">
                      Alle Baustellen →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Baustelle</th>
                          <th>Adresse</th>
                          {DUE_TYPES.map((t) => (
                            <th key={t}>
                              {INSPECTION_SHORT[t]} (alle{' '}
                              {INSPECTION_INTERVAL_DAYS[t]} T)
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dueSites.slice(0, 8).map((s) => (
                          <tr key={s.id}>
                            <td>
                              <Link to={`baustellen/${s.id}`}>{s.name}</Link>
                            </td>
                            <td className="wrap muted">{s.address}</td>
                            {DUE_TYPES.map((t) => {
                              const last = lastByType.get(`${s.id}:${t}`);
                              return (
                                <td key={t}>
                                  {last ? (
                                    fmtDateTime(last.started_at)
                                  ) : (
                                    <span className="muted">noch nie</span>
                                  )}{' '}
                                  {isOverdue(s, t) && (
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
