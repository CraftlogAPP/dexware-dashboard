import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDamages,
  fetchInspectionMeta,
  fetchScaffolds,
  fetchSites,
  type InspMeta,
} from '../api';
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

  const state = useAsync<Data>(async () => {
    const [sites, scaffolds, meta, openDamages] = await Promise.all([
      fetchSites(client),
      fetchScaffolds(client),
      fetchInspectionMeta(client, { limit: 2000 }),
      fetchDamages(client, { status: 'open' }),
    ]);
    return { sites, scaffolds, lastBySite: lastInspectionBySite(meta), openDamages };
  }, [client]);

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Baustellen</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Baustelle anlegen
        </button>
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
