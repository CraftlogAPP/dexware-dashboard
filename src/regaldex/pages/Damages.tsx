import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime } from '../../lib/format';
import {
  addDamage,
  fetchDamages,
  fetchRacks,
  fetchWarehouses,
  resolveDamage,
} from '../api';
import { DamageStatusBadge, SeverityBadge } from '../badges';
import { rackNameMap, warehouseNameMap } from '../labels';
import {
  SEVERITY_LABELS,
  type Damage,
  type DamageSeverity,
  type DamageStatus,
} from '../types';

export function Damages() {
  const { client, session } = useAppAuth();
  const { data: org } = useOrg();
  const [warehouseId, setWarehouseId] = useState('');
  const [status, setStatus] = useState<'' | DamageStatus>('open');
  const [adding, setAdding] = useState(false);
  const [resolving, setResolving] = useState<Damage | null>(null);

  // Stammdaten für Namens-Auflösung — einmal laden, nicht pro Filterwechsel.
  const baseState = useAsync(async () => {
    const [warehouses, racks] = await Promise.all([
      fetchWarehouses(client),
      fetchRacks(client),
    ]);
    return { warehouses, racks };
  }, [client]);

  const damagesState = useAsync<Damage[]>(
    () =>
      fetchDamages(client, {
        warehouseId: warehouseId || undefined,
        status: status || undefined,
      }),
    [client, warehouseId, status],
  );

  async function onAdd(v: FormValues) {
    if (!org || !session) throw new Error('Kein Betrieb geladen');
    await addDamage(client, org.org.id, session.user.id, {
      warehouse_id: s(v.warehouse_id),
      rack_id: orNull(v.rack_id),
      title: s(v.title),
      description: orNull(v.description),
      severity: s(v.severity) as DamageSeverity,
      rack_blocked: v.rack_blocked === true,
      reporter_name: orNull(v.reporter_name),
    });
    damagesState.reload();
  }

  async function onResolve(v: FormValues) {
    if (!resolving) throw new Error('Kein Schaden gewählt');
    await resolveDamage(client, resolving.id, s(v.note), s(v.resolver_name));
    damagesState.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Schäden</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>
          ＋ Schaden melden
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Gemeldete Schäden im Ampelverfahren (DIN EN 15635) mit Instandsetzungs-Vermerk
        — Behebung läuft additiv, nichts wird gelöscht.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Lager
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Alle Lager</option>
              {(baseState.data?.warehouses ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
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
          const whNames = warehouseNameMap(baseState.data?.warehouses ?? []);
          const rackNames = rackNameMap(baseState.data?.racks ?? []);
          return damages.length === 0 ? (
            <div className="card empty">Keine Schäden mit den gewählten Filtern. 👍</div>
          ) : (
            <>
              <p className="muted small">{damages.length} Schäden</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gemeldet</th>
                      <th>Lager</th>
                      <th>Schaden</th>
                      <th>Ort / Regalzeile</th>
                      <th>Gefährdung</th>
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
                          <Link to={`../lager/${d.warehouse_id}`}>
                            {whNames.get(d.warehouse_id) ?? '—'}
                          </Link>
                        </td>
                        <td className="wrap">
                          {d.title}
                          {d.description && (
                            <div className="muted small">{d.description}</div>
                          )}
                          {d.rack_blocked && (
                            <div>
                              <span className="badge red">Feld/Zeile gesperrt</span>
                            </div>
                          )}
                        </td>
                        <td className="muted">
                          {d.rack_id
                            ? (rackNames.get(d.rack_id) ?? 'Regalzeile')
                            : 'Lager allgemein'}
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
          title="Schaden melden"
          submitLabel="Schaden speichern"
          onClose={() => setAdding(false)}
          onSave={onAdd}
          fields={[
            {
              key: 'warehouse_id',
              label: 'Lager',
              kind: 'select',
              required: true,
              options: (baseState.data?.warehouses ?? []).map((w) => ({
                value: w.id,
                label: w.name,
              })),
            },
            {
              key: 'rack_id',
              label: 'Regalzeile (optional)',
              kind: 'select',
              hint: 'Leer lassen für „Lager allgemein" — Regalzeile muss zum gewählten Lager gehören',
              options: (baseState.data?.racks ?? [])
                .filter((r) => !r.retired)
                .map((r) => {
                  const wh = baseState.data?.warehouses.find(
                    (w) => w.id === r.warehouse_id,
                  );
                  return { value: r.id, label: `${wh?.name ?? '?'} — ${r.name}` };
                }),
            },
            { key: 'title', label: 'Schaden', required: true, placeholder: 'z. B. Stütze verbogen' },
            { key: 'description', label: 'Beschreibung', kind: 'textarea' },
            {
              key: 'severity',
              label: 'Gefährdung (Ampel)',
              kind: 'select',
              required: true,
              options: (Object.keys(SEVERITY_LABELS) as DamageSeverity[]).map((sv) => ({
                value: sv,
                label: SEVERITY_LABELS[sv],
              })),
            },
            { key: 'rack_blocked', label: 'Feld/Zeile gesperrt', kind: 'checkbox' },
            { key: 'reporter_name', label: 'Gemeldet von' },
          ]}
          initial={{ severity: 'amber' }}
        />
      )}

      {resolving && (
        <FormDialog
          title={`Schaden instandsetzen — ${resolving.title}`}
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
