import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime, gpsLabel } from '../../lib/format';
import {
  fetchDamages,
  fetchInspections,
  fetchScaffolds,
  fetchSite,
  saveScaffold,
} from '../api';
import { DamageStatusBadge, InspectionBadge, SeverityBadge } from '../badges';
import { checklistSummary, classLabel, erectedLabel, scaffoldNameMap } from '../labels';
import { SiteDialog } from '../dialogs';
import {
  LOAD_CLASSES,
  SCAFFOLD_CATEGORIES,
  WIDTH_CLASSES,
  type Damage,
  type Inspection,
  type Scaffold,
  type Site,
} from '../types';

interface Data {
  site: Site | null;
  scaffolds: Scaffold[];
  inspections: Inspection[];
  damages: Damage[];
}

export function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editingScaffold, setEditingScaffold] = useState<Scaffold | 'new' | null>(null);
  const [editingSite, setEditingSite] = useState(false);

  const state = useAsync<Data>(async () => {
    const [site, scaffolds, inspections, damages] = await Promise.all([
      fetchSite(client, id!),
      fetchScaffolds(client, id),
      fetchInspections(client, { siteId: id, limit: 300 }),
      fetchDamages(client, { siteId: id, limit: 300 }),
    ]);
    return { site, scaffolds, inspections, damages };
  }, [client, id]);

  async function onSaveScaffold(v: FormValues) {
    if (!org || !id) throw new Error('Kein Betrieb geladen');
    await saveScaffold(
      client,
      org.org.id,
      {
        site_id: id,
        name: s(v.name),
        category: s(v.category),
        manufacturer: orNull(v.manufacturer),
        erected_by: orNull(v.erected_by),
        erected_at: orNull(v.erected_at),
        load_class: orNull(v.load_class),
        width_class: orNull(v.width_class),
        notes: orNull(v.notes),
        retired: v.retired === true,
      },
      editingScaffold === 'new' ? undefined : (editingScaffold ?? undefined),
    );
    state.reload();
  }

  return (
    <LoadGuard state={state}>
      {({ site, scaffolds, inspections, damages }) => {
        if (!site) {
          return <div className="error-box">Baustelle nicht gefunden.</div>;
        }
        const scaffoldNames = scaffoldNameMap(scaffolds);
        const openDamages = damages.filter((d) => d.status === 'open');
        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../baustellen">← Alle Baustellen</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <h1 style={{ marginBottom: 0 }}>{site.name}</h1>
                <button
                  className="btn ghost small"
                  onClick={() => setEditingSite(true)}
                >
                  Baustelle bearbeiten
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
                <div className="kpi-label">Auftraggeber / Bauherr</div>
                <div>{site.operator_name ?? '—'}</div>
                <div className="muted small">{site.operator_contact ?? ''}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Standort</div>
                <div className="mono small">{gpsLabel(site.lat, site.lng, null)}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Offene Mängel</div>
                <div>{openDamages.length === 0 ? 'keine' : openDamages.length}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Notizen</div>
                <div className="small">{site.notes ?? '—'}</div>
              </div>
            </div>

            <div className="section-head">
              <h2>Gerüste ({scaffolds.length})</h2>
              <button className="btn small" onClick={() => setEditingScaffold('new')}>
                ＋ Gerüst anlegen
              </button>
            </div>
            {scaffolds.length === 0 ? (
              <div className="card empty">Noch keine Gerüste erfasst.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gerüst</th>
                      <th>Bauart</th>
                      <th>System</th>
                      <th>Last-/Breitenklasse</th>
                      <th>Aufgebaut</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scaffolds.map((sc) => (
                      <tr key={sc.id}>
                        <td>{sc.name}</td>
                        <td className="muted">{sc.category}</td>
                        <td className="muted">{sc.manufacturer ?? '—'}</td>
                        <td className="muted small">
                          {classLabel(sc.load_class, sc.width_class)}
                        </td>
                        <td className="muted small">
                          {erectedLabel(sc.erected_at, sc.erected_by)}
                        </td>
                        <td>
                          {sc.retired ? (
                            <span className="badge">abgebaut</span>
                          ) : (
                            <span className="badge green">steht</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn ghost small"
                            onClick={() => setEditingScaffold(sc)}
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

            {editingScaffold && (
              <FormDialog
                title={
                  editingScaffold === 'new'
                    ? 'Gerüst anlegen'
                    : `${editingScaffold.name} bearbeiten`
                }
                onClose={() => setEditingScaffold(null)}
                onSave={onSaveScaffold}
                fields={[
                  { key: 'name', label: 'Bezeichnung', required: true, placeholder: 'z. B. Fassade Nord' },
                  {
                    key: 'category',
                    label: 'Bauart',
                    kind: 'select',
                    required: true,
                    options: SCAFFOLD_CATEGORIES.map((c) => ({ value: c, label: c })),
                  },
                  { key: 'manufacturer', label: 'Gerüstsystem', placeholder: 'z. B. Layher Blitz' },
                  { key: 'erected_by', label: 'Ersteller (Gerüstbaubetrieb)' },
                  { key: 'erected_at', label: 'Aufbaudatum (lt. Kennzeichnung)', placeholder: 'z. B. 05.07.2026' },
                  {
                    key: 'load_class',
                    label: 'Lastklasse (EN 12811-1)',
                    kind: 'select',
                    options: [
                      { value: '', label: '— unbekannt —' },
                      ...LOAD_CLASSES.map((c) => ({ value: c, label: c })),
                    ],
                  },
                  {
                    key: 'width_class',
                    label: 'Breitenklasse (EN 12811-1)',
                    kind: 'select',
                    options: [
                      { value: '', label: '— unbekannt —' },
                      ...WIDTH_CLASSES.map((c) => ({ value: c, label: c })),
                    ],
                  },
                  { key: 'notes', label: 'Notizen', kind: 'textarea' },
                  { key: 'retired', label: 'Abgebaut', kind: 'checkbox' },
                ]}
                initial={
                  editingScaffold === 'new'
                    ? { category: 'Fassadengerüst' }
                    : {
                        name: editingScaffold.name,
                        category: editingScaffold.category,
                        manufacturer: editingScaffold.manufacturer ?? '',
                        erected_by: editingScaffold.erected_by ?? '',
                        erected_at: editingScaffold.erected_at ?? '',
                        load_class: editingScaffold.load_class ?? '',
                        width_class: editingScaffold.width_class ?? '',
                        notes: editingScaffold.notes ?? '',
                        retired: editingScaffold.retired,
                      }
                }
              />
            )}

            {damages.length > 0 && (
              <>
                <div className="section-head">
                  <h2>Mängel ({damages.length})</h2>
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
                        <th>Gerüst</th>
                        <th>Einstufung</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {damages.map((d) => (
                        <tr key={d.id}>
                          <td>{fmtDateTime(d.created_at)}</td>
                          <td className="wrap">{d.title}</td>
                          <td className="muted">
                            {d.scaffold_id
                              ? (scaffoldNames.get(d.scaffold_id) ?? 'Gerüst')
                              : 'Baustelle allgemein'}
                          </td>
                          <td>
                            <SeverityBadge severity={d.severity} />
                          </td>
                          <td>
                            <DamageStatusBadge status={d.status} />
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
              <Link className="btn small" to={`../bericht?baustelle=${site.id}`}>
                📄 Prüfbericht-PDF erstellen
              </Link>
            </div>

            {inspections.length === 0 ? (
              <div className="card empty">
                Für diese Baustelle ist noch keine Prüfung dokumentiert.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
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
