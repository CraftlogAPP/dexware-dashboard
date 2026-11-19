import { lazy } from 'react';
import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { Building2, ClipboardCheck, CreditCard, FileDown, LayoutDashboard, Plug } from 'lucide-react';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { AboPage } from '../components/AboPage';
import { Overview } from './pages/Overview';
import { Customers } from './pages/Customers';
import { Devices } from './pages/Devices';
import { DeviceDetail } from './pages/DeviceDetail';
import { Inspections } from './pages/Inspections';
import { InspectionDetail } from './pages/InspectionDetail';
import { Report } from './pages/Report';
import { VOR_ORT_PATH } from '../pruefen/Scope';
import { VorOrtSwitch } from '../pruefen/ModeSwitch';
import { useHomeScreenIcon } from '../pruefen/homeScreen';
import { PdVorOrtScope } from './vorOrt/Scope';
import { PdVorOrt, type PdVorOrtPages } from './vorOrt/PdVorOrt';

// „Vor Ort“ mit Beispieldaten — nur im Dev-Server (/app/pruefdex/vor-ort?demo), fehlt im Produktions-Build.
const VorOrtDemo = import.meta.env.DEV
  ? lazy(() => import('./vorOrt/demo').then((m) => ({ default: m.PdVorOrtDemoArea })))
  : null;

function demoWanted(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('demo')) sessionStorage.setItem('pd-vorort-demo', '1');
    return sessionStorage.getItem('pd-vorort-demo') === '1';
  } catch {
    return new URLSearchParams(window.location.search).has('demo');
  }
}

// Dieselben Seiten wie im Dashboard, eingebunden in die Handy-Ansicht „Vor Ort“ (eine Quelle).
const VOR_ORT_PAGES: PdVorOrtPages = {
  devices: <Devices />,
  deviceDetail: <DeviceDetail />,
  customers: <Customers />,
  inspections: <Inspections />,
  inspectionDetail: <InspectionDetail />,
  report: <Report />,
  abo: <AboPage />,
};

// Kein Team-Bereich: PrüfDex hat (noch) kein Invite-/list_members-System.
export function PruefdexArea({ app }: { app: AppConfig }) {
  useHomeScreenIcon('PrüfDex', '/icons/pruefdex-180.png');
  if (VorOrtDemo && demoWanted()) return <VorOrtDemo app={app} />;
  return (
    <AppArea app={app} headerAction={<VorOrtSwitch />}>
      <OrgProvider>
        <OrgGate>
          <Routes>
            <Route
              path={`${VOR_ORT_PATH}/*`}
              element={
                <PdVorOrtScope>
                  <PdVorOrt pages={VOR_ORT_PAGES} />
                </PdVorOrtScope>
              }
            />
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="kunden" element={<Customers />} />
              <Route path="geraete" element={<Devices />} />
              <Route path="geraete/:id" element={<DeviceDetail />} />
              <Route path="pruefungen" element={<Inspections />} />
              <Route path="pruefungen/:id" element={<InspectionDetail />} />
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
        <NavLink to={`${base}/kunden`}><Building2 className="i" aria-hidden /> Kunden</NavLink>
        <NavLink to={`${base}/geraete`}><Plug className="i" aria-hidden /> Geräte</NavLink>
        <NavLink to={`${base}/pruefungen`}><ClipboardCheck className="i" aria-hidden /> Prüfungen</NavLink>
        <NavLink to={`${base}/bericht`}><FileDown className="i" aria-hidden /> Prüflisten-PDF</NavLink>
        <NavLink to={`${base}/abo`}><CreditCard className="i" aria-hidden /> Abo</NavLink>
        <div className="nav-footer">
          {data && (
            <>
              <b>{data.org.name}</b>
              <br />
              Rolle: {data.role === 'owner' ? 'Inhaber' : 'Prüfer'}
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
