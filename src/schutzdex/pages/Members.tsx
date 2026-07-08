import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { fetchAssignments, fetchCompletions, fetchMembers } from '../api';
import { isOverdue } from '../labels';
import type { Assignment, Completion, Member } from '../types';

interface Data {
  members: Member[];
  assignments: Assignment[];
  completions: Completion[];
}

export function Members() {
  const { client } = useAppAuth();

  const state = useAsync<Data>(async () => {
    const [members, assignments, completions] = await Promise.all([
      fetchMembers(client),
      fetchAssignments(client),
      fetchCompletions(client),
    ]);
    return { members, assignments, completions };
  }, [client]);

  return (
    <>
      <h1>Mitarbeiter</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Mitarbeiter sind Datensätze im Betrieb (keine eigenen Konten) — sie
        unterschreiben in der App auf dem Gerät des Inhabers.
      </p>

      <LoadGuard state={state}>
        {({ members, assignments, completions }) =>
          members.length === 0 ? (
            <div className="card empty">Noch keine Mitarbeiter angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Tätigkeit</th>
                    <th>Eintritt</th>
                    <th>Offene Zuweisungen</th>
                    <th>Letzter Nachweis</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const open = assignments.filter(
                      (a) => a.member_id === m.id && a.status !== 'erledigt',
                    );
                    const overdueCount = open.filter(isOverdue).length;
                    const last = completions.find((c) => c.member_id === m.id);
                    return (
                      <tr key={m.id}>
                        <td>
                          {m.name}
                          {m.email && <div className="muted small">{m.email}</div>}
                        </td>
                        <td className="muted">{m.taetigkeit ?? '—'}</td>
                        <td className="muted">
                          {m.eintritt_am ? fmtDate(m.eintritt_am) : '—'}
                        </td>
                        <td>
                          {open.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <span
                              className={`badge ${overdueCount > 0 ? 'red' : 'amber'}`}
                            >
                              {open.length}
                              {overdueCount > 0 ? ` · ${overdueCount} überfällig` : ''}
                            </span>
                          )}
                        </td>
                        <td className="muted">
                          {last ? fmtDateTime(last.abgeschlossen_am) : '—'}
                        </td>
                        <td>
                          <StatusBadge active={m.aktiv} />
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
    </>
  );
}
