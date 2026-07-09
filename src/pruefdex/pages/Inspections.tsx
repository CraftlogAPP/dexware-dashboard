import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDate, toInputDate } from '../../lib/format';
import { addInspection, fetchDevices, fetchInspections } from '../api';
import { ResultBadge } from '../badges';
import { nameMap } from '../labels';
import {
  MEASUREMENTS,
  VISUAL_CHECKS,
  type Inspection,
  type InspectionResult,
} from '../types';

/** Fällige Folgeprüfung: Prüfdatum + Intervall des Geräts (Monate). */
function plusMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return toInputDate(d);
}

export function Inspections() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [adding, setAdding] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [result, setResult] = useState<'' | InspectionResult>('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));

  // Geräteliste ändert sich durch Filter nicht — einmal laden.
  const devState = useAsync(() => fetchDevices(client), [client]);

  const inspState = useAsync<Inspection[]>(
    () =>
      fetchInspections(client, {
        deviceId: deviceId || undefined,
        result: result || undefined,
        // inspected_at ist ein date — die Input-Werte (yyyy-mm-dd) passen direkt.
        from: from || undefined,
        to: to || undefined,
      }),
    [client, deviceId, result, from, to],
  );

  async function onAdd(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    const deviceIdSel = s(v.device_id);
    const inspectedAt = s(v.inspected_at);
    const device = (devState.data ?? []).find((d) => d.id === deviceIdSel);
    const measurements: Record<string, string> = {};
    for (const m of MEASUREMENTS) {
      const val = s(v[`m_${m.key}`]);
      if (val) measurements[m.key] = val;
    }
    const checks: Record<string, boolean> = {};
    for (const c of VISUAL_CHECKS) checks[c.key] = v[`vc_${c.key}`] === true;
    const warning = await addInspection(client, org.org.id, {
      device_id: deviceIdSel,
      inspected_at: inspectedAt,
      inspector_name: orNull(v.inspector_name),
      visual_checks: checks,
      measurements,
      result: s(v.result) as InspectionResult,
      next_due_date:
        orNull(v.next_due_date) ??
        (device ? plusMonths(inspectedAt, device.interval_months) : null),
      notes: orNull(v.notes),
    });
    inspState.reload();
    devState.reload();
    if (warning) alert(warning);
  }

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
        Alle DGUV-V3-Prüfungen mit Sichtprüfung, Messwerten und Ergebnis.
      </p>

      {adding && (
        <FormDialog
          title="DGUV-V3-Prüfung erfassen"
          submitLabel="Prüfung speichern"
          onClose={() => setAdding(false)}
          onSave={onAdd}
          fields={[
            {
              key: 'device_id',
              label: 'Gerät',
              kind: 'select',
              required: true,
              options: (devState.data ?? []).map((d) => ({ value: d.id, label: d.name })),
            },
            { key: 'inspected_at', label: 'Prüfdatum', kind: 'date', required: true },
            { key: 'inspector_name', label: 'Geprüft von' },
            {
              key: 'result',
              label: 'Ergebnis',
              kind: 'select',
              required: true,
              options: [
                { value: 'passed', label: 'Bestanden' },
                { value: 'failed', label: 'Nicht bestanden' },
              ],
            },
            ...VISUAL_CHECKS.map((c) => ({
              key: `vc_${c.key}`,
              label: c.label,
              kind: 'checkbox' as const,
            })),
            ...MEASUREMENTS.map((m) => ({
              key: `m_${m.key}`,
              label: `${m.label} (${m.unit})`,
              hint: m.hint,
            })),
            {
              key: 'next_due_date',
              label: 'Nächste Prüfung',
              kind: 'date',
              hint: 'Leer lassen = automatisch aus dem Prüfintervall des Geräts',
            },
            { key: 'notes', label: 'Notizen', kind: 'textarea' },
          ]}
          initial={{
            inspected_at: toInputDate(new Date()),
            result: 'passed',
            ...Object.fromEntries(VISUAL_CHECKS.map((c) => [`vc_${c.key}`, true])),
          }}
        />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Gerät
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              <option value="">Alle Geräte</option>
              {(devState.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            Ergebnis
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as '' | InspectionResult)}
            >
              <option value="">Alle</option>
              <option value="passed">Bestanden</option>
              <option value="failed">Nicht bestanden</option>
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
          const devNames = nameMap(devState.data ?? []);
          return inspections.length === 0 ? (
            <div className="card empty">Keine Prüfungen im gewählten Zeitraum.</div>
          ) : (
            <>
              <p className="muted small">{inspections.length} Prüfungen</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Gerät</th>
                      <th>Ergebnis</th>
                      <th>Nächste Fälligkeit</th>
                      <th>Geprüft von</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link to={i.id}>{fmtDate(i.inspected_at)}</Link>
                        </td>
                        <td className="wrap">{devNames.get(i.device_id) ?? '—'}</td>
                        <td>
                          <ResultBadge result={i.result} />
                        </td>
                        <td className="muted">
                          {i.next_due_date ? fmtDate(i.next_due_date) : '—'}
                        </td>
                        <td className="muted">{i.inspector_name ?? '—'}</td>
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
