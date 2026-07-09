import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { AboPage } from '../components/AboPage';
import { Overview } from './pages/Overview';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';

// CraftDex ist Single-User (kein Betrieb/Team/OrgGate): nach dem Login
// hängen alle Projekte direkt am Konto.
export function CraftdexArea({ app }: { app: AppConfig }) {
  return (
    <AppArea app={app}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="auftraege" element={<Projects />} />
          <Route path="auftraege/:id" element={<ProjectDetail />} />
          <Route path="abo" element={<AboPage />} />
        </Route>
      </Routes>
    </AppArea>
  );
}

function Shell() {
  const { app, session } = useAppAuth();
  // Absolute Pfade: Die Shell rendert in einer pathless Layout-Route unter einer
  // Splat-Route — relative NavLinks würden sich dort an die aktuelle URL anhängen.
  const base = `/app/${app.id}`;

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <NavLink to={base} end>
          📊 Übersicht
        </NavLink>
        <NavLink to={`${base}/auftraege`}>🛠️ Aufträge</NavLink>
        <NavLink to={`${base}/abo`}>💳 Abo</NavLink>
        <div className="nav-footer">
          {session && (
            <>
              <b>{session.user.email}</b>
              <br />
              Persönliches Konto
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
