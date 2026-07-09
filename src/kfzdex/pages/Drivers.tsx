import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, num, orNull, s, type FormValues } from '../../components/form';
import { fmtDate, toInputDate } from '../../lib/format';
import { addLicenseCheck, fetchDrivers, insertDriver, updateDriver } from '../api';
import { DueBadge, dueLabel } from '../badges';
import { licenseDue } from '../due';
import type { Driver } from '../types';

export function Drivers() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Driver | 'new' | null>(null);
  const [checking, setChecking] = useState<Driver | null>(null);

  const state = useAsync<Driver[]>(() => fetchDrivers(client), [client]);

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    const input = {
      name: s(v.name),
      license_classes: orNull(v.license_classes),
      check_interval_months: num(v.check_interval_months) ?? 6,
      last_check: orNull(v.last_check),
      active: v.active === true,
    };
    if (editing === 'new') await insertDriver(client, org.org.id, input);
    else if (editing) await updateDriver(client, editing.id, input);
    state.reload();
  }

  async function onCheck(v: FormValues) {
    if (!org || !checking) throw new Error('Kein Betrieb geladen');
    const warning = await addLicenseCheck(client, org.org.id, {
      driver_id: checking.id,
      date: s(v.date),
      checked_by: s(v.checked_by),
    });
    state.reload();
    if (warning) alert(warning);
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Fahrer</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Fahrer anlegen
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Fahrer suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <LoadGuard state={state}>
        {(drivers) => {
          const q = search.trim().toLowerCase();
          const filtered = drivers.filter(
            (d) => !q || d.name.toLowerCase().includes(q),
          );

          if (filtered.length === 0) {
            return (
              <div className="card empty">
                {drivers.length === 0
                  ? 'Noch keine Fahrer angelegt. Lege sie in der KfzDex-App an.'
                  : 'Keine Fahrer für diese Suche.'}
              </div>
            );
          }

          return (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Führerscheinklassen</th>
                    <th>Intervall</th>
                    <th>Letzte Kontrolle</th>
                    <th>Fällig</th>
                    <th>Kontrolle</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const due = licenseDue(d);
                    return (
                      <tr key={d.id}>
                        <td>
                          <Link to={d.id}>{d.name}</Link>
                        </td>
                        <td className="muted">{d.license_classes ?? '—'}</td>
                        <td className="muted">alle {d.check_interval_months} Monate</td>
                        <td className="muted">{fmtDate(d.last_check)}</td>
                        <td className="muted">{dueLabel(due)}</td>
                        <td>
                          {/* Fällige Kontrolle nur für aktive Fahrer relevant. */}
                          {d.active ? <DueBadge status={due.status} /> : '—'}
                        </td>
                        <td>
                          {d.active ? (
                            <span className="badge green">aktiv</span>
                          ) : (
                            <span className="badge">inaktiv</span>
                          )}
                        </td>
                        <td>
                          <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                            <button className="btn ghost small" onClick={() => setEditing(d)}>
                              Bearbeiten
                            </button>
                            <button className="btn ghost small" onClick={() => setChecking(d)}>
                              Kontrolle erfassen
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }}
      </LoadGuard>

      {editing && (
        <FormDialog
          title={editing === 'new' ? 'Fahrer anlegen' : `${editing.name} bearbeiten`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'name', label: 'Name', required: true },
            { key: 'license_classes', label: 'Führerscheinklassen', placeholder: 'z. B. B, BE, C1' },
            {
              key: 'check_interval_months',
              label: 'Kontroll-Intervall (Monate)',
              kind: 'number',
              required: true,
              hint: 'Üblich sind 6 Monate',
            },
            { key: 'last_check', label: 'Letzte Führerscheinkontrolle', kind: 'date' },
            { key: 'active', label: 'Aktiv (Kontrollen fällig)', kind: 'checkbox' },
          ]}
          initial={
            editing === 'new'
              ? { check_interval_months: '6', active: true }
              : {
                  name: editing.name,
                  license_classes: editing.license_classes ?? '',
                  check_interval_months: String(editing.check_interval_months),
                  last_check: editing.last_check ?? '',
                  active: editing.active,
                }
          }
        />
      )}

      {checking && (
        <FormDialog
          title={`Führerscheinkontrolle — ${checking.name}`}
          submitLabel="Kontrolle speichern"
          onClose={() => setChecking(null)}
          onSave={onCheck}
          fields={[
            { key: 'date', label: 'Kontrolldatum', kind: 'date', required: true },
            { key: 'checked_by', label: 'Kontrolliert von', required: true },
          ]}
          initial={{ date: toInputDate(new Date()) }}
        />
      )}
    </>
  );
}
