// Beispieldaten der Planung (Plantafel + Zeiten) — NUR über ext-demo.ts / DemoArea (Dev-Server).
// Gleiche Objekte, Anlagen, Anfragen und Mitglieder wie ../demo.ts. Alles im Speicher, bis zum Neuladen.

import type { Role } from '../../lib/orgApi';
import { REQUESTS } from '../demo';
import type { PlanungData } from './data';
import { addDays, weekStart, type Appt, type ApptInput, type PlanRequest, type TimeEntry, type TimeKind } from './logic';

const ORG_ID = 'demo-org';
const wait = <T,>(v: T, ms = 120): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));
const NAMES: Record<string, string> = { 'u-owner': 'Franz Muster', 'u-max': 'Max Bauer', 'u-lisa': 'Lisa Wagner' };

/** Lokaler Zeitpunkt: Montag dieser Woche + `day` Tage, `h:m` Uhr. */
function wk(day: number, h: number, m = 0): string {
  const d = addDays(weekStart(new Date()), day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function appt(id: string, who: string, day: number, from: [number, number], to: [number, number], title: string, extra: Partial<Appt> = {}): Appt {
  return {
    id,
    org_id: ORG_ID,
    site_id: null,
    asset_id: null,
    request_id: null,
    assigned_to: who,
    assigned_name: NAMES[who] ?? null,
    title,
    note: null,
    starts_at: wk(day, from[0], from[1]),
    ends_at: wk(day, to[0], to[1]),
    status: 'planned',
    created_by: 'u-owner',
    created_at: wk(-7, 9),
    updated_at: wk(-7, 9),
    ...extra,
  };
}

function buildAppointments(): Appt[] {
  return [
    // diese Woche
    appt('p-1', 'u-max', 0, [8, 0], [10, 0], 'Wartung', { site_id: 's-huber', asset_id: 'a-hub-wp', status: 'done' }),
    appt('p-2', 'u-max', 0, [10, 30], [12, 0], 'Wartung', { site_id: 's-see', asset_id: 'a-see-gt1', status: 'done' }),
    appt('p-3', 'u-lisa', 0, [13, 0], [15, 0], 'Inbetriebnahme', { site_id: 's-novak', asset_id: 'a-nov-wp', note: 'Kunde ist ab 13 Uhr da' }),
    appt('p-4', 'u-owner', 1, [9, 0], [10, 0], 'Besichtigung', { site_id: 's-steiner', note: 'Angebot Ölkessel-Tausch' }),
    appt('p-5', 'u-max', 1, [13, 0], [15, 0], 'Störung', { site_id: 's-gruber', asset_id: 'a-gru-kl2' }),
    // Überschneidung bei Max (Absicht: zeigt die Warnung)
    appt('p-6', 'u-max', 2, [8, 0], [10, 0], 'Wartung', { site_id: 's-see', asset_id: 'a-see-gt2' }),
    appt('p-7', 'u-max', 2, [9, 30], [11, 0], 'Reparatur', { site_id: 's-huber', asset_id: 'a-hub-sp', created_by: 'u-max', note: 'Sicherheitsventil tropft' }),
    appt('p-8', 'u-lisa', 2, [8, 0], [16, 0], 'Inbetriebnahme', { site_id: 's-lechner', asset_id: 'a-lec-pe' }),
    appt('p-9', 'u-lisa', 3, [10, 0], [12, 0], 'Wartung', { site_id: 's-gruber', asset_id: 'a-gru-kl1', status: 'canceled', note: 'Kunde hat abgesagt' }),
    appt('p-10', 'u-owner', 3, [15, 0], [17, 0], 'Wartung', { site_id: 's-steiner', asset_id: 'a-ste-eh' }),
    appt('p-11', 'u-max', 4, [8, 0], [10, 0], 'Wartung', { site_id: 's-gruber', asset_id: 'a-gru-fi' }),
    appt('p-12', 'u-lisa', 4, [13, 0], [15, 0], 'Besichtigung', { site_id: 's-see', request_id: 'r-3', asset_id: 'a-see-gt1' }),
    appt('p-13', 'u-max', 5, [8, 0], [12, 0], 'Reparatur', { site_id: 's-novak', asset_id: 'a-nov-lu' }),
    // nächste Woche
    appt('p-20', 'u-max', 7, [8, 0], [10, 0], 'Wartung', { site_id: 's-huber', asset_id: 'a-hub-wp' }),
    appt('p-21', 'u-lisa', 8, [10, 0], [12, 0], 'Wartung', { site_id: 's-see', asset_id: 'a-see-so' }),
    appt('p-22', 'u-owner', 9, [13, 0], [15, 0], 'Besichtigung', { site_id: 's-lechner' }),
    // vorige Woche
    appt('p-30', 'u-max', -7, [8, 0], [10, 0], 'Wartung', { site_id: 's-gruber', asset_id: 'a-gru-kl3', status: 'done' }),
    appt('p-31', 'u-lisa', -5, [13, 0], [15, 0], 'Störung', { site_id: 's-steiner', asset_id: 'a-ste-oel', status: 'done' }),
  ];
}

/** Gleichmäßiger Pseudo-Zufall je Tag (gleiche Daten bei jedem Neuladen). */
const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function buildTimes(): TimeEntry[] {
  const out: TimeEntry[] = [];
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let n = 0;
  const add = (user: string, kind: TimeKind, s: Date, e: Date | null, extra: Partial<TimeEntry> = {}) => {
    n += 1;
    out.push({
      id: `t-${n}`,
      org_id: ORG_ID,
      user_id: user,
      user_name: NAMES[user],
      kind,
      started_at: s.toISOString(),
      ended_at: e ? e.toISOString() : null,
      site_id: null,
      note: null,
      edited_by: null,
      edited_at: null,
      created_at: (e ?? s).toISOString(),
      // In Rechnung übernommen (SQL vom 07.11.): Bäckerei Gruber bis vor 4 Tagen schon abgerechnet, der Rest offen
      billed_at: extra.site_id === 's-gruber' && e && e.getTime() < Date.now() - 4 * 86_400_000 ? e.toISOString() : null,
      ...extra,
    });
  };
  const at = (d: Date, h: number, m: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
  for (let d = new Date(first); d <= now; d = addDays(d, 1)) {
    const wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    const isToday = d.toDateString() === now.toDateString();
    const seed = d.getDate() + d.getMonth() * 31;
    for (const [ui, user] of ['u-owner', 'u-max', 'u-lisa'].entries()) {
      const r = rnd(seed * 3 + ui);
      if (r < 0.08) continue; // Urlaub/krank
      const startH = user === 'u-owner' ? 8 : 7;
      const startM = Math.round(r * 4) * 5;
      const endH = 15 + Math.round(rnd(seed + ui * 7) * 2);
      if (isToday) {
        // heute: Max stempelt gerade (läuft), die anderen haben noch nichts
        if (user === 'u-max' && now.getHours() >= 8) {
          add(user, 'travel', at(d, 7, 0), at(d, 7, 25), { note: 'Lager → Huber' });
          add(user, 'work', at(d, 7, 25), null, { site_id: 's-huber', created_at: at(d, 7, 25).toISOString() });
        }
        continue;
      }
      add(user, 'travel', at(d, startH, startM), at(d, startH, startM + 20));
      add(user, 'work', at(d, startH, startM + 20), at(d, 12, 0), { site_id: user === 'u-lisa' ? 's-novak' : 's-gruber' });
      // an manchen Tagen fehlt die Pause (zeigt den Hinweis nach AZG/ArbZG)
      const skipBreak = rnd(seed * 5 + ui) < 0.12;
      if (!skipBreak) add(user, 'break', at(d, 12, 0), at(d, 12, 30));
      add(user, 'work', at(d, 12, skipBreak ? 0 : 30), at(d, endH, 0), {
        note: rnd(seed + ui) < 0.3 ? 'Baustelle Huber' : null,
        // eine Korrektur durch den Inhaber
        ...(user === 'u-lisa' && d.getDate() === 10 ? { edited_by: 'u-owner', edited_at: at(d, 18, 0).toISOString() } : {}),
      });
    }
  }
  return out;
}

export function demoPlanung(): PlanungData {
  let appts = buildAppointments();
  let times = buildTimes();
  const statusOverride = new Map<string, PlanRequest['status']>();
  const reqs = (): PlanRequest[] =>
    REQUESTS.map((r) => ({
      id: r.id,
      site_id: r.site_id,
      asset_id: r.asset_id,
      kind: r.kind,
      status: statusOverride.get(r.id) ?? r.status,
      contact_name: r.contact_name,
      created_at: r.created_at,
      scheduled_at: r.scheduled_at ?? null,
      scheduled_end: r.scheduled_end ?? null,
    }));
  const inRange = (iso: string, from: Date, to: Date) => {
    const t = Date.parse(iso);
    return t >= from.getTime() && t < to.getTime();
  };
  let seq = 0;

  return {
    myUserId: (role: Role) => wait(role === 'owner' ? 'u-owner' : 'u-max', 10),
    appointments: (from, to) => wait(appts.filter((a) => inRange(a.starts_at, from, to)).sort((a, b) => a.starts_at.localeCompare(b.starts_at))),
    async createAppointment(_orgId, input: ApptInput) {
      seq += 1;
      const now = new Date().toISOString();
      appts = [...appts, { ...input, id: `p-new-${seq}`, org_id: ORG_ID, created_by: input.assigned_to, created_at: now, updated_at: now }];
      await wait(null);
    },
    async updateAppointment(id, input) {
      appts = appts.map((a) => (a.id === id ? { ...a, ...input, updated_at: new Date().toISOString() } : a));
      await wait(null);
    },
    async setAppointmentStatus(id, status) {
      appts = appts.map((a) => (a.id === id ? { ...a, status } : a));
      await wait(null);
    },
    async deleteAppointment(id) {
      appts = appts.filter((a) => a.id !== id);
      await wait(null);
    },
    scheduledRequests: (from, to) =>
      wait(reqs().filter((r) => r.scheduled_at && inRange(r.scheduled_at, from, to) && r.status !== 'done' && r.status !== 'dismissed')),
    openRequests: () => wait(reqs().filter((r) => r.status === 'new' || r.status === 'scheduled')),
    async markRequestScheduled(id) {
      statusOverride.set(id, 'scheduled');
      await wait(null);
    },
    timeEntries: (from, to) => wait(times.filter((e) => inRange(e.started_at, from, to))),
    async updateTimeEntry(id, patch) {
      times = times.map((e) => (e.id === id ? { ...e, ...patch, edited_by: 'u-owner', edited_at: new Date().toISOString() } : e));
      await wait(null);
    },
    async deleteTimeEntry(id) {
      times = times.filter((e) => e.id !== id);
      await wait(null);
    },
    // Beispiel: Max 38,5 h (Mo–Fr), Lisa Teilzeit 20 h (Mo–Do), Inhaber ohne Sollzeit
    timeTargets: () =>
      wait([
        { user_id: 'u-max', week_minutes: 38 * 60 + 30, days: [1, 2, 3, 4, 5] },
        { user_id: 'u-lisa', week_minutes: 20 * 60, days: [1, 2, 3, 4] },
      ]),
  };
}
