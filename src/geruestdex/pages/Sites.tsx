import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { ExcelButton } from '../../components/ExcelButton';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtDateTime } from '../../lib/format';
import { siteGate, siteGateText } from '../../pruefen/pro';
import { GERUESTDEX_VOR_ORT } from '../vorOrt';
import {
  fetchDamages,
  fetchInspectionMeta,
  fetchLatestInspections,
  fetchScaffolds,
  fetchSites,
  type InspMeta,
} from '../api';
import { savePruefbuch } from '../exportLists';
import { lastInspectionBySite } from '../labels';
import { SiteDialog } from '../dialogs';
import type { Damage, Scaffold, Site } from '../types';

interface Data {
  sites: Site[];
  scaffolds: Scaffold[];
  lastBySite: Map<string, InspMeta>;
  openDamages: Damage[];
}

export function Sites() {
  const { client } = useAppAuth();
  const [editing, setEditing] = useState<Site | 'new' | null>(null);
  // Gratis-Grenze wie in der App (1 aktive Baustelle, nicht aktive zählen nicht); Pro laut Server, im Zweifel erlaubt.
  const [gate, setGate] = useState(false);
  const [checking, setChecking] = useState(false);

  async function onAdd() {
    if (checking) return;
    setChecking(true);
    try {
      if ((await siteGate(client, GERUESTDEX_VOR_ORT)).allowed) setEditing('new');
      else setGate(true);
    } finally {
      setChecking(false);
    }
  }

  const state = useAsync<Data>(async () => {
    const [sites, scaffolds, meta, openDamages] = await Promise.all([
      fetchSites(client),
      fetchScaffolds(client),
      fetchInspectionMeta(client),
      fetchDamages(client, { status: 'open' }),
    ]);
    return { sites, scaffolds, lastBySite: lastInspectionBySite(meta), openDamages };
  }, [client]);

  const { data: org } = useOrg();
  /** Prüfbuch-Übersicht als Excel — frisch und vollständig geladen (alle Orte, Bestand, letzte Prüfungen, offene Mängel). */
  async function exportExcel() {
    if (!org) throw new Error('Betrieb nicht geladen.');
    const [sites, units, inspections, openDefects] = await Promise.all([
      fetchSites(client),
      fetchScaffolds(client),
      fetchLatestInspections(client),
      fetchDamages(client, { status: 'open' }),
    ]);
    await savePruefbuch({ org: org.org, sites, units, inspections, openDefects });
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Baustellen</h1>
        <div className="spacer" />
        {/* Knöpfe zusammen rechts (sonst verteilt section-head sie über die Breite) */}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <ExcelButton
            label="Prüfbuch (Excel)"
            onExport={exportExcel}
            title="Alle Baustellen und Gerüste als Excel-Datei: letzte Prüfung, nächste Prüfung (befähigte Person) fällig am, offene Mängel"
          />
          <button className="btn" onClick={() => void onAdd()} disabled={checking}>
            ＋ Baustelle anlegen
          </button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Baustellen mit Gerüst-Bestand, letzter Prüfung und offenen Mängeln.
      </p>

      <LoadGuard state={state}>
        {({ sites, scaffolds, lastBySite, openDamages }) =>
          sites.length === 0 ? (
            <div className="card empty">Noch keine Baustellen angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Baustelle</th>
                    <th>Adresse</th>
                    <th>Auftraggeber</th>
                    <th>Gerüste</th>
                    <th>Letzte Prüfung</th>
                    <th>Offene Mängel</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => {
                    const last = lastBySite.get(s.id);
                    const open = openDamages.filter((d) => d.site_id === s.id);
                    const red = open.some((d) => d.severity === 'red');
                    const scaffoldCount = scaffolds.filter(
                      (sc) => sc.site_id === s.id && !sc.retired,
                    ).length;
                    return (
                      <tr key={s.id}>
                        <td>
                          <Link to={s.id}>{s.name}</Link>
                        </td>
                        <td className="wrap muted">{s.address}</td>
                        <td className="wrap muted">{s.operator_name ?? '—'}</td>
                        <td>{scaffoldCount}</td>
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
                          <StatusBadge active={s.active} />
                        </td>
                        <td>
                          <button
                            className="btn ghost small"
                            onClick={() => setEditing(s)}
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
          )
        }
      </LoadGuard>

      {gate && (
        <Modal title="Mehr Baustellen mit Pro" onClose={() => setGate(false)} dirty={false}>
          <p>{siteGateText(GERUESTDEX_VOR_ORT)}</p>
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
        <SiteDialog
          site={editing}
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
