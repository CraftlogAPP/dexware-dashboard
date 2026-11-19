import { lazy } from 'react';
import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { CreditCard, IdCard, LayoutDashboard, Truck, Users } from 'lucide-react';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { fetchKfzOrgContext } from './api';
import { AboPage } from '../components/AboPage';
import { Overview } from './pages/Overview';
import { Vehicles } from './pages/Vehicles';
import { VehicleDetail } from './pages/VehicleDetail';
import { Drivers } from './pages/Drivers';
import { DriverDetail } from './pages/DriverDetail';
import { Team } from './pages/Team';
import { VOR_ORT_PATH } from '../pruefen/Scope';
import { VorOrtSwitch } from '../pruefen/ModeSwitch';
import { useHomeScreenIcon } from '../pruefen/homeScreen';
import { KfzVorOrtScope } from './vorOrt/Scope';
import { KfzVorOrt, type KfzVorOrtPages } from './vorOrt/KfzVorOrt';

// „Vor Ort“ mit Beispieldaten — nur im Dev-Server (/app/kfzdex/vor-ort?demo), fehlt im Produktions-Build.
const VorOrtDemo = import.meta.env.DEV
  ? lazy(() => import('./vorOrt/demo').then((m) => ({ default: m.KfzVorOrtDemoArea })))
  : null;

function demoWanted(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('demo')) sessionStorage.setItem('kd-vorort-demo', '1');
    return sessionStorage.getItem('kd-vorort-demo') === '1';
  } catch {
    return new URLSearchParams(window.location.search).has('demo');
  }
}

// Dieselben Seiten wie im Dashboard, eingebunden in die Handy-Ansicht „Vor Ort“ (eine Quelle).
const VOR_ORT_PAGES: KfzVorOrtPages = {
  vehicles: <Vehicles />,
  vehicleDetail: <VehicleDetail />,
  drivers: <Drivers />,
  driverDetail: <DriverDetail />,
  team: <Team />,
  abo: <AboPage />,
};

// KfzDex nutzt das Betrieb/Team-Modell, aber mit eigener org_member-Tabelle
// und permanentem Invite-Code — daher eigener Org-Fetcher + eigene Team-Seite.
export function KfzdexArea({ app }: { app: AppConfig }) {
  useHomeScreenIcon('KfzDex', '/icons/kfzdex-180.png');
  if (VorOrtDemo && demoWanted()) return <VorOrtDemo app={app} />;
  return (
    <AppArea app={app} headerAction={<VorOrtSwitch />}>
      <OrgProvider fetch={fetchKfzOrgContext}>
        <OrgGate>
          <Routes>
            <Route
              path={`${VOR_ORT_PATH}/*`}
              element={
                <KfzVorOrtScope>
                  <KfzVorOrt pages={VOR_ORT_PAGES} />
                </KfzVorOrtScope>
              }
            />
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="fahrzeuge" element={<Vehicles />} />
              <Route path="fahrzeuge/:id" element={<VehicleDetail />} />
              <Route path="fahrer" element={<Drivers />} />
              <Route path="fahrer/:id" element={<DriverDetail />} />
              <Route path="team" element={<Team />} />
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
        <NavLink to={`${base}/fahrzeuge`}><Truck className="i" aria-hidden /> Fahrzeuge</NavLink>
        <NavLink to={`${base}/fahrer`}><IdCard className="i" aria-hidden /> Fahrer</NavLink>
        <NavLink to={`${base}/team`}><Users className="i" aria-hidden /> Team</NavLink>
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
