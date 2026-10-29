import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { Car, CreditCard, FileDown, LayoutDashboard, MapPin, Route as RouteIcon } from 'lucide-react';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { AboPage } from '../components/AboPage';
import { Overview } from './pages/Overview';
import { Trips } from './pages/Trips';
import { TripDetail } from './pages/TripDetail';
import { Vehicles } from './pages/Vehicles';
import { Places } from './pages/Places';
import { Report } from './pages/Report';

// TourDex ist Single-User wie CraftDex (kein Betrieb/Team/OrgGate): nach dem
// Login hängen alle Fahrten/Fahrzeuge/Orte direkt am Konto.
export function TourdexArea({ app }: { app: AppConfig }) {
  return (
    <AppArea app={app}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="fahrten" element={<Trips />} />
          <Route path="fahrten/:id" element={<TripDetail />} />
          <Route path="fahrzeuge" element={<Vehicles />} />
          <Route path="orte" element={<Places />} />
          <Route path="bericht" element={<Report />} />
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
        <NavLink to={`${base}/fahrten`}><RouteIcon className="i" aria-hidden /> Fahrten</NavLink>
        <NavLink to={`${base}/fahrzeuge`}><Car className="i" aria-hidden /> Fahrzeuge</NavLink>
        <NavLink to={`${base}/orte`}><MapPin className="i" aria-hidden /> Orte</NavLink>
        <NavLink to={`${base}/bericht`}><FileDown className="i" aria-hidden /> Fahrtenbuch-PDF</NavLink>
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
