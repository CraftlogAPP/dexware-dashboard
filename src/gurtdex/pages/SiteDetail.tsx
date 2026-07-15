import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime, gpsLabel } from '../../lib/format';
import {
  fetchDefects,
  fetchItems,
  fetchInspections,
  fetchSite,
  saveItem,
} from '../api';
import { DefectStatusBadge, InspectionBadge, SeverityBadge } from '../badges';
import { checklistSummary, itemNameMap, itemMetaLabel } from '../labels';
import { SiteDialog } from '../dialogs';
import {
  ITEM_CATEGORIES,
  lifespanWarning,
  type Defect,
  type PsaItem,
  type Inspection,
  type Site,
} from '../types';

interface Data {
  site: Site | null;
  items: PsaItem[];
  inspections: Inspection[];
  defects: Defect[];
}

export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editingItem, setEditingItem] = useState<
    PsaItem | 'new' | null
  >(null);
  const [editingSite, setEditingSite] = useState(false);

  const state = useAsync<Data>(async () => {
    const [site, items, inspections, defects] = await Promise.all([
      fetchSite(client, id!),
      fetchItems(client, id),
      fetchInspections(client, { siteId: id, limit: 300 }),
      fetchDefects(client, { siteId: id, limit: 300 }),
    ]);
    return { site, items, inspections, defects };
  }, [client, id]);

  async function onSaveItem(v: FormValues) {
    if (!org || !id) throw new Error('Kein Betrieb geladen');
    await saveItem(
      client,
      org.org.id,
      {
        site_id: id,
        name: s(v.name),
        category: s(v.category),
        manufacturer: orNull(v.manufacturer),
        model: orNull(v.model),
        serial_no: orNull(v.serial_no),
        manufacture_date: orNull(v.manufacture_date),
        first_use_date: orNull(v.first_use_date),
        max_life_years: orNull(v.max_life_years),
        wearer_name: orNull(v.wearer_name),
        notes: orNull(v.notes),
        retired: v.retired === true,
      },
      editingItem === 'new' ? undefined : (editingItem ?? undefined),
    );
    state.reload();
  }

  return (
    <LoadGuard state={state}>
      {({ site, items, inspections, defects }) => {
        if (!site) {
          return <div className="error-box">Standort nicht gefunden.</div>;
        }
        const itemNames = itemNameMap(items);
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
              <h2>PSA-Artikel ({items.length})</h2>
              <button
                className="btn small"
                onClick={() => setEditingItem('new')}
              >
                ＋ Artikel anlegen
              </button>
            </div>
            {items.length === 0 ? (
              <div className="card empty">Noch keine PSA-Artikel erfasst.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Artikel</th>
                      <th>Ausrüstungsart</th>
                      <th>Hersteller / Modell</th>
                      <th>Stammdaten</th>
                      <th>Ablegereife</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => {
                      const warn = e.retired ? undefined : lifespanWarning(e);
                      return (
                        <tr key={e.id}>
                          <td>{e.name}</td>
                          <td className="muted">{e.category}</td>
                          <td className="muted">
                            {[e.manufacturer, e.model].filter(Boolean).join(' ') || '—'}
                          </td>
                          <td className="muted small">
                            {itemMetaLabel(e.manufacture_date, e.max_life_years, e.wearer_name)}
                          </td>
                          <td className="small wrap">
                            {warn ? (
                              <span className={warn.startsWith('Ablegereif seit') ? 'badge red' : 'badge amber'}>
                                {warn}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            {e.retired ? (
                              <span className="badge">ausgesondert</span>
                            ) : (
                              <span className="badge green">in Benutzung</span>
                            )}
                          </td>
                          <td>
                            <button
                              className="btn ghost small"
                              onClick={() => setEditingItem(e)}
                            >
                              Bearbeiten
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {editingItem && (
              <FormDialog
                title={
                  editingItem === 'new'
                    ? 'PSA-Artikel anlegen'
                    : `${editingItem.name} bearbeiten`
                }
                onClose={() => setEditingItem(null)}
                onSave={onSaveItem}
                fields={[
                  { key: 'name', label: 'Bezeichnung / Nummer', required: true, placeholder: 'z. B. PSA-03 — Kolonne Süd' },
                  {
                    key: 'category',
                    label: 'Ausrüstungsart',
                    kind: 'select',
                    required: true,
                    options: ITEM_CATEGORIES.map((c) => ({ value: c, label: c })),
                  },
                  { key: 'manufacturer', label: 'Hersteller', placeholder: 'z. B. Petzl, Skylotec' },
                  { key: 'model', label: 'Typ / Modell (Etikett)' },
                  { key: 'serial_no', label: 'Seriennummer (Etikett, EN 365)' },
                  { key: 'manufacture_date', label: 'Herstellungsdatum (Ablegereife)', placeholder: 'JJJJ-MM, z. B. 2023-04' },
                  { key: 'first_use_date', label: 'Erste Benutzung (optional)', placeholder: 'JJJJ-MM' },
                  { key: 'max_life_years', label: 'Max. Gebrauchsdauer lt. Hersteller (Jahre)', placeholder: 'z. B. 10' },
                  { key: 'wearer_name', label: 'Zugeordnete/r Träger/in (persönliche PSA)' },
                  { key: 'notes', label: 'Notizen', kind: 'textarea' },
                  { key: 'retired', label: 'Ausgesondert (ablegereif/ersetzt)', kind: 'checkbox' },
                ]}
                initial={
                  editingItem === 'new'
                    ? { category: 'Auffanggurt (EN 361)' }
                    : {
                        name: editingItem.name,
                        category: editingItem.category,
                        manufacturer: editingItem.manufacturer ?? '',
                        model: editingItem.model ?? '',
                        serial_no: editingItem.serial_no ?? '',
                        manufacture_date: editingItem.manufacture_date ?? '',
                        first_use_date: editingItem.first_use_date ?? '',
                        max_life_years: editingItem.max_life_years ?? '',
                        wearer_name: editingItem.wearer_name ?? '',
                        notes: editingItem.notes ?? '',
                        retired: editingItem.retired,
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
                        <th>Artikel</th>
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
                            {itemNames.get(d.item_id) ?? 'PSA-Artikel'}
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
                      <th>Artikel</th>
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
                          {itemNames.get(i.item_id) ?? '—'}
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
