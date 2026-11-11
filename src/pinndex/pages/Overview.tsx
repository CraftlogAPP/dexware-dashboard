// Laufzettel (intern PinnDex) — Übersicht „Wer ist wo“ (Start-Bereich): links je Monteur eine Zeile (frei / arbeitet / Pause,
// aktuelle + nächste Karte, „2 von 5 erledigt“), rechts die Live-Karte mit einem Pin je heutigem Auftrag.
// Klick auf einen Pin öffnet das Karten-Detail, Klick auf einen Monteur zoomt auf seine Pins (nochmal = alle).
// Live wie die Pinnwand: Realtime-Version + Rückfall alle 20 s + beim Zurückkehren in den Tab.

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, MapPinOff, Pause, Play, Plus, Siren, SquareKanban } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { usePinn } from '../context';
import { useJobSheet } from '../JobSheet';
import { MONTHS, WD_LONG, addDays, dayKey, fmtClock, hhmm, isMine, isOpen, jobDay, memberColor, memberName, sortJobs, startOfDay, workSecondsNow } from '../logic';
import { Avatar, LiveDot, useNow } from '../parts';
import type { MapPin } from '../LiveMap';
import type { Job, JobEvent, PinnMember } from '../types';

const LiveMap = lazy(() => import('../LiveMap'));

// Bewusst kein „unterwegs“: ohne Ortung wissen wir das nicht (Vorgabe 11.11.)
type Kind = 'working' | 'paused' | 'free';

interface Row {
  id: string; // user_id oder 'none'
  member: PinnMember | null;
  name: string;
  color: string;
  jobs: Job[];
  kind: Kind;
  current: Job | null;
  next: Job | null;
  done: number;
  total: number;
}

const KIND_LABEL: Record<Kind, string> = { working: 'arbeitet', paused: 'Pause', free: 'frei' };

