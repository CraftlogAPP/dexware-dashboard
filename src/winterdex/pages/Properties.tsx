import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppAuth } from '../../auth/AppAuthContext';
import {
  fetchOperationMeta,
  fetchProperties,
  type OpMeta,
} from '../api';
import { LoadGuard, StatusBadge, useAsync } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { lastOpByProperty } from '../labels';
import { PropertyDialog } from '../dialogs';
import { Modal } from '../../components/form';
import type { DutyTimes, Property } from '../types';

interface Data {
  properties: Property[];
  lastByProp: Map<string, OpMeta>;
}

/** Gratis-Paket: so viele Objekte wie in der App (mobile/src/lib/entitlement.ts → FREE_LIMITS.properties). */
const FREE_PROPERTIES = 2;

export function Properties() {
  const { client } = useAppAuth();
  const [editing, setEditing] = useState<Property | 'new' | null>(null);
  const [gate, setGate] = useState(false);

  const state = useAsync<Data>(async () => {
    const [properties, meta] = await Promise.all([
      fetchProperties(client),
      fetchOperationMeta(client),
    ]);
    return { properties, lastByProp: lastOpByProperty(meta) };
  }, [client]);

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Objekte</h1>
        <div className="spacer" />
        <button
          className="btn"
          onClick={() => {
            void (async () => {
              const count = state.data?.properties.length ?? 0;
              if (count >= FREE_PROPERTIES) {
                // Pro des Betriebs laut Server (Abo, Team, Kommunal-Lizenz, Suite). Im Zweifel erlaubt — nie zu Unrecht sperren.
                const { data, error } = await client.rpc('org_pro_active');
                if (!error && data === false) return setGate(true);
              }
              setEditing('new');
            })();
          }}
        >
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

      {gate && (
        <Modal title="Mehr Objekte mit Pro" onClose={() => setGate(false)} dirty={false}>
          <p>
            Im Gratis-Paket sind {FREE_PROPERTIES} Objekte möglich. Unbegrenzt viele Objekte gibt es mit Pro — das Abo schließt du in
            der WinterDex-App (Android) unter „Abo“ ab. Ohne Android-Gerät? Schreib uns an{' '}
            <a href="mailto:support@dexware.app?subject=WinterDex%20Pro%20ohne%20Android">support@dexware.app</a>.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn" onClick={() => setGate(false)}>
              Verstanden
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <PropertyDialog
          property={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            state.reload();
          }}
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
