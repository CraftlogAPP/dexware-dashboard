import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { CreditCard, FileText, FolderOpen, LayoutDashboard } from 'lucide-react';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { AboPage } from '../components/AboPage';
import { Overview } from './pages/Overview';
import { Documents } from './pages/Documents';
import { DocumentDetail } from './pages/DocumentDetail';
import { Projects } from './pages/Projects';

// DokuDex ist Single-User wie CraftDex/TourDex (kein Betrieb/Team/OrgGate):
// nach dem Login hängt das ganze Dokumentenarchiv direkt am Konto.
export function DokudexArea({ app }: { app: AppConfig }) {
  return (
    <AppArea app={app}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="dokumente" element={<Documents />} />
          <Route path="dokumente/:id" element={<DocumentDetail />} />
          <Route path="projekte" element={<Projects />} />
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
          <LayoutDashboard className="i" aria-hidden /> Übersicht
        </NavLink>
        <NavLink to={`${base}/dokumente`}><FileText className="i" aria-hidden /> Dokumente</NavLink>
        <NavLink to={`${base}/projekte`}><FolderOpen className="i" aria-hidden /> Projekte</NavLink>
        <NavLink to={`${base}/abo`}><CreditCard className="i" aria-hidden /> Abo</NavLink>
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
