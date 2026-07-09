import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime } from '../../lib/format';
import {
  addDefect,
  fetchDefects,
  fetchEquipment,
  fetchPlaygrounds,
  resolveDefect,
} from '../api';
import { DefectStatusBadge, SeverityBadge } from '../badges';
import { equipmentNameMap, playgroundNameMap } from '../labels';
import {
  SEVERITY_LABELS,
  type Defect,
  type DefectSeverity,
  type DefectStatus,
} from '../types';

export function Defects() {
  const { client, session } = useAppAuth();
  const { data: org } = useOrg();
  const [playgroundId, setPlaygroundId] = useState('');
  const [status, setStatus] = useState<'' | DefectStatus>('open');
  const [adding, setAdding] = useState(false);
  const [resolving, setResolving] = useState<Defect | null>(null);

  // Stammdaten für Namens-Auflösung — einmal laden, nicht pro Filterwechsel.
  const baseState = useAsync(async () => {
    const [playgrounds, equipment] = await Promise.all([
      fetchPlaygrounds(client),
      fetchEquipment(client),
    ]);
    return { playgrounds, equipment };
  }, [client]);

  const defectsState = useAsync<Defect[]>(
    () =>
      fetchDefects(client, {
        playgroundId: playgroundId || undefined,
        status: status || undefined,
      }),
    [client, playgroundId, status],
  );

  async function onAdd(v: FormValues) {
    if (!org || !session) throw new Error('Kein Betrieb geladen');
    await addDefect(client, org.org.id, session.user.id, {
      playground_id: s(v.playground_id),
      equipment_id: orNull(v.equipment_id),
      title: s(v.title),
      description: orNull(v.description),
      severity: s(v.severity) as DefectSeverity,
      equipment_blocked: v.equipment_blocked === true,
      reporter_name: orNull(v.reporter_name),
    });
    defectsState.reload();
  }

  async function onResolve(v: FormValues) {
    if (!resolving) throw new Error('Kein Mangel gewählt');
    await resolveDefect(client, resolving.id, s(v.note), s(v.resolver_name));
    defectsState.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Mängel</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>
          ＋ Mangel melden
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Gemeldete Mängel mit Schweregrad und Behebungs-Vermerk — Behebung läuft
        additiv, nichts wird gelöscht.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Spielplatz
            <select
              value={playgroundId}
              onChange={(e) => setPlaygroundId(e.target.value)}
            >
              <option value="">Alle Spielplätze</option>
              {(baseState.data?.playgrounds ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | DefectStatus)}
            >
              <option value="open">Nur offene</option>
              <option value="resolved">Nur behobene</option>
              <option value="">Alle</option>
            </select>
          </label>
        </div>
      </div>

      <LoadGuard state={defectsState}>
        {(defects) => {
          const pgNames = playgroundNameMap(baseState.data?.playgrounds ?? []);
          const eqNames = equipmentNameMap(baseState.data?.equipment ?? []);
          return defects.length === 0 ? (
            <div className="card empty">Keine Mängel mit den gewählten Filtern. 👍</div>
          ) : (
            <>
              <p className="muted small">{defects.length} Mängel</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gemeldet</th>
                      <th>Spielplatz</th>
                      <th>Mangel</th>
                      <th>Ort / Gerät</th>
                      <th>Schweregrad</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {defects.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {fmtDateTime(d.created_at)}
                          {d.reporter_name && (
                            <div className="muted small">von {d.reporter_name}</div>
                          )}
                        </td>
                        <td className="wrap">
                          <Link to={`../spielplaetze/${d.playground_id}`}>
                            {pgNames.get(d.playground_id) ?? '—'}
                          </Link>
                        </td>
                        <td className="wrap">
                          {d.title}
                          {d.description && (
                            <div className="muted small">{d.description}</div>
                          )}
                          {d.equipment_blocked && (
                            <div>
                              <span className="badge red">Gerät gesperrt</span>
                            </div>
                          )}
                        </td>
                        <td className="muted">
                          {d.equipment_id
                            ? (eqNames.get(d.equipment_id) ?? 'Gerät')
                            : 'Fläche allgemein'}
                        </td>
                        <td>
                          <SeverityBadge severity={d.severity} />
                        </td>
                        <td>
                          <DefectStatusBadge status={d.status} />
                          {d.status === 'resolved' && (
                            <div className="muted small">
                              {fmtDateTime(d.resolved_at)}
                              {d.resolver_name ? ` · ${d.resolver_name}` : ''}
                              {d.resolution_note ? ` — ${d.resolution_note}` : ''}
                            </div>
                          )}
                        </td>
                        <td>
                          {d.status === 'open' && (
                            <button
                              className="btn ghost small"
                              onClick={() => setResolving(d)}
                            >
                              Beheben
                            </button>
                          )}
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

      {adding && (
        <FormDialog
          title="Mangel melden"
          submitLabel="Mangel speichern"
          onClose={() => setAdding(false)}
          onSave={onAdd}
          fields={[
            {
              key: 'playground_id',
              label: 'Spielplatz',
              kind: 'select',
              required: true,
              options: (baseState.data?.playgrounds ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              })),
            },
            {
              key: 'equipment_id',
              label: 'Gerät (optional)',
              kind: 'select',
              hint: 'Leer lassen für „Fläche allgemein" — Gerät muss zum gewählten Spielplatz gehören',
              options: (baseState.data?.equipment ?? [])
                .filter((e) => !e.retired)
                .map((e) => {
                  const pg = baseState.data?.playgrounds.find(
                    (p) => p.id === e.playground_id,
                  );
                  return { value: e.id, label: `${pg?.name ?? '?'} — ${e.name}` };
                }),
            },
            { key: 'title', label: 'Mangel', required: true, placeholder: 'z. B. Schaukelkette verschlissen' },
            { key: 'description', label: 'Beschreibung', kind: 'textarea' },
            {
              key: 'severity',
              label: 'Schweregrad',
              kind: 'select',
              required: true,
              options: (Object.keys(SEVERITY_LABELS) as DefectSeverity[]).map((sv) => ({
                value: sv,
                label: SEVERITY_LABELS[sv],
              })),
            },
            { key: 'equipment_blocked', label: 'Gerät gesperrt', kind: 'checkbox' },
            { key: 'reporter_name', label: 'Gemeldet von' },
          ]}
          initial={{ severity: 'medium' }}
        />
      )}

      {resolving && (
        <FormDialog
          title={`Mangel beheben — ${resolving.title}`}
          submitLabel="Als behoben markieren"
          onClose={() => setResolving(null)}
          onSave={onResolve}
          fields={[
            { key: 'note', label: 'Behebungs-Vermerk', kind: 'textarea', required: true },
            { key: 'resolver_name', label: 'Behoben von', required: true },
          ]}
        />
      )}
    </>
  );
}
