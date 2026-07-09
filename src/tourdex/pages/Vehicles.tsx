import { useState } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDate, fmtNum } from '../../lib/format';
import {
  fetchTripSummaries,
  fetchVehicles,
  saveVehicle,
  setDefaultVehicle,
} from '../api';
import {
  VEHICLE_TYPE_LABELS,
  type TripSummary,
  type Vehicle,
  type VehicleType,
} from '../types';

export function Vehicles() {
  const { client, session } = useAppAuth();
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [settingDefault, setSettingDefault] = useState(false);

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

  async function onSave(v: FormValues) {
    if (!session) throw new Error('Nicht angemeldet');
    await saveVehicle(
      client,
      session.user.id,
      {
        name: s(v.name),
        make: orNull(v.make) ?? undefined,
        model: orNull(v.model) ?? undefined,
        licensePlate: orNull(v.licensePlate) ?? undefined,
        type: s(v.type) as VehicleType,
      },
      editing === 'new' ? undefined : (editing ?? undefined),
    );
    state.reload();
  }

  async function onSetDefault(vehicles: Vehicle[], id: string) {
    setSettingDefault(true);
    try {
      await setDefaultVehicle(client, vehicles, id);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSettingDefault(false);
      // Auch nach Fehler neu laden — ein Teil der Patches kann durch sein.
      state.reload();
    }
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Fahrzeuge</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Fahrzeug anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Fahrzeuge mit Fahrten und Kilometern.
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
                    <th></th>
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
                        <td>
                          <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                            <button className="btn ghost small" onClick={() => setEditing(v)}>
                              Bearbeiten
                            </button>
                            {!v.isDefault && (
                              <button
                                className="btn ghost small"
                                disabled={settingDefault}
                                onClick={() => onSetDefault(vehicles, v.id)}
                              >
                                Als Standard
                              </button>
                            )}
                          </span>
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

      {editing && (
        <FormDialog
          title={editing === 'new' ? 'Fahrzeug anlegen' : `${editing.name} bearbeiten`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'name', label: 'Name', required: true, placeholder: 'z. B. Firmenwagen' },
            {
              key: 'type',
              label: 'Typ',
              kind: 'select',
              required: true,
              options: (Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((t) => ({
                value: t,
                label: VEHICLE_TYPE_LABELS[t],
              })),
            },
            { key: 'licensePlate', label: 'Kennzeichen' },
            { key: 'make', label: 'Marke' },
            { key: 'model', label: 'Modell' },
          ]}
          initial={
            editing === 'new'
              ? { type: 'car' }
              : {
                  name: editing.name,
                  type: editing.type,
                  licensePlate: editing.licensePlate ?? '',
                  make: editing.make ?? '',
                  model: editing.model ?? '',
                }
          }
        />
      )}
    </>
  );
}
