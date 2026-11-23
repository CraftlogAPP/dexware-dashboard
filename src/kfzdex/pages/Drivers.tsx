import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileUp } from 'lucide-react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { ExcelButton } from '../../components/ExcelButton';
import { LoadGuard, useAsync } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtDate } from '../../lib/format';
import { fetchDrivers } from '../api';
import { DueBadge, dueLabel } from '../badges';
import { DriverDialog, LicenseCheckDialog } from '../dialogs';
import { licenseDue } from '../due';
import { exportFleet } from '../exportActions';
import type { Driver } from '../types';
import { GATE_TEXT, fleetGate } from '../vorOrt/backend';
import { FREE_LIMITS } from '../vorOrt/rows';
import { KfzCtx } from '../vorOrt/context';

export function Drivers() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  // Import wie „Fahrer anlegen“ für jedes Mitglied — aber nicht in „Vor Ort“ (Handy): das ist Schreibtischarbeit
  const inVorOrt = useContext(KfzCtx) !== null;
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Driver | 'new' | null>(null);
  const [checking, setChecking] = useState<Driver | null>(null);

  const state = useAsync<Driver[]>(() => fetchDrivers(client), [client]);
  // Gratis-Grenze wie in der App (2 Fahrer, inaktive zählen mit); Pro laut Server, im Zweifel erlaubt.
  const [gate, setGate] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);

  async function onAdd() {
    if (gateBusy) return;
    setGateBusy(true);
    try {
      if ((await fleetGate(client, 'driver', FREE_LIMITS.drivers)).allowed) setEditing('new');
      else setGate(true);
    } finally {
      setGateBusy(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Fahrer</h1>
        <div className="spacer" />
        {/* Knöpfe zusammen rechts (sonst verteilt section-head sie über die Breite) */}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {/* dieselbe Datei wie auf der Fahrzeuge-Seite (ein Fuhrpark, ein Knopf) */}
          <ExcelButton
            onExport={() => exportFleet(client, org?.org)}
            title="Ganzer Fuhrpark als Excel-Datei: Fahrzeuge und Fahrer mit Fristen, UVV- und Kontroll-Historie"
          />
          {!inVorOrt && (
            <Link className="btn ghost" to="import" title="Fahrer aus einer Excel- oder CSV-Liste übernehmen">
              <FileUp className="i" aria-hidden /> Fahrer importieren
            </Link>
          )}
          <button className="btn" onClick={() => void onAdd()} disabled={gateBusy}>
            ＋ Fahrer anlegen
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Fahrer suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <LoadGuard state={state}>
        {(drivers) => {
          const q = search.trim().toLowerCase();
          const filtered = drivers.filter(
            (d) => !q || d.name.toLowerCase().includes(q),
          );

          if (filtered.length === 0) {
            return (
              <div className="card empty">
                {drivers.length === 0
                  ? 'Noch keine Fahrer angelegt. Lege sie in der KfzDex-App an.'
                  : 'Keine Fahrer für diese Suche.'}
              </div>
            );
          }

          return (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Führerscheinklassen</th>
                    <th>Intervall</th>
                    <th>Letzte Kontrolle</th>
                    <th>Fällig</th>
                    <th>Kontrolle</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const due = licenseDue(d);
                    return (
                      <tr key={d.id}>
                        <td>
                          <Link to={d.id}>{d.name}</Link>
                        </td>
                        <td className="muted">{d.license_classes ?? '—'}</td>
                        <td className="muted">alle {d.check_interval_months} Monate</td>
                        <td className="muted">{fmtDate(d.last_check)}</td>
                        <td className="muted">{dueLabel(due)}</td>
                        <td>
                          {/* Fällige Kontrolle nur für aktive Fahrer relevant. */}
                          {d.active ? <DueBadge status={due.status} /> : '—'}
                        </td>
                        <td>
                          {d.active ? (
                            <span className="badge green">aktiv</span>
                          ) : (
                            <span className="badge">inaktiv</span>
                          )}
                        </td>
                        <td>
                          <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                            <button className="btn ghost small" onClick={() => setEditing(d)}>
                              Bearbeiten
                            </button>
                            <button className="btn ghost small" onClick={() => setChecking(d)}>
                              Kontrolle erfassen
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
        <Modal title="Mehr Fahrer mit Pro" onClose={() => setGate(false)} dirty={false}>
          <p>{GATE_TEXT.driver}</p>
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
        <DriverDialog
          driver={editing}
          onClose={() => setEditing(null)}
          onSaved={() => state.reload()}
        />
      )}

      {checking && (
        <LicenseCheckDialog
          driver={checking}
          onClose={() => setChecking(null)}
          onSaved={() => state.reload()}
        />
      )}
    </>
  );
}
