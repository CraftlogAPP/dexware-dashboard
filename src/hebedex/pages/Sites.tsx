import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { ExcelButton } from '../../components/ExcelButton';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDefects,
  fetchItems,
  fetchInspectionMeta,
  fetchLatestInspections,
  fetchSites,
  type InspMeta,
} from '../api';
import { savePruefbuch } from '../exportLists';
import { lastInspectionBySite } from '../labels';
import { SiteDialog } from '../dialogs';
import type { Defect, LiftingItem, Site } from '../types';

interface Data {
  sites: Site[];
  items: LiftingItem[];
  lastBySite: Map<string, InspMeta>;
  openDefects: Defect[];
}

export function Sites() {
  const { client } = useAppAuth();
  const [editing, setEditing] = useState<Site | 'new' | null>(null);

  const state = useAsync<Data>(async () => {
    const [sites, items, meta, openDefects] = await Promise.all([
      fetchSites(client),
      fetchItems(client),
      fetchInspectionMeta(client),
      fetchDefects(client, { status: 'open' }),
    ]);
    return { sites, items, lastBySite: lastInspectionBySite(meta), openDefects };
  }, [client]);

  const { data: org } = useOrg();
  /** Prüfbuch-Übersicht als Excel — frisch und vollständig geladen (ganzer Bestand, letzte Prüfungen, offene Mängel). */
  async function exportExcel() {
    if (!org) throw new Error('Betrieb nicht geladen.');
    const [sites, units, inspections, openDefects] = await Promise.all([
      fetchSites(client),
      fetchItems(client),
      fetchLatestInspections(client),
      fetchDefects(client, { status: 'open' }),
    ]);
    await savePruefbuch({ org: org.org, sites, units, inspections, openDefects });
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Standorte</h1>
        <div className="spacer" />
        {/* Knöpfe zusammen rechts (sonst verteilt section-head sie über die Breite) */}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <ExcelButton
            label="Prüfbuch (Excel)"
            onExport={exportExcel}
            title="Alle Teile als Excel-Datei: letzte Prüfung, wiederkehrende Prüfung und Rissprüfung fällig am, offene Mängel"
          />
          <button className="btn" onClick={() => setEditing('new')}>
            ＋ Standort anlegen
          </button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Standorte mit Bestand an Anschlag-, Lastaufnahme- und Zurrmitteln, letzter Prüfung und offenen Mängeln.
      </p>

      <LoadGuard state={state}>
        {({ sites, items, lastBySite, openDefects }) =>
          sites.length === 0 ? (
            <div className="card empty">Noch keine Standorte angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Standort</th>
                    <th>Adresse</th>
                    <th>Betreiber</th>
                    <th>Teil</th>
                    <th>Letzte Prüfung</th>
                    <th>Offene Mängel</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => {
                    const last = lastBySite.get(s.id);
                    const open = openDefects.filter((d) => d.site_id === s.id);
                    const red = open.some((d) => d.severity === 'red');
                    const itemCount = items.filter(
                      (e) => e.site_id === s.id && !e.retired,
                    ).length;
                    return (
                      <tr key={s.id}>
                        <td>
                          <Link to={s.id}>{s.name}</Link>
                        </td>
                        <td className="wrap muted">{s.address}</td>
                        <td className="wrap muted">{s.operator_name ?? '—'}</td>
                        <td>{itemCount}</td>
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
