import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import { useOrg } from '../../components/OrgContext';
import { LoadGuard, useAsync } from '../../components/ui';
import { FormDialog, num, orNull, s, type FormValues } from '../../components/form';
import { fmtDate } from '../../lib/format';
import { fetchCustomers, fetchDevices, saveDevice } from '../api';
import { DueBadge } from '../badges';
import { dueStatus, nameMap, skLabel, type DueStatus } from '../labels';
import type { Device, ProtectionClass } from '../types';

export function Devices() {
  const { client } = useAppAuth();
  const { data: org } = useOrg();
  const [params] = useSearchParams();
  const [customerId, setCustomerId] = useState(params.get('kunde') ?? '');
  const [due, setDue] = useState<'' | DueStatus>('');
  const [editing, setEditing] = useState<Device | 'new' | null>(null);

  // Kundenliste ändert sich durch Filter nicht — einmal laden.
  const custState = useAsync(() => fetchCustomers(client), [client]);

  const devState = useAsync<Device[]>(
    () => fetchDevices(client, { customerId: customerId || undefined }),
    [client, customerId],
  );

  async function onSave(v: FormValues) {
    if (!org) throw new Error('Kein Betrieb geladen');
    await saveDevice(
      client,
      org.org.id,
      {
        customer_id: orNull(v.customer_id),
        qr_code: orNull(v.qr_code),
        name: s(v.name),
        device_type: orNull(v.device_type),
        manufacturer: orNull(v.manufacturer),
        serial_number: orNull(v.serial_number),
        protection_class: (orNull(v.protection_class) as ProtectionClass | null) ?? null,
        location_note: orNull(v.location_note),
        interval_months: num(v.interval_months) ?? 12,
        next_due_date: orNull(v.next_due_date),
      },
      editing === 'new' ? undefined : (editing ?? undefined),
    );
    devState.reload();
  }

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Geräte</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing('new')}>
          ＋ Gerät anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Ortsveränderliche elektrische Betriebsmittel mit Prüffristen-Ampel —
        sortiert nach Fälligkeit.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
            Kunde/Standort
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Alle Kunden</option>
              {(custState.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            Fälligkeit
            <select value={due} onChange={(e) => setDue(e.target.value as '' | DueStatus)}>
              <option value="">Alle</option>
              <option value="overdue">Überfällig</option>
              <option value="soon">Bald fällig</option>
              <option value="ok">Frist ok</option>
              <option value="none">Ungeprüft</option>
            </select>
          </label>
        </div>
      </div>

      <LoadGuard state={devState}>
        {(allDevices) => {
          const custNames = nameMap(custState.data ?? []);
          const devices = due
            ? allDevices.filter((d) => dueStatus(d.next_due_date) === due)
            : allDevices;
          return devices.length === 0 ? (
            <div className="card empty">Keine Geräte mit den gewählten Filtern.</div>
          ) : (
            <>
              <p className="muted small">{devices.length} Geräte</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gerät</th>
                      <th>QR/Etikett</th>
                      <th>Schutzklasse</th>
                      <th>Kunde/Standort</th>
                      <th>Nächste Prüfung</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <Link to={d.id}>{d.name}</Link>
                          {d.device_type && (
                            <div className="muted small">{d.device_type}</div>
                          )}
                        </td>
                        <td className="mono small muted">{d.qr_code ?? '—'}</td>
                        <td className="muted">{skLabel(d.protection_class)}</td>
                        <td className="wrap muted">
                          {d.customer_id ? (custNames.get(d.customer_id) ?? '—') : '—'}
                        </td>
                        <td>{d.next_due_date ? fmtDate(d.next_due_date) : '—'}</td>
                        <td>
                          <DueBadge status={dueStatus(d.next_due_date)} />
                        </td>
                        <td>
                          <button className="btn ghost small" onClick={() => setEditing(d)}>
                            Bearbeiten
                          </button>
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

      {editing && (
        <FormDialog
          title={editing === 'new' ? 'Gerät anlegen' : `${editing.name} bearbeiten`}
          onClose={() => setEditing(null)}
          onSave={onSave}
          fields={[
            { key: 'name', label: 'Gerät', required: true, placeholder: 'z. B. Bohrmaschine' },
            { key: 'device_type', label: 'Gerätetyp', placeholder: 'z. B. Handwerkzeug' },
            { key: 'qr_code', label: 'QR-Code / Etikett' },
            { key: 'manufacturer', label: 'Hersteller' },
            { key: 'serial_number', label: 'Seriennummer' },
            {
              key: 'protection_class',
              label: 'Schutzklasse',
              kind: 'select',
              options: [
                { value: 'I', label: 'SK I (Schutzleiter)' },
                { value: 'II', label: 'SK II (Schutzisolierung)' },
                { value: 'III', label: 'SK III (Schutzkleinspannung)' },
              ],
            },
            {
              key: 'customer_id',
              label: 'Kunde/Standort',
              kind: 'select',
              options: (custState.data ?? []).map((c) => ({ value: c.id, label: c.name })),
            },
            { key: 'location_note', label: 'Standort-Notiz', placeholder: 'z. B. Werkstatt Regal 3' },
            {
              key: 'interval_months',
              label: 'Prüfintervall (Monate)',
              kind: 'number',
              required: true,
              hint: 'DGUV V3: üblich 6–24 Monate je nach Beanspruchung',
            },
            {
              key: 'next_due_date',
              label: 'Nächste Prüfung',
              kind: 'date',
              hint: 'Wird bei jeder erfassten Prüfung automatisch fortgeschrieben',
            },
          ]}
          initial={
            editing === 'new'
              ? { interval_months: '12' }
              : {
                  name: editing.name,
                  device_type: editing.device_type ?? '',
                  qr_code: editing.qr_code ?? '',
                  manufacturer: editing.manufacturer ?? '',
                  serial_number: editing.serial_number ?? '',
                  protection_class: editing.protection_class ?? '',
                  customer_id: editing.customer_id ?? '',
                  location_note: editing.location_note ?? '',
                  interval_months: String(editing.interval_months),
                  next_due_date: editing.next_due_date ?? '',
                }
          }
        />
      )}
    </>
  );
}
