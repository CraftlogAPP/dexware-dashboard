import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { fetchOperations, fetchProperties } from '../api';
import { ActionBadge, LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime, toInputDate, weatherLabel } from '../../lib/format';
import type { Operation, Property } from '../types';

interface Data {
  properties: Property[];
  ops: Operation[];
}

export function Operations() {
  const { client } = useAppAuth();
  const [propertyId, setPropertyId] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));

  const state = useAsync<Data>(async () => {
    const [properties, ops] = await Promise.all([
      fetchProperties(client),
      fetchOperations(client, {
        propertyId: propertyId || undefined,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      }),
    ]);
    return { properties, ops };
  }, [client, propertyId, from, to]);

  return (
    <>
      <h1>Einsätze</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Append-only-Protokoll — jeder Eintrag bleibt unveränderlich, Stornos sind
        gekennzeichnet.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Objekt
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Alle Objekte</option>
              {(state.data?.properties ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            Von
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            Bis
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>

      <LoadGuard state={state}>
        {({ properties, ops }) =>
          ops.length === 0 ? (
            <div className="card empty">Keine Einsätze im gewählten Zeitraum.</div>
          ) : (
            <>
              <p className="muted small">{ops.length} Einsätze</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
                      <th>Objekt</th>
                      <th>Maßnahme</th>
                      <th>Streumittel</th>
                      <th>Wetter (archiviert)</th>
                      <th>Dokumentiert von</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((op) => (
                      <tr key={op.id}>
                        <td>
                          <Link to={op.id}>{fmtDateTime(op.started_at)}</Link>
                        </td>
                        <td className="wrap">
                          {properties.find((p) => p.id === op.property_id)?.name ?? '—'}
                        </td>
                        <td>
                          <ActionBadge action={op.action} canceled={op.canceled} />
                        </td>
                        <td className="muted">
                          {op.grit_material
                            ? `${op.grit_material}${op.grit_amount ? ` (${op.grit_amount})` : ''}`
                            : '—'}
                        </td>
                        <td className="muted">{weatherLabel(op.weather)}</td>
                        <td className="muted">{op.performer_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        }
      </LoadGuard>
    </>
  );
}
