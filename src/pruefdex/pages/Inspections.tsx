import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, toInputDate } from '../../lib/format';
import { cancelInspection, fetchDevices, fetchInspections } from '../api';
import { InspectionDialog } from '../dialogs';
import { ResultBadge } from '../badges';
import { nameMap } from '../labels';
import { type Inspection, type InspectionResult } from '../types';

export function Inspections() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editing, setEditing] = useState<Inspection | 'new' | null>(null);
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

  async function onDelete(i: Inspection) {
    const reason = window.prompt('Prüfungen werden nicht gelöscht: Sie bleibt in der Historie, gekennzeichnet als storniert. Die Prüffrist richtet sich danach nach der jüngsten gültigen Prüfung.\n\nGrund der Stornierung:');
    if (!reason?.trim()) return;
    try {
      const warning = await cancelInspection(client, i.id, i.device_id, reason);
      inspState.reload();
      devState.reload();
      if (warning) alert(warning);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Prüfungen</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Prüfung erfassen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle DGUV-V3-Prüfungen mit Sichtprüfung, Messwerten und Ergebnis.
      </p>

      {editing && org && (
        <InspectionDialog
          client={client}
          orgId={org.org.id}
          devices={devState.data ?? []}
          inspection={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(warning) => {
            inspState.reload();
            devState.reload();
            if (warning) alert(warning);
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
                      <th></th>
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
                          {i.canceled ? <span className="badge red">storniert</span> : <ResultBadge result={i.result} />}
                        </td>
                        <td className="muted">
                          {i.next_due_date ? fmtDate(i.next_due_date) : '—'}
                        </td>
                        <td className="muted">{i.inspector_name ?? '—'}</td>
                        <td>
                          {i.canceled ? null : (
                            <button className="btn ghost small" onClick={() => onDelete(i)}>
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
    </>
  );
}
