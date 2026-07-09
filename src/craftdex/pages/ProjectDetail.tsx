import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, num, orNull, s } from '../../components/form';
import { fmtDate, fmtNum } from '../../lib/format';
import {
  addCost,
  addMaterial,
  addStep,
  fetchProject,
  removeCost,
  setLoggedHours,
  toggleMaterial,
  toggleStep,
} from '../api';
import { ProjectDialog } from '../dialogs';
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

  const [editingHead, setEditingHead] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [addingCost, setAddingCost] = useState(false);
  const [loggingHours, setLoggingHours] = useState(false);
  // Sperrt die Checkboxen/Entfernen-Buttons, solange ein Schreibvorgang läuft.
  const [busy, setBusy] = useState(false);

  // Blob-Mutation ausführen und danach den Detailstand neu laden.
  async function run(op: () => Promise<void>) {
    setBusy(true);
    try {
      await op();
      state.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LoadGuard state={state}>
      {(p) => {
        if (!p) {
          return <div className="error-box">Auftrag nicht gefunden.</div>;
        }
        const doneSteps = p.steps.filter((st) => st.done).length;
        const costSum = p.costs.reduce((sum, c) => sum + (c.price ?? 0), 0);
        const overBudget = p.budget != null && costSum > p.budget;
        const photos: { label: string; src: string }[] = [];
        if (p.photoBase64) photos.push({ label: 'Auftrag', src: p.photoBase64 });
        for (const st of p.steps) {
          if (st.photoBase64) photos.push({ label: st.title, src: st.photoBase64 });
        }

        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../auftraege">← Alle Aufträge</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>{p.title}</h1>
              <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <button className="btn ghost small" onClick={() => setEditingHead(true)}>
                  Bearbeiten
                </button>
                <ProjectStatusBadge status={p.status ?? null} />
              </span>
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
                <button
                  className="btn ghost small"
                  style={{ marginTop: 6 }}
                  onClick={() => setLoggingHours(true)}
                >
                  Stunden erfassen
                </button>
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
              <button className="btn small" onClick={() => setAddingStep(true)}>
                ＋ Schritt
              </button>
            </div>
            {p.steps.length === 0 ? (
              <div className="card empty">Keine Schritte angelegt.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Schritt</th>
                      <th>Erledigt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.steps.map((st) => (
                      <tr key={st.id}>
                        <td className="wrap">{st.title}</td>
                        <td>
                          <label className="row" style={{ gap: 6, margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={st.done}
                              disabled={busy}
                              onChange={() =>
                                run(() => toggleStep(client, id!, st.id, !st.done))
                              }
                            />
                            {st.done ? 'erledigt' : 'offen'}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="section-head">
              <h2>Material ({p.materials.length})</h2>
              <button className="btn small" onClick={() => setAddingMaterial(true)}>
                ＋ Material
              </button>
            </div>
            {p.materials.length === 0 ? (
              <div className="card empty">Kein Material angelegt.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Menge</th>
                      <th>Besorgt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.materials.map((m) => (
                      <tr key={m.id}>
                        <td className="wrap">{m.name}</td>
                        <td className="muted">{m.amount ?? '—'}</td>
                        <td>
                          <label className="row" style={{ gap: 6, margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={m.done}
                              disabled={busy}
                              onChange={() =>
                                run(() => toggleMaterial(client, id!, m.id, !m.done))
                              }
                            />
                            {m.done ? 'besorgt' : 'offen'}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="section-head">
              <h2>Kosten ({p.costs.length})</h2>
              <button className="btn small" onClick={() => setAddingCost(true)}>
                ＋ Kostenpunkt
              </button>
            </div>
            {p.costs.length === 0 ? (
              <div className="card empty">Keine Kosten erfasst.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Betrag</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.costs.map((c) => (
                      <tr key={c.id}>
                        <td className="wrap">{c.name}</td>
                        <td>{eur.format(c.price ?? 0)}</td>
                        <td>
                          <button
                            className="btn ghost small"
                            disabled={busy}
                            onClick={() => run(() => removeCost(client, id!, c.id))}
                          >
                            Entfernen
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td>
                        <b>Summe</b>
                      </td>
                      <td>
                        <b>{eur.format(costSum)}</b>
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
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

            {editingHead && (
              <ProjectDialog
                client={client}
                userId={undefined}
                editing={{
                  id: p.id,
                  title: p.title,
                  category: p.category,
                  status: p.status ?? null,
                  customerName: p.customer?.name ?? null,
                  estimatedHours: p.estimatedHours ?? null,
                  budget: p.budget ?? null,
                  deadlineMs: p.deadline?.date ?? null,
                  description: p.description ?? null,
                }}
                onClose={() => setEditingHead(false)}
                onSaved={() => {
                  setEditingHead(false);
                  state.reload();
                }}
              />
            )}

            {addingStep && (
              <FormDialog
                title="Schritt hinzufügen"
                onClose={() => setAddingStep(false)}
                onSave={async (v) => {
                  await addStep(client, id!, s(v.title));
                  state.reload();
                }}
                fields={[{ key: 'title', label: 'Schritt', required: true }]}
                initial={{}}
              />
            )}

            {addingMaterial && (
              <FormDialog
                title="Material hinzufügen"
                onClose={() => setAddingMaterial(false)}
                onSave={async (v) => {
                  await addMaterial(client, id!, s(v.name), orNull(v.amount) ?? undefined);
                  state.reload();
                }}
                fields={[
                  { key: 'name', label: 'Material', required: true },
                  { key: 'amount', label: 'Menge', hint: 'optional, z. B. „5 m" oder „2 Stück"' },
                ]}
                initial={{}}
              />
            )}

            {addingCost && (
              <FormDialog
                title="Kostenpunkt hinzufügen"
                onClose={() => setAddingCost(false)}
                onSave={async (v) => {
                  await addCost(client, id!, s(v.name), num(v.price) ?? 0);
                  state.reload();
                }}
                fields={[
                  { key: 'name', label: 'Position', required: true },
                  { key: 'price', label: 'Preis (€)', kind: 'number', required: true },
                ]}
                initial={{}}
              />
            )}

            {loggingHours && (
              <FormDialog
                title="Stunden erfassen"
                submitLabel="Übernehmen"
                onClose={() => setLoggingHours(false)}
                onSave={async (v) => {
                  await setLoggedHours(client, id!, num(v.hours) ?? 0);
                  state.reload();
                }}
                fields={[
                  {
                    key: 'hours',
                    label: 'Erfasste Stunden',
                    kind: 'number',
                    required: true,
                    hint: 'Wird auf 0,5-Schritte gerundet',
                  },
                ]}
                initial={{ hours: String(p.loggedHours ?? 0) }}
              />
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
