import { useState } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, parseLocalDate, toInputDate } from '../../lib/format';
import { openReportWindow } from '../../lib/print';
import { fetchTripsForReport, fetchVehicles } from '../api';
import { buildFahrtenbuchHtml } from '../report';
import type { Vehicle } from '../types';

export function Report() {
  const { client, session } = useAppAuth();

  const vehiclesState = useAsync<Vehicle[]>(() => fetchVehicles(client), [client]);

  const [vehicleId, setVehicleId] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (!vehicleId || !from || !to) return;
    const vehicle = vehiclesState.data?.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    setBusy(true);
    setError(null);
    try {
      const fromDate = parseLocalDate(from);
      // Bis-Datum inklusiv: Fahrten bis Mitternacht des Folgetags
      const toExclusive = parseLocalDate(to);
      toExclusive.setDate(toExclusive.getDate() + 1);
      const trips = await fetchTripsForReport(client, vehicleId, fromDate, toExclusive);
      const periodLabel = `${fmtDate(fromDate.toISOString())} – ${fmtDate(
        parseLocalDate(to).toISOString(),
      )}`;
      const html = buildFahrtenbuchHtml(
        session?.user.email ?? '—',
        vehicle,
        trips,
        periodLabel,
      );
      if (!openReportWindow(html)) {
        setError(
          'Der Browser hat das Berichtsfenster blockiert. Bitte Pop-ups für diese Seite erlauben und erneut versuchen.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Fahrtenbuch-PDF</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Fahrtenbuch je Fahrzeug und Zeitraum — mit Start/Ziel, Anlass, Kategorie,
        Kilometern und Zusammenfassung nach Kategorien. Im Druckdialog „Als PDF
        speichern" wählen.
      </p>

      <LoadGuard state={vehiclesState}>
        {(vehicles) => (
          <div className="card" style={{ maxWidth: 560 }}>
            <label className="field">
              Fahrzeug
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">— Fahrzeug wählen —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.licensePlate ? ` (${v.licensePlate})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <label className="field" style={{ flex: 1 }}>
                Von
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="field" style={{ flex: 1 }}>
                Bis
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            {error && <div className="error-box">{error}</div>}
            <button
              className="btn"
              disabled={busy || !vehicleId}
              onClick={() => void onGenerate()}
            >
              {busy ? 'Lade Fahrten …' : '📄 Fahrtenbuch erstellen'}
            </button>
            <p className="muted small" style={{ marginTop: 10 }}>
              Unbestätigte Fahrten sind im Bericht gelb markiert — für ein sauberes
              Fahrtenbuch vorher in der App bestätigen.
            </p>
          </div>
        )}
      </LoadGuard>
    </>
  );
}
