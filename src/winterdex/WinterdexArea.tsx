import { Link, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import type { AppConfig } from '../apps/registry';
import { AppAuthProvider, useAppAuth } from '../auth/AppAuthContext';
import { LoginScreen } from '../auth/LoginScreen';
import { OrgProvider, useOrg } from './OrgContext';
import { Overview } from './pages/Overview';
import { Properties } from './pages/Properties';
import { PropertyDetail } from './pages/PropertyDetail';
import { Operations } from './pages/Operations';
import { OperationDetail } from './pages/OperationDetail';
import { Team } from './pages/Team';
import { Report } from './pages/Report';

export function WinterdexArea({ app }: { app: AppConfig }) {
  const style = {
    '--app-primary': app.theme.primary,
    '--app-accent': app.theme.accent,
    '--app-bg': app.theme.bg,
    '--app-card': app.theme.card,
  } as React.CSSProperties;

  return (
    <div className="app-scope" style={style}>
      <AppAuthProvider app={app}>
        <Gate app={app} />
      </AppAuthProvider>
    </div>
  );
}

function Gate({ app }: { app: AppConfig }) {
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
        <OrgProvider>
          <OrgGate />
        </OrgProvider>
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

function OrgGate() {
  const { data, loading, error, reload } = useOrg();

  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <div className="error-box">{error}</div>
        <button className="btn ghost" onClick={reload}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <div className="info-box">
          Dieses Konto gehört noch zu keinem Betrieb. Lege den Betrieb zuerst in der
          WinterDex-App am Handy an (oder tritt per Einladungscode bei) — danach steht
          das Dashboard hier bereit.
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="objekte" element={<Properties />} />
        <Route path="objekte/:id" element={<PropertyDetail />} />
        <Route path="einsaetze" element={<Operations />} />
        <Route path="einsaetze/:id" element={<OperationDetail />} />
        <Route path="team" element={<Team />} />
        <Route path="bericht" element={<Report />} />
      </Route>
    </Routes>
  );
}

function Shell() {
  const { data } = useOrg();

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <NavLink to="." end>
          📊 Übersicht
        </NavLink>
        <NavLink to="objekte">🏠 Objekte</NavLink>
        <NavLink to="einsaetze">🧹 Einsätze</NavLink>
        <NavLink to="team">👥 Team</NavLink>
        <NavLink to="bericht">📄 Nachweis-PDF</NavLink>
        <div className="nav-footer">
          {data && (
            <>
              <b>{data.org.name}</b>
              <br />
              Rolle: {data.role === 'owner' ? 'Inhaber' : 'Mitarbeiter'}
            </>
          )}
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
