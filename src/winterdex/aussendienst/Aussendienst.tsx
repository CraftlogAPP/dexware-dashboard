// Außendienst — die Handy-Ansicht von WinterDex im Browser (Übergang fürs iPhone, solange es die App dort nicht gibt).
// Bewusst getrennt vom Dashboard: eigene Oberfläche mit großen Tippflächen und Reitern wie in der App
// (Objekte, Strecken, Karte, Einsätze, Mehr). Einsätze, Nachweis-PDF, Team, Abo und Objektverwaltung sind dieselben Seiten
// wie im Dashboard (eine Quelle), nur im Handy-Rahmen — niemand muss fürs PDF die Ansicht wechseln.
// Das Dashboard bleibt das Werkzeug fürs Büro; gewechselt wird oben rechts.
import { lazy, Suspense, useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Building2, Map as MapIcon, Menu, Route as RouteIcon, Snowflake } from 'lucide-react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { TeamPage } from '../../components/TeamPage';
import { AboPage } from '../../components/AboPage';
import { Operations } from '../pages/Operations';
import { OperationDetail } from '../pages/OperationDetail';
import { Properties } from '../pages/Properties';
import { PropertyDetail } from '../pages/PropertyDetail';
import { Report } from '../pages/Report';
import { RunDetail } from '../pages/RunDetail';
import { Mehr } from './Mehr';
import { FeedbackForm } from '../../components/FeedbackForm';
import { GratisBanner } from '../GratisHinweise';
import { useAppAuthOptional } from '../../auth/AppAuthContext';
import { useOrgOptional } from '../../components/OrgContext';
import { HeuteNacht } from '../HeuteNacht';
import { nachweisZone } from '../nachweisZeit';

// Karte mit Leaflet: eigener Chunk, erst beim Öffnen des Reiters geladen — aber nach dem Start im Leerlauf schon
// vorgeladen (solange Netz da ist): dann öffnet der Reiter später auch im Funkloch, selbst ohne Service Worker.
const loadKarte = () => import('./Karte');
const Karte = lazy(loadKarte);
import { useEinsatz } from '../einsatz/context';
import { Einsatz } from '../pages/Einsatz';
import { EinsatzErfassen } from '../pages/EinsatzErfassen';
import { Strecken } from './Strecken';
import { StreckeFahren } from './StreckeFahren';
import { StreckeDetail } from './StreckeDetail';

