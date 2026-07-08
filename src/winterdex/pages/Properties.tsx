import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { fetchOperations, fetchProperties } from '../api';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import type { DutyTimes, Operation, Property } from '../types';

interface Data {
  properties: Property[];
  lastByProp: Map<string, Operation>;
}

export function Properties() {
  const { client } = useAppAuth();

  const state = useAsync<Data>(async () => {
    const [properties, ops] = await Promise.all([
      fetchProperties(client),
      fetchOperations(client, { limit: 500 }),
    ]);
    const lastByProp = new Map<string, Operation>();
    for (const op of ops) {
      if (op.canceled) continue;
      if (!lastByProp.has(op.property_id)) lastByProp.set(op.property_id, op);
    }
    return { properties, lastByProp };
  }, [client]);

  return (
    <>
      <h1>Objekte</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Liegenschaften mit Pflichtzeiten und letztem Einsatz. Anlegen und
        Bearbeiten läuft in der App.
      </p>

      <LoadGuard state={state}>
        {({ properties, lastByProp }) =>
          properties.length === 0 ? (
            <div className="card empty">Noch keine Objekte angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Objekt</th>
                    <th>Adresse</th>
                    <th>Auftraggeber</th>
                    <th>Pflichtzeiten</th>
                    <th>Letzter Einsatz</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((p) => {
                    const last = lastByProp.get(p.id);
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link to={p.id}>{p.name}</Link>
                        </td>
                        <td className="wrap muted">{p.address}</td>
                        <td className="wrap muted">{p.customer_name ?? '—'}</td>
                        <td className="muted small">{dutyLabel(p.duty_times)}</td>
                        <td>{last ? fmtDateTime(last.started_at) : '—'}</td>
                        <td>
                          {p.active ? (
                            <span className="badge green">aktiv</span>
                          ) : (
                            <span className="badge">pausiert</span>
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

export function dutyLabel(d: DutyTimes | null | undefined): string {
  if (!d) return '—';
  const parts: string[] = [];
  if (d.mo_fr) parts.push(`Mo–Fr ${d.mo_fr}`);
  if (d.sa) parts.push(`Sa ${d.sa}`);
  if (d.so) parts.push(`So ${d.so}`);
  return parts.length ? parts.join(' · ') : '—';
}
