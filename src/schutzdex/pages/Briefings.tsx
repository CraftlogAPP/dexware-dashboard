import { useAppAuth } from '../../auth/AppAuthContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchAssignments, fetchBriefings } from '../api';
import type { Assignment, Briefing } from '../types';

interface Data {
  briefings: Briefing[];
  assignments: Assignment[];
}

export function Briefings() {
  const { client } = useAppAuth();

  const state = useAsync<Data>(async () => {
    const [briefings, assignments] = await Promise.all([
      fetchBriefings(client),
      fetchAssignments(client),
    ]);
    return { briefings, assignments };
  }, [client]);

  return (
    <>
      <h1>Unterweisungen</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Erstellte Unterweisungs-Themen mit Verständnis-Check — Inhalte werden in
        der App erstellt (KI-generiert oder manuell) und dort durchgeführt.
      </p>

      <LoadGuard state={state}>
        {({ briefings, assignments }) =>
          briefings.length === 0 ? (
            <div className="card empty">Noch keine Unterweisungen erstellt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Titel</th>
                    <th>Thema</th>
                    <th>Tätigkeit</th>
                    <th>Version</th>
                    <th>Quelle</th>
                    <th>Zuweisungen</th>
                    <th>Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {briefings.map((b) => {
                    const assigned = assignments.filter(
                      (a) => a.briefing_id === b.id,
                    );
                    const openCount = assigned.filter(
                      (a) => a.status !== 'erledigt',
                    ).length;
                    return (
                      <tr key={b.id}>
                        <td className="wrap">{b.titel}</td>
                        <td className="wrap muted">{b.thema ?? '—'}</td>
                        <td className="muted">{b.taetigkeit ?? '—'}</td>
                        <td className="muted">v{b.version}</td>
                        <td>
                          {b.generiert_von === 'ki' ? (
                            <span className="badge external">KI</span>
                          ) : (
                            <span className="badge">manuell</span>
                          )}
                        </td>
                        <td>
                          {assigned.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <>
                              {assigned.length}
                              {openCount > 0 && (
                                <span className="muted small"> · {openCount} offen</span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="muted">{fmtDate(b.created_at)}</td>
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