/** Erwartet den Einsatz-Kontext (Server-Zugriff, Konto, Betrieb) vom Aufrufer. */
export function Aussendienst() {
  const { base } = useEinsatz();
  const { pathname } = useLocation();
  const rest = pathname.slice(base.length);
  const tab = rest.startsWith('/strecken') ? 'strecken' : rest.startsWith('/einsaetze') ? 'einsaetze' : rest.startsWith('/karte') ? 'karte'
    : ['mehr', 'bericht', 'team', 'abo', 'objekte', 'rueckmeldung'].includes(rest.split('/')[1] ?? '') ? 'mehr' : 'objekte';
  // Nur auf den Erfassungs-Seiten nötig; auf Listen/PDF/Team stört der PC-Hinweis.
  const fieldPage = tab === 'objekte' || tab === 'strecken';
  // Während einer laufenden Fahrt keine Reiter: ein Fehlgriff würde die Aufzeichnung verlassen.
  const recording = /\/strecken\/(frei|[^/]+\/fahren)$/.test(pathname);

  useEffect(() => {
    if (!navigator.onLine) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    const load = () => void loadKarte().catch(() => undefined);
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(load);
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(load, 3000); // Safari kennt requestIdleCallback nicht
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className={`ad${recording ? ' ad-full' : ''}`}>
      <main className="ad-main">
        {/* Gratis nach Ablauf von Pro (nicht während einer Aufzeichnung — dort zählt nur die Fahrt) */}
        {!recording && <GratisBanner aboUrl={`${base}/abo`} />}
        {/* Wetter-Guide: Karte „Heute Nacht“ eingeklappt oben auf der Objektliste (iPhone-Kollegen, Bauplan P4) */}
        {!recording && tab === 'objekte' && (rest === '' || rest === '/') && <AussendienstWetter base={base} />}
        {!recording && fieldPage && (
          <div className="info-box ad-pc-hint">
            Der Außendienst ist fürs Handy gedacht. Am PC ist der Standort meist ungenau (Ortung über WLAN statt GPS) —
            Einsätze und Fahrten vor Ort bitte mit dem Handy erfassen. Fürs Büro gibt es oben rechts das Dashboard.
          </div>
        )}
        {/* Fehlergrenze INNERHALB des Inhalts: die Reiter bleiben stehen, ein Reiterwechsel zeigt wieder normal an */}
        <ErrorBoundary
          resetKey={pathname}
          home={tab !== 'objekte' ? { to: base, label: 'Zu den Objekten' } : undefined}
          note="Erfasste Einsätze und Fahrten bleiben auf diesem Gerät gesichert."
        >
          <Routes>
            <Route index element={<Einsatz />} />
            <Route path="objekt/:id" element={<EinsatzErfassen />} />
            <Route path="strecken" element={<Strecken />} />
            <Route path="strecken/frei" element={<StreckeFahren />} />
            <Route path="strecken/fahrten/:id" element={<RunDetail />} />
            <Route path="strecken/:id" element={<StreckeDetail />} />
            <Route path="strecken/:id/fahren" element={<StreckeFahren />} />
            <Route path="karte" element={<Suspense fallback={<p className="muted">Karte wird geladen …</p>}><Karte /></Suspense>} />
            <Route path="einsaetze" element={<Operations />} />
            <Route path="einsaetze/:id" element={<OperationDetail />} />
            <Route path="objekte" element={<Properties />} />
            <Route path="objekte/:id" element={<PropertyDetail />} />
            <Route path="bericht" element={<Report />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="abo" element={<AboPage />} />
            <Route path="mehr" element={<Mehr />} />
            <Route path="rueckmeldung" element={<FeedbackForm />} />
            <Route path="*" element={<Navigate to={base} replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      {!recording && (
        <nav className="ad-tabs" aria-label="Außendienst">
          <NavLink to={base} className={() => (tab === 'objekte' ? 'active' : '')}>
            <Building2 className="i" aria-hidden />
            Objekte
          </NavLink>
          <NavLink to={`${base}/strecken`} className={() => (tab === 'strecken' ? 'active' : '')}>
            <RouteIcon className="i" aria-hidden />
            Strecken
          </NavLink>
          <NavLink to={`${base}/karte`} className={() => (tab === 'karte' ? 'active' : '')}>
            <MapIcon className="i" aria-hidden />
            Karte
          </NavLink>
          <NavLink to={`${base}/einsaetze`} className={() => (tab === 'einsaetze' ? 'active' : '')}>
            <Snowflake className="i" aria-hidden />
            Einsätze
          </NavLink>
          <NavLink to={`${base}/mehr`} className={() => (tab === 'mehr' ? 'active' : '')}>
            <Menu className="i" aria-hidden />
            Mehr
          </NavLink>
        </nav>
      )}
    </div>
  );
}

/** Karte „Heute Nacht“ im Außendienst — nur mit Anmeldung (Beispieldaten ohne Server: keine Karte). */
function AussendienstWetter({ base }: { base: string }) {
  const auth = useAppAuthOptional();
  const org = useOrgOptional()?.data ?? null;
  if (!auth || !org) return null;
  return (
    <HeuteNacht
      client={auth.client}
      orgId={org.org.id}
      land={org.org.land}
      rolle={org.role}
      tz={nachweisZone(org.org.land)}
      links={{ objekte: `${base}/objekte`, team: `${base}/team`, abo: `${base}/abo` }}
      eingeklappt
    />
  );
}

/** Alte Adresse der ersten Fassung (/einsatz, /einsatz/<Objekt>) → Außendienst. */
export function EinsatzRedirect({ to }: { to: string }) {
  const { id } = useParams();
  return <Navigate to={id ? `${to}/objekt/${id}` : to} replace />;
}
