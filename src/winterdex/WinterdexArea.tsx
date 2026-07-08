import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgProvider, useOrg } from './OrgContext';
import { Overview } from './pages/Overview';
import { Properties } from './pages/Properties';
import { PropertyDetail } from './pages/PropertyDetail';
import { Operations } from './pages/Operations';
import { OperationDetail } from './pages/OperationDetail';
import { Team } from './pages/Team';
import { Report } from './pages/Report';

export function WinterdexArea({ app }: { app: AppConfig }) {
  return (
    <AppArea app={app}>
      <OrgProvider>
        <OrgGate />
      </OrgProvider>
    </AppArea>
  );
}

function OrgGate() {
  const { app } = useAppAuth();
  const { data, loading, error, reload } = useOrg();

  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <div className="error-box">{error}</div>
        <button className="btn ghost" onClick={reload}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <div className="info-box">
          Dieses Konto gehört noch zu keinem Betrieb. Lege den Betrieb zuerst in der{' '}
          {app.name}-App am Handy an (oder tritt per Einladungscode bei) — danach steht
          das Dashboard hier bereit.
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="objekte" element={<Properties />} />
        <Route path="objekte/:id" element={<PropertyDetail />} />
        <Route path="einsaetze" element={<Operations />} />
        <Route path="einsaetze/:id" element={<OperationDetail />} />
        <Route path="team" element={<Team />} />
        <Route path="bericht" element={<Report />} />
      </Route>
    </Routes>
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
        <NavLink to={`${base}/objekte`}>🏠 Objekte</NavLink>
        <NavLink to={`${base}/einsaetze`}>🧹 Einsätze</NavLink>
        <NavLink to={`${base}/team`}>👥 Team</NavLink>
        <NavLink to={`${base}/bericht`}>📄 Nachweis-PDF</NavLink>
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
