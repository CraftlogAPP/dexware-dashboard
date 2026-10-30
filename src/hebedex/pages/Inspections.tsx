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
  fetchItems,
  fetchInspections,
  fetchSites,
} from '../api';
import { InspectionBadge } from '../badges';
import { checklistSummary, itemNameMap, siteNameMap } from '../labels';
import {
  checklistFor,
  ITEM_KINDS,
  INSPECTION_LABELS,
  kindInfo,
  type CheckResult,
  type Inspection,
  type InspectionType,
} from '../types';

// Alle Prüfpunkte aller Typen (für „Mangel bei …“) — Reihenfolge wie in der App, ohne Doppelte.
const ALL_CHECKS = ITEM_KINDS.flatMap((k) => checklistFor(k.id)).filter(
  (c, n, all) => all.findIndex((x) => x.id === c.id) === n,
);

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

  // Stammdaten (Standorte + Teil) ändern sich durch Filter nicht — einmal laden.
  const baseState = useAsync(async () => {
    const [sites, items] = await Promise.all([
      fetchSites(client),
      fetchItems(client),
    ]);
    return { sites, items };
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
    const itemId = s(v.item_id);
    const item = baseState.data?.items.find(
      (e) => e.id === itemId,
    );
    if (!item) throw new Error('Bitte ein Teil wählen');
    const started = isoFromLocal(v.started_at);
    if (!started) throw new Error('Bitte einen gültigen Zeitpunkt angeben');
    const type = s(v.type) as InspectionType;
    if (type === 'crack' && !kindInfo(item.kind).crackTest)
      throw new Error('Rissprüfung gibt es nur für Rundstahlketten');
    // Hauptweg wie in der App: alle Punkte der Typ-Checkliste OK, optional ein Punkt als Mangel.
    const checklist: Record<string, CheckResult> = {};
    if (type === 'expert' || type === 'visual') {
      for (const c of checklistFor(item.kind)) checklist[c.id] = 'ok';
      const bad = s(v.defect_at);
      if (bad) checklist[bad] = 'defect';
    }
    await addInspection(client, org.org.id, session.user.id, {
      site_id: item.site_id,
      item_id: item.id,
      type,
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
  const items = baseState.data?.items ?? [];

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
        Append-only-Prüfprotokoll je Teil — jeder Eintrag bleibt unveränderlich,
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
              key: 'item_id',
              label: 'Teil',
              kind: 'select',
              required: true,
              hint: 'Die Prüfung wird dem einzelnen Teil zugeordnet — der Standort ergibt sich daraus.',
              options: items
                .filter((e) => !e.retired)
                .map((e) => {
                  const site = sites.find((st) => st.id === e.site_id);
                  return { value: e.id, label: `${site?.name ?? '?'} — ${e.name}` };
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
            {
              key: 'defect_at',
              label: 'Mangel bei (leer = alles in Ordnung)',
              kind: 'select',
              hint: 'Die übrigen Punkte der Checkliste des Teil-Typs werden als „in Ordnung“ gespeichert. Den Mangel selbst unter „Mängel“ mit Ampel-Einstufung erfassen. Messwerte für den Ablegereife-Rechner nur in der App.',
              options: ALL_CHECKS.map((c) => ({ value: c.id, label: c.label })),
            },
            { key: 'notes', label: 'Notizen', kind: 'textarea' },
          ]}
          initial={{
            started_at: localFromIso(new Date().toISOString()),
            type: 'expert',
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
          const itemNames = itemNameMap(items);
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
                      <th>Teil</th>
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
                          {itemNames.get(i.item_id) ?? '—'}
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
