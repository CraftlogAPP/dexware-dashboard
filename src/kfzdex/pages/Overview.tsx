import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import {
  fetchDrivers,
  fetchLicenseChecks,
  fetchUvvInspections,
  fetchVehicles,
} from '../api';
import { DueBadge, dueLabel, ResultBadge } from '../badges';
import { fleetHealth, licenseDue, uvvDue } from '../due';
import type { Driver, LicenseCheck, UvvInspection, Vehicle } from '../types';
import { VEHICLE_TYPE_LABEL } from '../types';

interface OverviewData {
  vehicles: Vehicle[];
  drivers: Driver[];
  inspections: UvvInspection[];
  checks: LicenseCheck[];
}

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [vehicles, drivers, inspections, checks] = await Promise.all([
      fetchVehicles(client),
      fetchDrivers(client),
      fetchUvvInspections(client, { limit: 10 }),
      fetchLicenseChecks(client, { limit: 10 }),
    ]);
    return { vehicles, drivers, inspections, checks };
  }, [client]);

  return (
    <>
      <h1>Übersicht</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} · UVV- und Kontroll-Fristen — live aus der KfzDex-App.
        </p>
      )}

      <LoadGuard state={state}>
        {({ vehicles, drivers, inspections, checks }) => {
          const activeDrivers = drivers.filter((d) => d.active);
          const health = fleetHealth(vehicles, activeDrivers);

          const dueVehicles = vehicles
            .map((v) => ({ v, due: uvvDue(v) }))
            .filter(({ due }) => due.status !== 'ok')
            .sort(
              (a, b) =>
                (a.due.dueDate?.getTime() ?? 0) - (b.due.dueDate?.getTime() ?? 0),
            );
          const dueDrivers = activeDrivers
            .map((d) => ({ d, due: licenseDue(d) }))
            .filter(({ due }) => due.status !== 'ok')
            .sort(
              (a, b) =>
                (a.due.dueDate?.getTime() ?? 0) - (b.due.dueDate?.getTime() ?? 0),
            );

          const vehicleName = (id: string) => {
            const v = vehicles.find((x) => x.id === id);
            return v ? v.plate : '—';
          };
          const driverName = (id: string) =>
            drivers.find((x) => x.id === id)?.name ?? '—';

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Fahrzeuge</div>
                  <div className="kpi-value">{vehicles.length}</div>
                  <div className="kpi-sub">im Fuhrpark</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Aktive Fahrer</div>
                  <div className="kpi-value">{activeDrivers.length}</div>
                  <div className="kpi-sub">
                    {drivers.length - activeDrivers.length > 0
                      ? `+ ${drivers.length - activeDrivers.length} inaktiv`
                      : 'alle aktiv'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Überfällig</div>
                  <div className="kpi-value">{health.overdue}</div>
                  <div className="kpi-sub">
                    {health.soon > 0
                      ? `+ ${health.soon} bald fällig`
                      : 'UVV + Kontrollen'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Fuhrpark-Gesundheit</div>
                  <div className="kpi-value">
                    {health.score == null ? '—' : `${Math.round(health.score * 100)} %`}
                  </div>
                  <div className="kpi-sub">
                    {health.total} Pflichten (UVV + Kontrollen)
                  </div>
                </div>
              </div>

              {dueVehicles.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige UVV-Prüfungen</h2>
                    <Link to="fahrzeuge" className="small">
                      Alle Fahrzeuge →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Kennzeichen</th>
                          <th>Fahrzeug</th>
                          <th>Letzte UVV</th>
                          <th>Fällig</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dueVehicles.slice(0, 10).map(({ v, due }) => (
                          <tr key={v.id}>
                            <td>
                              <Link to={`fahrzeuge/${v.id}`}>{v.plate}</Link>
                            </td>
                            <td className="wrap muted">
                              {v.name ?? VEHICLE_TYPE_LABEL[v.type]}
                            </td>
                            <td className="muted">{fmtDate(v.last_uvv)}</td>
                            <td className="muted">{dueLabel(due)}</td>
                            <td>
                              <DueBadge status={due.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {dueDrivers.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige Führerscheinkontrollen</h2>
                    <Link to="fahrer" className="small">
                      Alle Fahrer →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Fahrer</th>
                          <th>Intervall</th>
                          <th>Letzte Kontrolle</th>
                          <th>Fällig</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dueDrivers.slice(0, 10).map(({ d, due }) => (
                          <tr key={d.id}>
                            <td>
                              <Link to={`fahrer/${d.id}`}>{d.name}</Link>
                            </td>
                            <td className="muted">alle {d.check_interval_months} Monate</td>
                            <td className="muted">{fmtDate(d.last_check)}</td>
                            <td className="muted">{dueLabel(due)}</td>
                            <td>
                              <DueBadge status={due.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="section-head">
                <h2>Letzte UVV-Prüfungen</h2>
              </div>
              {inspections.length === 0 ? (
                <div className="card empty">
                  Noch keine UVV-Prüfungen erfasst. Prüfungen aus der KfzDex-App
                  erscheinen hier live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Fahrzeug</th>
                        <th>Prüfer</th>
                        <th>Ergebnis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspections.map((i) => (
                        <tr key={i.id}>
                          <td className="muted">{fmtDate(i.date)}</td>
                          <td>
                            <Link to={`fahrzeuge/${i.vehicle_id}`}>
                              {vehicleName(i.vehicle_id)}
                            </Link>
                          </td>
                          <td className="wrap">{i.inspector}</td>
                          <td>
                            <ResultBadge result={i.result} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {checks.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Letzte Führerscheinkontrollen</h2>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Fahrer</th>
                          <th>Kontrolliert von</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checks.map((c) => (
                          <tr key={c.id}>
                            <td className="muted">{fmtDate(c.date)}</td>
                            <td>
                              <Link to={`fahrer/${c.driver_id}`}>
                                {driverName(c.driver_id)}
                              </Link>
                            </td>
                            <td className="wrap">{c.checked_by}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
