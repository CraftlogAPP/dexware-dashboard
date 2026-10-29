import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, LogOut } from 'lucide-react';
import { appIcon, type AppConfig } from '../apps/registry';
import { AppAuthProvider, useAppAuth } from '../auth/AppAuthContext';
import { LoginScreen } from '../auth/LoginScreen';

/**
 * Generische Hülle für jeden App-Dashboard-Bereich:
 * Markentheming (CSS-Variablen), Auth-Provider, Header, Login-Gate.
 * Die app-spezifischen Inhalte (Org-Gate, Routen, Nav) kommen als children.
 */
export function AppArea({ app, children }: { app: AppConfig; children: ReactNode }) {
  const style = {
    '--accent': app.theme.accent,
    '--on-accent': app.theme.onAccent,
    '--bg': app.theme.bg,
  } as React.CSSProperties;

  return (
    <div className="app-scope" style={style}>
      <AppAuthProvider app={app}>
        <Gate app={app}>{children}</Gate>
      </AppAuthProvider>
    </div>
  );
}

function Gate({ app, children }: { app: AppConfig; children: ReactNode }) {
  const { session, loading } = useAppAuth();

  return (
    <>
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
        <Link
          className="btn ghost small"
          to="/"
          title="Haupteinstieg: alle App-Dashboards der Suite"
        >
          <LayoutGrid className="i" aria-hidden />
          <span className="hide-sm">Alle Dashboards</span>
        </Link>
        <HeaderUser />
      </header>

      {loading ? (
        <div className="empty">
          <span className="spinner" />
        </div>
      ) : session ? (
        children
      ) : (
        <LoginScreen />
      )}
    </>
  );
}

function HeaderUser() {
  const { session, signOut } = useAppAuth();
  if (!session) return null;
  return (
    <span className="header-user">
      <span className="email">{session.user.email}</span>
      <button
        className="btn ghost small"
        onClick={() => void signOut()}
        title="Abmelden"
      >
        <LogOut className="i" aria-hidden />
        <span className="hide-sm">Abmelden</span>
      </button>
    </span>
  );
}
