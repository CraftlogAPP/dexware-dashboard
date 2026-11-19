import { lazy } from 'react';
import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { BookOpenCheck, CreditCard, LayoutDashboard, ListChecks, PenLine, Users } from 'lucide-react';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { WebOnboarding } from '../components/WebOnboarding';
import { fetchOwnerOrgContext } from '../lib/orgApi';
import { AboPage } from '../components/AboPage';
import { Overview } from './pages/Overview';
import { Members } from './pages/Members';
import { Briefings } from './pages/Briefings';
import { Assignments } from './pages/Assignments';
import { Completions } from './pages/Completions';
import { VOR_ORT_PATH } from '../pruefen/Scope';
import { VorOrtSwitch } from '../pruefen/ModeSwitch';
import { useHomeScreenIcon } from '../pruefen/homeScreen';
import { SdVorOrtScope } from './vorOrt/Scope';
import { SdVorOrt, type SdVorOrtPages } from './vorOrt/SdVorOrt';

// „Vor Ort“ mit Beispieldaten — nur im Dev-Server (/app/schutzdex/vor-ort?demo), fehlt im Produktions-Build.
const VorOrtDemo = import.meta.env.DEV
  ? lazy(() => import('./vorOrt/demo').then((m) => ({ default: m.SdVorOrtDemoArea })))
  : null;

function demoWanted(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('demo')) sessionStorage.setItem('sd-vorort-demo', '1');
    return sessionStorage.getItem('sd-vorort-demo') === '1';
  } catch {
    return new URLSearchParams(window.location.search).has('demo');
  }
}

// Dieselben Seiten wie im Dashboard, eingebunden in die Handy-Ansicht „Vor Ort“ (eine Quelle).
const VOR_ORT_PAGES: SdVorOrtPages = {
  members: <Members />,
  briefings: <Briefings />,
  completions: <Completions />,
  abo: <AboPage />,
};

// SchutzDex hat kein membership-Modell (org gehört dem Auth-User direkt) und
// kein Team-System — Mitarbeiter sind Datensätze, keine eigenen Konten.
export function SchutzdexArea({ app }: { app: AppConfig }) {
  useHomeScreenIcon('SchutzDex', '/icons/schutzdex-180.png');
  if (VorOrtDemo && demoWanted()) return <VorOrtDemo app={app} />;
  return (
    <AppArea app={app} headerAction={<VorOrtSwitch hint="Handy-Ansicht: Unterweisung durchführen und unterschreiben lassen" />}>
      <OrgProvider fetch={fetchOwnerOrgContext}>
        <OrgGate noOrg={<WebOnboarding fetchOrg={fetchOwnerOrgContext} />}>
          <Routes>
            <Route
              path={`${VOR_ORT_PATH}/*`}
              element={
                <SdVorOrtScope>
                  <SdVorOrt pages={VOR_ORT_PAGES} />
                </SdVorOrtScope>
              }
            />
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="mitarbeiter" element={<Members />} />
              <Route path="unterweisungen" element={<Briefings />} />
              <Route path="zuweisungen" element={<Assignments />} />
              <Route path="nachweise" element={<Completions />} />
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
        <NavLink to={`${base}/mitarbeiter`}><Users className="i" aria-hidden /> Mitarbeiter</NavLink>
        <NavLink to={`${base}/unterweisungen`}><BookOpenCheck className="i" aria-hidden /> Unterweisungen</NavLink>
        <NavLink to={`${base}/zuweisungen`}><ListChecks className="i" aria-hidden /> Zuweisungen</NavLink>
        <NavLink to={`${base}/nachweise`}><PenLine className="i" aria-hidden /> Nachweise</NavLink>
        <NavLink to={`${base}/abo`}><CreditCard className="i" aria-hidden /> Abo</NavLink>
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
