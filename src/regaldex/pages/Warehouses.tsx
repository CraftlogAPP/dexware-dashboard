import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDamages,
  fetchInspectionMeta,
  fetchWarehouses,
  saveWarehouse,
  type InspMeta,
} from '../api';
import { lastInspectionByWarehouse } from '../labels';
import type { Damage, Warehouse } from '../types';

interface Data {
  warehouses: Warehouse[];
  lastByWh: Map<string, InspMeta>;
  openDamages: Damage[];
}

export function Warehouses() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null);

  const state = useAsync<Data>(async () => {
    const [warehouses, meta, openDamages] = await Promise.all([
      fetchWarehouses(client),
      fetchInspectionMeta(client, { limit: 2000 }),
      fetchDamages(client, { status: 'open' }),
    ]);
    return { warehouses, lastByWh: lastInspectionByWarehouse(meta), openDamages };
  }, [client]);

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    await saveWarehouse(
      client,
      org.org.id,
      {
        name: s(v.name),
        address: s(v.address),
        operator_name: orNull(v.operator_name),
        operator_contact: orNull(v.operator_contact),
        notes: orNull(v.notes),
        active: v.active === true,
      },
      editing === 'new' ? undefined : (editing ?? undefined),
    );
    state.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Lager</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Lager anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Lagerstandorte mit letzter Inspektion und offenen Schäden.
      </p>

      <LoadGuard state={state}>
        {({ warehouses, lastByWh, openDamages }) =>
          warehouses.length === 0 ? (
            <div className="card empty">Noch keine Lager angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lager</th>
                    <th>Adresse</th>
                    <th>Betreiber</th>
                    <th>Letzte Inspektion</th>
                    <th>Offene Schäden</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((w) => {
                    const last = lastByWh.get(w.id);
                    const open = openDamages.filter((d) => d.warehouse_id === w.id);
                    const red = open.some((d) => d.severity === 'red');
                    return (
                      <tr key={w.id}>
                        <td>
                          <Link to={w.id}>{w.name}</Link>
                        </td>
                        <td className="wrap muted">{w.address}</td>
                        <td className="wrap muted">{w.operator_name ?? '—'}</td>
                        <td>{last ? fmtDateTime(last.started_at) : '—'}</td>
                        <td>
                          {open.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <span className={`badge ${red ? 'red' : 'amber'}`}>
                              {open.length}
                              {red ? ' · Rot!' : ''}
                            </span>
                          )}
                        </td>
                        <td>
                          <StatusBadge active={w.active} />
                        </td>
                        <td>
                          <button className="btn ghost small" onClick={() => setEditing(w)}>
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
          title={editing === 'new' ? 'Lager anlegen' : `${editing.name} bearbeiten`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'name', label: 'Name', required: true },
            { key: 'address', label: 'Adresse', required: true },
            { key: 'operator_name', label: 'Betreiber' },
            { key: 'operator_contact', label: 'Betreiber-Kontakt' },
            { key: 'notes', label: 'Notizen', kind: 'textarea' },
            { key: 'active', label: 'Aktiv (wird inspiziert)', kind: 'checkbox' },
          ]}
          initial={
            editing === 'new'
              ? { active: true }
              : {
                  name: editing.name,
                  address: editing.address,
                  operator_name: editing.operator_name ?? '',
                  operator_contact: editing.operator_contact ?? '',
                  notes: editing.notes ?? '',
                  active: editing.active,
                }
          }
        />
      )}
    </>
  );
}
