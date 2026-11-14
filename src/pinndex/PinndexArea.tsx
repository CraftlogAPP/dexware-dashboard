// PinnDex — Bereich im Dashboard: die Live-Pinnwand für Aufträge (KONZEPT: Desktop/PinnDex/KONZEPT.md, Abschnitt 5).
// Echte Anmeldung wie alle Dashboards (AppArea). Solange in der Registry kein Supabase-Projekt eingetragen ist — und im
// Dev-Server mit ?demo — laufen Beispieldaten (DemoArea, eigener Chunk, fehlt im Produktions-Build). ?demo=0 beendet das.

import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { Link, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { BookUser, CircleCheck, Clock, MapPinned, SquareKanban, Users } from 'lucide-react';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { useAsync } from '../components/ui';
import { PinnProvider, ThemeProvider, usePinn, useThemeChoice } from './context';
import { ThemeSwitch } from './parts';
import { loadPinnContext, supabaseData } from './data';
import { JobSheetHost } from './JobSheet';
import { Board } from './pages/Board';
import { Overview } from './pages/Overview';
import { Done } from './pages/Done';
import { Times } from './pages/Times';
import { Team } from './pages/Team';
import { Customers } from './pages/Customers';
import { ROLE_LABEL } from './types';
import './pinndex.css';
import './uebersicht.css';

const DemoArea = import.meta.env.DEV ? lazy(() => import('./DemoArea').then((m) => ({ default: m.DemoArea }))) : null;

/** Dev-Server: Beispieldaten gewünscht? (?demo setzt, ?demo=0 löscht — gilt für den Tab) */
function wantsDemo(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const q = new URLSearchParams(window.location.search).get('demo');
    if (q === '0') sessionStorage.removeItem('pinn-demo');
    else if (q !== null) sessionStorage.setItem('pinn-demo', '1');
    return sessionStorage.getItem('pinn-demo') === '1';
  } catch {
    return false;
  }
}

/** Hell/Dunkel-Hülle (data-theme steuert die Tokens in index.css). */
export function ThemeScope({ children }: { children: ReactNode }) {
  const t = useThemeChoice();
  const api = useMemo(() => ({ choice: t.choice, set: t.set }), [t.choice, t.set]);
  return (
    <ThemeProvider value={api}>
      <div className="pinn-scope" data-theme={t.effective}>
        {children}
      </div>
    </ThemeProvider>
  );
}

export function PinndexArea({ app }: { app: AppConfig }) {
  if (!app.supabase || wantsDemo()) {
    return DemoArea ? (
      <Suspense
        fallback={
          <div className="empty">
            <span className="spinner" />
          </div>
        }
      >
        <DemoArea app={app} />
      </Suspense>
    ) : (
      <div className="page">
        <div className="info-box">
          Das {app.name}-Dashboard ist noch nicht freigeschaltet. <Link to="/">Zurück zur Übersicht</Link>
        </div>
      </div>
    );
  }
  return (
    <ThemeScope>
      <AppArea app={app}>
        <RealProvider app={app}>
          <PinnRoutes />
        </RealProvider>
      </AppArea>
    </ThemeScope>
  );
}

function RealProvider({ app, children }: { app: AppConfig; children: ReactNode }) {
  const { client, session } = useAppAuth();
  const ctx = useAsync(() => loadPinnContext(client), [client, session?.user.id]);
  const orgId = ctx.data?.org.id;
  const data = useMemo(() => (orgId ? supabaseData(client, orgId) : null), [client, orgId]);
  if (ctx.loading && !ctx.data) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }
  if (ctx.error) {
    return (
      <div className="page">
        <div className="error-box">{ctx.error}</div>
        <button className="btn ghost" onClick={ctx.reload}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (!ctx.data || !data) {
    return (
      <div className="page">
        <div className="info-box">
          Dieses Konto gehört noch zu keinem Betrieb. Lege den Betrieb in der {app.name}-App am Handy an oder tritt per Team-Code bei — danach steht die
          Pinnwand hier bereit.
        </div>
      </div>
    );
  }
  return (
    <PinnProvider app={app} data={data} org={ctx.data.org} me={ctx.data.me} demo={false} refreshOrg={ctx.refresh}>
      {children}
    </PinnProvider>
  );
}

export function PinnRoutes() {
  return (
    <JobSheetHost>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="pinnwand" element={<Board />} />
          <Route path="erledigt" element={<Done />} />
          <Route path="zeiten" element={<Times />} />
          <Route path="kunden" element={<Customers />} />
          <Route path="team" element={<Team />} />
        </Route>
      </Routes>
    </JobSheetHost>
  );
}

function Shell() {
  const { base, org, role, canManage } = usePinn();
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <NavLink to={base} end>
          <MapPinned className="i" aria-hidden /> Übersicht
        </NavLink>
        <NavLink to={`${base}/pinnwand`}>
          <SquareKanban className="i" aria-hidden /> Pinnwand
        </NavLink>
        <NavLink to={`${base}/erledigt`}>
          <CircleCheck className="i" aria-hidden /> Erledigt
        </NavLink>
        <NavLink to={`${base}/zeiten`}>
          <Clock className="i" aria-hidden /> Zeiten
        </NavLink>
        {canManage && (
          <NavLink to={`${base}/kunden`}>
            <BookUser className="i" aria-hidden /> Kunden
          </NavLink>
        )}
        <NavLink to={`${base}/team`}>
          <Users className="i" aria-hidden /> Team
        </NavLink>
        <div className="nav-footer">
          <b>{org.name}</b>
          <br />
          Rolle: {ROLE_LABEL[role]}
          <ThemeSwitch />
        </div>
      </nav>
      <main className="app-main pinn-main">
        <Outlet />
      </main>
    </div>
  );
}
