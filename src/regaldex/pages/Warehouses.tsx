import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileUp } from 'lucide-react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { ExcelButton } from '../../components/ExcelButton';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtDateTime } from '../../lib/format';
import { PruefCtx } from '../../pruefen/context';
import { siteGate, siteGateText, zeigeGrenzFehler } from '../../pruefen/pro';
import { REGALDEX_VOR_ORT } from '../vorOrt';
import {
  fetchDamages,
  fetchInspectionMeta,
  fetchLatestInspections,
  fetchRacks,
  fetchWarehouses,
  type InspMeta,
} from '../api';
import { savePruefbuch } from '../exportLists';
import { lastInspectionByWarehouse } from '../labels';
import { WarehouseDialog } from '../dialogs';
import type { Damage, Warehouse } from '../types';

interface Data {
  warehouses: Warehouse[];
  lastByWh: Map<string, InspMeta>;
  openDamages: Damage[];
}

export function Warehouses() {
  const { client } = useAppAuth();
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null);
  // Gratis-Grenze wie in der App (1 aktives Lager, nicht aktive zählen nicht); Pro laut Server; unklar → letzter sicherer Stand, sonst „gleich nochmal“.
  const [gate, setGate] = useState(false);
  const [checking, setChecking] = useState(false);

  async function onAdd() {
    if (checking) return;
    setChecking(true);
    try {
      if ((await siteGate(client, REGALDEX_VOR_ORT)).allowed) setEditing('new');
      else setGate(true);
    } catch (e) {
      zeigeGrenzFehler(e);
    } finally {
      setChecking(false);
    }
  }

  const state = useAsync<Data>(async () => {
    const [warehouses, meta, openDamages] = await Promise.all([
      fetchWarehouses(client),
      fetchInspectionMeta(client),
      fetchDamages(client, { status: 'open' }),
    ]);
    return { warehouses, lastByWh: lastInspectionByWarehouse(meta), openDamages };
  }, [client]);

  const { data: org } = useOrg();
  // Import nur für den Inhaber (Server-Regel: Orte und Bestand legt nur er an) und nicht in „Vor Ort“ (Handy)
  const inVorOrt = useContext(PruefCtx) !== null;
  const canImport = org?.role === 'owner' && !inVorOrt;
  /** Prüfbuch-Übersicht als Excel — frisch und vollständig geladen (alle Orte, Bestand, letzte Inspektionen, offene Schäden). */
  async function exportExcel() {
    if (!org) throw new Error('Betrieb nicht geladen.');
    const [sites, units, inspections, openDefects] = await Promise.all([
      fetchWarehouses(client),
      fetchRacks(client),
      fetchLatestInspections(client),
      fetchDamages(client, { status: 'open' }),
    ]);
    await savePruefbuch({ org: org.org, sites, units, inspections, openDefects });
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Lager</h1>
        <div className="spacer" />
        {/* Knöpfe zusammen rechts (sonst verteilt section-head sie über die Breite) */}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <ExcelButton
            label="Prüfbuch (Excel)"
            onExport={exportExcel}
            title="Alle Lager und Regalzeilen als Excel-Datei: letzte Inspektion, nächste Experteninspektion fällig am, offene Schäden"
          />
          {canImport && (
            <Link className="btn ghost" to="import" title="Lager und ihre Regalzeilen aus einer Excel- oder CSV-Liste übernehmen — auch das Prüfbuch lässt sich wieder einlesen">
              <FileUp className="i" aria-hidden /> Lager importieren
            </Link>
          )}
          <button className="btn" onClick={() => void onAdd()} disabled={checking}>
            ＋ Lager anlegen
          </button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Lagerstandorte mit letzter Inspektion und offenen Schäden.
      </p>

      <LoadGuard state={state}>
        {({ warehouses, lastByWh, openDamages }) =>
          warehouses.length === 0 ? (
            <div className="card empty">Noch keine Lager angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lager</th>
                    <th>Adresse</th>
                    <th>Betreiber</th>
                    <th>Letzte Inspektion</th>
                    <th>Offene Schäden</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((w) => {
                    const last = lastByWh.get(w.id);
                    const open = openDamages.filter((d) => d.warehouse_id === w.id);
                    const red = open.some((d) => d.severity === 'red');
                    return (
                      <tr key={w.id}>
                        <td>
                          <Link to={w.id}>{w.name}</Link>
                        </td>
                        <td className="wrap muted">{w.address}</td>
                        <td className="wrap muted">{w.operator_name ?? '—'}</td>
                        <td>{last ? fmtDateTime(last.started_at) : '—'}</td>
                        <td>
                          {open.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <span className={`badge ${red ? 'red' : 'amber'}`}>
                              {open.length}
                              {red ? ' · Rot!' : ''}
                            </span>
                          )}
                        </td>
                        <td>
                          <StatusBadge active={w.active} />
                        </td>
                        <td>
                          <button className="btn ghost small" onClick={() => setEditing(w)}>
                            Bearbeiten
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </LoadGuard>

      {gate && (
        <Modal title="Mehr Lager mit Pro" onClose={() => setGate(false)} dirty={false}>
          <p>{siteGateText(REGALDEX_VOR_ORT)}</p>
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
        <WarehouseDialog
          warehouse={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            state.reload();
          }}
        />
      )}
    </>
  );
}
