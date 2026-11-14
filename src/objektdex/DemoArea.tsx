// ObjektDex mit Beispieldaten, ohne Anmeldung — NUR im Dev-Server (lazy aus ObjektdexArea.tsx).
// …&sauber blendet den Beispieldaten-Hinweis aus (Bildschirmfotos), …&rolle=worker zeigt die Mitarbeiter-Sicht.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { appIcon, type AppConfig } from '../apps/registry';
import { OdProvider } from './context';
import { createDemoStore } from './demo';
import { OdRoutes } from './ObjektdexArea';
import type { OdRole } from './types';

export function DemoArea({ app }: { app: AppConfig }) {
  const params = new URLSearchParams(window.location.search);
  const [clean] = useState(() => params.has('sauber'));
  const [role, setRole] = useState<OdRole>(() => { const r = params.get('rolle'); return r === 'worker' || r === 'admin' ? r : 'owner'; });
  const [store] = useState(() => createDemoStore());
  const value = useMemo(() => ({ data: store.data, orgName: store.orgName, role, demo: true, base: `/app/${app.id}` }), [store, role, app.id]);
  const style = { '--accent': app.theme.accent, '--on-accent': app.theme.onAccent, '--bg': app.theme.bg } as React.CSSProperties;

  return (
    <div className="app-scope" style={style}>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Dexware Dashboard – alle Apps">
          <img src="/dexware.webp" alt="" width="28" height="28" />
          <span className="wm">
            Dex<span>ware</span>
          </span>
        </Link>
        <span className="header-sep" aria-hidden />
        <span className="app-chip">
          <img src={appIcon(app.id)} alt="" width="24" height="24" />
          {app.name} <span className="hide-sm">Dashboard</span>
        </span>
        <div className="spacer" />
        <Link className="btn ghost small" to="/" title="Haupteinstieg: alle App-Dashboards der Suite">
          <LayoutGrid className="i" aria-hidden />
          <span className="hide-sm">Alle Dashboards</span>
        </Link>
      </header>
      {!clean && (
        <div className="od-demo-banner" role="note">
          <span>
            <b>Beispieldaten</b> — nichts wird gespeichert. Nach dem Neuladen ist alles wie vorher.
          </span>
          <span className="row" style={{ gap: 6 }}>
            Ansicht:
            {(['owner', 'admin', 'worker'] as const).map((r) => (
              <button key={r} type="button" className={`btn small ${role === r ? '' : 'ghost'}`} onClick={() => setRole(r)}>
                {r === 'owner' ? 'Inhaber' : r === 'admin' ? 'Verwalter' : 'Mitarbeiter'}
              </button>
            ))}
          </span>
        </div>
      )}
      <OdProvider value={value}>
        <OdRoutes />
      </OdProvider>
    </div>
  );
}
