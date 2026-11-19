// Außendienst — die Handy-Ansicht von WinterDex im Browser (Übergang fürs iPhone, solange es die App dort nicht gibt).
// Bewusst getrennt vom Dashboard: eigene Oberfläche mit großen Tippflächen und Reitern wie in der App
// (Objekte, Strecken, Karte, Einsätze, Mehr). Einsätze, Nachweis-PDF, Team, Abo und Objektverwaltung sind dieselben Seiten
// wie im Dashboard (eine Quelle), nur im Handy-Rahmen — niemand muss fürs PDF die Ansicht wechseln.
// Das Dashboard bleibt das Werkzeug fürs Büro; gewechselt wird oben rechts.
import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Building2, Map as MapIcon, Menu, Route as RouteIcon, Snowflake } from 'lucide-react';
import { TeamPage } from '../../components/TeamPage';
import { AboPage } from '../../components/AboPage';
import { Operations } from '../pages/Operations';
import { OperationDetail } from '../pages/OperationDetail';
import { Properties } from '../pages/Properties';
import { PropertyDetail } from '../pages/PropertyDetail';
import { Report } from '../pages/Report';
import { RunDetail } from '../pages/RunDetail';
import { Mehr } from './Mehr';

// Karte mit Leaflet: eigener Chunk, erst beim Öffnen des Reiters geladen.
const Karte = lazy(() => import('./Karte'));
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
    : ['mehr', 'bericht', 'team', 'abo', 'objekte'].includes(rest.split('/')[1] ?? '') ? 'mehr' : 'objekte';
  // Nur auf den Erfassungs-Seiten nötig; auf Listen/PDF/Team stört der PC-Hinweis.
  const fieldPage = tab === 'objekte' || tab === 'strecken';
  // Während einer laufenden Fahrt keine Reiter: ein Fehlgriff würde die Aufzeichnung verlassen.
  const recording = /\/strecken\/(frei|[^/]+\/fahren)$/.test(pathname);

  return (
    <div className={`ad${recording ? ' ad-full' : ''}`}>
      <main className="ad-main">
        {!recording && fieldPage && (
          <div className="info-box ad-pc-hint">
            Der Außendienst ist fürs Handy gedacht. Am PC ist der Standort meist ungenau (Ortung über WLAN statt GPS) —
            Einsätze und Fahrten vor Ort bitte mit dem Handy erfassen. Fürs Büro gibt es oben rechts das Dashboard.
          </div>
        )}
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
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
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

/** Alte Adresse der ersten Fassung (/einsatz, /einsatz/<Objekt>) → Außendienst. */
export function EinsatzRedirect({ to }: { to: string }) {
  const { id } = useParams();
  return <Navigate to={id ? `${to}/objekt/${id}` : to} replace />;
}
