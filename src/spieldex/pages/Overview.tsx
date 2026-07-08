import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDefects,
  fetchInspectionMeta,
  fetchInspections,
  fetchPlaygrounds,
  type InspMeta,
} from '../api';
import { InspectionBadge } from '../badges';
import {
  checklistSummary,
  lastInspectionByType,
  playgroundNameMap,
} from '../labels';
import {
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_SHORT,
  type Defect,
  type Inspection,
  type InspectionType,
  type Playground,
} from '../types';

interface OverviewData {
  playgrounds: Playground[];
  /** schmale Metadaten (bis 2000 jüngste Kontrollen) für KPIs + Fälligkeit */
  meta: InspMeta[];
  /** die 10 jüngsten Kontrollen in voller Breite für die Tabelle */
  recentInspections: Inspection[];
  openDefects: Defect[];
}

const DUE_TYPES: InspectionType[] = ['visual', 'operational', 'main'];

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [playgrounds, meta, recentInspections, openDefects] = await Promise.all([
      fetchPlaygrounds(client),
      fetchInspectionMeta(client, { limit: 2000 }),
      fetchInspections(client, { limit: 10 }),
      fetchDefects(client, { status: 'open' }),
    ]);
    return { playgrounds, meta, recentInspections, openDefects };
  }, [client]);

  return (
    <>
      <h1>Übersicht</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} · Kontrollpflichten im Blick — live aus der SpielDex-App.
        </p>
      )}

      <LoadGuard state={state}>
        {({ playgrounds, meta, recentInspections, openDefects }) => {
          const activePgs = playgrounds.filter((p) => p.active);
          const names = playgroundNameMap(playgrounds);
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const valid = meta.filter((i) => !i.canceled);
          const insp7 = valid.filter(
            (i) => now - new Date(i.started_at).getTime() <= 7 * dayMs,
          );
          const dangerCount = openDefects.filter((d) => d.severity === 'danger').length;

          const lastByType = lastInspectionByType(meta);
          const isOverdue = (pg: Playground, type: InspectionType): boolean => {
            const last = lastByType.get(`${pg.id}:${type}`);
            return (
              !last ||
              now - new Date(last.started_at).getTime() >
                INSPECTION_INTERVAL_DAYS[type] * dayMs
            );
          };
          const duePgs = activePgs.filter((p) =>
            DUE_TYPES.some((t) => isOverdue(p, t)),
          );

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Aktive Spielplätze</div>
                  <div className="kpi-value">{activePgs.length}</div>
                  <div className="kpi-sub">{playgrounds.length} insgesamt</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Kontrollen 7 Tage</div>
                  <div className="kpi-value">{insp7.length}</div>
                  <div className="kpi-sub">ohne Stornos</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Offene Mängel</div>
                  <div className="kpi-value">{openDefects.length}</div>
                  <div className="kpi-sub">
                    {dangerCount > 0 ? `davon ${dangerCount}× Gefahr!` : 'keine Gefahrenstufe'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Kontrolle fällig</div>
                  <div className="kpi-value">{duePgs.length}</div>
                  <div className="kpi-sub">von {activePgs.length} aktiven Spielplätzen</div>
                </div>
              </div>

              {duePgs.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige Kontrollen</h2>
                    <Link to="spielplaetze" className="small">
                      Alle Spielplätze →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Spielplatz</th>
                          {DUE_TYPES.map((t) => (
                            <th key={t}>
                              {INSPECTION_SHORT[t]} (alle {INSPECTION_INTERVAL_DAYS[t]} T)
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {duePgs.slice(0, 8).map((p) => (
                          <tr key={p.id}>
                            <td>
                              <Link to={`spielplaetze/${p.id}`}>{p.name}</Link>
                            </td>
                            {DUE_TYPES.map((t) => {
                              const last = lastByType.get(`${p.id}:${t}`);
                              return (
                                <td key={t}>
                                  {last ? (
                                    fmtDateTime(last.started_at)
                                  ) : (
                                    <span className="muted">noch nie</span>
                                  )}{' '}
                                  {isOverdue(p, t) && (
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
                <h2>Letzte Kontrollen</h2>
                <Link to="kontrollen" className="small">
                  Alle Kontrollen →
                </Link>
              </div>
              {recentInspections.length === 0 ? (
                <div className="card empty">
                  Noch keine Kontrollen dokumentiert. Sobald dein Team in der App
                  dokumentiert, erscheint hier alles live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Zeitpunkt</th>
                        <th>Spielplatz</th>
                        <th>Kontrollart</th>
                        <th>Ergebnis</th>
                        <th>Kontrolliert von</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInspections.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <Link to={`kontrollen/${i.id}`}>
                              {fmtDateTime(i.started_at)}
                            </Link>
                          </td>
                          <td className="wrap">{names.get(i.playground_id) ?? '—'}</td>
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
