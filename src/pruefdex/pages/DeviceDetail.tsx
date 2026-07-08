import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchCustomers, fetchDevice, fetchInspections } from '../api';
import { DueBadge, ResultBadge } from '../badges';
import { dueStatus, nameMap, skLabel } from '../labels';
import type { Customer, Device, Inspection } from '../types';

interface Data {
  device: Device | null;
  customers: Customer[];
  inspections: Inspection[];
}

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();

  const state = useAsync<Data>(async () => {
    const [device, customers, inspections] = await Promise.all([
      fetchDevice(client, id!),
      fetchCustomers(client),
      fetchInspections(client, { deviceId: id, limit: 200 }),
    ]);
    return { device, customers, inspections };
  }, [client, id]);

  return (
    <LoadGuard state={state}>
      {({ device, customers, inspections }) => {
        if (!device) {
          return <div className="error-box">Gerät nicht gefunden.</div>;
        }
        const custNames = nameMap(customers);
        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../geraete">← Alle Geräte</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>{device.name}</h1>
              <DueBadge status={dueStatus(device.next_due_date)} />
            </div>
            <p className="muted">
              {device.device_type ?? '—'}
              {device.customer_id
                ? ` · ${custNames.get(device.customer_id) ?? ''}`
                : ''}
            </p>

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">QR/Etikett</div>
                <div className="mono">{device.qr_code ?? '—'}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Hersteller / Seriennummer</div>
                <div>{device.manufacturer ?? '—'}</div>
                <div className="muted small mono">{device.serial_number ?? ''}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Schutzklasse / Intervall</div>
                <div>
                  {skLabel(device.protection_class)} · alle {device.interval_months}{' '}
                  Monate
                </div>
              </div>
              <div className="card">
                <div className="kpi-label">Nächste Prüfung</div>
                <div>{device.next_due_date ? fmtDate(device.next_due_date) : '—'}</div>
                <div className="muted small">{device.location_note ?? ''}</div>
              </div>
            </div>

            <div className="section-head">
              <h2>Prüf-Historie ({inspections.length})</h2>
            </div>
            {inspections.length === 0 ? (
              <div className="card empty">
                Für dieses Gerät ist noch keine Prüfung dokumentiert.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Ergebnis</th>
                      <th>Nächste Fälligkeit</th>
                      <th>Geprüft von</th>
                      <th>Notizen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link to={`../pruefungen/${i.id}`}>
                            {fmtDate(i.inspected_at)}
                          </Link>
                        </td>
                        <td>
                          <ResultBadge result={i.result} />
                        </td>
                        <td className="muted">
                          {i.next_due_date ? fmtDate(i.next_due_date) : '—'}
                        </td>
                        <td className="muted">{i.inspector_name ?? '—'}</td>
                        <td className="wrap muted small">{i.notes ?? '—'}</td>
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
  );
}
