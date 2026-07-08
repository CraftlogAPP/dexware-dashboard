import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import {
  fetchCustomers,
  fetchDevices,
  fetchInspectionMeta,
  type InspMeta,
} from '../api';
import { DueBadge, ResultBadge } from '../badges';
import { dueStatus, lastInspectionByDevice, nameMap } from '../labels';
import type { Customer, Device } from '../types';

interface OverviewData {
  devices: Device[];
  customers: Customer[];
  meta: InspMeta[];
}

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [devices, customers, meta] = await Promise.all([
      fetchDevices(client),
      fetchCustomers(client),
      fetchInspectionMeta(client, { limit: 2000 }),
    ]);
    return { devices, customers, meta };
  }, [client]);

  return (
    <>
      <h1>Übersicht</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} · Prüffristen im Blick — live aus der PrüfDex-App.
        </p>
      )}

      <LoadGuard state={state}>
        {({ devices, customers, meta }) => {
          const custNames = nameMap(customers);
          const overdue = devices.filter((d) => dueStatus(d.next_due_date) === 'overdue');
          const soon = devices.filter((d) => dueStatus(d.next_due_date) === 'soon');
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const insp30 = meta.filter(
            (i) => now - new Date(i.inspected_at).getTime() <= 30 * dayMs,
          );
          const failed30 = insp30.filter((i) => i.result === 'failed');
          const lastByDevice = lastInspectionByDevice(meta);
          const dueDevices = [...overdue, ...soon];
          const recent = meta.slice(0, 10);
          const devNames = nameMap(devices);

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Geräte</div>
                  <div className="kpi-value">{devices.length}</div>
                  <div className="kpi-sub">{customers.length} Kunden/Standorte</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Überfällig</div>
                  <div className="kpi-value">{overdue.length}</div>
                  <div className="kpi-sub">Prüffrist überschritten</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Bald fällig</div>
                  <div className="kpi-value">{soon.length}</div>
                  <div className="kpi-sub">innerhalb 1 Monat</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Prüfungen 30 Tage</div>
                  <div className="kpi-value">{insp30.length}</div>
                  <div className="kpi-sub">
                    {failed30.length > 0
                      ? `davon ${failed30.length} nicht bestanden`
                      : 'alle bestanden'}
                  </div>
                </div>
              </div>

              {dueDevices.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Fällige Prüfungen</h2>
                    <Link to="geraete" className="small">
                      Alle Geräte →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Gerät</th>
                          <th>Kunde/Standort</th>
                          <th>Letzte Prüfung</th>
                          <th>Nächste Prüfung</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dueDevices.slice(0, 10).map((d) => {
                          const last = lastByDevice.get(d.id);
                          return (
                            <tr key={d.id}>
                              <td>
                                <Link to={`geraete/${d.id}`}>{d.name}</Link>
                              </td>
                              <td className="wrap muted">
                                {d.customer_id
                                  ? (custNames.get(d.customer_id) ?? '—')
                                  : '—'}
                              </td>
                              <td>{last ? fmtDate(last.inspected_at) : '—'}</td>
                              <td>{fmtDate(d.next_due_date)}</td>
                              <td>
                                <DueBadge status={dueStatus(d.next_due_date)} />
                              </td>
                            </tr>
                          );
                        })}
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
              {recent.length === 0 ? (
                <div className="card empty">
                  Noch keine Prüfungen dokumentiert. Sobald in der App geprüft wird,
                  erscheint hier alles live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Gerät</th>
                        <th>Ergebnis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <Link to={`pruefungen/${i.id}`}>
                              {fmtDate(i.inspected_at)}
                            </Link>
                          </td>
                          <td className="wrap">{devNames.get(i.device_id) ?? '—'}</td>
                          <td>
                            <ResultBadge result={i.result} />
                          </td>
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
