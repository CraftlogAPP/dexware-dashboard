// Plantafel: Termine je Monteur — wie App mobile/src/screens/PlanScreen.tsx (Daten: data/plan.ts, Logik: lib/plan.ts).
// Am PC als Wochentafel (Zeilen = Monteure, Spalten = Tage), schmal als Tagesleiste mit Terminliste.
// Rechte genau wie RLS in plantafel.sql: alle sehen alles; der Inhaber plant für alle, Monteure nur für sich
// (anlegen/ändern nur eigene, löschen nur selbst angelegte eigene). Vom Kunden gewählte Termine (Anfragen) erscheinen mit.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
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
  const { data, ext, org, isOwner, role, base, bumpRequests } = useInst();
  const [params, setParams] = useSearchParams();
  const wide = useMedia('(min-width: 900px)');
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [filter, setFilter] = useState<string>('all');
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

  function shiftWeek(n: number) {
    const w = n === 0 ? weekStart(new Date()) : addDays(week, 7 * n);
    setWeek(w);
    setDay(n === 0 ? dayKey(new Date()) : dayKey(w));
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
          ? 'Als Inhaber planst du für alle.'
          : 'Du siehst alle Termine im Betrieb und planst deine eigenen; für andere plant der Inhaber.'}
      </p>

      <LoadGuard state={fixed}>
        {({ sites, assets, openReqs }) => {
          const siteById = new Map(sites.map((s) => [s.id, s]));
          const assetById = new Map(assets.map((a) => [a.id, a]));
          const memberOf = (id: string | null) => team.find((m) => m.userId === id);
          const appts = weekState.data?.appts ?? [];
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

          const card = (it: Item, showWho: boolean) => {
            if (it.type === 'req') {
              const r = it.r;
              const s = r.site_id ? siteById.get(r.site_id) : undefined;
              const asset = r.asset_id ? assetById.get(r.asset_id) : undefined;
              return (
                <div key={it.key} className="pt-card req">
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
            const label = `${hhmm(a.starts_at)}–${hhmm(a.ends_at)} ${a.title} ${s?.name ?? ''}`;
            return (
              <button
                key={it.key}
                type="button"
                className={`pt-card ${a.status}`}
                style={{ '--lane': who?.color ?? 'var(--muted)' } as CSSProperties}
                onClick={() => openEdit(a)}
                aria-label={`${label}, ${canEdit(a) ? 'bearbeiten' : 'ansehen'}`}
              >
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

          return (
            <>
              <div className="pt-toolbar">
                <div className="pt-weeknav">
                  <button type="button" className="btn ghost small" onClick={() => shiftWeek(-1)} aria-label="Vorige Woche">
                    <ChevronLeft className="i" aria-hidden />
                  </button>
                  <div className="pt-weeklabel">
                    <b>KW {isoWeek(week)}</b>
                    <span className="muted">
                      {deDate(days[0])} – {deDate(days[6])}
                      {days[0].getFullYear()}
                    </span>
                  </div>
                  <button type="button" className="btn ghost small" onClick={() => shiftWeek(1)} aria-label="Nächste Woche">
                    <ChevronRight className="i" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => shiftWeek(0)}
                    disabled={dayKey(week) === dayKey(weekStart(new Date()))}
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

              {wide ? (
                <div className="pt-board-wrap">
                  <div className="pt-board" style={{ gridTemplateColumns: `150px repeat(${cols.length}, minmax(0, 1fr))`, minWidth: 150 + cols.length * 150 }}>
                    <div className="pt-corner" />
                    {cols.map((d) => {
                      const k = dayKey(d);
                      const n = forDay(shown, k).filter((it) => it.status !== 'canceled').length;
                      return (
                        <div key={k} className={`pt-dayhead ${k === todayKey ? 'today' : ''}`}>
                          <b>
                            {WD[d.getDay()]} {deDate(d)}
                          </b>
                          <span className="muted">{n ? `${n} ${n === 1 ? 'Termin' : 'Termine'}` : 'frei'}</span>
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
                      return (
                        <button
                          key={k}
                          type="button"
                          className={`pt-pill ${k === day ? 'on' : ''} ${k === todayKey ? 'today' : ''}`}
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
                  <div className="pt-daylist">
                    {forDay(shown, day).map((it) => card(it, team.length > 1))}
                    {!weekState.loading && forDay(shown, day).length === 0 && (
                      <div className="empty pt-empty">
                        <b>Noch frei</b>
                        <span className="muted">Termin anlegen — oder fällige Anlagen aus der Wartungsliste einplanen.</span>
                        <div className="row" style={{ justifyContent: 'center' }}>
                          <button type="button" className="btn small" onClick={() => openNew()} disabled={!isOwner && !me}>
                            <Plus className="i" aria-hidden /> Termin
                          </button>
                          <Link className="btn ghost small" to={`${base}/wartung`}>
                            Wartungsliste
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

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
}: {
  lane: { id: string; label: string; color: string };
  cols: Date[];
  todayKey: string;
  items: Item[];
  canAdd: boolean;
  onAdd: (day: string) => void;
  card: (it: Item) => ReactNode;
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
        return (
          <div key={k} className={`pt-cell ${k === todayKey ? 'today' : ''}`}>
            {list.map(card)}
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
    if (!isOwner && draft.assigned_to !== me) return setError('Für andere planen darf nur der Inhaber.');
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
    <Modal title={title} onClose={close}>
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
