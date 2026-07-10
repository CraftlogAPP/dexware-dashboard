import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime, gpsLabel } from '../../lib/format';
import {
  fetchDefects,
  fetchExtinguishers,
  fetchInspections,
  fetchSite,
  saveExtinguisher,
} from '../api';
import { DefectStatusBadge, InspectionBadge, SeverityBadge } from '../badges';
import { checklistSummary, extinguisherNameMap, fillingLabel } from '../labels';
import { SiteDialog } from '../dialogs';
import {
  EXTINGUISHER_BUILD_TYPES,
  EXTINGUISHER_CATEGORIES,
  type Defect,
  type Extinguisher,
  type Inspection,
  type Site,
} from '../types';

interface Data {
  site: Site | null;
  extinguishers: Extinguisher[];
  inspections: Inspection[];
  defects: Defect[];
}

export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editingExtinguisher, setEditingExtinguisher] = useState<
    Extinguisher | 'new' | null
  >(null);
  const [editingSite, setEditingSite] = useState(false);

  const state = useAsync<Data>(async () => {
    const [site, extinguishers, inspections, defects] = await Promise.all([
      fetchSite(client, id!),
      fetchExtinguishers(client, id),
      fetchInspections(client, { siteId: id, limit: 300 }),
      fetchDefects(client, { siteId: id, limit: 300 }),
    ]);
    return { site, extinguishers, inspections, defects };
  }, [client, id]);

  async function onSaveExtinguisher(v: FormValues) {
    if (!org || !id) throw new Error('Kein Betrieb geladen');
    await saveExtinguisher(
      client,
      org.org.id,
      {
        site_id: id,
        name: s(v.name),
        category: s(v.category),
        build_type: s(v.build_type),
        manufacturer: orNull(v.manufacturer),
        purchase_year: orNull(v.purchase_year),
        filling_kg: orNull(v.filling_kg),
        rating_le: orNull(v.rating_le),
        notes: orNull(v.notes),
        retired: v.retired === true,
      },
      editingExtinguisher === 'new' ? undefined : (editingExtinguisher ?? undefined),
    );
    state.reload();
  }

  return (
    <LoadGuard state={state}>
      {({ site, extinguishers, inspections, defects }) => {
        if (!site) {
          return <div className="error-box">Standort nicht gefunden.</div>;
        }
        const extinguisherNames = extinguisherNameMap(extinguishers);
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
              <h2>Feuerlöscher ({extinguishers.length})</h2>
              <button
                className="btn small"
                onClick={() => setEditingExtinguisher('new')}
              >
                ＋ Feuerlöscher anlegen
              </button>
            </div>
            {extinguishers.length === 0 ? (
              <div className="card empty">Noch keine Feuerlöscher erfasst.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Feuerlöscher</th>
                      <th>Löschmittel</th>
                      <th>Bauart</th>
                      <th>Hersteller</th>
                      <th>Füllmenge / LE</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {extinguishers.map((e) => (
                      <tr key={e.id}>
                        <td>{e.name}</td>
                        <td className="muted">{e.category}</td>
                        <td className="muted">{e.build_type}</td>
                        <td className="muted">{e.manufacturer ?? '—'}</td>
                        <td className="muted small">
                          {fillingLabel(e.filling_kg, e.rating_le)}
                        </td>
                        <td>
                          {e.retired ? (
                            <span className="badge">ausgesondert</span>
                          ) : (
                            <span className="badge green">in Betrieb</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn ghost small"
                            onClick={() => setEditingExtinguisher(e)}
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

            {editingExtinguisher && (
              <FormDialog
                title={
                  editingExtinguisher === 'new'
                    ? 'Feuerlöscher anlegen'
                    : `${editingExtinguisher.name} bearbeiten`
                }
                onClose={() => setEditingExtinguisher(null)}
                onSave={onSaveExtinguisher}
                fields={[
                  { key: 'name', label: 'Bezeichnung', required: true, placeholder: 'z. B. F-003' },
                  {
                    key: 'category',
                    label: 'Löschmittel',
                    kind: 'select',
                    required: true,
                    options: EXTINGUISHER_CATEGORIES.map((c) => ({ value: c, label: c })),
                  },
                  {
                    key: 'build_type',
                    label: 'Bauart',
                    kind: 'select',
                    required: true,
                    options: EXTINGUISHER_BUILD_TYPES.map((b) => ({ value: b, label: b })),
                  },
                  { key: 'manufacturer', label: 'Hersteller' },
                  { key: 'purchase_year', label: 'Baujahr (Typenschild)', placeholder: 'z. B. 2020' },
                  { key: 'filling_kg', label: 'Füllmenge (kg bzw. l)', placeholder: 'z. B. 6' },
                  { key: 'rating_le', label: 'Löschmitteleinheiten (LE)', placeholder: 'z. B. 10' },
                  { key: 'notes', label: 'Notizen', kind: 'textarea' },
                  { key: 'retired', label: 'Ausgesondert (entsorgt/ersetzt)', kind: 'checkbox' },
                ]}
                initial={
                  editingExtinguisher === 'new'
                    ? { category: 'Pulver (ABC)', build_type: 'Dauerdrucklöscher' }
                    : {
                        name: editingExtinguisher.name,
                        category: editingExtinguisher.category,
                        build_type: editingExtinguisher.build_type,
                        manufacturer: editingExtinguisher.manufacturer ?? '',
                        purchase_year: editingExtinguisher.purchase_year ?? '',
                        filling_kg: editingExtinguisher.filling_kg ?? '',
                        rating_le: editingExtinguisher.rating_le ?? '',
                        notes: editingExtinguisher.notes ?? '',
                        retired: editingExtinguisher.retired,
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
                        <th>Feuerlöscher</th>
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
                            {extinguisherNames.get(d.extinguisher_id) ?? 'Feuerlöscher'}
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
                      <th>Feuerlöscher</th>
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
                          {extinguisherNames.get(i.extinguisher_id) ?? '—'}
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
