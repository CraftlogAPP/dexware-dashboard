// Einsätze: Filter Objekt/Zeitraum/Person, Fotos, Prüfcode; storniert sichtbar. Storno nur Inhaber (cancel_operation).
// Einsätze sind unveränderlich — es gibt bewusst kein „Bearbeiten“ und kein „Nachtragen“ im Dashboard.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FormDialog, s, type FormValues } from '../../components/form';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { useOd } from '../context';
import { fmtDayLong, fmtTimeB, PhotoButton } from '../parts';
import { addDays, dayOf, formatDay, parseGermanDay, todayBerlin } from '../turnus';
import type { OdOperation } from '../types';

export function Operations() {
  const { data, role } = useOd();
  const [params] = useSearchParams();
  const today = todayBerlin();
  const [propertyId, setPropertyId] = useState(params.get('objekt') ?? '');
  const [from, setFrom] = useState(formatDay(addDays(today, -13)));
  const [to, setTo] = useState(formatDay(today));
  const [person, setPerson] = useState('');
  const [canceling, setCanceling] = useState<OdOperation | null>(null);
  const fromDay = parseGermanDay(from);
  const toDay = parseGermanDay(to);
  const rangeOk = !!fromDay && !!toDay && fromDay <= toDay;

  const propsState = useAsync(() => data.listProperties(), [data]);
  const state = useAsync(
    () => (rangeOk ? data.listOperations({ from: fromDay!, to: toDay!, propertyId: propertyId || undefined }) : Promise.resolve([] as OdOperation[])),
    [data, fromDay, toDay, propertyId, rangeOk],
  );
  useLiveRefresh([state.refresh]);

  async function onCancel(v: FormValues) {
    if (!canceling) return;
    await data.cancelOperation(canceling.id, s(v.reason));
    state.reload();
  }

  return (
    <>
      <h1>Einsätze</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Unveränderliches Protokoll aus der App — Stornos bleiben sichtbar und gekennzeichnet.
      </p>
      <div className="card od-filter">
        <label className="field">
          Objekt
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">Alle Objekte</option>
            {(propsState.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Von
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="TT.MM.JJJJ" />
        </label>
        <label className="field">
          Bis
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="TT.MM.JJJJ" />
        </label>
        <label className="field">
          Person
          <input type="search" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Name" />
        </label>
      </div>
      {!rangeOk && <div className="error-box">Zeitraum bitte als TT.MM.JJJJ eingeben (Von nicht nach Bis).</div>}
      <LoadGuard state={state}>
        {(ops) => {
          const names = new Map((propsState.data ?? []).map((p) => [p.id, p.name]));
          const q = person.trim().toLowerCase();
          const list = q ? ops.filter((o) => (o.performer_name ?? '').toLowerCase().includes(q)) : ops;
          if (!list.length) return <div className="card empty">Keine Einsätze im gewählten Zeitraum.</div>;
          const days: string[] = [];
          for (const o of list) {
            const d = dayOf(o.started_at);
            if (!days.includes(d)) days.push(d);
          }
          return (
            <>
              <p className="muted small">
                {list.filter((o) => !o.canceled).length} Einsätze{list.some((o) => o.canceled) ? `, ${list.filter((o) => o.canceled).length} storniert` : ''}
              </p>
              {days.map((d) => (
                <section key={d}>
                  <h3 className="od-dayhead">{d === today ? 'Heute' : d === addDays(today, -1) ? 'Gestern' : fmtDayLong(d)}</h3>
                  <div className="table-wrap">
                    <table className="od-ops">
                      <thead>
                        <tr>
                          <th>Zeit</th>
                          <th>Objekt</th>
                          <th>Leistungen</th>
                          <th>Von</th>
                          <th>Vor Ort</th>
                          <th>Fotos</th>
                          <th>Prüfcode</th>
                          {role === 'owner' && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {list
                          .filter((o) => dayOf(o.started_at) === d)
                          .map((o) => (
                            <tr key={o.id} className={o.canceled ? 'od-canceled' : undefined}>
                              <td>
                                {fmtTimeB(o.started_at)}
                                {o.ended_at ? `–${fmtTimeB(o.ended_at)}` : ''}
                              </td>
                              <td className="wrap">{names.get(o.property_id) ?? '—'}</td>
                              <td className="wrap">
                                {o.canceled ? (
                                  <>
                                    <span className="badge red">Storniert</span> <span className="muted small">{o.cancel_reason}</span>
                                  </>
                                ) : (
                                  o.services.map((x) => x.name).join(' · ') || <span className="muted">Kontrolle vor Ort</span>
                                )}
                                {o.notes && !o.canceled && <div className="muted small">{o.notes}</div>}
                              </td>
                              <td className="muted">{o.performer_name ?? '—'}</td>
                              <td className="muted">
                                {o.lat == null ? (
                                  <span className="badge amber">kein GPS</span>
                                ) : (
                                  <>
                                    ±{Math.round(o.gps_accuracy_m ?? 0)} m{o.distance_m != null ? ` · ${Math.round(o.distance_m)} m vom Objekt` : ''}
                                    {o.gps_mocked && <div className="badge red">Fake-GPS</div>}
                                  </>
                                )}
                              </td>
                              <td>
                                <PhotoButton kind="operation" id={o.id} count={o.photo_count} />
                              </td>
                              <td className="mono small muted" title={o.entry_hash ?? ''}>
                                {o.entry_hash ? o.entry_hash.slice(0, 10) : '—'}
                              </td>
                              {role === 'owner' && (
                                <td>
                                  {!o.canceled && (
                                    <button className="btn ghost small" onClick={() => setCanceling(o)}>
                                      Stornieren
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </>
          );
        }}
      </LoadGuard>
      {canceling && (
        <FormDialog
          title={`Einsatz stornieren — ${fmtDayLong(dayOf(canceling.started_at))}, ${fmtTimeB(canceling.started_at)}`}
          submitLabel="Stornieren"
          onClose={() => setCanceling(null)}
          onSave={onCancel}
          fields={[{ key: 'reason', label: 'Storno-Grund', kind: 'textarea', required: true, hint: 'Der Einsatz bleibt im Protokoll sichtbar, nur gekennzeichnet. Storno ist endgültig.' }]}
        />
      )}
    </>
  );
}
