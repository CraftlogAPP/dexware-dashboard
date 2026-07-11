import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime } from '../../lib/format';
import { addDamage, fetchDamages, fetchScaffolds, fetchSites, resolveDamage } from '../api';
import { DamageStatusBadge, SeverityBadge } from '../badges';
import { scaffoldNameMap, siteNameMap } from '../labels';
import {
  SEVERITY_LABELS,
  type Damage,
  type DamageSeverity,
  type DamageStatus,
} from '../types';

export function Defects() {
  const { client, session } = useAppAuth();
  const { data: org } = useOrg();
  const [siteId, setSiteId] = useState('');
  const [status, setStatus] = useState<'' | DamageStatus>('open');
  const [adding, setAdding] = useState(false);
  const [resolving, setResolving] = useState<Damage | null>(null);

  // Stammdaten für Namens-Auflösung — einmal laden, nicht pro Filterwechsel.
  const baseState = useAsync(async () => {
    const [sites, scaffolds] = await Promise.all([
      fetchSites(client),
      fetchScaffolds(client),
    ]);
    return { sites, scaffolds };
  }, [client]);

  const damagesState = useAsync<Damage[]>(
    () =>
      fetchDamages(client, {
        siteId: siteId || undefined,
        status: status || undefined,
      }),
    [client, siteId, status],
  );

  async function onAdd(v: FormValues) {
    if (!org || !session) throw new Error('Kein Betrieb geladen');
    const site = baseState.data?.sites.find((st) => st.id === s(v.site_id));
    if (!site) throw new Error('Bitte eine Baustelle wählen');
    const scaffoldId = s(v.scaffold_id);
    const scaffold = scaffoldId
      ? baseState.data?.scaffolds.find((sc) => sc.id === scaffoldId)
      : undefined;
    if (scaffold && scaffold.site_id !== site.id) {
      throw new Error('Das gewählte Gerüst gehört nicht zu dieser Baustelle');
    }
    await addDamage(client, org.org.id, session.user.id, {
      site_id: site.id,
      scaffold_id: scaffold?.id ?? null,
      title: s(v.title),
      description: orNull(v.description),
      severity: s(v.severity) as DamageSeverity,
      scaffold_blocked: v.scaffold_blocked === true,
      reporter_name: orNull(v.reporter_name),
    });
    damagesState.reload();
  }

  async function onResolve(v: FormValues) {
    if (!resolving) throw new Error('Kein Mangel gewählt');
    await resolveDamage(client, resolving.id, s(v.note), s(v.resolver_name));
    damagesState.reload();
  }

  const sites = baseState.data?.sites ?? [];
  const scaffolds = baseState.data?.scaffolds ?? [];

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
        Gemeldete Mängel im Ampelverfahren (DGUV Information 201-011) mit
        Behebungs-Vermerk — Rot heißt: Gerüst sofort sperren. Behebung läuft
        additiv, nichts wird gelöscht.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Baustelle
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Alle Baustellen</option>
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
              onChange={(e) => setStatus(e.target.value as '' | DamageStatus)}
            >
              <option value="open">Nur offene</option>
              <option value="resolved">Nur behobene</option>
              <option value="">Alle</option>
            </select>
          </label>
        </div>
      </div>

      <LoadGuard state={damagesState}>
        {(damages) => {
          const siteNames = siteNameMap(sites);
          const scaffoldNames = scaffoldNameMap(scaffolds);
          return damages.length === 0 ? (
            <div className="card empty">Keine Mängel mit den gewählten Filtern. 👍</div>
          ) : (
            <>
              <p className="muted small">{damages.length} Mängel</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gemeldet</th>
                      <th>Baustelle</th>
                      <th>Mangel</th>
                      <th>Gerüst</th>
                      <th>Einstufung</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {damages.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {fmtDateTime(d.created_at)}
                          {d.reporter_name && (
                            <div className="muted small">von {d.reporter_name}</div>
                          )}
                        </td>
                        <td className="wrap">
                          <Link to={`../baustellen/${d.site_id}`}>
                            {siteNames.get(d.site_id) ?? '—'}
                          </Link>
                        </td>
                        <td className="wrap">
                          {d.title}
                          {d.description && (
                            <div className="muted small">{d.description}</div>
                          )}
                          {d.scaffold_blocked && (
                            <div>
                              <span className="badge red">Gesperrt</span>
                            </div>
                          )}
                        </td>
                        <td className="muted">
                          {d.scaffold_id
                            ? (scaffoldNames.get(d.scaffold_id) ?? 'Gerüst')
                            : 'Baustelle allgemein'}
                        </td>
                        <td>
                          <SeverityBadge severity={d.severity} />
                        </td>
                        <td>
                          <DamageStatusBadge status={d.status} />
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
              key: 'site_id',
              label: 'Baustelle',
              kind: 'select',
              required: true,
              options: sites
                .filter((st) => st.active)
                .map((st) => ({ value: st.id, label: st.name })),
            },
            {
              key: 'scaffold_id',
              label: 'Betroffenes Gerüst (optional)',
              kind: 'select',
              hint: 'Leer lassen, wenn der Mangel die Baustelle allgemein betrifft.',
              options: [
                { value: '', label: '— Baustelle allgemein —' },
                ...scaffolds
                  .filter((sc) => !sc.retired)
                  .map((sc) => {
                    const site = sites.find((st) => st.id === sc.site_id);
                    return { value: sc.id, label: `${site?.name ?? '?'} — ${sc.name}` };
                  }),
              ],
            },
            { key: 'title', label: 'Mangel', required: true, placeholder: 'z. B. Anker Feld 3 entfernt' },
            { key: 'description', label: 'Beschreibung', kind: 'textarea' },
            {
              key: 'severity',
              label: 'Einstufung (Ampel)',
              kind: 'select',
              required: true,
              options: (Object.keys(SEVERITY_LABELS) as DamageSeverity[]).map((sv) => ({
                value: sv,
                label: SEVERITY_LABELS[sv],
              })),
            },
            {
              key: 'scaffold_blocked',
              label: 'Gerüst/Bereich gesperrt (abgesperrt, gekennzeichnet)',
              kind: 'checkbox',
            },
            { key: 'reporter_name', label: 'Gemeldet von' },
          ]}
          initial={{ severity: 'amber' }}
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
