import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CircleCheck, Info, LayoutGrid, LogOut, X } from 'lucide-react';
import { appIcon, type AppConfig } from '../apps/registry';
import { AppAuthProvider, useAppAuth } from '../auth/AppAuthContext';
import { LoginScreen, forgetReturnPath, takeReturnPath } from '../auth/LoginScreen';
import { CONFIRM_TEXT } from '../auth/confirmReturn';

/**
 * Generische Hülle für jeden App-Dashboard-Bereich:
 * Markentheming (CSS-Variablen), Auth-Provider, Header, Login-Gate.
 * Die app-spezifischen Inhalte (Org-Gate, Routen, Nav) kommen als children.
 */
export function AppArea({
  app,
  children,
  headerAction,
}: {
  app: AppConfig;
  children: ReactNode;
  /** Zusatz-Knopf in der Kopfzeile (nur angemeldet), z. B. WinterDex „Außendienst“ */
  headerAction?: ReactNode;
}) {
  const style = {
    '--accent': app.theme.accent,
    '--on-accent': app.theme.onAccent,
    '--bg': app.theme.bg,
  } as React.CSSProperties;

  return (
    <div className="app-scope" style={style}>
      <AppAuthProvider app={app}>
        <Gate app={app} headerAction={headerAction}>{children}</Gate>
      </AppAuthProvider>
    </div>
  );
}

function Gate({ app, children, headerAction }: { app: AppConfig; children: ReactNode; headerAction?: ReactNode }) {
  const { session, loading } = useAppAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const signedIn = !!session;

  // Nach der Google-Anmeldung bzw. dem Bestätigungslink der Registrierung landet man auf der Startseite des Bereichs —
  // zurück auf die Unterseite, auf der die Anmeldung begonnen wurde (z. B. …/vor-ort vom Startbildschirm-Symbol).
  useEffect(() => {
    if (!signedIn) return;
    const base = `/app/${app.id}`;
    if (pathname !== base && pathname !== `${base}/`) return forgetReturnPath(app.id);
    const back = takeReturnPath(app.id);
    if (back) navigate(back, { replace: true });
  }, [signedIn, pathname, app.id, navigate]);

  return (
    <>
      <header className={`site-header${signedIn && headerAction ? ' has-action' : ''}`}>
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
        {signedIn && headerAction}
        <Link
          className="btn ghost small all-dash"
          to="/"
          title="Haupteinstieg: alle Dexware-Dashboards"
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
        <>
          <ConfirmBanner />
          {children}
        </>
      ) : (
        <LoginScreen />
      )}
    </>
  );
}

/**
 * Angemeldet zurück vom Bestätigungslink der Registrierung: deutlich sagen, dass es geklappt hat
 * (vorher landete man kommentarlos im Bereich). Schließbar, verschwindet nach 15 Sekunden von selbst.
 * Ohne Sitzung zeigt die Anmeldeseite die Meldung (LoginScreen).
 */
function ConfirmBanner() {
  const { confirmReturn, dismissConfirm } = useAppAuth();
  useEffect(() => {
    if (!confirmReturn) return;
    const t = setTimeout(dismissConfirm, 15000);
    return () => clearTimeout(t);
  }, [confirmReturn, dismissConfirm]);
  if (!confirmReturn) return null;
  const ok = confirmReturn === 'ok';
  return (
    <div className={`confirm-banner${ok ? ' ok' : ''}`} role="status">
      {ok ? <CircleCheck className="i" aria-hidden /> : <Info className="i" aria-hidden />}
      <p>{ok ? CONFIRM_TEXT.okSignedIn : CONFIRM_TEXT.errorSignedIn}</p>
      <button type="button" className="confirm-x" onClick={dismissConfirm} aria-label="Meldung schließen">
        <X className="i" aria-hidden />
      </button>
    </div>
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
