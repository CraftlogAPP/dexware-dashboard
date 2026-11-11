// PinnDex — Team: Betrieb, Team-Code (PD-XXXX-XXXX, 30 Tage, erneuerbar), Plätze, Mitglieder mit Rollen.
// Nur der Chef ändert Rollen, entfernt Mitglieder und sieht den Team-Code (Büro: kein Team/Abo — KONZEPT.md Abschnitt 2).

import { useState } from 'react';
import { Check, Copy, MapPin, Pencil, RefreshCw, Sparkles, UserMinus } from 'lucide-react';
import { FormDialog, s, type FormValues } from '../../components/form';
import { LoadGuard, useAsync } from '../../components/ui';
import { usePinn } from '../context';
import { ddmmyyyy, memberColor, memberName } from '../logic';
import { Avatar, ThemeSwitch } from '../parts';
import { ROLE_LABEL, type PinnMember, type PinnRole } from '../types';

export function Team() {
  const { data, org, members, isOwner, me, reloadMembers, refreshOrg } = usePinn();
  const code = useAsync(async () => (isOwner ? { code: await data.teamCode(false), seats: await data.seats() } : null), [data, isOwner]);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editOrg, setEditOrg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const renew = () => {
    if (!window.confirm('Neuen Team-Code erzeugen? Der bisherige Code wird sofort ungültig. Wer schon im Team ist, bleibt drin.')) return;
    void act('renew', async () => {
      await data.teamCode(true);
      code.refresh();
    });
  };

  const setRole = (m: PinnMember, role: Exclude<PinnRole, 'owner'>) =>
    act(`role-${m.user_id}`, async () => {
      await data.setRole(m.user_id, role);
      reloadMembers();
    });

  const remove = (m: PinnMember) => {
    if (!window.confirm(`${memberName(m)} aus dem Betrieb entfernen? Die Person verliert den Zugriff in App und Dashboard; erledigte Aufträge und Zeiten bleiben erhalten.`)) return;
    void act(`rm-${m.user_id}`, async () => {
      await data.removeMember(m.user_id);
      reloadMembers();
      code.refresh();
    });
  };

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Zwischenablage nicht verfügbar — Code steht sichtbar da */
    }
  }

  const active = members.filter((m) => m.active);
  // „neu beigetreten“: in den letzten 7 Tagen per Team-Code dazugekommen (Chef ausgenommen) — steht oben
  const isNew = (m: PinnMember) => m.role !== 'owner' && Date.now() - Date.parse(m.created_at) < 7 * 86400000;
  const gone = members.filter((m) => !m.active);

  return (
    <>
      <h1>Team</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Chef verwaltet Betrieb und Team, das Büro plant Aufträge, Monteure arbeiten sie in der App ab.
      </p>

      <div className="card pinn-orgcard">
        <div className="section-head" style={{ margin: 0 }}>
          <h2>{org.name}</h2>
          {isOwner && (
            <button className="btn ghost small" onClick={() => setEditOrg(true)}>
              <Pencil className="i" aria-hidden /> Umbenennen
            </button>
          )}
        </div>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          Du bist hier <b>{ROLE_LABEL[me.role]}</b>.
        </p>
      </div>

      {isOwner && (
        <LoadGuard state={code}>
          {(c) => c && (
            <div className="card pinn-codecard">
              <div>
                <div className="pinn-fact-label">Team-Code zum Beitreten</div>
                {c.code ? (
                  <>
                    <div className="pinn-code mono">{c.code.code}</div>
                    <div className="muted small">
                      In der Laufzettel-App unter „Team-Code eingeben“ — wer beitritt, wählt selbst <b>Monteur</b> oder <b>Büro</b>; du kannst die Rolle unten
                      jederzeit ändern. Beliebig oft einlösbar
                      {c.code.expires_at ? `, gültig bis ${ddmmyyyy(new Date(c.code.expires_at))}` : ''}.
                    </div>
                  </>
                ) : (
                  <div className="muted">Noch kein Team-Code — „Neuen Code erzeugen“.</div>
                )}
                {c.seats && (
                  <div className={`pinn-seats${c.seats.members >= c.seats.limit ? ' full' : ''}`}>
                    <span className="pinn-seatbar" style={{ '--fill': `${Math.min(100, (c.seats.members / Math.max(1, c.seats.limit)) * 100)}%` } as React.CSSProperties} />
                    {c.seats.members} von {c.seats.limit} Monteur-Plätzen belegt
                    {c.seats.members >= c.seats.limit ? ' — voll, mehr Plätze über das Abo in der App' : ''}
                    <span className="muted"> · Büro zählt nicht mit</span>
                  </div>
                )}
              </div>
              <div className="pinn-codebtns">
                {c.code && (
                  <button type="button" className="btn ghost" onClick={() => void copy(c.code!.code)}>
                    {copied ? <Check className="i" aria-hidden /> : <Copy className="i" aria-hidden />} {copied ? 'Kopiert' : 'Kopieren'}
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={renew} disabled={busy === 'renew'}>
                  <RefreshCw className="i" aria-hidden /> {c.code ? 'Erneuern' : 'Neuen Code erzeugen'}
                </button>
              </div>
            </div>
          )}
        </LoadGuard>
      )}

      {isOwner && (
        <div className="card pinn-loccard">
          <button
            type="button"
            role="switch"
            aria-checked={!!org.share_location}
            className={`pinn-switch plain${org.share_location ? ' on' : ''}`}
            disabled={busy === 'loc'}
            onClick={() =>
              void act('loc', async () => {
                await data.setShareLocation(!org.share_location);
                refreshOrg();
              })
            }
          >
            <span className="pinn-switch-knob" aria-hidden />
            <MapPin className="i" aria-hidden /> Standort beim Starten/Beenden mitschicken
          </button>
          <p className="muted small">
            Die App schickt nur in diesem Moment <b>einmal</b> den Standort mit — so steht der Pin auf der Übersicht dort, wo die Arbeit begonnen hat
            („angekommen 08:03“). Keine Dauer-Ortung, kein Bewegungsprofil. Sag deinem Team Bescheid, wenn du es einschaltest.
          </p>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <div className="section-head">
        <h2>Mitglieder ({active.length})</h2>
      </div>
      <div className="pinn-members">
        {[...active.filter(isNew), ...active.filter((m) => !isNew(m))].map((m) => {
          const i = members.indexOf(m);
          return (
            <div key={m.user_id} className={`card pinn-member${isNew(m) ? ' new' : ''}`}>
              <Avatar name={memberName(m)} color={memberColor(m, i)} size={42} />
              <div className="pinn-member-main">
                <b>{memberName(m)}</b>
                {m.user_id === me.user_id && <span className="muted small"> (du)</span>}
                {isNew(m) ? (
                  <div className="pinn-newtag">
                    <Sparkles className="i" aria-hidden /> neu beigetreten als {ROLE_LABEL[m.role]} · {ddmmyyyy(new Date(m.created_at))}
                  </div>
                ) : (
                  <div className="muted small">seit {ddmmyyyy(new Date(m.created_at))}</div>
                )}
              </div>
              {isOwner && m.role !== 'owner' ? (
                <div className="pinn-member-actions">
                  <select aria-label={`Rolle von ${memberName(m)}`} value={m.role} disabled={!!busy} onChange={(e) => void setRole(m, e.target.value as Exclude<PinnRole, 'owner'>)}>
                    <option value="worker">Monteur</option>
                    <option value="dispatcher">Büro</option>
                  </select>
                  <button type="button" className="btn ghost small pinn-danger" onClick={() => remove(m)} disabled={!!busy} aria-label={`${memberName(m)} entfernen`}>
                    <UserMinus className="i" aria-hidden />
                  </button>
                </div>
              ) : (
                <span className={`badge${m.role === 'owner' ? ' green' : m.role === 'dispatcher' ? ' external' : ''}`}>{ROLE_LABEL[m.role]}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="section-head">
        <h2>Darstellung</h2>
      </div>
      <div className="card pinn-themecard">
        <span className="muted small">Gilt nur in diesem Browser.</span>
        <ThemeSwitch labels />
      </div>

      {gone.length > 0 && (
        <p className="muted small">
          Ausgeschieden: {gone.map((m) => memberName(m)).join(', ')} — ihre erledigten Aufträge und Zeiten bleiben sichtbar.
        </p>
      )}

      {editOrg && (
        <FormDialog
          title="Betrieb umbenennen"
          fields={[{ key: 'name', label: 'Name des Betriebs', required: true }]}
          initial={{ name: org.name }}
          onClose={() => setEditOrg(false)}
          onSave={async (v: FormValues) => {
            await data.renameOrg(s(v.name).slice(0, 120));
            refreshOrg();
          }}
        />
      )}
    </>
  );
}
