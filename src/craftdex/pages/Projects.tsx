import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtNum } from '../../lib/format';
import { fetchProjectSummaries } from '../api';
import { ProjectStatusBadge } from '../badges';
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type ProjectStatus,
  type ProjectSummary,
} from '../types';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function Projects() {
  const { client } = useAppAuth();
  const [status, setStatus] = useState<'' | ProjectStatus>('');
  const [category, setCategory] = useState('');

  const state = useAsync<ProjectSummary[]>(
    () => fetchProjectSummaries(client),
    [client],
  );

  return (
    <>
      <h1>Aufträge</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Aufträge und Projekte mit Status, Stunden und Budget. Anlegen und
        Bearbeiten läuft in der App.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | ProjectStatus)}
            >
              <option value="">Alle Status</option>
              {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            Kategorie
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Alle Kategorien</option>
              {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <LoadGuard state={state}>
        {(allProjects) => {
          const projects = allProjects.filter(
            (p) =>
              (!status || p.status === status) &&
              (!category || p.category === category),
          );
          return projects.length === 0 ? (
            <div className="card empty">Keine Aufträge mit den gewählten Filtern.</div>
          ) : (
            <>
              <p className="muted small">{projects.length} Aufträge</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Auftrag</th>
                      <th>Kategorie</th>
                      <th>Kunde</th>
                      <th>Status</th>
                      <th>Stunden</th>
                      <th>Budget</th>
                      <th>Termin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link to={p.id}>{p.title ?? '—'}</Link>
                        </td>
                        <td className="muted">
                          {p.category ? (CATEGORY_LABELS[p.category] ?? p.category) : '—'}
                        </td>
                        <td className="wrap muted">{p.customer_name ?? '—'}</td>
                        <td>
                          <ProjectStatusBadge status={p.status} />
                        </td>
                        <td className="muted">
                          {fmtNum(p.logged_hours)}
                          {p.estimated_hours ? ` / ${fmtNum(p.estimated_hours)}` : ''} h
                        </td>
                        <td className="muted">
                          {p.budget != null ? eur.format(p.budget) : '—'}
                        </td>
                        <td className="muted">
                          {p.deadline_ms != null
                            ? fmtDate(new Date(p.deadline_ms).toISOString())
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
