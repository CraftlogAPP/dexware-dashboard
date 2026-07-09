import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtNum, gpsLabel } from '../../lib/format';
import { deleteTrip, fetchTrip, fetchVehicles } from '../api';
import { TripDialog, type TripFormInitial } from '../dialogs';
import { CategoryBadge, ConfirmedBadge } from '../badges';
import { CATEGORY_LABELS, type TripData, type Vehicle } from '../types';

/** TripData → Vorbelegung für den Fahrt-Dialog. */
function toInitial(t: TripData): TripFormInitial {
  return {
    id: t.id,
    vehicleId: t.vehicleId,
    startAddress: t.start.address ?? '',
    endAddress: t.end.address ?? '',
    startTime: t.startTime,
    endTime: t.endTime,
    distanceKm: t.distanceKm,
    category: t.category,
    purpose: t.purpose ?? '',
    confirmed: t.confirmed,
  };
}

export function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const { client, session } = useAppAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const state = useAsync<{ trip: TripData | null; vehicles: Vehicle[] }>(
    async () => {
      const [trip, vehicles] = await Promise.all([
        fetchTrip(client, id!),
        fetchVehicles(client),
      ]);
      return { trip, vehicles };
    },
    [client, id],
  );

  async function onDelete(t: TripData) {
    if (!session) return;
    if (
      !window.confirm(
        'Diese Fahrt wirklich löschen? Sie wird beim nächsten Sync auch aus der App entfernt.',
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await deleteTrip(client, session.user.id, t.id);
      navigate('../fahrten');
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <LoadGuard state={state}>
      {({ trip: t, vehicles }) => {
        if (!t) {
          return <div className="error-box">Fahrt nicht gefunden.</div>;
        }
        const vehicle = vehicles.find((v) => v.id === t.vehicleId);
        const durationMin =
          (new Date(t.endTime).getTime() - new Date(t.startTime).getTime()) / 60000;

        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../fahrten">← Alle Fahrten</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>Fahrt am {fmtDate(t.startTime)}</h1>
              <span className="row" style={{ gap: 8 }}>
                <CategoryBadge category={t.category} />
                <ConfirmedBadge confirmed={t.confirmed} />
              </span>
            </div>
            <p className="muted">
              {fmtDateTime(t.startTime)} – {fmtDateTime(t.endTime)}
              {t.manual ? ' · manuell erfasst' : ' · GPS-erfasst'}
            </p>

            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <button className="btn ghost small" onClick={() => setEditing(true)}>
                Bearbeiten
              </button>
              <button
                className="btn ghost small"
                disabled={deleting}
                onClick={() => onDelete(t)}
              >
                Löschen
              </button>
            </div>

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Strecke</div>
                <div>{fmtNum(t.distanceKm)} km</div>
                <div className="muted small">
                  {durationMin > 0 ? `${fmtNum(durationMin)} min Fahrzeit` : ''}
                </div>
              </div>
              <div className="card">
                <div className="kpi-label">Fahrzeug</div>
                <div>{vehicle?.name ?? '—'}</div>
                <div className="muted small">{vehicle?.licensePlate ?? ''}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Start</div>
                <div className="wrap">{t.start.address ?? '—'}</div>
                <div className="muted small">
                  {gpsLabel(t.start.latitude, t.start.longitude, null)}
                </div>
              </div>
              <div className="card">
                <div className="kpi-label">Ziel</div>
                <div className="wrap">{t.end.address ?? '—'}</div>
                <div className="muted small">
                  {gpsLabel(t.end.latitude, t.end.longitude, null)}
                </div>
              </div>
            </div>

            {t.purpose && (
              <>
                <div className="section-head">
                  <h2>Anlass / Zweck</h2>
                </div>
                <div className="card">{t.purpose}</div>
              </>
            )}

            {t.aiSuggestion && (
              <>
                <div className="section-head">
                  <h2>KI-Vorschlag</h2>
                </div>
                <div className="card">
                  <div className="row" style={{ gap: 8 }}>
                    <CategoryBadge category={t.aiSuggestion.category} />
                    <span className="muted small">
                      Konfidenz {fmtNum(t.aiSuggestion.confidence * 100)} %
                    </span>
                  </div>
                  <p style={{ marginBottom: 0 }}>{t.aiSuggestion.reason}</p>
                  {t.aiSuggestion.purpose && (
                    <p className="muted small" style={{ marginBottom: 0 }}>
                      Vorgeschlagener Zweck: {t.aiSuggestion.purpose}
                    </p>
                  )}
                  {t.category !== t.aiSuggestion.category && (
                    <p className="muted small" style={{ marginBottom: 0 }}>
                      Manuell geändert zu:{' '}
                      {CATEGORY_LABELS[t.category] ?? t.category}
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="section-head">
              <h2>GPS-Pfad</h2>
            </div>
            {!t.path || t.path.length === 0 ? (
              <div className="card empty">
                Kein GPS-Pfad gespeichert
                {t.manual ? ' (manuell erfasste Fahrt).' : '.'}
              </div>
            ) : (
              <div className="card">
                {t.path.length} aufgezeichnete GPS-Punkte
                <div className="muted small">
                  Erster Punkt:{' '}
                  {gpsLabel(t.path[0].latitude, t.path[0].longitude, null)} · Letzter
                  Punkt:{' '}
                  {gpsLabel(
                    t.path[t.path.length - 1].latitude,
                    t.path[t.path.length - 1].longitude,
                    null,
                  )}
                </div>
              </div>
            )}

            {editing && session && (
              <TripDialog
                client={client}
                userId={session.user.id}
                vehicles={vehicles}
                existing={toInitial(t)}
                onClose={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  state.reload();
                }}
              />
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
