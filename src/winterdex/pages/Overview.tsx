import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../OrgContext';
import { fetchOperations, fetchProperties } from '../api';
import { ActionBadge, LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime, weatherLabel } from '../../lib/format';
import type { Operation, Property } from '../types';

interface OverviewData {
  properties: Property[];
  recentOps: Operation[];
}

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [properties, recentOps] = await Promise.all([
      fetchProperties(client),
      fetchOperations(client, { limit: 200 }),
    ]);
    return { properties, recentOps };
  }, [client]);

  return (
    <>
      <h1>Übersicht</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} · Saison im Blick — live aus der WinterDex-App.
        </p>
      )}

      <LoadGuard state={state}>
        {({ properties, recentOps }) => {
          const activeProps = properties.filter((p) => p.active);
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const ops7 = recentOps.filter(
            (o) => !o.canceled && now - new Date(o.started_at).getTime() <= 7 * dayMs,
          );
          const ops24 = ops7.filter(
            (o) => now - new Date(o.started_at).getTime() <= dayMs,
          );

          const lastByProp = new Map<string, Operation>();
          for (const op of recentOps) {
            if (op.canceled) continue;
            if (!lastByProp.has(op.property_id)) lastByProp.set(op.property_id, op);
          }
          const staleProps = activeProps.filter((p) => {
            const last = lastByProp.get(p.id);
            return !last || now - new Date(last.started_at).getTime() > 2 * dayMs;
          });

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Aktive Objekte</div>
                  <div className="kpi-value">{activeProps.length}</div>
                  <div className="kpi-sub">{properties.length} insgesamt</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Einsätze 24 h</div>
                  <div className="kpi-value">{ops24.length}</div>
                  <div className="kpi-sub">ohne Stornos</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Einsätze 7 Tage</div>
                  <div className="kpi-value">{ops7.length}</div>
                  <div className="kpi-sub">ohne Stornos</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">&gt; 48 h ohne Einsatz</div>
                  <div className="kpi-value">{staleProps.length}</div>
                  <div className="kpi-sub">von {activeProps.length} aktiven Objekten</div>
                </div>
              </div>

              {staleProps.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Lange nicht dokumentiert</h2>
                    <Link to="../objekte" className="small">
                      Alle Objekte →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Objekt</th>
                          <th>Adresse</th>
                          <th>Letzter Einsatz</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staleProps.slice(0, 8).map((p) => {
                          const last = lastByProp.get(p.id);
                          return (
                            <tr key={p.id}>
                              <td>
                                <Link to={`../objekte/${p.id}`}>{p.name}</Link>
                              </td>
                              <td className="wrap muted">{p.address}</td>
                              <td>
                                {last ? (
                                  fmtDateTime(last.started_at)
                                ) : (
                                  <span className="badge amber">noch nie</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="section-head">
                <h2>Letzte Einsätze</h2>
                <Link to="../einsaetze" className="small">
                  Alle Einsätze →
                </Link>
              </div>
              {recentOps.length === 0 ? (
                <div className="card empty">
                  Noch keine Einsätze dokumentiert. Sobald dein Team in der App
                  dokumentiert, erscheint hier alles live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Zeitpunkt</th>
                        <th>Objekt</th>
                        <th>Maßnahme</th>
                        <th>Wetter</th>
                        <th>Dokumentiert von</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOps.slice(0, 10).map((op) => (
                        <tr key={op.id}>
                          <td>
                            <Link to={`../einsaetze/${op.id}`}>
                              {fmtDateTime(op.started_at)}
                            </Link>
                          </td>
                          <td className="wrap">
                            {properties.find((p) => p.id === op.property_id)?.name ??
                              '—'}
                          </td>
                          <td>
                            <ActionBadge action={op.action} canceled={op.canceled} />
                          </td>
                          <td className="muted">{weatherLabel(op.weather)}</td>
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
    </>
  );
}
