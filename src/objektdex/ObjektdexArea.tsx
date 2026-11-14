// ObjektDex-Bereich: Leistungsnachweis für Hausbetreuung, Grünpflege und Reinigung.
// Echter Betrieb: Anmeldung + Betrieb wie alle Dex-Apps (AppArea/OrgProvider), Daten über supabaseData.
// Ohne Supabase-Eintrag (Projekt noch nicht angelegt): im Dev-Server Beispieldaten, im Produktions-Build „noch nicht verbunden“.
import { lazy, Suspense, useMemo } from 'react';
import { Link, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { Building2, CheckCheck, FileDown, LayoutDashboard, Link2, ListChecks, TriangleAlert, Users, CreditCard } from 'lucide-react';
import { appIcon, type AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { AboPage } from '../components/AboPage';
import { OdProvider, useOd } from './context';
import { supabaseData } from './data';
import { parseRole } from './types';
import { Overview } from './pages/Overview';
import { Properties } from './pages/Properties';
import { PropertyDetail } from './pages/PropertyDetail';
import { Operations } from './pages/Operations';
import { Defects } from './pages/Defects';
import { SollIst } from './pages/SollIst';
import { Report } from './pages/Report';
import { Links } from './pages/Links';
import { Team } from './pages/Team';
import './objektdex.css';

// Beispieldaten nur im Dev-Server (lazy → nie im Produktions-Build)
const DemoArea = import.meta.env.DEV ? lazy(() => import('./DemoArea').then((m) => ({ default: m.DemoArea }))) : null;

function demoWanted(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('demo')) sessionStorage.setItem('od-demo', '1');
    return sessionStorage.getItem('od-demo') === '1';
  } catch {
    return new URLSearchParams(window.location.search).has('demo');
  }
}

export function ObjektdexArea({ app }: { app: AppConfig }) {
  // ?demo bleibt für die Sitzung gemerkt (Navigation im Bereich verliert die Abfrage sonst)
  const wantsDemo = demoWanted();
  if (DemoArea && (wantsDemo || !app.supabase)) {
    return (
      <Suspense fallback={<div className="empty"><span className="spinner" /></div>}>
        <DemoArea app={app} />
      </Suspense>
    );
  }
  if (!app.supabase) return <NotConnected app={app} />;
  return (
    <AppArea app={app}>
      <OrgProvider>
        <OrgGate>
          <LiveBridge>
            <OdRoutes />
          </LiveBridge>
        </OrgGate>
      </OrgProvider>
    </AppArea>
  );
}

/** Echter Betrieb: Supabase-Client + Betrieb/Rolle in den ObjektDex-Kontext übergeben. */
function LiveBridge({ children }: { children: React.ReactNode }) {
  const { client, app } = useAppAuth();
  const { data: org } = useOrg();
  const value = useMemo(
    () => ({
      data: supabaseData(client, org!.org.id),
      orgName: org!.org.name,
      role: parseRole(org!.role),
      demo: false,
      base: `/app/${app.id}`,
    }),
    [client, org, app.id],
  );
  return <OdProvider value={value}>{children}</OdProvider>;
}

export function OdRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="objekte" element={<Properties />} />
        <Route path="objekte/:id" element={<PropertyDetail />} />
        <Route path="einsaetze" element={<Operations />} />
        <Route path="maengel" element={<Defects />} />
        <Route path="soll-ist" element={<SollIst />} />
        <Route path="nachweis" element={<Report />} />
        <Route path="links" element={<Links />} />
        <Route path="team" element={<Team />} />
        <Route path="abo" element={<AboOrHint />} />
      </Route>
    </Routes>
  );
}

function AboOrHint() {
  const { demo } = useOd();
  return demo ? <div className="info-box">Abo-Anzeige gibt es nur mit echtem Konto (RevenueCat).</div> : <AboPage />;
}

function Shell() {
  const { base, orgName, role } = useOd();
  // Absolute Pfade: die Shell rendert in einer pfadlosen Layout-Route unter einer Splat-Route.
  return (
    <div className="app-shell od-scope">
      <nav className="app-nav">
        <NavLink to={base} end>
          <LayoutDashboard className="i" aria-hidden /> Heute
        </NavLink>
        <NavLink to={`${base}/objekte`}><Building2 className="i" aria-hidden /> Objekte</NavLink>
        <NavLink to={`${base}/einsaetze`}><CheckCheck className="i" aria-hidden /> Einsätze</NavLink>
        <NavLink to={`${base}/maengel`}><TriangleAlert className="i" aria-hidden /> Mängel</NavLink>
        <NavLink to={`${base}/soll-ist`}><ListChecks className="i" aria-hidden /> Soll/Ist</NavLink>
        <NavLink to={`${base}/nachweis`}><FileDown className="i" aria-hidden /> Nachweis-PDF</NavLink>
        {role === 'owner' && <NavLink to={`${base}/links`}><Link2 className="i" aria-hidden /> Auftraggeber-Links</NavLink>}
        <NavLink to={`${base}/team`}><Users className="i" aria-hidden /> Team</NavLink>
        <NavLink to={`${base}/abo`}><CreditCard className="i" aria-hidden /> Abo</NavLink>
        <div className="nav-footer">
          <b>{orgName}</b>
          <br />
          Rolle: {role === 'owner' ? 'Inhaber' : role === 'admin' ? 'Verwalter' : 'Mitarbeiter'}
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

function NotConnected({ app }: { app: AppConfig }) {
  return (
    <div className="app-scope" style={{ '--accent': app.theme.accent, '--on-accent': app.theme.onAccent, '--bg': app.theme.bg } as React.CSSProperties}>
      <header className="site-header">
        <Link className="brand" to="/">
          <img src="/dexware.webp" alt="" width="28" height="28" />
          <span className="wm">
            Dex<span>ware</span>
          </span>
        </Link>
        <span className="header-sep" aria-hidden />
        <span className="app-chip">
          <img src={appIcon(app.id)} alt="" width="24" height="24" />
          {app.name}
        </span>
      </header>
      <div className="page">
        <div className="info-box">
          Das {app.name}-Dashboard ist noch nicht verbunden. Sobald die App startet, siehst du hier Heute, Objekte,
          Einsätze, Mängel und Soll/Ist deines Betriebs.
        </div>
      </div>
    </div>
  );
}
