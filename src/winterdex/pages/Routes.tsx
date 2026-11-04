// Strecken: Tagesstand je Strecke + alle Fahrten mit Abdeckung (Server-Werte).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { ActionBadge, LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { fmtDateTime, parseLocalDate, toInputDate } from '../../lib/format';
import { CoverageBadge } from '../RouteSketch';
import { fetchRoutes, fetchRuns, fmtDistance, fmtPct, localDay, ROUTES_MISSING, type Route, type RunMeta } from '../routes';

const FREE = '__free';

export function Routes() {
  const { client } = useAppAuth();
  const [routeId, setRouteId] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));

  // Strecken + jüngste Fahrten (für „heute gefahren" / „letzte Fahrt") einmal laden.
  const base = useAsync<{ routes: Route[]; recent: RunMeta[] }>(async () => {
    const [routes, recent] = await Promise.all([fetchRoutes(client), fetchRuns(client, { limit: 1000 })]);
    return { routes, recent };
  }, [client]);

  const runsState = useAsync<RunMeta[]>(
    () =>
      fetchRuns(client, {
        routeId: routeId && routeId !== FREE ? routeId : undefined,
        free: routeId === FREE,
        from: from ? parseLocalDate(from) : undefined,
        to: to ? parseLocalDate(to) : undefined,
      }),
    [client, routeId, from, to],
  );

  // Live: neue Fahrten erscheinen ohne Neuladen (alle 30 s + beim Zurückwechseln in den Tab).
  useLiveRefresh([base.refresh, runsState.refresh]);

  if (base.error === ROUTES_MISSING || runsState.error === ROUTES_MISSING) {
    return (
      <>
        <h1>Strecken</h1>
        <div className="info-box">
          Der Strecken-Nachweis ist in deinem WinterDex noch nicht eingerichtet. Sobald die App aktualisiert ist und die erste
          Strecke angelegt wurde, erscheint hier alles live.
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Strecken</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Gehwege, Straßen und Radwege, die per GPS abgefahren werden. Länge und Abdeckung berechnet der Server — unveränderlich
        mit Prüfcode, Stornos sind gekennzeichnet.
      </p>

      <LoadGuard state={base}>
        {({ routes, recent }) => {
          const today = localDay(new Date());
          const valid = recent.filter((r) => !r.canceled);
          const lastByRoute = new Map<string, RunMeta>();
          for (const r of valid) if (r.route_id && !lastByRoute.has(r.route_id)) lastByRoute.set(r.route_id, r);
          const active = routes.filter((r) => r.active);
          const doneToday = active.filter((r) => {
            const last = lastByRoute.get(r.id);
            return last && localDay(last.started_at) === today;
          });
          const week = valid.filter((r) => Date.now() - Date.parse(r.started_at) <= 7 * 864e5);
          const withCov = week.filter((r) => r.coverage_pct != null);
          const avgCov = withCov.length ? withCov.reduce((a, r) => a + (r.coverage_pct ?? 0), 0) / withCov.length : null;
          const incomplete = withCov.filter((r) => (r.coverage_pct ?? 0) < 95).length;

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Heute gefahren</div>
                  <div className="kpi-value">
                    {doneToday.length} / {active.length}
                  </div>
                  <div className="kpi-sub">aktive Strecken</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Fahrten 7 Tage</div>
                  <div className="kpi-value">{week.length}</div>
                  <div className="kpi-sub">ohne Stornos, inkl. freier Fahrten</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Ø Abdeckung 7 Tage</div>
                  <div className="kpi-value">{fmtPct(avgCov == null ? null : Math.round(avgCov * 10) / 10)}</div>
                  <div className="kpi-sub">{withCov.length} Fahrten mit Vorlage</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Unvollständig 7 Tage</div>
                  <div className="kpi-value">{incomplete}</div>
                  <div className="kpi-sub">unter 95 % abgedeckt</div>
                </div>
              </div>

              <div className="section-head">
                <h2>Strecken ({routes.length})</h2>
              </div>
              {routes.length === 0 ? (
                <div className="card empty">
                  Noch keine Strecken. In der App unter „Strecken" → „Neue Strecke" einmal abfahren oder aus Objekten verbinden.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Strecke</th>
                        <th>Länge</th>
                        <th>Heute</th>
                        <th>Letzte Fahrt</th>
                        <th>Abdeckung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map((r) => {
                        const last = lastByRoute.get(r.id);
                        const done = last && localDay(last.started_at) === today;
                        return (
                          <tr key={r.id}>
                            <td className="wrap">
                              <Link to={r.id}>{r.name}</Link>
                              <div className="small muted">{r.source === 'objects' ? 'aus Objekten verbunden' : 'eigene Strecke'}</div>
                            </td>
                            <td>{fmtDistance(r.length_m)}</td>
                            <td>
                              {!r.active ? (
                                <span className="badge">pausiert</span>
                              ) : done ? (
                                <span className="badge green">gefahren ✓</span>
                              ) : (
                                <span className="badge amber">offen</span>
                              )}
                            </td>
                            <td className="muted">{last ? fmtDateTime(last.started_at) : 'noch nie'}</td>
                            <td>{last ? <CoverageBadge pct={last.coverage_pct} /> : <span className="muted">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="section-head">
                <h2>Fahrten</h2>
              </div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="row">
                  <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
                    Strecke
                    <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                      <option value="">Alle Fahrten</option>
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                      <option value={FREE}>Nur freie Fahrten (ohne Vorlage)</option>
                    </select>
                  </label>
                  <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                    Von
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </label>
                  <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
                    Bis
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </label>
                </div>
              </div>
              <LoadGuard state={runsState}>{(runs) => <RunTable runs={runs} linkPrefix="fahrten/" />}</LoadGuard>
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}

/** Fahrten-Tabelle (auch auf der Strecken-Detailseite). */
export function RunTable({ runs, linkPrefix, showRoute = true }: { runs: RunMeta[]; linkPrefix: string; showRoute?: boolean }) {
  if (runs.length === 0) return <div className="card empty">Keine Fahrten im gewählten Zeitraum.</div>;
  return (
    <>
      <p className="muted small">{runs.length} Fahrten</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              {showRoute && <th>Strecke</th>}
              <th>Gefahren</th>
              <th>Abdeckung</th>
              <th>Maßnahme</th>
              <th>Dokumentiert von</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`${linkPrefix}${r.id}`}>{fmtDateTime(r.started_at)}</Link>
                  {(r.gaps?.length > 0 || r.gps_mocked) && (
                    <div className="small gps-warn" style={{ color: '#B91C1C', fontWeight: 700 }}>
                      {r.gps_mocked ? 'Fake-GPS gemeldet' : `${r.gaps.length}× Pause`}
                    </div>
                  )}
                </td>
                {showRoute && <td className="wrap">{r.route_name ?? <span className="muted">Freie Fahrt</span>}</td>}
                <td>{fmtDistance(r.track_length_m)}</td>
                <td>
                  <CoverageBadge pct={r.coverage_pct} canceled={r.canceled} />
                  {!r.canceled && r.missed_m ? <div className="small muted">{fmtDistance(r.missed_m)} nicht befahren</div> : null}
                </td>
                <td>
                  <ActionBadge action={r.action} />
                </td>
                <td className="muted">{r.performer_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
