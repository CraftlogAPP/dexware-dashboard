import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Building2, CreditCard, FileDown, Gift, LayoutDashboard, MessageSquare, Monitor, Route as RouteIcon, Snowflake, Sprout, Truck, Users } from 'lucide-react';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useAppAuth } from '../auth/AppAuthContext';
import { OrgGate, OrgProvider, useOrg } from '../components/OrgContext';
import { TeamPage } from '../components/TeamPage';
import { AboPage } from '../components/AboPage';
import { FeedbackAdminPage, fetchFeedbackAdmin } from '../components/FeedbackAdminPage';
import { FeedbackForm } from '../components/FeedbackForm';
import { FeedbackZentral } from '../components/FeedbackZentral';
import { useAsync } from '../components/ui';
import { Overview } from './pages/Overview';
import { Properties } from './pages/Properties';
import { PropertyDetail } from './pages/PropertyDetail';
import { Operations } from './pages/Operations';
import { OperationDetail } from './pages/OperationDetail';
import { Report } from './pages/Report';
import { Routes as RoutesPage } from './pages/Routes';
import { RouteDetail } from './pages/RouteDetail';
import { RunDetail } from './pages/RunDetail';
import { Aussendienst, EinsatzRedirect } from './aussendienst/Aussendienst';
import { Onboarding } from './Onboarding';
import { supabaseBackend } from './einsatz/backend';
import { EinsatzCtx } from './einsatz/context';
import { listDraftPropertyIds, listPending } from './einsatz/store';
import { hasActiveRun, listPendingRuns } from './aussendienst/runStore';
import { registerLogoutCount } from '../lib/logoutGuard';
import { installWebApp } from '../lib/pwa';
import { roleLabel } from '../lib/orgApi';
import { OBJEKTDEX_OEFFENTLICH } from '../lib/ganzjahr';
import { dankeschoenApi } from '../lib/gutschein';
import { GratisBanner } from './GratisHinweise';
import { MitteilungenProvider, MitteilungsGlocke } from './MitteilungsCenter';
import { MitteilungenSeite } from './pages/Mitteilungen';

// Abmelde-Rückfrage auf ALLEN WinterDex-Seiten (auch im Dashboard), nicht nur im Außendienst: wartende Einsätze und
// Fahrten, angefangene Einsätze und eine unterbrochene Aufzeichnung liegen nur auf diesem Gerät.
registerLogoutCount(
  'winterdex-aussendienst',
  'winterdex',
  async (userId) =>
    (await listPending(userId)).length +
    (await listDraftPropertyIds(userId)).length +
    (await listPendingRuns(userId)).length +
    ((await hasActiveRun(userId)) ? 1 : 0),
);

// Außendienst mit Beispieldaten — nur im Dev-Server (/app/winterdex/aussendienst?demo), fehlt im Produktions-Build.
const EinsatzDemo = import.meta.env.DEV
  ? lazy(() => import('./einsatz/demo').then((m) => ({ default: m.EinsatzDemoArea })))
  : null;

// Objekte importieren (Excel/CSV) erst beim Öffnen laden — der Leser braucht Teile des InstallateurDex-Imports.
const PropertyImport = lazy(() => import('./pages/PropertyImport').then((m) => ({ default: m.PropertyImport })));

// „Nach dem Winter weitermachen“ (Ganzjahres-Brücke) — Eintrag UND Adresse erst, wenn ObjektDex öffentlich ist (lib/ganzjahr.ts)
const NachDemWinter = lazy(() => import('./pages/NachDemWinter').then((m) => ({ default: m.NachDemWinter })));

