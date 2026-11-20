import { lazy } from 'react';
import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { Building2, ClipboardCheck, CreditCard, FileDown, LayoutDashboard, TriangleAlert, Users, MessageSquare } from 'lucide-react';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { WebOnboarding } from '../components/WebOnboarding';
import { TeamPage } from '../components/TeamPage';
import { AboPage } from '../components/AboPage';
import { useAsync as useFeedbackAsync } from '../components/ui';
import { FeedbackAdminPage, fetchFeedbackAdmin } from '../components/FeedbackAdminPage';
import { FeedbackForm, fetchFeedbackAvailable } from '../components/FeedbackForm';
import { Overview } from './pages/Overview';
import { Sites } from './pages/Sites';
import { SiteDetail } from './pages/SiteDetail';
import { Inspections } from './pages/Inspections';
import { InspectionDetail } from './pages/InspectionDetail';
import { Defects } from './pages/Defects';
import { Report } from './pages/Report';
import { VorOrt } from '../pruefen/VorOrt';
import { VOR_ORT_PATH, VorOrtScope } from '../pruefen/Scope';
import { VorOrtSwitch } from '../pruefen/ModeSwitch';
import { useHomeScreenIcon } from '../pruefen/homeScreen';
import type { VorOrtPages } from '../pruefen/context';
import { GURTDEX_DEMO_ROWS, GURTDEX_VOR_ORT } from './vorOrt';

// „Vor Ort“ mit Beispieldaten — nur im Dev-Server (/app/gurtdex/vor-ort?demo), fehlt im Produktions-Build.
const VorOrtDemo = import.meta.env.DEV
  ? lazy(() => import('../pruefen/demo').then((m) => ({ default: m.VorOrtDemoArea })))
  : null;

function demoWanted(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('demo')) sessionStorage.setItem('gd-vorort-demo', '1');
    return sessionStorage.getItem('gd-vorort-demo') === '1';
  } catch {
    return new URLSearchParams(window.location.search).has('demo');
  }
}

// Dieselben Seiten wie im Dashboard, eingebunden in die Handy-Ansicht „Vor Ort“ (eine Quelle).
const VOR_ORT_PAGES: VorOrtPages = {
  inspections: <Inspections />,
  inspectionDetail: <InspectionDetail />,
  defects: <Defects />,
  sites: <Sites />,
  siteDetail: <SiteDetail />,
  report: <Report />,
  team: <TeamPage />,
  abo: <AboPage />,
};

export function GurtdexArea({ app }: { app: AppConfig }) {
  useHomeScreenIcon('GurtDex', '/icons/gurtdex-180.png');
  if (VorOrtDemo && demoWanted()) return <VorOrtDemo app={app} cfg={GURTDEX_VOR_ORT} rows={GURTDEX_DEMO_ROWS} />;
  return (
    <AppArea app={app} headerAction={<VorOrtSwitch />}>
      <OrgProvider>
        <OrgGate noOrg={<WebOnboarding />}>
          <Routes>
            <Route
              path={`${VOR_ORT_PATH}/*`}
              element={
                <VorOrtScope cfg={GURTDEX_VOR_ORT}>
                  <VorOrt pages={VOR_ORT_PAGES} />
                </VorOrtScope>
              }
            />
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="standorte" element={<Sites />} />
              <Route path="standorte/:id" element={<SiteDetail />} />
              <Route path="pruefungen" element={<Inspections />} />
              <Route path="pruefungen/:id" element={<InspectionDetail />} />
              <Route path="maengel" element={<Defects />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="bericht" element={<Report />} />
              <Route path="abo" element={<AboPage />} />
              <Route path="rueckmeldung" element={<FeedbackForm />} />
              <Route path="rueckmeldungen" element={<FeedbackAdminPage />} />
            </Route>
          </Routes>
        </OrgGate>
      </OrgProvider>
    </AppArea>
  );
}

function Shell() {
  const { app, client } = useAppAuth();
  // Nur für Dexware selbst (Konten aus app_admin): Rückmeldungen aus der App lesen und bedanken.
  const feedbackAdmin = useFeedbackAsync<boolean>(() => fetchFeedbackAdmin(client), [client]);
  // Menüpunkt erst zeigen, wenn der Server dieser App die Rückmeldungen kennt (Nachtrag eingespielt).
  const feedbackDa = useFeedbackAsync<boolean>(() => fetchFeedbackAvailable(client), [client]);
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
        <NavLink to={`${base}/standorte`}><Building2 className="i" aria-hidden /> Standorte</NavLink>
        <NavLink to={`${base}/pruefungen`}><ClipboardCheck className="i" aria-hidden /> Prüfungen</NavLink>
        <NavLink to={`${base}/maengel`}><TriangleAlert className="i" aria-hidden /> Mängel</NavLink>
        <NavLink to={`${base}/team`}><Users className="i" aria-hidden /> Team</NavLink>
        <NavLink to={`${base}/bericht`}><FileDown className="i" aria-hidden /> Prüfprotokoll-PDF</NavLink>
        <NavLink to={`${base}/abo`}><CreditCard className="i" aria-hidden /> Abo</NavLink>
        {feedbackDa.data === true && (
          <NavLink to={`${base}/rueckmeldung`}><MessageSquare className="i" aria-hidden /> Fehler melden</NavLink>
        )}
        {feedbackAdmin.data === true && (
          <NavLink to={`${base}/rueckmeldungen`}><MessageSquare className="i" aria-hidden /> Rückmeldungen</NavLink>
        )}
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
