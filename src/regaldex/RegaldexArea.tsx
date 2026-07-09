import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { TeamPage } from '../components/TeamPage';
import { AboPage } from '../components/AboPage';
import { Overview } from './pages/Overview';
import { Warehouses } from './pages/Warehouses';
import { WarehouseDetail } from './pages/WarehouseDetail';
import { Inspections } from './pages/Inspections';
import { InspectionDetail } from './pages/InspectionDetail';
import { Damages } from './pages/Damages';
import { Report } from './pages/Report';

export function RegaldexArea({ app }: { app: AppConfig }) {
  return (
    <AppArea app={app}>
      <OrgProvider>
        <OrgGate>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="lager" element={<Warehouses />} />
              <Route path="lager/:id" element={<WarehouseDetail />} />
              <Route path="inspektionen" element={<Inspections />} />
              <Route path="inspektionen/:id" element={<InspectionDetail />} />
              <Route path="schaeden" element={<Damages />} />
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
          📊 Übersicht
        </NavLink>
        <NavLink to={`${base}/lager`}>🏗️ Lager</NavLink>
        <NavLink to={`${base}/inspektionen`}>✅ Inspektionen</NavLink>
        <NavLink to={`${base}/schaeden`}>⚠️ Schäden</NavLink>
        <NavLink to={`${base}/team`}>👥 Team</NavLink>
        <NavLink to={`${base}/bericht`}>📄 Prüfbericht-PDF</NavLink>
        <NavLink to={`${base}/abo`}>💳 Abo</NavLink>
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
