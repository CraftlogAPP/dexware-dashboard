import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { fetchOwnerOrgContext } from '../lib/orgApi';
import { Overview } from './pages/Overview';
import { Members } from './pages/Members';
import { Briefings } from './pages/Briefings';
import { Assignments } from './pages/Assignments';
import { Completions } from './pages/Completions';

// SchutzDex hat kein membership-Modell (org gehört dem Auth-User direkt) und
// kein Team-System — Mitarbeiter sind Datensätze, keine eigenen Konten.
export function SchutzdexArea({ app }: { app: AppConfig }) {
  return (
    <AppArea app={app}>
      <OrgProvider fetch={fetchOwnerOrgContext}>
        <OrgGate>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="mitarbeiter" element={<Members />} />
              <Route path="unterweisungen" element={<Briefings />} />
              <Route path="zuweisungen" element={<Assignments />} />
              <Route path="nachweise" element={<Completions />} />
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
        <NavLink to={`${base}/mitarbeiter`}>👥 Mitarbeiter</NavLink>
        <NavLink to={`${base}/unterweisungen`}>🦺 Unterweisungen</NavLink>
        <NavLink to={`${base}/zuweisungen`}>📋 Zuweisungen</NavLink>
        <NavLink to={`${base}/nachweise`}>✍️ Nachweise</NavLink>
        <div className="nav-footer">
          {data && (
            <>
              <b>{data.org.name}</b>
              <br />
              Rolle: Inhaber
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
