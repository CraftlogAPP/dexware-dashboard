// PinnDex mit Beispieldaten, ohne Anmeldung — NUR im Dev-Server (npm run dev → /app/pinndex?demo oder /vorschau?app=pinndex).
// Per lazy import nur im Dev geladen (PinndexArea.tsx), damit die erfundenen Daten nie im Produktions-Build landen.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { appIcon, type AppConfig } from '../apps/registry';
import { PinnProvider } from './context';
import { createDemoStore, demoMember, DEMO_USERS } from './demo';
import { PinnRoutes, ThemeScope } from './PinndexArea';
import { ROLE_LABEL, type PinnRole } from './types';

export function DemoArea({ app }: { app: AppConfig }) {
  const [role, setRole] = useState<PinnRole>(() => {
    const r = new URLSearchParams(window.location.search).get('rolle');
    return r === 'worker' || r === 'dispatcher' ? r : 'owner';
  });
  // …&sauber blendet den Beispieldaten-Hinweis aus (nur für Bildschirmfotos, z. B. Landing)
  const [clean] = useState(() => new URLSearchParams(window.location.search).has('sauber'));
  const [store] = useState(() => createDemoStore());
  useEffect(() => () => store.stop(), [store]);
  // Betrachter vor dem ersten Laden der Seiten setzen (Effekte der Kinder liefen sonst zuerst)
  const me = useMemo(() => {
    store.setViewer(DEMO_USERS[role], role);
    return demoMember(store, role);
  }, [store, role]);
  const [orgVersion, setOrgVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const org = useMemo(() => store.org(), [store, orgVersion]);
  const style = {
    '--accent': app.theme.accent,
    '--on-accent': app.theme.onAccent,
    '--bg': app.theme.bg,
  } as React.CSSProperties;

  return (
    <ThemeScope>
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
        {!clean && (<div className="pinn-demo-banner" role="note">
          <span>
            <b>Beispieldaten</b> — nichts wird gespeichert; Beispiel-Monteure arbeiten von selbst weiter. Nach dem Neuladen ist alles wie vorher.
          </span>
          <span className="row" style={{ gap: 6 }}>
            Ansicht:
            {(['owner', 'dispatcher', 'worker'] as PinnRole[]).map((r) => (
              <button key={r} type="button" className={`btn small ${role === r ? '' : 'ghost'}`} onClick={() => setRole(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </span>
        </div>)}
        <PinnProvider key={role} app={app} data={store.data} org={org} me={me} demo refreshOrg={() => setOrgVersion((v) => v + 1)}>
          <PinnRoutes />
        </PinnProvider>
      </div>
    </ThemeScope>
  );
}
