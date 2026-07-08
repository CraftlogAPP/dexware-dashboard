import { useState } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { fetchBriefings, fetchCompletions, fetchMembers } from '../api';
import { CheckBadge } from '../badges';
import { briefingTitleMap, nameMap } from '../labels';
import type { Completion } from '../types';

export function Completions() {
  const { client } = useAppAuth();
  const [memberId, setMemberId] = useState('');

  // Stammdaten für Namens-Auflösung — einmal laden, nicht pro Filterwechsel.
  const baseState = useAsync(async () => {
    const [members, briefings] = await Promise.all([
      fetchMembers(client),
      fetchBriefings(client),
    ]);
    return { members, briefings };
  }, [client]);

  const compState = useAsync<Completion[]>(
    () => fetchCompletions(client, { memberId: memberId || undefined }),
    [client, memberId],
  );

  return (
    <>
      <h1>Nachweise</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Prüffeste Unterweisungs-Nachweise (append-only) — mit Verständnis-Check,
        Klarname und Geräteinfo. Die Unterschrift liegt sicher im Speicher der App.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Mitarbeiter
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">Alle Mitarbeiter</option>
              {(baseState.data?.members ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <LoadGuard state={compState}>
        {(completions) => {
          const memberNames = nameMap(baseState.data?.members ?? []);
          const briefingTitles = briefingTitleMap(baseState.data?.briefings ?? []);
          return completions.length === 0 ? (
            <div className="card empty">Noch keine Nachweise vorhanden.</div>
          ) : (
            <>
              <p className="muted small">{completions.length} Nachweise</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Abgeschlossen</th>
                      <th>Mitarbeiter</th>
                      <th>Unterweisung</th>
                      <th>Verständnis-Check</th>
                      <th>Unterschrieben als</th>
                      <th>Gerät</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completions.map((c) => (
                      <tr key={c.id}>
                        <td>{fmtDateTime(c.abgeschlossen_am)}</td>
                        <td>
                          {(c.member_id ? memberNames.get(c.member_id) : null) ?? '—'}
                        </td>
                        <td className="wrap">
                          {(c.briefing_id ? briefingTitles.get(c.briefing_id) : null) ??
                            '—'}
                          {c.briefing_version != null && (
                            <span className="muted small"> · v{c.briefing_version}</span>
                          )}
                        </td>
                        <td>
                          <CheckBadge passed={c.check_passed} />
                          {c.check_score != null && (
                            <span className="muted small"> {c.check_score} Punkte</span>
                          )}
                        </td>
                        <td className="muted">{c.signed_name ?? '—'}</td>
                        <td className="muted small wrap">{c.device_info ?? '—'}</td>
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
