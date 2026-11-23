import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileUp } from 'lucide-react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { ExcelButton } from '../../components/ExcelButton';
import { LoadGuard, useAsync } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtDate } from '../../lib/format';
import { fetchVehicles } from '../api';
import { DueBadge, dueLabel } from '../badges';
import { UvvDialog, VehicleDialog } from '../dialogs';
import { uvvDue } from '../due';
import { exportFleet } from '../exportActions';
import type { Vehicle, VehicleType } from '../types';
import { VEHICLE_TYPE_LABEL } from '../types';
import { GATE_TEXT, fleetGate } from '../vorOrt/backend';
import { FREE_LIMITS } from '../vorOrt/rows';
import { KfzCtx } from '../vorOrt/context';

export function Vehicles() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  // Import wie „Fahrzeug anlegen“ für jedes Mitglied — aber nicht in „Vor Ort“ (Handy): das ist Schreibtischarbeit
  const inVorOrt = useContext(KfzCtx) !== null;
  const [type, setType] = useState<'' | VehicleType>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [inspecting, setInspecting] = useState<Vehicle | null>(null);

  const state = useAsync<Vehicle[]>(() => fetchVehicles(client), [client]);
  // Gratis-Grenze wie in der App (1 Fahrzeug); Pro laut Server, im Zweifel erlaubt.
  const [gate, setGate] = useState(false);
  const [checking, setChecking] = useState(false);

  async function onAdd() {
    if (checking) return;
    setChecking(true);
    try {
      if ((await fleetGate(client, 'vehicle', FREE_LIMITS.vehicles)).allowed) setEditing('new');
      else setGate(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Fahrzeuge</h1>
        <div className="spacer" />
        {/* Knöpfe zusammen rechts (sonst verteilt section-head sie über die Breite) */}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <ExcelButton
            onExport={() => exportFleet(client, org?.org)}
            title="Ganzer Fuhrpark als Excel-Datei: Fahrzeuge und Fahrer mit Fristen, UVV- und Kontroll-Historie"
          />
          {!inVorOrt && (
            <Link className="btn ghost" to="import" title="Fahrzeuge aus einer Excel- oder CSV-Liste übernehmen — auch die Fuhrpark-Liste lässt sich wieder einlesen">
              <FileUp className="i" aria-hidden /> Fahrzeuge importieren
            </Link>
          )}
          <button className="btn" onClick={() => void onAdd()} disabled={checking}>
            ＋ Fahrzeug anlegen
          </button>
        </div>
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

      {gate && (
        <Modal title="Mehr Fahrzeuge mit Pro" onClose={() => setGate(false)} dirty={false}>
          <p>{GATE_TEXT.vehicle}</p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <Link className="btn ghost" to="../abo">
              Abo ansehen
            </Link>
            <button type="button" className="btn" onClick={() => setGate(false)}>
              Verstanden
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <VehicleDialog
          vehicle={editing}
          onClose={() => setEditing(null)}
          onSaved={() => state.reload()}
        />
      )}

      {inspecting && (
        <UvvDialog
          vehicle={inspecting}
          onClose={() => setInspecting(null)}
          onSaved={() => state.reload()}
        />
      )}
    </>
  );
}
