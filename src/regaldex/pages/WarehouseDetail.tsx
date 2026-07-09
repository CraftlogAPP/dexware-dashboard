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
  fetchRacks,
  fetchWarehouse,
  saveRack,
} from '../api';
import { DamageStatusBadge, InspectionBadge, SeverityBadge } from '../badges';
import { checklistSummary, loadLabel, rackNameMap } from '../labels';
import { WarehouseDialog } from '../dialogs';
import type { Damage, Inspection, Rack, Warehouse } from '../types';

interface Data {
  warehouse: Warehouse | null;
  racks: Rack[];
  inspections: Inspection[];
  damages: Damage[];
}

export function WarehouseDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editingRack, setEditingRack] = useState<Rack | 'new' | null>(null);
  const [editingWh, setEditingWh] = useState(false);

  const state = useAsync<Data>(async () => {
    const [warehouse, racks, inspections, damages] = await Promise.all([
      fetchWarehouse(client, id!),
      fetchRacks(client, id),
      fetchInspections(client, { warehouseId: id, limit: 300 }),
      fetchDamages(client, { warehouseId: id, limit: 300 }),
    ]);
    return { warehouse, racks, inspections, damages };
  }, [client, id]);

  async function onSaveRack(v: FormValues) {
    if (!org || !id) throw new Error('Kein Betrieb geladen');
    await saveRack(
      client,
      org.org.id,
      {
        warehouse_id: id,
        name: s(v.name),
        category: s(v.category),
        manufacturer: orNull(v.manufacturer),
        install_year: orNull(v.install_year),
        bay_load_kg: orNull(v.bay_load_kg),
        field_load_kg: orNull(v.field_load_kg),
        notes: orNull(v.notes),
        retired: v.retired === true,
      },
      editingRack === 'new' ? undefined : (editingRack ?? undefined),
    );
    state.reload();
  }

  return (
    <LoadGuard state={state}>
      {({ warehouse, racks, inspections, damages }) => {
        if (!warehouse) {
          return <div className="error-box">Lager nicht gefunden.</div>;
        }
        const rackNames = rackNameMap(racks);
        const openDamages = damages.filter((d) => d.status === 'open');
        return (
          <>
            <p className="small" style={{ marginBottom: 4 }}>
              <Link to="../lager">← Alle Lager</Link>
            </p>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <h1 style={{ marginBottom: 0 }}>{warehouse.name}</h1>
                <button className="btn ghost small" onClick={() => setEditingWh(true)}>
                  Lager bearbeiten
                </button>
              </div>
              <StatusBadge active={warehouse.active} />
            </div>
            <p className="muted">{warehouse.address}</p>

            {editingWh && (
              <WarehouseDialog
                warehouse={warehouse}
                onClose={() => setEditingWh(false)}
                onSaved={() => {
                  setEditingWh(false);
                  state.reload();
                }}
              />
            )}

            <div className="kpi-grid">
              <div className="card">
                <div className="kpi-label">Betreiber / Auftraggeber</div>
                <div>{warehouse.operator_name ?? '—'}</div>
                <div className="muted small">{warehouse.operator_contact ?? ''}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Standort</div>
                <div className="mono small">
                  {gpsLabel(warehouse.lat, warehouse.lng, null)}
                </div>
              </div>
              <div className="card">
                <div className="kpi-label">Offene Schäden</div>
                <div>{openDamages.length === 0 ? 'keine' : openDamages.length}</div>
              </div>
              <div className="card">
                <div className="kpi-label">Notizen</div>
                <div className="small">{warehouse.notes ?? '—'}</div>
              </div>
            </div>

            <div className="section-head">
              <h2>Regal-Inventar ({racks.length})</h2>
              <button className="btn small" onClick={() => setEditingRack('new')}>
                ＋ Regalzeile anlegen
              </button>
            </div>
            {racks.length === 0 ? (
              <div className="card empty">Noch keine Regalzeilen erfasst.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Regalzeile</th>
                      <th>Kategorie</th>
                      <th>Hersteller</th>
                      <th>Baujahr</th>
                      <th>Traglasten</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {racks.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td className="muted">{r.category}</td>
                        <td className="muted">{r.manufacturer ?? '—'}</td>
                        <td className="muted">{r.install_year ?? '—'}</td>
                        <td className="muted small">
                          {loadLabel(r.bay_load_kg, r.field_load_kg)}
                        </td>
                        <td>
                          {r.retired ? (
                            <span className="badge">abgebaut</span>
                          ) : (
                            <span className="badge green">in Betrieb</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn ghost small"
                            onClick={() => setEditingRack(r)}
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

            {editingRack && (
              <FormDialog
                title={
                  editingRack === 'new'
                    ? 'Regalzeile anlegen'
                    : `${editingRack.name} bearbeiten`
                }
                onClose={() => setEditingRack(null)}
                onSave={onSaveRack}
                fields={[
                  { key: 'name', label: 'Regalzeile', required: true, placeholder: 'z. B. Zeile A1' },
                  { key: 'category', label: 'Kategorie', required: true, placeholder: 'z. B. Palettenregal, Fachbodenregal' },
                  { key: 'manufacturer', label: 'Hersteller' },
                  { key: 'install_year', label: 'Baujahr / Aufstelljahr', placeholder: 'z. B. 2020' },
                  { key: 'bay_load_kg', label: 'Fachlast (kg)', placeholder: 'z. B. 1000' },
                  { key: 'field_load_kg', label: 'Feldlast (kg)', placeholder: 'z. B. 8000' },
                  { key: 'notes', label: 'Notizen', kind: 'textarea' },
                  { key: 'retired', label: 'Abgebaut (außer Betrieb)', kind: 'checkbox' },
                ]}
                initial={
                  editingRack === 'new'
                    ? {}
                    : {
                        name: editingRack.name,
                        category: editingRack.category,
                        manufacturer: editingRack.manufacturer ?? '',
                        install_year: editingRack.install_year ?? '',
                        bay_load_kg: editingRack.bay_load_kg ?? '',
                        field_load_kg: editingRack.field_load_kg ?? '',
                        notes: editingRack.notes ?? '',
                        retired: editingRack.retired,
                      }
                }
              />
            )}

            {damages.length > 0 && (
              <>
                <div className="section-head">
                  <h2>Schäden ({damages.length})</h2>
                  <Link to="../schaeden" className="small">
                    Alle Schäden →
                  </Link>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Gemeldet</th>
                        <th>Schaden</th>
                        <th>Ort / Regalzeile</th>
                        <th>Gefährdung</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {damages.map((d) => (
                        <tr key={d.id}>
                          <td>{fmtDateTime(d.created_at)}</td>
                          <td className="wrap">{d.title}</td>
                          <td className="muted">
                            {d.rack_id
                              ? (rackNames.get(d.rack_id) ?? 'Regalzeile')
                              : 'Lager allgemein'}
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
              <h2>Inspektions-Historie ({inspections.length})</h2>
              <Link className="btn small" to={`../bericht?lager=${warehouse.id}`}>
                📄 Prüfbericht-PDF erstellen
              </Link>
            </div>

            {inspections.length === 0 ? (
              <div className="card empty">
                Für dieses Lager ist noch keine Inspektion dokumentiert.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zeitpunkt</th>
                      <th>Inspektionsart</th>
                      <th>Ergebnis</th>
                      <th>GPS</th>
                      <th>Kontrolliert von</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <Link to={`../inspektionen/${i.id}`}>
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
