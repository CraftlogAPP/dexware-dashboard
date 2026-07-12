import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDefects,
  fetchGates,
  fetchInspectionMeta,
  fetchSites,
  type InspMeta,
} from '../api';
import { lastInspectionBySite } from '../labels';
import { SiteDialog } from '../dialogs';
import type { Defect, Gate, Site } from '../types';

interface Data {
  sites: Site[];
  gates: Gate[];
  lastBySite: Map<string, InspMeta>;
  openDefects: Defect[];
}

export function Sites() {
  const { client } = useAppAuth();
  const [editing, setEditing] = useState<Site | 'new' | null>(null);

  const state = useAsync<Data>(async () => {
    const [sites, gates, meta, openDefects] = await Promise.all([
      fetchSites(client),
      fetchGates(client),
      fetchInspectionMeta(client, { limit: 2000 }),
      fetchDefects(client, { status: 'open' }),
    ]);
    return { sites, gates, lastBySite: lastInspectionBySite(meta), openDefects };
  }, [client]);

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Objekte</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Objekt anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Objekte mit Tor-Bestand, letzter Prüfung und offenen Mängeln.
      </p>

      <LoadGuard state={state}>
        {({ sites, gates, lastBySite, openDefects }) =>
          sites.length === 0 ? (
            <div className="card empty">Noch keine Objekte angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Objekt</th>
                    <th>Adresse</th>
                    <th>Betreiber</th>
                    <th>Tore</th>
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
                    const gateCount = gates.filter(
                      (e) => e.site_id === s.id && !e.retired,
                    ).length;
                    return (
                      <tr key={s.id}>
                        <td>
                          <Link to={s.id}>{s.name}</Link>
                        </td>
                        <td className="wrap muted">{s.address}</td>
                        <td className="wrap muted">{s.operator_name ?? '—'}</td>
                        <td>{gateCount}</td>
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
