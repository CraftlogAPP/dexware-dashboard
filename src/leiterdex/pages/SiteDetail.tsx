import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime, gpsLabel } from '../../lib/format';
import {
  fetchDefects,
  fetchInspections,
  fetchLadders,
  fetchSite,
  saveLadder,
} from '../api';
import { DefectStatusBadge, InspectionBadge, SeverityBadge } from '../badges';
import { checklistSummary, dimensionLabel, ladderNameMap } from '../labels';
import { SiteDialog } from '../dialogs';
import {
  LADDER_CATEGORIES,
  LADDER_MATERIALS,
  type Defect,
  type Inspection,
  type Ladder,
  type Site,
} from '../types';

interface Data {
  site: Site | null;
  ladders: Ladder[];
  inspections: Inspection[];
  defects: Defect[];
}

export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editingLadder, setEditingLadder] = useState<Ladder | 'new' | null>(null);
  const [editingSite, setEditingSite] = useState(false);

  const state = useAsync<Data>(async () => {
    const [site, ladders, inspections, defects] = await Promise.all([
      fetchSite(client, id!),
      fetchLadders(client, id),
      fetchInspections(client, { siteId: id, limit: 300 }),
      fetchDefects(client, { siteId: id, limit: 300 }),
    ]);
    return { site, ladders, inspections, defects };
  }, [client, id]);

  async function onSaveLadder(v: FormValues) {
    if (!org || !id) throw new Error('Kein Betrieb geladen');
    await saveLadder(
      client,
      org.org.id,
      {
        site_id: id,
        name: s(v.name),
        category: s(v.category),
        material: s(v.material),
        manufacturer: orNull(v.manufacturer),
        purchase_year: orNull(v.purchase_year),
        length_m: orNull(v.length_m),
        rung_count: orNull(v.rung_count),
        notes: orNull(v.notes),
        retired: v.retired === true,
      },
      editingLadder === 'new' ? undefined : (editingLadder ?? undefined),
    );
    state.reload();
  }

  return (
    <LoadGuard state={state}>
      {({ site, ladders, inspections, defects }) => {
        if (!site) {
          return <div className="error-box">Standort nicht gefunden.</div>;
        }
        const ladderNames = ladderNameMap(ladders);
        const openDefects = defects.filter((d) => d.status === 'open');
        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../standorte">← Alle Standorte</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <h1 style={{ marginBottom: 0 }}>{site.name}</h1>
                <button
                  className="btn ghost small"
                  onClick={() => setEditingSite(true)}
                >
                  Standort bearbeiten
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
                <div className="kpi-label">Standort</div>
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
              <h2>Leitern & Tritte ({ladders.length})</h2>
              <button className="btn small" onClick={() => setEditingLadder('new')}>
                ＋ Leiter anlegen
              </button>
            </div>
            {ladders.length === 0 ? (
              <div className="card empty">Noch keine Leitern erfasst.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Leiter / Tritt</th>
                      <th>Bauart</th>
                      <th>Material</th>
                      <th>Hersteller</th>
                      <th>Maße</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ladders.map((l) => (
                      <tr key={l.id}>
                        <td>{l.name}</td>
                        <td className="muted">{l.category}</td>
                        <td className="muted">{l.material}</td>
                        <td className="muted">{l.manufacturer ?? '—'}</td>
                        <td className="muted small">
                          {dimensionLabel(l.length_m, l.rung_count)}
                        </td>
                        <td>
                          {l.retired ? (
                            <span className="badge">ausgesondert</span>
                          ) : (
                            <span className="badge green">in Betrieb</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn ghost small"
                            onClick={() => setEditingLadder(l)}
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

            {editingLadder && (
              <FormDialog
                title={
                  editingLadder === 'new'
                    ? 'Leiter / Tritt anlegen'
                    : `${editingLadder.name} bearbeiten`
                }
                onClose={() => setEditingLadder(null)}
                onSave={onSaveLadder}
                fields={[
                  { key: 'name', label: 'Bezeichnung', required: true, placeholder: 'z. B. L-003' },
                  {
                    key: 'category',
                    label: 'Bauart',
                    kind: 'select',
                    required: true,
                    options: LADDER_CATEGORIES.map((c) => ({ value: c, label: c })),
                  },
                  {
                    key: 'material',
                    label: 'Material',
                    kind: 'select',
                    required: true,
                    options: LADDER_MATERIALS.map((m) => ({ value: m, label: m })),
                  },
                  { key: 'manufacturer', label: 'Hersteller' },
                  { key: 'purchase_year', label: 'Anschaffungs-/Baujahr', placeholder: 'z. B. 2020' },
                  { key: 'length_m', label: 'Länge / Arbeitshöhe (m)', placeholder: 'z. B. 4,0' },
                  { key: 'rung_count', label: 'Sprossen-/Stufenzahl', placeholder: 'z. B. 12' },
                  { key: 'notes', label: 'Notizen', kind: 'textarea' },
                  { key: 'retired', label: 'Ausgesondert (außer Betrieb)', kind: 'checkbox' },
                ]}
                initial={
                  editingLadder === 'new'
                    ? { category: 'Stehleiter', material: 'Aluminium' }
                    : {
                        name: editingLadder.name,
                        category: editingLadder.category,
                        material: editingLadder.material,
                        manufacturer: editingLadder.manufacturer ?? '',
                        purchase_year: editingLadder.purchase_year ?? '',
                        length_m: editingLadder.length_m ?? '',
                        rung_count: editingLadder.rung_count ?? '',
                        notes: editingLadder.notes ?? '',
                        retired: editingLadder.retired,
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
                        <th>Leiter</th>
                        <th>Gefährdung</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defects.map((d) => (
                        <tr key={d.id}>
                          <td>{fmtDateTime(d.created_at)}</td>
                          <td className="wrap">{d.title}</td>
                          <td className="muted">
                            {ladderNames.get(d.ladder_id) ?? 'Leiter'}
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
              <Link className="btn small" to={`../bericht?standort=${site.id}`}>
                📄 Prüfbericht-PDF erstellen
              </Link>
            </div>

            {inspections.length === 0 ? (
              <div className="card empty">
                Für diesen Standort ist noch keine Prüfung dokumentiert.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
                      <th>Leiter</th>
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
                        <td className="muted">{ladderNames.get(i.ladder_id) ?? '—'}</td>
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
