import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { fetchDocument, fetchProjects } from '../api';
import { TypeBadge } from '../badges';
import type { DocumentData, Project } from '../types';

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();

  const state = useAsync<{ doc: DocumentData | null; projects: Project[] }>(
    async () => {
      const [doc, projects] = await Promise.all([
        fetchDocument(client, id!),
        fetchProjects(client),
      ]);
      return { doc, projects };
    },
    [client, id],
  );

  return (
    <LoadGuard state={state}>
      {({ doc: d, projects }) => {
        if (!d) {
          return <div className="error-box">Dokument nicht gefunden.</div>;
        }
        const a = d.analysis;
        const project = d.projectId
          ? projects.find((p) => p.id === d.projectId)
          : undefined;
        const imageSrc = d.imageBase64
          ? `data:image/jpeg;base64,${d.imageBase64}`
          : null;

        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../dokumente">← Alle Dokumente</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>{d.title}</h1>
              <TypeBadge type={d.type} />
            </div>
            <p className="muted">
              {a?.documentType ? `${a.documentType} · ` : ''}
              Hinzugefügt {fmtDate(d.createdAt)}
              {project ? ` · Projekt: ${project.name}` : ''}
              {d.updatedAt && d.updatedAt !== d.createdAt
                ? ` · Aktualisiert ${fmtDateTime(d.updatedAt)}`
                : ''}
            </p>

            {a?.summary && (
              <>
                <div className="section-head">
                  <h2>Zusammenfassung</h2>
                </div>
                <div className="card">{a.summary}</div>
              </>
            )}

            {(a?.keyPoints?.length ?? 0) > 0 && (
              <>
                <div className="section-head">
                  <h2>Das Wichtigste</h2>
                </div>
                <div className="card">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {a!.keyPoints!.map((p, n) => (
                      <li key={n}>{p}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {(a?.deadlines?.length ?? 0) > 0 && (
              <>
                <div className="section-head">
                  <h2>Fristen ({a!.deadlines!.length})</h2>
                </div>
                <div className="card">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {a!.deadlines!.map((f, n) => (
                      <li key={n}>
                        <span className="badge amber">Frist</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {(a?.actionItems?.length ?? 0) > 0 && (
              <>
                <div className="section-head">
                  <h2>Was tun?</h2>
                </div>
                <div className="card">
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {a!.actionItems!.map((t, n) => (
                      <li key={n}>{t}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {a?.recommendation && (
              <>
                <div className="section-head">
                  <h2>Empfehlung</h2>
                </div>
                <div className="card">{a.recommendation}</div>
              </>
            )}

            {d.notes && (
              <>
                <div className="section-head">
                  <h2>Notizen</h2>
                </div>
                <div className="card">{d.notes}</div>
              </>
            )}

            <div className="section-head">
              <h2>Dokument-Scan</h2>
            </div>
            {imageSrc ? (
              <a href={imageSrc} target="_blank" rel="noreferrer">
                <img
                  src={imageSrc}
                  alt={d.title}
                  style={{
                    width: 420,
                    maxWidth: '100%',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                  }}
                />
              </a>
            ) : (
              <div className="card empty">Kein Scan-Bild in der Cloud.</div>
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
