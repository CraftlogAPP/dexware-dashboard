import { useState } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchAssignments, fetchBriefings, fetchMembers } from '../api';
import { AssignmentBadge } from '../badges';
import { briefingTitleMap, isOverdue, nameMap } from '../labels';
import type { Assignment } from '../types';

type StatusFilter = '' | 'offen' | 'ueberfaellig' | 'erledigt';

export function Assignments() {
  const { client } = useAppAuth();
  const [memberId, setMemberId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('offen');

  // Stammdaten für Namens-Auflösung — einmal laden, nicht pro Filterwechsel.
  const baseState = useAsync(async () => {
    const [members, briefings] = await Promise.all([
      fetchMembers(client),
      fetchBriefings(client),
    ]);
    return { members, briefings };
  }, [client]);

  const asgState = useAsync<Assignment[]>(
    () => fetchAssignments(client, { memberId: memberId || undefined }),
    [client, memberId],
  );

  return (
    <>
      <h1>Zuweisungen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Welche Unterweisung welchem Mitarbeiter zugewiesen ist — mit Fälligkeit
        und Wiederholung.
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
          <label className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="offen">Offen (inkl. überfällig)</option>
              <option value="ueberfaellig">Nur überfällig</option>
              <option value="erledigt">Erledigt</option>
              <option value="">Alle</option>
            </select>
          </label>
        </div>
      </div>

      <LoadGuard state={asgState}>
        {(allAssignments) => {
          const memberNames = nameMap(baseState.data?.members ?? []);
          const briefingTitles = briefingTitleMap(baseState.data?.briefings ?? []);
          const assignments = allAssignments.filter((a) => {
            if (status === 'offen') return a.status !== 'erledigt';
            if (status === 'ueberfaellig') return isOverdue(a);
            if (status === 'erledigt') return a.status === 'erledigt';
            return true;
          });
          return assignments.length === 0 ? (
            <div className="card empty">
              Keine Zuweisungen mit den gewählten Filtern. 👍
            </div>
          ) : (
            <>
              <p className="muted small">{assignments.length} Zuweisungen</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mitarbeiter</th>
                      <th>Unterweisung</th>
                      <th>Fällig am</th>
                      <th>Wiederholung</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td>{memberNames.get(a.member_id) ?? '—'}</td>
                        <td className="wrap">
                          {briefingTitles.get(a.briefing_id) ?? '—'}
                        </td>
                        <td>{a.faellig_am ? fmtDate(a.faellig_am) : '—'}</td>
                        <td className="muted">{a.wiederholung}</td>
                        <td>
                          <AssignmentBadge assignment={a} />
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