// „Dein Dankeschön“ (Jahresabo-Dankeschön, 25.11.2026): Adresse immer erreichbar, Eintrag links nur für Berechtigte.
const Dankeschoen = lazy(() => import('./pages/Dankeschoen').then((m) => ({ default: m.Dankeschoen })));

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
  // Platz für die Mitteilungs-Glocke in der Kopfzeile: AppArea zeichnet die Kopfzeile außerhalb des Betriebs-Kontexts,
  // die Glocke (MitteilungsCenter.tsx) hängt sich per Portal hier hinein — nur im WinterDex-Bereich, nie in anderen Apps.
  const [glockenPlatz, setGlockenPlatz] = useState<HTMLElement | null>(null);
  if (EinsatzDemo && demoWanted()) return <EinsatzDemo app={app} />;
  return (
    <AppArea
      app={app}
      headerAction={
        <>
          <span className="mt-platz" ref={setGlockenPlatz} />
          <ModeSwitch />
        </>
      }
    >
      <OrgProvider>
        <OrgGate noOrg={<Onboarding />}>
          {/* Mitteilungs-Center: ein Abruf (meine_mitteilungen) für Glocke, Liste und Box; ohne Nachtrag keine Glocke */}
          <MitteilungenProvider base={`/app/${app.id}`}>
            <MitteilungsGlocke platz={glockenPlatz} />
            <Routes>
              <Route path="aussendienst/*" element={<EinsatzScope><Aussendienst /></EinsatzScope>} />
              <Route path="einsatz" element={<EinsatzRedirect to={`/app/${app.id}/aussendienst`} />} />
              <Route path="einsatz/:id" element={<EinsatzRedirect to={`/app/${app.id}/aussendienst`} />} />
              <Route element={<Shell />}>
                <Route index element={<Overview />} />
                <Route path="objekte" element={<Properties />} />
                <Route
                  path="objekte/import"
                  element={
                    <Suspense
                      fallback={
                        <div className="empty">
                          <span className="spinner" />
                        </div>
                      }
                    >
                      <PropertyImport />
                    </Suspense>
                  }
                />
                <Route path="objekte/:id" element={<PropertyDetail />} />
                <Route path="einsaetze" element={<Operations />} />
                <Route path="einsaetze/:id" element={<OperationDetail />} />
                <Route path="strecken" element={<RoutesPage />} />
                <Route path="strecken/fahrten/:id" element={<RunDetail />} />
                <Route path="strecken/:id" element={<RouteDetail />} />
                <Route path="team" element={<TeamPage />} />
                <Route path="bericht" element={<Report />} />
                {/* eine Mitteilung öffnet sich als Box über der Seite (MitteilungsCenter.tsx) — keine eigene Detail-Adresse */}
                <Route path="mitteilungen" element={<MitteilungenSeite />} />
                <Route path="abo" element={<AboPage />} />
                <Route path="rueckmeldungen" element={<NurDexware><FeedbackAdminPage /><FeedbackZentral /></NurDexware>} />
                <Route path="rueckmeldung" element={<FeedbackForm />} />
                <Route
                  path="dankeschoen"
                  element={
                    <Suspense
                      fallback={
                        <div className="empty">
                          <span className="spinner" />
                        </div>
                      }
                    >
                      <Dankeschoen />
                    </Suspense>
                  }
                />
                {OBJEKTDEX_OEFFENTLICH && (
                  <Route
                    path="nach-dem-winter"
                    element={
                      <Suspense
                        fallback={
                          <div className="empty">
                            <span className="spinner" />
                          </div>
                        }
                      >
                        <NachDemWinter />
                      </Suspense>
                    }
                  />
                )}
              </Route>
            </Routes>
          </MitteilungenProvider>
        </OrgGate>
      </OrgProvider>
    </AppArea>
  );
}

/**
 * Umschalter oben rechts: vom Dashboard (Büro, großer Bildschirm) in den Außendienst (Handy-Ansicht wie die App:
 * Einsatz erfassen, Strecke fahren) und zurück.
 */
function ModeSwitch() {
  const { app } = useAppAuth();
  const { pathname } = useLocation();
  const field = pathname.startsWith(`/app/${app.id}/aussendienst`);
  return field ? (
    <Link className="btn ghost small" to={`/app/${app.id}`} title="Zurück zum Dashboard (Büro)">
      <Monitor className="i" aria-hidden /> Dashboard
    </Link>
  ) : (
    <Link className="btn small mode-field" to={`/app/${app.id}/aussendienst`} title="Handy-Ansicht: Einsatz erfassen und Strecke fahren">
      <Truck className="i" aria-hidden /> Außendienst
    </Link>
  );
}

