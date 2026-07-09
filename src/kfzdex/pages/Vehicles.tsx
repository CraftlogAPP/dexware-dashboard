import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDate, toInputDate } from '../../lib/format';
import { addUvvInspection, fetchVehicles, insertVehicle, updateVehicle } from '../api';
import { DueBadge, dueLabel } from '../badges';
import { uvvDue } from '../due';
import type { UvvResult, Vehicle, VehicleType } from '../types';
import { CHECK_ITEMS, UVV_RESULT_LABEL, VEHICLE_TYPE_LABEL } from '../types';

export function Vehicles() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [type, setType] = useState<'' | VehicleType>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [inspecting, setInspecting] = useState<Vehicle | null>(null);

  const state = useAsync<Vehicle[]>(() => fetchVehicles(client), [client]);

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    const input = {
      plate: s(v.plate),
      name: orNull(v.name),
      type: s(v.type) as VehicleType,
      first_registration: orNull(v.first_registration),
      last_uvv: orNull(v.last_uvv),
    };
    if (editing === 'new') await insertVehicle(client, org.org.id, input);
    else if (editing) await updateVehicle(client, editing.id, input);
    state.reload();
  }

  async function onInspect(v: FormValues) {
    if (!org || !inspecting) throw new Error('Kein Betrieb geladen');
    const checklist: Record<string, boolean> = {};
    for (const item of CHECK_ITEMS) checklist[item.id] = v[`chk_${item.id}`] === true;
    const warning = await addUvvInspection(client, org.org.id, {
      vehicle_id: inspecting.id,
      date: s(v.date),
      inspector: s(v.inspector),
      result: s(v.result) as UvvResult,
      defects: orNull(v.defects),
      checklist,
    });
    state.reload();
    if (warning) alert(warning);
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Fahrzeuge</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Fahrzeug anlegen
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Kennzeichen oder Bezeichnung suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={type} onChange={(e) => setType(e.target.value as '' | VehicleType)}>
          <option value="">Alle Typen</option>
          {(Object.keys(VEHICLE_TYPE_LABEL) as VehicleType[]).map((t) => (
            <option key={t} value={t}>
              {VEHICLE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      <LoadGuard state={state}>
        {(vehicles) => {
          const q = search.trim().toLowerCase();
          const filtered = vehicles.filter(
            (v) =>
              (!type || v.type === type) &&
              (!q ||
                v.plate.toLowerCase().includes(q) ||
                (v.name ?? '').toLowerCase().includes(q)),
          );

          if (filtered.length === 0) {
            return (
              <div className="card empty">
                {vehicles.length === 0
                  ? 'Noch keine Fahrzeuge im Fuhrpark. Lege sie in der KfzDex-App an.'
                  : 'Keine Fahrzeuge für diesen Filter.'}
              </div>
            );
          }

          return (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kennzeichen</th>
                    <th>Bezeichnung</th>
                    <th>Typ</th>
                    <th>Erstzulassung</th>
                    <th>Letzte UVV</th>
                    <th>UVV fällig</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((v) => {
                    const due = uvvDue(v);
                    return (
                      <tr key={v.id}>
                        <td>
                          <Link to={v.id}>{v.plate}</Link>
                        </td>
                        <td className="wrap muted">{v.name ?? '—'}</td>
                        <td className="muted">{VEHICLE_TYPE_LABEL[v.type]}</td>
                        <td className="muted">{fmtDate(v.first_registration)}</td>
                        <td className="muted">{fmtDate(v.last_uvv)}</td>
                        <td className="muted">{dueLabel(due)}</td>
                        <td>
                          <DueBadge status={due.status} />
                        </td>
                        <td>
                          <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                            <button className="btn ghost small" onClick={() => setEditing(v)}>
                              Bearbeiten
                            </button>
                            <button className="btn ghost small" onClick={() => setInspecting(v)}>
                              UVV erfassen
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }}
      </LoadGuard>

      {editing && (
        <FormDialog
          title={editing === 'new' ? 'Fahrzeug anlegen' : `${editing.plate} bearbeiten`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'plate', label: 'Kennzeichen', required: true, placeholder: 'z. B. W-12345X' },
            { key: 'name', label: 'Bezeichnung', placeholder: 'z. B. Sprinter Bau' },
            {
              key: 'type',
              label: 'Typ',
              kind: 'select',
              required: true,
              options: (Object.keys(VEHICLE_TYPE_LABEL) as VehicleType[]).map((t) => ({
                value: t,
                label: VEHICLE_TYPE_LABEL[t],
              })),
            },
            { key: 'first_registration', label: 'Erstzulassung', kind: 'date' },
            {
              key: 'last_uvv',
              label: 'Letzte bestandene UVV',
              kind: 'date',
              hint: 'UVV gilt 12 Monate — daraus errechnet sich die Fälligkeit',
            },
          ]}
          initial={
            editing === 'new'
              ? { type: 'pkw' }
              : {
                  plate: editing.plate,
                  name: editing.name ?? '',
                  type: editing.type,
                  first_registration: editing.first_registration ?? '',
                  last_uvv: editing.last_uvv ?? '',
                }
          }
        />
      )}

      {inspecting && (
        <FormDialog
          title={`UVV-Prüfung erfassen — ${inspecting.plate}`}
          submitLabel="Prüfung speichern"
          onClose={() => setInspecting(null)}
          onSave={onInspect}
          fields={[
            { key: 'date', label: 'Prüfdatum', kind: 'date', required: true },
            { key: 'inspector', label: 'Prüfer', required: true },
            {
              key: 'result',
              label: 'Ergebnis',
              kind: 'select',
              required: true,
              options: (Object.keys(UVV_RESULT_LABEL) as UvvResult[]).map((r) => ({
                value: r,
                label: UVV_RESULT_LABEL[r],
              })),
            },
            { key: 'defects', label: 'Festgestellte Mängel', kind: 'textarea' },
            ...CHECK_ITEMS.map((item) => ({
              key: `chk_${item.id}`,
              label: item.label,
              kind: 'checkbox' as const,
            })),
          ]}
          initial={{
            date: toInputDate(new Date()),
            result: 'bestanden',
            ...Object.fromEntries(CHECK_ITEMS.map((item) => [`chk_${item.id}`, true])),
          }}
        />
      )}
    </>
  );
}
