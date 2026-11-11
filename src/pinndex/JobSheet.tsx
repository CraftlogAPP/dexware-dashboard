// PinnDex — seitliches Blatt für eine Karte: Detail (Verlauf, Fotos, Arbeitszeit, Korrektur) und Anlegen/Bearbeiten.
// Zustand nur über data.setStatus (RPC job_set_status), Zeit-Korrektur nur über data.fixTime (RPC job_fix_time).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Ban, CalendarClock, Check, Clock, History, MapPin, Navigation, Pause, Pencil, Phone, Play, Save, Siren, StickyNote, Timer, UserRound } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { LoadGuard, useAsync } from '../components/ui';
import type { GeoPoint } from './geocode';
import { usePinn } from './context';
import {
  addDays,
  dayKey,
  dayShort,
  fmtClock,
  fmtDuration,
  fmtWork,
  hhmm,
  isMine,
  isOpen,
  mapsUrl,
  memberColor,
  memberName,
  scheduledIso,
  stamp,
  telHref,
  workSecondsNow,
} from './logic';
import { Avatar, Sheet, StatusChip, useNow } from './parts';
import { EVENT_LABEL, OUTCOME_LABEL, ROLE_LABEL, type Customer, type Job, type JobEvent, type JobInput, type JobOutcome, type JobStatus } from './types';

export interface JobPreset {
  day?: string;
  assignee_id?: string | null;
  /** Aus der Kundenliste: Name, Telefon, Adresse vorausfüllen */
  customer?: Customer;
}

type SheetState = { kind: 'detail'; id: string } | { kind: 'form'; job: Job | null; preset?: JobPreset } | null;

interface SheetApi {
  openJob: (id: string) => void;
  newJob: (preset?: JobPreset) => void;
}

const SheetCtx = createContext<SheetApi | null>(null);

export function useJobSheet(): SheetApi {
  const v = useContext(SheetCtx);
  if (!v) throw new Error('useJobSheet außerhalb von JobSheetHost');
  return v;
}

export function JobSheetHost({ children }: { children: ReactNode }) {
  const { canManage } = usePinn();
  const [state, setState] = useState<SheetState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const api = useMemo<SheetApi>(
    () => ({
      openJob: (id) => setState({ kind: 'detail', id }),
      newJob: (preset) => setState({ kind: 'form', job: null, preset }),
    }),
    [],
  );
  const close = useCallback(() => setState(null), []);

  // Direktlinks auf jeder Seite: …?karte=<id> öffnet eine Karte (z. B. aus einer Mitteilung), …?neu=1 das Anlegen-Blatt
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const k = params.get('karte');
    const n = params.get('neu');
    if (!k && !n) return;
    if (k) api.openJob(k);
    else if (canManage) api.newJob({ day: dayKey(new Date()) });
    const rest = new URLSearchParams(params);
    rest.delete('karte');
    rest.delete('neu');
    setParams(rest, { replace: true });
  }, [params, setParams, api, canManage]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  return (
    <SheetCtx.Provider value={api}>
      {children}
      {state?.kind === 'detail' && <JobDetail id={state.id} onClose={close} onEdit={(job) => setState({ kind: 'form', job })} />}
      {state?.kind === 'form' && (
        <JobForm
          job={state.job}
          preset={state.preset}
          onClose={close}
          onSaved={(job, pinMissing) => {
            if (pinMissing) setNotice(`„${job.title}“ gespeichert — Adresse nicht gefunden, Pin fehlt.`);
            if (state.job) setState({ kind: 'detail', id: job.id });
            else close();
          }}
        />
      )}
      {notice && (
        <div className="pinn-toast" role="status">
          <MapPin className="i" aria-hidden /> <span>{notice}</span>
        </div>
      )}
    </SheetCtx.Provider>
  );
}

// ---------------------------------------------------------------- Detail

function JobDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (job: Job) => void }) {
  const { data, version, bump, canManage, me, role, members } = usePinn();
  const state = useAsync(async () => {
    const job = await data.job(id);
    if (!job) return null;
    const [events, photos, results] = await Promise.all([
      data.events(id),
      data.photoUrls(job.photos ?? []).catch(() => [] as string[]),
      data.photoUrls(job.result_photos ?? []).catch(() => [] as string[]),
    ]);
    return { job, events, photos, results };
  }, [data, id]);
  // Live: bei jeder Änderung still neu laden
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    state.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Monteur öffnet eine neue eigene Karte → „gesehen“ (wie in der App)
  const seenSent = useRef(false);
  const job = state.data?.job;
  useEffect(() => {
    if (!job || seenSent.current || role !== 'worker' || job.status !== 'new' || !isMine(job, me.user_id)) return;
    seenSent.current = true;
    data.setStatus(job.id, 'seen').then(bump, () => {
      /* still — Server setzt es spätestens in der App */
    });
  }, [job, role, me.user_id, data, bump]);

  const byId = useMemo(() => new Map(members.map((m, i) => [m.user_id, { m, color: memberColor(m, i) }])), [members]);
  const name = (uid: string | null) => (uid ? memberName(byId.get(uid)?.m) : 'Nicht zugewiesen');

  return (
    <Sheet title={job ? job.title : 'Auftrag'} onClose={onClose} wide>
      <LoadGuard state={state} empty={<div className="info-box">Dieser Auftrag ist nicht (mehr) sichtbar — gelöscht oder nicht dir zugewiesen.</div>}>
        {(d) => d && <DetailBody d={d} name={name} colorOf={(uid) => byId.get(uid)?.color ?? '#888'} canManage={canManage} onEdit={() => onEdit(d.job)} onChanged={() => { bump(); state.refresh(); }} onClose={onClose} />}
      </LoadGuard>
    </Sheet>
  );
}