/**
 * Rückmeldungen lesen nur Dexware-Konten (app_admin). Die Adresse ist erreichbar, deshalb hier vorab fragen: Sonst
 * schickte jeder Besuch die Anmeldung des Nutzers an den Suite-Server (Block „Übrige Apps“), nur um ein Nein zu hören.
 */
function NurDexware({ children }: { children: ReactNode }) {
  const { client } = useAppAuth();
  const admin = useAsync<boolean>(() => fetchFeedbackAdmin(client), [client]);
  if (admin.loading) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }
  if (admin.data !== true) return <div className="info-box">Diese Seite ist nur für das Dexware-Team.</div>;
  return <>{children}</>;
}

/** Stellt dem Außendienst Server-Zugriff, Konto und Betrieb bereit. */
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
            base: `/app/${app.id}/aussendienst`,
            propertiesUrl: `/app/${app.id}/objekte`,
            dashboardUrl: `/app/${app.id}`,
            owner: data?.role === 'owner',
          }
        : null,
    [client, app, userId, orgId, data?.role],
  );
  if (!value) return null;
  return <EinsatzCtx.Provider value={value}>{children}</EinsatzCtx.Provider>;
}

/**
 * „Zum Home-Bildschirm“: Symbol und Name von WinterDex statt des allgemeinen Dashboards, solange dieser Bereich offen
 * ist (Safari liest beides beim Hinzufügen aus der Seite). Dazu Manifest (Start im Außendienst, eigenes Fenster) und
 * Service Worker: Das Symbol öffnet dann auch ohne Netz (public/winterdex.webmanifest, pwa/sw.js).
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
    const removeWebApp = installWebApp({ manifest: '/winterdex.webmanifest', scope: '/app/winterdex' });
    return () => {
      meta.remove();
      removeWebApp();
      if (icon && beforeIcon) icon.setAttribute('href', beforeIcon);
      document.title = beforeTitle;
    };
  }, []);
}

function Shell() {
  const { app, client } = useAppAuth();
  // Nur für Dexware selbst (Konten aus app_admin): Rückmeldungen aus der App lesen und bedanken.
  const admin = useAsync<boolean>(() => fetchFeedbackAdmin(client), [client]);
  // Eintrag „Dein Dankeschön“ nur für Jahreskunden bzw. wer schon einen Code hat (Server nicht erreichbar → ausgeblendet)
  const dank = useAsync<boolean>(async () => {
    try {
      const s = await dankeschoenApi(async () => (await client.auth.getSession()).data.session?.access_token).status();
      return s.berechtigt || !!s.gutschein;
    } catch {
      return false;
    }
  }, [client]);
  const { data } = useOrg();
  const { pathname } = useLocation();
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
        {(dank.data === true || pathname.startsWith(`${base}/dankeschoen`)) && (
          <NavLink to={`${base}/dankeschoen`}><Gift className="i" aria-hidden /> Dein Dankeschön</NavLink>
        )}
        {OBJEKTDEX_OEFFENTLICH && (
          <NavLink to={`${base}/nach-dem-winter`}><Sprout className="i" aria-hidden /> Nach dem Winter</NavLink>
        )}
        <NavLink to={`${base}/rueckmeldung`}><MessageSquare className="i" aria-hidden /> Fehler melden</NavLink>
        {admin.data === true && (
          <NavLink to={`${base}/rueckmeldungen`}><MessageSquare className="i" aria-hidden /> Rückmeldungen</NavLink>
        )}
        <div className="nav-footer">
          {data && (
            <>
              <b>{data.org.name}</b>
              <br />
              Rolle: {roleLabel(data.role)}
            </>
          )}
        </div>
      </nav>
      <main className="app-main">
        {/* Gratis nach Ablauf von Pro: Nachfrist bzw. „wähle deine 2 Objekte“ (ohne Server-Nachtrag: nichts) */}
        <GratisBanner aboUrl={`${base}/abo`} />
        {/* Navigation links bleibt stehen, wenn eine Seite (z. B. der nachgeladene Import) nicht lädt */}
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
