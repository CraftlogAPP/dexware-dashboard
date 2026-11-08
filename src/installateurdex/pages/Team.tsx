import { useState } from 'react';
import { Check, Copy, ShieldCheck } from 'lucide-react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { TeamPage } from '../../components/TeamPage';
import { LoadGuard, useAsync } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { fetchMembers, fetchTeamCode, removeMember, type Member } from '../../lib/orgApi';
import { useInst } from '../context';
import {
  ALL_PERMS,
  fetchTeamPerms,
  OWNER_ONLY_HINT,
  PERMS,
  PERMS_LATER_MSG,
  permsLabel,
  saveMemberPerms,
  type MemberPerms,
  type Perm,
} from '../rechte';

/** Echt: die gemeinsame Team-Seite aller Dashboards + (nur InstallateurDex) Team-Rechte. Beispieldaten: Liste + Rechte im Speicher. */
export function Team() {
  const { demo } = useInst();
  return demo ? <DemoTeam /> : <RealTeam />;
}

type PermRow = Pick<MemberPerms, 'membership_id' | 'user_id' | 'role' | 'deputy' | 'perms'>;

function RealTeam() {
  const { client } = useAppAuth();
  const { isOwner, can, reloadPerms } = useInst();
  const members = useAsync(() => fetchMembers(client), [client]);
  const perms = useAsync(() => fetchTeamPerms(client), [client]);
  return (
    <>
      <TeamPage />
      {/* Mitarbeiter mit Recht „Team“ (nicht Inhaber): die gemeinsame Team-Seite zeigt Einladen/Entfernen nur dem Inhaber */}
      {!isOwner && can('team') && members.data && perms.data && (
        <TeamHelfer members={members.data} perms={perms.data} onChanged={members.reload} />
      )}
      <LoadGuard state={perms}>
        {(list) =>
          list === null ? (
            isOwner ? <div className="info-box" style={{ marginTop: 18 }}>{PERMS_LATER_MSG}</div> : null
          ) : (
            <RechteKarte
              members={members.data ?? []}
              perms={list}
              editable={isOwner}
              onSave={async (ms, deputy, p) => {
                await saveMemberPerms(client, ms, deputy, p);
                perms.reload();
                reloadPerms();
              }}
            />
          )
        }
      </LoadGuard>
    </>
  );
}

