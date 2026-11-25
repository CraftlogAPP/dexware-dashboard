// „Einsatz erfassen“ mit Beispieldaten — NUR im Dev-Server (/app/winterdex/einsatz?demo), fehlt im
// Produktions-Build (siehe WinterdexArea). Damit lässt sich der ganze Ablauf ohne Konto prüfen:
//   ?demo            normaler Ablauf (Speichern klappt)
//   ?demo&netz=aus   Server nicht erreichbar → Einsatz bleibt auf dem Gerät („wartet“)
//   ?demo&netz=nein  Server lehnt ab → „vom Server nicht angenommen“
// Der Schalter lässt sich im Banner oben umstellen (Nachsenden testen).
import { useMemo, useState } from 'react';
import { Link, Route as RouterRoute, Routes, useParams } from 'react-router-dom';
import { RunView } from '../pages/RunDetail';
import { DEMO_FAHRTEN, demoRun, demoStrassen } from './demoFahrt';
import { strassenStandAus } from '../strassen';
import { ProUnklarError } from '../pro';
import { buildRouteLogHtmlMitDetails, type FahrtenLader } from '../routeReport';
import { openReportWindowAfter } from '../../lib/print';
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
  prop(1, 'Wohnanlage Lindenhof', 'Lindenweg 4–8, 8010 Musterstadt'),
  prop(2, 'Rathaus', 'Hauptplatz 1, 8010 Musterstadt'),
  prop(3, 'Volksschule', 'Schulgasse 12, 8010 Musterstadt'),
  prop(4, 'Supermarkt-Parkplatz Nord', 'Industriestraße 77a, 8010 Musterstadt'),
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
      // ?strecke=pausiert: Strecke pausiert (Wieder-Aktivieren gegen die Gratis-Grenze testen)
      active: new URLSearchParams(window.location.search).get('strecke') !== 'pausiert',
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
      // ?mitfahrt: die Beispiel-Fahrt „mit Vorlage“ als letzte Fahrt dieser Strecke (Karte + Straßenverlauf testen)
      const beispiel = new URLSearchParams(window.location.search).has('mitfahrt') ? demoRun('demo-vorlage') : null;
      const extra = beispiel && beispiel.route_id === routeId ? [{ ...beispiel, id: 'demo-vorlage' }] : [];
      return [...runs.filter((r) => r.route_id === routeId), ...extra];
    },
    async getRun(id) {
      await gate();
      return demoRun(id);
    },
    async getStrassen(id) {
      const s = new URLSearchParams(window.location.search).get('strassen') === 'ermittelt' ? null : demoStrassen(id);
      return s ? strassenStandAus(s) : strassenStandAus(null);
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
      // ?pro=unklar: Abo-Dienst gestört, kein letzter sicherer Stand (wie orgProFuerGrenze → ProUnklarError)
      if (new URLSearchParams(window.location.search).get('pro') === 'unklar') throw new ProUnklarError();
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
        <label className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <select
            aria-label="Server (Beispieldaten)"
            value={netz}
            onChange={(e) => setNetz(e.target.value as Netz)}
            style={{ width: 'auto', maxWidth: 130, margin: 0, padding: '4px 8px' }}
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
          {/* Fahrt-Ansicht (Karte + Zeitleiste) mit erfundenen Fahrten: Handy-Rahmen bzw. Dashboard-Rahmen */}
          <RouterRoute path="aussendienst/strecken/fahrten/:id" element={<div className="ad"><main className="ad-main"><DemoFahrt /></main></div>} />
          <RouterRoute path="fahrten-demo" element={<DemoFahrtenListe base={base} />} />
          <RouterRoute path="fahrten-demo/:id" element={<div className="app-shell"><main className="app-main"><DemoFahrt /></main></div>} />
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

const DEMO_ORG = { id: ORG, name: 'Bauhof Musterstadt (Beispiel)', land: 'AT' as const, address: 'Hauptplatz 1, 8010 Musterstadt', created_at: '2026-11-01T06:00:00.000Z' };

/** Eine erfundene Fahrt in der echten Fahrt-Ansicht (Karte, Regler, Zeitleiste, PDF) — /…/fahrten-demo/<id> */
function DemoFahrt() {
  const { id = '' } = useParams();
  const run = useMemo(() => demoRun(id), [id]);
  // Straßenverlauf wie aus der Datenbank (auch die kaputten Einträge der Form „kaputt“ gehen durch die Säuberung);
  // ?strassen=ermittelt zeigt jede Fahrt im Zustand „wird ermittelt“; ?strassen=spaeter ebenso, aber der „Server“ ist
  // inzwischen fertig (PDF-Knopf lädt frisch); ?meter=alt = Meter wie der alte Worker (~20 % zu wenig)
  const q = new URLSearchParams(window.location.search);
  const art = q.get('strassen');
  const meterAlt = q.get('meter') === 'alt';
  const fertig = useMemo(() => {
    const s = demoStrassen(id, { meterAlt });
    return s ? strassenStandAus(s) : null;
  }, [id, meterAlt]);
  const strassen = art === 'ermittelt' || art === 'spaeter' ? strassenStandAus(null) : fertig;
  if (!run) return <div className="error-box">Unbekannte Beispiel-Fahrt „{id}“.</div>;
  return (
    <RunView
      run={run}
      strassen={strassen}
      org={DEMO_ORG}
      pro
      ladeStrassen={art === 'ermittelt' ? async () => strassenStandAus(null) : async () => fertig}
      canCancel={!run.canceled}
      onCancel={async () => undefined}
    />
  );
}

/**
 * Fahrtenbuch (Sammel-Nachweis) mit den Beispiel-Fahrten: alle Formen bzw. ?buch=viele (120 Fahrten → ohne Kartenbilder).
 * Gleiche Funktion wie das Dashboard (buildRouteLogHtmlMitDetails), nur mit erfundenen Daten.
 */
function demoFahrtenbuch(): Promise<boolean> {
  const viele = new URLSearchParams(window.location.search).get('buch') === 'viele';
  const formen = DEMO_FAHRTEN.map((f) => f.id);
  const ids = viele ? Array.from({ length: 120 }, (_, i) => `${formen[i % 2 === 0 ? 0 : 1]}#${i}`) : formen;
  const basis = (id: string) => id.split('#')[0];
  const runs: RunMeta[] = ids.map((id) => ({ ...(demoRun(basis(id)) as RunMeta), id })).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const route: Route = {
    id: '00000000-0000-4000-8000-0000000000c1',
    org_id: ORG,
    name: 'Ortskern Runde (Beispiel)',
    notes: null,
    path: demoRun('demo-vorlage')?.planned_path ?? [],
    length_m: 7800,
    source: 'recorded',
    property_ids: [],
    active: true,
    created_at: '2026-11-01T06:00:00.000Z',
  };
  const lader: FahrtenLader = {
    async spuren(liste) {
      return new Map(liste.map((id) => [id, demoRun(basis(id))!] as const).filter(([, r]) => !!r));
    },
    async strassen(liste) {
      return new Map(liste.map((id) => [id, strassenStandAus(demoStrassen(basis(id)))] as const));
    },
  };
  return openReportWindowAfter(() => buildRouteLogHtmlMitDetails(DEMO_ORG, route, runs, '20.10.2026 – 25.11.2026 (Beispiel)', lader));
}

function DemoFahrtenListe({ base }: { base: string }) {
  const [fehler, setFehler] = useState<string | null>(null);
  return (
    <div className="page">
      <h1>Beispiel-Fahrten</h1>
      <ul>
        {DEMO_FAHRTEN.map((f) => (
          <li key={f.id}>
            {f.titel}: <Link to={`${base}/fahrten-demo/${f.id}`}>Dashboard</Link> ·{' '}
            <Link to={`${base}/aussendienst/strecken/fahrten/${f.id}`}>Außendienst</Link>
          </li>
        ))}
      </ul>
      <p>
        <button
          type="button"
          className="btn"
          data-testid="demo-fahrtenbuch"
          onClick={() => {
            setFehler(null);
            demoFahrtenbuch()
              .then((ok) => !ok && setFehler('Druckfenster blockiert'))
              .catch((e) => setFehler(String(e)));
          }}
        >
          Fahrtenbuch-PDF (Sammel-Nachweis) aller Beispiel-Fahrten
        </button>{' '}
        <Link to={`${base}/aussendienst/strecken/00000000-0000-4000-8000-0000000000c1?demo&mitfahrt`}>Strecke mit letzter Fahrt (Außendienst)</Link>
      </p>
      {fehler && <div className="error-box">{fehler}</div>}
    </div>
  );
}
