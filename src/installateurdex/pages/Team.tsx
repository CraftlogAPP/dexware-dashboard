import { TeamPage } from '../../components/TeamPage';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { useInst } from '../context';

/** Echt: die gemeinsame Team-Seite aller Dashboards. Beispieldaten: nur die Liste. */
export function Team() {
  const { demo } = useInst();
  return demo ? <DemoTeam /> : <TeamPage />;
}

function DemoTeam() {
  const { data } = useInst();
  const state = useAsync(() => data.members(), [data]);
  return (
    <>
      <h1>Team</h1>
      <div className="info-box">
        Mit echtem Konto steht hier die Team-Verwaltung wie in allen Dashboards: Team-Code für neue Monteure, Mitglieder
        entfernen, Plätze laut Abo.
      </div>
      <LoadGuard state={state}>
        {(members) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>E-Mail</th>
                  <th>Rolle</th>
                  <th>Dabei seit</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membership_id}>
                    <td>{m.email}</td>
                    <td>{m.role === 'owner' ? <span className="badge live">Inhaber</span> : <span className="badge">Monteur</span>}</td>
                    <td className="muted">{fmtDate(m.joined_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadGuard>
    </>
  );
}
