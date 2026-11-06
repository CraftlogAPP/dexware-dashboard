// Routen + Navigation des Betriebsportals (gleich für echte Daten und Beispieldaten).

import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Clock,
  Globe,
  Package,
  Receipt,
  CalendarClock,
  CreditCard,
  Inbox,
  LayoutDashboard,
  FileUp,
  Settings as SettingsIcon,
  Users,
} from 'lucide-react';
import { useAsync, useLiveRefresh } from '../components/ui';
import { useInst } from './context';
import { Start } from './pages/Start';
import { Requests } from './pages/Requests';
import { RequestDetail } from './pages/RequestDetail';
import { Maintenance } from './pages/Maintenance';
import { Customers } from './pages/Customers';
import { SiteDetail } from './pages/SiteDetail';
import { AssetDetail } from './pages/AssetDetail';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';
import { Abo } from './pages/Abo';
import { Import } from './pages/Import';
import { Plantafel } from './planung/Plantafel';
import { Zeiten } from './planung/Zeiten';
import { Rechnungen } from './geld/Rechnungen';
import { Material } from './geld/Material';
import { Auswertungen } from './auswertung/Auswertungen';
import { Profil } from './auswertung/Profil';
// @route-import

export function PortalRoutes() {
  const { base } = useInst();
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Start />} />
        <Route path="anfragen" element={<Requests />} />
        <Route path="anfragen/:id" element={<RequestDetail />} />
        <Route path="wartung" element={<Maintenance />} />
        <Route path="kunden" element={<Customers />} />
        <Route path="kunden/:id" element={<SiteDetail />} />
        <Route path="anlagen/:id" element={<AssetDetail />} />
        <Route path="einstellungen" element={<Settings />} />
        <Route path="import" element={<Import />} />
        <Route path="team" element={<Team />} />
        <Route path="abo" element={<Abo />} />
        <Route path="plantafel" element={<Plantafel />} />
        <Route path="zeiten" element={<Zeiten />} />
        <Route path="rechnungen/*" element={<Rechnungen />} />
        <Route path="material" element={<Material />} />
        <Route path="auswertungen/*" element={<Auswertungen />} />
        <Route path="profil" element={<Profil />} />
        {/* @routes */}
        <Route path="*" element={<Navigate to={base} replace />} />
      </Route>
    </Routes>
  );
}

function Shell() {
  const { base, org, role, data, requestsVersion, isOwner } = useInst();
  // Neue Anfragen in der Navigation — still alle 60 s und beim Zurückwechseln in den Tab.
  const count = useAsync(() => data.newRequestCount(), [data, requestsVersion]);
  useLiveRefresh([count.refresh], 60000);
  const n = count.data ?? 0;

  // Absolute Pfade: Die Shell rendert in einer pathless Layout-Route unter einer Splat-Route.
  return (
    <div className="app-shell idx-scope">
      <nav className="app-nav">
        <NavLink to={base} end>
          <LayoutDashboard className="i" aria-hidden /> Start
        </NavLink>
        <NavLink to={`${base}/anfragen`}>
          <Inbox className="i" aria-hidden /> Anfragen
          {n > 0 && (
            <span className="idx-nav-count" title={`${n} neue Anfragen`}>
              {n}
            </span>
          )}
        </NavLink>
        <NavLink to={`${base}/plantafel`}>
          <CalendarDays className="i" aria-hidden /> Plantafel
        </NavLink>
        <NavLink to={`${base}/wartung`}>
          <CalendarClock className="i" aria-hidden /> Wartungsliste
        </NavLink>
        <NavLink to={`${base}/kunden`}>
          <Building2 className="i" aria-hidden /> Kunden &amp; Objekte
        </NavLink>
        <span className="idx-nav-sep" aria-hidden />
        <NavLink to={`${base}/rechnungen`}>
          <Receipt className="i" aria-hidden /> Rechnungen
        </NavLink>
        <NavLink to={`${base}/material`}>
          <Package className="i" aria-hidden /> Material &amp; Preise
        </NavLink>
        <NavLink to={`${base}/zeiten`}>
          <Clock className="i" aria-hidden /> Zeiten
        </NavLink>
        <NavLink to={`${base}/auswertungen`}>
          <BarChart3 className="i" aria-hidden /> Auswertungen
        </NavLink>
        <span className="idx-nav-sep" aria-hidden />
        {isOwner && (
          <NavLink to={`${base}/import`}>
            <FileUp className="i" aria-hidden /> Import
          </NavLink>
        )}
        <NavLink to={`${base}/einstellungen`}>
          <SettingsIcon className="i" aria-hidden /> Einstellungen
        </NavLink>
        {isOwner && (
          <NavLink to={`${base}/profil`}>
            <Globe className="i" aria-hidden /> Öffentliches Profil
          </NavLink>
        )}
        <NavLink to={`${base}/team`}>
          <Users className="i" aria-hidden /> Team
        </NavLink>
        <NavLink to={`${base}/abo`}>
          <CreditCard className="i" aria-hidden /> Abo
        </NavLink>
        <div className="nav-footer">
          <b>{org.name}</b>
          <br />
          Rolle: {role === 'owner' ? 'Inhaber' : 'Mitarbeiter'}
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
