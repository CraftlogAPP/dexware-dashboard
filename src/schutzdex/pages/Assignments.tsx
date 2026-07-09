import { useState } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDate } from '../../lib/format';
import { addAssignment, fetchAssignments, fetchBriefings, fetchMembers } from '../api';
import { AssignmentBadge } from '../badges';
import { briefingTitleMap, isOverdue, nameMap } from '../labels';
import type { Assignment } from '../types';

type StatusFilter = '' | 'offen' | 'ueberfaellig' | 'erledigt';

export function Assignments() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [adding, setAdding] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('offen');

  // Stammdaten für Namens-Auflösung — einmal laden, nicht pro Filterwechsel.
  const baseState = useAsync(async () => {
    const [members, briefings] = await Promise.all([
      fetchMembers(client),
      fetchBriefings(client),
    ]);
    return { members, briefings };
  }, [client]);

  const asgState = useAsync<Assignment[]>(
    () => fetchAssignments(client, { memberId: memberId || undefined }),
    [client, memberId],
  );

  async function onAdd(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    await addAssignment(client, org.org.id, {
      briefing_id: s(v.briefing_id),
      member_id: s(v.member_id),
      faellig_am: orNull(v.faellig_am),
      wiederholung: s(v.wiederholung) || 'jaehrlich',
    });
    asgState.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Zuweisungen</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setAdding(true)}>
          ＋ Zuweisung anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Welche Unterweisung welchem Mitarbeiter zugewiesen ist — mit Fälligkeit
        und Wiederholung. Der Nachweis selbst entsteht nur in der App
        (Verständnis-Check + Unterschrift).
      </p>

      {adding && (
        <FormDialog
          title="Zuweisung anlegen"
          submitLabel="Zuweisung speichern"
          onClose={() => setAdding(false)}
          onSave={onAdd}
          fields={[
            {
              key: 'briefing_id',
              label: 'Unterweisung',
              kind: 'select',
              required: true,
              options: (baseState.data?.briefings ?? []).map((b) => ({
                value: b.id,
                label: b.titel,
              })),
            },
            {
              key: 'member_id',
              label: 'Mitarbeiter',
              kind: 'select',
              required: true,
              options: (baseState.data?.members ?? [])
                .filter((m) => m.aktiv)
                .map((m) => ({ value: m.id, label: m.name })),
            },
            { key: 'faellig_am', label: 'Fällig am', kind: 'date' },
            {
              key: 'wiederholung',
              label: 'Wiederholung',
              kind: 'select',
              required: true,
              options: [
                { value: 'jaehrlich', label: 'Jährlich' },
                { value: 'halbjaehrlich', label: 'Halbjährlich' },
                { value: 'einmalig', label: 'Einmalig' },
              ],
            },
          ]}
          initial={{ wiederholung: 'jaehrlich' }}
        />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Mitarbeiter
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">Alle Mitarbeiter</option>
              {(baseState.data?.members ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="offen">Offen (inkl. überfällig)</option>
              <option value="ueberfaellig">Nur überfällig</option>
              <option value="erledigt">Erledigt</option>
              <option value="">Alle</option>
            </select>
          </label>
        </div>
      </div>

      <LoadGuard state={asgState}>
        {(allAssignments) => {
          const memberNames = nameMap(baseState.data?.members ?? []);
          const briefingTitles = briefingTitleMap(baseState.data?.briefings ?? []);
          const assignments = allAssignments.filter((a) => {
            if (status === 'offen') return a.status !== 'erledigt';
            if (status === 'ueberfaellig') return isOverdue(a);
            if (status === 'erledigt') return a.status === 'erledigt';
            return true;
          });
          return assignments.length === 0 ? (
            <div className="card empty">
              Keine Zuweisungen mit den gewählten Filtern. 👍
            </div>
          ) : (
            <>
              <p className="muted small">{assignments.length} Zuweisungen</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mitarbeiter</th>
                      <th>Unterweisung</th>
                      <th>Fällig am</th>
                      <th>Wiederholung</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td>{memberNames.get(a.member_id) ?? '—'}</td>
                        <td className="wrap">
                          {briefingTitles.get(a.briefing_id) ?? '—'}
                        </td>
                        <td>{a.faellig_am ? fmtDate(a.faellig_am) : '—'}</td>
                        <td className="muted">{a.wiederholung}</td>
                        <td>
                          <AssignmentBadge assignment={a} />
                        </td>
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
