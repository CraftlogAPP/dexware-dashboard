import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchDocumentSummaries, fetchProjects } from '../api';
import { TypeBadge } from '../badges';
import type { DocumentSummary, Project } from '../types';

export function Overview() {
  const { client } = useAppAuth();

  const state = useAsync<{ docs: DocumentSummary[]; projects: Project[] }>(
    async () => {
      const [docs, projects] = await Promise.all([
        fetchDocumentSummaries(client),
        fetchProjects(client),
      ]);
      return { docs, projects };
    },
    [client],
  );

  return (
    <>
      <h1>Übersicht</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Dein Dokumentenarchiv — live aus der DokuDex-App.
      </p>

      <LoadGuard state={state}>
        {({ docs, projects }) => {
          const withDeadlines = docs.filter((d) => (d.deadlines?.length ?? 0) > 0);
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          const thisMonth = docs.filter(
            (d) => d.created_at && new Date(d.created_at) >= monthStart,
          );
          const recent = docs.slice(0, 8);

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Dokumente</div>
                  <div className="kpi-value">{docs.length}</div>
                  <div className="kpi-sub">im Archiv</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Mit Fristen</div>
                  <div className="kpi-value">{withDeadlines.length}</div>
                  <div className="kpi-sub">Dokumente mit erkannten Terminen</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Projekte</div>
                  <div className="kpi-value">{projects.length}</div>
                  <div className="kpi-sub">Ordner zum Gruppieren</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Diesen Monat</div>
                  <div className="kpi-value">{thisMonth.length}</div>
                  <div className="kpi-sub">neue Dokumente</div>
                </div>
              </div>

              {withDeadlines.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Dokumente mit Fristen</h2>
                    <Link to="dokumente" className="small">
                      Alle Dokumente →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Dokument</th>
                          <th>Typ</th>
                          <th>Fristen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {withDeadlines.slice(0, 8).map((d) => (
                          <tr key={d.id}>
                            <td>
                              <Link to={`dokumente/${d.id}`}>{d.title ?? '—'}</Link>
                            </td>
                            <td>
                              <TypeBadge type={d.type} />
                            </td>
                            <td className="wrap muted">
                              {(d.deadlines ?? []).join(' · ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="section-head">
                <h2>Zuletzt hinzugefügt</h2>
                <Link to="dokumente" className="small">
                  Alle Dokumente →
                </Link>
              </div>
              {recent.length === 0 ? (
                <div className="card empty">
                  Noch keine Dokumente in der Cloud. Melde dich in der DokuDex-App
                  an, dann erscheint dein Archiv hier live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Dokument</th>
                        <th>Typ</th>
                        <th>Zusammenfassung</th>
                        <th>Hinzugefügt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <Link to={`dokumente/${d.id}`}>{d.title ?? '—'}</Link>
                          </td>
                          <td>
                            <TypeBadge type={d.type} />
                          </td>
                          <td className="wrap muted">{d.summary ?? '—'}</td>
                          <td className="muted">{fmtDate(d.created_at)}</td>
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
