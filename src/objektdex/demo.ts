// ObjektDex mit Beispieldaten (nur Dev-Server: /app/objektdex?demo bzw. /vorschau?app=objektdex).
// Gleicher Beispiel-Betrieb wie die App (ObjektDex/mobile/src/lib/demo.ts): 6 Objekte, Leistungen, 6 Wochen Einsätze,
// Mängel. Alles im Speicher — nach dem Neuladen wieder wie vorher. Wird nur per lazy import im Dev geladen.
import type { OdData } from './data';
import {
  addDays,
  dayOf,
  isDue,
  propertyToday,
  sollIst,
  todayBerlin,
  type Day,
  type ServiceLike,
} from './turnus';
import type { OdDefect, OdMember, OdOperation, OdProperty, OdService, OdShareLink, OdSollIstRow, OdTodayRow } from './types';

const did = (kind: number, n: number) => `0000${kind}000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = '00000000-0000-4000-8000-0000000000aa';

type P = Pick<OdProperty, 'name' | 'address' | 'lat' | 'lng' | 'customer_name'> & Partial<OdProperty>;
type S = Pick<OdService, 'name' | 'template_key' | 'cadence' | 'weekdays' | 'month_day'>;

const PROPS: [P, S[]][] = [
  [
    { name: 'WEG Lindenstraße 12', address: 'Lindenstraße 12, 80331 München', lat: 48.1372, lng: 11.5755, customer_name: 'Hausverwaltung Meier GmbH', customer_contact: '089 123 456', contact_person: 'Herr Kraus (Beirat), EG links' },
    [
      { name: 'Treppenhausreinigung', template_key: 'stairs', cadence: 'weekly', weekdays: [1, 4], month_day: null },
      { name: 'Mülltonnen raus/rein', template_key: 'bins', cadence: 'weekly', weekdays: [2], month_day: null },
      { name: 'Kontrollgang', template_key: 'patrol', cadence: 'weekly', weekdays: [5], month_day: null },
      { name: 'Leuchtmittel prüfen', template_key: 'lights', cadence: 'monthly', weekdays: [], month_day: 1 },
    ],
  ],
  [
    { name: 'Wohnanlage Sonnenhof', address: 'Sonnenstraße 40–44, 80335 München', lat: 48.1355, lng: 11.5652, customer_name: 'Huber & Partner Immobilien', customer_contact: 'verwaltung@huber-partner.example' },
    [
      { name: 'Treppenhausreinigung', template_key: 'stairs', cadence: 'weekly', weekdays: [3], month_day: null },
      { name: 'Rasen mähen', template_key: 'mow', cadence: 'biweekly', weekdays: [4], month_day: null },
      { name: 'Spielplatz-Sichtkontrolle', template_key: 'playground', cadence: 'weekly', weekdays: [1], month_day: null },
      { name: 'Hecke schneiden', template_key: 'hedge', cadence: 'on_demand', weekdays: [], month_day: null },
    ],
  ],
  [
    { name: 'Bürohaus Am Ring 5', address: 'Am Ring 5, 80336 München', lat: 48.1311, lng: 11.5589, customer_name: 'Ring Immobilien KG', contact_person: 'Empfang 3. OG' },
    [
      { name: 'Unterhaltsreinigung Büros', template_key: 'special', cadence: 'daily', weekdays: [], month_day: null },
      { name: 'Kehren Zufahrt', template_key: 'sweep', cadence: 'weekly', weekdays: [5], month_day: null },
      { name: 'Zählerstände', template_key: 'meters', cadence: 'monthly', weekdays: [], month_day: 31 },
    ],
  ],
  [
    { name: 'Seniorenwohnen Parkblick', address: 'Parkweg 7, 80339 München', lat: 48.1398, lng: 11.5486, customer_name: 'Verwaltung Berger', customer_contact: '089 987 654' },
    [
      { name: 'Treppenhausreinigung', template_key: 'stairs', cadence: 'weekly', weekdays: [1], month_day: null },
      { name: 'Mülltonnen raus/rein', template_key: 'bins', cadence: 'weekly', weekdays: [4], month_day: null },
      { name: 'Laub entfernen', template_key: 'leaves', cadence: 'on_demand', weekdays: [], month_day: null },
    ],
  ],
  [
    { name: 'Reihenhäuser Ahornweg 3–9', address: 'Ahornweg 3–9, 81369 München', lat: 48.1179, lng: 11.5371, customer_name: 'Eigentümergemeinschaft Ahornweg' },
    [
      { name: 'Kehren Gehweg', template_key: 'sweep', cadence: 'biweekly', weekdays: [6], month_day: null },
      { name: 'Rasen mähen', template_key: 'mow', cadence: 'weekly', weekdays: [3], month_day: null },
    ],
  ],
  [
    { name: 'Kita Regenbogen – Außenanlage', address: 'Gartenstraße 2, 80337 München', lat: 48.1289, lng: 11.5631, customer_name: 'Kinderhaus Regenbogen e. V.' },
    [
      { name: 'Spielplatz-Sichtkontrolle', template_key: 'playground', cadence: 'weekly', weekdays: [1, 3, 5], month_day: null },
      { name: 'Laub entfernen', template_key: 'leaves', cadence: 'on_demand', weekdays: [], month_day: null },
    ],
  ],
];

const PEOPLE = ['Lena Krämer', 'Tom Berger'];
// Notiz passend zur ersten Leistung (nur jeder zweite Einsatz hat eine)
const NOTES: Record<string, string> = {
  stairs: 'Treppenhaus nass gewischt, Fenster Podest 2. OG gereinigt.',
  bins: 'Tonnen wieder reingestellt, Deckel geschlossen.',
  sweep: 'Zufahrt gekehrt, Gully frei gemacht.',
  playground: 'Sichtkontrolle ohne Befund.',
  mow: 'Rasen gemäht, Schnittgut abgefahren.',
};
const at = (day: Day, hh: number, mm: number) => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).toISOString();
const hash = (n: number) => (n * 2654435761 % 4294967296).toString(16).padStart(8, '0').repeat(8);

const toSpec = (s: OdService): ServiceLike => ({ id: s.id, active: s.active, cadence: s.cadence, weekdays: s.weekdays, monthDay: s.month_day, startOn: s.start_on, endOn: s.end_on });
const toOp = (o: OdOperation) => ({ startedAt: o.started_at, serviceIds: o.service_ids, canceled: o.canceled });

/** Beispielfoto (JPEG aus einer Zeichenfläche) — nur Optik der Vorschau. */
function demoPhoto(label: string, hue: number): string {
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 360;
  const g = c.getContext('2d');
  if (!g) return '';
  const grad = g.createLinearGradient(0, 0, 480, 360);
  grad.addColorStop(0, `hsl(${hue} 35% 62%)`);
  grad.addColorStop(1, `hsl(${hue + 30} 30% 32%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 480, 360);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 6; i++) g.fillRect(40 + i * 70, 170 - i * 18, 50, 190);
  g.fillStyle = '#fff';
  g.font = 'bold 26px Segoe UI, Arial';
  g.fillText(label, 24, 48);
  return c.toDataURL('image/jpeg', 0.8);
}

