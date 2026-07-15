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
  fetchItems,
  fetchSites,
  resolveDefect,
} from '../api';
import { DefectStatusBadge, SeverityBadge } from '../badges';
import { itemNameMap, siteNameMap } from '../labels';
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
    const [sites, items] = await Promise.all([
      fetchSites(client),
      fetchItems(client),
    ]);
    return { sites, items };
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
    const itemId = s(v.item_id);
    const item = baseState.data?.items.find(
      (e) => e.id === itemId,
    );
    if (!item) throw new Error('Bitte einen PSA-Artikel wählen');
    await addDefect(client, org.org.id, session.user.id, {
      site_id: item.site_id,
      item_id: item.id,
      title: s(v.title),
      description: orNull(v.description),
      severity: s(v.severity) as DefectSeverity,
      item_blocked: v.item_blocked === true,
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
  const items = baseState.data?.items ?? [];

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
        Gemeldete Mängel im Ampelverfahren (BetrSichV/DGUV R 112-198 sinngemäß) mit
        Erledigungs-Vermerk — Behebung läuft additiv, nichts wird gelöscht. Rot = ablegereif:
        Artikel der Benutzung entziehen und aussondern; Instandsetzung nur durch den Hersteller.
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
          const itemNames = itemNameMap(items);
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
                      <th>Artikel</th>
                      <th>Einstufung</th>
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
                          {d.item_blocked && (
                            <div>
                              <span className="badge red">Der Benutzung entzogen</span>
                            </div>
                          )}
                        </td>
                        <td className="muted">
                          {itemNames.get(d.item_id) ?? 'PSA-Artikel'}
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
                              Erledigen
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
              key: 'item_id',
              label: 'PSA-Artikel',
              kind: 'select',
              required: true,
              hint: 'Der Mangel wird dem einzelnen Artikel zugeordnet — der Standort ergibt sich daraus.',
              options: items
                .filter((e) => !e.retired)
                .map((e) => {
                  const site = sites.find((st) => st.id === e.site_id);
                  return { value: e.id, label: `${site?.name ?? '?'} — ${e.name}` };
                }),
            },
            { key: 'title', label: 'Mangel', required: true, placeholder: 'z. B. Falldämpfer ausgelöst / Nähte beschädigt' },
            { key: 'description', label: 'Beschreibung', kind: 'textarea' },
            {
              key: 'severity',
              label: 'Einstufung (Ampel)',
              kind: 'select',
              required: true,
              options: (Object.keys(SEVERITY_LABELS) as DefectSeverity[]).map((sv) => ({
                value: sv,
                label: SEVERITY_LABELS[sv],
              })),
            },
            {
              key: 'item_blocked',
              label: 'Artikel der Benutzung entzogen (gekennzeichnet/aussortiert)',
              kind: 'checkbox',
            },
            { key: 'reporter_name', label: 'Gemeldet von' },
          ]}
          initial={{ severity: 'amber' }}
        />
      )}

      {resolving && (
        <FormDialog
          title={`Mangel erledigen — ${resolving.title}`}
          submitLabel="Als erledigt markieren"
          onClose={() => setResolving(null)}
          onSave={onResolve}
          fields={[
            { key: 'note', label: 'Erledigungs-Vermerk', kind: 'textarea', required: true },
            { key: 'resolver_name', label: 'Erledigt von', required: true },
          ]}
        />
      )}
    </>
  );
}
