import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fetchCustomers, fetchDevices } from '../api';
import { dueStatus } from '../labels';
import type { Customer, Device } from '../types';

interface Data {
  customers: Customer[];
  devices: Device[];
}

export function Customers() {
  const { client } = useAppAuth();

  const state = useAsync<Data>(async () => {
    const [customers, devices] = await Promise.all([
      fetchCustomers(client),
      fetchDevices(client),
    ]);
    return { customers, devices };
  }, [client]);

  return (
    <>
      <h1>Kunden / Standorte</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Für wen geprüft wird — mit Gerätebestand und überfälligen Prüfungen.
        Anlegen und Bearbeiten läuft in der App.
      </p>

      <LoadGuard state={state}>
        {({ customers, devices }) =>
          customers.length === 0 ? (
            <div className="card empty">Noch keine Kunden angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kunde/Standort</th>
                    <th>Adresse</th>
                    <th>Kontakt</th>
                    <th>Geräte</th>
                    <th>Überfällig</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const devs = devices.filter((d) => d.customer_id === c.id);
                    const overdue = devs.filter(
                      (d) => dueStatus(d.next_due_date) === 'overdue',
                    );
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link to={`../geraete?kunde=${c.id}`}>{c.name}</Link>
                        </td>
                        <td className="wrap muted">{c.address ?? '—'}</td>
                        <td className="wrap muted">{c.contact ?? '—'}</td>
                        <td>{devs.length}</td>
                        <td>
                          {overdue.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <span className="badge red">{overdue.length}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </LoadGuard>
    </>
  );
}
