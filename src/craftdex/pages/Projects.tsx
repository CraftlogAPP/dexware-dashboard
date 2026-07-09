import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtNum } from '../../lib/format';
import { fetchProject, fetchProjectSummaries, softDeleteProject } from '../api';
import { ProjectDialog, type ProjectHead } from '../dialogs';
import { ProjectStatusBadge } from '../badges';
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type ProjectStatus,
  type ProjectSummary,
} from '../types';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function Projects() {
  const { client, session } = useAppAuth();
  const [status, setStatus] = useState<'' | ProjectStatus>('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<ProjectHead | 'new' | null>(null);

  const state = useAsync<ProjectSummary[]>(
    () => fetchProjectSummaries(client),
    [client],
  );

  async function onEdit(p: ProjectSummary) {
    // Die Listen-Zeile lädt die Beschreibung nicht mit — für den Dialog den
    // vollen Blob holen, sonst würde die Beschreibung leer überschrieben.
    try {
      const full = await fetchProject(client, p.id);
      setEditing({
        id: p.id,
        title: full?.title ?? p.title ?? '',
        category: full?.category ?? p.category,
        status: full?.status ?? p.status,
        customerName: full?.customer?.name ?? p.customer_name,
        estimatedHours: full?.estimatedHours ?? p.estimated_hours,
        budget: full?.budget ?? p.budget,
        deadlineMs: full?.deadline?.date ?? p.deadline_ms,
        description: full?.description ?? null,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function onDelete(p: ProjectSummary) {
    if (
      !window.confirm(
        `Auftrag „${p.title ?? 'ohne Titel'}" wirklich löschen? Der Auftrag wird auch in der App gelöscht.`,
      )
    )
      return;
    try {
      await softDeleteProject(client, p.id);
      state.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Aufträge</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Auftrag anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Aufträge und Projekte mit Status, Stunden und Budget — Schritte,
        Material und Fotos pflegt die App.
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
                      <th></th>
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
                        <td>
                          <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                            <button className="btn ghost small" onClick={() => void onEdit(p)}>
                              Bearbeiten
                            </button>
                            <button className="btn ghost small" onClick={() => onDelete(p)}>
                              Löschen
                            </button>
                          </span>
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

      {editing && (
        <ProjectDialog
          client={client}
          userId={session?.user.id}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            state.reload();
          }}
        />
      )}
    </>
  );
}
