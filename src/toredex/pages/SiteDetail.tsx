import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime, gpsLabel } from '../../lib/format';
import {
  fetchDefects,
  fetchGates,
  fetchInspections,
  fetchSite,
  saveGate,
} from '../api';
import { DefectStatusBadge, InspectionBadge, SeverityBadge } from '../badges';
import { checklistSummary, gateNameMap, buildLabel } from '../labels';
import { SiteDialog } from '../dialogs';
import {
  GATE_DRIVE_TYPES,
  GATE_CATEGORIES,
  type Defect,
  type Gate,
  type Inspection,
  type Site,
} from '../types';

interface Data {
  site: Site | null;
  gates: Gate[];
  inspections: Inspection[];
  defects: Defect[];
}

export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editingGate, setEditingGate] = useState<
    Gate | 'new' | null
  >(null);
  const [editingSite, setEditingSite] = useState(false);

  const state = useAsync<Data>(async () => {
    const [site, gates, inspections, defects] = await Promise.all([
      fetchSite(client, id!),
      fetchGates(client, id),
      fetchInspections(client, { siteId: id, limit: 300 }),
      fetchDefects(client, { siteId: id, limit: 300 }),
    ]);
    return { site, gates, inspections, defects };
  }, [client, id]);

  async function onSaveGate(v: FormValues) {
    if (!org || !id) throw new Error('Kein Betrieb geladen');
    await saveGate(
      client,
      org.org.id,
      {
        site_id: id,
        name: s(v.name),
        category: s(v.category),
        drive_type: s(v.drive_type),
        manufacturer: orNull(v.manufacturer),
        build_year: orNull(v.build_year),
        dimensions: orNull(v.dimensions),
        serial_no: orNull(v.serial_no),
        notes: orNull(v.notes),
        retired: v.retired === true,
      },
      editingGate === 'new' ? undefined : (editingGate ?? undefined),
    );
    state.reload();
  }

  return (
    <LoadGuard state={state}>
      {({ site, gates, inspections, defects }) => {
        if (!site) {
          return <div className="error-box">Objekt nicht gefunden.</div>;
        }
        const gateNames = gateNameMap(gates);
        const openDefects = defects.filter((d) => d.status === 'open');
        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../objekte">← Alle Objekte</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <h1 style={{ marginBottom: 0 }}>{site.name}</h1>
                <button
                  className="btn ghost small"
                  onClick={() => setEditingSite(true)}
                >
                  Objekt bearbeiten
                </button>
              </div>
              <StatusBadge active={site.active} />
            </div>
            <p className="muted">{site.address}</p>

            {editingSite && (
              <SiteDialog
                site={site}
                onClose={() => setEditingSite(false)}
                onSaved={() => {
                  setEditingSite(false);
                  state.reload();
                }}
              />
            )}

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Betreiber / Auftraggeber</div>
                <div>{site.operator_name ?? '—'}</div>
                <div className="muted small">{site.operator_contact ?? ''}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Position</div>
                <div className="mono small">{gpsLabel(site.lat, site.lng, null)}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Offene Mängel</div>
                <div>{openDefects.length === 0 ? 'keine' : openDefects.length}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Notizen</div>
                <div className="small">{site.notes ?? '—'}</div>
              </div>
            </div>

            <div className="section-head">
              <h2>Tore ({gates.length})</h2>
              <button
                className="btn small"
                onClick={() => setEditingGate('new')}
              >
                ＋ Tor anlegen
              </button>
            </div>
            {gates.length === 0 ? (
              <div className="card empty">Noch keine Tore erfasst.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tor</th>
                      <th>Torart</th>
                      <th>Antrieb</th>
                      <th>Hersteller</th>
                      <th>Baujahr / Maße</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {gates.map((e) => (
                      <tr key={e.id}>
                        <td>{e.name}</td>
                        <td className="muted">{e.category}</td>
                        <td className="muted">{e.drive_type}</td>
                        <td className="muted">{e.manufacturer ?? '—'}</td>
                        <td className="muted small">
                          {buildLabel(e.build_year, e.dimensions)}
                        </td>
                        <td>
                          {e.retired ? (
                            <span className="badge">stillgelegt</span>
                          ) : (
                            <span className="badge green">in Betrieb</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn ghost small"
                            onClick={() => setEditingGate(e)}
                          >
                            Bearbeiten
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {editingGate && (
              <FormDialog
                title={
                  editingGate === 'new'
                    ? 'Tor anlegen'
                    : `${editingGate.name} bearbeiten`
                }
                onClose={() => setEditingGate(null)}
                onSave={onSaveGate}
                fields={[
                  { key: 'name', label: 'Bezeichnung', required: true, placeholder: 'z. B. T-03 — Halle West' },
                  {
                    key: 'category',
                    label: 'Torart',
                    kind: 'select',
                    required: true,
                    options: GATE_CATEGORIES.map((c) => ({ value: c, label: c })),
                  },
                  {
                    key: 'drive_type',
                    label: 'Antrieb',
                    kind: 'select',
                    required: true,
                    options: GATE_DRIVE_TYPES.map((b) => ({ value: b, label: b })),
                  },
                  { key: 'manufacturer', label: 'Hersteller' },
                  { key: 'build_year', label: 'Baujahr (Typenschild)', placeholder: 'z. B. 2015' },
                  { key: 'dimensions', label: 'Maße B × H (m)', placeholder: 'z. B. 4 × 4,5' },
                  { key: 'serial_no', label: 'Serien-/Identnummer (Typenschild)' },
                  { key: 'notes', label: 'Notizen', kind: 'textarea' },
                  { key: 'retired', label: 'Stillgelegt (ausgebaut/ersetzt)', kind: 'checkbox' },
                ]}
                initial={
                  editingGate === 'new'
                    ? { category: 'Sectionaltor', drive_type: 'Kraftbetätigt' }
                    : {
                        name: editingGate.name,
                        category: editingGate.category,
                        drive_type: editingGate.drive_type,
                        manufacturer: editingGate.manufacturer ?? '',
                        build_year: editingGate.build_year ?? '',
                        dimensions: editingGate.dimensions ?? '',
                        serial_no: editingGate.serial_no ?? '',
                        notes: editingGate.notes ?? '',
                        retired: editingGate.retired,
                      }
                }
              />
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
                        <th>Tor</th>
                        <th>Einstufung</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defects.map((d) => (
                        <tr key={d.id}>
                          <td>{fmtDateTime(d.created_at)}</td>
                          <td className="wrap">{d.title}</td>
                          <td className="muted">
                            {gateNames.get(d.gate_id) ?? 'Tor'}
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
              <h2>Prüf-Historie ({inspections.length})</h2>
              <Link className="btn small" to={`../bericht?objekt=${site.id}`}>
                📄 Prüfprotokoll-PDF erstellen
              </Link>
            </div>

            {inspections.length === 0 ? (
              <div className="card empty">
                Für dieses Objekt ist noch keine Prüfung dokumentiert.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
                      <th>Tor</th>
                      <th>Prüfart</th>
                      <th>Ergebnis</th>
                      <th>GPS</th>
                      <th>Geprüft von</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link to={`../pruefungen/${i.id}`}>
                            {fmtDateTime(i.started_at)}
                          </Link>
                        </td>
                        <td className="muted">
                          {gateNames.get(i.gate_id) ?? '—'}
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
