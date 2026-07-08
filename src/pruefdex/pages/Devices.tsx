import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchCustomers, fetchDevices } from '../api';
import { DueBadge } from '../badges';
import { dueStatus, nameMap, skLabel, type DueStatus } from '../labels';
import type { Device } from '../types';

export function Devices() {
  const { client } = useAppAuth();
  const [params] = useSearchParams();
  const [customerId, setCustomerId] = useState(params.get('kunde') ?? '');
  const [due, setDue] = useState<'' | DueStatus>('');

  // Kundenliste ändert sich durch Filter nicht — einmal laden.
  const custState = useAsync(() => fetchCustomers(client), [client]);

  const devState = useAsync<Device[]>(
    () => fetchDevices(client, { customerId: customerId || undefined }),
    [client, customerId],
  );

  return (
    <>
      <h1>Geräte</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Ortsveränderliche elektrische Betriebsmittel mit Prüffristen-Ampel —
        sortiert nach Fälligkeit.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Kunde/Standort
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Alle Kunden</option>
              {(custState.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            Fälligkeit
            <select value={due} onChange={(e) => setDue(e.target.value as '' | DueStatus)}>
              <option value="">Alle</option>
              <option value="overdue">Überfällig</option>
              <option value="soon">Bald fällig</option>
              <option value="ok">Frist ok</option>
              <option value="none">Ungeprüft</option>
            </select>
          </label>
        </div>
      </div>

      <LoadGuard state={devState}>
        {(allDevices) => {
          const custNames = nameMap(custState.data ?? []);
          const devices = due
            ? allDevices.filter((d) => dueStatus(d.next_due_date) === due)
            : allDevices;
          return devices.length === 0 ? (
            <div className="card empty">Keine Geräte mit den gewählten Filtern.</div>
          ) : (
            <>
              <p className="muted small">{devices.length} Geräte</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gerät</th>
                      <th>QR/Etikett</th>
                      <th>Schutzklasse</th>
                      <th>Kunde/Standort</th>
                      <th>Nächste Prüfung</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <Link to={d.id}>{d.name}</Link>
                          {d.device_type && (
                            <div className="muted small">{d.device_type}</div>
                          )}
                        </td>
                        <td className="mono small muted">{d.qr_code ?? '—'}</td>
                        <td className="muted">{skLabel(d.protection_class)}</td>
                        <td className="wrap muted">
                          {d.customer_id ? (custNames.get(d.customer_id) ?? '—') : '—'}
                        </td>
                        <td>{d.next_due_date ? fmtDate(d.next_due_date) : '—'}</td>
                        <td>
                          <DueBadge status={dueStatus(d.next_due_date)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
