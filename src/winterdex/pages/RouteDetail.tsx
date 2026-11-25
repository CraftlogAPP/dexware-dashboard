// Eine Strecke: Skizze (Vorlage + letzte Fahrt), Fahrtenbuch als PDF, Fahrten im Zeitraum.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileDown } from 'lucide-react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { ExcelButton } from '../../components/ExcelButton';
import { ExportNotice } from '../../lib/xlsx';
import { checkPeriod, requirePro, saveSheets } from '../exportActions';
import { periodLabel, runSheets } from '../exportLists';
import { fmtDate, fmtDateTime, parseLocalDate, toInputDate } from '../../lib/format';
import { openReportWindow } from '../../lib/print';
import { FahrtAnsicht } from '../FahrtAnsicht';
import { buildRouteLogHtml } from '../routeReport';
import { fetchOrgPro, withWatermark } from '../pro';
import { fetchRoute, fetchRun, fetchRuns, fmtDistance, type Route, type Run } from '../routes';
import { RunTable } from './Routes';

export function RouteDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));
  const [printErr, setPrintErr] = useState<string | null>(null);

  const state = useAsync<{ route: Route; last: Run | null }>(async () => {
    const route = await fetchRoute(client, id!);
    if (!route) throw new Error('Diese Strecke wurde nicht gefunden.');
    // Letzte gültige Fahrt mit Spur für die Skizze (grün über grau).
    const recent = await fetchRuns(client, { routeId: route.id, limit: 20 });
    const lastMeta = recent.find((r) => !r.canceled);
    const last = lastMeta ? await fetchRun(client, lastMeta.id) : null;
    return { route, last };
  }, [client, id]);

  const runsState = useAsync(
    () =>
      // Vollständig: Grundlage des Strecken-Nachweis-PDF (auch über 500/1.000 Fahrten im Zeitraum).
      fetchRuns(client, {
        all: true,
        routeId: id,
        from: from ? parseLocalDate(from) : undefined,
        to: to ? parseLocalDate(to) : undefined,
      }),
    [client, id, from, to],
  );

  // Live: letzte Fahrt in der Skizze + Fahrtenliste aktuell halten.
  useLiveRefresh([state.refresh, runsState.refresh]);

  // Pro vorab laden: das Druckfenster muss direkt beim Klick aufgehen (sonst blockt der Browser das Pop-up)
  const proState = useAsync(() => fetchOrgPro(client), [client]);
  function printLog(route: Route) {
    setPrintErr(null);
    if (!org) return setPrintErr('Betrieb nicht geladen.');
    if (!from || !to) return setPrintErr('Bitte Von- und Bis-Datum wählen.');
    const runs = [...(runsState.data ?? [])].reverse(); // chronologisch
    const period = `${fmtDate(parseLocalDate(from).toISOString())} – ${fmtDate(parseLocalDate(to).toISOString())}`;
    if (!openReportWindow(withWatermark(buildRouteLogHtml(org.org, route, runs, period), proState.data ?? true)))
      setPrintErr('Das Druckfenster wurde blockiert — bitte Pop-ups für dieses Dashboard erlauben.');
  }

  /** Fahrten dieser Strecke im Zeitraum als Excel (frisch geladen, vollständig). */
  async function exportExcel(route: Route) {
    if (!org) throw new Error('Betrieb nicht geladen.');
    const period = checkPeriod(from, to);
    await requirePro(client);
    const runs = await fetchRuns(client, { all: true, routeId: route.id, from: parseLocalDate(from), to: parseLocalDate(to) });
    if (runs.length === 0) throw new ExportNotice('Im gewählten Zeitraum gibt es keine Fahrten auf dieser Strecke.');
    await saveSheets(
      `WinterDex_Fahrten_${route.name}_${period.from}_bis_${period.to}`,
      `WinterDex Fahrtenliste ${route.name} ${periodLabel(period)}`,
      runSheets({ org: org.org, runs, period, filterLabel: route.name }),
    );
  }

  return (
    <LoadGuard state={state}>
      {({ route, last }) => (
        <>
          <p className="small" style={{ marginBottom: 4 }}>
            <Link to="../strecken">← Alle Strecken</Link>
          </p>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h1 style={{ marginBottom: 0 }}>{route.name}</h1>
            {route.active ? <span className="badge green">aktiv</span> : <span className="badge">pausiert</span>}
          </div>
          <p className="muted">
            {fmtDistance(route.length_m)} · {route.source === 'objects' ? 'aus Objekten verbunden' : 'eigene Strecke (abgefahren)'}
            {route.notes ? ` · ${route.notes}` : ''}
          </p>

          {/* echte Karte: Vorlage + letzte Fahrt (Uhrzeiten je Stelle zeigt die Fahrt selbst); Skizze als Rückfall */}
          <FahrtAnsicht
            plan={route.path}
            track={last?.track}
            missed={last?.missed}
            gaps={last?.gaps}
            startedAt={last?.started_at}
            endedAt={last?.ended_at}
            zeit={false}
            label={`Karte der Strecke ${route.name}${last ? ` mit der letzten Fahrt vom ${fmtDateTime(last.started_at)}` : ''}`}
          />
          <p className="small muted" style={{ marginTop: -8 }}>
            {last ? (
              <>
                Grün = letzte Fahrt (<Link to={`../strecken/fahrten/${last.id}`}>{fmtDateTime(last.started_at)}</Link>), rot = dabei nicht befahren.
              </>
            ) : (
              'Noch keine Fahrt auf dieser Strecke.'
            )}
          </p>

          <div className="section-head">
            <h2>Fahrten & Fahrtenbuch</h2>
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                Von
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                Bis
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <button className="btn" onClick={() => printLog(route)} disabled={runsState.loading || !!runsState.error}>
                <FileDown className="i" aria-hidden /> Fahrtenbuch als PDF
              </button>
              <ExcelButton
                onExport={() => exportExcel(route)}
                title="Fahrten dieser Strecke im Zeitraum als Excel-Datei: Kilometer, Stunden, Abdeckung (Pro)"
              />
            </div>
            {printErr && <div className="error-box" style={{ marginTop: 10 }}>{printErr}</div>}
          </div>
          <LoadGuard state={runsState}>{(runs) => <RunTable runs={runs} linkPrefix="../strecken/fahrten/" showRoute={false} />}</LoadGuard>
        </>
      )}
    </LoadGuard>
  );
}
