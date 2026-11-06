import { Link } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { DueCell, JobBadge, LeakLine, RequestKindBadge, WarrantyRiskBadge } from '../badges';
import { useInst } from '../context';
import { RequestCard } from '../parts';
import { buildDueRows, byDue, contractStatsOf, counts, onlyDemo, potentialOf, startOfWeek } from '../portfolio';
import { byRequestRank, dueBucket, fmtEur, kindInfo, slotLabel, type Asset, type Site } from '../types';

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function Start() {
  const { data, org, base, requestsVersion, isOwner } = useInst();

  const state = useAsync(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [sites, assets, lastService, lastLeak, week, newRequests, openDefects, appointments, followUps] = await Promise.all([
      data.sites(),
      data.assets(),
      data.lastService(),
      data.lastLeakCheck(),
      data.jobsSince(startOfWeek()),
      data.requests({ status: 'new' }),
      data.defects({ status: 'open' }),
      data.appointments(today),
      data.openFollowUps(),
    ]);
    return { sites, assets, lastService, lastLeak, week, newRequests, openDefects, appointments, followUps };
  }, [data, requestsVersion]);
  useLiveRefresh([state.refresh]);

  return (
    <>
      <h1>Start</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {org.name} · fällige Wartungen, Anfragen vom Anlagenpass und Einsätze auf einen Blick — live aus der App.
      </p>

      <LoadGuard state={state}>
        {({ sites, assets, lastService, lastLeak, week, newRequests, openDefects, appointments, followUps }) => {
          // Org kommt aus dem Kontext (nicht aus dem Lade-Ergebnis): neue Preise wirken sofort.
          const allRows = buildDueRows(org, sites, assets, lastService, lastLeak);
          // Wie die App: gibt es nur Beispiel-Anlagen, rechnet der Start mit diesen (sonst stünde überall 0).
          const demoOnly = onlyDemo(allRows);
          const rows = allRows.filter((r) => counts(r, demoOnly));
          const pot = potentialOf(org, allRows, demoOnly);
          const contracts = contractStatsOf(allRows, demoOnly);
          // Kacheln wie in der App: Wartung ODER Pflicht-Dichtheitskontrolle (F-Gas), der dringendere Termin zählt.
          const overdue = rows.filter((r) => r.worst === 'overdue').length;
          const in30 = rows.filter((r) => r.worst === 'd30').length;
          const in90 = rows.filter((r) => r.worst === 'd30' || r.worst === 'd90').length;
          const leakIn = (b: string) => rows.filter((r) => r.leak && r.leak.state !== 'never' && dueBucket(r.leak) === b).length;
          const leakOverdue = leakIn('overdue');
          const leak30 = leakIn('d30');
          // Für den Preis-Hinweis nur Wartungen (das Potenzial rechnet mit Wartungspreisen)
          const maintDue = rows.filter((r) => r.bucket === 'overdue' || r.bucket === 'd30' || r.bucket === 'd90').length;
          const next = rows.filter((r) => r.worst === 'overdue' || r.worst === 'd30').sort(byDue);
          const siteById = new Map<string, Site>(sites.map((s) => [s.id, s]));
          const assetById = new Map<string, Asset>(assets.map((a) => [a.id, a]));
          const faults = newRequests.filter((r) => r.kind === 'fault');
          const quotes = newRequests.filter((r) => r.kind === 'quote');
          // Neue Störungen → neue Angebote → neue Wartungen (wie Inbox und App)
          const sortedRequests = [...newRequests].sort(byRequestRank);
          const requestSub = [faults.length ? `${faults.length}× Störung` : '', quotes.length ? `${quotes.length}× Angebot` : '']
            .filter(Boolean)
            .join(', ');
          const blocked = openDefects.filter((d) => d.item_blocked && d.severity === 'red');

          return (
            <>
              {blocked.length > 0 && (
                <div className="error-box">
                  🚨 {blocked.length === 1 ? 'Eine Anlage ist' : `${blocked.length} Anlagen sind`} wegen eines roten Mangels außer
                  Betrieb:{' '}
                  {blocked.map((d, i) => (
                    <span key={d.id}>
                      {i > 0 && ', '}
                      <Link to={`${base}/anlagen/${d.item_id}`}>
                        {assetById.get(d.item_id)?.name ?? 'Anlage'} ({siteById.get(d.site_id)?.name ?? 'Objekt'})
                      </Link>
                    </span>
                  ))}
                </div>
              )}

              {/* Umsatzzahlen wie in der App nur für den Inhaber. */}
              {isOwner && (
              <section className="idx-hero" aria-label="Offenes Wartungspotenzial">
                <div className="idx-hero-label">
                  Offenes Wartungspotenzial{demoOnly && <span className="badge" style={{ marginLeft: 8 }}>Beispiel</span>}
                </div>
                {pot.noPrices && contracts.count === 0 ? (
                  <>
                    <div className="idx-hero-value" style={{ fontSize: 26, lineHeight: 1.25 }}>
                      Preise eintragen, um das Potenzial zu sehen
                    </div>
                    <div className="idx-hero-sub">
                      {maintDue} Anlagen sind mit der Wartung überfällig oder in den nächsten 90 Tagen fällig. Mit deinem Preis je
                      Wartung zeigt dir diese Zahl, wie viel Umsatz in diesen Wartungen steckt.
                    </div>
                    <Link className="btn" to={`${base}/einstellungen#preise`}>
                      <SettingsIcon className="i" aria-hidden /> Preise eintragen
                    </Link>
                  </>
                ) : (
                  <>
                    <div className="idx-hero-value">{fmtEur(pot.sum)}</div>
                    <div className="idx-hero-sub">
                      {pot.priced} {pot.priced === 1 ? 'Anlage' : 'Anlagen'} überfällig oder in den nächsten 90 Tagen fällig ×
                      Preis je Wartung (bei Wartungsverträgen der Vertragspreis).
                    </div>
                    <div className="idx-hero-split">
                      <span>
                        davon überfällig: <b>{fmtEur(pot.overdueSum)}</b>
                      </span>
                      <span>
                        in den nächsten 90 Tagen: <b>{fmtEur(pot.sum - pot.overdueSum)}</b>
                      </span>
                      <Link to={`${base}/wartung?f=due`}>Zur Wartungsliste →</Link>
                    </div>
                    {pot.unpriced > 0 && (
                      <div className="idx-hero-sub" style={{ marginTop: 10 }}>
                        {pot.unpriced} fällige {pot.unpriced === 1 ? 'Anlage zählt' : 'Anlagen zählen'} nicht mit, weil für den
                        Typ kein Preis eingetragen ist ({pot.unpricedKinds.map((k) => `${k.label} ${k.count}×`).join(', ')}).{' '}
                        <Link to={`${base}/einstellungen#preise`}>Preise eintragen</Link>
                      </div>
                    )}
                  </>
                )}
                {contracts.count > 0 && (
                  <div className="idx-hero-contract">
                    🤝 <b>{contracts.count}</b> {contracts.count === 1 ? 'Wartungsvertrag' : 'Wartungsverträge'}
                    {contracts.yearly > 0 && (
                      <>
                        {' '}
                        · <b>{fmtEur(contracts.yearly)}</b> fester Umsatz im Jahr
                      </>
                    )}
                    {contracts.withoutPrice > 0 && <> · {contracts.withoutPrice} ohne Preis</>}
                    {' '}
                    <Link to={`${base}/wartung?f=all&vertrag=1`}>Vertragsanlagen ansehen →</Link>
                  </div>
                )}
              </section>
              )}

              <div className="kpi-grid">
                <Link className="kpi idx-kpi-link idx-kpi-red" to={`${base}/wartung?f=overdue`}>
                  <div className="kpi-label">Überfällig</div>
                  <div className="kpi-value">{overdue}</div>
                  <div className="kpi-sub">{leakOverdue > 0 ? `davon ${leakOverdue}× Dichtheitskontrolle (F-Gas)` : 'Wartung schon fällig'}</div>
                </Link>
                <Link className="kpi idx-kpi-link idx-kpi-amber" to={`${base}/wartung?f=d30`}>
                  <div className="kpi-label">In 30 Tagen fällig</div>
                  <div className="kpi-value">{in30}</div>
                  <div className="kpi-sub">{leak30 > 0 ? `davon ${leak30}× Dichtheitskontrolle (F-Gas)` : 'jetzt Termine machen'}</div>
                </Link>
                <Link className="kpi idx-kpi-link" to={`${base}/wartung?f=d90`}>
                  <div className="kpi-label">In 90 Tagen fällig</div>
                  <div className="kpi-value">{in90}</div>
                  <div className="kpi-sub">inkl. der nächsten 30 Tage</div>
                </Link>
                <Link className="kpi idx-kpi-link idx-kpi-accent" to={`${base}/anfragen`}>
                  <div className="kpi-label">Neue Anfragen</div>
                  <div className="kpi-value">{newRequests.length}</div>
                  <div className="kpi-sub">
                    {requestSub ? `davon ${requestSub}` : 'vom Anlagenpass'}
                  </div>
                </Link>
                <div className="kpi">
                  <div className="kpi-label">Einsätze diese Woche</div>
                  <div className="kpi-value">{week.length}</div>
                  <div className="kpi-sub">seit Montag, ohne Stornos</div>
                </div>
              </div>

              <div className="section-head">
                <h2>Neue Anfragen</h2>
                <Link to={`${base}/anfragen`} className="small">
                  Alle Anfragen →
                </Link>
              </div>
              {sortedRequests.length === 0 ? (
                <div className="card empty">
                  Keine neuen Anfragen. Kunden fragen über den QR-Anlagenpass an der Anlage an — die Anfragen landen hier.
                </div>
              ) : (
                <div className="idx-req-list">
                  {sortedRequests.slice(0, 5).map((r) => {
                    const a = r.asset_id ? assetById.get(r.asset_id) : undefined;
                    const s = siteById.get(r.site_id ?? a?.site_id ?? '');
                    return <RequestCard key={r.id} r={r} asset={a} site={s} base={base} />;
                  })}
                </div>
              )}

              {(() => {
                // Nur aktive Objekte und Anlagen in Betrieb (wie die App)
                const open = followUps.filter((f) => {
                  const a = assetById.get(f.item_id);
                  const s = siteById.get(f.site_id);
                  return a && !a.retired && s && s.active;
                });
                if (open.length === 0) return null;
                const days = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
                return (
                  <>
                    <div className="section-head">
                      <h2>🔁 Offene Folgeeinsätze ({open.length})</h2>
                    </div>
                    <p className="muted small" style={{ marginTop: -6 }}>
                      Vom Monteur als „Folgeeinsatz nötig“ vermerkt — erledigt, sobald an der Anlage der nächste Einsatz gespeichert wird.
                    </p>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Seit</th>
                            <th>Was ist zu tun</th>
                            <th>Anlage · Kunde</th>
                            <th className="idx-hide-sm">Monteur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {open.slice(0, 10).map((f) => {
                            const a = assetById.get(f.item_id)!;
                            const s = siteById.get(f.site_id)!;
                            const d = days(f.started_at);
                            return (
                              <tr key={f.inspection_id}>
                                <td style={d > 14 ? { color: '#fcd34d' } : undefined}>
                                  {d === 0 ? 'heute' : d === 1 ? 'gestern' : `${d} Tagen`}
                                  <span className="idx-sub">{fmtDateTime(f.started_at)}</span>
                                </td>
                                <td className="wrap">{f.follow_up}</td>
                                <td className="wrap">
                                  <Link to={`${base}/anlagen/${a.id}`}>{a.name}</Link>
                                  <span className="idx-sub">{s.operator_name ? `${s.operator_name} · ` : ''}{s.name}</span>
                                </td>
                                <td className="wrap muted idx-hide-sm">{f.inspector_name ?? '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {open.length > 10 && <p className="idx-sum">+ {open.length - 10} weitere</p>}
                  </>
                );
              })()}

              <div className="section-head">
                <h2>Nächste Termine</h2>
              </div>
              {appointments.length === 0 ? (
                <div className="card empty">
                  Keine gewählten Termine. In einer Anfrage schlägst du bis zu 3 Termine vor — der Kunde wählt per Link.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Termin</th>
                        <th>Art</th>
                        <th>Anlage · Objekt</th>
                        <th className="idx-hide-sm">Kontakt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointments.slice(0, 10).map((r) => {
                        const a = r.asset_id ? assetById.get(r.asset_id) : undefined;
                        const s = siteById.get(r.site_id ?? a?.site_id ?? '');
                        return (
                          <tr key={r.id}>
                            <td>
                              <Link to={`${base}/anfragen/${r.id}`}>{slotLabel(r.scheduled_at!, r.scheduled_end)} Uhr</Link>
                              {isToday(r.scheduled_at!) && <span className="idx-sub" style={{ color: '#86efac' }}>heute</span>}
                            </td>
                            <td>
                              <RequestKindBadge kind={r.kind} />
                            </td>
                            <td className="wrap">
                              {a ? <Link to={`${base}/anlagen/${a.id}`}>{a.name}</Link> : '—'}
                              <span className="idx-sub">{s ? `${s.operator_name ? `${s.operator_name} · ` : ''}${s.name}` : ''}</span>
                            </td>
                            <td className="wrap muted idx-hide-sm">
                              {r.contact_name ?? '—'}
                              {r.contact_phone && <span className="idx-sub">{r.contact_phone}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="section-head">
                <h2>Als Nächstes fällig</h2>
                <Link to={`${base}/wartung?f=due`} className="small">
                  Ganze Wartungsliste →
                </Link>
              </div>
              {next.length === 0 ? (
                <div className="card empty">In den nächsten 30 Tagen ist keine Wartung fällig.</div>
              ) : (
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
                      {next.slice(0, 8).map((r) => (
                        <tr key={r.asset.id}>
                          <td>
                            <DueCell info={r.due} />
                            <LeakLine leak={r.leak && r.leak.state !== 'ok' ? r.leak : null} compact />
                          </td>
                          <td className="wrap">
                            <Link to={`${base}/anlagen/${r.asset.id}`}>{r.asset.name}</Link>{' '}
                            <WarrantyRiskBadge asset={r.asset} due={r.due} />
                            <span className="idx-sub">
                              {kindInfo(r.asset.kind).emoji} {kindInfo(r.asset.kind).label}
                            </span>
                          </td>
                          <td className="wrap">
                            {r.site?.operator_name ?? '—'}
                            <span className="idx-sub">{r.site?.name}</span>
                          </td>
                          <td className="idx-num">{r.price !== undefined ? fmtEur(r.price) : <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {next.length > 8 && (
                <p className="idx-sum">
                  + {next.length - 8} weitere — <Link to={`${base}/wartung?f=d30`}>alle anzeigen</Link>
                </p>
              )}

              <div className="section-head">
                <h2>Diese Woche dokumentiert</h2>
              </div>
              {week.length === 0 ? (
                <div className="card empty">Seit Montag wurde noch kein Einsatz dokumentiert.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Zeitpunkt</th>
                        <th>Einsatz</th>
                        <th>Anlage · Objekt</th>
                        <th className="idx-hide-sm">Monteur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {week.slice(0, 20).map((j) => (
                        <tr key={j.id}>
                          <td>{fmtDateTime(j.started_at)}</td>
                          <td>
                            <JobBadge type={j.type} />
                          </td>
                          <td className="wrap">
                            <Link to={`${base}/anlagen/${j.item_id}`}>{assetById.get(j.item_id)?.name ?? 'Anlage'}</Link>
                            <span className="idx-sub">{siteById.get(j.site_id)?.name ?? '—'}</span>
                          </td>
                          <td className="muted idx-hide-sm">{j.inspector_name ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
