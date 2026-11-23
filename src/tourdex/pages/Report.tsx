import { useState } from 'react';
import { Crown, FileDown } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { ExcelButton } from '../../components/ExcelButton';
import { fmtDate, parseLocalDate, toInputDate } from '../../lib/format';
import { openReportWindowAfter } from '../../lib/print';
import { downloadXlsx, ExportNotice } from '../../lib/xlsx';
import { fetchTripsBefore, fetchTripsForExport, fetchTripsForReport, fetchVehicles } from '../api';
import { checkPeriod, EXPORT_TZ, needsHistory, periodLabel, tripSheets } from '../exportLists';
import { buildFahrtenbuchHtml } from '../report';
import { tourdexPdfAllowed } from '../pro';
import type { Vehicle } from '../types';

export function Report() {
  const { client, session, app } = useAppAuth();
  const { pathname } = useLocation();
  // Wie in der App: Fahrtenbuch-PDF nur mit Pro (Abo, Suite oder Kauf in der Dexware-App). Unklar → nicht sperren.
  const proState = useAsync<boolean>(
    () => (session ? tourdexPdfAllowed(app, session) : Promise.resolve(true)),
    [app, session],
  );
  const pdfErlaubt = proState.data;

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
      // Fenster sofort öffnen (im Klick), Daten danach laden — sonst blockt der Browser das Pop-up (iPhone, viele Fotos)
      const opened = await openReportWindowAfter(async () => {
        const fromDate = parseLocalDate(from);
        // Bis-Datum inklusiv: Fahrten bis Mitternacht des Folgetags
        const toExclusive = parseLocalDate(to);
        toExclusive.setDate(toExclusive.getDate() + 1);
        const [trips, priorTrips] = await Promise.all([
          fetchTripsForReport(client, vehicleId, fromDate, toExclusive),
          fetchTripsBefore(client, vehicleId, fromDate),
        ]);
        const periodLabel = `${fmtDate(fromDate.toISOString())} – ${fmtDate(
          parseLocalDate(to).toISOString(),
        )}`;
        const html = buildFahrtenbuchHtml(
          session?.user.email ?? '—',
          vehicle,
          trips,
          periodLabel,
          priorTrips,
        );
        return html;
      });
      if (!opened) {
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

  /**
   * Excel-Liste für Reisekosten/Steuerberatung: gewähltes Fahrzeug oder (ohne Auswahl) alle, vollständig geladen.
   * Gehört zu Pro wie das PDF — die Karte ist ohne Pro ohnehin ausgeblendet, hier nur zur Sicherheit.
   */
  async function exportExcel() {
    const period = checkPeriod(from, to);
    if (pdfErlaubt === false) {
      throw new ExportNotice(
        'Die Excel-Liste gehört zu TourDex Pro — genau wie das Fahrtenbuch-PDF. Pro schließt du in der TourDex-App unter „Mehr“ ab, oder du nutzt die Dexware Suite.',
        { href: pathname.replace(/\/bericht\/?$/, '/abo'), label: 'Zum Abo' },
      );
    }
    const vehicles = vehiclesState.data ?? (await fetchVehicles(client));
    const fromDate = parseLocalDate(period.from);
    // Bis-Datum inklusiv: Fahrten bis Mitternacht des Folgetags (wie das PDF)
    const toExclusive = parseLocalDate(period.to);
    toExclusive.setDate(toExclusive.getDate() + 1);
    const trips = await fetchTripsForExport(client, {
      vehicleId: vehicleId || undefined,
      // Fahrten vor dem Zeitraum nur laden, wenn ein Fahrzeug einen Anfangs-km-Stand hat (fortlaufender km-Stand)
      from: needsHistory(vehicles, vehicleId || null) ? null : fromDate,
      toExclusive,
    });
    const sheets = tripSheets({
      accountEmail: session?.user.email ?? '—',
      vehicles,
      trips,
      period,
      range: { fromIso: fromDate.toISOString(), toIso: toExclusive.toISOString() },
      vehicleId: vehicleId || null,
    });
    const one = vehicleId ? vehicles.find((v) => v.id === vehicleId)?.name : undefined;
    await downloadXlsx(`TourDex_Fahrten_${one ? `${one}_` : ''}${period.from}_bis_${period.to}`, sheets, {
      title: `TourDex Fahrtenliste ${periodLabel(period)}`,
      creator: 'Dexware TourDex',
      timeZone: EXPORT_TZ,
    });
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
        {(vehicles) => pdfErlaubt === false ? (
          <div className="card" style={{ maxWidth: 560 }}>
            <p style={{ marginTop: 0 }}>
              <Crown className="i" aria-hidden /> <strong>Das Fahrtenbuch-PDF gehört zu TourDex Pro</strong> — genau wie in der App.
            </p>
            <p className="muted">
              Pro schließt du in der TourDex-App unter „Mehr“ ab, oder du nutzt die Dexware Suite. Danach stehen der Bericht
              und die Excel-Liste hier sofort bereit. Deine Fahrten siehst und bearbeitest du weiterhin kostenlos.
            </p>
            <Link className="btn" to={pathname.replace(/\/bericht\/?$/, '/abo')}>Zum Abo</Link>
          </div>
        ) : (
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
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn"
                disabled={busy || !vehicleId || pdfErlaubt === null}
                onClick={() => void onGenerate()}
              >
                {busy ? 'Lade Fahrten …' : <><FileDown className="i" aria-hidden /> Fahrtenbuch erstellen</>}
              </button>
              <ExcelButton
                onExport={exportExcel}
                disabled={pdfErlaubt === null}
                title="Fahrten im Zeitraum als Excel-Datei für Reisekosten/Steuerberatung, mit km je Fahrzeug und Monat (Pro)"
              />
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>
              Unbestätigte Fahrten sind im Bericht gelb markiert — für ein sauberes
              Fahrtenbuch vorher in der App bestätigen. Die Excel-Liste (für Reisekosten
              und Steuerberatung, kein Fahrtenbuch-Ersatz) nimmt ohne Fahrzeug-Auswahl alle Fahrzeuge.
            </p>
          </div>
        )}
      </LoadGuard>
    </>
  );
}
