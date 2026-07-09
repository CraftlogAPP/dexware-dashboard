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
import {
  addInspection,
  cancelInspection,
  fetchInspections,
  fetchLadders,
  fetchSites,
} from '../api';
import { InspectionBadge } from '../badges';
import { checklistSummary, ladderNameMap, siteNameMap } from '../labels';
import {
  CHECKLIST,
  INSPECTION_LABELS,
  type CheckResult,
  type Inspection,
  type InspectionType,
} from '../types';

const CHECK_OPTIONS: { value: CheckResult; label: string }[] = [
  { value: 'ok', label: 'In Ordnung' },
  { value: 'defect', label: 'Mangel' },
  { value: 'na', label: 'Nicht zutreffend' },
];

export function Inspections() {
  const { client, session } = useAppAuth();
  const { data: org } = useOrg();
  const [adding, setAdding] = useState(false);
  const [canceling, setCanceling] = useState<Inspection | null>(null);
  const [siteId, setSiteId] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));

  // Stammdaten (Standorte + Leitern) ändern sich durch Filter nicht — einmal laden.
  const baseState = useAsync(async () => {
    const [sites, ladders] = await Promise.all([
      fetchSites(client),
      fetchLadders(client),
    ]);
    return { sites, ladders };
  }, [client]);

  const inspState = useAsync<Inspection[]>(
    () =>
      fetchInspections(client, {
        siteId: siteId || undefined,
        type: (type || undefined) as InspectionType | undefined,
        from: from ? parseLocalDate(from) : undefined,
        to: to ? parseLocalDate(to) : undefined,
      }),
    [client, siteId, type, from, to],
  );

  async function onAdd(v: FormValues) {
    if (!org || !session) throw new Error('Kein Betrieb geladen');
    const ladderId = s(v.ladder_id);
    const ladder = baseState.data?.ladders.find((l) => l.id === ladderId);
    if (!ladder) throw new Error('Bitte eine Leiter wählen');
    const started = isoFromLocal(v.started_at);
    if (!started) throw new Error('Bitte einen gültigen Zeitpunkt angeben');
    const checklist: Record<string, CheckResult> = {};
    for (const item of CHECKLIST) checklist[item.id] = s(v[`chk_${item.id}`]) as CheckResult;
    await addInspection(client, org.org.id, session.user.id, {
      site_id: ladder.site_id,
      ladder_id: ladder.id,
      type: s(v.type) as InspectionType,
      started_at: started,
      checklist,
      notes: orNull(v.notes),
      inspector_name: orNull(v.inspector_name),
    });
    inspState.reload();
  }

  async function onCancel(v: FormValues) {
    if (!canceling) throw new Error('Keine Prüfung gewählt');
    await cancelInspection(client, canceling.id, s(v.reason));
    inspState.reload();
  }

  const sites = baseState.data?.sites ?? [];
  const ladders = baseState.data?.ladders ?? [];

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Prüfungen</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>
          ＋ Prüfung erfassen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Append-only-Prüfprotokoll je Leiter — jeder Eintrag bleibt unveränderlich,
        Stornos sind gekennzeichnet.
      </p>

      {adding && (
        <FormDialog
          title="Prüfung erfassen"
          submitLabel="Prüfung speichern"
          onClose={() => setAdding(false)}
          onSave={onAdd}
          fields={[
            {
              key: 'ladder_id',
              label: 'Leiter / Tritt',
              kind: 'select',
              required: true,
              hint: 'Die Prüfung wird der einzelnen Leiter zugeordnet — der Standort ergibt sich daraus.',
              options: ladders
                .filter((l) => !l.retired)
                .map((l) => {
                  const site = sites.find((st) => st.id === l.site_id);
                  return { value: l.id, label: `${site?.name ?? '?'} — ${l.name}` };
                }),
            },
            {
              key: 'type',
              label: 'Prüfart',
              kind: 'select',
              required: true,
              options: (Object.keys(INSPECTION_LABELS) as InspectionType[]).map((t) => ({
                value: t,
                label: INSPECTION_LABELS[t],
              })),
            },
            { key: 'started_at', label: 'Zeitpunkt', kind: 'datetime', required: true },
            { key: 'inspector_name', label: 'Geprüft von' },
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
          <label className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            Prüfart
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Alle Prüfarten</option>
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
          const siteNames = siteNameMap(sites);
          const ladderNames = ladderNameMap(ladders);
          return inspections.length === 0 ? (
            <div className="card empty">Keine Prüfungen im gewählten Zeitraum.</div>
          ) : (
            <>
              <p className="muted small">{inspections.length} Prüfungen</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
                      <th>Standort</th>
                      <th>Leiter</th>
                      <th>Prüfart</th>
                      <th>Ergebnis</th>
                      <th>Geprüft von</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link to={i.id}>{fmtDateTime(i.started_at)}</Link>
                        </td>
                        <td className="wrap">{siteNames.get(i.site_id) ?? '—'}</td>
                        <td className="wrap muted">
                          {ladderNames.get(i.ladder_id) ?? '—'}
                        </td>
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
          title={`Prüfung stornieren — ${fmtDateTime(canceling.started_at)}`}
          submitLabel="Stornieren"
          onClose={() => setCanceling(null)}
          onSave={onCancel}
          fields={[
            {
              key: 'reason',
              label: 'Storno-Grund',
              kind: 'textarea',
              required: true,
              hint: 'Die Prüfung bleibt im Prüfprotokoll sichtbar und wird nur gekennzeichnet',
            },
          ]}
        />
      )}
    </>
  );
}
