import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Settings as SettingsIcon } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { DueCell, JobBadge, LeakLine, RequestKindBadge, WarrantyRiskBadge } from '../badges';
import { useInst } from '../context';
import { readMerk, writeMerk } from '../merk';
import { requestTitle } from '../parts';
import { buildDueRows, byDue, contractStatsOf, counts, onlyDemo, potentialOf, startOfWeek } from '../portfolio';
import {
  REQUEST_KIND_LABELS,
  byRequestRank,
  dueBucket,
  fmtEur,
  kindInfo,
  relTime,
  slotLabel,
  type Asset,
  type ServiceRequest,
  type Site,
} from '../types';
import type { Appt } from '../planung/logic';

// Startseite des Betriebsportals (Vorschlag docs/VEREINFACHUNG-VORSCHLAG.md, Abschnitt 3.2):
// 1. „Heute zu tun“ — Störungen, Anfragen, Termine heute, Folgeeinsätze; je Zeile genau eine Aktion
// 2. Wartungen — Ampel-Kacheln + „Als Nächstes fällig“
// 3. Zahlen — nur Inhaber, einklappbar (Zustand je Nutzer gemerkt)
// Nichts ist weggefallen: die übrigen Termine und „Diese Woche dokumentiert“ stehen eingeklappt darunter.

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** Ein Eintrag in „Nächste Termine“: Plantafel-Termin oder vom Kunden gewählter Termin einer Anfrage. */
type Upcoming =
  | { kind: 'plan'; id: string; start: string; end: string; a: Appt }
  | { kind: 'request'; id: string; start: string; end: string | null; r: ServiceRequest };

/**
 * Wie die App (SitesScreen „Nächste Termine“): geplante Plantafel-Termine + vom Kunden gewählte Termine offener
 * Anfragen, ohne doppelte (Anfrage schon als Plantafel-Termin übernommen), nur was noch nicht vorbei ist, nach Beginn.
 */
function upcomingOf(appts: Appt[], requests: ServiceRequest[], now = Date.now()): Upcoming[] {
  const linked = new Set(appts.map((a) => a.request_id).filter(Boolean));
  return [
    ...appts
      .filter((a) => a.status === 'planned' && Date.parse(a.ends_at) >= now)
      .map((a): Upcoming => ({ kind: 'plan', id: a.id, start: a.starts_at, end: a.ends_at, a })),
    ...requests
      .filter((r) => r.scheduled_at && !linked.has(r.id) && new Date(r.scheduled_end ?? r.scheduled_at).getTime() >= now)
      .map((r): Upcoming => ({ kind: 'request', id: r.id, start: r.scheduled_at!, end: r.scheduled_end ?? null, r })),
  ].sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
}

/** Kunde mit Adresse/Objektname darunter — gleiche Schreibweise in allen Zeilen. */
const custOf = (s: Site | undefined) => (s ? `${s.operator_name ? `${s.operator_name} · ` : ''}${s.name}` : '');

const hm = (iso: string) => new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });

/** Eine Zeile in „Heute zu tun“: Symbol, was, wer — und genau eine Aktion. */
interface Todo {
  key: string;
  tone: 'red' | 'amber' | 'accent' | 'plain';
  icon: string;
  title: ReactNode;
  sub: ReactNode;
  action: { label: string; to: string };
}

const TODO_LIMIT = 12;

