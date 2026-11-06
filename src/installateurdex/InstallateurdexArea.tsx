// InstallateurDex-Betriebsportal (Phase 3, siehe InstallateurDex/ROADMAP.md Teil B2).
// Normale Anmeldung wie alle Dashboards. Nur im Dev-Server: /app/installateurdex?demo → Beispieldaten ohne
// Anmeldung (bleibt für die Sitzung des Tabs, ?demo=0 beendet sie). Im Produktions-Build gibt es das nicht.

import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import type { AppConfig } from '../apps/registry';
import { AppArea } from '../components/AppArea';
import { OrgGate, OrgProvider } from '../components/OrgContext';
import { RealInstProvider } from './context';
import { PortalRoutes } from './Portal';
import './installateurdex.css';

// Nur im Dev-Server: Beispieldaten-Bereich als eigener Chunk (fehlt im Produktions-Build).
const DemoArea = import.meta.env.DEV
  ? lazy(() => import('./DemoArea').then((m) => ({ default: m.DemoArea })))
  : null;

/** Dev-Server: Beispieldaten gewünscht? (?demo setzt, ?demo=0 löscht — gilt für den Tab) */
function wantsDemo(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const q = new URLSearchParams(window.location.search).get('demo');
    if (q === '0') sessionStorage.removeItem('idx-demo');
    else if (q !== null) sessionStorage.setItem('idx-demo', '1');
    return sessionStorage.getItem('idx-demo') === '1';
  } catch {
    return false;
  }
}

export function InstallateurdexArea({ app }: { app: AppConfig }) {
  if (!app.supabase || wantsDemo()) {
    return DemoArea ? (
      <Suspense
        fallback={
          <div className="empty">
            <span className="spinner" />
          </div>
        }
      >
        <DemoArea app={app} />
      </Suspense>
    ) : (
      <div className="page">
        <div className="info-box">
          Das {app.name}-Betriebsportal ist noch nicht freigeschaltet. <Link to="/">Zurück zur Übersicht</Link>
        </div>
      </div>
    );
  }
  return (
    <AppArea app={app}>
      <OrgProvider>
        <OrgGate>
          <RealInstProvider app={app}>
            <PortalRoutes />
          </RealInstProvider>
        </OrgGate>
      </OrgProvider>
    </AppArea>
  );
}
