import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import {
  fetchOperationMeta,
  fetchProperties,
  saveProperty,
  type OpMeta,
} from '../api';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { FormDialog, orNull, s, type FormValues } from '../../components/form';
import { fmtDateTime } from '../../lib/format';
import { lastOpByProperty } from '../labels';
import type { DutyTimes, Property } from '../types';

interface Data {
  properties: Property[];
  lastByProp: Map<string, OpMeta>;
}

export function Properties() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [editing, setEditing] = useState<Property | 'new' | null>(null);

  const state = useAsync<Data>(async () => {
    const [properties, meta] = await Promise.all([
      fetchProperties(client),
      fetchOperationMeta(client, { limit: 2000 }),
    ]);
    return { properties, lastByProp: lastOpByProperty(meta) };
  }, [client]);

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    await saveProperty(
      client,
      org.org.id,
      {
        name: s(v.name),
        address: s(v.address),
        customer_name: orNull(v.customer_name),
        customer_contact: orNull(v.customer_contact),
        areas: orNull(v.areas),
        duty_times: { mo_fr: s(v.duty_mo_fr), sa: s(v.duty_sa), so: s(v.duty_so) },
        notes: orNull(v.notes),
        active: v.active === true,
      },
      editing === 'new' ? undefined : (editing ?? undefined),
    );
    state.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Objekte</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Objekt anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Alle Liegenschaften mit Pflichtzeiten und letztem Einsatz.
      </p>

      <LoadGuard state={state}>
        {({ properties, lastByProp }) =>
          properties.length === 0 ? (
            <div className="card empty">Noch keine Objekte angelegt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Objekt</th>
                    <th>Adresse</th>
                    <th>Auftraggeber</th>
                    <th>Pflichtzeiten</th>
                    <th>Letzter Einsatz</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((p) => {
                    const last = lastByProp.get(p.id);
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link to={p.id}>{p.name}</Link>
                        </td>
                        <td className="wrap muted">{p.address}</td>
                        <td className="wrap muted">{p.customer_name ?? '—'}</td>
                        <td className="muted small">{dutyLabel(p.duty_times)}</td>
                        <td>{last ? fmtDateTime(last.started_at) : '—'}</td>
                        <td>
                          <StatusBadge active={p.active} />
                        </td>
                        <td>
                          <button
                            className="btn ghost small"
                            onClick={() => setEditing(p)}
                          >
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
          title={editing === 'new' ? 'Objekt anlegen' : `${editing.name} bearbeiten`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'name', label: 'Name', required: true },
            { key: 'address', label: 'Adresse', required: true },
            { key: 'customer_name', label: 'Auftraggeber' },
            { key: 'customer_contact', label: 'Auftraggeber-Kontakt' },
            { key: 'areas', label: 'Flächen', hint: 'z. B. Gehweg, Parkplatz, Zufahrt' },
            { key: 'duty_mo_fr', label: 'Pflichtzeiten Mo–Fr', placeholder: 'z. B. 6–22 Uhr' },
            { key: 'duty_sa', label: 'Pflichtzeiten Samstag', placeholder: 'z. B. 7–22 Uhr' },
            { key: 'duty_so', label: 'Pflichtzeiten Sonn-/Feiertag', placeholder: 'z. B. 8–22 Uhr' },
            { key: 'notes', label: 'Notizen', kind: 'textarea' },
            { key: 'active', label: 'Aktiv (wird im Winterdienst berücksichtigt)', kind: 'checkbox' },
          ]}
          initial={
            editing === 'new'
              ? { active: true }
              : {
                  name: editing.name,
                  address: editing.address,
                  customer_name: editing.customer_name ?? '',
                  customer_contact: editing.customer_contact ?? '',
                  areas: editing.areas ?? '',
                  duty_mo_fr: editing.duty_times?.mo_fr ?? '',
                  duty_sa: editing.duty_times?.sa ?? '',
                  duty_so: editing.duty_times?.so ?? '',
                  notes: editing.notes ?? '',
                  active: editing.active,
                }
          }
        />
      )}
    </>
  );
}

export function dutyLabel(d: DutyTimes | null | undefined): string {
  if (!d) return '—';
  const parts: string[] = [];
  if (d.mo_fr) parts.push(`Mo–Fr ${d.mo_fr}`);
  if (d.sa) parts.push(`Sa ${d.sa}`);
  if (d.so) parts.push(`So ${d.so}`);
  return parts.length ? parts.join(' · ') : '—';
}
