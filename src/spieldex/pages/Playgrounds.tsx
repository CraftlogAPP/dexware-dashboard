import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime } from '../../lib/format';
import {
  fetchDefects,
  fetchInspectionMeta,
  fetchPlaygrounds,
  savePlayground,
  type InspMeta,
} from '../api';
import { lastInspectionByPlayground } from '../labels';
import type { Defect, Playground } from '../types';

interface Data {
  playgrounds: Playground[];
  lastByPg: Map<string, InspMeta>;
  openDefects: Defect[];
}

export function Playgrounds() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editing, setEditing] = useState<Playground | 'new' | null>(null);

  const state = useAsync<Data>(async () => {
    const [playgrounds, meta, openDefects] = await Promise.all([
      fetchPlaygrounds(client),
      fetchInspectionMeta(client, { limit: 2000 }),
      fetchDefects(client, { status: 'open' }),
    ]);
    return { playgrounds, lastByPg: lastInspectionByPlayground(meta), openDefects };
  }, [client]);

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    await savePlayground(
      client,
      org.org.id,
      {
        name: s(v.name),
        address: s(v.address),
        operator_name: orNull(v.operator_name),
        operator_contact: orNull(v.operator_contact),
        notes: orNull(v.notes),
        active: v.active === true,
      },
      editing === 'new' ? undefined : (editing ?? undefined),
    );
    state.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Spielplätze</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Spielplatz anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Spielplätze mit letzter Kontrolle und offenen Mängeln.
      </p>

      <LoadGuard state={state}>
        {({ playgrounds, lastByPg, openDefects }) =>
          playgrounds.length === 0 ? (
            <div className="card empty">Noch keine Spielplätze angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Spielplatz</th>
                    <th>Adresse</th>
                    <th>Betreiber</th>
                    <th>Letzte Kontrolle</th>
                    <th>Offene Mängel</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {playgrounds.map((p) => {
                    const last = lastByPg.get(p.id);
                    const open = openDefects.filter((d) => d.playground_id === p.id);
                    const danger = open.some((d) => d.severity === 'danger');
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link to={p.id}>{p.name}</Link>
                        </td>
                        <td className="wrap muted">{p.address}</td>
                        <td className="wrap muted">{p.operator_name ?? '—'}</td>
                        <td>{last ? fmtDateTime(last.started_at) : '—'}</td>
                        <td>
                          {open.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <span className={`badge ${danger ? 'red' : 'amber'}`}>
                              {open.length}
                              {danger ? ' · Gefahr!' : ''}
                            </span>
                          )}
                        </td>
                        <td>
                          <StatusBadge active={p.active} />
                        </td>
                        <td>
                          <button className="btn ghost small" onClick={() => setEditing(p)}>
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
        <FormDialog
          title={editing === 'new' ? 'Spielplatz anlegen' : `${editing.name} bearbeiten`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'name', label: 'Name', required: true },
            { key: 'address', label: 'Adresse', required: true },
            { key: 'operator_name', label: 'Betreiber' },
            { key: 'operator_contact', label: 'Betreiber-Kontakt' },
            { key: 'notes', label: 'Notizen', kind: 'textarea' },
            { key: 'active', label: 'Aktiv (wird kontrolliert)', kind: 'checkbox' },
          ]}
          initial={
            editing === 'new'
              ? { active: true }
              : {
                  name: editing.name,
                  address: editing.address,
                  operator_name: editing.operator_name ?? '',
                  operator_contact: editing.operator_contact ?? '',
                  notes: editing.notes ?? '',
                  active: editing.active,
                }
          }
        />
      )}
    </>
  );
}
