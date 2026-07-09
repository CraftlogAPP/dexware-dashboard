import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
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

// KfzDex nutzt das Betrieb/Team-Modell, aber mit eigener org_member-Tabelle
// und permanentem Invite-Code — daher eigener Org-Fetcher + eigene Team-Seite.
export function KfzdexArea({ app }: { app: AppConfig }) {
  return (
    <AppArea app={app}>
      <OrgProvider fetch={fetchKfzOrgContext}>
        <OrgGate>
          <Routes>
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
          📊 Übersicht
        </NavLink>
        <NavLink to={`${base}/fahrzeuge`}>🚛 Fahrzeuge</NavLink>
        <NavLink to={`${base}/fahrer`}>🪪 Fahrer</NavLink>
        <NavLink to={`${base}/team`}>👥 Team</NavLink>
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
