import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchDocumentSummaries, fetchProjects } from '../api';
import type { DocumentSummary, Project } from '../types';

export function Projects() {
  const { client } = useAppAuth();

  const state = useAsync<{ projects: Project[]; docs: DocumentSummary[] }>(
    async () => {
      const [projects, docs] = await Promise.all([
        fetchProjects(client),
        fetchDocumentSummaries(client),
      ]);
      return { projects, docs };
    },
    [client],
  );

  return (
    <>
      <h1>Projekte</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Ordner zum Gruppieren von Dokumenten — z. B. „Umzug" oder „Steuer 2026".
        Anlegen läuft in der App.
      </p>

      <LoadGuard state={state}>
        {({ projects, docs }) => {
          if (projects.length === 0) {
            return <div className="card empty">Noch keine Projekte in der Cloud.</div>;
          }
          const unassigned = docs.filter((d) => !d.project_id).length;
          return (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Projekt</th>
                      <th>Dokumente</th>
                      <th>Angelegt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => {
                      const count = docs.filter((d) => d.project_id === p.id).length;
                      return (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td className="muted">
                            {count > 0 ? (
                              <Link to={`../dokumente?projekt=${p.id}`}>{count}</Link>
                            ) : (
                              0
                            )}
                          </td>
                          <td className="muted">{fmtDate(p.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {unassigned > 0 && (
                <p className="muted small">
                  {unassigned} Dokument{unassigned === 1 ? '' : 'e'} ohne Projekt.
                </p>
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
