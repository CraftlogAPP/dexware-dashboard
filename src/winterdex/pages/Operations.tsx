import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { addOperation, fetchOperations, fetchProperties } from '../api';
import { ActionBadge, LoadGuard, useAsync } from '../../components/ui';
import {
  FormDialog,
  isoFromLocal,
  localFromIso,
  orNull,
  s,
  type FormValues,
} from '../../components/form';
import { fmtDateTime, parseLocalDate, toInputDate } from '../../lib/format';
import { gritLabel, propertyNameMap, weatherLabel } from '../labels';
import { ACTION_LABELS, type Operation, type OperationAction } from '../types';

export function Operations() {
  const { client, session } = useAppAuth();
  const { data: org } = useOrg();
  const [adding, setAdding] = useState(false);
  const [propertyId, setPropertyId] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));

  // Objektliste ändert sich durch Filter nicht — einmal laden, nicht pro Filterwechsel.
  const propsState = useAsync(() => fetchProperties(client), [client]);

  const opsState = useAsync<Operation[]>(
    () =>
      fetchOperations(client, {
        propertyId: propertyId || undefined,
        from: from ? parseLocalDate(from) : undefined,
        to: to ? parseLocalDate(to) : undefined,
      }),
    [client, propertyId, from, to],
  );

  async function onAdd(v: FormValues) {
    if (!org || !session) throw new Error('Kein Betrieb geladen');
    const started = isoFromLocal(v.started_at);
    if (!started) throw new Error('Bitte einen gültigen Zeitpunkt angeben');
    await addOperation(client, org.org.id, session.user.id, {
      property_id: s(v.property_id),
      started_at: started,
      ended_at: isoFromLocal(v.ended_at),
      action: s(v.action) as OperationAction,
      grit_material: orNull(v.grit_material),
      grit_amount: orNull(v.grit_amount),
      notes: orNull(v.notes),
      performer_name: orNull(v.performer_name),
    });
    opsState.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Einsätze</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>
          ＋ Einsatz nachtragen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Append-only-Protokoll — jeder Eintrag bleibt unveränderlich, Stornos sind
        gekennzeichnet.
      </p>

      {adding && (
        <FormDialog
          title="Einsatz nachtragen"
          submitLabel="Einsatz speichern"
          onClose={() => setAdding(false)}
          onSave={onAdd}
          fields={[
            {
              key: 'property_id',
              label: 'Objekt',
              kind: 'select',
              required: true,
              options: (propsState.data ?? []).map((p) => ({ value: p.id, label: p.name })),
            },
            { key: 'started_at', label: 'Beginn', kind: 'datetime', required: true },
            { key: 'ended_at', label: 'Ende', kind: 'datetime' },
            {
              key: 'action',
              label: 'Maßnahme',
              kind: 'select',
              required: true,
              options: (Object.keys(ACTION_LABELS) as OperationAction[]).map((a) => ({
                value: a,
                label: ACTION_LABELS[a],
              })),
            },
            { key: 'grit_material', label: 'Streumittel', placeholder: 'z. B. Splitt, Salz' },
            { key: 'grit_amount', label: 'Streumenge', placeholder: 'z. B. 20 kg' },
            { key: 'performer_name', label: 'Durchgeführt von' },
            { key: 'notes', label: 'Notizen', kind: 'textarea' },
          ]}
          initial={{ started_at: localFromIso(new Date().toISOString()) }}
        />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Objekt
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Alle Objekte</option>
              {(propsState.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            Von
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            Bis
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </div>

      <LoadGuard state={opsState}>
        {(ops) => {
          const names = propertyNameMap(propsState.data ?? []);
          return ops.length === 0 ? (
            <div className="card empty">Keine Einsätze im gewählten Zeitraum.</div>
          ) : (
            <>
              <p className="muted small">{ops.length} Einsätze</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
                      <th>Objekt</th>
                      <th>Maßnahme</th>
                      <th>Streumittel</th>
                      <th>Wetter (archiviert)</th>
                      <th>Dokumentiert von</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((op) => (
                      <tr key={op.id}>
                        <td>
                          <Link to={op.id}>{fmtDateTime(op.started_at)}</Link>
                        </td>
                        <td className="wrap">{names.get(op.property_id) ?? '—'}</td>
                        <td>
                          <ActionBadge action={op.action} canceled={op.canceled} />
                        </td>
                        <td className="muted">
                          {gritLabel(op.grit_material, op.grit_amount)}
                        </td>
                        <td className="muted">{weatherLabel(op.weather)}</td>
                        <td className="muted">{op.performer_name ?? '—'}</td>
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
