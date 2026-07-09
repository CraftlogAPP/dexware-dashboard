import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtNum, fmtTime } from '../../lib/format';
import { deleteTrip, fetchTripSummaries, fetchVehicles } from '../api';
import { TripDialog, type TripFormInitial } from '../dialogs';
import { CategoryBadge, ConfirmedBadge } from '../badges';
import {
  CATEGORY_LABELS,
  type TripCategory,
  type TripSummary,
  type Vehicle,
} from '../types';

/** TripSummary → Vorbelegung für den Fahrt-Dialog. */
function toInitial(t: TripSummary): TripFormInitial {
  return {
    id: t.id,
    vehicleId: t.vehicle_id ?? '',
    startAddress: t.start_address ?? '',
    endAddress: t.end_address ?? '',
    startTime: t.start_time ?? '',
    endTime: t.end_time ?? '',
    distanceKm: t.distance_km,
    category: t.category ?? 'business',
    purpose: t.purpose ?? '',
    confirmed: t.confirmed === true,
  };
}

export function Trips() {
  const { client, session } = useAppAuth();
  const [category, setCategory] = useState<'' | TripCategory>('');
  const [vehicleId, setVehicleId] = useState('');
  const [status, setStatus] = useState<'' | 'confirmed' | 'unconfirmed'>('');
  const [dialog, setDialog] = useState<TripSummary | 'new' | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function onDelete(t: TripSummary) {
    if (!session) return;
    if (
      !window.confirm(
        `Fahrt vom ${fmtDate(t.start_time)} wirklich löschen? Sie wird beim nächsten Sync auch aus der App entfernt.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await deleteTrip(client, session.user.id, t.id);
      state.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Fahrten</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setDialog('new')}>
          ＋ Fahrt nachtragen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle erfassten Fahrten mit Strecke, Kategorie und Status — hier
        klassifizieren, bestätigen, nachtragen und bearbeiten. Automatisch
        erfasst wird in der App.
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
                          <th></th>
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
                            <td>
                              <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                                <button
                                  className="btn ghost small"
                                  onClick={() => setDialog(t)}
                                >
                                  Bearbeiten
                                </button>
                                <button
                                  className="btn ghost small"
                                  disabled={deleting}
                                  onClick={() => onDelete(t)}
                                >
                                  Löschen
                                </button>
                              </span>
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

      {dialog && session && state.data && (
        <TripDialog
          client={client}
          userId={session.user.id}
          vehicles={state.data.vehicles}
          existing={dialog === 'new' ? null : toInitial(dialog)}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            state.reload();
          }}
        />
      )}
    </>
  );
}
