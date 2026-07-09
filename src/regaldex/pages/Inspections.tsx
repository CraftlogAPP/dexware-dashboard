import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import {
  FormDialog,
  isoFromLocal,
  localFromIso,
  orNull,
  s,
  type FormValues,
} from '../../components/form';
import { fmtDateTime, parseLocalDate, toInputDate } from '../../lib/format';
import { addInspection, cancelInspection, fetchInspections, fetchWarehouses } from '../api';
import { InspectionBadge } from '../badges';
import { checklistSummary, warehouseNameMap } from '../labels';
import {
  CHECKLIST,
  INSPECTION_LABELS,
  type CheckResult,
  type Inspection,
  type InspectionType,
} from '../types';

const CHECK_OPTIONS: { value: CheckResult; label: string }[] = [
  { value: 'ok', label: 'In Ordnung' },
  { value: 'defect', label: 'Schaden' },
  { value: 'na', label: 'Nicht zutreffend' },
];

export function Inspections() {
  const { client, session } = useAppAuth();
  const { data: org } = useOrg();
  const [adding, setAdding] = useState(false);
  const [canceling, setCanceling] = useState<Inspection | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));

  // Lagerliste ändert sich durch Filter nicht — einmal laden, nicht pro Filterwechsel.
  const whsState = useAsync(() => fetchWarehouses(client), [client]);

  const inspState = useAsync<Inspection[]>(
    () =>
      fetchInspections(client, {
        warehouseId: warehouseId || undefined,
        type: (type || undefined) as InspectionType | undefined,
        from: from ? parseLocalDate(from) : undefined,
        to: to ? parseLocalDate(to) : undefined,
      }),
    [client, warehouseId, type, from, to],
  );

  async function onAdd(v: FormValues) {
    if (!org || !session) throw new Error('Kein Betrieb geladen');
    const started = isoFromLocal(v.started_at);
    if (!started) throw new Error('Bitte einen gültigen Zeitpunkt angeben');
    const checklist: Record<string, CheckResult> = {};
    for (const item of CHECKLIST) checklist[item.id] = s(v[`chk_${item.id}`]) as CheckResult;
    await addInspection(client, org.org.id, session.user.id, {
      warehouse_id: s(v.warehouse_id),
      type: s(v.type) as InspectionType,
      started_at: started,
      checklist,
      notes: orNull(v.notes),
      inspector_name: orNull(v.inspector_name),
    });
    inspState.reload();
  }

  async function onCancel(v: FormValues) {
    if (!canceling) throw new Error('Keine Inspektion gewählt');
    await cancelInspection(client, canceling.id, s(v.reason));
    inspState.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Inspektionen</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>
          ＋ Inspektion erfassen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Append-only-Prüfprotokoll — jeder Eintrag bleibt unveränderlich, Stornos sind
        gekennzeichnet.
      </p>

      {adding && (
        <FormDialog
          title="Inspektion erfassen"
          submitLabel="Inspektion speichern"
          onClose={() => setAdding(false)}
          onSave={onAdd}
          fields={[
            {
              key: 'warehouse_id',
              label: 'Lager',
              kind: 'select',
              required: true,
              options: (whsState.data ?? []).map((w) => ({ value: w.id, label: w.name })),
            },
            {
              key: 'type',
              label: 'Inspektionsart',
              kind: 'select',
              required: true,
              options: (Object.keys(INSPECTION_LABELS) as InspectionType[]).map((t) => ({
                value: t,
                label: INSPECTION_LABELS[t],
              })),
            },
            { key: 'started_at', label: 'Zeitpunkt', kind: 'datetime', required: true },
            { key: 'inspector_name', label: 'Kontrolliert von' },
            ...CHECKLIST.map((item) => ({
              key: `chk_${item.id}`,
              label: item.label,
              kind: 'select' as const,
              required: true,
              options: CHECK_OPTIONS,
            })),
            { key: 'notes', label: 'Notizen', kind: 'textarea' },
          ]}
          initial={{
            started_at: localFromIso(new Date().toISOString()),
            type: 'visual',
            ...Object.fromEntries(CHECKLIST.map((item) => [`chk_${item.id}`, 'ok'])),
          }}
        />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Lager
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Alle Lager</option>
              {(whsState.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            Inspektionsart
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Alle Inspektionsarten</option>
              {(Object.keys(INSPECTION_LABELS) as InspectionType[]).map((t) => (
                <option key={t} value={t}>
                  {INSPECTION_LABELS[t]}
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

      <LoadGuard state={inspState}>
        {(inspections) => {
          const names = warehouseNameMap(whsState.data ?? []);
          return inspections.length === 0 ? (
            <div className="card empty">Keine Inspektionen im gewählten Zeitraum.</div>
          ) : (
            <>
              <p className="muted small">{inspections.length} Inspektionen</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
                      <th>Lager</th>
                      <th>Inspektionsart</th>
                      <th>Ergebnis</th>
                      <th>Kontrolliert von</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link to={i.id}>{fmtDateTime(i.started_at)}</Link>
                        </td>
                        <td className="wrap">{names.get(i.warehouse_id) ?? '—'}</td>
                        <td>
                          <InspectionBadge type={i.type} canceled={i.canceled} />
                        </td>
                        <td className="muted wrap">{checklistSummary(i.checklist)}</td>
                        <td className="muted">{i.inspector_name ?? '—'}</td>
                        <td>
                          {!i.canceled && (
                            <button
                              className="btn ghost small"
                              onClick={() => setCanceling(i)}
                            >
                              Stornieren
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

      {canceling && (
        <FormDialog
          title={`Inspektion stornieren — ${fmtDateTime(canceling.started_at)}`}
          submitLabel="Stornieren"
          onClose={() => setCanceling(null)}
          onSave={onCancel}
          fields={[
            {
              key: 'reason',
              label: 'Storno-Grund',
              kind: 'textarea',
              required: true,
              hint: 'Die Inspektion bleibt im Prüfprotokoll sichtbar und wird nur gekennzeichnet',
            },
          ]}
        />
      )}
    </>
  );
}
