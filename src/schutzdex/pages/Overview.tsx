import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../lib/format';
import {
  fetchAssignments,
  fetchBriefings,
  fetchCompletions,
  fetchMembers,
} from '../api';
import { CheckBadge } from '../badges';
import { briefingTitleMap, isOverdue, nameMap } from '../labels';
import type { Assignment, Briefing, Completion, Member } from '../types';

interface OverviewData {
  members: Member[];
  briefings: Briefing[];
  assignments: Assignment[];
  completions: Completion[];
}

export function Overview() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OverviewData>(async () => {
    const [members, briefings, assignments, completions] = await Promise.all([
      fetchMembers(client),
      fetchBriefings(client),
      fetchAssignments(client),
      fetchCompletions(client, { limit: 500 }),
    ]);
    return { members, briefings, assignments, completions };
  }, [client]);

  return (
    <>
      <h1>Übersicht</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} · Unterweisungspflichten im Blick — live aus der
          SchutzDex-App.
        </p>
      )}

      <LoadGuard state={state}>
        {({ members, briefings, assignments, completions }) => {
          const activeMembers = members.filter((m) => m.aktiv);
          const memberNames = nameMap(members);
          const briefingTitles = briefingTitleMap(briefings);
          const open = assignments.filter((a) => a.status !== 'erledigt');
          const overdue = open.filter(isOverdue);
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const comp30 = completions.filter(
            (c) => now - new Date(c.abgeschlossen_am).getTime() <= 30 * dayMs,
          );
          const recent = completions.slice(0, 10);

          return (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">Aktive Mitarbeiter</div>
                  <div className="kpi-value">{activeMembers.length}</div>
                  <div className="kpi-sub">{members.length} insgesamt</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Unterweisungen</div>
                  <div className="kpi-value">{briefings.length}</div>
                  <div className="kpi-sub">erstellte Themen</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Offene Zuweisungen</div>
                  <div className="kpi-value">{open.length}</div>
                  <div className="kpi-sub">
                    {overdue.length > 0
                      ? `davon ${overdue.length} überfällig!`
                      : 'keine überfällig'}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Nachweise 30 Tage</div>
                  <div className="kpi-value">{comp30.length}</div>
                  <div className="kpi-sub">unterschriebene Bestätigungen</div>
                </div>
              </div>

              {overdue.length > 0 && (
                <>
                  <div className="section-head">
                    <h2>Überfällige Unterweisungen</h2>
                    <Link to="zuweisungen" className="small">
                      Alle Zuweisungen →
                    </Link>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Mitarbeiter</th>
                          <th>Unterweisung</th>
                          <th>Fällig am</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overdue.slice(0, 8).map((a) => (
                          <tr key={a.id}>
                            <td>{memberNames.get(a.member_id) ?? '—'}</td>
                            <td className="wrap">
                              {briefingTitles.get(a.briefing_id) ?? '—'}
                            </td>
                            <td>
                              {a.faellig_am ? fmtDate(a.faellig_am) : '—'}{' '}
                              <span className="badge red">überfällig</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="section-head">
                <h2>Letzte Nachweise</h2>
                <Link to="nachweise" className="small">
                  Alle Nachweise →
                </Link>
              </div>
              {recent.length === 0 ? (
                <div className="card empty">
                  Noch keine Nachweise. Sobald Mitarbeiter in der App unterschreiben,
                  erscheint hier alles live.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Abgeschlossen</th>
                        <th>Mitarbeiter</th>
                        <th>Unterweisung</th>
                        <th>Verständnis-Check</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((c) => (
                        <tr key={c.id}>
                          <td>{fmtDateTime(c.abgeschlossen_am)}</td>
                          <td>
                            {(c.member_id
                              ? memberNames.get(c.member_id)
                              : null) ??
                              c.signed_name ??
                              '—'}
                          </td>
                          <td className="wrap">
                            {(c.briefing_id
                              ? briefingTitles.get(c.briefing_id)
                              : null) ?? '—'}
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
