// Betriebsportal mit Beispieldaten, ohne Anmeldung — NUR im Dev-Server (npm run dev, /app/installateurdex?demo). Wird per lazy import nur im Dev geladen (siehe InstallateurdexArea.tsx),
// damit die erfundenen Daten nie im Produktions-Build landen.

import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { appIcon, type AppConfig } from '../apps/registry';
import type { Role } from '../lib/orgApi';
import { InstContextProvider, useRequestsVersion, type InstContext } from './context';
import { createDemoStore } from './demo';
import { demoExt } from './ext-demo';
import { PortalRoutes } from './Portal';
import type { InstOrg } from './types';
import { ALL_PERMS, type Perm } from './rechte';

export function DemoArea({ app }: { app: AppConfig }) {
  // „Stellvertreter“ = Mitarbeiter mit allen Team-Rechten (NACHTRAG-TEAMRECHTE)
  const [role, setRole] = useState<Role | 'deputy'>('owner');
  const [plan, setPlan] = useState<'free' | 'pro'>('pro');
  const style = {
    '--accent': app.theme.accent,
    '--on-accent': app.theme.onAccent,
    '--bg': app.theme.bg,
  } as React.CSSProperties;

  return (
    <div className="app-scope idx-scope" style={style}>
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
          {app.name} <span className="hide-sm">Betriebsportal</span>
        </span>
        <div className="spacer" />
        <Link className="btn ghost small" to="/" title="Haupteinstieg: alle App-Dashboards der Suite">
          <LayoutGrid className="i" aria-hidden />
          <span className="hide-sm">Alle Dashboards</span>
        </Link>
      </header>
      <div className="idx-demo-banner" role="note">
        <span>
          <b>Beispieldaten</b> (nur Dev-Server) — nichts wird gespeichert; nach dem Neuladen ist alles wie vorher.
          Echte Anmeldung: <code>?demo=0</code>.
        </span>
        <span className="row" style={{ gap: 6 }}>
          Ansicht:
          <button type="button" className={`btn small ${role === 'owner' ? '' : 'ghost'}`} onClick={() => setRole('owner')}>
            Inhaber
          </button>
          <button type="button" className={`btn small ${role === 'worker' ? '' : 'ghost'}`} onClick={() => setRole('worker')}>
            Mitarbeiter
          </button>
          <button type="button" className={`btn small ${role === 'deputy' ? '' : 'ghost'}`} onClick={() => setRole('deputy')}>
            Stellvertreter
          </button>
        </span>
        <span className="row" style={{ gap: 6 }}>
          Tarif:
          <button type="button" className={`btn small ${plan === 'pro' ? '' : 'ghost'}`} onClick={() => setPlan('pro')}>
            Pro
          </button>
          <button type="button" className={`btn small ${plan === 'free' ? '' : 'ghost'}`} onClick={() => setPlan('free')}>
            Gratis
          </button>
        </span>
      </div>
      <DemoInstProvider app={app} role={role} plan={plan}>
        <PortalRoutes />
      </DemoInstProvider>
    </div>
  );
}

function DemoInstProvider({ app, role: view, plan, children }: { app: AppConfig; role: Role | 'deputy'; plan: 'free' | 'pro'; children: ReactNode }) {
  const role: Role = view === 'deputy' ? 'worker' : view;
  const perms = useMemo<Perm[]>(() => (view === 'worker' ? [] : ALL_PERMS), [view]);
  const [org, setOrg] = useState<InstOrg | null>(null);
  const [store] = useState(() => createDemoStore((o) => setOrg(o)));
  const [ext] = useState(() => demoExt());
  const { requestsVersion, bumpRequests } = useRequestsVersion();
  const base = org ?? store.org;
  const current = useMemo(() => ({ ...base, plan }), [base, plan]);
  const value = useMemo<InstContext>(
    () => ({
      app,
      data: store.data,
      ext,
      org: current,
      role,
      isOwner: role === 'owner',
      can: (p: Perm) => perms.includes(p),
      perms,
      deputy: view === 'deputy',
      permsAvailable: true,
      reloadPerms: () => {},
      demo: true,
      userKey: 'demo',
      base: `/app/${app.id}`,
      refreshOrg: () => {},
      requestsVersion,
      bumpRequests,
    }),
    [app, store, ext, current, role, view, perms, requestsVersion, bumpRequests],
  );
  return <InstContextProvider value={value}>{children}</InstContextProvider>;
}
