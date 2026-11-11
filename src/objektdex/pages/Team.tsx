// Team: Mitglieder, Team-Code (ein Code für alle, 30 Tage), Mitarbeiter entfernen (nur Inhaber).
import { useState } from 'react';
import { LoadGuard, useAsync } from '../../components/ui';
import { useOd } from '../context';
import { CopyButton, fmtDateTimeB, fmtDayOf } from '../parts';

export function Team() {
  const { data, role } = useOd();
  const owner = role === 'owner';
  const state = useAsync(async () => {
    const [members, code] = await Promise.all([data.listMembers(), owner ? data.teamCode(false).catch(() => null) : Promise.resolve(null)]);
    return { members, code };
  }, [data, owner]);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, ask: string) {
    if (!window.confirm(ask)) return;
    setBusy(true);
    try {
      await fn();
      state.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Team</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Der Inhaber verwaltet Objekte und Leistungen, Mitarbeiter dokumentieren in der App. Team-Stufen: Pro 20 · Team 50 · Team XL 100 Mitarbeiter.
      </p>
      <LoadGuard state={state}>
        {({ members, code }) => (
          <>
            {owner && code && (
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
                  <button className="btn ghost small" disabled={busy} onClick={() => void act(() => data.teamCode(true), 'Neuen Team-Code erzeugen? Der bisherige wird sofort ungültig. Wer schon im Team ist, bleibt drin.')}>
                    Neuer Code
                  </button>
                </div>
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>E-Mail</th>
                    <th>Rolle</th>
                    <th>Dabei seit</th>
                    {owner && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.membership_id}>
                      <td className="wrap">{m.email}</td>
                      <td>{m.role === 'owner' ? <span className="badge green">Inhaber</span> : <span className="badge">Mitarbeiter</span>}</td>
                      <td className="muted">{fmtDateTimeB(m.joined_at)}</td>
                      {owner && (
                        <td>
                          {m.role !== 'owner' && (
                            <button className="btn ghost small od-danger" disabled={busy} onClick={() => void act(() => data.removeMember(m.membership_id), `${m.email} aus dem Team entfernen? Bisherige Einsätze bleiben erhalten.`)}>
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
          </>
        )}
      </LoadGuard>
    </>
  );
}
