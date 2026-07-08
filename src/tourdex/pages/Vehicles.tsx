import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtNum } from '../../lib/format';
import { fetchTripSummaries, fetchVehicles } from '../api';
import { VEHICLE_TYPE_LABELS, type TripSummary, type Vehicle } from '../types';

export function Vehicles() {
  const { client } = useAppAuth();

  const state = useAsync<{ vehicles: Vehicle[]; trips: TripSummary[] }>(
    async () => {
      const [vehicles, trips] = await Promise.all([
        fetchVehicles(client),
        fetchTripSummaries(client),
      ]);
      return { vehicles, trips };
    },
    [client],
  );

  return (
    <>
      <h1>Fahrzeuge</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Fahrzeuge mit Fahrten und Kilometern. Anlegen und Bearbeiten läuft in
        der App.
      </p>

      <LoadGuard state={state}>
        {({ vehicles, trips }) => {
          if (vehicles.length === 0) {
            return <div className="card empty">Noch keine Fahrzeuge in der Cloud.</div>;
          }
          const statsFor = (id: string) => {
            const own = trips.filter((t) => t.vehicle_id === id);
            return {
              count: own.length,
              km: own.reduce((sum, t) => sum + (t.distance_km ?? 0), 0),
            };
          };
          return (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fahrzeug</th>
                    <th>Typ</th>
                    <th>Kennzeichen</th>
                    <th>Marke / Modell</th>
                    <th>Fahrten</th>
                    <th>km erfasst</th>
                    <th>km-Stand initial</th>
                    <th>Angelegt</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => {
                    const stats = statsFor(v.id);
                    return (
                      <tr key={v.id}>
                        <td>
                          {v.name}{' '}
                          {v.isDefault && <span className="badge green">Standard</span>}
                        </td>
                        <td className="muted">
                          {VEHICLE_TYPE_LABELS[v.type] ?? v.type}
                        </td>
                        <td className="muted">{v.licensePlate ?? '—'}</td>
                        <td className="muted">
                          {[v.make, v.model].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="muted">{stats.count}</td>
                        <td className="muted">{fmtNum(stats.km)}</td>
                        <td className="muted">
                          {v.initialOdometerKm != null
                            ? fmtNum(v.initialOdometerKm)
                            : '—'}
                        </td>
                        <td className="muted">{fmtDate(v.createdAt)}</td>
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
