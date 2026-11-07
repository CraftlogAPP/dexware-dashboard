// Diese Woche — Inhalt des Wochenbriefings der App (lib/weeklyBriefing.ts, Benachrichtigung Montag früh) am PC:
// fällig bis Sonntag (inkl. Überfälligem), gefährdete Garantien, Dichtheitskontrollen, Wartungsumsatz, Folgeeinsätze.

import { Link } from 'react-router-dom';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { DueCell } from '../badges';
import { useInst } from '../context';
import { startOfWeek } from '../portfolio';
import { fmtDay, kindInfo, leakDueLabel } from '../types';
import { fmtEuro, weeklyBriefing } from './logic';

export function Woche() {
  const { data, org, base } = useInst();
  const state = useAsync(async () => {
    const [sites, assets, lastService, lastLeak, followUps] = await Promise.all([
      data.sites(),
      data.assets(),
      data.lastService(),
      data.lastLeakCheck(),
      data.openFollowUps(),
    ]);
    return { sites, assets, lastService, lastLeak, followUps };
  }, [data]);
  useLiveRefresh([state.refresh], 60000);

  return (
    <LoadGuard state={state}>
      {({ sites, assets, lastService, lastLeak, followUps }) => {
        const monday = startOfWeek();
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        const w = weeklyBriefing(org, assets, sites, lastService, lastLeak, followUps, monday);
        return (
          <>
            <section className="idx-hero" aria-label="Diese Woche">
              <div className="idx-hero-label">
                📋 Woche {fmtDay(monday)} – {fmtDay(sunday)}
              </div>
              <div className="idx-hero-value aw-week-text">
                {w.body ?? 'Diese Woche ist nichts fällig ✓'}
              </div>
              <div className="idx-hero-sub">
                Derselbe Überblick wie im Wochenbriefing der App (Montag früh). Überfällige Rechnungen stehen unter{' '}
                <Link to={`${base}/rechnungen`}>Rechnungen</Link>.
              </div>
            </section>

            <div className="kpi-grid">
              <div className="kpi">
                <div className="kpi-label">Wartungen fällig</div>
                <div className="kpi-value">{w.due}</div>
                <div className="kpi-sub">{w.overdue ? `davon ${w.overdue} überfällig` : 'bis Sonntag'}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Wartungsumsatz</div>
                <div className="kpi-value">{w.euro > 0 ? fmtEuro(w.euro) : '—'}</div>
                <div className="kpi-sub">Vertragspreis bzw. Preis je Anlagentyp</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Garantien gefährdet</div>
                <div className="kpi-value">{w.warranty}</div>
                <div className="kpi-sub">
                  <Link to={`${base}/auswertungen/garantie`}>Zu „Garantie in Gefahr“</Link>
                </div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Dichtheitskontrollen (F-Gas)</div>
                <div className="kpi-value">{w.leak}</div>
                <div className="kpi-sub">bis Sonntag fällig</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Folgeeinsätze offen</div>
                <div className="kpi-value">{w.follow}</div>
              </div>
            </div>

            {w.items.length > 0 && (
              <>
                <h3 className="aw-h">Anlagen dieser Woche</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fällig</th>
                        <th>Anlage</th>
                        <th>Kunde · Objekt</th>
                        <th className="idx-num">Preis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {w.items.map((x) => (
                        <tr key={x.asset.id}>
                          <td>
                            {x.service ? <DueCell info={x.service} /> : <span className="muted">Wartung später</span>}
                            {x.leak && <span className="idx-sub">{leakDueLabel(x.leak)}</span>}
                          </td>
                          <td className="wrap">
                            <Link to={`${base}/anlagen/${x.asset.id}`}>{x.asset.name}</Link>
                            {x.warranty && (
                              <span className="badge red" style={{ marginLeft: 6 }}>
                                ⚠️ Garantie gefährdet
                              </span>
                            )}
                            <span className="idx-sub">
                              {kindInfo(x.asset.kind).emoji} {kindInfo(x.asset.kind).label}
                            </span>
                          </td>
                          <td className="wrap">
                            {x.site ? <Link to={`${base}/kunden/${x.site.id}`}>{x.site.operator_name || x.site.name}</Link> : '—'}
                            {x.site?.operator_name && <span className="idx-sub">{x.site.name}</span>}
                          </td>
                          <td className="idx-num">{x.price !== undefined ? fmtEuro(x.price) : <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted small">
                  Die Tour planst du unter <Link to={`${base}/wartung?f=due`}>Fällige Wartungen</Link> bzw. auf der{' '}
                  <Link to={`${base}/plantafel`}>Plantafel</Link>.
                </p>
              </>
            )}
          </>
        );
      }}
    </LoadGuard>
  );
}
