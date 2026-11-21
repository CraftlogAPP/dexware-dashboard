import { useState } from 'react';
import { FileDown, MapPin } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { fetchOperations, fetchProperty, savePropertyLocation } from '../api';
import { ActionBadge, LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { fmtDateTime, gpsLabel } from '../../lib/format';
import { gritLabel, weatherLabel } from '../labels';
import { PropertyDialog } from '../dialogs';
import type { Operation, Property } from '../types';
import { dutyLabel } from './Properties';

interface Data {
  property: Property | null;
  ops: Operation[];
}

/** So viele Einsätze zeigt die Historie (ältere stehen im Nachweis-PDF bzw. unter „Einsätze“ mit Zeitraum). */
const HISTORY_LIMIT = 300;

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  // Objekte ändern darf am Server nur der Inhaber — für alle anderen keine Knöpfe, die dann scheitern.
  const owner = useOrg().data?.role === 'owner';
  const [editing, setEditing] = useState(false);

  const state = useAsync<Data>(async () => {
    const [property, ops] = await Promise.all([
      fetchProperty(client, id!),
      fetchOperations(client, { propertyId: id, limit: HISTORY_LIMIT }),
    ]);
    return { property, ops };
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
              <Link to="../objekte">← Alle Objekte</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <h1 style={{ marginBottom: 0 }}>{property.name}</h1>
                {owner && (
                  <button className="btn ghost small" onClick={() => setEditing(true)}>
                    Bearbeiten
                  </button>
                )}
              </div>
              <StatusBadge active={property.active} />
            </div>
            <p className="muted">{property.address}</p>

            {editing && (
              <PropertyDialog
                property={property}
                onClose={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  state.reload();
                }}
              />
            )}

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

            <Standort property={property} owner={owner} onSaved={state.reload} />

            <div className="section-head">
              <h2>
                Einsatz-Historie ({ops.length >= HISTORY_LIMIT ? `neueste ${HISTORY_LIMIT}` : ops.length})
              </h2>
              <Link className="btn small" to={`../bericht?objekt=${property.id}`}>
                <FileDown className="i" aria-hidden /> Nachweis-PDF erstellen
              </Link>
            </div>
            {ops.length >= HISTORY_LIMIT && (
              <p className="muted small">
                Ältere Einsätze stehen im Nachweis-PDF (Zeitraum wählen) und unter „Einsätze“.
              </p>
            )}

            {ops.length === 0 ? (
              <div className="card empty">
                Für dieses Objekt ist noch kein Einsatz dokumentiert.
              </div>
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
                          {gritLabel(op.grit_material, op.grit_amount)}
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

const LOC_OK_M = 50; // wie die App: genauer → direkt übernehmen
const LOC_MAX_M = 100; // ungenauer → nicht übernehmen
const LOC_WAIT_MS = 20000;

/**
 * Standort des Objekts — Grundlage für „… m vom Objekt“ im GPS-Nachweis, die Wetterlage und die Glätte-Frühwarnung.
 * Im Browser angelegte Objekte hatten bisher keinen (die App ermittelt ihn aus der Adresse oder per „Hier stehe ich“).
 * Hier wie in der App: vor Ort stehen, Position ermitteln (bis ±10 m oder 20 s), dann übernehmen.
 */
function Standort({ property, owner, onSaved }: { property: Property; owner: boolean; onSaved: () => void }) {
  const { client } = useAppAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [found, setFound] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const has = property.lat != null && property.lng != null;

  const locate = () => {
    if (!('geolocation' in navigator)) return setMsg({ tone: 'error', text: 'Dieser Browser kann keinen Standort ermitteln.' });
    setMsg(null);
    setFound(null);
    setBusy('Ortung läuft …');
    let best: GeolocationPosition | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      setBusy(null);
      if (!best) return setMsg({ tone: 'error', text: 'Keine Position — bitte unter freiem Himmel erneut versuchen.' });
      const acc = Math.round(best.coords.accuracy ?? 9999);
      if (acc > LOC_MAX_M) {
        return setMsg({
          tone: 'error',
          text: `Zu ungenau (±${acc} m, kein Satellitenempfang?) — nicht übernommen. Bitte am Objekt unter freiem Himmel erneut versuchen.`,
        });
      }
      setFound({ lat: best.coords.latitude, lng: best.coords.longitude, acc });
    };
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        setBusy(`Ortung läuft … ±${Math.round(best.coords.accuracy)} m`);
        if (best.coords.accuracy <= 10) finish();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED && !done) {
          done = true;
          navigator.geolocation.clearWatch(id);
          clearTimeout(timer);
          setBusy(null);
          setMsg({ tone: 'error', text: 'Standort nicht erlaubt — bitte im Browser erlauben (am iPhone: Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites).' });
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: LOC_WAIT_MS },
    );
    const timer = setTimeout(finish, LOC_WAIT_MS);
  };

  const take = async () => {
    if (!found) return;
    setBusy('Speichern …');
    try {
      await savePropertyLocation(client, property, found.lat, found.lng);
      setFound(null);
      setMsg({ tone: 'info', text: `Standort übernommen (±${found.acc} m).` });
      onSaved();
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card" style={{ margin: '16px 0' }}>
      <div className="kpi-label">
        <MapPin className="i" aria-hidden /> Standort für den GPS-Nachweis
      </div>
      {has ? (
        <div className="mono small">{gpsLabel(property.lat, property.lng, null)}</div>
      ) : (
        <div className="small">
          Noch kein Standort — im Nachweis fehlt dann „… m vom Objekt“.
          {!owner && ' Den Standort setzt der Inhaber des Betriebs.'}
        </div>
      )}
      {owner && (
        <>
          <p className="muted small" style={{ margin: '6px 0' }}>
            Am Objekt stehen (am besten am Eingang bzw. der zu räumenden Fläche) und die Position übernehmen — wie „Hier
            stehe ich“ in der App.
          </p>
          {found ? (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="small">
                Gefunden: {found.lat.toFixed(5)}, {found.lng.toFixed(5)} (±{found.acc} m)
                {found.acc > LOC_OK_M ? ' — eher ungenau' : ''}
              </span>
              <button className="btn small" disabled={!!busy} onClick={() => void take()}>
                Übernehmen
              </button>
              <button className="btn ghost small" disabled={!!busy} onClick={() => setFound(null)}>
                Verwerfen
              </button>
            </div>
          ) : (
            <button className="btn ghost small" disabled={!!busy} onClick={locate}>
              {busy ?? (has ? 'Standort neu bestimmen (hier stehe ich)' : 'Hier stehe ich — Standort ermitteln')}
            </button>
          )}
        </>
      )}
      {msg && <div className={msg.tone === 'error' ? 'error-box' : 'info-box'} style={{ marginTop: 8 }}>{msg.text}</div>}
    </div>
  );
}
