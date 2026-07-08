import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchUvvInspections, fetchVehicles } from '../api';
import { DueBadge, dueLabel, ResultBadge } from '../badges';
import { uvvDue } from '../due';
import type { UvvInspection, Vehicle } from '../types';
import { CHECK_ITEMS, VEHICLE_TYPE_LABEL } from '../types';

/** Checklisten-Kurzfassung: "10/10 i. O." bzw. Liste der beanstandeten Punkte. */
function checklistSummary(checklist: Record<string, boolean>): string {
  const entries = Object.entries(checklist);
  if (entries.length === 0) return '—';
  const failed = entries.filter(([, ok]) => !ok).map(([id]) => id);
  const okCount = entries.length - failed.length;
  if (failed.length === 0) return `${okCount}/${entries.length} i. O.`;
  const labels = failed.map(
    (id) => CHECK_ITEMS.find((c) => c.id === id)?.label ?? id,
  );
  return `${okCount}/${entries.length} i. O. — beanstandet: ${labels.join(', ')}`;
}

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();

  const state = useAsync<{ vehicle: Vehicle | null; inspections: UvvInspection[] }>(
    async () => {
      const [vehicles, inspections] = await Promise.all([
        fetchVehicles(client),
        fetchUvvInspections(client, { vehicleId: id }),
      ]);
      return { vehicle: vehicles.find((v) => v.id === id) ?? null, inspections };
    },
    [client, id],
  );

  return (
    <LoadGuard state={state}>
      {({ vehicle: v, inspections }) => {
        if (!v) {
          return <div className="error-box">Fahrzeug nicht gefunden.</div>;
        }
        const due = uvvDue(v);

        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../fahrzeuge">← Alle Fahrzeuge</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>{v.plate}</h1>
              <DueBadge status={due.status} />
            </div>
            <p className="muted">
              {v.name ? `${v.name} · ` : ''}
              {VEHICLE_TYPE_LABEL[v.type]}
            </p>

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Erstzulassung</div>
                <div>{fmtDate(v.first_registration)}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Letzte UVV</div>
                <div>{fmtDate(v.last_uvv)}</div>
              </div>
              <div className="card">
                <div className="kpi-label">UVV fällig</div>
                <div>{dueLabel(due)}</div>
                <div className="muted small">Intervall: 12 Monate (DGUV Vorschrift 70)</div>
              </div>
              <div className="card">
                <div className="kpi-label">Prüfungen</div>
                <div>{inspections.length}</div>
                <div className="muted small">dokumentierte UVV-Prüfungen</div>
              </div>
            </div>

            <div className="section-head">
              <h2>UVV-Historie</h2>
            </div>
            {inspections.length === 0 ? (
              <div className="card empty">
                Für dieses Fahrzeug sind noch keine UVV-Prüfungen dokumentiert.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Prüfer</th>
                      <th>Ergebnis</th>
                      <th>Checkliste</th>
                      <th>Mängel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.id}>
                        <td className="muted">{fmtDate(i.date)}</td>
                        <td className="wrap">{i.inspector}</td>
                        <td>
                          <ResultBadge result={i.result} />
                        </td>
                        <td className="wrap muted">{checklistSummary(i.checklist)}</td>
                        <td className="wrap muted">{i.defects ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
