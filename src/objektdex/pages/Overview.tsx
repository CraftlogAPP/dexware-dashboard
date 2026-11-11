// Heute: welche Objekte sind heute fällig — grün erledigt, orange offen, rot überfällig (Datenbank: today_overview).
import { Link } from 'react-router-dom';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { useOd } from '../context';
import { DayBadge, fmtDayLong, fmtTimeB } from '../parts';
import { addDays, dayOf, todayBerlin, type DayStatus } from '../turnus';
import type { OdOperation, OdTodayRow } from '../types';

const ORDER: DayStatus[] = ['overdue', 'open', 'done', 'none'];
const HEAD: Record<DayStatus, string> = { overdue: 'Überfällig', open: 'Offen', done: 'Erledigt', none: 'Heute nichts fällig' };

export function Overview() {
  const { data, orgName, base } = useOd();
  const today = todayBerlin();
  const state = useAsync(async () => {
    const [rows, ops, defects] = await Promise.all([
      data.todayOverview(today),
      data.listOperations({ from: addDays(today, -6), to: today }),
      data.listDefects(),
    ]);
    return { rows, ops, openDefects: defects.filter((d) => d.status === 'open').length };
  }, [data, today]);
  useLiveRefresh([state.refresh]);

  return (
    <>
      <h1>Heute</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {orgName} · {fmtDayLong(today)} — live aus der ObjektDex-App.
      </p>
      <LoadGuard state={state}>
        {({ rows, ops, openDefects }) => {
          const withDue = rows.filter((r) => r.status !== 'none');
          const done = rows.filter((r) => r.status === 'done').length;
          const overdue = rows.filter((r) => r.status === 'overdue').length;
          const todayOps = ops.filter((o) => !o.canceled && o.started_at >= new Date(Date.now() - 864e5).toISOString());
          const pct = withDue.length ? Math.round((done / withDue.length) * 100) : 100;
          const names = new Map(rows.map((r) => [r.property_id, r.name]));
          return (
            <>
              <div className="kpi-grid">
                <div className="kpi od-kpi-ring">
                  <div className="kpi-label">Heute erledigt</div>
                  <div className="kpi-value">
                    {done} <span className="muted od-kpi-of">von {withDue.length}</span>
                  </div>
                  <div className="od-progress" aria-hidden>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Überfällig</div>
                  <div className="kpi-value" style={{ color: overdue ? 'var(--red)' : undefined }}>{overdue}</div>
                  <div className="kpi-sub">Objekte mit verpasstem Termin</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Einsätze 24 h</div>
                  <div className="kpi-value">{todayOps.length}</div>
                  <div className="kpi-sub">ohne Stornos</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Offene Mängel</div>
                  <div className="kpi-value">{openDefects}</div>
                  <div className="kpi-sub">
                    <Link to={`${base}/maengel`}>ansehen →</Link>
                  </div>
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="card empty">Noch keine aktiven Objekte. Lege sie unter „Objekte“ oder in der App an.</div>
              ) : (
                ORDER.map((st) => {
                  const list = rows.filter((r) => r.status === st);
                  if (!list.length) return null;
                  return (
                    <section key={st} className={`od-group od-${st}`}>
                      <div className="section-head">
                        <h2>
                          <span className={`od-dot od-dot-${st}`} aria-hidden /> {HEAD[st]} <span className="muted">{list.length}</span>
                        </h2>
                      </div>
                      <div className="od-today-grid">
                        {list.map((r) => (
                          <TodayCard key={r.property_id} r={r} />
                        ))}
                      </div>
                    </section>
                  );
                })
              )}

              <div className="section-head">
                <h2>Letzte Einsätze</h2>
                <Link to={`${base}/einsaetze`} className="small">
                  Alle Einsätze →
                </Link>
              </div>
              <RecentOps ops={ops.slice(0, 8)} names={names} />
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}

function TodayCard({ r }: { r: OdTodayRow }) {
  const { base } = useOd();
  return (
    <Link to={`${base}/objekte/${r.property_id}`} className={`card od-today-card od-${r.status}`}>
      <div className="od-today-name">{r.name}</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <DayBadge status={r.status} />
        {r.due > 0 && (
          <span className="muted small">
            {r.done} von {r.due} Leistungen heute
          </span>
        )}
        {r.overdue > 0 && <span className="muted small">{r.overdue} überfällig</span>}
      </div>
    </Link>
  );
}

function RecentOps({ ops, names }: { ops: OdOperation[]; names: Map<string, string> }) {
  if (!ops.length) return <div className="card empty">Diese Woche noch keine Einsätze.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Zeit</th>
            <th>Objekt</th>
            <th>Leistungen</th>
            <th>Von</th>
          </tr>
        </thead>
        <tbody>
          {ops.map((o) => (
            <tr key={o.id} className={o.canceled ? 'od-canceled' : undefined}>
              <td>
                {fmtDayLong(dayOf(o.started_at))} · {fmtTimeB(o.started_at)}
              </td>
              <td className="wrap">{names.get(o.property_id) ?? '—'}</td>
              <td className="wrap">{o.canceled ? <span className="badge red">Storniert</span> : o.services.map((s) => s.name).join(' · ') || '—'}</td>
              <td className="muted">{o.performer_name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
