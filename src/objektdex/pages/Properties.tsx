// Objekte: Liste mit Tagesstatus, Zahl der Leistungen und offenen Mängeln; Inhaber legt an.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LoadGuard, useAsync } from '../../components/ui';
import { useOd } from '../context';
import { DayBadge } from '../parts';
import { todayBerlin } from '../turnus';
import { PropertyDialog } from './PropertyDetail';

export function Properties() {
  const { data, role, base } = useOd();
  const nav = useNavigate();
  const [adding, setAdding] = useState(false);
  const [showPaused, setShowPaused] = useState(false);
  const state = useAsync(async () => {
    const [props, services, defects, today] = await Promise.all([data.listProperties(), data.listServices(), data.listDefects(), data.todayOverview(todayBerlin())]);
    return { props, services, defects, today: new Map(today.map((t) => [t.property_id, t])) };
  }, [data]);

  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Objekte</h1>
        <div className="spacer" />
        {role === 'owner' && (
          <button className="btn" onClick={() => setAdding(true)}>
            ＋ Objekt anlegen
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Je Objekt die Leistungen mit Turnus — daraus entstehen „Heute“ und Soll/Ist.
      </p>
      {adding && (
        <PropertyDialog
          onClose={() => setAdding(false)}
          onSaved={() => {
            state.reload();
          }}
        />
      )}
      <LoadGuard state={state}>
        {({ props, services, defects, today }) => {
          const active = props.filter((p) => p.active);
          const paused = props.filter((p) => !p.active);
          const rows = showPaused ? props : active;
          if (!props.length) return <div className="card empty">Noch keine Objekte. Leg das erste Objekt an — oder in der App.</div>;
          return (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Objekt</th>
                      <th>Auftraggeber</th>
                      <th>Heute</th>
                      <th>Leistungen</th>
                      <th>Offene Mängel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const t = today.get(p.id);
                      const n = services.filter((s) => s.property_id === p.id && s.active).length;
                      const d = defects.filter((x) => x.property_id === p.id && x.status === 'open').length;
                      return (
                        <tr key={p.id} className="od-click" onClick={() => nav(`${base}/objekte/${p.id}`)}>
                          <td className="wrap">
                            <Link to={`${base}/objekte/${p.id}`} onClick={(e) => e.stopPropagation()}>
                              <b>{p.name}</b>
                            </Link>
                            <div className="muted small">{p.address || '—'}</div>
                          </td>
                          <td className="wrap muted">{p.customer_name ?? '—'}</td>
                          <td>{!p.active ? <span className="badge">pausiert</span> : t ? <DayBadge status={t.status} /> : '—'}</td>
                          <td>{n || <span className="badge amber">keine</span>}</td>
                          <td>{d ? <span className="badge red">{d}</span> : <span className="muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {paused.length > 0 && (
                <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setShowPaused((v) => !v)}>
                  {showPaused ? 'Pausierte ausblenden' : `Pausierte Objekte zeigen (${paused.length})`}
                </button>
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
