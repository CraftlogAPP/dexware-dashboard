// Team: Mitglieder, Team-Code (ein Code für alle, 30 Tage), Mitglieder entfernen, Verwalter ernennen.
// Rechte wie in der App (ObjektDex/mobile/src/screens/TeamScreen.tsx) — der Server prüft jede Aktion selbst:
//   Inhaber  — Team-Code, Mitarbeiter UND Verwalter entfernen, Verwalter ernennen/zurückstufen
//   Verwalter — Team-Code, nur Mitarbeiter entfernen
//   Mitarbeiter — nur die Liste sehen
import { useState } from 'react';
import { LoadGuard, useAsync } from '../../components/ui';
import { useOd } from '../context';
import type { OdMember } from '../types';
import { CopyButton, fmtDateTimeB, fmtDayOf } from '../parts';

const RENEW_TEXT = 'Neuen Team-Code erzeugen? Der bisherige wird sofort ungültig. Wer schon im Team ist, bleibt drin.';

export function Team() {
  const { data, role } = useOd();
  const owner = role === 'owner';
  const manages = owner || role === 'admin';
  const state = useAsync(async () => {
    const [members, code] = await Promise.all([data.listMembers(), manages ? data.teamCode(false).catch(() => null) : Promise.resolve(null)]);
    return { members, code };
  }, [data, manages]);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, ask: string): Promise<boolean> {
    if (!window.confirm(ask)) return false;
    setBusy(true);
    try {
      await fn();
      state.reload();
      return true;
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: OdMember, codeActive: boolean) {
    const ok = await act(() => data.removeMember(m.membership_id), `${m.email} aus dem Team entfernen? Bisherige Einsätze bleiben erhalten.`);
    // Der Team-Code gilt 30 Tage für beliebig viele Beitritte — wer entfernt wurde, kennt ihn meist (wie in der App).
    if (ok && codeActive) {
      await act(
        () => data.teamCode(true),
        `${m.email} kennt vermutlich den aktuellen Team-Code und könnte damit wieder beitreten.\n\n${RENEW_TEXT}`,
      );
    }
  }

  /** Darf ich dieses Mitglied entfernen? Inhaber: alle außer sich selbst · Verwalter: nur Mitarbeiter. */
  const canRemove = (m: OdMember) => m.role !== 'owner' && (owner || (role === 'admin' && m.role === 'worker'));

  return (
    <>
      <h1>Team</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Der Inhaber verwaltet Objekte und Leistungen, Mitarbeiter dokumentieren in der App. Verwalter (vom Inhaber ernannt) teilen
        zusätzlich den Team-Code und entfernen Mitarbeiter. Team-Stufen: Pro 20 · Team 50 · Team XL 100 Plätze (Verwalter belegen
        einen Platz).
      </p>
      <LoadGuard state={state}>
        {({ members, code }) => {
          const codeActive = !!code && new Date(code.expires_at).getTime() > Date.now();
          return (
            <>
              {manages && code && (
                <div className="card od-code">
                  <div>
                    <div className="muted small">Team-Code — in der App unter „Ich habe einen Team-Code“ eintippen</div>
                    <div className="od-code-value mono">{code.code}</div>
                    <div className="muted small">
                      gültig bis {fmtDayOf(code.expires_at)} · {code.use_count}× genutzt
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <CopyButton text={code.code} />
                    <button className="btn ghost small" disabled={busy} onClick={() => void act(() => data.teamCode(true), RENEW_TEXT)}>
                      Neuer Code
                    </button>
                  </div>
                </div>
              )}
              <div className="table-wrap">
                <table className="od-ops">
                  <thead>
                    <tr>
                      <th>E-Mail</th>
                      <th>Rolle</th>
                      <th>Dabei seit</th>
                      {manages && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.membership_id}>
                        <td className="wrap">{m.email}</td>
                        <td>
                          {m.role === 'owner' ? (
                            <span className="badge green">Inhaber</span>
                          ) : m.role === 'admin' ? (
                            <span className="badge">Verwalter</span>
                          ) : (
                            <span className="badge">Mitarbeiter</span>
                          )}
                        </td>
                        <td className="muted">{fmtDateTimeB(m.joined_at)}</td>
                        {manages && (
                          <td>
                            <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                              {owner && m.role === 'worker' && (
                                <button
                                  className="btn ghost small"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(
                                      () => data.setMemberRole(m.user_id, 'admin'),
                                      `${m.email} zum Verwalter machen?\n\nVerwalter dürfen zusätzlich den Team-Code teilen und erneuern und Mitarbeiter entfernen. Objekte, Leistungen, Stornos, Auftraggeber-Links und das Abo bleiben bei dir.`,
                                    )
                                  }
                                >
                                  Zum Verwalter
                                </button>
                              )}
                              {owner && m.role === 'admin' && (
                                <button
                                  className="btn ghost small"
                                  disabled={busy}
                                  onClick={() => void act(() => data.setMemberRole(m.user_id, 'worker'), `${m.email} die Verwalter-Rechte entziehen? Danach ist ${m.email} wieder Mitarbeiter.`)}
                                >
                                  Rechte entziehen
                                </button>
                              )}
                              {canRemove(m) && (
                                <button className="btn ghost small od-danger" disabled={busy} onClick={() => void remove(m, codeActive)}>
                                  Entfernen
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
