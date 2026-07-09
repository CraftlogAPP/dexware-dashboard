import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { TeamPage } from '../components/TeamPage';
import { AboPage } from '../components/AboPage';
import { Overview } from './pages/Overview';
import { Playgrounds } from './pages/Playgrounds';
import { PlaygroundDetail } from './pages/PlaygroundDetail';
import { Inspections } from './pages/Inspections';
import { InspectionDetail } from './pages/InspectionDetail';
import { Defects } from './pages/Defects';
import { Report } from './pages/Report';

export function SpieldexArea({ app }: { app: AppConfig }) {
  return (
    <AppArea app={app}>
      <OrgProvider>
        <OrgGate>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="spielplaetze" element={<Playgrounds />} />
              <Route path="spielplaetze/:id" element={<PlaygroundDetail />} />
              <Route path="kontrollen" element={<Inspections />} />
              <Route path="kontrollen/:id" element={<InspectionDetail />} />
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
          📊 Übersicht
        </NavLink>
        <NavLink to={`${base}/spielplaetze`}>🎠 Spielplätze</NavLink>
        <NavLink to={`${base}/kontrollen`}>✅ Kontrollen</NavLink>
        <NavLink to={`${base}/maengel`}>⚠️ Mängel</NavLink>
        <NavLink to={`${base}/team`}>👥 Team</NavLink>
        <NavLink to={`${base}/bericht`}>📄 Kontrollbuch-PDF</NavLink>
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
