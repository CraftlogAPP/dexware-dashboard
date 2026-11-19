import { lazy } from 'react';
import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { Building2, ClipboardCheck, CreditCard, FileDown, LayoutDashboard, TriangleAlert, Users } from 'lucide-react';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { TeamPage } from '../components/TeamPage';
import { AboPage } from '../components/AboPage';
import { Overview } from './pages/Overview';
import { Sites } from './pages/Sites';
import { SiteDetail } from './pages/SiteDetail';
import { Inspections } from './pages/Inspections';
import { InspectionDetail } from './pages/InspectionDetail';
import { Defects } from './pages/Defects';
import { Report } from './pages/Report';
import { VorOrt } from '../pruefen/VorOrt';
import { VOR_ORT_PATH, VorOrtScope } from '../pruefen/Scope';
import { VorOrtSwitch } from '../pruefen/ModeSwitch';
import { useHomeScreenIcon } from '../pruefen/homeScreen';
import type { VorOrtPages } from '../pruefen/context';
import { FEUERDEX_DEMO_ROWS, FEUERDEX_VOR_ORT } from './vorOrt';

// „Vor Ort“ mit Beispieldaten — nur im Dev-Server (/app/feuerdex/vor-ort?demo), fehlt im Produktions-Build.
const VorOrtDemo = import.meta.env.DEV
  ? lazy(() => import('../pruefen/demo').then((m) => ({ default: m.VorOrtDemoArea })))
  : null;

function demoWanted(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('demo')) sessionStorage.setItem('fd-vorort-demo', '1');
    return sessionStorage.getItem('fd-vorort-demo') === '1';
  } catch {
    return new URLSearchParams(window.location.search).has('demo');
  }
}

// Dieselben Seiten wie im Dashboard, eingebunden in die Handy-Ansicht „Vor Ort“ (eine Quelle).
const VOR_ORT_PAGES: VorOrtPages = {
  inspections: <Inspections />,
  inspectionDetail: <InspectionDetail />,
  defects: <Defects />,
  sites: <Sites />,
  siteDetail: <SiteDetail />,
  report: <Report />,
  team: <TeamPage />,
  abo: <AboPage />,
};

export function FeuerdexArea({ app }: { app: AppConfig }) {
  useHomeScreenIcon('FeuerDex', '/icons/feuerdex-180.png');
  if (VorOrtDemo && demoWanted()) return <VorOrtDemo app={app} cfg={FEUERDEX_VOR_ORT} rows={FEUERDEX_DEMO_ROWS} />;
  return (
    <AppArea app={app} headerAction={<VorOrtSwitch />}>
      <OrgProvider>
        <OrgGate>
          <Routes>
            <Route
              path={`${VOR_ORT_PATH}/*`}
              element={
                <VorOrtScope cfg={FEUERDEX_VOR_ORT}>
                  <VorOrt pages={VOR_ORT_PAGES} />
                </VorOrtScope>
              }
            />
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="standorte" element={<Sites />} />
              <Route path="standorte/:id" element={<SiteDetail />} />
              <Route path="pruefungen" element={<Inspections />} />
              <Route path="pruefungen/:id" element={<InspectionDetail />} />
              <Route path="maengel" element={<Defects />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="bericht" element={<Report />} />
              <Route path="abo" element={<AboPage />} />
            </Route>
          </Routes>
        </OrgGate>
      </OrgProvider>
    </AppArea>
  );
}

function Shell() {
  const { app } = useAppAuth();
  const { data } = useOrg();
  // Absolute Pfade: Die Shell rendert in einer pathless Layout-Route unter einer
  // Splat-Route — relative NavLinks würden sich dort an die aktuelle URL anhängen.
  const base = `/app/${app.id}`;

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <NavLink to={base} end>
          <LayoutDashboard className="i" aria-hidden /> Übersicht
        </NavLink>
        <NavLink to={`${base}/standorte`}><Building2 className="i" aria-hidden /> Standorte</NavLink>
        <NavLink to={`${base}/pruefungen`}><ClipboardCheck className="i" aria-hidden /> Prüfungen</NavLink>
        <NavLink to={`${base}/maengel`}><TriangleAlert className="i" aria-hidden /> Mängel</NavLink>
        <NavLink to={`${base}/team`}><Users className="i" aria-hidden /> Team</NavLink>
        <NavLink to={`${base}/bericht`}><FileDown className="i" aria-hidden /> Prüfbericht-PDF</NavLink>
        <NavLink to={`${base}/abo`}><CreditCard className="i" aria-hidden /> Abo</NavLink>
        <div className="nav-footer">
          {data && (
            <>
              <b>{data.org.name}</b>
              <br />
              Rolle: {data.role === 'owner' ? 'Inhaber' : 'Mitarbeiter'}
            </>
          )}
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