export function Start() {
  const { data, ext, org, base, requestsVersion, isOwner, userKey } = useInst();

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
    // Plantafel-Termine der nächsten 60 Tage (fehlt plantafel.sql → nur die Kundentermine, keine Fehlerseite)
    const planned = await ext.planung.appointments(today, new Date(today.getTime() + 60 * 86_400_000)).catch(() => [] as Appt[]);
    return { sites, assets, lastService, lastLeak, week, newRequests, openDefects, appointments: upcomingOf(planned, appointments), followUps };
  }, [data, ext, requestsVersion]);
  useLiveRefresh([state.refresh]);

  // „Zahlen“: standardmäßig offen, Zustand je Nutzer gemerkt
  const numbersKey = `idx-start-zahlen:${userKey}`;
  const [numbersOpen, setNumbersOpen] = useState(() => readMerk(numbersKey) !== '0');
  const toggleNumbers = () =>
    setNumbersOpen((o) => {
      writeMerk(numbersKey, o ? '0' : '1');
      return !o;
    });
  const [showAllTodos, setShowAllTodos] = useState(false);

  return (
    <>
      <h1>Start</h1>
      <p className="muted" style={{ marginTop: -6 }}>
        {org.name} · was heute zu tun ist und welche Wartungen anstehen — live aus der App.
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
          // Neue Störungen → neue Angebote → neue Wartungen (wie Inbox und App)
          const sortedRequests = [...newRequests].sort(byRequestRank);
          const faults = sortedRequests.filter((r) => r.kind === 'fault');
          const otherRequests = sortedRequests.filter((r) => r.kind !== 'fault');
          const quotes = newRequests.filter((r) => r.kind === 'quote').length;
          const blocked = openDefects.filter((d) => d.item_blocked && d.severity === 'red');
          const todayAppts = appointments.filter((u) => isToday(u.start));
          const laterAppts = appointments.filter((u) => !isToday(u.start));
          // Nur aktive Kunden und Anlagen in Betrieb (wie die App)
          const openFollow = followUps.filter((f) => {
            const a = assetById.get(f.item_id);
            const s = siteById.get(f.site_id);
            return a && !a.retired && s && s.active;
          });
          const daysSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));

          // ---------- „Heute zu tun“: eine Liste, nach Dringlichkeit ----------
          const reqTodo = (r: ServiceRequest): Todo => {
            const a = r.asset_id ? assetById.get(r.asset_id) : undefined;
            const s = siteById.get(r.site_id ?? a?.site_id ?? '');
            return {
              key: `r-${r.id}`,
              tone: r.kind === 'fault' ? 'red' : r.kind === 'quote' ? 'accent' : 'plain',
              icon: r.kind === 'fault' ? '🚨' : r.kind === 'quote' ? '📝' : '📬',
              title: (
                <>
                  <b>{REQUEST_KIND_LABELS[r.kind]}</b> · {requestTitle(r, a, s)}
                </>
              ),
              // Kunde und Kontakt sind oft dieselbe Person — nur einmal nennen
              sub: [...new Set([s?.operator_name, r.contact_name, r.contact_phone].filter(Boolean)), relTime(r.created_at)].join(' · '),
              action: { label: r.kind === 'fault' ? 'Störung ansehen' : 'Anfrage öffnen', to: `${base}/anfragen/${r.id}` },
            };
          };
          const apptTodo = (u: Upcoming): Todo => {
            const assetId = u.kind === 'plan' ? u.a.asset_id : u.r.asset_id;
            const a = assetId ? assetById.get(assetId) : undefined;
            const s = siteById.get((u.kind === 'plan' ? u.a.site_id : u.r.site_id) ?? a?.site_id ?? '');
            const what = u.kind === 'plan' ? u.a.title : REQUEST_KIND_LABELS[u.r.kind];
            const who = u.kind === 'plan' ? (u.a.assigned_name ?? 'nicht zugeteilt') : `vom Kunden gewählt${u.r.contact_name ? ` · ${u.r.contact_name}` : ''}`;
            return {
              key: `t-${u.kind}-${u.id}`,
              tone: 'amber',
              icon: '🗓️',
              title: (
                <>
                  <b>
                    {hm(u.start)}
                    {u.end ? `–${hm(u.end)}` : ''} Uhr
                  </b>{' '}
                  · {what}
                  {a ? ` · ${a.name}` : ''}
                </>
              ),
              sub: [custOf(s), who].filter(Boolean).join(' · '),
              action:
                u.kind === 'plan'
                  ? { label: 'In der Plantafel', to: `${base}/plantafel` }
                  : { label: 'Anfrage öffnen', to: `${base}/anfragen/${u.id}` },
            };
          };
          const followTodo = (f: (typeof openFollow)[number]): Todo => {
            const a = assetById.get(f.item_id)!;
            const s = siteById.get(f.site_id)!;
            const dd = daysSince(f.started_at);
            const plan = new URLSearchParams({ neu: '1', objekt: s.id, anlage: a.id, titel: 'Folgeeinsatz' });
            return {
              key: `f-${f.inspection_id}`,
              tone: dd > 14 ? 'amber' : 'plain',
              icon: '🔁',
              title: (
                <>
                  <b>Folgeeinsatz</b> · {f.follow_up}
                </>
              ),
              sub: (
                <>
                  <Link to={`${base}/anlagen/${a.id}`}>{a.name}</Link> · {custOf(s)} · vermerkt{' '}
                  {dd === 0 ? 'heute' : dd === 1 ? 'gestern' : `vor ${dd} Tagen`}
                  {f.inspector_name ? ` von ${f.inspector_name}` : ''}
                </>
              ),
              action: { label: 'Einplanen', to: `${base}/plantafel?${plan.toString()}` },
            };
          };
          const todos: Todo[] = [
            ...faults.map(reqTodo),
            ...todayAppts.map(apptTodo),
            ...otherRequests.map(reqTodo),
            ...openFollow.map(followTodo),
          ];
          const shownTodos = showAllTodos ? todos : todos.slice(0, TODO_LIMIT);

          return (
            <>
              {blocked.length > 0 && (
                <div className="error-box">
                  ⛔ {blocked.length === 1 ? 'Eine Anlage ist' : `${blocked.length} Anlagen sind`} wegen eines roten Mangels{' '}
                  <b>Außer Betrieb</b>:{' '}
                  {blocked.map((d, i) => (
                    <span key={d.id}>
                      {i > 0 && ', '}
                      <Link to={`${base}/anlagen/${d.item_id}`}>
                        {assetById.get(d.item_id)?.name ?? 'Anlage'} ({siteById.get(d.site_id)?.name ?? 'Kunde'})
                      </Link>
                    </span>
                  ))}
                </div>
              )}

              {/* ---------- 1. Heute zu tun ---------- */}
              <section aria-labelledby="idx-heute">
                <div className="section-head">
                  <h2 id="idx-heute">Heute zu tun</h2>
                  <Link to={`${base}/anfragen`} className="small">
                    Alle Anfragen →
                  </Link>
                </div>
                <div className="kpi-grid idx-today-kpis">
                  <Link className="kpi idx-kpi-link idx-kpi-red" to={`${base}/anfragen?art=fault`}>
                    <div className="kpi-label">🚨 Störungen</div>
                    <div className="kpi-value">{faults.length}</div>
                    <div className="kpi-sub">{faults.length ? 'zuerst anrufen' : 'keine neuen'}</div>
                  </Link>
                  <Link className="kpi idx-kpi-link idx-kpi-accent" to={`${base}/anfragen`}>
                    <div className="kpi-label">📬 Neue Anfragen</div>
                    <div className="kpi-value">{newRequests.length}</div>
                    <div className="kpi-sub">{quotes ? `davon ${quotes}× Angebot` : 'vom Anlagenpass'}</div>
                  </Link>
                  <Link className="kpi idx-kpi-link idx-kpi-amber" to={`${base}/plantafel`}>
                    <div className="kpi-label">🗓️ Termine heute</div>
                    <div className="kpi-value">{todayAppts.length}</div>
                    <div className="kpi-sub">{laterAppts.length ? `danach ${laterAppts.length} geplant` : 'Plantafel'}</div>
                  </Link>
                  <a
                    className="kpi idx-kpi-link"
                    href="#idx-todo"
                    onClick={(e) => {
                      // Zur Liste springen, ohne die Adresse zu ändern
                      e.preventDefault();
                      document.getElementById('idx-todo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    <div className="kpi-label">🔁 Folgeeinsätze</div>
                    <div className="kpi-value">{openFollow.length}</div>
                    <div className="kpi-sub">offen, noch einplanen</div>
                  </a>
                </div>

                {todos.length === 0 ? (
                  <div className="card empty idx-todo-empty" id="idx-todo">
                    ✓ Heute ist nichts offen — keine neuen Anfragen, keine Termine und keine Folgeeinsätze.
                    <span className="small">
                      Kunden fragen über den QR-Anlagenpass an der Anlage an; Termine planst du in der{' '}
                      <Link to={`${base}/plantafel`}>Plantafel</Link>.
                    </span>
                  </div>
                ) : (
                  <ul className="idx-todo" id="idx-todo" aria-label="Heute zu tun">
                    {shownTodos.map((t) => (
                      <li key={t.key} className={`idx-todo-row ${t.tone}`}>
                        <span className="idx-todo-icon" aria-hidden>
                          {t.icon}
                        </span>
                        <span className="idx-todo-main">
                          <span className="idx-todo-title">{t.title}</span>
                          {t.sub && <span className="idx-todo-sub">{t.sub}</span>}
                        </span>
                        <Link className="btn small ghost idx-todo-act" to={t.action.to}>
                          {t.action.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {todos.length > TODO_LIMIT && (
                  <button type="button" className="btn ghost small idx-todo-more" onClick={() => setShowAllTodos((v) => !v)}>
                    {showAllTodos ? 'Weniger zeigen' : `Alle ${todos.length} zeigen`}
                  </button>
                )}

                {laterAppts.length > 0 && (
                  <details className="idx-fold">
                    <summary>
                      <ChevronDown className="i idx-fold-chev" aria-hidden /> Nächste Termine ({laterAppts.length})
                    </summary>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Termin</th>
                            <th>Art</th>
                            <th>Anlage · Kunde</th>
                            <th className="idx-hide-sm">Monteur · Kontakt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {laterAppts.slice(0, 10).map((u) => {
                            const assetId = u.kind === 'plan' ? u.a.asset_id : u.r.asset_id;
                            const a = assetId ? assetById.get(assetId) : undefined;
                            const s = siteById.get((u.kind === 'plan' ? u.a.site_id : u.r.site_id) ?? a?.site_id ?? '');
                            return (
                              <tr key={`${u.kind}-${u.id}`}>
                                <td>
                                  <Link to={u.kind === 'plan' ? `${base}/plantafel` : `${base}/anfragen/${u.id}`}>{slotLabel(u.start, u.end)} Uhr</Link>
                                </td>
                                <td>
                                  {u.kind === 'plan' ? (
                                    <span className="badge">
                                      {u.a.title === 'Störung' ? '🚨' : '🗓️'} {u.a.title}
                                    </span>
                                  ) : (
                                    <>
                                      <RequestKindBadge kind={u.r.kind} />
                                      <span className="idx-sub">vom Kunden gewählt</span>
                                    </>
                                  )}
                                </td>
                                <td className="wrap">
                                  {a ? <Link to={`${base}/anlagen/${a.id}`}>{a.name}</Link> : '—'}
                                  <span className="idx-sub">{custOf(s)}</span>
                                </td>
                                <td className="wrap muted idx-hide-sm">
                                  {u.kind === 'plan' ? (
                                    u.a.assigned_name ?? 'nicht zugeteilt'
                                  ) : (
                                    <>
                                      {u.r.contact_name ?? '—'}
                                      {u.r.contact_phone && <span className="idx-sub">{u.r.contact_phone}</span>}
                                    </>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {laterAppts.length > 10 && (
                      <p className="idx-sum">
                        + {laterAppts.length - 10} weitere — <Link to={`${base}/plantafel`}>Plantafel öffnen</Link>
                      </p>
                    )}
                  </details>
                )}
              </section>

              {/* ---------- 2. Wartungen ---------- */}
              <section aria-labelledby="idx-wartungen">
                <div className="section-head">
                  <h2 id="idx-wartungen">Wartungen</h2>
                  <Link to={`${base}/wartung?f=due`} className="small">
                    Alle fälligen Wartungen →
                  </Link>
                </div>
                <div className="kpi-grid idx-due-kpis">
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
                </div>

                <h3 className="idx-subhead">Als Nächstes fällig</h3>
                {next.length === 0 ? (
                  <div className="card empty">In den nächsten 30 Tagen ist keine Wartung fällig.</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Fällig</th>
                          <th>Anlage</th>
                          <th>Kunde</th>
                          {isOwner && <th className="idx-num">Preis</th>}
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
                              <Link to={`${base}/anlagen/${r.asset.id}`}>{r.asset.name}</Link> <WarrantyRiskBadge asset={r.asset} due={r.due} />
                              <span className="idx-sub">
                                {kindInfo(r.asset.kind).emoji} {kindInfo(r.asset.kind).label}
                              </span>
                            </td>
                            <td className="wrap">
                              {r.site?.operator_name ?? '—'}
                              <span className="idx-sub">{r.site?.name}</span>
                            </td>
                            {/* Preise wie Potenzial und „Fällige Wartungen“ nur für den Inhaber */}
                            {isOwner && <td className="idx-num">{r.price !== undefined ? fmtEur(r.price) : <span className="muted">—</span>}</td>}
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
              </section>

              {/* ---------- 3. Zahlen (nur Inhaber, wie in der App) ---------- */}
              {isOwner && (
                <section className="idx-numbers" aria-labelledby="idx-zahlen">
                  <h2 className="idx-fold-head">
                    <button type="button" id="idx-zahlen" aria-expanded={numbersOpen} aria-controls="idx-zahlen-inhalt" onClick={toggleNumbers}>
                      <ChevronDown className={`i idx-fold-chev${numbersOpen ? ' up' : ''}`} aria-hidden /> Zahlen
                      <span className="idx-fold-hint">nur für dich als Inhaber</span>
                    </button>
                  </h2>
                  <div id="idx-zahlen-inhalt" hidden={!numbersOpen}>
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
                            <SettingsIcon className="i" aria-hidden /> Preis je Wartung eintragen
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
                            <Link to={`${base}/wartung?f=due`}>Zu den fälligen Wartungen →</Link>
                          </div>
                          {pot.unpriced > 0 && (
                            <div className="idx-hero-sub" style={{ marginTop: 10 }}>
                              {pot.unpriced} fällige {pot.unpriced === 1 ? 'Anlage zählt' : 'Anlagen zählen'} nicht mit, weil für den
                              Typ kein Preis eingetragen ist ({pot.unpricedKinds.map((k) => `${k.label} ${k.count}×`).join(', ')}).{' '}
                              <Link to={`${base}/einstellungen#preise`}>Preis je Wartung eintragen</Link>
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
                          {contracts.withoutPrice > 0 && <> · {contracts.withoutPrice} ohne Preis</>}{' '}
                          <Link to={`${base}/wartung?f=all&vertrag=1`}>Vertragsanlagen ansehen →</Link>
                        </div>
                      )}
                    </section>
                    <div className="kpi-grid idx-numbers-kpis">
                      <div className="kpi">
                        <div className="kpi-label">Einsätze diese Woche</div>
                        <div className="kpi-value">{week.length}</div>
                        <div className="kpi-sub">seit Montag, ohne Stornos</div>
                      </div>
                      <Link className="kpi idx-kpi-link" to={`${base}/auswertungen/woche`}>
                        <div className="kpi-label">Wochenbericht</div>
                        <div className="kpi-value idx-kpi-arrow">→</div>
                        <div className="kpi-sub">Fällig bis Sonntag, Garantien, Umsatz</div>
                      </Link>
                    </div>
                  </div>
                </section>
              )}

              {/* Was diese Woche dokumentiert wurde — für alle, eingeklappt */}
              <details className="idx-fold">
                <summary>
                  <ChevronDown className="i idx-fold-chev" aria-hidden /> Diese Woche dokumentiert ({week.length})
                </summary>
                {week.length === 0 ? (
                  <div className="card empty">Seit Montag wurde noch kein Einsatz dokumentiert.</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Zeitpunkt</th>
                          <th>Einsatz</th>
                          <th>Anlage · Kunde</th>
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
              </details>
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}
