import { useState, type FormEvent } from 'react';
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
        <div className="auth-logo">{app.emoji}</div>
        <h2>{app.name} Dashboard</h2>
        <p className="auth-sub">
          Melde dich mit deinem bestehenden {app.name}-Konto an — gleiche Zugangsdaten
          wie in der App.
        </p>

        {error && <div className="error-box">{error}</div>}
        {info && <div className="info-box">{info}</div>}

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
    </div>
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
