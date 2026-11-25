import { lazy, Suspense } from 'react';
import { NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { ClipboardCheck, CreditCard, FerrisWheel, FileDown, LayoutDashboard, TriangleAlert, Users, MessageSquare } from 'lucide-react';
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
import { Playgrounds } from './pages/Playgrounds';
import { PlaygroundDetail } from './pages/PlaygroundDetail';
import { Inspections } from './pages/Inspections';
import { InspectionDetail } from './pages/InspectionDetail';
import { Defects } from './pages/Defects';
import { Report } from './pages/Report';
import { VorOrt } from '../pruefen/VorOrt';
import { VOR_ORT_PATH, VorOrtScope } from '../pruefen/Scope';
import { VorOrtSwitch } from '../pruefen/ModeSwitch';
import { useHomeScreenIcon } from '../pruefen/homeScreen';
import type { VorOrtPages } from '../pruefen/context';
import { SPIELDEX_DEMO_ROWS, SPIELDEX_VOR_ORT } from './vorOrt';

// Import ist Schreibtischarbeit: eigene Seite, erst beim Öffnen geladen (nicht in „Vor Ort“)
const PlaygroundImport = lazy(() => import('./pages/PlaygroundImport').then((m) => ({ default: m.PlaygroundImport })));
// Jahresabo-Dankeschön aus WinterDex einlösen (direkt erreichbar, Link auf der Abo-Seite)
const CodeEinloesen = lazy(() => import('../components/CodeEinloesen').then((m) => ({ default: m.CodeEinloesen })));

// „Vor Ort“ mit Beispieldaten — nur im Dev-Server (/app/spieldex/vor-ort?demo), fehlt im Produktions-Build.
const VorOrtDemo = import.meta.env.DEV
  ? lazy(() => import('../pruefen/demo').then((m) => ({ default: m.VorOrtDemoArea })))
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
const VOR_ORT_PAGES: VorOrtPages = {
  inspections: <Inspections />,
  inspectionDetail: <InspectionDetail />,
  defects: <Defects />,
  sites: <Playgrounds />,
  siteDetail: <PlaygroundDetail />,
  report: <Report />,
  team: <TeamPage />,
  abo: <AboPage />,
};

export function SpieldexArea({ app }: { app: AppConfig }) {
  useHomeScreenIcon('SpielDex', '/icons/spieldex-180.png');
  if (VorOrtDemo && demoWanted()) return <VorOrtDemo app={app} cfg={SPIELDEX_VOR_ORT} rows={SPIELDEX_DEMO_ROWS} />;
  return (
    <AppArea app={app} headerAction={<VorOrtSwitch />}>
      <OrgProvider>
        <OrgGate noOrg={<WebOnboarding />}>
          <Routes>
            <Route
              path={`${VOR_ORT_PATH}/*`}
              element={
                <VorOrtScope cfg={SPIELDEX_VOR_ORT}>
                  <VorOrt pages={VOR_ORT_PAGES} />
                </VorOrtScope>
              }
            />
            <Route element={<Shell />}>
              <Route index element={<Overview />} />
              <Route path="spielplaetze" element={<Playgrounds />} />
              <Route
                path="spielplaetze/import"
                element={
                  <Suspense
                    fallback={
                      <div className="empty">
                        <span className="spinner" />
                      </div>
                    }
                  >
                    <PlaygroundImport />
                  </Suspense>
                }
              />
              <Route path="spielplaetze/:id" element={<PlaygroundDetail />} />
              <Route path="kontrollen" element={<Inspections />} />
              <Route path="kontrollen/:id" element={<InspectionDetail />} />
              <Route path="maengel" element={<Defects />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="bericht" element={<Report />} />
              <Route path="abo" element={<AboPage />} />
              <Route
                path="code-einloesen"
                element={
                  <Suspense
                    fallback={
                      <div className="empty">
                        <span className="spinner" />
                      </div>
                    }
                  >
                    <CodeEinloesen />
                  </Suspense>
                }
              />
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
        <NavLink to={`${base}/spielplaetze`}><FerrisWheel className="i" aria-hidden /> Spielplätze</NavLink>
        <NavLink to={`${base}/kontrollen`}><ClipboardCheck className="i" aria-hidden /> Kontrollen</NavLink>
        <NavLink to={`${base}/maengel`}><TriangleAlert className="i" aria-hidden /> Mängel</NavLink>
        <NavLink to={`${base}/team`}><Users className="i" aria-hidden /> Team</NavLink>
        <NavLink to={`${base}/bericht`}><FileDown className="i" aria-hidden /> Kontrollbuch-PDF</NavLink>
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