function DetailBody({
  d,
  name,
  colorOf,
  canManage,
  onEdit,
  onChanged,
  onClose,
}: {
  d: { job: Job; events: JobEvent[]; photos: string[]; results: string[] };
  name: (uid: string | null) => string;
  colorOf: (uid: string) => string;
  canManage: boolean;
  onEdit: () => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { data, role, me } = usePinn();
  const { job, events } = d;
  const lastRun = [...events].reverse().find((e) => e.kind === 'start' || e.kind === 'resume')?.at ?? null;
  const now = useNow(job.status === 'running');
  const work = workSecondsNow(job, lastRun, now);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const mine = isMine(job, me.user_id);
  // Standort, den die App einmalig beim Starten mitgeschickt hat (job_event.data = { lat, lng, acc })
  const arrived = events.find((e) => e.kind === 'start' && typeof e.data?.lat === 'number' && typeof e.data?.lng === 'number');

  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return; // Doppelklick
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const setStatus = (to: JobStatus, extra?: { note?: string | null; outcome?: JobOutcome | null }) => run(() => data.setStatus(job.id, to, extra));

  function cancelJob() {
    if (!window.confirm(`„${job.title}“ wirklich absagen? Der Monteur bekommt eine Mitteilung. Absagen lässt sich nicht rückgängig machen.`)) return;
    void run(async () => {
      await data.setStatus(job.id, 'canceled');
      onClose();
    });
  }

  const sched = job.scheduled_at ? new Date(job.scheduled_at) : null;
  const helpers = (job.helper_ids ?? []).filter(Boolean);

  return (
    <div className={`pinn-detail st-${job.status}`}>
      <div className="pinn-detail-top">
        <StatusChip key={job.status} status={job.status} big />
        {job.urgent && (
          <span className="pinn-urgent-tag">
            <Siren className="i" aria-hidden /> Dringend
          </span>
        )}
        <div className="spacer" />
        {canManage && job.status !== 'done' && job.status !== 'canceled' && (
          <button type="button" className="btn ghost small" onClick={onEdit}>
            <Pencil className="i" aria-hidden /> Bearbeiten
          </button>
        )}
        {canManage && isOpen(job.status) && (
          <button type="button" className="btn ghost small pinn-danger" onClick={cancelJob} disabled={busy}>
            <Ban className="i" aria-hidden /> Absagen
          </button>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Monteur: große Knöpfe je Zustand (wie in der App) */}
      {role === 'worker' && mine && isOpen(job.status) && !finishing && (
        <div className="pinn-bigbtns">
          {(job.status === 'new' || job.status === 'seen') && (
            <button type="button" className="btn pinn-go" disabled={busy} onClick={() => void setStatus('running')}>
              <Play className="i" aria-hidden /> Arbeit starten
            </button>
          )}
          {job.status === 'running' && (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void setStatus('paused')}>
              <Pause className="i" aria-hidden /> Pause
            </button>
          )}
          {job.status === 'paused' && (
            <button type="button" className="btn pinn-go" disabled={busy} onClick={() => void setStatus('running')}>
              <Play className="i" aria-hidden /> Weiter
            </button>
          )}
          {(job.status === 'running' || job.status === 'paused') && (
            <button type="button" className="btn pinn-done" disabled={busy} onClick={() => setFinishing(true)}>
              <Check className="i" aria-hidden /> Fertig
            </button>
          )}
        </div>
      )}
      {finishing && <FinishPanel busy={busy} onCancel={() => setFinishing(false)} onDone={(note, outcome) => void setStatus('done', { note, outcome }).then(() => setFinishing(false))} />}

      <div className="pinn-facts">
        <Fact icon={<CalendarClock className="i" />} label="Termin">
          {sched ? (
            <>
              {dayShort(sched)} · {hhmm(job.scheduled_at!)} Uhr
              {job.duration_min ? <span className="muted"> · {fmtDuration(job.duration_min)}</span> : null}
            </>
          ) : (
            <span className="muted">ohne Termin</span>
          )}
        </Fact>
        <Fact icon={<UserRound className="i" />} label="Monteur">
          {job.assignee_id ? (
            <span className="pinn-who">
              <Avatar name={name(job.assignee_id)} color={colorOf(job.assignee_id)} size={22} />
              {name(job.assignee_id)}
            </span>
          ) : (
            <span className="muted">nicht zugewiesen</span>
          )}
          {helpers.length > 0 && <span className="muted"> + {helpers.map((h) => name(h)).join(', ')}</span>}
        </Fact>
        {(job.customer_name || job.customer_phone) && (
          <Fact icon={<Phone className="i" />} label="Kunde">
            {job.customer_name}
            {job.customer_phone && (
              <>
                {job.customer_name ? ' · ' : ''}
                <a href={telHref(job.customer_phone)}>{job.customer_phone}</a>
              </>
            )}
          </Fact>
        )}
        {job.address && (
          <Fact icon={<MapPin className="i" />} label="Adresse">
            {job.address}{' '}
            <a className="pinn-route" href={mapsUrl(job.address)} target="_blank" rel="noreferrer">
              <Navigation className="i" aria-hidden /> Route
            </a>
            {arrived && <div className="pinn-pinhint ok">angekommen {hhmm(arrived.at)} (Standort beim Start)</div>}
            {job.lat == null && (
              <div className="pinn-pinhint">
                Adresse nicht gefunden – Pin fehlt
                {canManage && (
                  <button type="button" className="pinn-linkbtn" disabled={busy} onClick={() => void run(async () => {
                    const p = await data.geocode(job.address!, true);
                    if (!p) throw new Error('Adresse weiterhin nicht gefunden — bitte genauer schreiben (Straße Hausnummer, PLZ Ort) unter „Bearbeiten“.');
                    await data.setJobPos(job.id, p);
                  })}>
                    erneut suchen
                  </button>
                )}
              </div>
            )}
          </Fact>
        )}
        {job.note && (
          <Fact icon={<StickyNote className="i" />} label="Was ist zu tun">
            <span className="pinn-pre">{job.note}</span>
          </Fact>
        )}
      </div>

      <WorkBlock job={job} work={work} events={events} name={name} canManage={canManage} onChanged={onChanged} />

      {(job.status === 'done' || job.done_note || job.outcome) && (
        <section className="pinn-block">
          <h3>Ergebnis</h3>
          {job.outcome && <span className={`badge ${job.outcome === 'ok' ? 'green' : job.outcome === 'problem' ? 'red' : 'amber'}`}>{OUTCOME_LABEL[job.outcome]}</span>}
          {job.done_note ? <p className="pinn-pre">{job.done_note}</p> : <p className="muted small">Keine Notiz vom Monteur.</p>}
        </section>
      )}

      {(d.photos.length > 0 || d.results.length > 0) && (
        <section className="pinn-block">
          <h3>Fotos</h3>
          {d.photos.length > 0 && <Photos title="Vom Chef" urls={d.photos} />}
          {d.results.length > 0 && <Photos title="Vom Monteur" urls={d.results} />}
        </section>
      )}

      <section className="pinn-block">
        <h3>
          <History className="i" aria-hidden /> Verlauf
        </h3>
        <ol className="pinn-timeline">
          {events.map((e) => (
            <li key={e.id} className={`ev-${e.kind}`}>
              <span className="pinn-tl-dot" aria-hidden />
              <span className="pinn-tl-time">{stamp(e.at)}</span>
              <span className="pinn-tl-text">
                <b>{EVENT_LABEL[e.kind]}</b> <span className="muted">· {name(e.actor_id)}</span>
                <EventExtra e={e} name={name} />
              </span>
            </li>
          ))}
          {events.length === 0 && <li className="muted">Noch keine Einträge.</li>}
        </ol>
      </section>
    </div>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="pinn-fact">
      <span className="pinn-fact-icon" aria-hidden>
        {icon}
      </span>
      <div>
        <div className="pinn-fact-label">{label}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  title: 'Titel',
  scheduled_at: 'Termin',
  duration_min: 'Dauer',
  address: 'Adresse',
  note: 'Beschreibung',
  urgent: 'Dringend',
  customer: 'Kunde',
  helper_ids: 'Helfer',
  photos: 'Fotos',
  deleted_at: 'Löschen',
};

function EventExtra({ e, name }: { e: JobEvent; name: (uid: string | null) => string }) {
  const d = e.data ?? {};
  const note = typeof d.note === 'string' && d.note.trim() ? d.note : typeof d.reason === 'string' ? d.reason : null;
  if (e.kind === 'assigned') return <span className="muted"> → {name(typeof d.to === 'string' ? d.to : null)}</span>;
  if (e.kind === 'edited' && Array.isArray(d.fields)) {
    if (d.deleted) return <span className="pinn-tl-note">gelöscht</span>;
    const labels = (d.fields as unknown[]).map((f) => FIELD_LABEL[String(f)] ?? String(f));
    return (
      <span className="muted">
        {' '}
        · {labels.join(', ')}
        {d.urgent_set ? ' · dringend gesetzt' : ''}
      </span>
    );
  }
  if (e.kind === 'time_fix') {
    // Server (job_fix_time): { seconds, before, note }
    const from = typeof d.before === 'number' ? fmtWork(d.before) : '?';
    const to = typeof d.seconds === 'number' ? fmtWork(d.seconds) : '?';
    return (
      <span className="pinn-tl-note">
        {from} → {to}
        {note ? ` · „${note}“` : ''}
      </span>
    );
  }
  return note ? <span className="pinn-tl-note">„{note}“</span> : null;
}

function Photos({ title, urls }: { title: string; urls: string[] }) {
  return (
    <div className="pinn-photos">
      <div className="pinn-fact-label">{title}</div>
      <div className="pinn-photo-grid">
        {urls.map((u, i) => (
          <a key={i} href={u} target="_blank" rel="noreferrer" className="pinn-photo">
            <img src={u} alt={`${title}, Foto ${i + 1}`} loading="lazy" />
          </a>
        ))}
      </div>
    </div>
  );
}

function WorkBlock({
  job,
  work,
  events,
  name,
  canManage,
  onChanged,
}: {
  job: Job;
  work: number;
  events: JobEvent[];
  name: (uid: string | null) => string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { data } = usePinn();
  const [open, setOpen] = useState(false);
  const [h, setH] = useState('');
  const [m, setM] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const fixes = events.filter((e) => e.kind === 'time_fix');
  const lastFix = fixes[fixes.length - 1];

  function startFix() {
    const min = Math.round(job.work_seconds / 60);
    setH(String(Math.floor(min / 60)));
    setM(String(min % 60));
    setNote('');
    setError(null);
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    const hh = Number(h || 0);
    const mm = Number(m || 0);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || mm < 0 || mm > 59 || hh > 24 * 14) {
      setError('Bitte Stunden (ab 0) und Minuten (0–59) eingeben.');
      return;
    }
    if (!note.trim()) {
      setError('Bitte einen Vermerk eintragen (z. B. „Anfahrt vergessen zu starten“) — die Korrektur steht im Verlauf.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await data.fixTime(job.id, (hh * 60 + mm) * 60, note.trim());
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="pinn-block pinn-work">
      <div className="pinn-work-row">
        <div>
          <h3>
            <Timer className="i" aria-hidden /> Arbeitszeit
          </h3>
          <div className={`pinn-work-value${job.status === 'running' ? ' ticking' : ''}`}>{job.status === 'running' ? fmtClock(work) : fmtWork(work)}</div>
          <div className="muted small">
            {job.started_at ? `Erster Start ${stamp(job.started_at)}` : 'Noch nicht gestartet'}
            {job.finished_at ? ` · fertig ${stamp(job.finished_at)}` : ''}
          </div>
          {lastFix && (
            <div className="pinn-fixnote">
              <Clock className="i" aria-hidden /> Korrigiert {stamp(lastFix.at)} von {name(lastFix.actor_id)}
              {typeof lastFix.data?.note === 'string' ? ` — „${lastFix.data.note}“` : ''}
            </div>
          )}
        </div>
        {canManage && !open && job.status !== 'running' && job.status !== 'new' && (
          <button type="button" className="btn ghost small" onClick={startFix}>
            <Pencil className="i" aria-hidden /> Zeit korrigieren
          </button>
        )}
      </div>
      {open && (
        <form className="pinn-fix" onSubmit={save}>
          <div className="pinn-fix-row">
            <label className="field">
              Stunden
              <input type="number" min={0} max={336} inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} data-autofocus />
            </label>
            <label className="field">
              Minuten
              <input type="number" min={0} max={59} inputMode="numeric" value={m} onChange={(e) => setM(e.target.value)} />
            </label>
          </div>
          <label className="field">
            Vermerk (Pflicht, steht im Verlauf)
            <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Anfahrt vergessen zu starten" />
          </label>
          {error && <div className="error-box">{error}</div>}
          <div className="row">
            <button type="submit" className="btn" disabled={busy}>
              <Save className="i" aria-hidden /> {busy ? 'Speichert …' : 'Korrektur speichern'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function FinishPanel({ busy, onCancel, onDone }: { busy: boolean; onCancel: () => void; onDone: (note: string | null, outcome: JobOutcome) => void }) {
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<JobOutcome>('ok');
  return (
    <form
      className="pinn-block pinn-finish"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onDone(note.trim() || null, outcome);
      }}
    >
      <h3>Auftrag abschließen</h3>
      <div className="pinn-chips" role="radiogroup" aria-label="Ergebnis">
        {(Object.keys(OUTCOME_LABEL) as JobOutcome[]).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={outcome === o} className={`pinn-chip${outcome === o ? ' on' : ''}`} onClick={() => setOutcome(o)}>
            {OUTCOME_LABEL[o]}
          </button>
        ))}
      </div>
      <label className="field">
        Notiz (optional)
        <textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} data-autofocus />
      </label>
      <div className="row">
        <button type="submit" className="btn pinn-done" disabled={busy}>
          <Check className="i" aria-hidden /> Fertig melden
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
          Zurück
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Anlegen / Bearbeiten

interface FormState {
  title: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  address: string;
  day: string;
  time: string;
  duration: string;
  note: string;
  urgent: boolean;
  assignee: string;
  helpers: string[];
  saveCustomer: boolean;
  /** Ergebnis von „Pin suchen“ (null = noch nicht gesucht) */
  pin: GeoPoint | null;
}

function initialForm(job: Job | null, preset?: JobPreset): FormState {
  if (job) {
    const d = job.scheduled_at ? new Date(job.scheduled_at) : null;
    return {
      title: job.title,
      customerId: job.customer_id,
      customerName: job.customer_name ?? '',
      phone: job.customer_phone ?? '',
      address: job.address ?? '',
      day: d ? dayKey(d) : '',
      time: d ? hhmm(job.scheduled_at!) : '',
      duration: job.duration_min ? String(job.duration_min) : '',
      note: job.note ?? '',
      urgent: job.urgent,
      assignee: job.assignee_id ?? '',
      helpers: job.helper_ids ?? [],
      saveCustomer: true,
      pin: null,
    };
  }
  return {
    title: '',
    customerId: preset?.customer?.id ?? null,
    customerName: preset?.customer?.name ?? '',
    phone: preset?.customer?.phone ?? '',
    address: preset?.customer?.address ?? '',
    day: preset?.day ?? dayKey(new Date()),
    time: '',
    duration: '',
    note: '',
    urgent: false,
    assignee: preset?.assignee_id ?? '',
    helpers: [],
    saveCustomer: true,
    pin: null,
  };
}

const DURATIONS = [
  ['', '—'],
  ['30', '30 min'],
  ['60', '1 h'],
  ['90', '1,5 h'],
  ['120', '2 h'],
  ['180', '3 h'],
  ['240', '4 h'],
  ['360', '6 h'],
  ['480', '8 h'],
] as const;

function JobForm({
  job,
  preset,
  onClose,
  onSaved,
}: {
  job: Job | null;
  preset?: JobPreset;
  onClose: () => void;
  onSaved: (job: Job, pinMissing: boolean) => void;
}) {
  const { data, members, bump } = usePinn();
  const customers = useAsync(() => data.customers(), [data]);
  const [start] = useState(() => initialForm(job, preset));
  const [f, setF] = useState<FormState>(start);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [lastPinMissing, setLastPinMissing] = useState(false);
  // „Pin suchen“ auf Knopfdruck (nie bei jedem Tastendruck — Nominatim-Regeln)
  const [pinState, setPinState] = useState<'idle' | 'busy' | 'found' | 'missing'>(() => (job?.address && job.lat == null ? 'missing' : 'idle'));
  async function findPin() {
    const addr = f.address.trim();
    if (!addr || pinState === 'busy') return;
    setPinState('busy');
    const p = await data.geocode(addr, true);
    setF((x) => (x.address.trim() === addr ? { ...x, pin: p } : x));
    setPinState(p ? 'found' : 'missing');
  }
  const titleRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(start);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));

  const active = members.filter((m) => m.active);
  const ordered = [...active.filter((m) => m.role === 'worker'), ...active.filter((m) => m.role !== 'worker')];
  const today = dayKey(new Date());
  const tomorrow = dayKey(addDays(new Date(), 1));

  const list = customers.data ?? [];
  const exact = f.customerName.trim() ? list.find((c) => c.name.trim().toLowerCase() === f.customerName.trim().toLowerCase()) : undefined;
  const isNewCustomer = !!f.customerName.trim() && !f.customerId && !exact;

  async function save(next: boolean) {
    if (busyRef.current) return; // Doppelklick / Enter doppelt
    if (!f.title.trim()) {
      setError('Bitte eintragen, was zu tun ist (Titel).');
      titleRef.current?.focus();
      return;
    }
    if (f.time && !f.day) {
      setError('Uhrzeit ohne Tag geht nicht — bitte einen Tag wählen oder die Uhrzeit leeren.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      let customerId = f.customerId ?? exact?.id ?? null;
      const name = f.customerName.trim();
      const addr = f.address.trim();
      // Pin: einmalig beim Speichern — erst Bekanntes (Knopf „Pin suchen“, Karte, Kunde), sonst Adress-Suche (geocode.ts)
      const cust = list.find((c) => c.id === customerId);
      const same = (a: string | null | undefined) => (a ?? '').trim().toLowerCase() === addr.toLowerCase();
      let pos: GeoPoint | null = null;
      if (addr) {
        pos =
          f.pin ??
          (job && same(job.address) && job.lat != null && job.lng != null ? { lat: job.lat, lng: job.lng } : null) ??
          (cust && same(cust.address) && cust.lat != null && cust.lng != null ? { lat: cust.lat, lng: cust.lng } : null) ??
          (await data.geocode(addr));
      }
      const pinMissing = !!addr && !pos;
      if (name && !customerId && f.saveCustomer) {
        const c = await data.saveCustomer({ name, phone: f.phone.trim() || null, address: addr || null, note: null, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
        customerId = c.id;
        customers.refresh();
      } else if (cust && pos && same(cust.address) && cust.lat == null) {
        // Ergebnis beim Kunden merken — nächstes Mal ohne Suche
        await data.saveCustomer({ name: cust.name, phone: cust.phone, address: cust.address, note: cust.note, lat: pos.lat, lng: pos.lng }, cust.id).catch(() => undefined);
      }
      const input: JobInput = {
        title: f.title.trim().slice(0, 200),
        customer_id: customerId,
        customer_name: name || null,
        customer_phone: f.phone.trim() || null,
        address: f.address.trim() || null,
        note: f.note.trim() || null,
        scheduled_at: scheduledIso(f.day, f.time),
        duration_min: f.duration ? Number(f.duration) : null,
        urgent: f.urgent,
        assignee_id: f.assignee || null,
        helper_ids: f.helpers.filter((h) => h !== f.assignee),
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      };
      const saved = await data.saveJob(input, job?.id);
      bump();
      if (next && !job) {
        // nächster Auftrag: Tag und Monteur bleiben, der Rest wird leer
        setF((x) => ({ ...initialForm(null, { day: x.day, assignee_id: x.assignee || null }), time: '' }));
        setSavedCount((n) => n + 1);
        setLastPinMissing(pinMissing);
        window.setTimeout(() => titleRef.current?.focus(), 0);
      } else {
        onSaved(saved, pinMissing);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function cancelJob() {
    if (!job || busyRef.current) return;
    if (!window.confirm(`„${job.title}“ wirklich absagen? Der Monteur bekommt eine Mitteilung. Absagen lässt sich nicht rückgängig machen.`)) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await data.setStatus(job.id, 'canceled');
      bump();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet title={job ? 'Auftrag bearbeiten' : 'Neuer Auftrag'} onClose={onClose} dirty={dirty && !busy}>
      <form
        className="pinn-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        onKeyDown={(e) => {
          // Strg/⌘ + Enter speichert auch aus dem Textfeld
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save(false);
          }
        }}
      >
        {savedCount > 0 && !job && (
          <div className="pinn-saved" role="status">
            <Check className="i" aria-hidden /> {savedCount === 1 ? 'Auftrag gespeichert' : `${savedCount} Aufträge gespeichert`} — weiter mit dem nächsten.
            {lastPinMissing && <span className="pinn-pinhint"> (Adresse nicht gefunden – Pin fehlt)</span>}
          </div>
        )}
        <label className="field">
          Was ist zu tun? *
          <input ref={titleRef} data-autofocus value={f.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Therme tauschen" required />
        </label>

        <CustomerField
          customers={list}
          value={f.customerName}
          onChange={(v) => setF((x) => ({ ...x, customerName: v, customerId: null }))}
          onPick={(c) =>
            setF((x) => ({
              ...x,
              customerName: c.name,
              customerId: c.id,
              phone: x.phone || c.phone || '',
              address: x.address || c.address || '',
              // Pin vom Kunden übernehmen (keine neue Suche nötig)
              pin: x.address ? x.pin : c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null,
            }))
          }
        />
        {isNewCustomer && (
          <label className="checkbox-field pinn-newcust">
            <input type="checkbox" checked={f.saveCustomer} onChange={(e) => set('saveCustomer', e.target.checked)} />
            „{f.customerName.trim()}“ in die Kundenliste aufnehmen
          </label>
        )}
        <div className="pinn-grid2">
          <label className="field">
            Telefon
            <input type="tel" value={f.phone} maxLength={40} onChange={(e) => set('phone', e.target.value)} />
          </label>
          <div className="field pinn-addr">
            <label htmlFor="pinn-addr-input">Adresse</label>
            <div className="pinn-addr-row">
              <input
                id="pinn-addr-input"
                value={f.address}
                maxLength={200}
                onChange={(e) => {
                  const v = e.target.value;
                  setF((x) => ({ ...x, address: v, pin: null }));
                  setPinState('idle');
                }}
                placeholder="Straße, Ort"
              />
              <button type="button" className="btn ghost small" onClick={() => void findPin()} disabled={!f.address.trim() || pinState === 'busy'} title="Adresse auf der Karte suchen (sonst beim Speichern)">
                <MapPin className="i" aria-hidden />
                <span className="sr-only">Pin suchen</span>
              </button>
            </div>
            {pinState === 'busy' && <span className="pinn-pinhint">sucht …</span>}
            {pinState === 'found' && <span className="pinn-pinhint ok">Pin gefunden</span>}
            {pinState === 'missing' && <span className="pinn-pinhint">Adresse nicht gefunden – Pin fehlt</span>}
          </div>
        </div>

        <div className="field pinn-termin">
          <span>Termin</span>
          <div className="pinn-chips">
            <button type="button" className={`pinn-chip${f.day === today ? ' on' : ''}`} onClick={() => set('day', today)}>
              Heute
            </button>
            <button type="button" className={`pinn-chip${f.day === tomorrow ? ' on' : ''}`} onClick={() => set('day', tomorrow)}>
              Morgen
            </button>
            <button type="button" className={`pinn-chip${!f.day ? ' on' : ''}`} onClick={() => setF((x) => ({ ...x, day: '', time: '' }))}>
              Ohne Termin
            </button>
          </div>
          <div className="pinn-grid3">
            <label className="field">
              Datum
              <input type="date" value={f.day} onChange={(e) => set('day', e.target.value)} />
            </label>
            <label className="field">
              Uhrzeit
              <input type="time" value={f.time} step={900} onChange={(e) => set('time', e.target.value)} disabled={!f.day} />
            </label>
            <label className="field">
              Dauer
              <select value={f.duration} onChange={(e) => set('duration', e.target.value)}>
                {DURATIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <label className="field">
          Beschreibung
          <textarea rows={3} maxLength={4000} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Was der Monteur wissen muss (Material, Schlüssel, Ansprechpartner …)" />
        </label>

        <button type="button" role="switch" aria-checked={f.urgent} className={`pinn-switch${f.urgent ? ' on' : ''}`} onClick={() => set('urgent', !f.urgent)}>
          <span className="pinn-switch-knob" aria-hidden />
          <Siren className="i" aria-hidden /> Dringend
        </button>

        <label className="field">
          Monteur
          <select value={f.assignee} onChange={(e) => set('assignee', e.target.value)}>
            <option value="">Nicht zugewiesen</option>
            {ordered.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {memberName(m)}
                {m.role !== 'worker' ? ` (${ROLE_LABEL[m.role]})` : ''}
              </option>
            ))}
          </select>
        </label>
        {ordered.length > 1 && f.assignee && (
          <div className="field">
            <span>Helfer (optional)</span>
            <div className="pinn-chips">
              {ordered
                .filter((m) => m.user_id !== f.assignee)
                .map((m) => {
                  const on = f.helpers.includes(m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      className={`pinn-chip${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onClick={() => set('helpers', on ? f.helpers.filter((h) => h !== m.user_id) : [...f.helpers, m.user_id])}
                    >
                      {memberName(m)}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {error && <div className="error-box">{error}</div>}

        <div className="pinn-form-actions">
          <button type="submit" className="btn" disabled={busy}>
            <Save className="i" aria-hidden /> {busy ? 'Speichert …' : 'Speichern'}
          </button>
          {!job && (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void save(true)}>
              Speichern &amp; nächster
            </button>
          )}
          <div className="spacer" />
          {job && isOpen(job.status) && (
            <button type="button" className="btn ghost pinn-danger" disabled={busy} onClick={() => void cancelJob()}>
              <Ban className="i" aria-hidden /> Absagen
            </button>
          )}
        </div>
        <p className="muted small pinn-keys">Enter speichert · Strg + Enter auch aus der Beschreibung · Esc schließt</p>
      </form>
    </Sheet>
  );
}

/** Kunde mit Vorschlägen aus der Kundenliste (Pfeiltasten + Enter wählen, Esc schließt die Liste). */
function CustomerField({ customers, value, onChange, onPick }: { customers: Customer[]; value: string; onChange: (v: string) => void; onPick: (c: Customer) => void }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const q = value.trim().toLowerCase();
  const hits = q
    ? customers
        .filter((c) => c.name.toLowerCase().includes(q) || (c.address ?? '').toLowerCase().includes(q))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
        .slice(0, 6)
    : [];
  const show = open && hits.length > 0 && !(hits.length === 1 && hits[0].name === value);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!show) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => (h + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => (h - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); // Enter wählt hier den Vorschlag, statt das Formular zu speichern
      onPick(hits[hi] ?? hits[0]);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="field pinn-cust">
      <label htmlFor="pinn-cust-input">Kunde</label>
      <input
        id="pinn-cust-input"
        value={value}
        maxLength={120}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls="pinn-cust-list"
        aria-autocomplete="list"
        placeholder="Name — Vorschläge aus der Kundenliste"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
      />
      {show && (
        <ul className="pinn-suggest" id="pinn-cust-list" role="listbox">
          {hits.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === hi}
              className={i === hi ? 'on' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(c);
                setOpen(false);
              }}
            >
              <b>{c.name}</b>
              {c.address && <span className="muted"> · {c.address}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
