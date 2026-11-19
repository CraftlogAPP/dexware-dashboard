// „Einsatz erfassen“ mit Beispieldaten — NUR im Dev-Server (/app/winterdex/einsatz?demo), fehlt im
// Produktions-Build (siehe WinterdexArea). Damit lässt sich der ganze Ablauf ohne Konto prüfen:
//   ?demo            normaler Ablauf (Speichern klappt)
//   ?demo&netz=aus   Server nicht erreichbar → Einsatz bleibt auf dem Gerät („wartet“)
//   ?demo&netz=nein  Server lehnt ab → „vom Server nicht angenommen“
// Der Schalter lässt sich im Banner oben umstellen (Nachsenden testen).
import { useMemo, useState } from 'react';
import { Link, Route as RouterRoute, Routes } from 'react-router-dom';
import type { AppConfig } from '../../apps/registry';
import type { Property } from '../types';
import type { EinsatzBackend, OperationRow, RouteRow, RunRow, TodayOp } from './backend';
import type { Route, RunMeta } from '../routes';
import { Aussendienst } from '../aussendienst/Aussendienst';
import { EinsatzCtx } from './context';

type Netz = 'an' | 'aus' | 'nein';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const USER = '00000000-0000-4000-8000-0000000000bb';

const prop = (n: number, name: string, address: string, active = true): Property => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  org_id: ORG,
  name,
  address,
  lat: 47.07 + n / 1000,
  lng: 15.44 + n / 1000,
  customer_name: null,
  customer_contact: null,
  areas: null,
  duty_times: {},
  notes: null,
  active,
  created_at: '2026-11-01T06:00:00.000Z',
});

