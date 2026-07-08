import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchOrgMembers } from '../api';
import type { OrgMember } from '../types';

/**
 * Eigene Team-Seite: KfzDex hat keine list_members/create_invite-RPCs wie die
 * anderen Dex-Apps, sondern einen permanenten Beitrittscode auf der org-Zeile.
 * E-Mail-Adressen der Mitglieder sind clientseitig nicht auflösbar (org_member
 * trägt nur user_id) — angezeigt werden Rolle und Beitrittsdatum.
 */
export function Team() {
  const { client, session } = useAppAuth();
  const { data: orgCtx } = useOrg();

  const state = useAsync<OrgMember[]>(() => fetchOrgMembers(client), [client]);

  const inviteCode = (orgCtx?.org as { invite_code?: string } | undefined)
    ?.invite_code;

  return (
    <>
      <h1>Team</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} — alle Mitglieder sehen und pflegen denselben Fuhrpark.
        </p>
      )}

      {inviteCode && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="kpi-label">Einladungscode</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>
            {inviteCode}
          </div>
          <div className="muted small">
            Neue Mitglieder treten in der KfzDex-App mit diesem Code bei
            (dauerhaft gültig).
          </div>
        </div>
      )}

      <LoadGuard state={state}>
        {(members) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mitglied</th>
                  <th>Rolle</th>
                  <th>Beigetreten</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const me = m.user_id === session?.user.id;
                  return (
                    <tr key={m.id}>
                      <td>
                        {me ? (
                          <b>{session?.user.email} (du)</b>
                        ) : (
                          <span className="muted">
                            Mitglied · {m.user_id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td>
                        {m.role === 'owner' ? (
                          <span className="badge green">Inhaber</span>
                        ) : (
                          <span className="badge">Mitarbeiter</span>
                        )}
                      </td>
                      <td className="muted">{fmtDate(m.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </LoadGuard>
    </>
  );
}
