// „Vor Ort“ für PrüfDex — die Handy-Ansicht im Browser (z. B. fürs iPhone, solange es die App dort nicht gibt).
// PrüfDex hat ein eigenes Modell (Kunde → Gerät → Prüfung mit Sichtprüfung, Messwerten und Gesamtergebnis, keine
// Mängel-Tabelle, Prüfdatum statt Zeitstempel) — deshalb eine eigene Erfassung statt des Prüf-Moduls src/pruefen.
// Von dort kommen der Rahmen (Klassen .ad-* / .ez-* / .pv-*), der Umschalter oben rechts, das Home-Bildschirm-Symbol,
// die Unterschrift, der GPS-Stempel und die Foto-Aufbereitung.
// Reiter unten wie in der App: Geräte, Fristen, Kunden, Mehr.
// Geräte/Kunden verwalten, Prüfungen, Sammelbericht und Abo sind dieselben Seiten wie im Dashboard (eine Quelle),
// nur im Handy-Rahmen — ihre Unterpfade heißen wie im Dashboard (geraete, kunden, pruefungen, bericht), damit deren
// relative Links im Rahmen bleiben.
import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Building2, CalendarClock, Menu, Plug } from 'lucide-react';
import { usePd } from './context';
import { Fristen, Geraete, Kunden, Standort } from './Listen';
import { Mehr } from './Mehr';
import { Pruefen } from './Pruefen';

/** Vorhandene Dashboard-Seiten, die im Handy-Rahmen eingebunden werden. */
export interface PdVorOrtPages {
  devices: ReactNode;
  deviceDetail: ReactNode;
  customers: ReactNode;
  inspections: ReactNode;
  inspectionDetail: ReactNode;
  report: ReactNode;
  abo: ReactNode;
}

/** Erwartet den Kontext (PdCtx) vom Aufrufer. */
export function PdVorOrt({ pages }: { pages: PdVorOrtPages }) {
  const { base } = usePd();
  const { pathname } = useLocation();
  const first = pathname.slice(base.length).split('/')[1] ?? '';
  const tab =
    first === 'fristen' ? 'fristen'
    : first === 'standorte' || first === 'standort' ? 'kunden'
    : ['mehr', 'geraete', 'kunden', 'pruefungen', 'bericht', 'abo'].includes(first) ? 'mehr'
    : 'geraete';
  // Nur auf den Erfassungs-Seiten nötig; auf Listen/PDF/Abo stört der PC-Hinweis.
  const fieldPage = first === '' || first === 'pruefen';

  return (
    <div className="ad">
      <main className="ad-main">
        {fieldPage && (
          <div className="info-box ad-pc-hint">
            „Vor Ort“ ist fürs Handy gedacht. Am PC ist der Standort meist ungenau (Ortung über WLAN statt GPS) — Prüfungen
            bitte mit dem Handy direkt am Gerät erfassen. Fürs Büro gibt es oben rechts das Dashboard.
          </div>
        )}
        <Routes>
          <Route index element={<Geraete />} />
          <Route path="fristen" element={<Fristen />} />
          <Route path="standorte" element={<Kunden />} />
          <Route path="standort/:id" element={<Standort />} />
          <Route path="pruefen/:id" element={<Pruefen />} />
          <Route path="geraete" element={pages.devices} />
          <Route path="geraete/:id" element={pages.deviceDetail} />
          <Route path="kunden" element={pages.customers} />
          <Route path="pruefungen" element={pages.inspections} />
          <Route path="pruefungen/:id" element={pages.inspectionDetail} />
          <Route path="bericht" element={pages.report} />
          <Route path="abo" element={pages.abo} />
          <Route path="mehr" element={<Mehr />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </main>
      <nav className="ad-tabs" aria-label="Vor Ort">
        <NavLink to={base} className={() => (tab === 'geraete' ? 'active' : '')}>
          <Plug className="i" aria-hidden />
          Geräte
        </NavLink>
        <NavLink to={`${base}/fristen`} className={() => (tab === 'fristen' ? 'active' : '')}>
          <CalendarClock className="i" aria-hidden />
          Fristen
        </NavLink>
        <NavLink to={`${base}/standorte`} className={() => (tab === 'kunden' ? 'active' : '')}>
          <Building2 className="i" aria-hidden />
          Kunden
        </NavLink>
        <NavLink to={`${base}/mehr`} className={() => (tab === 'mehr' ? 'active' : '')}>
          <Menu className="i" aria-hidden />
          Mehr
        </NavLink>
      </nav>
    </div>
  );
}
