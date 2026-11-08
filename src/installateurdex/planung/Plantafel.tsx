// Plantafel: Termine je Monteur — wie App mobile/src/screens/PlanScreen.tsx (Daten: data/plan.ts, Logik: lib/plan.ts).
// Am PC als Wochentafel (Zeilen = Monteure, Spalten = Tage), schmal als Tagesleiste mit Terminliste.
// Rechte genau wie RLS in plantafel.sql: alle sehen alles; der Inhaber plant für alle, Monteure nur für sich
// (anlegen/ändern nur eigene, löschen nur selbst angelegte eigene). Vom Kunden gewählte Termine (Anfragen) erscheinen mit.
// Verschieben: Karte ziehen (Maus, Stift, Finger mit kurzem Halten) oder per Tastatur (Pfeiltasten, Enter, Escape) —
// Logik in verschieben.ts, Ziehen in ziehen.ts; gespeichert wird über updateAppointment, sofort angezeigt, mit „Rückgängig“.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, Plus, X } from 'lucide-react';
import { LoadGuard, useAsync, useLiveRefresh } from '../../components/ui';
import { Modal } from '../../components/form';
import { useInst } from '../context';
import { kindInfo, type Asset, type Site } from '../types';
import {
  APPT_MAX_HOURS,
  APPT_NOTE_MAX,
  APPT_STATUS_LABELS,
  APPT_TITLE_MAX,
  SLOTS,
  TITLES,
  WD,
  addDays,
  atLocal,
  conflicts,
  dayKey,
  dayOf,
  deDate,
  forDay,
  hhmm,
  hm,
  isoWeek,
  parseDay,
  parseHm,
  planMembers,
  requestTitle,
  weekStart,
  type Appt,
  type ApptInput,
  type ApptStatus,
  type PlanMember,
  type PlanRequest,
} from './logic';
import {
  MIN_DUR,
  REQUEST_MOVE_HINT,
  apptInputOf,
  canAssignTo,
  clampDur,
  clampStart,
  clashesWith,
  durationMin,
  minuteOfDay,
  moveBlockReason,
  movedAppt,
  sameSlot,
  snapMinutes,
  stepTarget,
  type MoveActor,
  type MoveTarget,
} from './verschieben';
import { usePointerDrag, type DropSpot } from './ziehen';
import { TL_PPM, Tagesansicht, type TlBlock, type TlLane } from './Tagesansicht';
import './planung.css';

/** Eine Karte auf der Tafel: eigener Termin oder vom Kunden gewählter Anfrage-Termin (wie App fromRequest). */
type Item =
  | { type: 'appt'; key: string; a: Appt; starts_at: string; ends_at: string; status: ApptStatus }
  | { type: 'req'; key: string; r: PlanRequest; starts_at: string; ends_at: string; status: ApptStatus };

interface Draft {
  id?: string;
  /** Original (beim Ändern) — für Rechte und assigned_name */
  orig?: Appt;
  site_id: string | null;
  asset_id: string | null;
  request_id: string | null;
  title: string;
  note: string;
  day: string;
  from: string;
  to: string;
  assigned_to: string | null;
  status: ApptStatus;
}

/** Sofort angezeigte Verschiebung, bis der Server sie zurückmeldet. */
interface Override {
  moved: Appt;
  /** Stand vor der Verschiebung */
  base: Appt;
  saved: boolean;
}

/** Laufende Verschiebung: mit Zeiger (Ziehen) oder Tastatur. */
interface MoveState {
  orig: Appt;
  mode: 'pointer' | 'key';
  /** Ganzen Termin verschieben oder (Tagesansicht) die Unterkante = Dauer ändern */
  kind: 'move' | 'resize';
  target: MoveTarget | null;
  /** Tagesansicht: neuer Beginn (Minuten nach Mitternacht, im 15-min-Raster) — fehlt = Uhrzeit bleibt */
  startMin?: number;
  /** Tagesansicht: neue Dauer in Minuten — fehlt = Dauer bleibt */
  durMin?: number;
  /** Tagesansicht: wo der Block gegriffen wurde (Minuten ab Beginn), damit er nicht zum Zeiger springt */
  grabMin?: number;
  /** Hervorgehobene Zeile der Wochentafel (Monteur-ID, „none“) — leer in der Tagesleiste */
  lane: string | null;
  /** Warum hier nicht abgelegt werden darf */
  reason: string | null;
}

type Notice =
  | { kind: 'undo'; text: string; orig: Appt; moved: Appt }
  | { kind: 'info' | 'error'; text: string };

/** Was die Zeiger-/Tastatur-Handler aus dem aktuellen Render brauchen. */
interface MoveCtx {
  /** Tagesansicht mit Zeitachse aktiv */
  timeline: boolean;
  spotTarget:(orig: Appt, spot: DropSpot) => { t: MoveTarget; lane: string | null; reason: string | null };
  keyDays: string[];
  keyLanes: (orig: Appt) => (string | null)[];
  laneIdOf: (uid: string | null) => string | null;
  current: (id: string) => Appt | undefined;
}

const sameMove = sameSlot;

/** Termin nach der laufenden Verschiebung (Tag/Monteur, in der Tagesansicht auch Uhrzeit und Dauer) */
const planned = (m: MoveState, team: PlanMember[]) => (m.target ? movedAppt(m.orig, m.target, team, m.startMin, m.durMin) : null);

const VIEW_KEY = 'idx-plantafel-ansicht';
function readView(): 'week' | 'day' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'day' ? 'day' : 'week';
  } catch {
    return 'week';
  }
}

