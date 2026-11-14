// PinnDex — die Pinnwand: eine Spalte je Monteur + „Nicht zugewiesen“, Tag- oder Wochenansicht, live.
// Ziehen: Zeiger-Ereignisse aus der InstallateurDex-Plantafel (planung/ziehen.ts) — Maus, Stift, Finger (kurz halten),
// ohne Zusatzpaket. Ablage = Monteur (und in der Woche auch Tag) ändern; Uhrzeit bleibt. Zustand ändert nur der Monteur.
// Aktualisierung: Realtime (context.tsx) + Rückfall alle 20 s + beim Zurückkehren in den Tab (useLiveRefresh).

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Inbox, Plus, Siren, Timer, Undo2, Users } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { usePointerDrag, type DropSpot } from '../../installateurdex/planung/ziehen';
import { usePinn } from '../context';
import { useJobSheet } from '../JobSheet';
import {
  MONTHS,
  WD_LONG,
  addDays,
  dayKey,
  dayShort,
  ddmm,
  ddmmyyyy,
  fmtClock,
  fmtDuration,
  fmtWork,
  hhmm,
  isMine,
  isOpen,
  isoWeek,
  jobDay,
  memberColor,
  memberName,
  moveToDay,
  parseDay,
  sortJobs,
  startOfDay,
  weekStart,
  workSecondsNow,
} from '../logic';
import { Avatar, LiveDot, Segmented, StatusChip, useNow } from '../parts';
import { STATUS_LABEL, type Job, type JobStatus, type PinnMember } from '../types';

type View = 'day' | 'week';
const VIEW_KEY = 'pinn-board-view';
const KEEP = 'keep';

function readView(): View {
  // Direktlink …?ansicht=woche|tag (z. B. als Lesezeichen am Büro-Bildschirm)
  const q = new URLSearchParams(window.location.search).get('ansicht');
  if (q === 'woche') return 'week';
  if (q === 'tag') return 'day';
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'day' || v === 'week') return v;
  } catch {
    /* privates Fenster */
  }
  return 'day';
}

interface Lane {
  id: string; // user_id oder 'none'
  member: PinnMember | null;
  color: string;
  name: string;
}

interface Notice {
  text: string;
  undo?: () => void;
  error?: boolean;
}

