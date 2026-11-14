// PinnDex — Beispieldaten im Speicher (nur Dev-Server bzw. solange kein Supabase-Projekt eingetragen ist).
// Gleiche Schnittstelle wie die echte Datenquelle (data.ts). Damit die Pinnwand „lebt“, rücken Beispiel-Monteure
// alle paar Sekunden eine Karte weiter (gesehen → läuft → fertig). Nach dem Neuladen ist alles wie vorher.

import type { PinnData, StatusExtra } from './data';
import { addDays, canGetJobs, isMine, isOpen, newId, officeRuleMessage, startOfDay } from './logic';
import type { Customer, Job, JobEvent, JobStatus, PinnMember, PinnOrg, PinnRole } from './types';

const ORG_ID = 'demo-org';

export const DEMO_USERS: Record<PinnRole, string> = { owner: 'u-chef', dispatcher: 'u-dispo', worker: 'u-tom' };

/** Platzhalter-Foto als SVG (kein Netz nötig). */
function photo(label: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},50%,22%)"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/><circle cx="500" cy="120" r="60" fill="rgba(255,255,255,.18)"/><path d="M0 380 L180 250 L320 340 L460 220 L640 360 L640 480 L0 480Z" fill="rgba(0,0,0,.25)"/><text x="40" y="440" font-family="Arial" font-size="34" fill="#fff">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function at(dayOffset: number, h: number, m = 0): string {
  const d = addDays(startOfDay(new Date()), dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();

interface Store {
  org: PinnOrg;
  members: PinnMember[];
  customers: Customer[];
  jobs: Job[];
  events: JobEvent[];
}

function seed(): Store {
  const created = ago(60 * 24 * 90);
  const org: PinnOrg = {
    id: ORG_ID,
    name: 'Muster Haustechnik GmbH',
    owner_id: 'u-chef',
    team_code: 'LZ-7K4M-Q2XZ',
    team_code_expires: addDays(new Date(), 23).toISOString(),
    seat_limit: 5,
    seat_override: null,
    allow_open_pool: false,
    share_location: true,
    created_at: created,
  };
  const m = (user_id: string, role: PinnRole, display_name: string, color: string | null, active = true): PinnMember => ({
    org_id: ORG_ID,
    user_id,
    role,
    display_name,
    color,
    active,
    created_at: created,
  });
  const members = [
    m('u-chef', 'owner', 'Sabine Kurz', '#f472b6'),
    { ...m('u-dispo', 'dispatcher', 'Petra Lang', '#c084fc'), created_at: ago(60 * 26) }, // gestern beigetreten (zeigt „neu“)
    m('u-tom', 'worker', 'Tom Berger', '#60a5fa'),
    m('u-lena', 'worker', 'Lena Hofer', '#34d399'),
    m('u-murat', 'worker', 'Murat Demir', '#fbbf24'),
    m('u-jonas', 'worker', 'Jonas Wagner', '#fb923c'),
  ];
  const c = (name: string, phone: string, address: string, pos: [number, number], note: string | null = null): Customer => ({
    id: newId(),
    org_id: ORG_ID,
    name,
    phone,
    address,
    note,
    lat: pos[0],
    lng: pos[1],
    deleted_at: null,
    updated_at: created,
  });
  const customers = [
    c('Familie Maier', '+49 171 2345678', 'Hauptstraße 5, 84028 Landshut', [48.5441, 12.1462], 'Hund im Garten — klingeln und warten'),
    c('Bäckerei Huber', '+49 871 44310', 'Altstadt 112, 84028 Landshut', [48.5369, 12.1526]),
    c('Hausverwaltung Sonnhof', '+49 871 99020', 'Seligenthaler Str. 30, 84034 Landshut', [48.5412, 12.1398], 'Schlüssel beim Hausmeister, Wohnung 3 OG'),
    c('Dr. Schneider', '+49 160 9988776', 'Am Hofgarten 7, 84036 Landshut', [48.5331, 12.1586]),
    c('Kita Sonnenschein', '+49 871 22113', 'Ludmillastraße 4, 84034 Landshut', [48.5447, 12.1561], 'Nur zwischen 9 und 14 Uhr'),
    c('Weber Immobilien', '+49 871 55667', 'Ländtorplatz 2, 84028 Landshut', [48.5386, 12.1491]),
    c('Herr Yilmaz', '+49 152 3344556', 'Veldener Str. 88, 84036 Landshut', [48.5291, 12.1302]),
    c('Gasthof zur Post', '+49 871 12345', 'Dorfplatz 1, 84032 Altdorf', [48.5611, 12.1112]),
  ];
  const cust = (i: number) => customers[i];

  const jobs: Job[] = [];
  const events: JobEvent[] = [];
  const ev = (job: Job, kind: JobEvent['kind'], iso: string, actor: string | null, data: Record<string, unknown> | null = null) =>
    events.push({ id: newId(), org_id: ORG_ID, job_id: job.id, actor_id: actor, kind, at: iso, data });

  const job = (p: Partial<Job> & { title: string }): Job => {
    const j: Job = {
      id: newId(),
      org_id: ORG_ID,
      customer_id: null,
      customer_name: null,
      customer_phone: null,
      address: null,
      note: null,
      scheduled_at: null,
      duration_min: null,
      urgent: false,
      assignee_id: null,
      helper_ids: [],
      status: 'new',
      seen_at: null,
      started_at: null,
      finished_at: null,
      work_seconds: 0,
      running_since: null,
      done_note: null,
      outcome: null,
      photos: [],
      result_photos: [],
      created_by: 'u-chef',
      created_at: ago(60 * 24 * 2),
      updated_at: ago(30),
      deleted_at: null,
      ...p,
    };
    j.customer_name ??= p.customer_id ? (customers.find((x) => x.id === p.customer_id)?.name ?? null) : null;
    jobs.push(j);
    ev(j, 'created', j.created_at, j.created_by);
    if (j.assignee_id) ev(j, 'assigned', j.created_at, j.created_by, { to: j.assignee_id });
    return j;
  };
  const forCustomer = (i: number) => ({ customer_id: cust(i).id, customer_name: cust(i).name, customer_phone: cust(i).phone, address: cust(i).address, lat: cust(i).lat ?? null, lng: cust(i).lng ?? null });

  // ---------- heute ----------
  const a = job({ id: 'demo-therme', title: 'Therme tauschen', ...forCustomer(0), scheduled_at: at(0, 7, 30), duration_min: 240, assignee_id: 'u-tom', helper_ids: ['u-jonas'], status: 'running', note: 'Neue Therme steht im Keller. Alte Therme mitnehmen.', photos: [photo('Alte Therme', 200), photo('Typenschild', 30)] });
  a.seen_at = ago(150);
  a.started_at = ago(47);
  a.running_since = a.started_at;
  ev(a, 'seen', a.seen_at, 'u-tom');
  ev(a, 'start', a.started_at, 'u-tom', { lat: 48.54402, lng: 12.14641, acc: 11 });

  const b = job({ id: 'demo-wasserhahn', title: 'Wasserhahn tropft — Küche', ...forCustomer(1), scheduled_at: at(0, 9, 0), duration_min: 60, assignee_id: 'u-lena', status: 'done', urgent: false });
  b.seen_at = ago(200);
  b.started_at = ago(170);
  b.finished_at = ago(118);
  b.work_seconds = 52 * 60;
  b.done_note = 'Kartusche getauscht, dicht.';
  b.outcome = 'ok';
  b.result_photos = [photo('Neue Kartusche', 160)];
  ev(b, 'seen', b.seen_at, 'u-lena');
  ev(b, 'start', b.started_at, 'u-lena', { lat: 48.53682, lng: 12.15248, acc: 9 });
  ev(b, 'done', b.finished_at, 'u-lena', { note: b.done_note });

  const cJob = job({ title: 'Heizung macht Geräusche', ...forCustomer(2), scheduled_at: at(0, 11, 0), duration_min: 90, assignee_id: 'u-lena', status: 'paused', note: 'Mieterin Frau Koch, 3. OG' });
  cJob.seen_at = ago(140);
  cJob.started_at = ago(65);
  cJob.work_seconds = 35 * 60;
  ev(cJob, 'seen', cJob.seen_at, 'u-lena');
  ev(cJob, 'start', cJob.started_at, 'u-lena', { lat: 48.54131, lng: 12.13995, acc: 15 });
  ev(cJob, 'pause', ago(30), 'u-lena', { reason: 'Ersatzteil holen' });

  const d = job({ title: 'Rohrbruch Keller', ...forCustomer(5), scheduled_at: at(0, 10, 0), duration_min: 120, assignee_id: 'u-murat', status: 'seen', urgent: true, note: 'Wasser abgestellt. Sofort hin!' });
  d.seen_at = ago(12);
  ev(d, 'seen', d.seen_at, 'u-murat');

  job({ title: 'Wartung Gasheizung', ...forCustomer(3), scheduled_at: at(0, 13, 30), duration_min: 90, assignee_id: 'u-murat', status: 'new' });
  job({ title: 'Spülkasten defekt', ...forCustomer(4), scheduled_at: at(0, 14, 0), duration_min: 45, assignee_id: 'u-tom', status: 'new' });
  job({ title: 'Heizkörper entlüften (8 Stück)', ...forCustomer(2), scheduled_at: at(0, 15, 30), duration_min: 60, assignee_id: 'u-jonas', status: 'seen', seen_at: ago(20) });
  job({ title: 'Angebot vor Ort: Bad', ...forCustomer(6), lat: null, lng: null, scheduled_at: at(0, 16, 0), duration_min: 30, status: 'new' });
  job({ title: 'Warmwasser fällt aus', ...forCustomer(7), scheduled_at: at(0, 12, 0), duration_min: 60, status: 'new', urgent: true });
  job({ title: 'Silikonfugen Dusche erneuern', customer_name: 'Frau Lindner', customer_phone: '+49 151 1212121', address: 'Bahnhofplatz 3, 84032 Landshut', status: 'new' });

  const late = job({ title: 'Druckminderer prüfen', ...forCustomer(5), scheduled_at: at(-1, 15, 0), duration_min: 60, assignee_id: 'u-jonas', status: 'seen' });
  late.seen_at = ago(60 * 20);

  // ---------- Rest der Woche ----------
  job({ title: 'Wartung Wärmepumpe', ...forCustomer(3), scheduled_at: at(1, 8, 0), duration_min: 120, assignee_id: 'u-tom' });
  job({ title: 'Zähler wechseln', ...forCustomer(1), scheduled_at: at(1, 10, 30), duration_min: 60, assignee_id: 'u-lena' });
  job({ title: 'Abfluss verstopft', ...forCustomer(7), scheduled_at: at(1, 13, 0), duration_min: 60, assignee_id: 'u-murat', urgent: true });
  job({ title: 'Heizungsventile tauschen', ...forCustomer(2), scheduled_at: at(2, 9, 0), duration_min: 180, assignee_id: 'u-jonas' });
  job({ title: 'Gastherme Jahreswartung', ...forCustomer(0), scheduled_at: at(2, 14, 0), duration_min: 90, assignee_id: 'u-tom' });
  job({ title: 'Rohbau-Begehung', ...forCustomer(6), scheduled_at: at(3, 8, 30), duration_min: 60 });
  job({ title: 'Boiler entkalken', ...forCustomer(4), scheduled_at: at(3, 11, 0), duration_min: 120, assignee_id: 'u-lena' });

  // ---------- erledigt: die letzten 6 Wochen ----------
  const titles = ['Heizung entlüftet', 'Wasserhahn getauscht', 'Wartung Gasheizung', 'Abfluss frei gemacht', 'Thermostat ersetzt', 'Spülkasten repariert', 'Druck nachgefüllt', 'Pumpe getauscht', 'Siphon erneuert', 'Rauchmelder montiert'];
  const workers = ['u-tom', 'u-lena', 'u-murat', 'u-jonas'];
  let n = 0;
  for (let dayOff = -1; dayOff >= -42; dayOff--) {
    const wd = addDays(new Date(), dayOff).getDay();
    if (wd === 0 || wd === 6) continue;
    const perDay = 2 + ((n * 7) % 3);
    for (let k = 0; k < perDay; k++) {
      n++;
      const w = workers[(n + k) % workers.length];
      const ci = (n * 3 + k) % customers.length;
      const startH = 7 + ((k * 3 + n) % 8);
      const workMin = 25 + ((n * 37) % 170);
      const outcome = n % 17 === 0 ? 'not_met' : n % 13 === 0 ? 'follow_up' : n % 29 === 0 ? 'problem' : 'ok';
      const j = job({
        title: titles[n % titles.length],
        ...forCustomer(ci),
        scheduled_at: at(dayOff, startH),
        duration_min: 60,
        assignee_id: w,
        status: 'done',
        created_at: at(dayOff - 3, 9),
      });
      j.seen_at = at(dayOff, startH - 1, 10);
      j.started_at = at(dayOff, startH, 5);
      j.finished_at = new Date(Date.parse(j.started_at) + workMin * 60000).toISOString();
      j.work_seconds = workMin * 60;
      j.outcome = outcome;
      j.done_note = outcome === 'ok' ? (n % 3 === 0 ? 'Alles erledigt, Kunde zufrieden.' : null) : outcome === 'not_met' ? 'Niemand zu Hause, Zettel hinterlassen.' : outcome === 'follow_up' ? 'Ersatzteil bestellt, zweiter Termin nötig.' : 'Leitung marode — Angebot nötig.';
      if (n % 4 === 0) j.result_photos = [photo('Nachher', (n * 47) % 360)];
      j.updated_at = j.finished_at;
      ev(j, 'seen', j.seen_at, w);
      ev(j, 'start', j.started_at, w);
      ev(j, 'done', j.finished_at, w, j.done_note ? { note: j.done_note } : null);
      if (n % 19 === 0) {
        const before = j.work_seconds;
        j.work_seconds = before + 30 * 60;
        ev(j, 'time_fix', new Date(Date.parse(j.finished_at) + 3600000).toISOString(), 'u-chef', { seconds: j.work_seconds, before, note: 'Anfahrt vergessen zu starten' });
      }
    }
  }
  const x = job({ title: 'Termin abgesagt: Wartung', ...forCustomer(6), scheduled_at: at(-2, 10), assignee_id: 'u-murat', status: 'canceled' });
  x.updated_at = at(-3, 16);
  ev(x, 'canceled', x.updated_at, 'u-chef', { note: 'Kunde verreist' });

  return { org, members, customers, jobs, events };
}

/** Erlaubte Übergänge (wie job_set_status auf dem Server). */
const NEXT: Record<JobStatus, JobStatus[]> = {
  new: ['seen', 'running', 'canceled'],
  seen: ['running', 'canceled'],
  running: ['paused', 'done', 'canceled'],
  paused: ['running', 'done', 'canceled'],
  done: [],
  canceled: [],
};

export interface DemoStore {
  data: PinnData;
  org: () => PinnOrg;
  setViewer: (uid: string, role: PinnRole) => void;
  stop: () => void;
}

export function createDemoStore(): DemoStore {
  const s = seed();
  const listeners = new Set<() => void>();
  let viewer = { uid: 'u-chef', role: 'owner' as PinnRole };
  const emit = () => listeners.forEach((f) => f());
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(clone(v)), ms));
  const visible = (j: Job) =>
    !j.deleted_at && (viewer.role !== 'worker' || j.assignee_id === viewer.uid || (j.helper_ids ?? []).includes(viewer.uid) || (s.org.allow_open_pool && !j.assignee_id));
  const ev = (j: Job, kind: JobEvent['kind'], actor: string | null, data: Record<string, unknown> | null = null) =>
    s.events.push({ id: newId(), org_id: ORG_ID, job_id: j.id, actor_id: actor, kind, at: new Date().toISOString(), data });
  const lastRun = (j: Job) => [...s.events].reverse().find((e) => e.job_id === j.id && (e.kind === 'start' || e.kind === 'resume'))?.at;
  const canManage = () => viewer.role !== 'worker';
  // wie job_before_write am Server: Zugewiesener/Helfer nur Monteur oder Chef, nie Büro (nur neu gesetzte prüfen)
  const assertAssignable = (assignee: string | null | undefined, helpers: string[] | undefined, before: Job | null) => {
    const ids = [...(assignee && assignee !== before?.assignee_id ? [assignee] : []), ...(helpers ?? []).filter((h) => !(before?.helper_ids ?? []).includes(h))];
    for (const uid of ids) if (!canGetJobs(s.members.find((x) => x.user_id === uid))) throw new Error(officeRuleMessage('assignee is office')!);
  };

  function transition(j: Job, to: JobStatus, actor: string, extra?: StatusExtra) {
    if (!NEXT[j.status].includes(to)) throw new Error(`Zustand konnte nicht geändert werden: von „${j.status}“ nach „${to}“ ist nicht erlaubt.`);
    const now = new Date().toISOString();
    if (j.status === 'running' && (to === 'paused' || to === 'done' || to === 'canceled')) {
      const since = lastRun(j);
      if (since) j.work_seconds += Math.max(0, Math.round((Date.now() - Date.parse(since)) / 1000));
    }
    const kind: JobEvent['kind'] = to === 'seen' ? 'seen' : to === 'running' ? (j.status === 'paused' ? 'resume' : 'start') : to === 'paused' ? 'pause' : to === 'done' ? 'done' : 'canceled';
    if (to === 'seen') j.seen_at = now;
    if (to === 'running' && !j.started_at) j.started_at = now;
    if (to === 'done') {
      j.finished_at = now;
      j.done_note = extra?.note ?? null;
      j.outcome = extra?.outcome ?? 'ok';
    }
    j.status = to;
    j.running_since = to === 'running' ? now : null;
    j.updated_at = now;
    // wie die App: Standort einmalig bei Start/Weiter/Fertig, nur wenn der Chef es eingeschaltet hat
    const loc = s.org.share_location && j.lat != null && j.lng != null && (kind === 'start' || kind === 'resume' || kind === 'done') ? { lat: j.lat + (Math.random() - 0.5) * 0.0006, lng: j.lng! + (Math.random() - 0.5) * 0.0006, acc: 10 } : {};
    ev(j, kind, actor, { ...loc, ...(extra?.note ? { note: extra.note } : {}) });
  }

  // Beispiel-Monteure arbeiten: alle 9 s rückt eine Karte von heute weiter
  const tick = window.setInterval(() => {
    const today = startOfDay(new Date()).getTime();
    const cand = s.jobs.filter(
      (j) =>
        j.assignee_id &&
        j.assignee_id !== viewer.uid &&
        j.scheduled_at &&
        startOfDay(new Date(j.scheduled_at)).getTime() === today &&
        (j.status === 'new' || j.status === 'seen' || (j.status === 'running' && Date.now() - Date.parse(lastRun(j) ?? j.updated_at) > 25000)),
    );
    if (!cand.length) return;
    const j = cand[Math.floor(Math.random() * cand.length)];
    try {
      if (j.status === 'new') transition(j, 'seen', j.assignee_id!);
      else if (j.status === 'seen') {
        // höchstens eine laufende Karte je Monteur
        const busy = s.jobs.some((o) => o.assignee_id === j.assignee_id && o.status === 'running');
        if (busy) return;
        transition(j, 'running', j.assignee_id!);
      } else if (j.status === 'running') transition(j, 'done', j.assignee_id!, { note: 'Erledigt (Beispiel).', outcome: 'ok' });
      emit();
    } catch {
      /* Beispiel — egal */
    }
  }, 9000);

  const job = (id: string) => {
    const j = s.jobs.find((x) => x.id === id && !x.deleted_at);
    if (!j) throw new Error('Auftrag nicht gefunden');
    return j;
  };

  const data: PinnData = {
    members: () => delay(s.members),
    customers: () => delay(s.customers.filter((c) => !c.deleted_at).sort((a, b) => a.name.localeCompare(b.name, 'de'))),
    boardJobs: (from, to) =>
      delay(
        s.jobs.filter((j) => {
          if (!visible(j)) return false;
          const t = j.scheduled_at ? Date.parse(j.scheduled_at) : null;
          if (t !== null && t >= from.getTime() && t < to.getTime()) return true;
          const open = ['new', 'seen', 'running', 'paused'].includes(j.status);
          return open && (t === null || t < from.getTime());
        }),
      ),
    doneJobs: (from, to, withCanceled) =>
      delay(
        s.jobs
          .filter((j) => {
            if (!visible(j)) return false;
            const iso = j.status === 'done' ? j.finished_at : j.status === 'canceled' && withCanceled ? j.updated_at : null;
            if (!iso) return false;
            const t = Date.parse(iso);
            return t >= from.getTime() && t < to.getTime();
          })
          .sort((a, b) => (b.finished_at ?? b.updated_at).localeCompare(a.finished_at ?? a.updated_at)),
      ),
    timeJobs: (from, to) =>
      delay(
        s.jobs.filter((j) => {
          if (!visible(j)) return false;
          if (j.status === 'done' && j.finished_at) {
            const t = Date.parse(j.finished_at);
            return t >= from.getTime() && t < to.getTime();
          }
          return (j.status === 'running' || j.status === 'paused') && !!j.started_at && Date.parse(j.started_at) < to.getTime();
        }),
      ),
    job: async (id) => {
      const j = s.jobs.find((x) => x.id === id && visible(x));
      return delay(j ?? null);
    },
    events: (jobId) => delay(s.events.filter((e) => e.job_id === jobId).sort((a, b) => a.at.localeCompare(b.at))),
    eventsOf: (ids, kinds) => {
      const set = new Set(ids);
      return delay(s.events.filter((e) => set.has(e.job_id) && kinds.includes(e.kind)).sort((a, b) => a.at.localeCompare(b.at)));
    },
    async saveJob(input, id) {
      if (!canManage()) throw new Error('Auftrag konnte nicht gespeichert werden: dafür fehlt dir die Berechtigung.');
      assertAssignable(input.assignee_id, input.helper_ids, id ? job(id) : null);
      if (id) {
        const j = job(id);
        const assignedBefore = j.assignee_id;
        Object.assign(j, input, { updated_at: new Date().toISOString() });
        ev(j, 'edited', viewer.uid, { fields: ['title', 'scheduled_at', 'note'] });
        if (assignedBefore !== j.assignee_id) ev(j, 'assigned', viewer.uid, { from: assignedBefore, to: j.assignee_id });
        emit();
        return delay(j);
      }
      const now = new Date().toISOString();
      const j: Job = {
        ...input,
        id: newId(),
        org_id: ORG_ID,
        status: 'new',
        seen_at: null,
        started_at: null,
        finished_at: null,
        work_seconds: 0,
        running_since: null,
        done_note: null,
        outcome: null,
        photos: [],
        result_photos: [],
        created_by: viewer.uid,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      s.jobs.push(j);
      ev(j, 'created', viewer.uid);
      if (j.assignee_id) ev(j, 'assigned', viewer.uid, { to: j.assignee_id });
      emit();
      return delay(j);
    },
    async moveJob(id, patch) {
      if (!canManage()) throw new Error('Auftrag konnte nicht verschoben werden: dafür fehlt dir die Berechtigung.');
      const j = job(id);
      if ('assignee_id' in patch) assertAssignable(patch.assignee_id, [], j);
      if ('assignee_id' in patch && patch.assignee_id !== j.assignee_id) {
        j.assignee_id = patch.assignee_id ?? null;
        ev(j, 'assigned', viewer.uid, { to: j.assignee_id });
      }
      if ('scheduled_at' in patch && patch.scheduled_at !== j.scheduled_at) {
        j.scheduled_at = patch.scheduled_at ?? null;
        ev(j, 'edited', viewer.uid, { fields: ['scheduled_at'] });
      }
      j.updated_at = new Date().toISOString();
      emit();
      await delay(null, 250);
    },
    async setStatus(id, to, extra) {
      const j = job(id);
      if (viewer.role === 'worker' && j.assignee_id !== viewer.uid && !(j.helper_ids ?? []).includes(viewer.uid)) throw new Error('Zustand konnte nicht geändert werden: nicht deine Karte.');
      if (viewer.role === 'worker' && to === 'canceled') throw new Error('Zustand konnte nicht geändert werden: Absagen darf nur der Chef.');
      transition(j, to, viewer.uid, extra);
      emit();
      await delay(null, 200);
    },
    async fixTime(id, seconds, note) {
      if (!canManage()) throw new Error('Zeit konnte nicht korrigiert werden: dafür fehlt dir die Berechtigung.');
      const j = job(id);
      const before = j.work_seconds;
      j.work_seconds = Math.max(0, Math.round(seconds));
      j.updated_at = new Date().toISOString();
      ev(j, 'time_fix', viewer.uid, { seconds: j.work_seconds, before, note });
      emit();
      await delay(null, 200);
    },
    async saveCustomer(input, id) {
      if (!canManage()) throw new Error('Kunde konnte nicht gespeichert werden: dafür fehlt dir die Berechtigung.');
      if (id) {
        const c = s.customers.find((x) => x.id === id);
        if (!c) throw new Error('Kunde nicht gefunden');
        Object.assign(c, input, { updated_at: new Date().toISOString() });
        return delay(c);
      }
      const c: Customer = { ...input, id: newId(), org_id: ORG_ID, deleted_at: null, updated_at: new Date().toISOString() };
      s.customers.push(c);
      return delay(c);
    },
    async deleteCustomer(id) {
      const c = s.customers.find((x) => x.id === id);
      if (c) c.deleted_at = new Date().toISOString();
      await delay(null);
    },
    async teamCode(renew) {
      if (viewer.role !== 'owner') throw new Error('Team-Code konnte nicht geladen werden: nur der Chef.');
      if (renew) {
        const part = () => Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
        s.org.team_code = `LZ-${part()}-${part()}`;
        s.org.team_code_expires = addDays(new Date(), 30).toISOString();
      }
      return delay({ code: s.org.team_code!, expires_at: s.org.team_code_expires });
    },
    seats: () => delay({ limit: s.org.seat_override ?? s.org.seat_limit, members: s.members.filter((m) => m.active && m.role === 'worker').length }),
    async setRole(userId, role) {
      if (viewer.role !== 'owner') throw new Error('Rolle konnte nicht geändert werden: nur der Chef.');
      const m = s.members.find((x) => x.user_id === userId);
      // wie member_update: Monteur → Büro nur ohne offene Aufträge
      if (m && role === 'dispatcher' && m.role !== 'dispatcher' && s.jobs.some((j) => !j.deleted_at && isOpen(j.status) && isMine(j, userId)))
        throw new Error(officeRuleMessage('member has open jobs')!);
      if (m && m.role !== 'owner') m.role = role;
      await delay(null);
    },
    async removeMember(userId) {
      if (viewer.role !== 'owner') throw new Error('Mitglied konnte nicht entfernt werden: nur der Chef.');
      const m = s.members.find((x) => x.user_id === userId);
      if (m && m.role !== 'owner') m.active = false;
      await delay(null);
    },
    async renameOrg(name) {
      if (viewer.role !== 'owner') throw new Error('Betrieb konnte nicht gespeichert werden: nur der Chef.');
      s.org.name = name;
      await delay(null);
    },
    async setShareLocation(on) {
      if (viewer.role !== 'owner') throw new Error('Einstellung konnte nicht gespeichert werden: nur der Chef.');
      s.org.share_location = on;
      await delay(null);
    },
    async setJobPos(id, pos) {
      if (!canManage()) throw new Error('Pin konnte nicht gespeichert werden: dafür fehlt dir die Berechtigung.');
      const j = job(id);
      j.lat = pos?.lat ?? null;
      j.lng = pos?.lng ?? null;
      emit();
      await delay(null);
    },
    // Beispiel-Adress-Suche ohne Netz: Adressen mit „Landshut“/„Altdorf“ landen rund um Landshut, alles andere „nicht gefunden“
    async geocode(address) {
      await delay(null, 400);
      if (!/landshut|altdorf|ergolding|kumhausen/i.test(address)) return null;
      let h = 0;
      for (const ch of address) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return { lat: 48.537 + ((h % 1000) / 1000 - 0.5) * 0.03, lng: 12.152 + (((h >> 10) % 1000) / 1000 - 0.5) * 0.04 };
    },
    photoUrls: (paths) => delay(paths.filter((p) => p.startsWith('data:image/'))),
    subscribe(onChange, onLive) {
      listeners.add(onChange);
      const t = window.setTimeout(() => onLive(true), 300);
      return () => {
        window.clearTimeout(t);
        listeners.delete(onChange);
        onLive(false);
      };
    },
  };

  return {
    data,
    org: () => clone(s.org),
    // ohne Meldung an die Seiten: der Aufrufer baut den Bereich je Rolle ohnehin neu auf (key)
    setViewer: (uid, role) => {
      viewer = { uid, role };
    },
    stop: () => window.clearInterval(tick),
  };
}

export function demoMember(store: DemoStore, role: PinnRole): PinnMember {
  const uid = DEMO_USERS[role];
  return {
    org_id: ORG_ID,
    user_id: uid,
    role,
    display_name: role === 'owner' ? 'Sabine Kurz' : role === 'dispatcher' ? 'Petra Lang' : 'Tom Berger',
    color: null,
    active: true,
    created_at: store.org().created_at,
  };
}
