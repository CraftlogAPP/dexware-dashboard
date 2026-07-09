import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fetchCustomers, fetchDevices, saveCustomer } from '../api';
import { dueStatus } from '../labels';
import type { Customer, Device } from '../types';

interface Data {
  customers: Customer[];
  devices: Device[];
}

export function Customers() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);

  const state = useAsync<Data>(async () => {
    const [customers, devices] = await Promise.all([
      fetchCustomers(client),
      fetchDevices(client),
    ]);
    return { customers, devices };
  }, [client]);

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    await saveCustomer(
      client,
      org.org.id,
      {
        name: s(v.name),
        address: orNull(v.address),
        contact: orNull(v.contact),
      },
      editing === 'new' ? undefined : (editing ?? undefined),
    );
    state.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Kunden / Standorte</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Kunde anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Für wen geprüft wird — mit Gerätebestand und überfälligen Prüfungen.
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
                    <th></th>
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
                        <td>
                          <button className="btn ghost small" onClick={() => setEditing(c)}>
                            Bearbeiten
                          </button>
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

      {editing && (
        <FormDialog
          title={editing === 'new' ? 'Kunde anlegen' : `${editing.name} bearbeiten`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'name', label: 'Name', required: true },
            { key: 'address', label: 'Adresse' },
            { key: 'contact', label: 'Kontakt', placeholder: 'z. B. Telefon oder E-Mail' },
          ]}
          initial={
            editing === 'new'
              ? {}
              : {
                  name: editing.name,
                  address: editing.address ?? '',
                  contact: editing.contact ?? '',
                }
          }
        />
      )}
    </>
  );
}