/** Rechte je Mitarbeiter: Liste mit Abzeichen; der Inhaber ändert sie hier (Stellvertreter-Schalter + Einzelrechte). */
function RechteKarte({
  members,
  perms,
  editable,
  onSave,
}: {
  members: Pick<Member, 'membership_id' | 'email'>[];
  perms: PermRow[];
  editable: boolean;
  onSave: (membershipId: string, deputy: boolean, perms: Perm[]) => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const emailOf = (id: string) => members.find((m) => m.membership_id === id)?.email ?? 'Mitarbeiter';
  const workers = perms.filter((p) => p.role !== 'owner');
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="section-head" style={{ margin: 0 }}>
        <h2>
          <ShieldCheck className="i" aria-hidden /> Rechte im Team
        </h2>
      </div>
      <p className="muted small">
        {editable
          ? 'Mach einen Mitarbeiter zum Stellvertreter (alle Rechte unten) oder gib einzelne Rechte — z. B. nur „Zeiten aller“ für die Lohnverrechnung. '
          : 'Wer was darf, legt der Inhaber fest. '}
        {OWNER_ONLY_HINT}
      </p>
      {workers.length === 0 ? (
        <p className="muted small" style={{ marginBottom: 0 }}>Noch keine Mitarbeiter im Team.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Rechte</th>
                {editable && <th aria-label="Aktion" />}
              </tr>
            </thead>
            <tbody>
              {workers.map((p) => (
                <RechteZeile
                  key={p.membership_id}
                  row={p}
                  email={emailOf(p.membership_id)}
                  editable={editable}
                  open={open === p.membership_id}
                  onToggle={() => setOpen(open === p.membership_id ? null : p.membership_id)}
                  onSave={async (deputy, list) => {
                    await onSave(p.membership_id, deputy, list);
                    setOpen(null);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RechteZeile({
  row,
  email,
  editable,
  open,
  onToggle,
  onSave,
}: {
  row: PermRow;
  email: string;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  onSave: (deputy: boolean, perms: Perm[]) => Promise<void>;
}) {
  const [deputy, setDeputy] = useState(row.deputy);
  const [sel, setSel] = useState<Perm[]>(row.perms);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setDeputy(row.deputy);
    setSel(row.perms);
    setError(null);
  };
  const changed = deputy !== row.deputy || [...sel].sort().join() !== [...row.perms].sort().join();
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(deputy, ALL_PERMS.filter((k) => sel.includes(k)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <tr>
        <td>{email}</td>
        <td>
          {row.deputy ? (
            <span className="badge live">Stellvertreter</span>
          ) : row.perms.length ? (
            <span className="badge amber" title={permsLabel(row)}>
              {row.perms.length === 1 ? permsLabel(row) : `${row.perms.length} Rechte`}
            </span>
          ) : (
            <span className="muted">nur eigene Arbeit</span>
          )}
        </td>
        {editable && (
          <td className="idx-num">
            <button
              type="button"
              className="btn ghost small"
              aria-expanded={open}
              onClick={() => {
                reset();
                onToggle();
              }}
            >
              {open ? 'Schließen' : 'Rechte ändern'}
            </button>
          </td>
        )}
      </tr>
      {editable && open && (
        <tr>
          <td colSpan={3}>
            <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              {error && <div className="error-box">{error}</div>}
              <label className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
                <input type="checkbox" checked={deputy} onChange={(e) => setDeputy(e.target.checked)} />
                <span>
                  <b>Stellvertreter</b>
                  <span className="muted small"> — darf alles unten, auch künftige Rechte. {OWNER_ONLY_HINT}</span>
                </span>
              </label>
              {PERMS.map((p) => (
                <label key={p.key} className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 6, opacity: deputy ? 0.6 : 1 }}>
                  <input
                    type="checkbox"
                    checked={deputy || sel.includes(p.key)}
                    disabled={deputy}
                    onChange={(e) => setSel((x) => (e.target.checked ? [...x, p.key] : x.filter((k) => k !== p.key)))}
                  />
                  <span>
                    <b>{p.label}</b>
                    <span className="muted small"> — {p.hint}</span>
                  </span>
                </label>
              ))}
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button type="button" className="btn small" onClick={() => void save()} disabled={!changed || busy}>
                  {busy ? 'Speichert …' : 'Rechte speichern'}
                </button>
                <button type="button" className="btn ghost small" onClick={onToggle} disabled={busy}>
                  Abbrechen
                </button>
              </div>
            </fieldset>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Mitarbeiter mit Recht „Team“ (z. B. Stellvertreter): Team-Code weitergeben und Mitarbeiter OHNE Rechte entfernen
 * (Server: team_code / remove_member — einen anderen mit Rechten oder den Inhaber entfernt nur der Inhaber).
 */
function TeamHelfer({ members, perms, onChanged }: { members: Member[]; perms: PermRow[]; onChanged: () => void }) {
  const { client, session } = useAppAuth();
  const code = useAsync(() => fetchTeamCode(client), [client]);
  const [copied, setCopied] = useState(false);
  const me = session?.user.id;
  const removable = members.filter((m) => {
    const p = perms.find((x) => x.membership_id === m.membership_id);
    return m.role !== 'owner' && m.user_id !== me && !!p && !p.deputy && p.perms.length === 0;
  });
  async function onRemove(m: Member) {
    if (!window.confirm(`${m.email} wirklich aus dem Betrieb entfernen? Die Person verliert den Zugriff in App und Portal; ihre Einträge bleiben erhalten.`)) return;
    try {
      await removeMember(client, m.membership_id);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="section-head" style={{ margin: 0 }}>
        <h2>Mitarbeiter einladen und entfernen</h2>
      </div>
      <p className="muted small">Du hast das Recht dazu vom Inhaber. Mitarbeiter mit eigenen Rechten entfernt nur der Inhaber.</p>
      <LoadGuard state={code}>
        {(c) =>
          c ? (
            <div className="row" style={{ marginBottom: 12 }}>
              <span className="badge live mono" style={{ fontSize: 18 }}>{c.code}</span>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => void navigator.clipboard.writeText(c.code).then(() => setCopied(true), () => {})}
              >
                {copied ? <Check className="i" aria-hidden /> : <Copy className="i" aria-hidden />} {copied ? 'Kopiert' : 'Kopieren'}
              </button>
              <span className="muted small">gültig bis {fmtDate(c.expires_at)}</span>
            </div>
          ) : (
            <p className="muted small">Kein Team-Code verfügbar — bitte den Inhaber fragen.</p>
          )
        }
      </LoadGuard>
      {removable.length > 0 && (
        <div className="table-wrap">
          <table>
            <tbody>
              {removable.map((m) => (
                <tr key={m.membership_id}>
                  <td>{m.email}</td>
                  <td className="muted">{fmtDate(m.joined_at)}</td>
                  <td className="idx-num">
                    <button type="button" className="btn ghost small" onClick={() => void onRemove(m)}>
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DemoTeam() {
  const { data, isOwner } = useInst();
  const state = useAsync(() => data.members(), [data]);
  // Beispieldaten: Rechte nur im Speicher (Mitarbeiter 2 ist Stellvertreter)
  const [demoPerms, setDemoPerms] = useState<Record<string, { deputy: boolean; perms: Perm[] }>>({ 'ms-2': { deputy: true, perms: [] } });
  return (
    <>
      <h1>Team</h1>
      <div className="info-box">
        Mit echtem Konto steht hier die Team-Verwaltung wie in allen Dashboards: Team-Code für neue Monteure, Mitglieder
        entfernen, Plätze laut Abo — und darunter die Rechte (Stellvertreter, einzelne Rechte).
      </div>
      <LoadGuard state={state}>
        {(members) => (
          <>
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
            <RechteKarte
              members={members}
              perms={members.map((m) => ({
                membership_id: m.membership_id,
                user_id: m.user_id,
                role: m.role,
                deputy: demoPerms[m.membership_id]?.deputy ?? false,
                perms: demoPerms[m.membership_id]?.perms ?? [],
              }))}
              editable={isOwner}
              onSave={async (ms, deputy, perms) => setDemoPerms((x) => ({ ...x, [ms]: { deputy, perms } }))}
            />
          </>
        )}
      </LoadGuard>
    </>
  );
}