const PROPS: Property[] = [
  prop(1, 'Wohnanlage Lindenhof', 'Lindenweg 4–8, 8010 Graz'),
  prop(2, 'Gemeindeamt', 'Hauptplatz 1, 8323 Pirching am Traubenberg'),
  prop(3, 'Volksschule', 'Schulgasse 12, 8323 Pirching am Traubenberg'),
  prop(4, 'Supermarkt-Parkplatz Nord mit sehr langem Namen zum Umbruch-Test', 'Industriestraße 77a, 8020 Graz'),
  prop(5, 'Altes Lager (pausiert)', 'Hafenstraße 3', false),
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function createBackend(netz: () => Netz, log: (line: string) => void): EinsatzBackend {
  const ops: TodayOp[] = [
    { id: 'demo-op-1', property_id: PROPS[1].id, started_at: new Date(Date.now() - 45 * 60000).toISOString(), canceled: false },
  ];
  const rows: OperationRow[] = [];
  const routes: (Route & { path: [number, number][] })[] = [
    {
      id: '00000000-0000-4000-8000-0000000000c1',
      org_id: ORG,
      name: 'Gehweg Hauptstraße',
      notes: 'beidseitig, inkl. Bushaltestelle',
      path: [[47.0712, 15.4412], [47.0718, 15.4425], [47.0726, 15.4431], [47.0733, 15.4452]],
      length_m: 420,
      source: 'recorded',
      property_ids: [],
      active: true,
      created_at: '2026-11-01T06:00:00.000Z',
    },
  ];
  const runs: RunMeta[] = [];
  const pro = () => new URLSearchParams(window.location.search).get('pro') !== '0' && sessionStorage.getItem('wd-demo-pro') !== '0';
  const gate = async () => {
    await sleep(350);
    if (netz() === 'aus') throw new TypeError('Failed to fetch');
  };
  return {
    async listProperties() {
      await gate();
      return PROPS;
    },
    async listTodayOps() {
      await gate();
      return ops;
    },
    async uploadPhoto(path, blob) {
      await gate();
      log(`Foto ${path} (${Math.round(blob.size / 1024)} KB, ${blob.type})`);
    },
    async insertOperation(row, photoUrls) {
      await gate();
      if (netz() === 'nein') throw Object.assign(new Error('new row violates row-level security policy for table "operation"'), { code: '42501' });
      if (rows.some((r) => r.id === row.id)) return;
      rows.push(row);
      ops.push({ id: row.id, property_id: row.property_id, started_at: row.started_at, canceled: false });
      log(`Einsatz ${JSON.stringify({ ...row, photo_urls: photoUrls })}`);
    },
    async listRoutes() {
      await gate();
      return routes.map(({ path: _p, ...r }) => r);
    },
    async getRoute(id) {
      await gate();
      return routes.find((r) => r.id === id) ?? null;
    },
    async saveRoute(row: RouteRow) {
      await gate();
      const i = routes.findIndex((r) => r.id === row.id);
      const full = { ...row, length_m: 400, created_at: new Date().toISOString() };
      if (i >= 0) routes[i] = { ...routes[i], ...full };
      else routes.push(full);
      log(`Strecke ${JSON.stringify({ ...row, path: `${row.path.length} Punkte` })}`);
    },
    async listTodayRuns() {
      await gate();
      return runs;
    },
    async listRouteRuns(routeId) {
      await gate();
      return runs.filter((r) => r.route_id === routeId);
    },
    async insertRun(row: RunRow, photoUrls) {
      await gate();
      if (netz() === 'nein') throw Object.assign(new Error('new row violates row-level security policy for table "route_run"'), { code: '42501' });
      if (runs.some((r) => r.id === row.id)) return;
      const { track, ...meta } = row;
      runs.unshift({ ...meta, route_name: routes.find((r) => r.id === row.route_id)?.name ?? null, canceled: false, cancel_reason: null, canceled_at: null, received_at: new Date().toISOString(), track_length_m: null, coverage_pct: row.route_id ? 87.5 : null, missed_m: null, entry_hash: 'demo' });
      log(`Fahrt ${JSON.stringify({ ...meta, track: track.map((s) => `${s.length} Punkte, erster ${JSON.stringify(s[0])}, letzter ${JSON.stringify(s[s.length - 1])}`), photo_urls: photoUrls })}`);
    },
    async isPro() {
      return pro();
    },
    async weather() {
      await sleep(600);
      if (netz() === 'aus') return { weather: null, netError: true };
      return { weather: { temp_c: -2.4, snowfall_cm: 1.2, precip_mm: 0.8, wind_kmh: 12, source: 'demo' }, netError: false };
    },
  };
}

export function EinsatzDemoArea({ app }: { app: AppConfig }) {
  const [netz, setNetz] = useState<Netz>(() => {
    const v = new URLSearchParams(window.location.search).get('netz');
    return v === 'aus' || v === 'nein' ? v : 'an';
  });
  const [log, setLog] = useState<string[]>([]);
  const netzRef = useMemo(() => ({ current: netz }), []); // eslint-disable-line react-hooks/exhaustive-deps
  netzRef.current = netz;
  const be = useMemo(
    () => createBackend(() => netzRef.current, (l) => setLog((prev) => [...prev, l])),
    [netzRef],
  );
  const base = `/app/${app.id}`;
  const value = useMemo(
    () => ({ be, userId: USER, orgId: ORG, base: `${base}/aussendienst`, propertiesUrl: `${base}/objekte`, dashboardUrl: base, owner: new URLSearchParams(window.location.search).get('rolle') !== 'mitarbeiter' }),
    [be, base],
  );
  const style = { '--accent': app.theme.accent, '--on-accent': app.theme.onAccent, '--bg': app.theme.bg } as React.CSSProperties;

  return (
    <div className="app-scope" style={style}>
      <header className="site-header">
        <span className="app-chip">{app.name} · Beispieldaten</span>
        <div className="spacer" />
        <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Server
          <select
            value={netz}
            onChange={(e) => setNetz(e.target.value as Netz)}
            style={{ width: 'auto', margin: 0, padding: '4px 8px' }}
            data-testid="demo-netz"
          >
            <option value="an">erreichbar</option>
            <option value="aus">kein Netz</option>
            <option value="nein">lehnt ab</option>
          </select>
        </label>
      </header>
      <EinsatzCtx.Provider value={value}>
        <Routes>
          <RouterRoute path="aussendienst/*" element={<Aussendienst />} />
          <RouterRoute path="*" element={<div className="page"><Link className="btn" to={`${base}/aussendienst`}>Zum Außendienst (Beispieldaten)</Link></div>} />
        </Routes>
      </EinsatzCtx.Provider>
      <pre data-testid="demo-log" style={{ margin: 16, fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--muted)' }}>
        {log.join('\n')}
      </pre>
    </div>
  );
}
