// Außendienst — die Handy-Ansicht von WinterDex im Browser (Übergang fürs iPhone, solange es die App dort nicht gibt).
// Bewusst getrennt vom Dashboard: eigene Oberfläche mit großen Tippflächen und zwei Reitern wie in der App
// (Objekte, Strecken). Das Dashboard bleibt das Werkzeug fürs Büro; gewechselt wird oben rechts.
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Building2, Route as RouteIcon } from 'lucide-react';
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
  const inRoutes = pathname.startsWith(`${base}/strecken`);
  // Während einer laufenden Fahrt keine Reiter: ein Fehlgriff würde die Aufzeichnung verlassen.
  const recording = /\/strecken\/(frei|[^/]+\/fahren)$/.test(pathname);

  return (
    <div className={`ad${recording ? ' ad-full' : ''}`}>
      <main className="ad-main">
        {!recording && (
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
          <Route path="strecken/:id" element={<StreckeDetail />} />
          <Route path="strecken/:id/fahren" element={<StreckeFahren />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </main>
      {!recording && (
        <nav className="ad-tabs" aria-label="Außendienst">
          <NavLink to={base} className={() => (inRoutes ? '' : 'active')}>
            <Building2 className="i" aria-hidden />
            Objekte
          </NavLink>
          <NavLink to={`${base}/strecken`} className={() => (inRoutes ? 'active' : '')}>
            <RouteIcon className="i" aria-hidden />
            Strecken
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
