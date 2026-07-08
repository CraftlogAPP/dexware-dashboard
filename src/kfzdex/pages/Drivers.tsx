import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchDrivers } from '../api';
import { DueBadge, dueLabel } from '../badges';
import { licenseDue } from '../due';
import type { Driver } from '../types';

export function Drivers() {
  const { client } = useAppAuth();
  const [search, setSearch] = useState('');

  const state = useAsync<Driver[]>(() => fetchDrivers(client), [client]);

  return (
    <>
      <h1>Fahrer</h1>

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Fahrer suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <LoadGuard state={state}>
        {(drivers) => {
          const q = search.trim().toLowerCase();
          const filtered = drivers.filter(
            (d) => !q || d.name.toLowerCase().includes(q),
          );

          if (filtered.length === 0) {
            return (
              <div className="card empty">
                {drivers.length === 0
                  ? 'Noch keine Fahrer angelegt. Lege sie in der KfzDex-App an.'
                  : 'Keine Fahrer für diese Suche.'}
              </div>
            );
          }

          return (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Führerscheinklassen</th>
                    <th>Intervall</th>
                    <th>Letzte Kontrolle</th>
                    <th>Fällig</th>
                    <th>Kontrolle</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const due = licenseDue(d);
                    return (
                      <tr key={d.id}>
                        <td>
                          <Link to={d.id}>{d.name}</Link>
                        </td>
                        <td className="muted">{d.license_classes ?? '—'}</td>
                        <td className="muted">alle {d.check_interval_months} Monate</td>
                        <td className="muted">{fmtDate(d.last_check)}</td>
                        <td className="muted">{dueLabel(due)}</td>
                        <td>
                          {/* Fällige Kontrolle nur für aktive Fahrer relevant. */}
                          {d.active ? <DueBadge status={due.status} /> : '—'}
                        </td>
                        <td>
                          {d.active ? (
                            <span className="badge green">aktiv</span>
                          ) : (
                            <span className="badge">inaktiv</span>
                          )}
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
