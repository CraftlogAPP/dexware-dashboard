// „Vor Ort“ für KfzDex — die Handy-Ansicht im Browser (z. B. fürs iPhone, solange es die App dort nicht gibt).
// KfzDex hat ein eigenes Modell (Fahrzeuge + Fahrer statt Standort/Einheit/Prüfung/Mangel, kein GPS, keine Unterschrift,
// keine Fotos am Server) — deshalb eine schlanke eigene Erfassung statt des Prüf-Moduls src/pruefen. Von dort kommen
// nur der Rahmen (Klassen .ad-* / .ez-*), der Umschalter oben rechts und das Home-Bildschirm-Symbol.
// Reiter unten wie in der App: Fahrzeuge (UVV-Prüfung), Fahrer (Führerscheinkontrolle), Mehr.
// Fahrzeuge/Fahrer verwalten, Team und Abo sind dieselben Seiten wie im Dashboard (eine Quelle), nur im Handy-Rahmen —
// ihre Unterpfade heißen wie im Dashboard (fahrzeuge, fahrer), damit deren relative Links im Rahmen bleiben.
import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { IdCard, Menu, Truck } from 'lucide-react';
import { useKfz } from './context';
import { Kontrolle, UvvPruefen } from './Erfassen';
import { FahrerListe, Fahrzeuge } from './Listen';
import { Mehr } from './Mehr';

/** Vorhandene Dashboard-Seiten, die im Handy-Rahmen eingebunden werden. */
export interface KfzVorOrtPages {
  vehicles: ReactNode;
  vehicleDetail: ReactNode;
  drivers: ReactNode;
  driverDetail: ReactNode;
  team: ReactNode;
  abo: ReactNode;
}

/** Erwartet den Kontext (KfzCtx) vom Aufrufer. */
export function KfzVorOrt({ pages }: { pages: KfzVorOrtPages }) {
  const { base } = useKfz();
  const { pathname } = useLocation();
  const first = pathname.slice(base.length).split('/')[1] ?? '';
  const tab = first === 'kontrollen' || first === 'kontrolle' ? 'fahrer' : ['mehr', 'fahrzeuge', 'fahrer', 'team', 'abo'].includes(first) ? 'mehr' : 'fahrzeuge';

  return (
    <div className="ad">
      <main className="ad-main">
        <Routes>
          <Route index element={<Fahrzeuge />} />
          <Route path="uvv/:id" element={<UvvPruefen />} />
          <Route path="kontrollen" element={<FahrerListe />} />
          <Route path="kontrolle/:id" element={<Kontrolle />} />
          <Route path="fahrzeuge" element={pages.vehicles} />
          <Route path="fahrzeuge/:id" element={pages.vehicleDetail} />
          <Route path="fahrer" element={pages.drivers} />
          <Route path="fahrer/:id" element={pages.driverDetail} />
          <Route path="team" element={pages.team} />
          <Route path="abo" element={pages.abo} />
          <Route path="mehr" element={<Mehr />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </main>
      <nav className="ad-tabs" aria-label="Vor Ort">
        <NavLink to={base} className={() => (tab === 'fahrzeuge' ? 'active' : '')}>
          <Truck className="i" aria-hidden />
          Fahrzeuge
        </NavLink>
        <NavLink to={`${base}/kontrollen`} className={() => (tab === 'fahrer' ? 'active' : '')}>
          <IdCard className="i" aria-hidden />
          Fahrer
        </NavLink>
        <NavLink to={`${base}/mehr`} className={() => (tab === 'mehr' ? 'active' : '')}>
          <Menu className="i" aria-hidden />
          Mehr
        </NavLink>
      </nav>
    </div>
  );
}