export function Overview() {
  const { data, members, me, role, org, version, live, changedAt, canManage, base } = usePinn();
  const sheet = useJobSheet();
  const today = startOfDay(new Date());
  const todayKey = dayKey(today);

  const state = useAsync(async () => {
    const jobs = await data.boardJobs(today, addDays(today, 1));
    // Standort beim Start (einmalig von der App, wenn der Chef es erlaubt) + Laufzeit-Start für ältere Zeilen
    const ids = jobs.filter((j) => j.status === 'running' || j.status === 'paused' || j.status === 'done').map((j) => j.id);
    const ev = ids.length ? await data.eventsOf(ids, ['start', 'resume']) : [];
    return { jobs, ev };
  }, [data, todayKey]);
  const firstVersion = useRef(version);
  useEffect(() => {
    if (version !== firstVersion.current) state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  useLiveRefresh([state.refresh], 20000);

  // Heute relevant: Termin heute + alles, was gerade läuft oder pausiert (auch von gestern)
  const jobs = useMemo(() => {
    const list = (state.data?.jobs ?? []).filter((j) => j.status !== 'canceled' && (jobDay(j) === todayKey || j.status === 'running' || j.status === 'paused'));
    return role === 'worker' ? list.filter((j) => isMine(j, me.user_id)) : list;
  }, [state.data, todayKey, role, me.user_id]);
  const unplanned = useMemo(
    () => (state.data?.jobs ?? []).filter((j) => !j.assignee_id && isOpen(j.status) && (role !== 'worker' || org.allow_open_pool)),
    [state.data, role, org.allow_open_pool],
  );

  const since = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of state.data?.ev ?? []) m[e.job_id] = e.at;
    return m;
  }, [state.data]);
  const arrival = useMemo(() => {
    const m: Record<string, JobEvent> = {};
    for (const e of state.data?.ev ?? []) if (e.kind === 'start' && typeof e.data?.lat === 'number' && typeof e.data?.lng === 'number' && !m[e.job_id]) m[e.job_id] = e;
    return m;
  }, [state.data]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    members.forEach((m, i) => {
      const relevant = role === 'worker' ? m.user_id === me.user_id : m.active && (m.role === 'worker' || jobs.some((j) => j.assignee_id === m.user_id));
      if (!relevant) return;
      const mine = sortJobs(jobs.filter((j) => j.assignee_id === m.user_id));
      const running = mine.find((j) => j.status === 'running') ?? null;
      const paused = mine.find((j) => j.status === 'paused') ?? null;
      const open = mine.filter((j) => j.status === 'new' || j.status === 'seen');
      const done = mine.filter((j) => j.status === 'done').length;
      const next = open[0] ?? null;
      const kind: Kind = running ? 'working' : paused ? 'paused' : 'free';
      out.push({ id: m.user_id, member: m, name: memberName(m), color: memberColor(m, i), jobs: mine, kind, current: running ?? paused, next, done, total: mine.length });
    });
    return out;
  }, [members, jobs, role, me.user_id]);

  // Sekundentakt nur bei laufender Uhr, sonst alle 30 s (für „gleich dran“)
  const now = useNow(true, jobs.some((j) => j.status === 'running') ? 1000 : 30000);
  const [focusId, setFocusId] = useState<string | null>(null);

  const colorOf = useMemo(() => new Map(rows.map((r) => [r.id, r.color])), [rows]);
  const nameOf = useMemo(() => new Map(members.map((m) => [m.user_id, memberName(m)])), [members]);
  const pins = useMemo<MapPin[]>(() => {
    const list = [...jobs, ...unplanned.filter((u) => jobDay(u) === todayKey && !jobs.includes(u))];
    return list.flatMap((j) => {
      const arr = j.status === 'running' ? arrival[j.id] : undefined;
      const lat = arr ? (arr.data!.lat as number) : j.lat;
      const lng = arr ? (arr.data!.lng as number) : j.lng;
      if (lat == null || lng == null) return [];
      return [
        {
          id: j.id,
          lat,
          lng,
          status: j.status,
          urgent: j.urgent,
          title: j.title,
          who: j.assignee_id ? (nameOf.get(j.assignee_id) ?? null) : null,
          color: j.assignee_id ? (colorOf.get(j.assignee_id) ?? '#888') : '#888',
          extra: arr ? `angekommen ${hhmm(arr.at)}` : j.scheduled_at ? `Termin ${hhmm(j.scheduled_at)}` : undefined,
        },
      ];
    });
  }, [jobs, unplanned, todayKey, arrival, nameOf, colorOf]);
  const noPin = useMemo(() => jobs.filter((j) => j.address && (j.lat == null || j.lng == null) && !(j.status === 'running' && arrival[j.id])), [jobs, arrival]);
  const focusPins = useMemo(() => (focusId ? pins.filter((p) => (focusId === 'none' ? !jobs.find((j) => j.id === p.id)?.assignee_id : jobs.find((j) => j.id === p.id)?.assignee_id === focusId)) : null), [focusId, pins, jobs]);

  const totals = useMemo(() => {
    const t = { all: jobs.length, done: 0, running: 0, open: 0, urgent: 0 };
    for (const j of jobs) {
      if (j.status === 'done') t.done++;
      if (j.status === 'running') t.running++;
      if (isOpen(j.status)) t.open++;
      if (j.urgent && isOpen(j.status)) t.urgent++;
    }
    return t;
  }, [jobs]);

  const toggleFocus = (id: string) => setFocusId((f) => (f === id ? null : id));

  return (
    <div className="pinn-overview-page">
      <div className="pinn-head">
        <div>
          <h1>Übersicht</h1>
          <div className="pinn-sub">
            <LiveDot live={live} changedAt={changedAt} />
            <span className="muted">
              {WD_LONG[today.getDay()]}, {today.getDate()}. {MONTHS[today.getMonth()]}
            </span>
          </div>
        </div>
        {canManage && (
          <button type="button" className="btn pinn-add" onClick={() => sheet.newJob({ day: todayKey })}>
            <Plus className="i" aria-hidden /> Auftrag
          </button>
        )}
      </div>

      <div className="pinn-today-strip" aria-label="Heute in Zahlen">
        <span>
          <b>{totals.all}</b> heute
        </span>
        <span className="st-done">
          <b>{totals.done}</b> erledigt
        </span>
        <span className="st-running">
          <b>{totals.running}</b> {totals.running === 1 ? 'läuft' : 'laufen'}
        </span>
        <span className="st-new">
          <b>{totals.open}</b> offen
        </span>
        {totals.urgent > 0 && (
          <span className="urgent">
            <Siren className="i" aria-hidden /> <b>{totals.urgent}</b> dringend
          </span>
        )}
      </div>

      <LoadGuard state={state}>
        {() => (
          <div className="pinn-overview">
            <div className="pinn-who-list">
              {rows.map((r) => (
                <WorkerRow key={r.id} r={r} now={now} since={since} focused={focusId === r.id} onFocus={() => toggleFocus(r.id)} onOpen={(id) => sheet.openJob(id)} />
              ))}
              {rows.length === 0 && <div className="empty">Noch keine Monteure im Team.</div>}
              {role !== 'worker' && unplanned.length > 0 && (
                <button type="button" className={`pinn-who pinn-who-none${focusId === 'none' ? ' focused' : ''}`} onClick={() => toggleFocus('none')}>
                  <span className="pinn-avatar none" aria-hidden>
                    <Inbox className="i" />
                  </span>
                  <span className="pinn-who-main">
                    <b>Nicht zugewiesen</b>
                    <span className="muted small">
                      {unplanned.length} offen — auf der{' '}
                      <Link to={base + '/pinnwand'} onClick={(e) => e.stopPropagation()}>
                        Pinnwand
                      </Link>{' '}
                      verteilen
                    </span>
                  </span>
                </button>
              )}
              <Link to={base + '/pinnwand'} className="pinn-tolink">
                <SquareKanban className="i" aria-hidden /> Zur Pinnwand
              </Link>
            </div>

            <div className="pinn-map-col">
              <div className="pinn-map-box">
                <Suspense fallback={<div className="pinn-map pinn-map-wait"><span className="spinner" /></div>}>
                  <LiveMap pins={pins} focus={focusPins} focusKey={focusId ?? 'alle'} onPin={(id) => sheet.openJob(id)} />
                </Suspense>
                {focusId && (
                  <button type="button" className="btn small pinn-map-all" onClick={() => setFocusId(null)}>
                    Alle zeigen
                  </button>
                )}
              </div>
              <div className="pinn-map-legend">
                <span className="st-new">Neu</span>
                <span className="st-seen">Gesehen</span>
                <span className="st-running">Läuft</span>
                <span className="st-paused">Pause</span>
                <span className="st-done">Erledigt</span>
              </div>
              {noPin.length > 0 && (
                <div className="pinn-nopin">
                  <MapPinOff className="i" aria-hidden />
                  <span>
                    {noPin.length === 1 ? '1 Auftrag' : `${noPin.length} Aufträge`} ohne Pin (Adresse nicht gefunden):{' '}
                    {noPin.map((j, i) => (
                      <span key={j.id}>
                        {i > 0 ? ', ' : ''}
                        <button type="button" className="pinn-linkbtn" onClick={() => sheet.openJob(j.id)}>
                          {j.title}
                        </button>
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </LoadGuard>
    </div>
  );
}

function WorkerRow({
  r,
  now,
  since,
  focused,
  onFocus,
  onOpen,
}: {
  r: Row;
  now: number;
  since: Record<string, string>;
  focused: boolean;
  onFocus: () => void;
  onOpen: (id: string) => void;
}) {
  const c = r.current;
  const sinceIso = c ? (c.running_since ?? since[c.id] ?? c.started_at) : null;
  const where = c ? c.customer_name || c.title : '';
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
  // „gleich dran“: nächster Termin in höchstens 30 Minuten (oder schon fällig), solange nichts läuft
  const soon = r.kind === 'free' && !!r.next?.scheduled_at && Date.parse(r.next.scheduled_at) - now <= 30 * 60000;
  const open = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onOpen(id);
  };
  return (
    <div
      className={`pinn-who k-${r.kind}${focused ? ' focused' : ''}`}
      style={{ '--pc': r.color } as React.CSSProperties}
      role="button"
      tabIndex={0}
      aria-pressed={focused}
      aria-label={`${r.name}: ${KIND_LABEL[r.kind]} — auf der Karte zeigen`}
      onClick={onFocus}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFocus())}
    >
      <Avatar name={r.name} color={r.color} size={44} />
      <div className="pinn-who-main">
        <div className="pinn-who-top">
          <b>{r.name}</b>
          <span className="pinn-who-count">
            {r.done} von {r.total} erledigt
          </span>
        </div>
        <div className={`pinn-who-state k-${r.kind}`}>
          {r.kind === 'working' && (
            <>
              <Play className="i" aria-hidden /> arbeitet bei <b>{where}</b>
              {sinceIso ? ` seit ${hhmm(sinceIso)}` : ''}
              <span className="pinn-who-clock">{fmtClock(workSecondsNow(c!, since[c!.id], now))}</span>
            </>
          )}
          {r.kind === 'paused' && (
            <>
              <Pause className="i" aria-hidden /> Pause bei <b>{where}</b>
            </>
          )}
          {/* Keine Ortung → nichts behaupten („unterwegs“): nur frei + was als Nächstes kommt */}
          {r.kind === 'free' && <>frei{r.total === 0 ? ' — heute nichts geplant' : r.next ? '' : ' — alles erledigt'}</>}
          {soon && <span className="pinn-soon">gleich dran</span>}
        </div>
        <div className="pinn-who-jobs">
          {c && (
            <button type="button" className="pinn-who-job now" onClick={(e) => open(e, c.id)}>
              <span>Jetzt</span> {c.title}
            </button>
          )}
          {r.next && (
            <button type="button" className={`pinn-who-job${r.next.urgent ? ' urgent' : ''}${soon ? ' soon' : ''}`} onClick={(e) => open(e, r.next!.id)}>
              <span>als Nächstes{r.next.scheduled_at ? ` ${hhmm(r.next.scheduled_at)}` : ''} ·</span> {r.next.title}
            </button>
          )}
        </div>
        {r.total > 0 && (
          <div className="pinn-who-bar" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
