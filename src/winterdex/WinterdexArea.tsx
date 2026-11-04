import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { Building2, CreditCard, FileDown, LayoutDashboard, Route as RouteIcon, Snowflake, Users } from 'lucide-react';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { TeamPage } from '../components/TeamPage';
import { AboPage } from '../components/AboPage';
import { Overview } from './pages/Overview';
import { Properties } from './pages/Properties';
import { PropertyDetail } from './pages/PropertyDetail';
import { Operations } from './pages/Operations';
import { OperationDetail } from './pages/OperationDetail';
import { Report } from './pages/Report';
import { Routes as RoutesPage } from './pages/Routes';
import { RouteDetail } from './pages/RouteDetail';
import { RunDetail } from './pages/RunDetail';

export function WinterdexArea({ app }: { app: AppConfig }) {
  return (
    <AppArea app={app}>
      <OrgProvider>
        <OrgGate>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="objekte" element={<Properties />} />
              <Route path="objekte/:id" element={<PropertyDetail />} />
              <Route path="einsaetze" element={<Operations />} />
              <Route path="einsaetze/:id" element={<OperationDetail />} />
              <Route path="strecken" element={<RoutesPage />} />
              <Route path="strecken/fahrten/:id" element={<RunDetail />} />
              <Route path="strecken/:id" element={<RouteDetail />} />
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
          <LayoutDashboard className="i" aria-hidden /> Übersicht
        </NavLink>
        <NavLink to={`${base}/objekte`}><Building2 className="i" aria-hidden /> Objekte</NavLink>
        <NavLink to={`${base}/einsaetze`}><Snowflake className="i" aria-hidden /> Einsätze</NavLink>
        <NavLink to={`${base}/strecken`}><RouteIcon className="i" aria-hidden /> Strecken</NavLink>
        <NavLink to={`${base}/team`}><Users className="i" aria-hidden /> Team</NavLink>
        <NavLink to={`${base}/bericht`}><FileDown className="i" aria-hidden /> Nachweis-PDF</NavLink>
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
