// „Vor Ort“ — die Handy-Ansicht einer Prüf-App im Browser (z. B. fürs iPhone, solange es die App dort nicht gibt).
// Bewusst getrennt vom Dashboard: große Tippflächen und Reiter unten wie in der App (Standorte, Prüfungen, Mängel,
// Mehr). Prüfungen, Mängel, Prüfbericht-PDF, Team, Abo und die Standort-Verwaltung sind dieselben Seiten wie im
// Dashboard (eine Quelle), nur im Handy-Rahmen. Gewechselt wird oben rechts.
// Rahmen und Reiter nutzen die Klassen .ad-* des WinterDex-Außendienstes (gleiche Optik in der ganzen Suite).
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Building2, ClipboardCheck, Menu, TriangleAlert } from 'lucide-react';
import { sitesPathOf } from './config';
import { usePruef, type VorOrtPages } from './context';
import { Mehr } from './pages/Mehr';
import { Pruefen } from './pages/Pruefen';
import { Standort } from './pages/Standort';
import { Standorte } from './pages/Standorte';

/**
 * Erwartet den Kontext (PruefCtx) vom Aufrufer.
 * Die Unterpfade der eingebundenen Dashboard-Seiten heißen wie im Dashboard (standorte, pruefungen, maengel,
 * bericht) — deren relative Links („../pruefungen“, „../standorte/<id>“) bleiben so im Handy-Rahmen.
 * Heißt die Standort-Verwaltung in einer App anders (ToreDex: „objekte“), steht das in cfg.sitesPath.
 */
export function VorOrt({ pages }: { pages: VorOrtPages }) {
  const { base, cfg } = usePruef();
  const { pathname } = useLocation();
  const first = pathname.slice(base.length).split('/')[1] ?? '';
  const sitesPath = sitesPathOf(cfg);
  const tab =
    first === 'pruefungen' ? 'pruefungen'
    : first === 'maengel' ? 'maengel'
    : ['mehr', 'bericht', 'team', 'abo', sitesPath].includes(first) ? 'mehr'
    : 'orte';
  // Nur auf den Erfassungs-Seiten nötig; auf Listen/PDF/Team stört der PC-Hinweis.
  const fieldPage = tab === 'orte';

  return (
    <div className="ad">
      <main className="ad-main">
        {fieldPage && (
          <div className="info-box ad-pc-hint">
            „Vor Ort“ ist fürs Handy gedacht. Am PC ist der Standort meist ungenau (Ortung über WLAN statt GPS) —
            Prüfungen bitte mit dem Handy direkt am Prüfort erfassen. Fürs Büro gibt es oben rechts das Dashboard.
          </div>
        )}
        <Routes>
          <Route index element={<Standorte />} />
          <Route path="ort/:id" element={<Standort />} />
          <Route path="pruefen/:unitId" element={<Pruefen />} />
          <Route path="pruefungen" element={pages.inspections} />
          <Route path="pruefungen/:id" element={pages.inspectionDetail} />
          <Route path="maengel" element={pages.defects} />
          <Route path={sitesPath} element={pages.sites} />
          <Route path={`${sitesPath}/:id`} element={pages.siteDetail} />
          <Route path="bericht" element={pages.report} />
          <Route path="team" element={pages.team} />
          <Route path="abo" element={pages.abo} />
          <Route path="mehr" element={<Mehr />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </main>
      <nav className="ad-tabs" aria-label="Vor Ort">
        <NavLink to={base} className={() => (tab === 'orte' ? 'active' : '')}>
          <Building2 className="i" aria-hidden />
          {cfg.labels.site.many}
        </NavLink>
        <NavLink to={`${base}/pruefungen`} className={() => (tab === 'pruefungen' ? 'active' : '')}>
          <ClipboardCheck className="i" aria-hidden />
          Prüfungen
        </NavLink>
        <NavLink to={`${base}/maengel`} className={() => (tab === 'maengel' ? 'active' : '')}>
          <TriangleAlert className="i" aria-hidden />
          Mängel
        </NavLink>
        <NavLink to={`${base}/mehr`} className={() => (tab === 'mehr' ? 'active' : '')}>
          <Menu className="i" aria-hidden />
          Mehr
        </NavLink>
      </nav>
    </div>
  );
}
