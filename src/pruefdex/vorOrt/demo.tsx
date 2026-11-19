// „Vor Ort“ (PrüfDex) mit Beispieldaten — NUR im Dev-Server (/app/pruefdex/vor-ort?demo), fehlt im Produktions-Build
// (siehe PruefdexArea). Damit lässt sich der ganze Ablauf ohne Konto prüfen:
//   ?demo              normaler Ablauf (Speichern klappt)
//   ?demo&netz=aus     Server nicht erreichbar → Prüfung bleibt auf dem Gerät („wartet“)
//   ?demo&netz=nein    Server lehnt ab → „vom Server nicht angenommen“
//   ?demo&pro=0        Gratis-Betrieb: nach 5 Prüfungen (4 gibt es schon) greift die Gratis-Grenze
// Der Schalter lässt sich im Banner oben umstellen (Nachsenden testen). Unten steht mit, was „gesendet“ wurde.
import { useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../../apps/registry';
import { VOR_ORT_PATH } from '../../pruefen/Scope';
import type { Customer, Device } from '../types';
import type { PdBackend } from './backend';
import { PdCtx, type PdCtxValue } from './context';
import { PdVorOrt, type PdVorOrtPages } from './PdVorOrt';
import { FREE_LIMITS } from './rows';

type Netz = 'an' | 'aus' | 'nein';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const USER = '00000000-0000-4000-8000-0000000000bb';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Tag in n Tagen (negativ = Vergangenheit) als YYYY-MM-DD (lokal) */
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const NOW = new Date().toISOString();

function createBackend(netz: () => Netz, log: (line: string) => void): PdBackend {
  const c = (n: number, name: string, address: string | null): Customer => ({ id: uuid(100 + n), org_id: ORG, name, address, contact: null, created_at: NOW });
  const customers = [c(1, 'Tischlerei Huber', 'Hauptstraße 12, 8200 Gleisdorf'), c(2, 'Kindergarten Sonnenschein', 'Schulgasse 3, 8160 Weiz')];
  const d = (
    n: number,
    name: string,
    sk: Device['protection_class'],
    customer: number | null,
    due: string | null,
    extra: Partial<Device> = {},
  ): Device => ({
    id: uuid(200 + n),
    org_id: ORG,
    customer_id: customer ? uuid(100 + customer) : null,
    qr_code: `PD-${String(n).padStart(4, '0')}`,
    name,
    device_type: null,
    manufacturer: null,
    serial_number: null,
    protection_class: sk,
    location_note: null,
    interval_months: 12,
    next_due_date: due,
    retired: false,
    retired_at: null,
    created_at: NOW,
    ...extra,
  });
  const devices: Device[] = [
    d(1, 'Bohrhammer GBH 2-28', 'II', 1, inDays(-40), { manufacturer: 'Bosch', device_type: 'Handwerkzeug', location_note: 'Werkstatt Regal 3' }),
    d(2, 'Kabeltrommel 25 m', 'I', 1, inDays(12), { device_type: 'Verlängerung', interval_months: 6 }),
    d(3, 'Tischkreissäge', 'I', 1, null, { manufacturer: 'Metabo' }),
    d(4, 'Ladegerät Akku 18 V', 'III', 1, inDays(200)),
    d(5, 'Wasserkocher Küche', 'I', 2, inDays(-3), { location_note: 'Teeküche' }),
    d(6, 'Staubsauger', 'II', 2, inDays(300)),
    d(7, 'Heizlüfter (Schutzklasse unbekannt)', null, 2, null),
    d(8, 'Baustrahler LED', 'I', null, inDays(25)),
  ];
  const failed = new Set<string>([uuid(205)]);
  const ids = new Set<string>();
  const BEFORE = 4; // so viele Prüfungen „gibt es schon“ (für die Gratis-Grenze)
  const gate = async () => {
    await sleep(350);
    if (netz() === 'aus') throw new TypeError('Failed to fetch');
  };
  return {
    async load() {
      await gate();
      return { customers: customers.map((x) => ({ ...x })), devices: devices.map((x) => ({ ...x })), failed: [...failed] };
    },
    async uploadPhoto(path, blob) {
      await gate();
      log(`Foto ${path} (${Math.round(blob.size / 1024)} kB)`);
    },
    async insertInspection(row, photoUrls) {
      await gate();
      if (netz() === 'nein') throw Object.assign(new Error('new row violates row-level security policy for table "inspection"'), { code: '42501' });
      if (ids.has(row.id)) {
        log(`Prüfung ${row.id} gibt es schon (Wiederholung) — nichts doppelt`);
        return { signatureDropped: false, gpsDropped: false };
      }
      ids.add(row.id);
      // wie der Server-Trigger: Frist am Gerät fortschreiben
      const dev = devices.find((x) => x.id === row.device_id);
      if (dev) dev.next_due_date = row.next_due_date;
      if (row.result === 'failed') failed.add(row.device_id);
      else failed.delete(row.device_id);
      log(`inspection ${JSON.stringify({ ...row, signature: row.signature ? `PNG (${row.signature.length} Zeichen)` : undefined, photo_urls: photoUrls.map((u) => (u.startsWith('data:') ? 'eingebettet' : u)) })}`);
      return { signatureDropped: false, gpsDropped: false };
    },
    async inspectionGate(waiting) {
      const pro = new URLSearchParams(window.location.search).get('pro') !== '0' && sessionStorage.getItem('pd-demo-pro') !== '0';
      const count = BEFORE + ids.size + waiting;
      return { allowed: pro || count < FREE_LIMITS.inspections, count, limit: FREE_LIMITS.inspections };
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

const PAGES: PdVorOrtPages = {
  devices: <Stub title="Geräte verwalten" />,
  deviceDetail: <Stub title="Gerät" back="../geraete" />,
  customers: <Stub title="Kunden verwalten" />,
  inspections: <Stub title="Prüfungen" />,
  inspectionDetail: <Stub title="Prüfung" back="../pruefungen" />,
  report: <Stub title="Sammelbericht" />,
  abo: <Stub title="Abo" />,
};

export function PdVorOrtDemoArea({ app }: { app: AppConfig }) {
  const [netz, setNetz] = useState<Netz>(() => {
    const p = new URLSearchParams(window.location.search);
    // „pro=0“ über die ganze Sitzung merken (die Adresse verliert den Zusatz beim ersten Klick)
    if (p.has('pro')) sessionStorage.setItem('pd-demo-pro', p.get('pro') ?? '');
    const v = p.get('netz');
    return v === 'aus' || v === 'nein' ? v : 'an';
  });
  const [log, setLog] = useState<string[]>([]);
  const netzRef = useMemo(() => ({ current: netz }), []); // eslint-disable-line react-hooks/exhaustive-deps
  netzRef.current = netz;
  const be = useMemo(() => createBackend(() => netzRef.current, (l) => setLog((prev) => [...prev, l])), [netzRef]);
  const base = `/app/${app.id}`;
  const value = useMemo<PdCtxValue>(
    () => ({
      be,
      userId: USER,
      orgId: ORG,
      orgName: 'Beispielbetrieb',
      email: 'beispiel@example.com',
      orgInspector: 'Erika Beispiel',
      owner: true,
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
            <option value="nein">lehnt ab</option>
          </select>
        </label>
      </header>
      <PdCtx.Provider value={value}>
        <Routes>
          <Route path={`${VOR_ORT_PATH}/*`} element={<PdVorOrt pages={PAGES} />} />
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
      </PdCtx.Provider>
      <pre data-testid="demo-log" style={{ margin: '16px 16px 120px', fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--muted)' }}>
        {log.join('\n')}
      </pre>
    </div>
  );
}

