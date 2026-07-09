import { useState } from 'react';
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from './OrgContext';
import {
  createInvite,
  fetchMembers,
  removeMember,
  updateOrg,
  type Member,
  type Org,
} from '../lib/orgApi';
import { LoadGuard, useAsync } from './ui';
import { FormDialog, s, type FormValues } from './form';
import { fmtDate } from '../lib/format';

/** Team-Seite — Mitgliederliste + Beitrittscode; identisch in allen Dex-Apps. */
export function TeamPage() {
  const { app, client, session } = useAppAuth();
  const { data: orgCtx, reload: reloadOrg } = useOrg();
  const isOwner = orgCtx?.role === 'owner';

  const state = useAsync<Member[]>(() => fetchMembers(client), [client]);

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingOrg, setEditingOrg] = useState(false);

  async function onSaveOrg(v: FormValues) {
    if (!orgCtx) throw new Error('Kein Betrieb geladen');
    await updateOrg(client, orgCtx.org.id, {
      name: s(v.name),
      land: s(v.land) as Org['land'],
    });
    reloadOrg();
  }

  async function onRemove(m: Member) {
    if (
      !window.confirm(
        `${m.email} wirklich aus dem Betrieb entfernen? Die Person verliert den Zugriff in App und Dashboard; ihre dokumentierten Einträge bleiben erhalten.`,
      )
    )
      return;
    try {
      await removeMember(client, m.membership_id);
      state.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

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
        Inhaber verwalten den Betrieb, Mitarbeiter dokumentieren in der App.
      </p>

      {orgCtx && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-head" style={{ margin: 0 }}>
            <h2>Betrieb</h2>
            {isOwner && (
              <button className="btn ghost small" onClick={() => setEditingOrg(true)}>
                Bearbeiten
              </button>
            )}
          </div>
          <p style={{ marginBottom: 0 }}>
            {orgCtx.org.name}
            <span className="muted"> · {orgCtx.org.land}</span>
            {orgCtx.org.address && <span className="muted"> · {orgCtx.org.address}</span>}
          </p>
        </div>
      )}

      {isOwner && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-head" style={{ margin: 0 }}>
            <h2>Mitarbeiter einladen</h2>
          </div>
          <p className="muted small">
            Erzeuge einen Beitrittscode (7 Tage gültig, einmal einlösbar). Dein
            Mitarbeiter registriert sich in der {app.name}-App und gibt den Code dort
            unter „Team beitreten" ein.
          </p>
          {inviteError && <div className="error-box">{inviteError}</div>}
          <div className="row">
            <button
              className="btn"
              onClick={() => void onCreateInvite()}
              disabled={inviteBusy}
            >
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
                  {isOwner && <th></th>}
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
                    {isOwner && (
                      <td>
                        {/* Sich selbst (Owner) entfernen wäre ein Aussperren — nicht anbieten. */}
                        {m.user_id !== session?.user.id && m.role !== 'owner' && (
                          <button
                            className="btn ghost small"
                            onClick={() => void onRemove(m)}
                          >
                            Entfernen
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadGuard>

      {editingOrg && orgCtx && (
        <FormDialog
          title="Betrieb bearbeiten"
          onClose={() => setEditingOrg(false)}
          onSave={onSaveOrg}
          fields={[
            { key: 'name', label: 'Name des Betriebs', required: true },
            {
              key: 'land',
              label: 'Land',
              kind: 'select',
              required: true,
              options: [
                { value: 'DE', label: 'Deutschland' },
                { value: 'AT', label: 'Österreich' },
                { value: 'CH', label: 'Schweiz' },
              ],
            },
          ]}
          initial={{ name: orgCtx.org.name, land: orgCtx.org.land }}
        />
      )}
    </>
  );
}
