import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { appIcon } from '../apps/registry';
import { useAppAuth } from './AppAuthContext';

type Mode = 'login' | 'reset-request' | 'reset-code';

/**
 * Login mit dem bestehenden App-Konto (E-Mail + Passwort).
 * Passwort-Reset per 6-stelligem OTP-Code — identisch zum Flow in den Mobile-Apps.
 */
export function LoginScreen() {
  const { app, client } = useAppAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onLogin(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await client.auth.signInWithPassword({ email, password });
      if (err) throw new Error(loginErrorText(err.message));
    });
  }

  function onGoogle() {
    void run(async () => {
      const { error: err } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/app/${app.id}`,
        },
      });
      if (err) throw new Error(googleErrorText(err.message));
      // Browser navigiert jetzt zu Google — busy bleibt bis dahin aktiv.
    });
  }

  function onResetRequest(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { error: err } = await client.auth.resetPasswordForEmail(email);
      if (err) throw new Error(err.message);
      setMode('reset-code');
      setInfo(`Wir haben dir einen 6-stelligen Code an ${email} geschickt.`);
    });
  }

  function onResetVerify(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const { error: vErr } = await client.auth.verifyOtp({
        email,
        token: code.trim(),
        type: 'recovery',
      });
      if (vErr) throw new Error('Code ungültig oder abgelaufen. Bitte neu anfordern.');
      const { error: uErr } = await client.auth.updateUser({ password: newPassword });
      if (uErr) throw new Error(uErr.message);
      // Session besteht nach verifyOtp — der Provider leitet automatisch ins Dashboard.
    });
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <img src={appIcon(app.id)} alt={`${app.name}-Icon`} />
        </div>
        <h2>{app.name} Dashboard</h2>
        <p className="auth-sub">
          Melde dich mit deinem bestehenden {app.name}-Konto an — per Google oder mit
          denselben Zugangsdaten wie in der App.
        </p>

        {error && <div className="error-box">{error}</div>}
        {info && <div className="info-box">{info}</div>}

        {mode === 'login' && (
          <>
            <button
              type="button"
              className="btn google"
              style={{ width: '100%' }}
              disabled={busy}
              onClick={onGoogle}
            >
              <GoogleIcon />
              Mit Google anmelden
            </button>
            <div className="auth-divider">
              <span>oder mit E-Mail</span>
            </div>
          </>
        )}

        {mode === 'login' && (
          <form onSubmit={onLogin}>
            <label className="field">
              E-Mail
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              Passwort
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Anmelden …' : 'Anmelden'}
            </button>
            <div className="auth-links">
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setMode('reset-request')}
              >
                Passwort vergessen?
              </button>
              <a href={app.landingUrl} target="_blank" rel="noreferrer">
                Noch kein Konto? → App laden
              </a>
            </div>
          </form>
        )}

        {mode === 'reset-request' && (
          <form onSubmit={onResetRequest}>
            <label className="field">
              E-Mail deines Kontos
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Sende Code …' : 'Reset-Code anfordern'}
            </button>
            <div className="auth-links">
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setMode('login')}
              >
                ← Zurück zum Login
              </button>
            </div>
          </form>
        )}

        {mode === 'reset-code' && (
          <form onSubmit={onResetVerify}>
            <label className="field">
              6-stelliger Code aus der E-Mail
              <input
                inputMode="numeric"
                maxLength={6}
                required
                className="mono"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <label className="field">
              Neues Passwort
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Setze Passwort …' : 'Passwort setzen & anmelden'}
            </button>
            <div className="auth-links">
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setMode('reset-request')}
              >
                Code neu anfordern
              </button>
            </div>
          </form>
        )}
      </div>
      <p className="muted small" style={{ textAlign: 'center', marginTop: 14 }}>
        Deine Daten bleiben in deinem {app.name}-Konto — das Dashboard ist nur eine
        weitere Ansicht darauf.
      </p>
      <SuiteHint />
    </div>
  );
}

/** Bewirbt den Haupteinstieg: eine Übersicht aller App-Dashboards der Suite. */
function SuiteHint() {
  return (
    <div className="suite-hint">
      <span aria-hidden>⊞</span>
      <p>
        Mehrere dexware-Apps im Einsatz? <b>dashboard.dexware.app</b> ist dein
        Haupteinstieg — eine Übersicht, alle App-Dashboards.{' '}
        <Link to="/">Zur Dashboard-Übersicht →</Link>
      </p>
    </div>
  );
}

/** Offizielles Google-„G" als Inline-SVG (keine externen Assets). */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function loginErrorText(raw: string): string {
  if (/invalid login credentials/i.test(raw)) {
    return 'E-Mail oder Passwort falsch.';
  }
  if (/email not confirmed/i.test(raw)) {
    return 'E-Mail-Adresse noch nicht bestätigt — bitte zuerst den Bestätigungslink aus der Registrierungs-Mail öffnen.';
  }
  return raw;
}

function googleErrorText(raw: string): string {
  if (/provider is not enabled|unsupported provider/i.test(raw)) {
    return 'Google-Login ist für diese App noch nicht freigeschaltet — bitte mit E-Mail + Passwort anmelden.';
  }
  return raw;
}
