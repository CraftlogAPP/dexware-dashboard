import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtNum, fmtTime } from '../../lib/format';
import { fetchTripSummaries, fetchVehicles } from '../api';
import { CategoryBadge, ConfirmedBadge } from '../badges';
import type { TripSummary, Vehicle } from '../types';

export function Overview() {
  const { client } = useAppAuth();

  const state = useAsync<{ trips: TripSummary[]; vehicles: Vehicle[] }>(
    async () => {
      const [trips, vehicles] = await Promise.all([
        fetchTripSummaries(client),
        fetchVehicles(client),
      ]);
      return { trips, vehicles };
    },
    [client],
  );

  return (
    <>
      <h1>Übersicht</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Dein Fahrtenbuch — live aus der TourDex-App.
      </p>

      <LoadGuard state={state}>
        {({ trips, vehicles }) => {
          const vehicleName = (id: string | null) =>
            vehicles.find((v) => v.id === id)?.name ?? '—';
          const totalKm = trips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
          const businessKm = trips
            .filter((t) => t.category === 'business')
            .reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
          const unconfirmed = trips.filter((t) => !t.confirmed);
          const recent = trips.slice(0, 8);

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Fahrten</div>
                  <div className="kpi-value">{trips.length}</div>
                  <div className="kpi-sub">
                    {vehicles.length} Fahrzeug{vehicles.length === 1 ? '' : 'e'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Gefahrene km</div>
                  <div className="kpi-value">{fmtNum(totalKm)}</div>
                  <div className="kpi-sub">über alle Fahrten</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Geschäftlich</div>
                  <div className="kpi-value">{fmtNum(businessKm)}</div>
                  <div className="kpi-sub">
                    km
                    {totalKm > 0
                      ? ` · ${fmtNum((businessKm / totalKm) * 100)} % Anteil`
                      : ''}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Unbestätigt</div>
                  <div className="kpi-value">{unconfirmed.length}</div>
                  <div className="kpi-sub">Fahrten warten auf Bestätigung</div>
                </div>
              </div>

              {unconfirmed.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Unbestätigte Fahrten</h2>
                    <Link to="fahrten" className="small">
                      Alle Fahrten →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Strecke</th>
                          <th>Kategorie</th>
                          <th>km</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unconfirmed.slice(0, 8).map((t) => (
                          <tr key={t.id}>
                            <td>
                              <Link to={`fahrten/${t.id}`}>
                                {fmtDate(t.start_time)}, {fmtTime(t.start_time)}
                              </Link>
                            </td>
                            <td className="wrap muted">
                              {t.start_address ?? '—'} → {t.end_address ?? '—'}
                            </td>
                            <td>
                              <CategoryBadge category={t.category} />
                            </td>
                            <td className="muted">{fmtNum(t.distance_km)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="muted small">
                    Bestätigen läuft in der TourDex-App — dort prüfst du auch den
                    KI-Kategorie-Vorschlag.
                  </p>
                </>
              )}

              <div className="section-head">
                <h2>Letzte Fahrten</h2>
                <Link to="fahrten" className="small">
                  Alle Fahrten →
                </Link>
              </div>
              {recent.length === 0 ? (
                <div className="card empty">
                  Noch keine Fahrten in der Cloud. Aktiviere in der TourDex-App den
                  Cloud-Sync, dann erscheint hier alles live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Strecke</th>
                        <th>Fahrzeug</th>
                        <th>Kategorie</th>
                        <th>km</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <Link to={`fahrten/${t.id}`}>
                              {fmtDate(t.start_time)}, {fmtTime(t.start_time)}
                            </Link>
                          </td>
                          <td className="wrap muted">
                            {t.start_address ?? '—'} → {t.end_address ?? '—'}
                          </td>
                          <td className="muted">{vehicleName(t.vehicle_id)}</td>
                          <td>
                            <CategoryBadge category={t.category} />
                          </td>
                          <td className="muted">{fmtNum(t.distance_km)}</td>
                          <td>
                            <ConfirmedBadge confirmed={t.confirmed} />
                          </td>
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
    </>
  );
}
