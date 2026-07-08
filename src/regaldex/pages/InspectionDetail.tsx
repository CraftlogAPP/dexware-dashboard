import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime, gpsLabel } from '../../lib/format';
import { fetchDamages, fetchInspectionWithPhotos, fetchWarehouse } from '../api';
import { DamageStatusBadge, InspectionBadge, SeverityBadge } from '../badges';
import {
  CHECKLIST,
  INSPECTION_LABELS,
  type CheckResult,
  type Damage,
  type InspectionWithPhotos,
  type Warehouse,
} from '../types';

interface Data {
  inspection: InspectionWithPhotos;
  warehouse: Warehouse | null;
  damages: Damage[];
}

const RESULT_BADGE: Record<CheckResult, { className: string; label: string }> = {
  ok: { className: 'badge green', label: 'OK' },
  defect: { className: 'badge red', label: 'Mangel' },
  na: { className: 'badge', label: 'n. z.' },
};

export function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();

  const state = useAsync<Data>(async () => {
    const inspection = await fetchInspectionWithPhotos(client, id!);
    const [warehouse, damages] = await Promise.all([
      fetchWarehouse(client, inspection.warehouse_id),
      fetchDamages(client, { inspectionId: inspection.id }),
    ]);
    return { inspection, warehouse, damages };
  }, [client, id]);

  return (
    <LoadGuard state={state}>
      {({ inspection: i, warehouse, damages }) => (
        <>
          <p className="small" style={{ marginBottom: 4 }}>
            <Link to="../inspektionen">← Alle Inspektionen</Link>
          </p>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h1 style={{ marginBottom: 0 }}>
              {INSPECTION_LABELS[i.type]} · {fmtDateTime(i.started_at)}
            </h1>
            <InspectionBadge type={i.type} canceled={i.canceled} />
          </div>
          <p className="muted">
            {warehouse ? (
              <Link to={`../lager/${warehouse.id}`}>{warehouse.name}</Link>
            ) : (
              'Lager unbekannt'
            )}
            {warehouse ? ` · ${warehouse.address}` : ''}
          </p>

          {i.canceled && (
            <div className="error-box">
              Storniert am {fmtDateTime(i.canceled_at)} — Begründung:{' '}
              {i.cancel_reason ?? '—'}
            </div>
          )}

          <div className="kpi-grid">
            <div className="card">
              <div className="kpi-label">Inspektionsart</div>
              <div>{INSPECTION_LABELS[i.type]}</div>
            </div>
            <div className="card">
              <div className="kpi-label">GPS-Stempel</div>
              <div className="mono small">{gpsLabel(i.lat, i.lng, i.gps_accuracy_m)}</div>
              {i.lat != null && i.lng != null && (
                <a
                  className="small"
                  href={`https://www.openstreetmap.org/?mlat=${i.lat}&mlon=${i.lng}#map=18/${i.lat}/${i.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Auf Karte zeigen ↗
                </a>
              )}
            </div>
            <div className="card">
              <div className="kpi-label">Kontrolliert von</div>
              <div>{i.inspector_name ?? '—'}</div>
            </div>
            <div className="card">
              <div className="kpi-label">Gemeldete Schäden</div>
              <div>{damages.length === 0 ? 'keine' : damages.length}</div>
            </div>
          </div>

          <div className="section-head">
            <h2>Checkliste (DIN EN 15635 / DGUV Regel 108-007)</h2>
          </div>
          {Object.keys(i.checklist).length === 0 ? (
            <div className="card empty">
              Keine Checkliste erfasst (z. B. Experteninspektion — nur Termin und
              Ergebnis dokumentiert).
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Prüfpunkt</th>
                    <th>Ergebnis</th>
                  </tr>
                </thead>
                <tbody>
                  {CHECKLIST.map((c) => {
                    const r = i.checklist[c.id];
                    if (!r) return null;
                    const badge = RESULT_BADGE[r];
                    return (
                      <tr key={c.id}>
                        <td className="wrap">{c.label}</td>
                        <td>
                          <span className={badge.className}>{badge.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {damages.length > 0 && (
            <>
              <div className="section-head">
                <h2>Bei dieser Inspektion gemeldete Schäden</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Schaden</th>
                      <th>Gefährdung (Ampel)</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {damages.map((d) => (
                      <tr key={d.id}>
                        <td className="wrap">
                          {d.title}
                          {d.rack_blocked && (
                            <>
                              {' '}
                              <span className="badge red">Feld/Zeile gesperrt</span>
                            </>
                          )}
                        </td>
                        <td>
                          <SeverityBadge severity={d.severity} />
                        </td>
                        <td>
                          <DamageStatusBadge status={d.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {i.notes && (
            <>
              <div className="section-head">
                <h2>Notizen</h2>
              </div>
              <div className="card">{i.notes}</div>
            </>
          )}

          <div className="section-head">
            <h2>Beweisfotos ({i.photo_urls.length})</h2>
          </div>
          {i.photo_urls.length === 0 ? (
            <div className="card empty">Keine Fotos zu dieser Inspektion.</div>
          ) : (
            <div className="row" style={{ alignItems: 'flex-start' }}>
              {i.photo_urls.map((src, n) => (
                <a key={n} href={src} target="_blank" rel="noreferrer">
                  <img
                    src={src}
                    alt={`Beweisfoto ${n + 1}`}
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
      )}
    </LoadGuard>
  );
}
