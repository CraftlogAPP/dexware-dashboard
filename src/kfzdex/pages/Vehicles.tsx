import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchVehicles } from '../api';
import { DueBadge, dueLabel } from '../badges';
import { uvvDue } from '../due';
import type { Vehicle, VehicleType } from '../types';
import { VEHICLE_TYPE_LABEL } from '../types';

export function Vehicles() {
  const { client } = useAppAuth();
  const [type, setType] = useState<'' | VehicleType>('');
  const [search, setSearch] = useState('');

  const state = useAsync<Vehicle[]>(() => fetchVehicles(client), [client]);

  return (
    <>
      <h1>Fahrzeuge</h1>

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Kennzeichen oder Bezeichnung suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={type} onChange={(e) => setType(e.target.value as '' | VehicleType)}>
          <option value="">Alle Typen</option>
          {(Object.keys(VEHICLE_TYPE_LABEL) as VehicleType[]).map((t) => (
            <option key={t} value={t}>
              {VEHICLE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      <LoadGuard state={state}>
        {(vehicles) => {
          const q = search.trim().toLowerCase();
          const filtered = vehicles.filter(
            (v) =>
              (!type || v.type === type) &&
              (!q ||
                v.plate.toLowerCase().includes(q) ||
                (v.name ?? '').toLowerCase().includes(q)),
          );

          if (filtered.length === 0) {
            return (
              <div className="card empty">
                {vehicles.length === 0
                  ? 'Noch keine Fahrzeuge im Fuhrpark. Lege sie in der KfzDex-App an.'
                  : 'Keine Fahrzeuge für diesen Filter.'}
              </div>
            );
          }

          return (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kennzeichen</th>
                    <th>Bezeichnung</th>
                    <th>Typ</th>
                    <th>Erstzulassung</th>
                    <th>Letzte UVV</th>
                    <th>UVV fällig</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => {
                    const due = uvvDue(v);
                    return (
                      <tr key={v.id}>
                        <td>
                          <Link to={v.id}>{v.plate}</Link>
                        </td>
                        <td className="wrap muted">{v.name ?? '—'}</td>
                        <td className="muted">{VEHICLE_TYPE_LABEL[v.type]}</td>
                        <td className="muted">{fmtDate(v.first_registration)}</td>
                        <td className="muted">{fmtDate(v.last_uvv)}</td>
                        <td className="muted">{dueLabel(due)}</td>
                        <td>
                          <DueBadge status={due.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }}
      </LoadGuard>
    </>
  );
}
