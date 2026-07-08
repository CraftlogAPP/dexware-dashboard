import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { fmtDateTime, gpsLabel } from '../../lib/format';
import {
  fetchDefects,
  fetchEquipment,
  fetchInspections,
  fetchPlayground,
} from '../api';
import { DefectStatusBadge, InspectionBadge, SeverityBadge } from '../badges';
import { checklistSummary, equipmentNameMap } from '../labels';
import type { Defect, Equipment, Inspection, Playground } from '../types';

interface Data {
  playground: Playground | null;
  equipment: Equipment[];
  inspections: Inspection[];
  defects: Defect[];
}

export function PlaygroundDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();

  const state = useAsync<Data>(async () => {
    const [playground, equipment, inspections, defects] = await Promise.all([
      fetchPlayground(client, id!),
      fetchEquipment(client, id),
      fetchInspections(client, { playgroundId: id, limit: 300 }),
      fetchDefects(client, { playgroundId: id, limit: 300 }),
    ]);
    return { playground, equipment, inspections, defects };
  }, [client, id]);

  return (
    <LoadGuard state={state}>
      {({ playground, equipment, inspections, defects }) => {
        if (!playground) {
          return <div className="error-box">Spielplatz nicht gefunden.</div>;
        }
        const eqNames = equipmentNameMap(equipment);
        const openDefects = defects.filter((d) => d.status === 'open');
        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../spielplaetze">← Alle Spielplätze</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 style={{ marginBottom: 0 }}>{playground.name}</h1>
              <StatusBadge active={playground.active} />
            </div>
            <p className="muted">{playground.address}</p>

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Betreiber / Auftraggeber</div>
                <div>{playground.operator_name ?? '—'}</div>
                <div className="muted small">{playground.operator_contact ?? ''}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Standort</div>
                <div className="mono small">
                  {gpsLabel(playground.lat, playground.lng, null)}
                </div>
              </div>
              <div className="card">
                <div className="kpi-label">Offene Mängel</div>
                <div>{openDefects.length === 0 ? 'keine' : openDefects.length}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Notizen</div>
                <div className="small">{playground.notes ?? '—'}</div>
              </div>
            </div>

            <div className="section-head">
              <h2>Geräte-Inventar ({equipment.length})</h2>
            </div>
            {equipment.length === 0 ? (
              <div className="card empty">Noch keine Spielgeräte erfasst.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gerät</th>
                      <th>Kategorie</th>
                      <th>Hersteller</th>
                      <th>Baujahr</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipment.map((e) => (
                      <tr key={e.id}>
                        <td>{e.name}</td>
                        <td className="muted">{e.category}</td>
                        <td className="muted">{e.manufacturer ?? '—'}</td>
                        <td className="muted">{e.install_year ?? '—'}</td>
                        <td>
                          {e.retired ? (
                            <span className="badge">abgebaut</span>
                          ) : (
                            <span className="badge green">in Betrieb</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {defects.length > 0 && (
              <>
                <div className="section-head">
                  <h2>Mängel ({defects.length})</h2>
                  <Link to="../maengel" className="small">
                    Alle Mängel →
                  </Link>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Gemeldet</th>
                        <th>Mangel</th>
                        <th>Ort / Gerät</th>
                        <th>Schweregrad</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defects.map((d) => (
                        <tr key={d.id}>
                          <td>{fmtDateTime(d.created_at)}</td>
                          <td className="wrap">{d.title}</td>
                          <td className="muted">
                            {d.equipment_id
                              ? (eqNames.get(d.equipment_id) ?? 'Gerät')
                              : 'Fläche allgemein'}
                          </td>
                          <td>
                            <SeverityBadge severity={d.severity} />
                          </td>
                          <td>
                            <DefectStatusBadge status={d.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="section-head">
              <h2>Kontroll-Historie ({inspections.length})</h2>
              <Link className="btn small" to={`../bericht?spielplatz=${playground.id}`}>
                📄 Kontrollbuch-PDF erstellen
              </Link>
            </div>

            {inspections.length === 0 ? (
              <div className="card empty">
                Für diesen Spielplatz ist noch keine Kontrolle dokumentiert.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
                      <th>Kontrollart</th>
                      <th>Ergebnis</th>
                      <th>GPS</th>
                      <th>Kontrolliert von</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link to={`../kontrollen/${i.id}`}>
                            {fmtDateTime(i.started_at)}
                          </Link>
                        </td>
                        <td>
                          <InspectionBadge type={i.type} canceled={i.canceled} />
                        </td>
                        <td className="muted wrap">{checklistSummary(i.checklist)}</td>
                        <td className="muted mono small">
                          {gpsLabel(i.lat, i.lng, i.gps_accuracy_m)}
                        </td>
                        <td className="muted">{i.inspector_name ?? '—'}</td>
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
