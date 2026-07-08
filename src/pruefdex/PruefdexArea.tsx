import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { Overview } from './pages/Overview';
import { Customers } from './pages/Customers';
import { Devices } from './pages/Devices';
import { DeviceDetail } from './pages/DeviceDetail';
import { Inspections } from './pages/Inspections';
import { InspectionDetail } from './pages/InspectionDetail';
import { Report } from './pages/Report';

// Kein Team-Bereich: PrüfDex hat (noch) kein Invite-/list_members-System.
export function PruefdexArea({ app }: { app: AppConfig }) {
  return (
    <AppArea app={app}>
      <OrgProvider>
        <OrgGate>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="kunden" element={<Customers />} />
              <Route path="geraete" element={<Devices />} />
              <Route path="geraete/:id" element={<DeviceDetail />} />
              <Route path="pruefungen" element={<Inspections />} />
              <Route path="pruefungen/:id" element={<InspectionDetail />} />
              <Route path="bericht" element={<Report />} />
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
        <NavLink to={`${base}/kunden`}>🏢 Kunden</NavLink>
        <NavLink to={`${base}/geraete`}>🔌 Geräte</NavLink>
        <NavLink to={`${base}/pruefungen`}>✅ Prüfungen</NavLink>
        <NavLink to={`${base}/bericht`}>📄 Prüflisten-PDF</NavLink>
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