export interface DemoStore {
  data: OdData;
  orgName: string;
}

export function createDemoStore(): DemoStore {
  const today = todayBerlin();
  const start = addDays(today, -70);
  const properties: OdProperty[] = [];
  const services: OdService[] = [];
  PROPS.forEach(([p, ss], pi) => {
    const pid = did(1, pi + 1);
    properties.push({
      id: pid,
      org_id: ORG,
      customer_contact: null,
      contact_person: null,
      notes: null,
      ...p,
      active: true,
      created_at: at(start, 9, 0),
    } as OdProperty);
    ss.forEach((s, si) =>
      services.push({ ...s, id: did(2, pi * 10 + si + 1), org_id: ORG, property_id: pid, start_on: start, end_on: null, active: true, sort: si, notes: null, created_at: at(start, 9, 5) }),
    );
  });

  // geplante Lücke: Seniorenwohnen — Mülltonnen am letzten Donnerstag vergessen → heute überfällig
  const missed = new Set<string>();
  const bins = services.find((s) => s.property_id === did(1, 4) && s.template_key === 'bins')!;
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i);
    if (isDue(toSpec(bins), d)) {
      missed.add(`${bins.id}|${d}`);
      break;
    }
  }
  const operations: OdOperation[] = [];
  const photoCount = new Map<string, number>();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let n = 0;
  for (let i = 45; i >= 0; i--) {
    const day = addDays(today, -i);
    properties.forEach((p, pi) => {
      const due = services.filter((s) => s.property_id === p.id && isDue(toSpec(s), day) && !missed.has(`${s.id}|${day}`));
      const extra = services.filter((s) => s.property_id === p.id && s.cadence === 'on_demand' && (i * 7 + pi * 3) % 19 === 0);
      const done = [...due, ...extra];
      if (!done.length) return;
      const minute = 7 * 60 + 10 + pi * 38;
      if (i === 0 && (pi >= 2 || minute > nowMin)) return;
      n++;
      const id = did(3, n);
      const photos = n % 3 === 0 ? 2 : n % 5 === 0 ? 1 : 0;
      photoCount.set(id, photos);
      operations.push({
        id,
        property_id: p.id,
        started_at: at(day, Math.floor(minute / 60), minute % 60),
        ended_at: at(day, Math.floor((minute + 25) / 60), (minute + 25) % 60),
        lat: (p.lat ?? 48.13) + 0.00008,
        lng: (p.lng ?? 11.57) - 0.00006,
        gps_accuracy_m: 6 + (n % 9),
        gps_mocked: null,
        service_ids: done.map((s) => s.id),
        services: done.map((s) => ({ id: s.id, name: s.name, cadence: s.cadence })),
        photo_count: photos,
        notes: n % 2 ? NOTES[done[0].template_key ?? ''] ?? 'Alles in Ordnung.' : null,
        performer_name: PEOPLE[(n + pi) % 2],
        received_at: at(day, Math.floor((minute + 26) / 60), (minute + 26) % 60),
        distance_m: 9 + (n % 7),
        entry_hash: hash(n),
        canceled: false,
        cancel_reason: null,
        canceled_at: null,
      });
    });
  }
  const c = operations[Math.floor(operations.length / 2)];
  if (c) Object.assign(c, { canceled: true, cancel_reason: 'Falsches Objekt gewählt — richtig: Sonnenhof', canceled_at: c.ended_at });
  operations.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));

  const mk = (pi: number, daysAgo: number, text: string, status: 'open' | 'done', note?: string): OdDefect => ({
    id: did(4, pi * 10 + daysAgo),
    property_id: did(1, pi),
    operation_id: null,
    text,
    photo_count: 1,
    reporter_name: PEOPLE[daysAgo % 2],
    created_at: at(addDays(today, -daysAgo), 8, 40),
    entry_hash: hash(900 + daysAgo),
    status,
    resolved_at: status === 'done' ? at(addDays(today, -Math.max(0, daysAgo - 3)), 10, 5) : null,
    resolved_name: status === 'done' ? 'Tom Berger' : null,
    resolved_note: note ?? null,
  });
  const defects: OdDefect[] = [
    mk(1, 2, 'Haustür schließt nicht richtig — Türschließer zu schwach eingestellt.', 'open'),
    mk(4, 5, 'Leuchte im Kellerabgang defekt.', 'open'),
    mk(6, 1, 'Spielplatz: Kette an der Nestschaukel verschlissen, Schaukel gesperrt.', 'open'),
    mk(2, 12, 'Restmülltonne Nr. 3 Deckel gebrochen.', 'done', 'Neue Tonne vom Entsorger geliefert.'),
    mk(3, 20, 'Wasserfleck an der Decke im Treppenhaus 2. OG.', 'done', 'Hausverwaltung informiert, Dachdecker war da.'),
  ];
  const links: OdShareLink[] = [
    { id: did(5, 1), property_id: did(1, 1), label: 'Hausverwaltung Meier', created_at: at(addDays(today, -20), 9, 12), revoked_at: null, last_viewed_at: at(addDays(today, -1), 18, 4), view_count: 14 },
    { id: did(5, 2), property_id: did(1, 2), label: 'Huber & Partner', created_at: at(addDays(today, -9), 11, 30), revoked_at: null, last_viewed_at: null, view_count: 0 },
    { id: did(5, 3), property_id: did(1, 1), label: 'alter Link (Beirat)', created_at: at(addDays(today, -60), 8, 0), revoked_at: at(addDays(today, -21), 8, 0), last_viewed_at: at(addDays(today, -30), 7, 51), view_count: 3 },
  ];
  const members: OdMember[] = [
    { membership_id: did(6, 1), user_id: did(7, 1), email: 'chef@objektservice-brandl.example', role: 'owner', joined_at: at(start, 9, 0) },
    { membership_id: did(6, 2), user_id: did(7, 2), email: 'lena.kraemer@objektservice-brandl.example', role: 'worker', joined_at: at(addDays(start, 2), 7, 30) },
    { membership_id: did(6, 3), user_id: did(7, 3), email: 'tom.berger@objektservice-brandl.example', role: 'admin', joined_at: at(addDays(start, 5), 7, 45) },
  ];
  let code = { code: 'OD-K7MR-4QPZ', expires_at: at(addDays(today, 21), 12, 0), use_count: 2 };

  const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));
  const photoCache = new Map<string, string[]>();

  const data: OdData = {
    listProperties: () => wait([...properties].sort((a, b) => a.name.localeCompare(b.name, 'de'))),
    async saveProperty(p) {
      if (p.id) {
        const x = properties.find((q) => q.id === p.id);
        if (x) Object.assign(x, p);
      } else {
        properties.push({ ...p, id: crypto.randomUUID(), org_id: ORG, lat: null, lng: null, active: true, created_at: new Date().toISOString() });
      }
      await wait(null);
    },
    async setPropertyActive(id, active) {
      const x = properties.find((q) => q.id === id);
      if (x) x.active = active;
      await wait(null);
    },
    listServices: () => wait([...services]),
    async saveService(s) {
      if (s.id) {
        const x = services.find((q) => q.id === s.id);
        if (x) Object.assign(x, { name: s.name, cadence: s.cadence, weekdays: s.weekdays, month_day: s.month_day, start_on: s.start_on, notes: s.notes });
      } else {
        services.push({
          ...s,
          id: crypto.randomUUID(),
          org_id: ORG,
          template_key: s.template_key ?? null,
          end_on: null,
          active: true,
          sort: services.filter((q) => q.property_id === s.property_id).length,
          created_at: new Date().toISOString(),
        });
      }
      await wait(null);
    },
    async setServiceActive(id, active) {
      const x = services.find((q) => q.id === id);
      if (x) {
        x.active = active;
        x.end_on = active ? null : today;
      }
      await wait(null);
    },
    listOperations: ({ from, to, propertyId }) =>
      wait(operations.filter((o) => (!propertyId || o.property_id === propertyId) && dayOf(o.started_at) >= from && dayOf(o.started_at) <= to)),
    async cancelOperation(id, reason) {
      const o = operations.find((x) => x.id === id);
      if (!o || o.canceled) throw new Error('Einsatz nicht gefunden oder schon storniert');
      Object.assign(o, { canceled: true, cancel_reason: reason.trim(), canceled_at: new Date().toISOString() });
      await wait(null);
    },
    listDefects: () => wait([...defects]),
    async resolveDefect(id, note, name) {
      const d = defects.find((x) => x.id === id);
      if (!d || d.status === 'done') throw new Error('Mangel nicht gefunden oder schon erledigt');
      Object.assign(d, { status: 'done', resolved_at: new Date().toISOString(), resolved_note: note.trim() || null, resolved_name: name.trim() || null });
      await wait(null);
    },
    async photos(kind, ids) {
      const out = new Map<string, string[]>();
      ids.forEach((id, i) => {
        const cnt = kind === 'defect' ? 1 : photoCount.get(id) ?? 0;
        if (!photoCache.has(id))
          photoCache.set(
            id,
            Array.from({ length: cnt }, (_, k) => demoPhoto(kind === 'defect' ? 'Mangel' : k === 0 ? 'vorher' : 'nachher', (i * 37 + k * 60) % 360)).filter(Boolean),
          );
        out.set(id, photoCache.get(id)!);
      });
      return wait(out);
    },
    async todayOverview(day) {
      const rows: OdTodayRow[] = properties
        .filter((p) => p.active)
        .map((p) => {
          const t = propertyToday(services.filter((s) => s.property_id === p.id).map(toSpec), operations.filter((o) => o.property_id === p.id).map(toOp), day);
          return { property_id: p.id, name: p.name, due: t.due, done: t.done, overdue: t.overdue, status: t.status };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
      return wait(rows);
    },
    async sollIst(propertyId, from, to) {
      const ops = operations.filter((o) => o.property_id === propertyId).map(toOp);
      const rows: OdSollIstRow[] = services
        .filter((s) => s.property_id === propertyId && s.start_on <= to && (!s.end_on || s.end_on > from))
        .map((s) => {
          const r = sollIst(toSpec(s), ops, from, to);
          const last = operations.find((o) => !o.canceled && o.service_ids.includes(s.id) && dayOf(o.started_at) <= to);
          return { service_id: s.id, name: s.name, cadence: s.cadence, active: s.active, soll: r.soll, ist: r.ist, last_done: last?.started_at ?? null };
        });
      return wait(rows);
    },
    listShareLinks: () => wait([...links]),
    async createShareLink(propertyId, label) {
      if (links.filter((l) => l.property_id === propertyId && !l.revoked_at).length >= 5) throw new Error('Höchstens 5 offene Links je Objekt — bitte zuerst einen alten widerrufen.');
      const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
      links.unshift({ id: crypto.randomUUID(), property_id: propertyId, label: label.trim() || null, created_at: new Date().toISOString(), revoked_at: null, last_viewed_at: null, view_count: 0 });
      return wait(token);
    },
    async revokeShareLink(id) {
      const l = links.find((x) => x.id === id);
      if (l) l.revoked_at = new Date().toISOString();
      await wait(null);
    },
    listMembers: () => wait([...members]),
    async teamCode(renew) {
      if (renew) code = { code: 'OD-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(), expires_at: at(addDays(today, 30), 12, 0), use_count: 0 };
      return wait(code);
    },
    async removeMember(id) {
      const i = members.findIndex((m) => m.membership_id === id && m.role !== 'owner');
      if (i >= 0) members.splice(i, 1);
      await wait(null);
    },
    async setMemberRole(userId, role) {
      const m = members.find((x) => x.user_id === userId && x.role !== 'owner');
      if (m) m.role = role;
      await wait(null);
    },
  };
  return { data, orgName: 'Objektservice Brandl' };
}
