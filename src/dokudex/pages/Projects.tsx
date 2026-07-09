import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, s, type FormValues } from '../../components/form';
import { fmtDate } from '../../lib/format';
import {
  deleteProject,
  fetchDocumentSummaries,
  fetchProjects,
  saveProject,
} from '../api';
import type { DocumentSummary, Project } from '../types';

export function Projects() {
  const { client, session } = useAppAuth();
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

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

  async function onSave(v: FormValues) {
    if (!session) throw new Error('Nicht angemeldet');
    await saveProject(
      client,
      session.user.id,
      s(v.name),
      editing === 'new' ? undefined : (editing ?? undefined),
    );
    state.reload();
  }

  async function onDelete(p: Project, memberDocs: DocumentSummary[]) {
    if (!session) return;
    if (
      !window.confirm(
        `Projekt „${p.name}" wirklich löschen? Die zugeordneten Dokumente bleiben erhalten, verlieren aber die Projekt-Zuordnung.`,
      )
    )
      return;
    try {
      await deleteProject(client, session.user.id, p, memberDocs);
      state.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Projekte</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Projekt anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Ordner zum Gruppieren von Dokumenten — z. B. „Umzug" oder „Steuer 2026".
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
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => {
                      const memberDocs = docs.filter((d) => d.project_id === p.id);
                      const count = memberDocs.length;
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
                          <td>
                            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                              <button
                                className="btn ghost small"
                                onClick={() => setEditing(p)}
                              >
                                Umbenennen
                              </button>
                              <button
                                className="btn ghost small"
                                onClick={() => onDelete(p, memberDocs)}
                              >
                                Löschen
                              </button>
                            </span>
                          </td>
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

      {editing && (
        <FormDialog
          title={editing === 'new' ? 'Projekt anlegen' : `${editing.name} umbenennen`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[{ key: 'name', label: 'Name', required: true }]}
          initial={editing === 'new' ? {} : { name: editing.name }}
        />
      )}
    </>
  );
}
