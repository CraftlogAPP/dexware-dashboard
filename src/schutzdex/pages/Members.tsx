import { useState } from 'react';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDate, fmtDateTime } from '../../lib/format';
import {
  fetchAssignments,
  fetchCompletions,
  fetchMembers,
  insertMember,
  updateMember,
} from '../api';
import { isOverdue } from '../labels';
import type { Assignment, Completion, Member } from '../types';

interface Data {
  members: Member[];
  assignments: Assignment[];
  completions: Completion[];
}

export function Members() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editing, setEditing] = useState<Member | 'new' | null>(null);

  const state = useAsync<Data>(async () => {
    const [members, assignments, completions] = await Promise.all([
      fetchMembers(client),
      fetchAssignments(client),
      fetchCompletions(client),
    ]);
    return { members, assignments, completions };
  }, [client]);

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    const input = {
      name: s(v.name),
      taetigkeit: orNull(v.taetigkeit),
      email: orNull(v.email),
      telefon: orNull(v.telefon),
      eintritt_am: orNull(v.eintritt_am),
      aktiv: v.aktiv === true,
    };
    if (editing === 'new') await insertMember(client, org.org.id, input);
    else if (editing) await updateMember(client, editing.id, input);
    state.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Mitarbeiter</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Mitarbeiter anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Mitarbeiter sind Datensätze im Betrieb (keine eigenen Konten) — sie
        unterschreiben in der App auf dem Gerät des Inhabers.
      </p>

      <LoadGuard state={state}>
        {({ members, assignments, completions }) =>
          members.length === 0 ? (
            <div className="card empty">Noch keine Mitarbeiter angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Tätigkeit</th>
                    <th>Eintritt</th>
                    <th>Offene Zuweisungen</th>
                    <th>Letzter Nachweis</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const open = assignments.filter(
                      (a) => a.member_id === m.id && a.status !== 'erledigt',
                    );
                    const overdueCount = open.filter(isOverdue).length;
                    const last = completions.find((c) => c.member_id === m.id);
                    return (
                      <tr key={m.id}>
                        <td>
                          {m.name}
                          {m.email && <div className="muted small">{m.email}</div>}
                        </td>
                        <td className="muted">{m.taetigkeit ?? '—'}</td>
                        <td className="muted">
                          {m.eintritt_am ? fmtDate(m.eintritt_am) : '—'}
                        </td>
                        <td>
                          {open.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <span
                              className={`badge ${overdueCount > 0 ? 'red' : 'amber'}`}
                            >
                              {open.length}
                              {overdueCount > 0 ? ` · ${overdueCount} überfällig` : ''}
                            </span>
                          )}
                        </td>
                        <td className="muted">
                          {last ? fmtDateTime(last.abgeschlossen_am) : '—'}
                        </td>
                        <td>
                          <StatusBadge active={m.aktiv} />
                        </td>
                        <td>
                          <button className="btn ghost small" onClick={() => setEditing(m)}>
                            Bearbeiten
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </LoadGuard>

      {editing && (
        <FormDialog
          title={editing === 'new' ? 'Mitarbeiter anlegen' : `${editing.name} bearbeiten`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'name', label: 'Name', required: true },
            { key: 'taetigkeit', label: 'Tätigkeit', placeholder: 'z. B. Monteur' },
            { key: 'email', label: 'E-Mail' },
            { key: 'telefon', label: 'Telefon' },
            { key: 'eintritt_am', label: 'Eintritt am', kind: 'date' },
            { key: 'aktiv', label: 'Aktiv (bekommt Unterweisungen)', kind: 'checkbox' },
          ]}
          initial={
            editing === 'new'
              ? { aktiv: true }
              : {
                  name: editing.name,
                  taetigkeit: editing.taetigkeit ?? '',
                  email: editing.email ?? '',
                  telefon: editing.telefon ?? '',
                  eintritt_am: editing.eintritt_am ?? '',
                  aktiv: editing.aktiv,
                }
          }
        />
      )}
    </>
  );
}
