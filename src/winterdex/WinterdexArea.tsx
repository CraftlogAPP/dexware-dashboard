import { lazy, useEffect, useMemo, type ReactNode } from 'react';
import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { Building2, CreditCard, FileDown, LayoutDashboard, MapPinCheck, Route as RouteIcon, Snowflake, Users } from 'lucide-react';
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
import { Einsatz } from './pages/Einsatz';
import { EinsatzErfassen } from './pages/EinsatzErfassen';
import { supabaseBackend } from './einsatz/backend';
import { EinsatzCtx } from './einsatz/context';

// „Einsatz erfassen“ mit Beispieldaten — nur im Dev-Server (/app/winterdex/einsatz?demo), fehlt im Produktions-Build.
const EinsatzDemo = import.meta.env.DEV
  ? lazy(() => import('./einsatz/demo').then((m) => ({ default: m.EinsatzDemoArea })))
  : null;

function demoWanted(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('demo')) sessionStorage.setItem('wd-einsatz-demo', '1');
    return sessionStorage.getItem('wd-einsatz-demo') === '1';
  } catch {
    return new URLSearchParams(window.location.search).has('demo');
  }
}

export function WinterdexArea({ app }: { app: AppConfig }) {
  useHomeScreenIcon();
  if (EinsatzDemo && demoWanted()) return <EinsatzDemo app={app} />;
  return (
    <AppArea app={app}>
      <OrgProvider>
        <OrgGate>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="objekte" element={<Properties />} />
              <Route path="objekte/:id" element={<PropertyDetail />} />
              <Route path="einsatz" element={<EinsatzScope><Einsatz /></EinsatzScope>} />
              <Route path="einsatz/:id" element={<EinsatzScope><EinsatzErfassen /></EinsatzScope>} />
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

/** Stellt dem Einsatz-Bereich Server-Zugriff, Konto und Betrieb bereit. */
function EinsatzScope({ children }: { children: ReactNode }) {
  const { app, client, session } = useAppAuth();
  const { data } = useOrg();
  const userId = session?.user.id;
  const orgId = data?.org.id;
  const value = useMemo(
    () =>
      userId && orgId
        ? {
            be: supabaseBackend(client, app.backend),
            userId,
            orgId,
            base: `/app/${app.id}/einsatz`,
            propertiesUrl: `/app/${app.id}/objekte`,
          }
        : null,
    [client, app, userId, orgId],
  );
  if (!value) return null;
  return <EinsatzCtx.Provider value={value}>{children}</EinsatzCtx.Provider>;
}

/**
 * „Zum Home-Bildschirm“ am iPhone: Symbol und Name von WinterDex statt des allgemeinen Dashboards,
 * solange dieser Bereich offen ist (Safari liest beides beim Hinzufügen aus der Seite).
 */
function useHomeScreenIcon() {
  useEffect(() => {
    const head = document.head;
    const icon = head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const beforeIcon = icon?.getAttribute('href') ?? null;
    const beforeTitle = document.title;
    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-title';
    meta.content = 'WinterDex';
    head.appendChild(meta);
    icon?.setAttribute('href', '/icons/winterdex-180.png');
    document.title = 'WinterDex';
    return () => {
      meta.remove();
      if (icon && beforeIcon) icon.setAttribute('href', beforeIcon);
      document.title = beforeTitle;
    };
  }, []);
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
        <NavLink to={`${base}/einsatz`}><MapPinCheck className="i" aria-hidden /> Einsatz erfassen</NavLink>
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
