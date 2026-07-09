import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDate } from '../../lib/format';
import { fetchDocumentSummaries, fetchProjects, updateDocumentHead } from '../api';
import { TypeBadge } from '../badges';
import {
  TYPE_LABELS,
  type DocType,
  type DocumentSummary,
  type Project,
} from '../types';

export function Documents() {
  const { client } = useAppAuth();
  const [params] = useSearchParams();
  const [type, setType] = useState<'' | DocType>('');
  const [projectId, setProjectId] = useState(params.get('projekt') ?? '');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DocumentSummary | null>(null);

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

  async function onSave(v: FormValues) {
    if (!editing) throw new Error('Kein Dokument gewählt');
    await updateDocumentHead(client, editing.id, {
      title: s(v.title),
      type: s(v.type) as DocType,
      projectId: orNull(v.projectId),
    });
    state.reload();
  }

  return (
    <>
      <h1>Dokumente</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle archivierten Dokumente mit KI-Zusammenfassung und Fristen — Titel,
        Typ und Projekt hier pflegbar; Scannen und Analysieren läuft in der App.
      </p>

      <LoadGuard state={state}>
        {({ docs: allDocs, projects }) => {
          const q = search.trim().toLowerCase();
          const docs = allDocs.filter(
            (d) =>
              (!type || d.type === type) &&
              (!projectId || d.project_id === projectId) &&
              (!q ||
                (d.title ?? '').toLowerCase().includes(q) ||
                (d.summary ?? '').toLowerCase().includes(q) ||
                (d.ai_type ?? '').toLowerCase().includes(q)),
          );
          const projectName = (id: string | null) =>
            projects.find((p) => p.id === id)?.name ?? '—';

          return (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="row">
                  <label
                    className="field"
                    style={{ flex: 2, minWidth: 200, marginBottom: 0 }}
                  >
                    Suche
                    <input
                      type="search"
                      placeholder="Titel, Zusammenfassung, Dokumenttyp …"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <label
                    className="field"
                    style={{ flex: 1, minWidth: 160, marginBottom: 0 }}
                  >
                    Typ
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as '' | DocType)}
                    >
                      <option value="">Alle Typen</option>
                      {(Object.keys(TYPE_LABELS) as DocType[]).map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    className="field"
                    style={{ flex: 1, minWidth: 160, marginBottom: 0 }}
                  >
                    Projekt
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                    >
                      <option value="">Alle Projekte</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {docs.length === 0 ? (
                <div className="card empty">
                  Keine Dokumente mit den gewählten Filtern.
                </div>
              ) : (
                <>
                  <p className="muted small">{docs.length} Dokumente</p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Dokument</th>
                          <th>Typ</th>
                          <th>KI-Typ</th>
                          <th>Projekt</th>
                          <th>Fristen</th>
                          <th>Hinzugefügt</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {docs.map((d) => (
                          <tr key={d.id}>
                            <td>
                              <Link to={d.id}>{d.title ?? '—'}</Link>
                            </td>
                            <td>
                              <TypeBadge type={d.type} />
                            </td>
                            <td className="muted">{d.ai_type ?? '—'}</td>
                            <td className="muted">{projectName(d.project_id)}</td>
                            <td className="wrap muted">
                              {(d.deadlines?.length ?? 0) > 0
                                ? d.deadlines!.join(' · ')
                                : '—'}
                            </td>
                            <td className="muted">{fmtDate(d.created_at)}</td>
                            <td>
                              <button
                                className="btn ghost small"
                                onClick={() => setEditing(d)}
                              >
                                Bearbeiten
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {editing && (
                <FormDialog
                  title={`${editing.title ?? 'Dokument'} bearbeiten`}
                  onClose={() => setEditing(null)}
                  onSave={onSave}
                  fields={[
                    { key: 'title', label: 'Titel', required: true },
                    {
                      key: 'type',
                      label: 'Typ',
                      kind: 'select',
                      required: true,
                      options: (Object.keys(TYPE_LABELS) as DocType[]).map((t) => ({
                        value: t,
                        label: TYPE_LABELS[t],
                      })),
                    },
                    {
                      key: 'projectId',
                      label: 'Projekt',
                      kind: 'select',
                      hint: 'Leer lassen = ohne Projekt',
                      options: projects.map((p) => ({ value: p.id, label: p.name })),
                    },
                  ]}
                  initial={{
                    title: editing.title ?? '',
                    type: editing.type ?? 'other',
                    projectId: editing.project_id ?? '',
                  }}
                />
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
