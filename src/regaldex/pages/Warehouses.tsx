import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDamages,
  fetchInspectionMeta,
  fetchWarehouses,
  type InspMeta,
} from '../api';
import { lastInspectionByWarehouse } from '../labels';
import { WarehouseDialog } from '../dialogs';
import type { Damage, Warehouse } from '../types';

interface Data {
  warehouses: Warehouse[];
  lastByWh: Map<string, InspMeta>;
  openDamages: Damage[];
}

export function Warehouses() {
  const { client } = useAppAuth();
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null);

  const state = useAsync<Data>(async () => {
    const [warehouses, meta, openDamages] = await Promise.all([
      fetchWarehouses(client),
      fetchInspectionMeta(client, { limit: 2000 }),
      fetchDamages(client, { status: 'open' }),
    ]);
    return { warehouses, lastByWh: lastInspectionByWarehouse(meta), openDamages };
  }, [client]);

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
        <WarehouseDialog
          warehouse={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            state.reload();
          }}
        />
      )}
    </>
  );
}
