import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, num, orNull, s, type FormValues } from '../../components/form';
import { fmtDate, fmtNum, parseLocalDate, toInputDate } from '../../lib/format';
import { fetchProjectSummaries, insertProject, updateProjectHead } from '../api';
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
  const [editing, setEditing] = useState<ProjectSummary | 'new' | null>(null);

  const state = useAsync<ProjectSummary[]>(
    () => fetchProjectSummaries(client),
    [client],
  );

  async function onSave(v: FormValues) {
    if (!session) throw new Error('Nicht angemeldet');
    const deadline = orNull(v.deadline);
    const input = {
      title: s(v.title),
      category: s(v.category),
      status: s(v.status) as ProjectStatus,
      description: orNull(v.description) ?? undefined,
      estimatedHours: num(v.estimatedHours),
      budget: num(v.budget),
      customerName: orNull(v.customerName) ?? undefined,
      deadlineMs: deadline ? parseLocalDate(deadline).getTime() : null,
    };
    if (editing === 'new') await insertProject(client, session.user.id, input);
    else if (editing) await updateProjectHead(client, editing.id, input);
    state.reload();
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
                          <button className="btn ghost small" onClick={() => setEditing(p)}>
                            Bearbeiten
                          </button>
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
        <FormDialog
          title={
            editing === 'new'
              ? 'Auftrag anlegen'
              : `${editing.title ?? 'Auftrag'} bearbeiten`
          }
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'title', label: 'Auftrag', required: true },
            {
              key: 'category',
              label: 'Kategorie',
              kind: 'select',
              required: true,
              options: Object.entries(CATEGORY_LABELS).map(([id, label]) => ({
                value: id,
                label,
              })),
            },
            {
              key: 'status',
              label: 'Status',
              kind: 'select',
              required: true,
              options: (Object.keys(STATUS_LABELS) as ProjectStatus[]).map((st) => ({
                value: st,
                label: STATUS_LABELS[st],
              })),
            },
            { key: 'customerName', label: 'Kunde' },
            { key: 'estimatedHours', label: 'Geschätzte Stunden', kind: 'number' },
            { key: 'budget', label: 'Budget (€)', kind: 'number' },
            { key: 'deadline', label: 'Termin', kind: 'date' },
            { key: 'description', label: 'Beschreibung', kind: 'textarea' },
          ]}
          initial={
            editing === 'new'
              ? { category: 'handwerk', status: 'quote' }
              : {
                  title: editing.title ?? '',
                  category: editing.category ?? 'handwerk',
                  status: editing.status ?? 'quote',
                  customerName: editing.customer_name ?? '',
                  estimatedHours:
                    editing.estimated_hours != null ? String(editing.estimated_hours) : '',
                  budget: editing.budget != null ? String(editing.budget) : '',
                  deadline:
                    editing.deadline_ms != null
                      ? toInputDate(new Date(editing.deadline_ms))
                      : '',
                }
          }
        />
      )}
    </>
  );
}
