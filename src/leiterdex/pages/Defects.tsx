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
  fetchLadders,
  fetchSites,
  resolveDefect,
} from '../api';
import { DefectStatusBadge, SeverityBadge } from '../badges';
import { ladderNameMap, siteNameMap } from '../labels';
import {
  SEVERITY_LABELS,
  type Defect,
  type DefectSeverity,
  type DefectStatus,
} from '../types';

export function Defects() {
  const { client, session } = useAppAuth();
  const { data: org } = useOrg();
  const [siteId, setSiteId] = useState('');
  const [status, setStatus] = useState<'' | DefectStatus>('open');
  const [adding, setAdding] = useState(false);
  const [resolving, setResolving] = useState<Defect | null>(null);

  // Stammdaten für Namens-Auflösung — einmal laden, nicht pro Filterwechsel.
  const baseState = useAsync(async () => {
    const [sites, ladders] = await Promise.all([
      fetchSites(client),
      fetchLadders(client),
    ]);
    return { sites, ladders };
  }, [client]);

  const defectsState = useAsync<Defect[]>(
    () =>
      fetchDefects(client, {
        siteId: siteId || undefined,
        status: status || undefined,
      }),
    [client, siteId, status],
  );

  async function onAdd(v: FormValues) {
    if (!org || !session) throw new Error('Kein Betrieb geladen');
    const ladderId = s(v.ladder_id);
    const ladder = baseState.data?.ladders.find((l) => l.id === ladderId);
    if (!ladder) throw new Error('Bitte eine Leiter wählen');
    await addDefect(client, org.org.id, session.user.id, {
      site_id: ladder.site_id,
      ladder_id: ladder.id,
      title: s(v.title),
      description: orNull(v.description),
      severity: s(v.severity) as DefectSeverity,
      ladder_blocked: v.ladder_blocked === true,
      reporter_name: orNull(v.reporter_name),
    });
    defectsState.reload();
  }

  async function onResolve(v: FormValues) {
    if (!resolving) throw new Error('Kein Mangel gewählt');
    await resolveDefect(client, resolving.id, s(v.note), s(v.resolver_name));
    defectsState.reload();
  }

  const sites = baseState.data?.sites ?? [];
  const ladders = baseState.data?.ladders ?? [];

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
        Gemeldete Mängel im Ampelverfahren (DGUV 208-016) mit Instandsetzungs-Vermerk
        — Behebung läuft additiv, nichts wird gelöscht.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Standort
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Alle Standorte</option>
              {sites.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
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
          const siteNames = siteNameMap(sites);
          const ladderNames = ladderNameMap(ladders);
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
                      <th>Standort</th>
                      <th>Mangel</th>
                      <th>Leiter</th>
                      <th>Gefährdung</th>
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
                          <Link to={`../standorte/${d.site_id}`}>
                            {siteNames.get(d.site_id) ?? '—'}
                          </Link>
                        </td>
                        <td className="wrap">
                          {d.title}
                          {d.description && (
                            <div className="muted small">{d.description}</div>
                          )}
                          {d.ladder_blocked && (
                            <div>
                              <span className="badge red">Leiter gesperrt</span>
                            </div>
                          )}
                        </td>
                        <td className="muted">{ladderNames.get(d.ladder_id) ?? 'Leiter'}</td>
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
                              Instandsetzen
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
              key: 'ladder_id',
              label: 'Leiter / Tritt',
              kind: 'select',
              required: true,
              hint: 'Der Mangel wird der einzelnen Leiter zugeordnet — der Standort ergibt sich daraus.',
              options: ladders
                .filter((l) => !l.retired)
                .map((l) => {
                  const site = sites.find((st) => st.id === l.site_id);
                  return { value: l.id, label: `${site?.name ?? '?'} — ${l.name}` };
                }),
            },
            { key: 'title', label: 'Mangel', required: true, placeholder: 'z. B. Holm verbogen' },
            { key: 'description', label: 'Beschreibung', kind: 'textarea' },
            {
              key: 'severity',
              label: 'Gefährdung (Ampel)',
              kind: 'select',
              required: true,
              options: (Object.keys(SEVERITY_LABELS) as DefectSeverity[]).map((sv) => ({
                value: sv,
                label: SEVERITY_LABELS[sv],
              })),
            },
            {
              key: 'ladder_blocked',
              label: 'Leiter gesperrt (der Benutzung entzogen)',
              kind: 'checkbox',
            },
            { key: 'reporter_name', label: 'Gemeldet von' },
          ]}
          initial={{ severity: 'amber' }}
        />
      )}

      {resolving && (
        <FormDialog
          title={`Mangel instandsetzen — ${resolving.title}`}
          submitLabel="Als instandgesetzt markieren"
          onClose={() => setResolving(null)}
          onSave={onResolve}
          fields={[
            { key: 'note', label: 'Instandsetzungs-Vermerk', kind: 'textarea', required: true },
            { key: 'resolver_name', label: 'Instandgesetzt von', required: true },
          ]}
        />
      )}
    </>
  );
}
