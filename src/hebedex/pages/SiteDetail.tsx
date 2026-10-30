import { useState } from 'react';
import { FileDown } from 'lucide-react';
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
import { checklistSummary, itemNameMap, itemMetaLabel, lastInspectionByType } from '../labels';
import { SiteDialog } from '../dialogs';
import {
  crackDue,
  dueLabel,
  expertDue,
  fmtWll,
  ITEM_KINDS,
  itemSubtitle,
  kindInfo,
  parseWll,
  WLL_COLORS,
  type Defect,
  type LiftingItem,
  type Inspection,
  type Site,
} from '../types';

interface Data {
  site: Site | null;
  items: LiftingItem[];
  inspections: Inspection[];
  defects: Defect[];
}

export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editingItem, setEditingItem] = useState<
    LiftingItem | 'new' | null
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
    const wllText = s(v.wll);
    const wll = wllText ? parseWll(wllText) : undefined;
    if (wllText && !wll)
      throw new Error('Tragfähigkeit bitte als „2 t“, „2,5 t“ oder „750 kg“ angeben');
    const retired = v.retired === true;
    if (retired && !s(v.retire_reason))
      throw new Error('Beim Aussondern bitte einen Grund angeben (bleibt als Nachweis im Prüfbuch)');
    const kind = s(v.kind) as LiftingItem['kind'];
    await saveItem(
      client,
      org.org.id,
      {
        site_id: id,
        name: s(v.name),
        kind,
        wll_kg: wll ?? null,
        length_m: orNull(v.length_m),
        nominal_mm: kindInfo(kind).sizeLabel ? orNull(v.nominal_mm) : null,
        rope_kind:
          kind === 'wire_rope' ? ((s(v.rope_kind) || 'strand') as 'strand' | 'cable') : null,
        manufacturer: orNull(v.manufacturer),
        serial_no: orNull(v.serial_no),
        build_year: orNull(v.build_year),
        color: orNull(v.color),
        notes: orNull(v.notes),
        retired,
        retire_reason: orNull(v.retire_reason),
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
        const lastByType = lastInspectionByType(inspections);
        const land = org?.org.land;
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
              <h2>Teile ({items.length})</h2>
              <button
                className="btn small"
                onClick={() => setEditingItem('new')}
              >
                ＋ Teil anlegen
              </button>
            </div>
            {items.length === 0 ? (
              <div className="card empty">Noch keine Teile erfasst.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nummer</th>
                      <th>Teil</th>
                      <th>Hersteller / Etikett</th>
                      <th>Nächste Prüfung</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => {
                      const due = expertDue(lastByType.get(`${e.id}:expert`)?.started_at, land);
                      const crack = crackDue(e, lastByType.get(`${e.id}:crack`)?.started_at);
                      const blocked = openDefects.some((d) => d.item_id === e.id && d.item_blocked);
                      const tone = (st: string) =>
                        st === 'ok' ? 'muted' : st === 'soon' ? 'badge amber' : 'badge red';
                      return (
                        <tr key={e.id}>
                          <td>
                            {e.name}
                            {e.is_demo && (
                              <span className="badge" style={{ marginLeft: 6 }}>Beispiel</span>
                            )}
                          </td>
                          <td className="muted wrap">
                            {kindInfo(e.kind).emoji} {itemSubtitle(e)}
                          </td>
                          <td className="muted small">{itemMetaLabel(e)}</td>
                          <td className="small wrap">
                            {e.retired ? (
                              <span className="muted">—</span>
                            ) : (
                              <>
                                <span className={tone(due.state)}>{dueLabel(due)}</span>
                                {crack && (
                                  <div style={{ marginTop: 4 }}>
                                    <span className={tone(crack.state)}>
                                      Rissprüfung: {dueLabel(crack)}
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td>
                            {e.retired ? (
                              <span className="badge" title={e.retire_reason ?? undefined}>
                                ausgesondert
                              </span>
                            ) : blocked ? (
                              <span className="badge red">gesperrt</span>
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
                    ? 'Teil anlegen'
                    : `${editingItem.name} bearbeiten`
                }
                onClose={() => setEditingItem(null)}
                onSave={onSaveItem}
                fields={[
                  { key: 'name', label: 'Nummer / Bezeichnung', required: true, placeholder: 'z. B. HB-012' },
                  {
                    key: 'kind',
                    label: 'Typ',
                    kind: 'select',
                    required: true,
                    options: ITEM_KINDS.map((k) => ({ value: k.id, label: `${k.emoji} ${k.label}` })),
                  },
                  { key: 'wll', label: 'Tragfähigkeit (WLL) bzw. Zurrkraft (LC)', placeholder: 'z. B. 2 t oder 750 kg' },
                  { key: 'length_m', label: 'Nutzlänge (m)', placeholder: 'z. B. 3' },
                  {
                    key: 'nominal_mm',
                    label: 'Nenndicke / Seildurchmesser (mm)',
                    hint: 'Nur bei Ketten und Drahtseilen — Grundlage für den Ablegereife-Rechner.',
                  },
                  {
                    key: 'rope_kind',
                    label: 'Drahtseil-Bauart',
                    kind: 'select',
                    hint: 'Nur bei Drahtseilen — bestimmt die Drahtbruch-Grenzen.',
                    options: [
                      { value: 'strand', label: 'Litzenseil' },
                      { value: 'cable', label: 'Kabelschlagseil' },
                    ],
                  },
                  {
                    key: 'color',
                    label: 'Farbe (Hebeband / Rundschlinge, EN 1492)',
                    kind: 'select',
                    options: WLL_COLORS.map((c) => ({ value: c, label: c })),
                  },
                  { key: 'manufacturer', label: 'Hersteller', placeholder: 'z. B. Dolezych, RUD, SpanSet' },
                  { key: 'serial_no', label: 'Etikett- / Seriennummer' },
                  {
                    key: 'build_year',
                    label: 'Herstelljahr',
                    placeholder: 'z. B. 2022',
                    hint: 'Bei Ketten Startpunkt der Rissprüfungs-Frist, solange keine Rissprüfung erfasst ist.',
                  },
                  { key: 'notes', label: 'Notizen', kind: 'textarea' },
                  { key: 'retired', label: 'Ausgesondert (ablegereif, verloren oder ersetzt)', kind: 'checkbox' },
                  {
                    key: 'retire_reason',
                    label: 'Grund der Aussonderung',
                    hint: 'Pflicht beim Aussondern — bleibt mit Datum im Prüfbuch.',
                  },
                ]}
                initial={
                  editingItem === 'new'
                    ? { kind: 'webbing_sling' }
                    : {
                        name: editingItem.name,
                        kind: editingItem.kind,
                        wll: fmtWll(editingItem.wll_kg),
                        length_m: editingItem.length_m ?? '',
                        nominal_mm: editingItem.nominal_mm ?? '',
                        rope_kind: editingItem.rope_kind ?? '',
                        color: editingItem.color ?? '',
                        manufacturer: editingItem.manufacturer ?? '',
                        serial_no: editingItem.serial_no ?? '',
                        build_year: editingItem.build_year ?? '',
                        notes: editingItem.notes ?? '',
                        retired: editingItem.retired,
                        retire_reason: editingItem.retire_reason ?? '',
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
                        <th>Teil</th>
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
                            {itemNames.get(d.item_id) ?? 'Teil'}
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
                <FileDown className="i" aria-hidden /> Prüfbericht-PDF erstellen
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
                      <th>Teil</th>
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
