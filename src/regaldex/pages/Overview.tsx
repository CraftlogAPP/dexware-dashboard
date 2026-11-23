import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { PruefErsteSchritte } from '../../components/ErsteSchritte';
import { REGALDEX_VOR_ORT } from '../vorOrt';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDamages,
  fetchInspectionMeta,
  fetchInspections,
  fetchWarehouses,
  type InspMeta,
} from '../api';
import { dueKpiPrefix, dueOverview } from '../../lib/pruefExport';
import { FaelligTabelle } from '../../pruefen/FaelligTabelle';
import { InspectionBadge } from '../badges';
import { REGALDEX_EXPORT } from '../exportLists';
import {
  checklistSummary,
  warehouseNameMap,
} from '../labels';
import {
  type Damage,
  type Inspection,
  type Warehouse,
} from '../types';

interface OverviewData {
  warehouses: Warehouse[];
  /** schmale Metadaten (bis 2000 jüngste Inspektionen) für KPIs + Fälligkeit */
  meta: InspMeta[];
  /** die 10 jüngsten Inspektionen in voller Breite für die Tabelle */
  recentInspections: Inspection[];
  openDamages: Damage[];
}

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [warehouses, meta, recentInspections, openDamages] = await Promise.all([
      fetchWarehouses(client),
      fetchInspectionMeta(client),
      fetchInspections(client, { limit: 10 }),
      fetchDamages(client, { status: 'open' }),
    ]);
    return { warehouses, meta, recentInspections, openDamages };
  }, [client]);

  return (
    <>
      <h1>Übersicht</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} · Prüfpflichten im Blick — live aus der RegalDex-App.
        </p>
      )}

      <LoadGuard state={state}>
        {({ warehouses, meta, recentInspections, openDamages }) => {
          const activeWhs = warehouses.filter((w) => w.active);
          const names = warehouseNameMap(warehouses);
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const valid = meta.filter((i) => !i.canceled);
          const insp7 = valid.filter(
            (i) => now - new Date(i.started_at).getTime() <= 7 * dayMs,
          );
          const redCount = openDamages.filter((d) => d.severity === 'red').length;

          // Fälligkeit wie App, „Vor Ort“ und Excel-Prüfbuch: Experteninspektion jährlich, Kalendertage
          const due = dueOverview(REGALDEX_EXPORT, { org: orgCtx?.org, sites: warehouses, units: [], inspections: meta, openDefects: openDamages });

          return (
            <>
              <PruefErsteSchritte cfg={REGALDEX_VOR_ORT} stock={warehouses.length} first={valid.length > 0} />
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Aktive Lager</div>
                  <div className="kpi-value">{activeWhs.length}</div>
                  <div className="kpi-sub">{warehouses.length} insgesamt</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Inspektionen 7 Tage</div>
                  <div className="kpi-value">{insp7.length}</div>
                  <div className="kpi-sub">ohne Stornos</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Offene Schäden</div>
                  <div className="kpi-value">{openDamages.length}</div>
                  <div className="kpi-sub">
                    {redCount > 0 ? `davon ${redCount}× Rot — sperren!` : 'keine roten Schäden'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Inspektion fällig</div>
                  <div className="kpi-value">{due.due}</div>
                  <div className="kpi-sub">{dueKpiPrefix(due)}von {due.total} aktiven Lagern</div>
                </div>
              </div>

              {due.list.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige Inspektionen</h2>
                    <Link to="lager" className="small">
                      Alle Lager →
                    </Link>
                  </div>
                  <FaelligTabelle due={due} />
                </>
              )}

              <div className="section-head">
                <h2>Letzte Inspektionen</h2>
                <Link to="inspektionen" className="small">
                  Alle Inspektionen →
                </Link>
              </div>
              {recentInspections.length === 0 ? (
                <div className="card empty">
                  Noch keine Inspektionen dokumentiert. Sobald dein Team in der App
                  dokumentiert, erscheint hier alles live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Zeitpunkt</th>
                        <th>Lager</th>
                        <th>Inspektionsart</th>
                        <th>Ergebnis</th>
                        <th>Kontrolliert von</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInspections.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <Link to={`inspektionen/${i.id}`}>
                              {fmtDateTime(i.started_at)}
                            </Link>
                          </td>
                          <td className="wrap">{names.get(i.warehouse_id) ?? '—'}</td>
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
