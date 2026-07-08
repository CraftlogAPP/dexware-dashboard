import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtNum, fmtTime } from '../../lib/format';
import { fetchTripSummaries, fetchVehicles } from '../api';
import { CategoryBadge, ConfirmedBadge } from '../badges';
import {
  CATEGORY_LABELS,
  type TripCategory,
  type TripSummary,
  type Vehicle,
} from '../types';

export function Trips() {
  const { client } = useAppAuth();
  const [category, setCategory] = useState<'' | TripCategory>('');
  const [vehicleId, setVehicleId] = useState('');
  const [status, setStatus] = useState<'' | 'confirmed' | 'unconfirmed'>('');

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
      <h1>Fahrten</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle erfassten Fahrten mit Strecke, Kategorie und Status. Erfassen und
        Bestätigen läuft in der App.
      </p>

      <LoadGuard state={state}>
        {({ trips: allTrips, vehicles }) => {
          const vehicleName = (id: string | null) =>
            vehicles.find((v) => v.id === id)?.name ?? '—';
          const trips = allTrips.filter(
            (t) =>
              (!category || t.category === category) &&
              (!vehicleId || t.vehicle_id === vehicleId) &&
              (!status ||
                (status === 'confirmed' ? !!t.confirmed : !t.confirmed)),
          );
          const totalKm = trips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);

          return (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="row">
                  <label
                    className="field"
                    style={{ flex: 1, minWidth: 160, marginBottom: 0 }}
                  >
                    Kategorie
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as '' | TripCategory)}
                    >
                      <option value="">Alle Kategorien</option>
                      {(Object.keys(CATEGORY_LABELS) as TripCategory[]).map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    className="field"
                    style={{ flex: 1, minWidth: 160, marginBottom: 0 }}
                  >
                    Fahrzeug
                    <select
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value)}
                    >
                      <option value="">Alle Fahrzeuge</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    className="field"
                    style={{ flex: 1, minWidth: 160, marginBottom: 0 }}
                  >
                    Status
                    <select
                      value={status}
                      onChange={(e) =>
                        setStatus(e.target.value as '' | 'confirmed' | 'unconfirmed')
                      }
                    >
                      <option value="">Alle</option>
                      <option value="confirmed">Bestätigt</option>
                      <option value="unconfirmed">Unbestätigt</option>
                    </select>
                  </label>
                </div>
              </div>

              {trips.length === 0 ? (
                <div className="card empty">Keine Fahrten mit den gewählten Filtern.</div>
              ) : (
                <>
                  <p className="muted small">
                    {trips.length} Fahrten · {fmtNum(totalKm)} km
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Start</th>
                          <th>Ziel</th>
                          <th>Fahrzeug</th>
                          <th>Kategorie</th>
                          <th>Zweck</th>
                          <th>km</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trips.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <Link to={t.id}>
                                {fmtDate(t.start_time)}, {fmtTime(t.start_time)}
                              </Link>
                            </td>
                            <td className="wrap muted">{t.start_address ?? '—'}</td>
                            <td className="wrap muted">{t.end_address ?? '—'}</td>
                            <td className="muted">{vehicleName(t.vehicle_id)}</td>
                            <td>
                              <CategoryBadge category={t.category} />
                            </td>
                            <td className="wrap muted">{t.purpose ?? '—'}</td>
                            <td className="muted">{fmtNum(t.distance_km)}</td>
                            <td>
                              <ConfirmedBadge confirmed={t.confirmed} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
