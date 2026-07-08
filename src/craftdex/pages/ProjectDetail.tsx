import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtNum } from '../../lib/format';
import { fetchProject } from '../api';
import { ProjectStatusBadge } from '../badges';
import { CATEGORY_LABELS, type ProjectData } from '../types';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();

  const state = useAsync<ProjectData | null>(
    () => fetchProject(client, id!),
    [client, id],
  );

  return (
    <LoadGuard state={state}>
      {(p) => {
        if (!p) {
          return <div className="error-box">Auftrag nicht gefunden.</div>;
        }
        const doneSteps = p.steps.filter((s) => s.done).length;
        const costSum = p.costs.reduce((sum, c) => sum + (c.price ?? 0), 0);
        const overBudget = p.budget != null && costSum > p.budget;
        const photos: { label: string; src: string }[] = [];
        if (p.photoBase64) photos.push({ label: 'Auftrag', src: p.photoBase64 });
        for (const s of p.steps) {
          if (s.photoBase64) photos.push({ label: s.title, src: s.photoBase64 });
        }

        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../auftraege">← Alle Aufträge</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>{p.title}</h1>
              <ProjectStatusBadge status={p.status ?? null} />
            </div>
            <p className="muted">
              {CATEGORY_LABELS[p.category] ?? p.category}
              {p.deadline ? ` · Termin ${fmtDate(new Date(p.deadline.date).toISOString())}` : ''}
            </p>

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Kunde</div>
                <div>{p.customer?.name ?? '—'}</div>
                <div className="muted small">
                  {[p.customer?.phone, p.customer?.address].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="card">
                <div className="kpi-label">Stunden</div>
                <div>
                  {fmtNum(p.loggedHours)}
                  {p.estimatedHours ? ` / ${fmtNum(p.estimatedHours)}` : ''} h
                </div>
              </div>
              <div className="card">
                <div className="kpi-label">Fortschritt</div>
                <div>
                  {p.steps.length === 0
                    ? '—'
                    : `${doneSteps} / ${p.steps.length} Schritte`}
                </div>
              </div>
              <div className="card">
                <div className="kpi-label">Kosten / Budget</div>
                <div className={overBudget ? 'badge red' : undefined}>
                  {eur.format(costSum)}
                  {p.budget != null ? ` / ${eur.format(p.budget)}` : ''}
                </div>
              </div>
            </div>

            {p.description && (
              <>
                <div className="section-head">
                  <h2>Beschreibung</h2>
                </div>
                <div className="card">{p.description}</div>
              </>
            )}

            <div className="section-head">
              <h2>Schritte ({p.steps.length})</h2>
            </div>
            {p.steps.length === 0 ? (
              <div className="card empty">Keine Schritte angelegt.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Schritt</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.steps.map((s) => (
                      <tr key={s.id}>
                        <td className="wrap">{s.title}</td>
                        <td>
                          {s.done ? (
                            <span className="badge green">erledigt</span>
                          ) : (
                            <span className="badge">offen</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {p.materials.length > 0 && (
              <>
                <div className="section-head">
                  <h2>Material ({p.materials.length})</h2>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Menge</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.materials.map((m) => (
                        <tr key={m.id}>
                          <td className="wrap">{m.name}</td>
                          <td className="muted">{m.amount ?? '—'}</td>
                          <td>
                            {m.done ? (
                              <span className="badge green">besorgt</span>
                            ) : (
                              <span className="badge amber">offen</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {p.costs.length > 0 && (
              <>
                <div className="section-head">
                  <h2>Kosten ({p.costs.length})</h2>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Position</th>
                        <th>Betrag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.costs.map((c) => (
                        <tr key={c.id}>
                          <td className="wrap">{c.name}</td>
                          <td>{eur.format(c.price ?? 0)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <b>Summe</b>
                        </td>
                        <td>
                          <b>{eur.format(costSum)}</b>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="section-head">
              <h2>Fotos ({photos.length})</h2>
            </div>
            {photos.length === 0 ? (
              <div className="card empty">Keine Fotos zu diesem Auftrag.</div>
            ) : (
              <div className="row" style={{ alignItems: 'flex-start' }}>
                {photos.map((ph, n) => (
                  <a key={n} href={ph.src} target="_blank" rel="noreferrer">
                    <img
                      src={ph.src}
                      alt={ph.label}
                      title={ph.label}
                      style={{
                        width: 220,
                        maxWidth: '100%',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                      }}
                    />
                  </a>
                ))}
              </div>
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
