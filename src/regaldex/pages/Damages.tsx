import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { fetchDamages, fetchRacks, fetchWarehouses } from '../api';
import { DamageStatusBadge, SeverityBadge } from '../badges';
import { rackNameMap, warehouseNameMap } from '../labels';
import type { Damage, DamageStatus } from '../types';

export function Damages() {
  const { client } = useAppAuth();
  const [warehouseId, setWarehouseId] = useState('');
  const [status, setStatus] = useState<'' | DamageStatus>('open');

  // Stammdaten für Namens-Auflösung — einmal laden, nicht pro Filterwechsel.
  const baseState = useAsync(async () => {
    const [warehouses, racks] = await Promise.all([
      fetchWarehouses(client),
      fetchRacks(client),
    ]);
    return { warehouses, racks };
  }, [client]);

  const damagesState = useAsync<Damage[]>(
    () =>
      fetchDamages(client, {
        warehouseId: warehouseId || undefined,
        status: status || undefined,
      }),
    [client, warehouseId, status],
  );

  return (
    <>
      <h1>Schäden</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Gemeldete Schäden im Ampelverfahren (DIN EN 15635) mit Instandsetzungs-Vermerk
        — Behebung läuft additiv über die App, nichts wird gelöscht.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Lager
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Alle Lager</option>
              {(baseState.data?.warehouses ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | DamageStatus)}
            >
              <option value="open">Nur offene</option>
              <option value="resolved">Nur behobene</option>
              <option value="">Alle</option>
            </select>
          </label>
        </div>
      </div>

      <LoadGuard state={damagesState}>
        {(damages) => {
          const whNames = warehouseNameMap(baseState.data?.warehouses ?? []);
          const rackNames = rackNameMap(baseState.data?.racks ?? []);
          return damages.length === 0 ? (
            <div className="card empty">Keine Schäden mit den gewählten Filtern. 👍</div>
          ) : (
            <>
              <p className="muted small">{damages.length} Schäden</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gemeldet</th>
                      <th>Lager</th>
                      <th>Schaden</th>
                      <th>Ort / Regalzeile</th>
                      <th>Gefährdung</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {damages.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {fmtDateTime(d.created_at)}
                          {d.reporter_name && (
                            <div className="muted small">von {d.reporter_name}</div>
                          )}
                        </td>
                        <td className="wrap">
                          <Link to={`../lager/${d.warehouse_id}`}>
                            {whNames.get(d.warehouse_id) ?? '—'}
                          </Link>
                        </td>
                        <td className="wrap">
                          {d.title}
                          {d.description && (
                            <div className="muted small">{d.description}</div>
                          )}
                          {d.rack_blocked && (
                            <div>
                              <span className="badge red">Feld/Zeile gesperrt</span>
                            </div>
                          )}
                        </td>
                        <td className="muted">
                          {d.rack_id
                            ? (rackNames.get(d.rack_id) ?? 'Regalzeile')
                            : 'Lager allgemein'}
                        </td>
                        <td>
                          <SeverityBadge severity={d.severity} />
                        </td>
                        <td>
                          <DamageStatusBadge status={d.status} />
                          {d.status === 'resolved' && (
                            <div className="muted small">
                              {fmtDateTime(d.resolved_at)}
                              {d.resolver_name ? ` · ${d.resolver_name}` : ''}
                              {d.resolution_note ? ` — ${d.resolution_note}` : ''}
                            </div>
                          )}
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
