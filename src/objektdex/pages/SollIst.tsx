// Soll/Ist je Objekt und Monat (Datenbank: soll_ist). Laufender Monat zählt bis heute.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadGuard, useAsync } from '../../components/ui';
import { useOd } from '../context';
import { SollIstBadge } from '../parts';
import { addMonths, cadenceText, lastOfMonth, todayBerlin } from '../turnus';

export function SollIst() {
  const { data, base } = useOd();
  const [params] = useSearchParams();
  const today = todayBerlin();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [propertyId, setPropertyId] = useState(params.get('objekt') ?? '');
  const from = `${month}-01`;
  const to = lastOfMonth(from) < today ? lastOfMonth(from) : today;
  const future = from > today;

  const state = useAsync(async () => {
    const props = (await data.listProperties()).filter((p) => p.active || p.id === propertyId);
    const chosen = propertyId ? props.filter((p) => p.id === propertyId) : props;
    const services = await data.listServices();
    const rows = future ? [] : await Promise.all(chosen.map((p) => data.sollIst(p.id, from, to)));
    return { props, chosen, rows, services };
  }, [data, from, to, propertyId, future]);

  const monthOptions = Array.from({ length: 13 }, (_, i) => addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7));

  return (
    <>
      <h1>Soll/Ist</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        Wie oft war eine Leistung laut Turnus fällig — und wie oft wurde sie erledigt? Ein Tag zählt einmal, Stornos zählen nicht.
      </p>
      <div className="card od-filter">
        <label className="field">
          Monat
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-15T12:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })}
                {m === today.slice(0, 7) ? ' (bis heute)' : ''}
              </option>
            ))}
          </select>
        </label>
        <LoadGuard state={state}>
          {({ props }) => (
            <label className="field">
              Objekt
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">Alle aktiven Objekte</option>
                {props.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </LoadGuard>
      </div>
      <LoadGuard state={state}>
        {({ chosen, rows, services }) => (
          <div className="od-sollist-grid">
            {chosen.map((p, i) => {
              const r = rows[i] ?? [];
              const soll = r.reduce((a, x) => a + (x.soll ?? 0), 0);
              const ist = r.reduce((a, x) => a + (x.soll == null ? 0 : Math.min(x.ist, x.soll)), 0);
              const pct = soll ? Math.round((ist / soll) * 100) : null;
              return (
                <div key={p.id} className="card od-sollist-card">
                  <div className="section-head" style={{ marginTop: 0 }}>
                    <h2 style={{ margin: 0 }}>
                      <Link to={`${base}/objekte/${p.id}`}>{p.name}</Link>
                    </h2>
                    <div className="spacer" />
                    {pct != null && <span className={pct >= 100 ? 'badge green' : pct >= 75 ? 'badge amber' : 'badge red'}>{pct} % erfüllt</span>}
                  </div>
                  {r.length === 0 ? (
                    <p className="muted">Keine Leistungen in diesem Monat.</p>
                  ) : (
                    <table className="od-sollist">
                      <tbody>
                        {r.map((x) => {
                          const sv = services.find((s) => s.id === x.service_id);
                          return (
                            <tr key={x.service_id}>
                              <td className="wrap">
                                <b>{x.name}</b>
                                <div className="muted small">{sv ? cadenceText({ cadence: sv.cadence, weekdays: sv.weekdays, monthDay: sv.month_day }) : ''}</div>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <SollIstBadge soll={x.soll} ist={x.ist} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </LoadGuard>
    </>
  );
}
