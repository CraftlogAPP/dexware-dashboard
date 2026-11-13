import { useState } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchKfzTeamCode, fetchOrgMembers, renewKfzTeamCode, type KfzTeamCode } from '../api';
import type { OrgMember } from '../types';

/**
 * Eigene Team-Seite: KfzDex hat keine list_members/create_invite-RPCs wie die
 * anderen Dex-Apps, sondern EINEN dauerhaften Einladungscode je Betrieb.
 * Seit dem KfzDex-Nachtrag 13.11.2026 liegt er nicht mehr auf der org-Zeile (die jedes Mitglied liest), sondern kommt
 * nur über team_code() an Inhaber und Verwalter; Mitglieder sehen ihn nicht. Ohne Nachtrag alles wie bisher.
 * Verwalter ernennt der Inhaber in der App. E-Mail-Adressen der Mitglieder sind clientseitig nicht auflösbar
 * (org_member trägt nur user_id) — angezeigt werden Rolle und Beitrittsdatum.
 */
export function Team() {
  const { client, session } = useAppAuth();
  const { data: orgCtx } = useOrg();
  const isOwner = orgCtx?.role === 'owner';

  const state = useAsync<OrgMember[]>(() => fetchOrgMembers(client), [client]);
  const code = useAsync<KfzTeamCode>(() => fetchKfzTeamCode(client, isOwner), [client, isOwner]);
  const [renewBusy, setRenewBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onRenew() {
    if (
      !window.confirm(
        'Neuen Einladungscode erzeugen? Der bisherige Code wird sofort ungültig. Wer schon im Team ist, bleibt drin.',
      )
    )
      return;
    setRenewBusy(true);
    try {
      await renewKfzTeamCode(client);
      setCopied(false);
      code.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setRenewBusy(false);
    }
  }

  const teamCode = code.data?.code ?? null;

  return (
    <>
      <h1>Team</h1>
      {orgCtx && (
        <p className="muted" style={{ marginTop: -6 }}>
          {orgCtx.org.name} — alle Mitglieder sehen und pflegen denselben Fuhrpark.
        </p>
      )}

      {teamCode && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="kpi-label">Einladungscode</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>{teamCode}</div>
            <button
              className="btn ghost small"
              onClick={() => {
                void navigator.clipboard?.writeText(teamCode).then(() => setCopied(true), () => {});
              }}
            >
              {copied ? 'Kopiert ✓' : 'Kopieren'}
            </button>
            {code.data?.canManage && (
              <button className="btn ghost small" onClick={() => void onRenew()} disabled={renewBusy}>
                {renewBusy ? 'Erzeuge …' : 'Neuen Code erzeugen'}
              </button>
            )}
          </div>
          <div className="muted small">
            Neue Mitglieder treten in der KfzDex-App mit diesem Code bei (gilt, bis er erneuert wird).
          </div>
        </div>
      )}
      {!code.loading && code.data && !code.data.canManage && (
        <p className="muted small" style={{ marginBottom: 16 }}>
          Den Einladungscode sehen der Inhaber und die Verwalter, die er ernennt.
        </p>
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
                        ) : m.is_admin ? (
                          <span className="badge">Verwalter</span>
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
