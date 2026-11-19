// „Vor Ort“ — die Handy-Ansicht einer Prüf-App im Browser (z. B. fürs iPhone, solange es die App dort nicht gibt).
// Bewusst getrennt vom Dashboard: große Tippflächen und Reiter unten wie in der App (Standorte, Prüfungen, Mängel,
// Mehr). Prüfungen, Mängel, Prüfbericht-PDF, Team, Abo und die Standort-Verwaltung sind dieselben Seiten wie im
// Dashboard (eine Quelle), nur im Handy-Rahmen. Gewechselt wird oben rechts.
// Rahmen und Reiter nutzen die Klassen .ad-* des WinterDex-Außendienstes (gleiche Optik in der ganzen Suite).
// Zwei Familien (cfg.mode): Im Einheiten-Modus führt ein Ort zu seinen Einheiten und von dort zur Prüfung; im
// Orts-Modus (GerüstDex, RegalDex, SpielDex) wird der Ort selbst geprüft — eigene Listen-Seiten (pages/Orte.tsx),
// dasselbe Formular (pages/Pruefen.tsx).
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Building2, ClipboardCheck, Menu, TriangleAlert } from 'lucide-react';
import { defectsPathOf, inspectionsPathOf, isSiteMode, sitesPathOf, wordsOf } from './config';
import { usePruef, type VorOrtPages } from './context';
import { Mehr } from './pages/Mehr';
import { Ort, Orte } from './pages/Orte';
import { Pruefen } from './pages/Pruefen';
import { Standort } from './pages/Standort';
import { Standorte } from './pages/Standorte';

/**
 * Erwartet den Kontext (PruefCtx) vom Aufrufer.
 * Die Unterpfade der eingebundenen Dashboard-Seiten heißen wie im Dashboard (standorte, pruefungen, maengel,
 * bericht) — deren relative Links („../pruefungen“, „../standorte/<id>“) bleiben so im Handy-Rahmen.
 * Heißt die Standort-Verwaltung in einer App anders (ToreDex: „objekte“), steht das in cfg.sitesPath; ebenso
 * cfg.inspectionsPath (RegalDex: „inspektionen“, SpielDex: „kontrollen“) und cfg.defectsPath (RegalDex: „schaeden“).
 */
export function VorOrt({ pages }: { pages: VorOrtPages }) {
  const { base, cfg } = usePruef();
  const { pathname } = useLocation();
  const first = pathname.slice(base.length).split('/')[1] ?? '';
  const sitesPath = sitesPathOf(cfg);
  const inspectionsPath = inspectionsPathOf(cfg);
  const defectsPath = defectsPathOf(cfg);
  const siteMode = isSiteMode(cfg);
  const W = wordsOf(cfg);
  const tab =
    first === inspectionsPath ? 'pruefungen'
    : first === defectsPath ? 'maengel'
    : ['mehr', 'bericht', 'team', 'abo', sitesPath].includes(first) ? 'mehr'
    : 'orte';
  // Nur auf den Erfassungs-Seiten nötig; auf Listen/PDF/Team stört der PC-Hinweis.
  const fieldPage = tab === 'orte';

  return (
    <div className="ad">
      <main className="ad-main">
        {fieldPage && (
          <div className="info-box ad-pc-hint">
            „Vor Ort“ ist fürs Handy gedacht. Am PC ist der Standort meist ungenau (Ortung über WLAN statt GPS) —{' '}
            {W.insp.many} bitte mit dem Handy direkt am Prüfort erfassen. Fürs Büro gibt es oben rechts das Dashboard.
          </div>
        )}
        <Routes>
          <Route index element={siteMode ? <Orte /> : <Standorte />} />
          <Route path="ort/:id" element={siteMode ? <Ort /> : <Standort />} />
          {/* Einheiten-Modus: ID der Einheit — Orts-Modus: ID des Orts */}
          <Route path="pruefen/:unitId" element={<Pruefen />} />
          <Route path={inspectionsPath} element={pages.inspections} />
          <Route path={`${inspectionsPath}/:id`} element={pages.inspectionDetail} />
          <Route path={defectsPath} element={pages.defects} />
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
        <NavLink to={`${base}/${inspectionsPath}`} className={() => (tab === 'pruefungen' ? 'active' : '')}>
          <ClipboardCheck className="i" aria-hidden />
          {W.insp.many}
        </NavLink>
        <NavLink to={`${base}/${defectsPath}`} className={() => (tab === 'maengel' ? 'active' : '')}>
          <TriangleAlert className="i" aria-hidden />
          {W.defect.many}
        </NavLink>
        <NavLink to={`${base}/mehr`} className={() => (tab === 'mehr' ? 'active' : '')}>
          <Menu className="i" aria-hidden />
          Mehr
        </NavLink>
      </nav>
    </div>
  );
}
