import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { fetchOperationWithPhotos, fetchProperty } from '../api';
import { ActionBadge, LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime, fmtNum, fmtTime, gpsLabel } from '../../lib/format';
import { gritLabel } from '../labels';
import type { OperationWithPhotos, Property } from '../types';

interface Data {
  op: OperationWithPhotos;
  property: Property | null;
}

export function OperationDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();

  const state = useAsync<Data>(async () => {
    const op = await fetchOperationWithPhotos(client, id!);
    const property = await fetchProperty(client, op.property_id);
    return { op, property };
  }, [client, id]);

  return (
    <LoadGuard state={state}>
      {({ op, property }) => {
        const w = op.weather;
        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../einsaetze">← Alle Einsätze</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>Einsatz · {fmtDateTime(op.started_at)}</h1>
              <ActionBadge action={op.action} canceled={op.canceled} />
            </div>
            <p className="muted">
              {property ? (
                <Link to={`../objekte/${property.id}`}>{property.name}</Link>
              ) : (
                'Objekt unbekannt'
              )}
              {property ? ` · ${property.address}` : ''}
            </p>

            {op.canceled && (
              <div className="error-box">
                Storniert am {fmtDateTime(op.canceled_at)} — Begründung:{' '}
                {op.cancel_reason ?? '—'}
              </div>
            )}

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Zeitraum</div>
                <div>
                  {fmtTime(op.started_at)}
                  {op.ended_at ? ` – ${fmtTime(op.ended_at)}` : ' (offen)'}
                </div>
              </div>
              <div className="card">
                <div className="kpi-label">Streumittel</div>
                <div>{gritLabel(op.grit_material, op.grit_amount)}</div>
              </div>
              <div className="card">
                <div className="kpi-label">GPS-Stempel</div>
                <div className="mono small">
                  {gpsLabel(op.lat, op.lng, op.gps_accuracy_m)}
                </div>
                {op.lat != null && op.lng != null && (
                  <a
                    className="small"
                    href={`https://www.openstreetmap.org/?mlat=${op.lat}&mlon=${op.lng}#map=18/${op.lat}/${op.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Auf Karte zeigen ↗
                  </a>
                )}
              </div>
              <div className="card">
                <div className="kpi-label">Dokumentiert von</div>
                <div>{op.performer_name ?? '—'}</div>
              </div>
            </div>

            <div className="section-head">
              <h2>Wetterlage (archiviert bei Einsatzbeginn)</h2>
            </div>
            {w ? (
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Temperatur</div>
                  <div className="kpi-value">
                    {typeof w.temp_c === 'number' ? `${fmtNum(w.temp_c)} °C` : '—'}
                  </div>
                  {typeof w.apparent_c === 'number' && (
                    <div className="kpi-sub">gefühlt {fmtNum(w.apparent_c)} °C</div>
                  )}
                  {typeof w.today_min_c === 'number' && (
                    <div className="kpi-sub">Tagestief {fmtNum(w.today_min_c)} °C</div>
                  )}
                </div>
                <div className="kpi">
                  <div className="kpi-label">Schneefall</div>
                  <div className="kpi-value">
                    {typeof w.snowfall_cm === 'number'
                      ? `${fmtNum(w.snowfall_cm)} cm`
                      : '—'}
                  </div>
                  {typeof w.today_snowfall_cm === 'number' && (
                    <div className="kpi-sub">
                      heute gesamt {fmtNum(w.today_snowfall_cm)} cm
                    </div>
                  )}
                </div>
                <div className="kpi">
                  <div className="kpi-label">Niederschlag</div>
                  <div className="kpi-value">
                    {typeof w.precip_mm === 'number' ? `${fmtNum(w.precip_mm)} mm` : '—'}
                  </div>
                  {typeof w.today_precip_mm === 'number' && (
                    <div className="kpi-sub">
                      heute gesamt {fmtNum(w.today_precip_mm)} mm
                    </div>
                  )}
                </div>
                <div className="kpi">
                  <div className="kpi-label">Wind</div>
                  <div className="kpi-value">
                    {typeof w.wind_kmh === 'number' ? `${fmtNum(w.wind_kmh)} km/h` : '—'}
                  </div>
                  <div className="kpi-sub">Quelle: {w.source ?? 'open-meteo'}</div>
                </div>
              </div>
            ) : (
              <div className="card empty">Kein Wetter-Snapshot vorhanden.</div>
            )}

            {op.notes && (
              <>
                <div className="section-head">
                  <h2>Notizen</h2>
                </div>
                <div className="card">{op.notes}</div>
              </>
            )}

            <div className="section-head">
              <h2>Beweisfotos ({op.photo_urls.length})</h2>
            </div>
            {op.photo_urls.length === 0 ? (
              <div className="card empty">Keine Fotos zu diesem Einsatz.</div>
            ) : (
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {op.photo_urls.map((src, i) => (
                  <a key={i} href={src} target="_blank" rel="noreferrer">
                    <img
                      src={src}
                      alt={`Beweisfoto ${i + 1}`}
                      style={{
                        width: 220,
                        maxWidth: '100%',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                      }}
                    />
                  </a>
                ))}
              </div>
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
