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
import { dueOverview } from '../../lib/pruefExport';
import { FaelligTabelle } from '../../pruefen/FaelligTabelle';
import { InspectionBadge } from '../badges';
import { SPIELDEX_EXPORT } from '../exportLists';
import {
  checklistSummary,
  playgroundNameMap,
} from '../labels';
import {
  type Defect,
  type Inspection,
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

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [playgrounds, meta, recentInspections, openDefects] = await Promise.all([
      fetchPlaygrounds(client),
      fetchInspectionMeta(client),
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

          // Fälligkeit wie App, „Vor Ort“ und Excel-Prüfbuch: Hauptinspektion jährlich und operative Kontrolle alle 90 Tage (wie „Vor Ort“), Kalendertage
          const due = dueOverview(SPIELDEX_EXPORT, { org: orgCtx?.org, sites: playgrounds, units: [], inspections: meta });

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
                  <div className="kpi-value">{due.due}</div>
                  <div className="kpi-sub">{due.soon > 0 ? `+ ${due.soon} bald fällig · ` : ''}von {due.total} aktiven Spielplätzen</div>
                </div>
              </div>

              {due.list.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige Kontrollen</h2>
                    <Link to="spielplaetze" className="small">
                      Alle Spielplätze →
                    </Link>
                  </div>
                  <FaelligTabelle due={due} />
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
