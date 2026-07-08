import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtNum } from '../../lib/format';
import { fetchProjectSummaries } from '../api';
import { ProjectStatusBadge } from '../badges';
import type { ProjectSummary } from '../types';

export function Overview() {
  const { client } = useAppAuth();

  const state = useAsync<ProjectSummary[]>(
    () => fetchProjectSummaries(client),
    [client],
  );

  return (
    <>
      <h1>Übersicht</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Deine Aufträge und Projekte — live aus der CraftDex-App.
      </p>

      <LoadGuard state={state}>
        {(projects) => {
          const now = Date.now();
          const inProgress = projects.filter((p) => p.status === 'in_progress');
          const quotes = projects.filter((p) => p.status === 'quote');
          const toInvoice = projects.filter((p) => p.status === 'completed');
          const hours = projects.reduce((sum, p) => sum + (p.logged_hours ?? 0), 0);
          const withDeadline = projects
            .filter(
              (p) =>
                p.deadline_ms != null &&
                p.status !== 'completed' &&
                p.status !== 'invoiced',
            )
            .sort((a, b) => (a.deadline_ms ?? 0) - (b.deadline_ms ?? 0));
          const recent = projects.slice(0, 8);

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">In Arbeit</div>
                  <div className="kpi-value">{inProgress.length}</div>
                  <div className="kpi-sub">{projects.length} Aufträge insgesamt</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Offene Angebote</div>
                  <div className="kpi-value">{quotes.length}</div>
                  <div className="kpi-sub">warten auf Zusage</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Abzurechnen</div>
                  <div className="kpi-value">{toInvoice.length}</div>
                  <div className="kpi-sub">abgeschlossen, noch nicht abgerechnet</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Erfasste Stunden</div>
                  <div className="kpi-value">{fmtNum(hours)}</div>
                  <div className="kpi-sub">über alle Aufträge</div>
                </div>
              </div>

              {withDeadline.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Anstehende Termine</h2>
                    <Link to="auftraege" className="small">
                      Alle Aufträge →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Auftrag</th>
                          <th>Kunde</th>
                          <th>Status</th>
                          <th>Termin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {withDeadline.slice(0, 8).map((p) => (
                          <tr key={p.id}>
                            <td>
                              <Link to={`auftraege/${p.id}`}>{p.title ?? '—'}</Link>
                            </td>
                            <td className="wrap muted">{p.customer_name ?? '—'}</td>
                            <td>
                              <ProjectStatusBadge status={p.status} />
                            </td>
                            <td>
                              {fmtDate(new Date(p.deadline_ms!).toISOString())}{' '}
                              {p.deadline_ms! < now && (
                                <span className="badge red">überfällig</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="section-head">
                <h2>Zuletzt bearbeitet</h2>
                <Link to="auftraege" className="small">
                  Alle Aufträge →
                </Link>
              </div>
              {recent.length === 0 ? (
                <div className="card empty">
                  Noch keine Aufträge in der Cloud. Aktiviere in der CraftDex-App den
                  Cloud-Sync, dann erscheint hier alles live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Auftrag</th>
                        <th>Kunde</th>
                        <th>Status</th>
                        <th>Stunden</th>
                        <th>Aktualisiert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <Link to={`auftraege/${p.id}`}>{p.title ?? '—'}</Link>
                          </td>
                          <td className="wrap muted">{p.customer_name ?? '—'}</td>
                          <td>
                            <ProjectStatusBadge status={p.status} />
                          </td>
                          <td className="muted">
                            {fmtNum(p.logged_hours)}
                            {p.estimated_hours ? ` / ${fmtNum(p.estimated_hours)}` : ''} h
                          </td>
                          <td className="muted">{fmtDate(p.updated_at)}</td>
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
