// Auswertungen des Betriebsportals — wie in der App (Einstellungen → „Neue Kunden & Berichte“):
// Garantie-Wächter, Heizungstausch-Radar, Kältemittel-Jahresbericht, dazu der Inhalt des Wochenbriefings.
// Rechte wie die App: Garantie-Wächter für alle (Monteure kommen über „Zu erledigen“ dorthin), der Rest nur Inhaber.

import type { ReactElement } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useInst } from '../context';
import { Garantie } from './Garantie';
import { Kaeltemittel } from './Kaeltemittel';
import { Radar } from './Radar';
import { Woche } from './Woche';
import './auswertung.css';

const TABS = [
  { path: 'garantie', label: '🛡️ Garantie-Wächter', owner: false },
  { path: 'heizungstausch', label: '🔥 Heizungstausch', owner: true },
  { path: 'kaeltemittel', label: '❄️ Kältemittel-Jahresbericht', owner: true },
  { path: 'woche', label: '📋 Diese Woche', owner: true },
] as const;

const INTRO: Record<(typeof TABS)[number]['path'], string> = {
  garantie: 'Gefährdete und auslaufende Garantien — Wartungsvertrag anbieten.',
  heizungstausch: 'Alte Öl-/Gasanlagen im Bestand — Tausch ansprechen.',
  kaeltemittel: 'Eingefüllt, zurückgewonnen, Dichtheitskontrollen — alle Kunden.',
  woche: 'Fällig bis Sonntag, gefährdete Garantien, Wartungsumsatz und offene Folgeeinsätze.',
};

function OwnerOnly() {
  return <div className="info-box">Diese Auswertung sieht nur der Inhaber des Betriebs — wie in der App.</div>;
}

export function Auswertungen() {
  const { base, isOwner } = useInst();
  const root = `${base}/auswertungen`;
  const tabs = TABS.filter((t) => isOwner || !t.owner);

  const page = (path: (typeof TABS)[number]['path'], el: ReactElement, owner: boolean) => (
    <>
      <p className="muted aw-intro">{INTRO[path]}</p>
      {owner && !isOwner ? <OwnerOnly /> : el}
    </>
  );

  return (
    <div className="aw">
      <h1>Auswertungen</h1>
      {tabs.length > 1 && (
        <nav className="aw-tabs" aria-label="Auswertungen">
          {tabs.map((t) => (
            <NavLink key={t.path} to={`${root}/${t.path}`} className={({ isActive }) => (isActive ? 'on' : '')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
      <Routes>
        <Route index element={<Navigate to={`${root}/garantie`} replace />} />
        <Route path="garantie" element={page('garantie', <Garantie />, false)} />
        <Route path="heizungstausch" element={page('heizungstausch', <Radar />, true)} />
        <Route path="kaeltemittel" element={page('kaeltemittel', <Kaeltemittel />, true)} />
        <Route path="woche" element={page('woche', <Woche />, true)} />
        <Route path="*" element={<Navigate to={`${root}/garantie`} replace />} />
      </Routes>
    </div>
  );
}