export function Board() {
  const { data, members, me, role, canManage, org, version, bump, live, changedAt } = usePinn();
  const sheet = useJobSheet();
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* egal */
    }
  };
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'urgent' | null>(null);

  const from = view === 'day' ? anchor : weekStart(anchor);
  const to = addDays(from, view === 'day' ? 1 : 7);
  const todayKey = dayKey(new Date());

  const board = useAsync(async () => {
    const jobs = await data.boardJobs(from, to);
    // Laufzeit kommt aus job.running_since; nur ältere Zeilen ohne den Wert brauchen den letzten Start aus dem Verlauf
    const running = jobs.filter((j) => j.status === 'running' && !j.running_since).map((j) => j.id);
    const ev = running.length ? await data.eventsOf(running, ['start', 'resume']) : [];
    const since: Record<string, string> = {};
    for (const e of ev) since[e.job_id] = e.at; // aufsteigend sortiert → der letzte Start gewinnt
    return { jobs, since };
  }, [data, from.getTime(), to.getTime()]);

  // Live: Realtime-/eigene Änderung → still neu laden; Rückfall alle 20 s + beim Zurückkehren in den Tab
  const firstVersion = useRef(version);
  useEffect(() => {
    if (version !== firstVersion.current) board.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  useLiveRefresh([board.refresh], 20000);

  // Sofort angezeigte Verschiebungen, bis der Server sie bestätigt
  const [pending, setPending] = useState<Record<string, Partial<Job>>>({});
  useEffect(() => {
    if (!board.data) return;
    setPending((p) => {
      const next: Record<string, Partial<Job>> = {};
      for (const [id, patch] of Object.entries(p)) {
        const j = board.data!.jobs.find((x) => x.id === id);
        if (j && Object.entries(patch).some(([k, v]) => j[k as keyof Job] !== v)) next[id] = patch;
      }
      return Object.keys(next).length === Object.keys(p).length ? p : next;
    });
  }, [board.data]);

  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), notice.undo ? 7000 : 4500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const jobs = useMemo(() => {
    const list = (board.data?.jobs ?? []).map((j) => (pending[j.id] ? { ...j, ...pending[j.id] } : j));
    // Monteur sieht nur eigene Karten (+ offene, falls der Chef das erlaubt) — RLS filtert ohnehin
    return role === 'worker' ? list.filter((j) => isMine(j, me.user_id) || (org.allow_open_pool && !j.assignee_id)) : list;
  }, [board.data, pending, role, me.user_id, org.allow_open_pool]);

  const lanes = useMemo<Lane[]>(() => {
    const out: Lane[] = [];
    const showNone = role !== 'worker' || org.allow_open_pool;
    if (showNone) out.push({ id: 'none', member: null, color: 'var(--muted)', name: 'Nicht zugewiesen' });
    const withJobs = new Set(jobs.map((j) => j.assignee_id).filter(Boolean) as string[]);
    members.forEach((m, i) => {
      const relevant = role === 'worker' ? m.user_id === me.user_id : m.active && (m.role === 'worker' || withJobs.has(m.user_id));
      if (relevant) out.push({ id: m.user_id, member: m, color: memberColor(m, i), name: memberName(m) });
    });
    return out;
  }, [members, jobs, role, me.user_id, org.allow_open_pool]);

  const hasRunning = jobs.some((j) => j.status === 'running');
  const now = useNow(hasRunning);
  const since = board.data?.since ?? {};

  const counts = useMemo(() => {
    const c: Record<string, number> = { new: 0, seen: 0, running: 0, paused: 0, done: 0, canceled: 0, urgent: 0 };
    for (const j of jobs) {
      c[j.status] += 1;
      if (j.urgent && isOpen(j.status)) c.urgent += 1;
    }
    return c;
  }, [jobs]);

  const shown = (j: Job) => !statusFilter || (statusFilter === 'urgent' ? j.urgent && isOpen(j.status) : j.status === statusFilter);

  // Tage der Wochenansicht: Mo–Fr immer, Sa/So nur mit Karten
  const weekDays = useMemo(() => {
    if (view !== 'week') return [];
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const k = dayKey(addDays(from, i));
      const wd = addDays(from, i).getDay();
      if (wd !== 0 && wd !== 6) days.push(k);
      else if (jobs.some((j) => jobDay(j) === k)) days.push(k);
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, from.getTime(), jobs]);

  // ---------- Ziehen ----------
  const [drag, setDrag] = useState<{ job: Job; over: DropSpot | null } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pd = usePointerDrag<Job>({
    onStart: (job) => {
      if (!canManage) return false;
      if (job.status === 'done' || job.status === 'canceled') {
        setNotice({ text: 'Erledigte und abgesagte Karten bleiben, wo sie sind.' });
        return false;
      }
      if (job.status === 'running') {
        setNotice({ text: 'Diese Karte läuft gerade — erst pausieren lassen, dann umverteilen.' });
        return false;
      }
      setDrag({ job, over: null });
      return true;
    },
    onOver: (spot) => setDrag((d) => (d ? { ...d, over: spot } : d)),
    onCancel: () => setDrag(null),
    onDrop: (spot) => {
      const d = drag;
      setDrag(null);
      if (!d || !spot) return;
      void dropOn(d.job, spot);
    },
    scrollEl: () => boardRef.current,
  });

  async function dropOn(job: Job, spot: DropSpot) {
    const toAssignee = spot.lane === 'none' ? null : spot.lane || job.assignee_id;
    const patch: { assignee_id?: string | null; scheduled_at?: string | null } = {};
    if (toAssignee !== job.assignee_id) patch.assignee_id = toAssignee;
    if (spot.day && spot.day !== KEEP && spot.day !== jobDay(job)) patch.scheduled_at = moveToDay(job.scheduled_at, spot.day);
    if (!Object.keys(patch).length) return;
    const before: Partial<Job> = {};
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) before[k] = job[k];
    setPending((p) => ({ ...p, [job.id]: { ...p[job.id], ...patch } }));
    const who = toAssignee ? memberName(members.find((m) => m.user_id === toAssignee)) : 'Nicht zugewiesen';
    const when = patch.scheduled_at ? ` · ${dayShort(new Date(patch.scheduled_at))}` : '';
    try {
      await data.moveJob(job.id, patch);
      bump();
      setNotice({
        text: `„${job.title}“ → ${who}${when}`,
        undo: () => {
          setPending((p) => ({ ...p, [job.id]: { ...p[job.id], ...before } }));
          data.moveJob(job.id, before as typeof patch).then(bump, (e) => {
            setPending((p) => {
              const n = { ...p };
              delete n[job.id];
              return n;
            });
            setNotice({ text: e instanceof Error ? e.message : String(e), error: true });
          });
          setNotice(null);
        },
      });
    } catch (e) {
      setPending((p) => {
        const n = { ...p };
        delete n[job.id];
        return n;
      });
      setNotice({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  }

  const overLane = drag?.over?.lane ?? null;
  const overDay = drag?.over?.day ?? null;

  // ---------- Kopf ----------
  const step = (n: number) => setAnchor((a) => addDays(a, view === 'day' ? n : 7 * n));
  const isTodayView = view === 'day' ? dayKey(anchor) === todayKey : dayKey(weekStart(new Date())) === dayKey(from);
  const label =
    view === 'day'
      ? `${WD_LONG[anchor.getDay()]}, ${anchor.getDate()}. ${MONTHS[anchor.getMonth()]}`
      : `KW ${isoWeek(from)} · ${ddmm(from)}–${ddmmyyyy(addDays(to, -1))}`;

  return (
    <div className="pinn-board-page">
      <div className="pinn-head">
        <div>
          <h1>Pinnwand</h1>
          <div className="pinn-sub">
            <LiveDot live={live} changedAt={changedAt} />
            {role === 'worker' && <span className="muted">Deine Karten</span>}
          </div>
        </div>
        {canManage && (
          <button type="button" className="btn pinn-add" onClick={() => sheet.newJob({ day: view === 'day' ? dayKey(anchor) : todayKey })}>
            <Plus className="i" aria-hidden /> Auftrag
          </button>
        )}
      </div>

      <div className="pinn-toolbar">
        <Segmented<View>
          label="Ansicht"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Tag' },
            { value: 'week', label: 'Woche' },
          ]}
        />
        <div className="pinn-datenav">
          <button type="button" className="btn ghost small" onClick={() => step(-1)} aria-label={view === 'day' ? 'Vorheriger Tag' : 'Vorherige Woche'}>
            <ChevronLeft className="i" aria-hidden />
          </button>
          <button type="button" className={`btn small ${isTodayView ? '' : 'ghost'}`} onClick={() => setAnchor(startOfDay(new Date()))}>
            Heute
          </button>
          <button type="button" className="btn ghost small" onClick={() => step(1)} aria-label={view === 'day' ? 'Nächster Tag' : 'Nächste Woche'}>
            <ChevronRight className="i" aria-hidden />
          </button>
          <span className="pinn-datelabel">{label}</span>
        </div>
      </div>

      <div className="pinn-counts" role="group" aria-label="Nach Zustand filtern">
        {(['new', 'seen', 'running', 'paused', 'done'] as JobStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`pinn-count st-${s}${statusFilter === s ? ' on' : ''}`}
            aria-pressed={statusFilter === s}
            onClick={() => setStatusFilter((f) => (f === s ? null : s))}
          >
            <b>{counts[s]}</b> {STATUS_LABEL[s]}
          </button>
        ))}
        <button
          type="button"
          className={`pinn-count urgent${statusFilter === 'urgent' ? ' on' : ''}`}
          aria-pressed={statusFilter === 'urgent'}
          onClick={() => setStatusFilter((f) => (f === 'urgent' ? null : 'urgent'))}
        >
          <Siren className="i" aria-hidden />
          <b>{counts.urgent}</b> dringend
        </button>
      </div>

      <LoadGuard state={board}>
        {() =>
          lanes.length === 0 || (lanes.length === 1 && lanes[0].id === 'none' && members.filter((m) => m.role === 'worker' && m.active).length === 0 && jobs.length === 0) ? (
            <EmptyTeam canManage={canManage} />
          ) : (
            <div ref={boardRef} className={`pinn-board view-${view}${drag ? ' dragging' : ''}`} style={{ '--lanes': lanes.length } as React.CSSProperties}>
              {lanes.map((lane) => {
                const laneJobs = jobs.filter((j) => (lane.id === 'none' ? !j.assignee_id : j.assignee_id === lane.id));
                const runningJob = laneJobs.find((j) => j.status === 'running');
                const open = laneJobs.filter((j) => isOpen(j.status)).length;
                const undatedOrOld = sortJobs(laneJobs.filter((j) => isOpen(j.status) && (!j.scheduled_at || Date.parse(j.scheduled_at) < from.getTime())));
                return (
                  <section key={lane.id} className={`pinn-lane${lane.id === 'none' ? ' none' : ''}${overLane === lane.id ? ' over' : ''}`} style={{ '--pc': lane.color } as React.CSSProperties} aria-label={lane.name}>
                    <header className="pinn-lane-head">
                      {lane.member ? <Avatar name={lane.name} color={lane.color} size={34} /> : <span className="pinn-avatar none" aria-hidden><Inbox className="i" /></span>}
                      <div className="pinn-lane-title">
                        <b>{lane.name}</b>
                        <span className="muted small">
                          {open} offen
                          {runningJob ? (
                            <span className="pinn-lane-run">
                              {' '}
                              · <Timer className="i" aria-hidden /> {fmtClock(workSecondsNow(runningJob, since[runningJob.id], now))}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </header>

                    {view === 'day' ? (
                      <div className={`pinn-drop${overLane === lane.id ? ' on' : ''}`} data-drop-day={KEEP} data-drop-lane={lane.id}>
                        {undatedOrOld.filter(shown).length > 0 && (
                          <Group title={dayKey(anchor) === todayKey ? 'Ohne Termin / von früher offen' : 'Ohne Termin / früher offen'}>
                            {undatedOrOld.filter(shown).map((j) => (
                              <Card key={j.id} job={j} since={since[j.id]} now={now} showDay drag={pd} canDrag={canManage} onOpen={() => sheet.openJob(j.id)} dragging={drag?.job.id === j.id} />
                            ))}
                          </Group>
                        )}
                        {sortJobs(laneJobs.filter((j) => jobDay(j) === dayKey(anchor) && shown(j))).map((j) => (
                          <Card key={j.id} job={j} since={since[j.id]} now={now} drag={pd} canDrag={canManage} onOpen={() => sheet.openJob(j.id)} dragging={drag?.job.id === j.id} />
                        ))}
                        {laneJobs.filter(shown).length === 0 && <div className="pinn-lane-empty">{canManage ? 'Hierher ziehen oder + Auftrag' : 'Nichts geplant'}</div>}
                      </div>
                    ) : (
                      <div className="pinn-week">
                        {undatedOrOld.filter(shown).length > 0 && (
                          <div className={`pinn-drop pinn-day${overLane === lane.id && overDay === KEEP ? ' on' : ''}`} data-drop-day={KEEP} data-drop-lane={lane.id}>
                            <div className="pinn-day-head">Ohne Termin / früher</div>
                            {undatedOrOld.filter(shown).map((j) => (
                              <Card key={j.id} job={j} since={since[j.id]} now={now} showDay compact drag={pd} canDrag={canManage} onOpen={() => sheet.openJob(j.id)} dragging={drag?.job.id === j.id} />
                            ))}
                          </div>
                        )}
                        {weekDays.map((k) => {
                          const dj = sortJobs(laneJobs.filter((j) => jobDay(j) === k && shown(j)));
                          const d = parseDay(k);
                          return (
                            <div key={k} className={`pinn-drop pinn-day${k === todayKey ? ' today' : ''}${overLane === lane.id && overDay === k ? ' on' : ''}`} data-drop-day={k} data-drop-lane={lane.id}>
                              <div className="pinn-day-head">
                                {dayShort(d)}
                                {k === todayKey && <span className="pinn-today">heute</span>}
                              </div>
                              {dj.map((j) => (
                                <Card key={j.id} job={j} since={since[j.id]} now={now} compact drag={pd} canDrag={canManage} onOpen={() => sheet.openJob(j.id)} dragging={drag?.job.id === j.id} />
                              ))}
                              {dj.length === 0 && <div className="pinn-day-empty">—</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )
        }
      </LoadGuard>

      {drag && (
        <div ref={pd.ghostRef} className={`pinn-ghost st-${drag.job.status}${drag.job.urgent ? ' urgent' : ''}`} aria-hidden>
          <b>{drag.job.title}</b>
          <span>
            {drag.over
              ? `→ ${drag.over.lane === 'none' ? 'Nicht zugewiesen' : memberName(members.find((m) => m.user_id === drag.over!.lane))}${drag.over.day && drag.over.day !== KEEP ? ` · ${dayShort(parseDay(drag.over.day))}` : ''}`
              : 'loslassen zum Zuweisen'}
          </span>
        </div>
      )}

      {notice && (
        <div className={`pinn-toast${notice.error ? ' error' : ''}`} role="status">
          <span>{notice.text}</span>
          {notice.undo && (
            <button type="button" className="btn ghost small" onClick={notice.undo}>
              <Undo2 className="i" aria-hidden /> Rückgängig
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pinn-group">
      <div className="pinn-day-head">{title}</div>
      {children}
    </div>
  );
}

function EmptyTeam({ canManage }: { canManage: boolean }) {
  return (
    <div className="card pinn-emptyteam">
      <Users className="i" aria-hidden />
      <div>
        <b>Noch keine Monteure im Team</b>
        <p className="muted">
          {canManage
            ? 'Monteure treten in der Laufzettel-App per Team-Code bei (unter „Team“). Aufträge kannst du trotzdem schon anlegen — sie landen in „Nicht zugewiesen“.'
            : 'Sobald dir Aufträge zugewiesen sind, erscheinen sie hier.'}
        </p>
      </div>
    </div>
  );
}

function Card({
  job,
  since,
  now,
  showDay,
  compact,
  drag,
  canDrag,
  onOpen,
  dragging,
}: {
  job: Job;
  since: string | undefined;
  now: number;
  showDay?: boolean;
  compact?: boolean;
  drag: ReturnType<typeof usePointerDrag<Job>>;
  canDrag: boolean;
  onOpen: () => void;
  dragging: boolean;
}) {
  const time = job.scheduled_at ? `${showDay ? `${dayShort(new Date(job.scheduled_at))} ` : ''}${hhmm(job.scheduled_at)}` : null;
  const overdue = isOpen(job.status) && !!job.scheduled_at && Date.parse(job.scheduled_at) < startOfDay(new Date()).getTime();
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <article
      className={`pinn-card st-${job.status}${job.urgent ? ' urgent' : ''}${compact ? ' compact' : ''}${dragging ? ' lifted' : ''}${canDrag ? ' draggable' : ''}`}
      tabIndex={0}
      role="button"
      aria-label={`${job.title}, ${STATUS_LABEL[job.status]}${job.urgent ? ', dringend' : ''}${time ? `, ${time} Uhr` : ''}`}
      onClick={onOpen}
      onKeyDown={onKey}
      {...(canDrag ? drag.bind(job) : {})}
    >
      <div className="pinn-card-top">
        <StatusChip key={job.status} status={job.status} />
        {job.urgent && isOpen(job.status) && (
          <span className="pinn-urgent-tag small">
            <Siren className="i" aria-hidden /> Dringend
          </span>
        )}
        <span className="spacer" />
        {time && <span className={`pinn-card-time${overdue ? ' late' : ''}`}>{time}</span>}
      </div>
      <h4>{job.title}</h4>
      {(job.customer_name || job.address) && (
        <div className="pinn-card-meta">
          {job.customer_name}
          {job.customer_name && job.address ? ' · ' : ''}
          {job.address && <span className="muted">{job.address}</span>}
        </div>
      )}
      <CardFoot job={job} since={since} now={now} />
    </article>
  );
}

function CardFoot({ job, since, now }: { job: Job; since: string | undefined; now: number }) {
  if (job.status === 'running')
    return (
      <div className="pinn-card-foot run">
        <span className="pinn-timer">
          <Timer className="i" aria-hidden /> {fmtClock(workSecondsNow(job, since, now))}
        </span>
        {job.duration_min ? <span className="muted">geplant {fmtDuration(job.duration_min)}</span> : null}
      </div>
    );
  if (job.status === 'paused') return <div className="pinn-card-foot">Pause · bisher {fmtWork(job.work_seconds)}</div>;
  if (job.status === 'done')
    return (
      <div className="pinn-card-foot">
        fertig {job.finished_at ? hhmm(job.finished_at) : ''} · {fmtWork(job.work_seconds)}
        {job.outcome && job.outcome !== 'ok' ? <span className="pinn-flag"> · {job.outcome === 'problem' ? 'Problem' : job.outcome === 'follow_up' ? 'Folgetermin' : 'nicht angetroffen'}</span> : null}
      </div>
    );
  if (job.status === 'seen') return <div className="pinn-card-foot">gesehen {job.seen_at ? hhmm(job.seen_at) : ''}{job.duration_min ? ` · ${fmtDuration(job.duration_min)}` : ''}</div>;
  if (job.status === 'new') return <div className="pinn-card-foot muted">noch nicht gesehen{job.duration_min ? ` · ${fmtDuration(job.duration_min)}` : ''}</div>;
  return <div className="pinn-card-foot muted">abgesagt</div>;
}
