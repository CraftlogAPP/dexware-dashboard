import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AppConfig } from '../apps/registry';
import { AppAuthProvider, useAppAuth } from '../auth/AppAuthContext';
import { LoginScreen } from '../auth/LoginScreen';

/**
 * Generische Hülle für jeden App-Dashboard-Bereich:
 * Markentheming (CSS-Variablen), Auth-Provider, Header, Login-Gate.
 * Die app-spezifischen Inhalte (Org-Gate, Routen, Nav) kommen als children.
 */
export function AppArea({ app, children }: { app: AppConfig; children: ReactNode }) {
  const style = {
    '--app-primary': app.theme.primary,
    '--app-accent': app.theme.accent,
    '--app-bg': app.theme.bg,
    '--app-card': app.theme.card,
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
        <Link className="brand" to="/">
          dex<span>ware</span>
        </Link>
        <span className="app-chip">
          {app.emoji} <b>{app.name}</b> Dashboard
        </span>
        <div className="spacer" />
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
    <span className="row" style={{ gap: 10 }}>
      <span className="muted small">{session.user.email}</span>
      <button className="btn ghost small" onClick={() => void signOut()}>
        Abmelden
      </button>
    </span>
  );
}
