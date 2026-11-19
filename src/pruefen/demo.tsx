// „Vor Ort“ mit Beispieldaten — NUR im Dev-Server (/app/<app>/vor-ort?demo), fehlt im Produktions-Build
// (siehe LeiterdexArea). Damit lässt sich der ganze Ablauf ohne Konto prüfen:
//   ?demo              normaler Ablauf (Speichern klappt)
//   ?demo&netz=aus     Server nicht erreichbar → Prüfung bleibt auf dem Gerät („wartet“)
//   ?demo&netz=teil    Netz bricht nach der Prüfung ab → Prüfung übertragen, Mängel warten
//   ?demo&netz=nein    Server lehnt ab → „vom Server nicht angenommen“
//   &rolle=mitarbeiter Ansicht eines Mitarbeiters · &pro=0 Gratis-Paket
// Der Schalter lässt sich im Banner oben umstellen (Nachsenden testen). Unten steht mit, was „gesendet“ wurde.
// Orts-Modus (GerüstDex, RegalDex, SpielDex): Die Prüf-Daten hängen am Ort, Mängel nennen eine Einheit oder keine.
import { useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../apps/registry';
import type { OpenDefect, PruefBackend, Site, Unit } from './backend';
import { dueFkOf, inspectionsPathOf, isSiteMode, needsUnitRow, siteFkOf, sitesPathOf, wordsOf, type PruefConfig } from './config';
import { PruefCtx, type PruefCtxValue, type VorOrtPages } from './context';
import type { InspMeta } from './due';
import { VOR_ORT_PATH } from './Scope';
import { VorOrt } from './VorOrt';

type Netz = 'an' | 'aus' | 'teil' | 'nein';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const USER = '00000000-0000-4000-8000-0000000000bb';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function createBackend(
  cfg: PruefConfig,
  netz: () => Netz,
  log: (line: string) => void,
  rows: Record<string, unknown>[],
): PruefBackend {
  const U = cfg.labels.unit;
  const siteMode = isSiteMode(cfg);
  const dueFk = dueFkOf(cfg);
  const sites: Site[] = [
    { id: uuid(1), name: 'Werkstatt Nord', address: 'Industriestraße 12, 8010 Musterstadt', active: true },
    { id: uuid(2), name: 'Lager Süd', address: 'Hafenweg 3, 8010 Musterstadt', active: true },
    { id: uuid(3), name: 'Altes Büro (pausiert)', address: 'Gartenweg 1', active: false },
  ];
  // Die ersten Einheiten kommen aus den Beispiel-Stammdaten der App (falls mitgegeben) — so sieht man die echte
  // Unterzeile und, wo es sie gibt, die Einheiten-Warnung (z. B. GurtDex: ablegereif).
  const unit = (n: number, site: number, name: string, info: string, retired = false): Unit => {
    const row = rows[n - 1];
    return {
      id: uuid(100 + n),
      siteId: uuid(site),
      name: row ? String(row.name) : name,
      info: row ? cfg.unitInfo(row) : info,
      retired,
      ...(row && needsUnitRow(cfg) ? { row } : {}),
    };
  };
  const units: Unit[] = [
    unit(1, 1, `${U.one} 001`, 'Beispiel A'),
    unit(2, 1, `${U.one} 002`, 'Beispiel B'),
    unit(3, 1, `${U.one} 003`, 'Beispiel A'),
    unit(4, 1, `${U.one} 004`, 'Beispiel C'),
    unit(5, 1, `${U.one} 005`, 'Beispiel B'),
    unit(6, 1, `${U.one} 006`, 'Beispiel A'),
    unit(7, 1, `${U.one} 007`, 'Beispiel C'),
    unit(8, 1, `${U.one} 008 (alt)`, 'Beispiel A', true),
    unit(9, 2, `${U.one} 101`, 'Beispiel B'),
  ];
  // Orts-Modus: Ort 1 vor 10 Tagen geprüft (mit offener Sperre an Einheit 4), Ort 2 noch nie.
  const meta: InspMeta[] = siteMode
    ? [{ unitId: uuid(1), type: cfg.dueKind, startedAt: daysAgo(10), canceled: false }]
    : [
        { unitId: uuid(101), type: cfg.dueKind, startedAt: daysAgo(40), canceled: false },
        { unitId: uuid(102), type: cfg.dueKind, startedAt: daysAgo(350), canceled: false },
        { unitId: uuid(103), type: cfg.dueKind, startedAt: daysAgo(400), canceled: false },
        { unitId: uuid(104), type: cfg.dueKind, startedAt: daysAgo(10), canceled: false },
        { unitId: uuid(109), type: cfg.dueKind, startedAt: daysAgo(100), canceled: false },
      ];
  const defects: OpenDefect[] = [
    { id: uuid(900), siteId: uuid(1), unitId: uuid(104), severity: cfg.severities[cfg.severities.length - 1].id, blocked: true },
  ];
  // Apps mit Messwerten: was zuletzt je Einheit gemessen wurde (Vorbelegung der Neumaße beim nächsten Mal)
  const lastMeasured = new Map<string, Record<string, string>>();
  const inspectionIds = new Set<string>();
  const defectIds = new Set<string>();
  const pro = () => new URLSearchParams(window.location.search).get('pro') !== '0';
  const gate = async () => {
    await sleep(350);
    if (netz() === 'aus') throw new TypeError('Failed to fetch');
  };
  const reject = (table: string) =>
    Object.assign(new Error(`new row violates row-level security policy for table "${table}"`), { code: '42501' });
  return {
    async listSites() {
      await gate();
      return sites;
    },
    async listUnits() {
      await gate();
      return units;
    },
    async listInspectionMeta() {
      await gate();
      return [...meta];
    },
    async listOpenDefects() {
      await gate();
      return [...defects];
    },
    async uploadPhoto(path, blob) {
      await gate();
      log(`Foto ${path} (${Math.round(blob.size / 1024)} KB, ${blob.type})`);
    },
    async insertInspection(row, photoUrls) {
      await gate();
      if (netz() === 'nein') throw reject(cfg.tables.inspection);
      if (inspectionIds.has(row.id)) {
        log(`Prüfung ${row.id} gibt es schon (Wiederholung) — nichts doppelt`);
        return { signatureDropped: false };
      }
      inspectionIds.add(row.id);
      if (row.measurements) lastMeasured.set(String(row[dueFk]), row.measurements);
      meta.push({ unitId: String(row[dueFk]), type: row.type, startedAt: row.started_at, canceled: false });
      const { signature, ...rest } = row;
      log(
        `Prüfung ${JSON.stringify({ ...rest, signature: signature ? `${signature.slice(0, 22)}… (${Math.round(signature.length / 1024)} KB)` : undefined, photo_urls: photoUrls })}`,
      );
      return { signatureDropped: false };
    },
    async insertDefect(row, photoUrls) {
      await gate();
      if (netz() === 'teil') throw new TypeError('Failed to fetch');
      if (netz() === 'nein') throw reject(cfg.tables.defect);
      if (defectIds.has(row.id)) {
        log(`Mangel ${row.id} gibt es schon (Wiederholung) — nichts doppelt`);
        return;
      }
      defectIds.add(row.id);
      const unitId = row[cfg.cols.unitFk];
      defects.push({
        id: row.id,
        siteId: String(row[siteFkOf(cfg)]),
        unitId: typeof unitId === 'string' ? unitId : null,
        severity: row.severity,
        blocked: row[cfg.cols.blocked] === true,
      });
      log(`Mangel ${JSON.stringify({ ...row, photo_urls: photoUrls })}`);
    },
    async isPro() {
      return pro();
    },
    ...(cfg.measure
      ? {
          async lastMeasurements(unitId: string) {
            await gate();
            return lastMeasured.get(unitId) ?? null;
          },
        }
      : {}),
  };
}

function Stub({ title, back }: { title: string; back?: string }) {
  return (
    <>
      {back && (
        <p className="small" style={{ marginBottom: 4 }}>
          {/* relativer Link wie auf den echten Dashboard-Seiten — muss im Handy-Rahmen bleiben */}
          <Link to={back}>← Zurück</Link>
        </p>
      )}
      <h1>{title}</h1>
      <div className="card empty">
        In den Beispieldaten nicht enthalten — angemeldet erscheint hier die Seite aus dem Dashboard.
      </div>
    </>
  );
}

/** Platzhalter-Seiten mit den Bezeichnungen und Unterpfaden der App (wie die echten Dashboard-Seiten verlinkt). */
function demoPages(cfg: PruefConfig): VorOrtPages {
  const W = wordsOf(cfg);
  const S = cfg.labels.site;
  return {
    inspections: (
      <>
        <Stub title={W.insp.many} />
        <p className="small">
          <Link to="beispiel">Beispiel öffnen ({W.insp.one})</Link>
        </p>
      </>
    ),
    inspectionDetail: <Stub title={W.insp.one} back={`../${inspectionsPathOf(cfg)}`} />,
    defects: <Stub title={W.defect.many} />,
    sites: <Stub title={`${S.many} verwalten`} />,
    siteDetail: <Stub title={S.one} back={`../${sitesPathOf(cfg)}`} />,
    report: <Stub title={cfg.labels.report ?? 'Prüfbericht-PDF'} />,
    team: <Stub title="Team" />,
    abo: <Stub title="Abo" />,
  };
}

const NO_ROWS: Record<string, unknown>[] = [];

/**
 * @param rows Beispiel-Stammdaten der App (Spalten wie cfg.unitSelect) für die ersten Einheiten — optional.
 */
export function VorOrtDemoArea({ app, cfg, rows = NO_ROWS }: { app: AppConfig; cfg: PruefConfig; rows?: Record<string, unknown>[] }) {
  const [netz, setNetz] = useState<Netz>(() => {
    const v = new URLSearchParams(window.location.search).get('netz');
    return v === 'aus' || v === 'nein' || v === 'teil' ? v : 'an';
  });
  const [log, setLog] = useState<string[]>([]);
  const netzRef = useMemo(() => ({ current: netz }), []); // eslint-disable-line react-hooks/exhaustive-deps
  netzRef.current = netz;
  const be = useMemo(
    () => createBackend(cfg, () => netzRef.current, (l) => setLog((prev) => [...prev, l]), rows),
    [cfg, netzRef, rows],
  );
  const base = `/app/${app.id}`;
  const pages = useMemo(() => demoPages(cfg), [cfg]);
  const value = useMemo<PruefCtxValue>(
    () => ({
      cfg,
      be,
      userId: USER,
      orgId: ORG,
      orgName: 'Beispielbetrieb',
      email: 'beispiel@example.com',
      owner: new URLSearchParams(window.location.search).get('rolle') !== 'mitarbeiter',
      intervalDays: cfg.dueIntervalDays({}),
      ...(cfg.dueDate ? { dueDate: (last: Date) => cfg.dueDate!(last, {}) } : {}),
      base: `${base}/${VOR_ORT_PATH}`,
      dashboardUrl: base,
      signOut: () => undefined,
    }),
    [cfg, be, base],
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
            <option value="teil">Netz weg nach Prüfung</option>
            <option value="nein">lehnt ab</option>
          </select>
        </label>
      </header>
      <PruefCtx.Provider value={value}>
        <Routes>
          <Route path={`${VOR_ORT_PATH}/*`} element={<VorOrt pages={pages} />} />
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
      </PruefCtx.Provider>
      <pre data-testid="demo-log" style={{ margin: '16px 16px 120px', fontSize: 11, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--muted)' }}>
        {log.join('\n')}
      </pre>
    </div>
  );
}
