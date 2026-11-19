import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { Modal } from '../../components/form';
import { fmtDateTime } from '../../lib/format';
import { siteGate, siteGateText } from '../../pruefen/pro';
import { SPIELDEX_VOR_ORT } from '../vorOrt';
import {
  fetchDefects,
  fetchInspectionMeta,
  fetchPlaygrounds,
  type InspMeta,
} from '../api';
import { lastInspectionByPlayground } from '../labels';
import { PlaygroundDialog } from '../dialogs';
import type { Defect, Playground } from '../types';

interface Data {
  playgrounds: Playground[];
  lastByPg: Map<string, InspMeta>;
  openDefects: Defect[];
}

export function Playgrounds() {
  const { client } = useAppAuth();
  const [editing, setEditing] = useState<Playground | 'new' | null>(null);
  // Gratis-Grenze wie in der App (1 aktiver Spielplatz, nicht aktive zählen nicht); Pro laut Server, im Zweifel erlaubt.
  const [gate, setGate] = useState(false);
  const [checking, setChecking] = useState(false);

  async function onAdd() {
    if (checking) return;
    setChecking(true);
    try {
      if ((await siteGate(client, SPIELDEX_VOR_ORT)).allowed) setEditing('new');
      else setGate(true);
    } finally {
      setChecking(false);
    }
  }

  const state = useAsync<Data>(async () => {
    const [playgrounds, meta, openDefects] = await Promise.all([
      fetchPlaygrounds(client),
      fetchInspectionMeta(client),
      fetchDefects(client, { status: 'open' }),
    ]);
    return { playgrounds, lastByPg: lastInspectionByPlayground(meta), openDefects };
  }, [client]);

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Spielplätze</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => void onAdd()} disabled={checking}>
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

      {gate && (
        <Modal title="Mehr Spielplätze mit Pro" onClose={() => setGate(false)} dirty={false}>
          <p>{siteGateText(SPIELDEX_VOR_ORT)}</p>
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
        <PlaygroundDialog
          playground={editing}
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
