// „Vor Ort“ (KfzDex) mit Beispieldaten — NUR im Dev-Server (/app/kfzdex/vor-ort?demo), fehlt im Produktions-Build
// (siehe KfzdexArea). Damit lässt sich der ganze Ablauf ohne Konto prüfen:
//   ?demo              normaler Ablauf (Speichern klappt)
//   ?demo&netz=aus     Server nicht erreichbar → Nachweis bleibt auf dem Gerät („wartet“)
//   ?demo&netz=teil    Netz bricht nach dem Nachweis ab → Nachweis übertragen, die Frist wartet
//   ?demo&netz=nein    Server lehnt ab → „vom Server nicht angenommen“
// Der Schalter lässt sich im Banner oben umstellen (Nachsenden testen). Unten steht mit, was „gesendet“ wurde.
import { useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../../apps/registry';
import { VOR_ORT_PATH } from '../../pruefen/Scope';
import type { Driver, Vehicle } from '../types';
import type { KfzBackend } from './backend';
import { KfzCtx, type KfzCtxValue } from './context';
import { KfzVorOrt, type KfzVorOrtPages } from './KfzVorOrt';
import { todayIso } from './rows';

type Netz = 'an' | 'aus' | 'teil' | 'nein';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const USER = '00000000-0000-4000-8000-0000000000bb';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Tag vor n Tagen als YYYY-MM-DD (lokal) */
const daysAgo = (n: number) => todayIso(new Date(Date.now() - n * 86_400_000));
const NOW = new Date().toISOString();

function createBackend(netz: () => Netz, log: (line: string) => void): KfzBackend {
  const v = (n: number, plate: string, name: string | null, type: Vehicle['type'], last: string | null): Vehicle => ({
    id: uuid(100 + n), org_id: ORG, plate, name, type, first_registration: null, last_uvv: last, created_at: NOW, updated_at: NOW,
  });
  const d = (n: number, name: string, classes: string | null, months: number, last: string | null, active = true): Driver => ({
    id: uuid(200 + n), org_id: ORG, name, license_classes: classes, check_interval_months: months, last_check: last, active, created_at: NOW, updated_at: NOW,
  });
  const vehicles: Vehicle[] = [
    v(1, 'W-12345X', 'Sprinter Bau 1', 'transporter', daysAgo(400)),
    v(2, 'G-BAU 77', 'Kipper', 'lkw', daysAgo(350)),
    v(3, 'GU-123 AB', null, 'pkw', daysAgo(40)),
    v(4, 'STAPLER 2', 'Halle Nord', 'stapler', null),
  ];
  const drivers: Driver[] = [
    d(1, 'Max Huber', 'B, BE, C1', 6, daysAgo(200)),
    d(2, 'Anna Steiner', 'B', 6, daysAgo(170)),
    d(3, 'Jonas Gruber', 'B, C', 12, null),
    d(4, 'Peter Alt (ausgeschieden)', 'B', 6, daysAgo(500), false),
  ];
  const ids = new Set<string>();
  const gate = async () => {
    await sleep(350);
    if (netz() === 'aus') throw new TypeError('Failed to fetch');
  };
  return {
    async loadFleet() {
      await gate();
      return { vehicles: vehicles.map((x) => ({ ...x })), drivers: drivers.map((x) => ({ ...x })) };
    },
    async insertProof(kind, row) {
      await gate();
      if (netz() === 'nein') {
        throw Object.assign(new Error(`new row violates row-level security policy for table "${kind === 'uvv' ? 'uvv_inspection' : 'license_check'}"`), { code: '42501' });
      }
      if (ids.has(row.id)) return log(`Nachweis ${row.id} gibt es schon (Wiederholung) — nichts doppelt`);
      ids.add(row.id);
      log(`${kind === 'uvv' ? 'uvv_inspection' : 'license_check'} ${JSON.stringify(row)}`);
    },
    async bumpDue(b) {
      await gate();
      if (netz() === 'teil') throw new TypeError('Failed to fetch');
      if (b.table === 'vehicle') {
        const x = vehicles.find((y) => y.id === b.id);
        if (x && (!x.last_uvv || x.last_uvv < b.date)) x.last_uvv = b.date;
      } else {
        const x = drivers.find((y) => y.id === b.id);
        if (x && (!x.last_check || x.last_check < b.date)) x.last_check = b.date;
      }
      log(`Frist ${b.table}.${b.col} = ${b.date} (nur vorziehen) für ${b.id}`);
    },
    async isPro() {
      return new URLSearchParams(window.location.search).get('pro') !== '0';
    },
  };
}

function Stub({ title, back }: { title: string; back?: string }) {
  return (
    <>
      {back && (
        <p className="small" style={{ marginBottom: 4 }}>
          <Link to={back}>← Zurück</Link>
        </p>
      )}
      <h1>{title}</h1>
      <div className="card empty">In den Beispieldaten nicht enthalten — angemeldet erscheint hier die Seite aus dem Dashboard.</div>
    </>
  );
}

const PAGES: KfzVorOrtPages = {
  vehicles: <Stub title="Fahrzeuge verwalten" />,
  vehicleDetail: <Stub title="Fahrzeug" back="../fahrzeuge" />,
  drivers: <Stub title="Fahrer verwalten" />,
  driverDetail: <Stub title="Fahrer" back="../fahrer" />,
  team: <Stub title="Team" />,
  abo: <Stub title="Abo" />,
};

export function KfzVorOrtDemoArea({ app }: { app: AppConfig }) {
  const [netz, setNetz] = useState<Netz>(() => {
    const v = new URLSearchParams(window.location.search).get('netz');
    return v === 'aus' || v === 'nein' || v === 'teil' ? v : 'an';
  });
  const [log, setLog] = useState<string[]>([]);
  const netzRef = useMemo(() => ({ current: netz }), []); // eslint-disable-line react-hooks/exhaustive-deps
  netzRef.current = netz;
  const be = useMemo(() => createBackend(() => netzRef.current, (l) => setLog((prev) => [...prev, l])), [netzRef]);
  const base = `/app/${app.id}`;
  const value = useMemo<KfzCtxValue>(
    () => ({
      be,
      userId: USER,
      orgId: ORG,
      orgName: 'Beispielbetrieb',
      email: 'beispiel@example.com',
      owner: new URLSearchParams(window.location.search).get('rolle') !== 'mitarbeiter',
      base: `${base}/${VOR_ORT_PATH}`,
      dashboardUrl: base,
      signOut: () => undefined,
    }),
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
            <option value="teil">Netz weg nach Nachweis</option>
            <option value="nein">lehnt ab</option>
          </select>
        </label>
      </header>
      <KfzCtx.Provider value={value}>
        <Routes>
          <Route path={`${VOR_ORT_PATH}/*`} element={<KfzVorOrt pages={PAGES} />} />
          <Route
            path="*"
            element={
              <div className="page">
                <Link className="btn" to={`${base}/${VOR_ORT_PATH}`}>
                  Zu „Vor Ort“ (Beispieldaten)
                </Link>
              </div>
            }
          />
        </Routes>
      </KfzCtx.Provider>
      <pre data-testid="demo-log" style={{ margin: '16px 16px 120px', fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--muted)' }}>
        {log.join('\n')}
      </pre>
    </div>
  );
}
