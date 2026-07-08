import { useState } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../OrgContext';
import { createInvite, fetchMembers } from '../api';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import type { Member } from '../types';

export function Team() {
  const { client } = useAppAuth();
  const { data: orgCtx } = useOrg();
  const isOwner = orgCtx?.role === 'owner';

  const state = useAsync<Member[]>(() => fetchMembers(client), [client]);

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onCreateInvite() {
    setInviteBusy(true);
    setInviteError(null);
    setCopied(false);
    try {
      setInviteCode(await createInvite(client));
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : String(e));
    } finally {
      setInviteBusy(false);
    }
  }

  async function onCopy() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
    } catch {
      // Clipboard nicht verfügbar (z. B. http) — Code steht sichtbar daneben.
    }
  }

  return (
    <>
      <h1>Team</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Inhaber verwalten den Betrieb, Mitarbeiter dokumentieren Einsätze in der App.
      </p>

      {isOwner && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-head" style={{ margin: 0 }}>
            <h2>Mitarbeiter einladen</h2>
          </div>
          <p className="muted small">
            Erzeuge einen Beitrittscode (7 Tage gültig, einmal einlösbar). Dein
            Mitarbeiter registriert sich in der WinterDex-App und gibt den Code dort
            unter „Team beitreten" ein.
          </p>
          {inviteError && <div className="error-box">{inviteError}</div>}
          <div className="row">
            <button className="btn" onClick={() => void onCreateInvite()} disabled={inviteBusy}>
              {inviteBusy ? 'Erzeuge Code …' : 'Neuen Beitrittscode erzeugen'}
            </button>
            {inviteCode && (
              <>
                <span className="badge live mono" style={{ fontSize: 16 }}>
                  {inviteCode}
                </span>
                <button className="btn ghost small" onClick={() => void onCopy()}>
                  {copied ? '✓ Kopiert' : 'Kopieren'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
                    <td>
                      {m.role === 'owner' ? (
                        <span className="badge live">Inhaber</span>
                      ) : (
                        <span className="badge">Mitarbeiter</span>
                      )}
                    </td>
                    <td className="muted">{fmtDate(m.joined_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadGuard>
      <p className="muted small" style={{ marginTop: 10 }}>
        Mitglieder entfernen geht aus Sicherheitsgründen nur in der App.
      </p>
    </>
  );
}