function useMedia(query: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

const siteLabel = (s: Site | undefined) => (s ? `${s.operator_name ? `${s.operator_name} · ` : ''}${s.name}` : '');

export function Plantafel() {
  const { data, ext, org, can, role, base, bumpRequests } = useInst();
  // „für alle planen“: Inhaber, Stellvertreter oder Recht „Termine für alle“ (NACHTRAG-TEAMRECHTE; RLS appt_*)
  const isOwner = can('plantafel');
  const [params, setParams] = useSearchParams();
  const wide = useMedia('(min-width: 900px)');
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [filter, setFilter] = useState<string>('all');
  // Woche (Tafel bzw. schmal Tagesliste) oder Tag mit Zeitachse — gemerkt je Browser
  const [view, setViewState] = useState<'week' | 'day'>(readView);
  const setView = (v: 'week' | 'day') => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* privates Fenster o. Ä. — dann eben nicht gemerkt */
    }
  };
  const [draft, setDraft] = useState<Draft | null>(null);

  const weekEnd = useMemo(() => addDays(week, 7), [week]);

  const fixed = useAsync(async () => {
    const [sites, assets, members, me, openReqs] = await Promise.all([
      data.sites(),
      data.assets(),
      data.members(),
      ext.planung.myUserId(role),
      ext.planung.openRequests().catch(() => [] as PlanRequest[]),
    ]);
    return { sites, assets, me, openReqs, team: planMembers(members, me) };
  }, [data, ext, role]);

  const weekState = useAsync(async () => {
    const [appts, reqs] = await Promise.all([ext.planung.appointments(week, weekEnd), ext.planung.scheduledRequests(week, weekEnd)]);
    return { appts, reqs };
  }, [ext, week.getTime()]);
  useLiveRefresh([weekState.refresh], 60000);

  // Aus anderen Seiten kommend (…/plantafel?neu=1&objekt=…&anlage=…&anfrage=…&titel=…): gleich den Dialog öffnen
  const prefillKey = params.get('neu');
  useEffect(() => {
    if (!prefillKey || !fixed.data) return;
    const req = fixed.data.openReqs.find((r) => r.id === params.get('anfrage'));
    openNew({
      site_id: params.get('objekt') ?? req?.site_id ?? null,
      asset_id: params.get('anlage') ?? req?.asset_id ?? null,
      request_id: req?.id ?? null,
      title: params.get('titel') ?? (req ? requestTitle(req.kind) : undefined),
      startsAt: req?.scheduled_at ?? undefined,
      endsAt: req?.scheduled_end ?? undefined,
    });
    const next = new URLSearchParams(params);
    for (const k of ['neu', 'objekt', 'anlage', 'anfrage', 'titel']) next.delete(k);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey, fixed.data]);

  const me = fixed.data?.me ?? null;
  const team = fixed.data?.team ?? [];
  const todayKey = dayKey(new Date());

  // Rechte = RLS (plantafel.sql)
  const canPlanFor = (uid: string | null) => isOwner || (!!me && uid === me);
  const canEdit = (a: Appt) => isOwner || (!!me && a.assigned_to === me);
  const canDelete = (a: Appt) => isOwner || (!!me && a.created_by === me && a.assigned_to === me);
  const actor: MoveActor = { isOwner, me };

  // ---------- Verschieben (Ziehen & Tastatur) ----------
  const [overrides, setOverrides] = useState<Map<string, Override>>(() => new Map());
  const [move, setMoveState] = useState<MoveState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const boardWrap = useRef<HTMLDivElement | null>(null);
  // Ref sofort mitführen: ein schnelles Loslassen kommt oft vor dem nächsten Render an
  const moveRef = useRef<MoveState | null>(null);
  const setMove = (m: MoveState | null) => {
    moveRef.current = m;
    setMoveState(m);
  };
  const moveCtx = useRef<MoveCtx | null>(null);

  // Sofort-Anzeige aufräumen, sobald der Server den neuen Stand liefert (oder sich der Termin inzwischen anders geändert hat)
  const rows = weekState.data?.appts;
  useEffect(() => {
    if (!rows) return;
    setOverrides((m) => {
      let n: Map<string, Override> | null = null;
      for (const [id, o] of m) {
        if (!o.saved) continue;
        const row = rows.find((r) => r.id === id);
        if (!row || row.updated_at !== o.base.updated_at || sameMove(row, o.moved)) {
          n ??= new Map(m);
          n.delete(id);
        }
      }
      return n ?? m;
    });
  }, [rows]);

  // Hinweise verschwinden von selbst (Fehler bleiben, bis man sie schließt)
  useEffect(() => {
    if (!notice || notice.kind === 'error') return;
    const t = window.setTimeout(() => setNotice((n) => (n === notice ? null : n)), notice.kind === 'undo' ? 8000 : 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Nach dem Verschieben per Tastatur bleibt der Fokus auf der Karte (sie steht jetzt in einer anderen Zelle)
  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector<HTMLElement>(`[data-appt="${CSS.escape(focusId)}"]`);
    if (el) {
      el.focus();
      setFocusId(null);
    }
  }, [focusId, overrides]);

  async function saveMove(from: Appt, moved: Appt, undo = false) {
    setOverrides((m) => new Map(m).set(from.id, { moved, base: from, saved: false }));
    try {
      await ext.planung.updateAppointment(from.id, apptInputOf(moved));
      setOverrides((m) => {
        const cur = m.get(from.id);
        return cur?.moved === moved ? new Map(m).set(from.id, { ...cur, saved: true }) : m;
      });
      weekState.refresh();
      if (undo) setNotice({ kind: 'info', text: 'Verschiebung rückgängig gemacht.' });
      else {
        const who = moved.assigned_to !== from.assigned_to ? ` · ${team.find((m) => m.userId === moved.assigned_to)?.name ?? moved.assigned_name ?? ''}` : '';
        const d = new Date(moved.starts_at);
        const onlyEnd = !who && Date.parse(moved.starts_at) === Date.parse(from.starts_at);
        setNotice({
          kind: 'undo',
          text: `${onlyEnd ? 'Dauer geändert:' : 'Verschoben auf'} ${WD[d.getDay()]} ${deDate(d)} ${hhmm(moved.starts_at)}–${hhmm(moved.ends_at)}${who}`,
          orig: from,
          moved,
        });
      }
    } catch (err) {
      // zurückspringen
      setOverrides((m) => {
        if (m.get(from.id)?.moved !== moved) return m;
        const n = new Map(m);
        n.delete(from.id);
        return n;
      });
      weekState.refresh();
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  }

  function undoMove(n: Extract<Notice, { kind: 'undo' }>) {
    const cur = moveCtx.current?.current(n.moved.id) ?? n.moved;
    setNotice(null);
    void saveMove(cur, {
      ...cur,
      starts_at: n.orig.starts_at,
      ends_at: n.orig.ends_at,
      assigned_to: n.orig.assigned_to,
      assigned_name: n.orig.assigned_name,
    }, true);
  }

  /** Verschiebung abschließen (Zeiger losgelassen bzw. Enter). */
  function finishMove(m: MoveState) {
    setMove(null);
    if (!m.target) return;
    if (m.reason) return setNotice({ kind: 'info', text: m.reason });
    const moved = planned(m, team)!;
    if (sameSlot(m.orig, moved)) {
      if (m.mode === 'key') setNotice({ kind: 'info', text: 'Termin bleibt, wo er ist.' });
      return;
    }
    if (m.mode === 'key') setFocusId(m.orig.id);
    void saveMove(m.orig, moved);
  }

  /** Zeigerposition → Ziel (Tag/Monteur, auf der Zeitachse auch Uhrzeit bzw. Dauer) */
  function applySpot(m: MoveState, spot: DropSpot | null): MoveState {
    const ctx = moveCtx.current;
    if (m.kind === 'resize') {
      // Unterkante: nur die Höhe zählt; außerhalb der Spalten bleibt der letzte Stand
      if (!spot || spot.minute === undefined || !ctx) return m;
      const s = minuteOfDay(m.orig.starts_at);
      const end = Math.min(24 * 60, Math.round(spot.minute / MIN_DUR) * MIN_DUR);
      return {
        ...m,
        target: { day: dayOf(m.orig.starts_at), assigned_to: m.orig.assigned_to },
        lane: ctx.laneIdOf(m.orig.assigned_to),
        reason: null,
        durMin: Math.min(clampDur(end - s), 24 * 60 - s),
      };
    }
    if (!spot || !ctx) return { ...m, target: null, lane: null, reason: null, startMin: undefined };
    const r = ctx.spotTarget(m.orig, spot);
    const startMin = spot.minute !== undefined && m.grabMin !== undefined ? clampStart(snapMinutes(spot.minute - m.grabMin)) : undefined;
    return { ...m, target: r.t, lane: r.lane, reason: r.reason, startMin };
  }

  const drag = usePointerDrag<{ it: Item; resize?: boolean }>({
    scrollEl: () => boardWrap.current,
    onStart({ it, resize }, _x, y, rect) {
      if (it.type === 'req') {
        setNotice({ kind: 'info', text: REQUEST_MOVE_HINT });
        return false;
      }
      const reason = moveBlockReason(it.a, actor);
      if (reason) {
        setNotice({ kind: 'info', text: reason });
        return false;
      }
      setNotice(null);
      const timeline = !!moveCtx.current?.timeline;
      setMove({
        orig: it.a,
        mode: 'pointer',
        kind: resize && timeline ? 'resize' : 'move',
        target: null,
        lane: null,
        reason: null,
        grabMin: timeline && !resize ? Math.max(0, (y - rect.top) / TL_PPM) : undefined,
      });
      return true;
    },
    onOver(spot) {
      const m = moveRef.current;
      if (m) setMove(applySpot(m, spot));
    },
    onDrop(spot) {
      const m = moveRef.current;
      if (!m) return;
      const next = applySpot(m, spot);
      if (!next.target) {
        setMove(null);
        return;
      }
      finishMove(next);
    },
    onCancel() {
      setMove(null);
    },
  });

  function onCardKey(e: KeyboardEvent<HTMLElement>, a: Appt) {
    const ctx = moveCtx.current;
    if (!ctx) return;
    const m = moveRef.current;
    const active = m?.mode === 'key' && m.orig.id === a.id ? m : null;
    if (active && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setMove(null);
      setNotice({ kind: 'info', text: 'Verschieben abgebrochen.' });
      return;
    }
    if (active && e.key === 'Enter') {
      e.preventDefault();
      finishMove(active);
      return;
    }
    const k = e.key;
    if (ctx.timeline) return onTimelineKey(e, a, active);
    const dir =
      k === 'ArrowLeft' ? (e.shiftKey ? 'lane-' : 'day-')
      : k === 'ArrowRight' ? (e.shiftKey ? 'lane+' : 'day+')
      : k === 'ArrowUp' && (e.shiftKey || active) ? 'lane-'
      : k === 'ArrowDown' && (e.shiftKey || active) ? 'lane+'
      : null;
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if (!active) {
      const reason = moveBlockReason(a, actor);
      if (reason) return setNotice({ kind: 'info', text: reason });
    }
    const t0: MoveTarget = active?.target ?? { day: dayOf(a.starts_at), assigned_to: a.assigned_to };
    if ((dir === 'lane-' || dir === 'lane+') && !isOwner) {
      const text = 'Anderen Monteuren gibt nur der Inhaber (oder wer das Recht hat) Termine.';
      // während des Verschiebens steht der Hinweis in der Leiste; der nächste Tag-Schritt räumt ihn wieder weg
      if (active) setMove({ ...active, reason: text });
      else setNotice({ kind: 'info', text });
      return;
    }
    const t = stepTarget(t0, dir, ctx.keyDays, ctx.keyLanes(a)) ?? t0;
    setNotice((n) => (n?.kind === 'error' ? null : n));
    setMove({ orig: active?.orig ?? a, mode: 'key', kind: 'move', target: t, lane: ctx.laneIdOf(t.assigned_to), reason: null });
  }

  /**
   * Tagesansicht: Hoch/Runter = 15 min früher/später (mit Umschalt 1 Stunde), Alt+Hoch/Runter = Dauer ±15 min,
   * Links/Rechts (auch mit Umschalt) = Monteur. Enter/Escape wie in der Woche (oben in onCardKey).
   */
  function onTimelineKey(e: KeyboardEvent<HTMLElement>, a: Appt, active: MoveState | null) {
    const ctx = moveCtx.current!;
    const k = e.key;
    const vertical = k === 'ArrowUp' || k === 'ArrowDown';
    if (!vertical && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if (!active) {
      const reason = moveBlockReason(a, actor);
      if (reason) return setNotice({ kind: 'info', text: reason });
    }
    const base: MoveState = active ?? {
      orig: a,
      mode: 'key',
      kind: 'move',
      target: { day: dayOf(a.starts_at), assigned_to: a.assigned_to },
      lane: ctx.laneIdOf(a.assigned_to),
      reason: null,
      startMin: minuteOfDay(a.starts_at),
      durMin: durationMin(a),
    };
    const t0 = base.target ?? { day: dayOf(a.starts_at), assigned_to: a.assigned_to };
    const start = base.startMin ?? minuteOfDay(a.starts_at);
    const dur = base.durMin ?? durationMin(a);
    const sign = k === 'ArrowUp' ? -1 : 1;
    setNotice((n) => (n?.kind === 'error' ? null : n));
    if (vertical && e.altKey) {
      // Dauer, aber nicht über 24:00 hinaus
      return setMove({ ...base, reason: null, durMin: Math.min(clampDur(dur + sign * MIN_DUR), 24 * 60 - start) });
    }
    if (vertical) {
      const next = clampStart(start + sign * (e.shiftKey ? 60 : MIN_DUR));
      return setMove({ ...base, reason: null, startMin: next, durMin: Math.min(dur, 24 * 60 - next) });
    }
    if (!isOwner) return setMove({ ...base, reason: 'Anderen Monteuren gibt nur der Inhaber (oder wer das Recht hat) Termine.' });
    const t = stepTarget(t0, k === 'ArrowLeft' ? 'lane-' : 'lane+', ctx.keyDays, ctx.keyLanes(a)) ?? t0;
    setMove({ ...base, target: t, lane: ctx.laneIdOf(t.assigned_to), reason: null });
  }

  function shiftWeek(n: number) {
    const w = n === 0 ? weekStart(new Date()) : addDays(week, 7 * n);
    setWeek(w);
    setDay(n === 0 ? dayKey(new Date()) : dayKey(w));
  }

  /** Tag zeigen (lädt die passende Woche mit) */
  function goDay(k: string) {
    setMove(null);
    setDay(k);
    const d = parseDay(k);
    if (d < week || d >= weekEnd) setWeek(weekStart(d));
  }

  /** Pfeile/„Heute“ der Kopfleiste: in der Tagesansicht tageweise, sonst wochenweise */
  function shiftNav(n: number) {
    if (view !== 'day') return shiftWeek(n);
    goDay(n === 0 ? todayKey : dayKey(addDays(parseDay(day), n)));
  }

  function defaultAssignee(lane?: string | null): string | null {
    if (lane !== undefined && lane !== null && canPlanFor(lane)) return lane;
    if (isOwner && filter !== 'all') return filter;
    return me ?? (isOwner ? (team[0]?.userId ?? null) : null);
  }

  function openNew(pre: {
    day?: string;
    lane?: string | null;
    site_id?: string | null;
    asset_id?: string | null;
    request_id?: string | null;
    title?: string;
    startsAt?: string;
    endsAt?: string;
  } = {}) {
    // wie App: ausgewählter Tag, aber nie in der Vergangenheit
    const d0 = pre.day ?? (day >= todayKey ? day : todayKey);
    setDraft({
      site_id: pre.site_id ?? null,
      asset_id: pre.asset_id ?? null,
      request_id: pre.request_id ?? null,
      title: pre.title ?? 'Wartung',
      note: '',
      day: pre.startsAt ? dayOf(pre.startsAt) : d0,
      from: pre.startsAt ? hhmm(pre.startsAt) : '08:00',
      to: pre.endsAt ? hhmm(pre.endsAt) : '10:00',
      assigned_to: defaultAssignee(pre.lane),
      status: 'planned',
    });
  }

  function openEdit(a: Appt) {
    setMove(null);
    setDraft({
      id: a.id,
      orig: a,
      site_id: a.site_id,
      asset_id: a.asset_id,
      request_id: a.request_id,
      title: a.title,
      note: a.note ?? '',
      day: dayOf(a.starts_at),
      from: hhmm(a.starts_at),
      to: hhmm(a.ends_at),
      assigned_to: a.assigned_to,
      status: a.status,
    });
  }

  function afterSave(savedDay: string) {
    setDraft(null);
    const d = parseDay(savedDay);
    if (d < week || d >= weekEnd) setWeek(weekStart(d));
    setDay(savedDay);
    weekState.reload();
    fixed.refresh();
    bumpRequests();
  }

  return (
    <>
      <div className="idx-head">
        <h1>Plantafel</h1>
        <button type="button" className="btn small" onClick={() => openNew()} disabled={!fixed.data || (!isOwner && !me)}>
          <CalendarPlus className="i" aria-hidden /> Termin anlegen
        </button>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        Termine je Monteur — dieselbe Plantafel wie in der App.{' '}
        {isOwner
          ? 'Du planst für alle.'
          : 'Du siehst alle Termine im Betrieb und planst deine eigenen; für andere plant der Inhaber.'}
      </p>

      <LoadGuard state={fixed}>
        {({ sites, assets, openReqs }) => {
          const siteById = new Map(sites.map((s) => [s.id, s]));
          const assetById = new Map(assets.map((a) => [a.id, a]));
          const memberOf = (id: string | null) => team.find((m) => m.userId === id);
          // Verschobene Termine sofort an der neuen Stelle zeigen (bis der Server sie bestätigt)
          const appts = (weekState.data?.appts ?? []).map((a) => overrides.get(a.id)?.moved ?? a);
          // wie App: Kundentermine nur, wenn noch kein Termin mit dieser Anfrage existiert
          const linked = new Set(appts.map((a) => a.request_id).filter(Boolean));
          const items: Item[] = [
            ...appts.map((a): Item => ({ type: 'appt', key: a.id, a, starts_at: a.starts_at, ends_at: a.ends_at, status: a.status })),
            ...(weekState.data?.reqs ?? [])
              .filter((r) => r.scheduled_at && r.scheduled_end && !linked.has(r.id))
              .map((r): Item => ({ type: 'req', key: `req:${r.id}`, r, starts_at: r.scheduled_at!, ends_at: r.scheduled_end!, status: 'planned' })),
          ];
          const shown = items.filter((it) => filter === 'all' || (it.type === 'appt' && it.a.assigned_to === filter));
          const clash = conflicts(appts);
          const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
          // Wochentafel: Mo–Sa, Sonntag nur wenn dort etwas steht (wie App: 6 Spalten)
          const cols = days.filter((d, i) => i < 6 || forDay(shown, dayKey(d)).length > 0);
          const countFor = (uid: string) => appts.filter((a) => a.assigned_to === uid && a.status !== 'canceled').length;

          /** Gemeinsame Eigenschaften einer Terminkarte (Wochentafel, Tagesliste, Zeitachse): Klick, Tastatur, Ziehen, Ansage */
          const apptProps = (it: Item, a: Appt) => {
            const s = a.site_id ? siteById.get(a.site_id) : undefined;
            const label = `${hhmm(a.starts_at)}–${hhmm(a.ends_at)} ${a.title} ${s?.name ?? ''}`;
            const movable = !moveBlockReason(a, actor);
            const moving = move?.orig.id === a.id ? (move.mode === 'pointer' ? ' dragging' : ' moving') : '';
            const saving = overrides.has(a.id) && !overrides.get(a.id)!.saved ? ' saving' : '';
            return {
              movable,
              cls: `${a.status}${movable ? ' can-move' : ''}${moving}${saving}`,
              props: {
                type: 'button' as const,
                'data-appt': a.id,
                onClick: () => openEdit(a),
                onKeyDown: (e: KeyboardEvent<HTMLElement>) => onCardKey(e, a),
                onBlur: () => {
                  if (moveRef.current?.mode === 'key' && moveRef.current.orig.id === a.id) setMove(null);
                },
                ...drag.bind({ it }),
                'aria-label': `${label}, ${canEdit(a) ? 'bearbeiten' : 'ansehen'}`,
                'aria-describedby': movable ? 'pt-move-help' : undefined,
              },
            };
          };

          /** Block auf der Zeitachse (Tagesansicht): Lage/Größe aus Tagesansicht.tsx, Unterkante ändert die Dauer */
          const block = (it: Item, style: CSSProperties, compact: boolean) => {
            if (it.type === 'req') {
              const r = it.r;
              return (
                <div key={it.key} className={`pt-card pt-block req ${compact ? 'compact' : ''}`} style={style} title={REQUEST_MOVE_HINT} {...drag.bind({ it })}>
                  <span className="pt-card-top">
                    <span className="pt-time">{hhmm(it.starts_at)}</span>
                    <span className="pt-title">{requestTitle(r.kind)}</span>
                  </span>
                  {!compact && (
                    <span className="pt-card-acts">
                      <button
                        type="button"
                        className="pt-link"
                        onClick={() =>
                          openNew({ site_id: r.site_id, asset_id: r.asset_id, request_id: r.id, title: requestTitle(r.kind), startsAt: it.starts_at, endsAt: it.ends_at })
                        }
                      >
                        Einplanen
                      </button>
                    </span>
                  )}
                </div>
              );
            }
            const a = it.a;
            const s = a.site_id ? siteById.get(a.site_id) : undefined;
            const asset = a.asset_id ? assetById.get(a.asset_id) : undefined;
            const who = memberOf(a.assigned_to);
            const p = apptProps(it, a);
            return (
              <button
                key={it.key}
                {...p.props}
                className={`pt-card pt-block ${p.cls}${compact ? ' compact' : ''}${clash.has(a.id) ? ' has-clash' : ''}`}
                style={{ ...style, '--lane': who?.color ?? 'var(--muted)' } as CSSProperties}
              >
                <span className="pt-card-top">
                  <span className="pt-time">{compact ? hhmm(a.starts_at) : `${hhmm(a.starts_at)}–${hhmm(a.ends_at)}`}</span>
                  {compact && <span className="pt-title">{a.title}</span>}
                  {clash.has(a.id) && (
                    <span className="pt-clash" title="Dieser Monteur hat zur selben Zeit einen anderen Termin">
                      <AlertTriangle className="i" aria-hidden />
                      {compact ? '' : ' Überschneidung'}
                    </span>
                  )}
                  {a.status !== 'planned' && !compact && <span className={`pt-tag ${a.status}`}>{APPT_STATUS_LABELS[a.status]}</span>}
                </span>
                {!compact && (
                  <span className="pt-title">
                    {a.title}
                    {asset ? ` · ${asset.name}` : ''}
                  </span>
                )}
                {!compact && s && <span className="pt-sub">{siteLabel(s)}</span>}
                {p.movable && <span className="pt-resize" {...drag.bind({ it, resize: true })} title="Ziehen ändert die Dauer" aria-hidden />}
              </button>
            );
          };

          const card = (it: Item, showWho: boolean) => {
            if (it.type === 'req') {
              const r = it.r;
              const s = r.site_id ? siteById.get(r.site_id) : undefined;
              const asset = r.asset_id ? assetById.get(r.asset_id) : undefined;
              return (
                <div key={it.key} className="pt-card req" title={REQUEST_MOVE_HINT} {...drag.bind({ it })}>
                  <div className="pt-card-top">
                    <span className="pt-time">
                      {hhmm(it.starts_at)}–{hhmm(it.ends_at)}
                    </span>
                    <span className="pt-tag">vom Kunden gewählt</span>
                  </div>
                  <div className="pt-title">
                    {requestTitle(r.kind)}
                    {asset ? ` · ${asset.name}` : ''}
                  </div>
                  {s && <div className="pt-sub">{siteLabel(s)}</div>}
                  {r.contact_name && <div className="pt-sub">{r.contact_name}</div>}
                  <div className="pt-card-acts">
                    <Link to={`${base}/anfragen/${r.id}`}>Anfrage</Link>
                    <button
                      type="button"
                      className="pt-link"
                      onClick={() =>
                        openNew({
                          site_id: r.site_id,
                          asset_id: r.asset_id,
                          request_id: r.id,
                          title: requestTitle(r.kind),
                          startsAt: it.starts_at,
                          endsAt: it.ends_at,
                        })
                      }
                    >
                      Einplanen
                    </button>
                  </div>
                </div>
              );
            }
            const a = it.a;
            const s = a.site_id ? siteById.get(a.site_id) : undefined;
            const asset = a.asset_id ? assetById.get(a.asset_id) : undefined;
            const who = memberOf(a.assigned_to);
            const p = apptProps(it, a);
            return (
              <button key={it.key} {...p.props} className={`pt-card ${p.cls}`} style={{ '--lane': who?.color ?? 'var(--muted)' } as CSSProperties}>
                <span className="pt-card-top">
                  <span className="pt-time">
                    {hhmm(a.starts_at)}–{hhmm(a.ends_at)}
                  </span>
                  {clash.has(a.id) && (
                    <span className="pt-clash" title="Dieser Monteur hat zur selben Zeit einen anderen Termin">
                      <AlertTriangle className="i" aria-hidden /> Überschneidung
                    </span>
                  )}
                  {a.status !== 'planned' && <span className={`pt-tag ${a.status}`}>{APPT_STATUS_LABELS[a.status]}</span>}
                </span>
                <span className="pt-title">
                  {a.title}
                  {asset ? ` · ${asset.name}` : ''}
                </span>
                {s && <span className="pt-sub">{siteLabel(s)}</span>}
                {showWho && (
                  <span className="pt-who" style={{ color: who?.color }}>
                    ● {who?.name ?? a.assigned_name ?? 'nicht zugeteilt'}
                  </span>
                )}
              </button>
            );
          };

          // Zeilen der Wochentafel: Monteure (gefiltert), dann Nicht-Zugeteilte/Ehemalige, dann Kundentermine
          type Lane = { id: string; label: string; color: string; member?: PlanMember; match: (it: Item) => boolean };
          const lanes: Lane[] = team
            .filter((m) => filter === 'all' || m.userId === filter)
            .map((m) => ({
              id: m.userId,
              label: `${m.name}${m.isMe ? ' (ich)' : ''}`,
              color: m.color,
              member: m,
              match: (it) => it.type === 'appt' && it.a.assigned_to === m.userId,
            }));
          const orphan = (it: Item) => it.type === 'appt' && !memberOf(it.a.assigned_to);
          if (shown.some(orphan)) lanes.push({ id: 'none', label: 'Nicht zugeteilt', color: 'var(--muted)', match: orphan });
          if (shown.some((it) => it.type === 'req'))
            lanes.push({ id: 'req', label: 'Vom Kunden gewählt', color: 'var(--muted)', match: (it) => it.type === 'req' });

          // ---------- Verschieben: Ziele, Vorschau, Ansage ----------
          const laneIdOf = (uid: string | null) => (memberOf(uid) ? uid : 'none');
          const timeline = view === 'day';
          moveCtx.current = {
            timeline,
            spotTarget(orig, spot) {
              // Tagesleiste (schmal): nur der Tag ändert sich
              if (!spot.lane) return { t: { day: spot.day, assigned_to: orig.assigned_to }, lane: null, reason: null };
              if (spot.lane === 'none')
                return {
                  t: { day: spot.day, assigned_to: orig.assigned_to },
                  lane: 'none',
                  reason: memberOf(orig.assigned_to) ? 'Ein Termin braucht einen Monteur — bitte in dessen Zeile ablegen.' : null,
                };
              return {
                t: { day: spot.day, assigned_to: spot.lane },
                lane: spot.lane,
                reason: canAssignTo(orig, spot.lane, actor) ? null : 'Anderen Monteuren gibt nur der Inhaber (oder wer das Recht hat) Termine.',
              };
            },
            keyDays: timeline ? [day] : (wide ? cols : days).map(dayKey),
            keyLanes(orig) {
              const ids = wide || timeline ? lanes.filter((l) => l.member).map((l) => l.id) : team.map((m) => m.userId);
              const ok: (string | null)[] = ids.filter((id) => canAssignTo(orig, id, actor));
              if (!memberOf(orig.assigned_to)) ok.push(orig.assigned_to);
              return ok;
            },
            laneIdOf: (uid) => (wide || timeline ? laneIdOf(uid) : null),
            current: (id) => appts.find((a) => a.id === id),
          };
          const preview =
            move?.target && !move.reason
              ? (() => {
                  const moved = planned(move, team)!;
                  return { moved, same: sameSlot(move.orig, moved), clash: clashesWith(appts, moved) };
                })()
              : null;
          /** Zielzelle hervorheben (Tafel: Tag + Zeile, Tagesleiste: nur Tag) */
          const dropState = (k: string, laneId: string | null): { cls: string; slot: ReactNode } | null => {
            if (!move?.target || move.target.day !== k || (laneId !== null && move.lane !== laneId)) return null;
            if (move.reason || !preview) return { cls: 'drop-no', slot: null };
            if (preview.same) return { cls: 'drop-same', slot: null };
            const c = preview.clash.length > 0;
            return {
              cls: c ? 'drop-clash' : 'drop-ok',
              slot: (
                <div className={`pt-dropslot ${c ? 'clash' : ''}`} aria-hidden>
                  <span className="pt-time">
                    {hhmm(preview.moved.starts_at)}–{hhmm(preview.moved.ends_at)}
                  </span>
                  <span className="pt-title">{preview.moved.title}</span>
                  {c && (
                    <span className="pt-clash">
                      <AlertTriangle className="i" aria-hidden /> Überschneidung
                    </span>
                  )}
                </div>
              ),
            };
          };
          const moveText = (() => {
            if (!move) return '';
            const keys = move.mode === 'key' ? ' Enter legt ab, Escape bricht ab.' : '';
            if (!move.target)
              return `${timeline ? 'Termin in eine Monteur-Spalte ziehen.' : wide ? 'Termin auf einen Tag in der Tafel ziehen.' : 'Termin auf einen Tag oben ziehen.'}${move.mode === 'pointer' ? ' Escape bricht ab.' : ''}`;
            if (move.reason) return `${move.reason}${keys}`;
            if (!preview || preview.same) return `${move.kind === 'resize' ? 'Dauer bleibt.' : 'Hier steht der Termin schon.'}${keys}`;
            const d = new Date(preview.moved.starts_at);
            const who =
              preview.moved.assigned_to !== move.orig.assigned_to || (!wide && !timeline)
                ? `, ${memberOf(preview.moved.assigned_to)?.name ?? preview.moved.assigned_name ?? 'nicht zugeteilt'}`
                : '';
            const clashTxt = preview.clash.length
              ? ` Überschneidung mit ${preview.clash.map((o) => `${hhmm(o.starts_at)}–${hhmm(o.ends_at)} ${o.title}`).join(', ')} — Ablegen geht trotzdem.`
              : '';
            const span = `${hhmm(preview.moved.starts_at)}–${hhmm(preview.moved.ends_at)}`;
            if (move.kind === 'resize') return `Dauer: ${span} (${hm(durationMin(preview.moved))}).${clashTxt}${keys}`;
            return `Nach ${WD[d.getDay()]} ${deDate(d)} ${span}${who}.${clashTxt}${keys}`;
          })();
          const ghostWho = move ? memberOf(move.orig.assigned_to) : undefined;

          // ---------- Tagesansicht: Spalten = Monteure (+ Nicht zugeteilt / Kundentermine, wenn an dem Tag vorhanden) ----------
          const dayItems = forDay(shown, day);
          const tlLanes: TlLane[] = lanes
            .filter((l) => l.member || dayItems.some(l.match))
            .map((l) => {
              const min = dayItems
                .filter((it) => it.type === 'appt' && it.status !== 'canceled' && l.match(it))
                .reduce((sum, it) => sum + Math.max(0, Date.parse(it.ends_at) - Date.parse(it.starts_at)) / 60_000, 0);
              return {
                id: l.id,
                label: l.label,
                color: l.color,
                droppable: l.id !== 'req',
                sub: l.member ? (min ? `${hm(Math.round(min))} verplant` : 'frei') : undefined,
              };
            });
          const tlBlocks: TlBlock[] = dayItems.flatMap((it) => {
            const lane = lanes.find((l) => l.match(it));
            return lane ? [{ key: it.key, lane: lane.id, starts_at: it.starts_at, ends_at: it.ends_at, render: (st: CSSProperties, c: boolean) => block(it, st, c) }] : [];
          });
          const tlPreview =
            timeline && move?.target && preview && !preview.same && move.target.day === day && move.lane
              ? {
                  lane: move.lane,
                  starts_at: preview.moved.starts_at,
                  ends_at: preview.moved.ends_at,
                  cls: preview.clash.length ? 'clash' : '',
                  label: (
                    <>
                      <span className="pt-time">
                        {hhmm(preview.moved.starts_at)}–{hhmm(preview.moved.ends_at)}
                      </span>
                      <span className="pt-title">{preview.moved.title}</span>
                    </>
                  ),
                }
              : null;
          const tlLaneCls = (laneId: string) => {
            if (!timeline || !move?.target || move.lane !== laneId) return '';
            if (move.reason || !preview) return 'drop-no';
            return preview.clash.length && !preview.same ? 'drop-clash' : 'drop-ok';
          };
          const dayDate = parseDay(day);

          return (
            <>
              <div className="pt-toolbar">
                <div className="pt-weeknav">
                  <div className="pt-viewswitch" role="group" aria-label="Ansicht">
                    <button type="button" className={view === 'week' ? 'on' : ''} aria-pressed={view === 'week'} onClick={() => setView('week')}>
                      <CalendarDays className="i" aria-hidden /> Woche
                    </button>
                    <button
                      type="button"
                      className={view === 'day' ? 'on' : ''}
                      aria-pressed={view === 'day'}
                      onClick={() => {
                        setMove(null);
                        setView('day');
                      }}
                    >
                      <Clock className="i" aria-hidden /> Tag
                    </button>
                  </div>
                  <button type="button" className="btn ghost small" onClick={() => shiftNav(-1)} aria-label={timeline ? 'Voriger Tag' : 'Vorige Woche'}>
                    <ChevronLeft className="i" aria-hidden />
                  </button>
                  <div className="pt-weeklabel">
                    {timeline ? (
                      <>
                        <b>
                          {WD[dayDate.getDay()]} {deDate(dayDate)}
                          {dayDate.getFullYear()}
                        </b>
                        <span className="muted">KW {isoWeek(dayDate)}</span>
                      </>
                    ) : (
                      <>
                        <b>KW {isoWeek(week)}</b>
                        <span className="muted">
                          {deDate(days[0])} – {deDate(days[6])}
                          {days[0].getFullYear()}
                        </span>
                      </>
                    )}
                  </div>
                  <button type="button" className="btn ghost small" onClick={() => shiftNav(1)} aria-label={timeline ? 'Nächster Tag' : 'Nächste Woche'}>
                    <ChevronRight className="i" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => shiftNav(0)}
                    disabled={timeline ? day === todayKey : dayKey(week) === dayKey(weekStart(new Date()))}
                  >
                    Heute
                  </button>
                  {weekState.loading && <span className="spinner pt-spin" aria-label="Lädt" />}
                </div>
                {team.length > 1 && (
                  <div className="idx-tabs pt-filter" role="tablist" aria-label="Monteur">
                    <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
                      Alle
                    </button>
                    {team.map((m) => (
                      <button
                        key={m.userId}
                        type="button"
                        role="tab"
                        aria-selected={filter === m.userId}
                        className={filter === m.userId ? 'on' : ''}
                        onClick={() => setFilter(m.userId)}
                      >
                        <span className="pt-dot" style={{ background: m.color }} aria-hidden />
                        {m.name}
                        {m.isMe ? ' (ich)' : ''} <span className="n">{countFor(m.userId)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {weekState.error && (
                <div>
                  <div className="error-box">{weekState.error}</div>
                  <button className="btn ghost small" onClick={weekState.reload}>
                    Erneut versuchen
                  </button>
                </div>
              )}

              {timeline ? (
                <>
                  {!wide && (
                    <div className="pt-strip">
                      {days.map((d) => {
                        const k = dayKey(d);
                        return (
                          <button
                            key={k}
                            type="button"
                            className={`pt-pill ${k === day ? 'on' : ''} ${k === todayKey ? 'today' : ''}`}
                            onClick={() => goDay(k)}
                            aria-pressed={k === day}
                            aria-label={`${WD[d.getDay()]} ${d.getDate()}.`}
                          >
                            <span className="wd">{WD[d.getDay()]}</span>
                            <span className="num">{d.getDate()}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className={move?.mode === 'pointer' ? 'is-dragging' : undefined}>
                    <Tagesansicht
                      day={day}
                      isToday={day === todayKey}
                      lanes={tlLanes}
                      blocks={tlBlocks}
                      preview={tlPreview}
                      laneCls={tlLaneCls}
                      wrapRef={boardWrap}
                      busy={!!move}
                      canPick={(laneId) => { const m = memberOf(laneId); return !!m && canPlanFor(m.userId); }}
                      onPick={(laneId, startMin) => {
                        if (drag.justDragged() || moveRef.current) return;
                        // 1 h Standarddauer, höchstens bis 23:59
                        const end = Math.min(startMin + 60, 24 * 60 - 1);
                        openNew({
                          day,
                          lane: laneId,
                          startsAt: atLocal(day, [Math.floor(startMin / 60), startMin % 60]).toISOString(),
                          endsAt: atLocal(day, [Math.floor(end / 60), end % 60]).toISOString(),
                        });
                      }}
                    />
                  </div>
                  {tlLanes.length === 0 && <div className="empty">Kein Team geladen.</div>}
                </>
              ) : wide ? (
                <div className={`pt-board-wrap${move?.mode === 'pointer' ? ' is-dragging' : ''}`} ref={boardWrap}>
                  <div className="pt-board" style={{ gridTemplateColumns: `150px repeat(${cols.length}, minmax(0, 1fr))`, minWidth: 150 + cols.length * 150 }}>
                    <div className="pt-corner" />
                    {cols.map((d) => {
                      const k = dayKey(d);
                      const n = forDay(shown, k).filter((it) => it.status !== 'canceled').length;
                      return (
                        <div key={k} className={`pt-dayhead ${k === todayKey ? 'today' : ''}`}>
                          <button
                            type="button"
                            className="pt-dayhead-btn"
                            onClick={() => {
                              goDay(k);
                              setView('day');
                            }}
                            title="Tag mit Zeitachse öffnen"
                          >
                            <b>
                              {WD[d.getDay()]} {deDate(d)}
                            </b>
                            <span className="muted">{n ? `${n} ${n === 1 ? 'Termin' : 'Termine'}` : 'frei'}</span>
                          </button>
                        </div>
                      );
                    })}
                    {lanes.map((lane) => (
                      <LaneRow
                        key={lane.id}
                        lane={lane}
                        cols={cols}
                        todayKey={todayKey}
                        items={shown.filter(lane.match)}
                        canAdd={!!lane.member && canPlanFor(lane.member.userId)}
                        onAdd={(k) => openNew({ day: k, lane: lane.member?.userId })}
                        card={(it) => card(it, false)}
                        droppable={lane.id !== 'req'}
                        dropState={(k) => dropState(k, lane.id)}
                        ignoreClick={() => drag.justDragged() || !!moveRef.current}
                      />
                    ))}
                  </div>
                  {lanes.length === 0 && <div className="empty">Kein Team geladen.</div>}
                </div>
              ) : (
                <>
                  <div className="pt-strip">
                    {days.map((d) => {
                      const k = dayKey(d);
                      const n = forDay(shown, k).filter((it) => it.status !== 'canceled').length;
                      const ds = dropState(k, null);
                      return (
                        <button
                          key={k}
                          type="button"
                          data-drop-day={k}
                          className={`pt-pill ${k === day ? 'on' : ''} ${k === todayKey ? 'today' : ''} ${ds?.cls ?? ''}`}
                          onClick={() => setDay(k)}
                          aria-pressed={k === day}
                          aria-label={`${WD[d.getDay()]} ${d.getDate()}., ${n} Termine`}
                        >
                          <span className="wd">{WD[d.getDay()]}</span>
                          <span className="num">{d.getDate()}</span>
                          <span className="dots" aria-hidden>
                            {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                              <i key={i} />
                            ))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="pt-daylist" data-drop-day={day}>
                    {forDay(shown, day).map((it) => card(it, team.length > 1))}
                    {!weekState.loading && forDay(shown, day).length === 0 && (
                      <div className="empty pt-empty">
                        <b>Noch frei</b>
                        <span className="muted">Termin anlegen — oder fällige Anlagen aus „Fällige Wartungen“ einplanen.</span>
                        <div className="row" style={{ justifyContent: 'center' }}>
                          <button type="button" className="btn small" onClick={() => openNew()} disabled={!isOwner && !me}>
                            <Plus className="i" aria-hidden /> Termin
                          </button>
                          <Link className="btn ghost small" to={`${base}/wartung`}>
                            Fällige Wartungen
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <span id="pt-move-help" hidden>
                {timeline
                  ? 'Pfeiltaste hoch oder runter verschiebt den Termin um 15 Minuten, mit Umschalt um eine Stunde; Alt mit hoch oder runter ändert die Dauer; links oder rechts wechselt den Monteur. Enter legt ab, Escape bricht ab.'
                  : 'Pfeiltaste links oder rechts verschiebt den Termin um einen Tag, mit Umschalt zu einem anderen Monteur. Enter legt ab, Escape bricht ab.'}
              </span>
              {move?.mode === 'pointer' && !timeline && (
                <div
                  ref={drag.ghostRef}
                  className={`pt-drag-ghost ${preview?.clash.length ? 'clash' : ''} ${move.reason ? 'no' : ''}`}
                  style={{ '--lane': ghostWho?.color ?? 'var(--muted)' } as CSSProperties}
                  aria-hidden
                >
                  <span className="pt-time">
                    {hhmm((preview?.moved ?? move.orig).starts_at)}–{hhmm((preview?.moved ?? move.orig).ends_at)}
                  </span>
                  <span className="pt-title">{move.orig.title}</span>
                </div>
              )}
              <div className={`pt-movebar ${move || notice ? 'show' : ''} ${notice?.kind === 'error' && !move ? 'error' : ''}`} aria-live="polite">
                {move ? (
                  <span className={preview?.clash.length ? 'pt-movebar-warn' : move.reason ? 'pt-movebar-no' : ''}>{moveText}</span>
                ) : notice ? (
                  <>
                    <span>{notice.text}</span>
                    {notice.kind === 'undo' && (
                      <button type="button" className="btn ghost small" onClick={() => undoMove(notice)}>
                        Rückgängig
                      </button>
                    )}
                    {notice.kind === 'error' && (
                      <button type="button" className="btn ghost small pt-movebar-x" onClick={() => setNotice(null)} aria-label="Hinweis schließen">
                        <X className="i" aria-hidden />
                      </button>
                    )}
                  </>
                ) : null}
              </div>

              {draft && (
                <ApptDialog
                  draft={draft}
                  setDraft={setDraft}
                  sites={sites}
                  assets={assets}
                  openReqs={openReqs}
                  team={team}
                  me={me}
                  isOwner={isOwner}
                  canEdit={!draft.orig || canEdit(draft.orig)}
                  canDelete={!!draft.orig && canDelete(draft.orig)}
                  base={base}
                  onSave={async (input) => {
                    const p = ext.planung;
                    if (draft.id) await p.updateAppointment(draft.id, input);
                    else await p.createAppointment(org.id, input);
                    // wie App: Anfrage bekommt den Termin mit (Status „Termin geplant“) — Fehler halten nichts auf
                    const req = input.request_id ? openReqs.find((r) => r.id === input.request_id) : undefined;
                    if (req && req.status === 'new') await p.markRequestScheduled(req.id).catch(() => {});
                    afterSave(draft.day);
                  }}
                  onDelete={async () => {
                    await ext.planung.deleteAppointment(draft.id!);
                    afterSave(draft.day);
                  }}
                />
              )}
            </>
          );
        }}
      </LoadGuard>
    </>
  );
}

function LaneRow({
  lane,
  cols,
  todayKey,
  items,
  canAdd,
  onAdd,
  card,
  droppable,
  dropState,
  ignoreClick,
}: {
  lane: { id: string; label: string; color: string };
  cols: Date[];
  todayKey: string;
  items: Item[];
  canAdd: boolean;
  onAdd: (day: string) => void;
  card: (it: Item) => ReactNode;
  /** Zelle ist Ablagefläche fürs Verschieben (nicht die Zeile „Vom Kunden gewählt“) */
  droppable: boolean;
  dropState: (day: string) => { cls: string; slot: ReactNode } | null;
  /** Klick gehört noch zum Ziehen — dann keinen neuen Termin öffnen */
  ignoreClick: () => boolean;
}) {
  const busyMin = items
    .filter((it) => it.type === 'appt' && it.status !== 'canceled')
    .reduce((s, it) => s + Math.max(0, Date.parse(it.ends_at) - Date.parse(it.starts_at)) / 60000, 0);
  return (
    <>
      <div className="pt-lanehead" style={{ '--lane': lane.color } as CSSProperties}>
        <b>{lane.label}</b>
        {lane.id !== 'req' && lane.id !== 'none' && (
          <span className="muted small">{busyMin ? `${Math.round((busyMin / 60) * 10) / 10} h verplant`.replace('.', ',') : 'nichts verplant'}</span>
        )}
      </div>
      {cols.map((d) => {
        const k = dayKey(d);
        const list = forDay(items, k);
        const ds = droppable ? dropState(k) : null;
        return (
          <div
            key={k}
            className={`pt-cell ${k === todayKey ? 'today' : ''} ${ds?.cls ?? ''}${canAdd ? ' pickable' : ''}`}
            data-drop-day={droppable ? k : undefined}
            data-drop-lane={droppable ? lane.id : undefined}
            // Klick in eine freie Stelle der Zelle: neuer Termin an diesem Tag für diesen Monteur
            onClick={
              canAdd
                ? (e) => {
                    if (ignoreClick() || (e.target as HTMLElement).closest('.pt-card, .pt-add, button, a')) return;
                    onAdd(k);
                  }
                : undefined
            }
          >
            {list.map(card)}
            {ds?.slot}
            {canAdd && (
              <button type="button" className="pt-add" onClick={() => onAdd(k)} aria-label={`Termin am ${WD[d.getDay()]} ${deDate(d)} für ${lane.label} anlegen`}>
                <Plus className="i" aria-hidden />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

function ApptDialog({
  draft,
  setDraft,
  sites,
  assets,
  openReqs,
  team,
  me,
  isOwner,
  canEdit,
  canDelete,
  base,
  onSave,
  onDelete,
}: {
  draft: Draft;
  setDraft: (fn: (d: Draft | null) => Draft | null) => void;
  sites: Site[];
  assets: Asset[];
  openReqs: PlanRequest[];
  team: PlanMember[];
  me: string | null;
  isOwner: boolean;
  canEdit: boolean;
  canDelete: boolean;
  base: string;
  onSave: (input: ApptInput) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const close = () => {
    if (!busy) setDraft(() => null);
  };
  // Startstand beim Öffnen merken: Chips (Was, Zeitfenster, Stand, Objekt) sind keine Eingabe-Ereignisse,
  // deshalb vergleicht der Dialog selbst, ob sich etwas geändert hat (Rückfrage beim Schließen)
  const [initial] = useState(() => JSON.stringify(draft));
  const dirty = JSON.stringify(draft) !== initial;

  const site = draft.site_id ? sites.find((s) => s.id === draft.site_id) : undefined;
  const siteAssets = site ? assets.filter((a) => a.site_id === site.id && (!a.retired || a.id === draft.asset_id)) : [];
  const siteReqs = openReqs.filter((r) => (site ? r.site_id === site.id : false) || r.id === draft.request_id);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = sites.filter((s) => s.active);
    return (q ? all.filter((s) => [s.name, s.address, s.operator_name].some((x) => x?.toLowerCase().includes(q))) : all).slice(0, 6);
  }, [query, sites]);
  // Wer: Inhaber alle, Monteur nur sich (RLS appt_insert/appt_update)
  const whoOptions = team.filter((m) => isOwner || m.userId === me);
  const reqTitle = (r: PlanRequest) =>
    `${requestTitle(r.kind)}${r.contact_name ? ` · ${r.contact_name}` : ''} (${r.status === 'new' ? 'neu' : 'Termin geplant'}, ${deDate(new Date(r.created_at))})`;

  async function save() {
    setError(null);
    const title = draft.title.trim();
    if (!title) return setError('Bitte „Was“ ausfüllen, z. B. Wartung oder Störung.');
    if (title.length > APPT_TITLE_MAX) return setError(`„Was“ darf höchstens ${APPT_TITLE_MAX} Zeichen lang sein.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.day)) return setError('Bitte den Tag auswählen.');
    const f = parseHm(draft.from);
    const t = parseHm(draft.to);
    if (!f || !t) return setError('Uhrzeit prüfen: bitte als HH:MM eintragen, z. B. 08:00.');
    const s = atLocal(draft.day, f);
    const e = atLocal(draft.day, t);
    if (e <= s) return setError('Das Ende muss nach dem Beginn liegen.');
    if (e.getTime() - s.getTime() > APPT_MAX_HOURS * 3600_000) return setError(`Ein Termin darf höchstens ${APPT_MAX_HOURS} Stunden dauern.`);
    if (draft.note.length > APPT_NOTE_MAX) return setError(`Die Notiz darf höchstens ${APPT_NOTE_MAX} Zeichen lang sein.`);
    if (!isOwner && draft.assigned_to !== me) return setError('Für andere planen darf nur der Inhaber (oder wer das Recht hat).');
    if (isOwner && !draft.assigned_to && !draft.orig) return setError('Bitte auswählen, wer den Termin übernimmt.');
    const who = team.find((m) => m.userId === draft.assigned_to);
    const keepName = draft.orig && draft.orig.assigned_to === draft.assigned_to ? draft.orig.assigned_name : null;
    const input: ApptInput = {
      site_id: draft.site_id,
      asset_id: draft.site_id ? draft.asset_id : null,
      request_id: draft.request_id,
      assigned_to: draft.assigned_to,
      assigned_name: keepName ?? (who ? who.name.slice(0, 80) : null),
      title,
      note: draft.note.trim() || null,
      starts_at: s.toISOString(),
      ends_at: e.toISOString(),
      status: draft.status,
    };
    setBusy(true);
    try {
      await onSave(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setConfirmDel(false);
    }
  }

  const title = !draft.id ? 'Neuer Termin' : canEdit ? 'Termin ändern' : 'Termin';
  return (
    <Modal title={title} onClose={close} dirty={dirty}>
      <form
        className="pt-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (canEdit && !busy) void save();
        }}
      >
        {!canEdit && (
          <div className="info-box">Diesen Termin können nur der Inhaber und der zugeteilte Monteur ändern.</div>
        )}
        {error && <div className="error-box">{error}</div>}
        <fieldset disabled={!canEdit || busy}>
          <div className="field-like">
            <span className="pt-label">Kunde / Objekt</span>
            {site ? (
              <div className="pt-picked">
                <span>
                  <b>{siteLabel(site)}</b>
                  {site.address && <span className="muted small"> · {site.address}</span>}
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <Link to={`${base}/kunden/${site.id}`} className="small">
                    öffnen
                  </Link>
                  <button type="button" className="pt-link" onClick={() => set({ site_id: null, asset_id: null })}>
                    ändern
                  </button>
                </span>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  value={query}
                  placeholder="Suchen: Kunde, Objekt, Adresse …"
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Objekt suchen"
                />
                <div className="pt-matches">
                  {matches.map((s) => (
                    <button key={s.id} type="button" className="pt-match" onClick={() => set({ site_id: s.id, asset_id: null })}>
                      <b>{siteLabel(s)}</b>
                      {s.address && <span className="muted small">{s.address}</span>}
                    </button>
                  ))}
                  {matches.length === 0 && <span className="muted small">Kein Objekt gefunden.</span>}
                </div>
              </>
            )}
          </div>

          {site && (
            <label className="field">
              Anlage
              <select value={draft.asset_id ?? ''} onChange={(e) => set({ asset_id: e.target.value || null })}>
                <option value="">ganzes Objekt</option>
                {siteAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {kindInfo(a.kind).emoji} {a.name}
                    {a.retired ? ' (stillgelegt)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(siteReqs.length > 0 || draft.request_id) && (
            <label className="field">
              Zu Anfrage (optional)
              <select value={draft.request_id ?? ''} onChange={(e) => set({ request_id: e.target.value || null })}>
                <option value="">— keine —</option>
                {siteReqs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {reqTitle(r)}
                  </option>
                ))}
                {draft.request_id && !siteReqs.some((r) => r.id === draft.request_id) && (
                  <option value={draft.request_id}>Anfrage (bereits erledigt)</option>
                )}
              </select>
              {draft.request_id && (
                <span className="muted small field-hint">
                  Eine neue Anfrage wird beim Speichern auf „Termin geplant“ gesetzt.{' '}
                  <Link to={`${base}/anfragen/${draft.request_id}`}>Anfrage öffnen</Link>
                </span>
              )}
            </label>
          )}

          <label className="field">
            Was
            <input value={draft.title} maxLength={APPT_TITLE_MAX} onChange={(e) => set({ title: e.target.value })} required />
          </label>
          <div className="pt-chips">
            {TITLES.map((t) => (
              <button key={t} type="button" className={`pt-chip ${draft.title === t ? 'on' : ''}`} onClick={() => set({ title: t })}>
                {t}
              </button>
            ))}
          </div>

          <div className="pt-when">
            <label className="field">
              Tag
              <input type="date" value={draft.day} onChange={(e) => set({ day: e.target.value })} required />
            </label>
            <label className="field">
              von
              <input type="time" value={draft.from} onChange={(e) => set({ from: e.target.value })} required />
            </label>
            <label className="field">
              bis
              <input type="time" value={draft.to} onChange={(e) => set({ to: e.target.value })} required />
            </label>
          </div>
          <div className="pt-chips">
            {SLOTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`pt-chip ${draft.from === s.from && draft.to === s.to ? 'on' : ''}`}
                onClick={() => set({ from: s.from, to: s.to })}
              >
                {s.label}
              </button>
            ))}
          </div>

          <label className="field">
            Wer
            <select
              value={draft.assigned_to ?? ''}
              onChange={(e) => set({ assigned_to: e.target.value || null })}
              disabled={!isOwner}
            >
              {(!draft.assigned_to || !whoOptions.some((m) => m.userId === draft.assigned_to)) && (
                <option value={draft.assigned_to ?? ''}>
                  {draft.assigned_to ? (draft.orig?.assigned_name ?? 'ehemaliges Mitglied') : '— bitte wählen —'}
                </option>
              )}
              {whoOptions.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.isMe ? ' (ich)' : ''}
                </option>
              ))}
            </select>
            {!isOwner && <span className="muted small field-hint">Monteure planen nur für sich selbst.</span>}
          </label>

          <label className="field">
            Notiz (optional)
            <textarea
              rows={2}
              value={draft.note}
              maxLength={APPT_NOTE_MAX}
              placeholder="z. B. Schlüssel beim Nachbarn"
              onChange={(e) => set({ note: e.target.value })}
            />
          </label>

          {draft.id && (
            <div className="field-like">
              <span className="pt-label">Stand</span>
              <div className="pt-chips">
                {(['planned', 'done', 'canceled'] as ApptStatus[]).map((st) => (
                  <button key={st} type="button" className={`pt-chip ${draft.status === st ? 'on' : ''}`} onClick={() => set({ status: st })}>
                    {APPT_STATUS_LABELS[st]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </fieldset>

        <div className="row pt-actions">
          {canDelete &&
            (confirmDel ? (
              <span className="row" style={{ gap: 8 }}>
                <span className="small">Wirklich löschen?</span>
                <button type="button" className="btn small pt-danger" onClick={() => void remove()} disabled={busy}>
                  Ja, löschen
                </button>
                <button type="button" className="btn ghost small" onClick={() => setConfirmDel(false)} disabled={busy}>
                  Nein
                </button>
              </span>
            ) : (
              <button type="button" className="btn ghost small pt-danger-text" onClick={() => setConfirmDel(true)} disabled={busy}>
                Löschen
              </button>
            ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn ghost" onClick={close} disabled={busy}>
            {canEdit ? 'Abbrechen' : 'Schließen'}
          </button>
          {canEdit && (
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Speichert …' : 'Termin speichern'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
