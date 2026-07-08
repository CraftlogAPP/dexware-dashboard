import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime, parseLocalDate, toInputDate } from '../../lib/format';
import { fetchInspections, fetchPlaygrounds } from '../api';
import { InspectionBadge } from '../badges';
import { checklistSummary, playgroundNameMap } from '../labels';
import {
  INSPECTION_LABELS,
  type Inspection,
  type InspectionType,
} from '../types';

export function Inspections() {
  const { client } = useAppAuth();
  const [playgroundId, setPlaygroundId] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toInputDate(d);
  });
  const [to, setTo] = useState(() => toInputDate(new Date()));

  // Spielplatzliste ändert sich durch Filter nicht — einmal laden, nicht pro Filterwechsel.
  const pgsState = useAsync(() => fetchPlaygrounds(client), [client]);

  const inspState = useAsync<Inspection[]>(
    () =>
      fetchInspections(client, {
        playgroundId: playgroundId || undefined,
        type: (type || undefined) as InspectionType | undefined,
        from: from ? parseLocalDate(from) : undefined,
        to: to ? parseLocalDate(to) : undefined,
      }),
    [client, playgroundId, type, from, to],
  );

  return (
    <>
      <h1>Kontrollen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Append-only-Kontrollbuch — jeder Eintrag bleibt unveränderlich, Stornos sind
        gekennzeichnet.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Spielplatz
            <select
              value={playgroundId}
              onChange={(e) => setPlaygroundId(e.target.value)}
            >
              <option value="">Alle Spielplätze</option>
              {(pgsState.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            Kontrollart
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Alle Kontrollarten</option>
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
          const names = playgroundNameMap(pgsState.data ?? []);
          return inspections.length === 0 ? (
            <div className="card empty">Keine Kontrollen im gewählten Zeitraum.</div>
          ) : (
            <>
              <p className="muted small">{inspections.length} Kontrollen</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
                      <th>Spielplatz</th>
                      <th>Kontrollart</th>
                      <th>Ergebnis</th>
                      <th>Kontrolliert von</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link to={i.id}>{fmtDateTime(i.started_at)}</Link>
                        </td>
                        <td className="wrap">{names.get(i.playground_id) ?? '—'}</td>
                        <td>
                          <InspectionBadge type={i.type} canceled={i.canceled} />
                        </td>
                        <td className="muted wrap">{checklistSummary(i.checklist)}</td>
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
