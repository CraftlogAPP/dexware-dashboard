import { PRO_HOW } from '../winterdex/pro';
import { GlaetteFruehwarnung } from '../winterdex/GlaetteFruehwarnung';
import { PRO_UNKLAR, orgProStand } from '../lib/proStand';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useAppAuth } from '../auth/AppAuthContext';
import { useOrg } from './OrgContext';
import {
  createInvite,
  fetchMembers,
  fetchSeats,
  fetchTeamCode,
  removeMember,
  updateOrg,
  type Member,
  type Org,
  roleLabel,
  type TeamCode,
} from '../lib/orgApi';
import { LoadGuard, useAsync } from './ui';
import { FormDialog, s, type FieldDef, type FormValues } from './form';
import { fmtDate } from '../lib/format';

/** Team-Seite — Mitgliederliste + Beitrittscode; identisch in allen Dex-Apps. */
export function TeamPage() {
  const { app, client, session } = useAppAuth();
  const { data: orgCtx, reload: reloadOrg } = useOrg();
  const isOwner = orgCtx?.role === 'owner';
  // Verwalter (Rolle „admin“, bisher nur WinterDex) dürfen am Server den Team-Code sehen/erneuern und Mitarbeiter entfernen.
  const isAdmin = orgCtx?.role === 'admin';
  const canTeam = isOwner || isAdmin;

  const state = useAsync<Member[]>(() => fetchMembers(client), [client]);
  // Team-Code (ein Code für alle, 30 Tage) + belegte Plätze — nur Inhaber; null = App kennt das noch nicht.
  // Apps mit „Team nur mit Pro“ (teamNeedsPro, wie TeamScreen der App): Code NUR bei sicherem Pro. Unklar (Abo-Dienst
  // gestört) → letzter sicherer Stand dieses Kontos, gibt es keinen: Hinweis „gleich nochmal“ statt Code (früher: Code).
  // Mitglieder bleiben in jedem Fall sichtbar und verwaltbar; den Beitritt prüft zusätzlich der Server.
  const team = useAsync<{ code: TeamCode | null; seats: { limit: number; members: number } | null; needsPro?: boolean; proUnklar?: boolean }>(
    async () => {
      if (!canTeam) return { code: null, seats: null };
      if (app.teamNeedsPro) {
        const pro = await orgProStand(client, app.id, true);
        if (pro === false) return { code: null, seats: null, needsPro: true };
        if (pro === null) return { code: null, seats: null, proUnklar: true };
      }
      return { code: await fetchTeamCode(client), seats: await fetchSeats(client, app.teamSeats?.fallbackLimit) };
    },
    [client, canTeam, app.id, app.teamSeats?.fallbackLimit, app.teamNeedsPro],
  );
  /** Kein Code, weil Pro fehlt oder gerade nicht prüfbar ist — dann auch keinen Einmal-Beitrittscode anbieten. */
  const proSperre = !!team.data?.needsPro || !!team.data?.proUnklar;
  // Eigene Team-Stufen der App (Registry) — sonst der bisherige Standard-Text
  const tiers = app.teamSeats;
  const solo = !!tiers && team.data?.seats?.limit === 0;
  const [renewBusy, setRenewBusy] = useState(false);
  // PrüfDex: Mitarbeiter heißen „Prüfer“; Betriebe ohne Land-Spalte (PrüfDex) nur mit Namen bearbeiten.
  const workerLabel = app.id === 'pruefdex' ? 'Prüfer' : 'Mitarbeiter';
  const hasLand = !!orgCtx && 'land' in orgCtx.org && !!orgCtx.org.land;

  async function onRenew() {
    if (
      !window.confirm(
        'Neuen Team-Code erzeugen? Der bisherige Code wird sofort ungültig. Wer schon im Team ist, bleibt drin.',
      )
    )
      return;
    setRenewBusy(true);
    try {
      await fetchTeamCode(client, true);
      team.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setRenewBusy(false);
    }
  }

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingOrg, setEditingOrg] = useState(false);

  async function onSaveOrg(v: FormValues) {
    if (!orgCtx) throw new Error('Kein Betrieb geladen');
    await updateOrg(client, orgCtx.org.id, {
      name: s(v.name),
      ...(hasLand ? { land: s(v.land) as Org['land'] } : {}),
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
        Inhaber verwalten den Betrieb, {workerLabel} dokumentieren in der App.
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
            {hasLand && <span className="muted"> · {orgCtx.org.land}</span>}
            {orgCtx.org.address && <span className="muted"> · {orgCtx.org.address}</span>}
          </p>
        </div>
      )}

      {/* WinterDex: Uhrzeit der Glätte-Frühwarnung (Inhaber + Verwalter ändern; unsichtbar, solange die Spalte fehlt) */}
      {app.id === 'winterdex' && orgCtx && <GlaetteFruehwarnung client={client} orgId={orgCtx.org.id} darf={canTeam} />}

      {canTeam && team.data?.needsPro && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-head" style={{ margin: 0 }}>
            <h2>{workerLabel} einladen</h2>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Einladen ist Teil von {app.name} Pro — das Gratis-Paket ist das Solo-Paket.{' '}
            {app.id === 'winterdex' ? PRO_HOW : `Pro schließt du in der ${app.name}-App unter „Abo“ ab (mit einem Dexware-Suite-Abo ist es schon dabei).`}
          </p>
        </div>
      )}

      {canTeam && team.data?.proUnklar && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-head" style={{ margin: 0 }}>
            <h2>{workerLabel} einladen</h2>
          </div>
          <p className="muted" style={{ marginBottom: 8 }}>
            {PRO_UNKLAR}
          </p>
          <button className="btn ghost small" onClick={() => team.reload()}>
            Erneut prüfen
          </button>
        </div>
      )}

      {canTeam && team.data?.code && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="section-head" style={{ margin: 0 }}>
            <h2>{workerLabel} einladen</h2>
          </div>
          <p className="muted small">
            Ein Team-Code für alle: {workerLabel} installieren die {app.name}-App, registrieren
            sich und geben beim ersten Start den Code ein. Kein eigenes Abo nötig — sie arbeiten
            unter deinem.
          </p>
          <div className="row">
            <span className="badge live mono" style={{ fontSize: 18 }}>
              {team.data.code.code}
            </span>
            <button
              className="btn ghost small"
              onClick={() => {
                void navigator.clipboard?.writeText(team.data!.code!.code).then(() => setCopied(true), () => {});
              }}
            >
              {copied ? (
                <>
                  <Check className="i" aria-hidden /> Kopiert
                </>
              ) : (
                <>
                  <Copy className="i" aria-hidden /> Kopieren
                </>
              )}
            </button>
            <button className="btn ghost small" onClick={() => void onRenew()} disabled={renewBusy}>
              {renewBusy ? 'Erzeuge …' : 'Neuen Code erzeugen'}
            </button>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            Gültig bis {fmtDate(team.data.code.expires_at)} · {team.data.code.use_count}× eingelöst
            {team.data.seats && (
              <>
                {' · '}
                {solo ? (
                  <b>{tiers!.solo}</b>
                ) : (
                  <b style={{ color: team.data.seats.members >= team.data.seats.limit ? 'var(--danger, #DC2626)' : undefined }}>
                    {team.data.seats.members} von {team.data.seats.limit} {tiers?.seatsWord ?? 'Plätzen'} belegt
                  </b>
                )}
              </>
            )}
          </p>
          {team.data.seats && team.data.seats.members >= team.data.seats.limit - 2 && (
            <p className="small" style={{ marginBottom: 0 }}>
              {solo ? 'Weitere Monteure brauchen ein Team-Abo. ' : team.data.seats.members >= team.data.seats.limit ? 'Dein Team ist voll. ' : 'Dein Team ist fast voll. '}
              {tiers ? (
                <>
                  Mehr Plätze gibt es in der {app.name}-App unter Abo: <b>{tiers.tiers}</b>. Größer:{' '}
                  <a href="mailto:support@dexware.app">support@dexware.app</a>.
                </>
              ) : (
                <>
                  Mehr Plätze gibt es in der {app.name}-App unter Abo: <b>Team</b> (bis 50) oder{' '}
                  <b>Team XL</b> (bis 100). Größer: <a href="mailto:support@dexware.app">support@dexware.app</a>.
                </>
              )}
            </p>
          )}
        </div>
      )}

      {isOwner && !team.loading && !team.data?.code && !proSperre && (
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
                  {copied ? (
                    <>
                      <Check className="i" aria-hidden /> Kopiert
                    </>
                  ) : (
                    <>
                      <Copy className="i" aria-hidden /> Kopieren
                    </>
                  )}
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
                  {canTeam && <th></th>}
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
                        <span className={m.role === 'admin' ? 'badge amber' : 'badge'}>{roleLabel(m.role, workerLabel)}</span>
                      )}
                    </td>
                    <td className="muted">{fmtDate(m.joined_at)}</td>
                    {canTeam && (
                      <td>
                        {/* Sich selbst entfernen wäre ein Aussperren — nicht anbieten. Verwalter entfernen nur Mitarbeiter (Server-Regel). */}
                        {m.user_id !== session?.user.id && m.role !== 'owner' && (isOwner || m.role === 'worker') && (
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
            ...(hasLand ? [{
              key: 'land',
              label: 'Land',
              kind: 'select',
              required: true,
              options: [
                { value: 'DE', label: 'Deutschland' },
                { value: 'AT', label: 'Österreich' },
                { value: 'CH', label: 'Schweiz' },
              ],
            } as FieldDef] : []),
          ]}
          initial={{ name: orgCtx.org.name, land: orgCtx.org.land }}
        />
      )}
    </>
  );
}
