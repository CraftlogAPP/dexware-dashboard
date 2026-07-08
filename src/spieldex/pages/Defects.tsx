import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { fetchDefects, fetchEquipment, fetchPlaygrounds } from '../api';
import { DefectStatusBadge, SeverityBadge } from '../badges';
import { equipmentNameMap, playgroundNameMap } from '../labels';
import type { Defect, DefectStatus } from '../types';

export function Defects() {
  const { client } = useAppAuth();
  const [playgroundId, setPlaygroundId] = useState('');
  const [status, setStatus] = useState<'' | DefectStatus>('open');

  // Stammdaten für Namens-Auflösung — einmal laden, nicht pro Filterwechsel.
  const baseState = useAsync(async () => {
    const [playgrounds, equipment] = await Promise.all([
      fetchPlaygrounds(client),
      fetchEquipment(client),
    ]);
    return { playgrounds, equipment };
  }, [client]);

  const defectsState = useAsync<Defect[]>(
    () =>
      fetchDefects(client, {
        playgroundId: playgroundId || undefined,
        status: status || undefined,
      }),
    [client, playgroundId, status],
  );

  return (
    <>
      <h1>Mängel</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Gemeldete Mängel mit Schweregrad und Behebungs-Vermerk — Behebung läuft
        additiv über die App, nichts wird gelöscht.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Spielplatz
            <select
              value={playgroundId}
              onChange={(e) => setPlaygroundId(e.target.value)}
            >
              <option value="">Alle Spielplätze</option>
              {(baseState.data?.playgrounds ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 150, marginBottom: 0 }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | DefectStatus)}
            >
              <option value="open">Nur offene</option>
              <option value="resolved">Nur behobene</option>
              <option value="">Alle</option>
            </select>
          </label>
        </div>
      </div>

      <LoadGuard state={defectsState}>
        {(defects) => {
          const pgNames = playgroundNameMap(baseState.data?.playgrounds ?? []);
          const eqNames = equipmentNameMap(baseState.data?.equipment ?? []);
          return defects.length === 0 ? (
            <div className="card empty">Keine Mängel mit den gewählten Filtern. 👍</div>
          ) : (
            <>
              <p className="muted small">{defects.length} Mängel</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gemeldet</th>
                      <th>Spielplatz</th>
                      <th>Mangel</th>
                      <th>Ort / Gerät</th>
                      <th>Schweregrad</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {defects.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {fmtDateTime(d.created_at)}
                          {d.reporter_name && (
                            <div className="muted small">von {d.reporter_name}</div>
                          )}
                        </td>
                        <td className="wrap">
                          <Link to={`../spielplaetze/${d.playground_id}`}>
                            {pgNames.get(d.playground_id) ?? '—'}
                          </Link>
                        </td>
                        <td className="wrap">
                          {d.title}
                          {d.description && (
                            <div className="muted small">{d.description}</div>
                          )}
                          {d.equipment_blocked && (
                            <div>
                              <span className="badge red">Gerät gesperrt</span>
                            </div>
                          )}
                        </td>
                        <td className="muted">
                          {d.equipment_id
                            ? (eqNames.get(d.equipment_id) ?? 'Gerät')
                            : 'Fläche allgemein'}
                        </td>
                        <td>
                          <SeverityBadge severity={d.severity} />
                        </td>
                        <td>
                          <DefectStatusBadge status={d.status} />
                          {d.status === 'resolved' && (
                            <div className="muted small">
                              {fmtDateTime(d.resolved_at)}
                              {d.resolver_name ? ` · ${d.resolver_name}` : ''}
                              {d.resolution_note ? ` — ${d.resolution_note}` : ''}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
