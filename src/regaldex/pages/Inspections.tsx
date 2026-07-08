import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime, parseLocalDate, toInputDate } from '../../lib/format';
import { fetchInspections, fetchWarehouses } from '../api';
import { InspectionBadge } from '../badges';
import { checklistSummary, warehouseNameMap } from '../labels';
import {
  INSPECTION_LABELS,
  type Inspection,
  type InspectionType,
} from '../types';

export function Inspections() {
  const { client } = useAppAuth();
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

  return (
    <>
      <h1>Inspektionen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Append-only-Prüfprotokoll — jeder Eintrag bleibt unveränderlich, Stornos sind
        gekennzeichnet.
      </p>

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
