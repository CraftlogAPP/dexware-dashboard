import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { fetchOperations, fetchProperties } from '../api';
import { ActionBadge, LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime, gpsLabel, weatherLabel } from '../../lib/format';
import type { Operation, Property } from '../types';
import { dutyLabel } from './Properties';

interface Data {
  property: Property | undefined;
  ops: Operation[];
}

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();

  const state = useAsync<Data>(async () => {
    const [properties, ops] = await Promise.all([
      fetchProperties(client),
      fetchOperations(client, { propertyId: id, limit: 300 }),
    ]);
    return { property: properties.find((p) => p.id === id), ops };
  }, [client, id]);

  return (
    <LoadGuard state={state}>
      {({ property, ops }) => {
        if (!property) {
          return <div className="error-box">Objekt nicht gefunden.</div>;
        }
        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="..">← Alle Objekte</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>{property.name}</h1>
              {property.active ? (
                <span className="badge green">aktiv</span>
              ) : (
                <span className="badge">pausiert</span>
              )}
            </div>
            <p className="muted">{property.address}</p>

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Auftraggeber</div>
                <div>{property.customer_name ?? '—'}</div>
                <div className="muted small">{property.customer_contact ?? ''}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Pflichtzeiten</div>
                <div>{dutyLabel(property.duty_times)}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Flächen</div>
                <div className="small">{property.areas ?? '—'}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Notizen</div>
                <div className="small">{property.notes ?? '—'}</div>
              </div>
            </div>

            <div className="section-head">
              <h2>Einsatz-Historie ({ops.length})</h2>
              <Link className="btn small" to={`../bericht?objekt=${property.id}`}>
                📄 Nachweis-PDF erstellen
              </Link>
            </div>

            {ops.length === 0 ? (
              <div className="card empty">Für dieses Objekt ist noch kein Einsatz dokumentiert.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
                      <th>Maßnahme</th>
                      <th>Streumittel</th>
                      <th>Wetter (archiviert)</th>
                      <th>GPS</th>
                      <th>Dokumentiert von</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((op) => (
                      <tr key={op.id}>
                        <td>
                          <Link to={`../einsaetze/${op.id}`}>
                            {fmtDateTime(op.started_at)}
                          </Link>
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
                        <td className="muted mono small">
                          {gpsLabel(op.lat, op.lng, op.gps_accuracy_m)}
                        </td>
                        <td className="muted">{op.performer_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
