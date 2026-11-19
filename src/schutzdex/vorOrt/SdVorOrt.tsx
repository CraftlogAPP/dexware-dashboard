// „Vor Ort“ für SchutzDex — die Handy-Ansicht im Browser (z. B. fürs iPhone, solange es die App dort nicht gibt).
// SchutzDex hat ein eigenes Modell (Unterweisung → Mitarbeiter → unterschriebener Nachweis; kein GPS, keine Fotos,
// kein Team) — deshalb eine eigene Durchführung statt des Prüf-Moduls src/pruefen. Von dort kommen nur der Rahmen
// (Klassen .ad-* / .ez-*), der Umschalter oben rechts, das Home-Bildschirm-Symbol und die Zeichenfläche.
// Reiter unten wie in der App (ohne „Übersicht“ und „Gefährdung“, die es nur dort gibt): Unterweisungen,
// Mitarbeiter, Mehr. Nachweise, Mitarbeiter verwalten und Abo sind dieselben Seiten wie im Dashboard (eine Quelle),
// nur im Handy-Rahmen — ihre Unterpfade heißen wie im Dashboard (nachweise, mitarbeiter, unterweisungen).
import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BookOpenCheck, Menu, Users } from 'lucide-react';
import { useSd } from './context';
import { Durchfuehren, Unterweisung } from './Durchfuehren';
import { Mitarbeiter, Unterweisungen } from './Listen';
import { Mehr } from './Mehr';

/** Vorhandene Dashboard-Seiten, die im Handy-Rahmen eingebunden werden. */
export interface SdVorOrtPages {
  members: ReactNode;
  briefings: ReactNode;
  completions: ReactNode;
  abo: ReactNode;
}

/** Erwartet den Kontext (SdCtx) vom Aufrufer. */
export function SdVorOrt({ pages }: { pages: SdVorOrtPages }) {
  const { base } = useSd();
  const { pathname } = useLocation();
  const first = pathname.slice(base.length).split('/')[1] ?? '';
  const tab = first === 'team' ? 'team' : ['mehr', 'mitarbeiter', 'unterweisungen', 'nachweise', 'abo'].includes(first) ? 'mehr' : 'unterweisungen';

  return (
    <div className="ad">
      <main className="ad-main">
        <Routes>
          <Route index element={<Unterweisungen />} />
          <Route path="unterweisung/:id" element={<Unterweisung />} />
          <Route path="durchfuehren/:id" element={<Durchfuehren />} />
          <Route path="team" element={<Mitarbeiter />} />
          <Route path="mitarbeiter" element={pages.members} />
          <Route path="unterweisungen" element={pages.briefings} />
          <Route path="nachweise" element={pages.completions} />
          <Route path="abo" element={pages.abo} />
          <Route path="mehr" element={<Mehr />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </main>
      <nav className="ad-tabs" aria-label="Vor Ort">
        <NavLink to={base} className={() => (tab === 'unterweisungen' ? 'active' : '')}>
          <BookOpenCheck className="i" aria-hidden />
          Unterweisungen
        </NavLink>
        <NavLink to={`${base}/team`} className={() => (tab === 'team' ? 'active' : '')}>
          <Users className="i" aria-hidden />
          Mitarbeiter
        </NavLink>
        <NavLink to={`${base}/mehr`} className={() => (tab === 'mehr' ? 'active' : '')}>
          <Menu className="i" aria-hidden />
          Mehr
        </NavLink>
      </nav>
    </div>
  );
}
