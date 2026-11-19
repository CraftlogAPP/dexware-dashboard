import { useEffect, useState, type FormEvent } from 'react';
import { LayoutGrid } from 'lucide-react';
import { Link } from 'react-router-dom';
import { appIcon } from '../apps/registry';
import { useAppAuth } from './AppAuthContext';
import { LegalLinks } from '../components/LegalLinks';
import { WEB_ONBOARDING } from '../lib/webOnboarding';

type Mode = 'login' | 'signup' | 'reset-request' | 'reset-code';

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
  // E-Mail noch nicht bestätigt → Knopf „Bestätigungs-Mail erneut senden“
  const [unconfirmed, setUnconfirmed] = useState(false);
  // Google im Browser braucht im Supabase-Projekt das Client-Secret (die Apps melden nativ ohne an).
  // Fehlt es, landet man sonst auf der rohen Supabase-Fehlerseite „missing OAuth secret“ (Laufzettel/
  // InstallateurDex, 14.11.2026). Vorab prüfen: 302 → Knopf zeigen, 400 → nur E-Mail. Netzfehler → zeigen.
  const [googleOk, setGoogleOk] = useState<boolean | null>(null);
  useEffect(() => {
    const base = app.supabase?.url;
    if (!base) { setGoogleOk(false); return; }
    let alive = true;
    const probe = `${base}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(`${window.location.origin}/app/${app.id}`)}`;
    fetch(probe, { redirect: 'manual' })
      .then((r) => { if (alive) setGoogleOk(r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400)); })
      .catch(() => { if (alive) setGoogleOk(true); });
    return () => { alive = false; };
  }, [app.id, app.supabase?.url]);

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
      setUnconfirmed(false);
      const { error: err } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        if (/email not confirmed/i.test(err.message)) setUnconfirmed(true);
        throw new Error(loginErrorText(err.message));
      }
    });
  }

  // Bestätigungslink führt zurück in diesen App-Bereich (dieselbe freigegebene Adresse wie die Google-Anmeldung).
  const confirmUrl = `${window.location.origin}/app/${app.id}`;

  /** Neues Konto anlegen (nur Apps mit webSignup) — wie die Registrierung in der App: E-Mail + Passwort, Bestätigung per Link. */
  function onSignup(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      if (password.length < 6) throw new Error('Bitte ein Passwort mit mindestens 6 Zeichen wählen.');
      // Der Bestätigungslink kehrt zur Startseite des Bereichs zurück — die Unterseite (z. B. …/vor-ort) so lange merken,
      // wie der Link gilt (24 Stunden), nicht nur die 10 Minuten einer Google-Anmeldung.
      rememberReturnPath(app.id, SIGNUP_RETURN_MS);
      const { data, error: err } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: confirmUrl } });
      if (err) throw new Error(signupErrorText(err.message));
      // Schon registrierte Adresse: der Server antwortet aus Datenschutzgründen ohne Fehler, aber ohne Identität.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setMode('login');
        throw new Error('Für diese E-Mail gibt es schon ein Konto. Bitte anmelden — oder über „Passwort vergessen?“ ein neues Passwort festlegen.');
      }
      if (!data.session) {
        setMode('login');
        setPassword('');
        setInfo(`Fast fertig: Wir haben dir eine Bestätigungs-E-Mail an ${email.trim()} geschickt. Tippe auf den Link darin — danach bist du angemeldet. Öffnet sich der Link in einem anderen Browser, melde dich dort einfach mit E-Mail und Passwort an.`);
      }
      // Mit Sitzung (Bestätigung ausgeschaltet) leitet der Provider automatisch weiter.
    });
  }

  function onResend() {
    void run(async () => {
      rememberReturnPath(app.id, SIGNUP_RETURN_MS);
      const { error: err } = await client.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: confirmUrl } });
      if (err) throw new Error(signupErrorText(err.message));
      setUnconfirmed(false);
      setInfo(`Bestätigungs-E-Mail erneut an ${email.trim()} gesendet. Bitte auch im Spam-Ordner nachsehen.`);
    });
  }

  function onGoogle() {
    void run(async () => {
      // Google kehrt immer zur Startseite des Bereichs zurück — die gewünschte Unterseite (z. B. …/einsatz)
      // merken, AppArea leitet nach der Anmeldung dorthin weiter.
      rememberReturnPath(app.id);
      const { error: err } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/app/${app.id}`,
          // Kontoauswahl immer anzeigen statt letztes Google-Konto still zu verwenden.
          queryParams: { prompt: 'select_account' },
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
        <h2>{mode === 'signup' ? `${app.name}-Konto anlegen` : `${app.name} Dashboard`}</h2>
        <p className="auth-sub">
          {mode === 'signup'
            ? <>Kostenlos registrieren — danach legst du deinen Betrieb an{WEB_ONBOARDING[app.id] && !WEB_ONBOARDING[app.id].join ? '' : ' oder trittst mit einem Einladungscode dem Team deines Betriebs bei'}. Dasselbe Konto gilt auch in der {app.name}-App.</>
            : googleOk === false
            ? <>Melde dich mit deinem bestehenden {app.name}-Konto an — mit denselben Zugangsdaten wie in der App. Hast du dich in der App mit Google angemeldet? Dann über „Passwort vergessen“ einmal ein Passwort festlegen.</>
            : <>Melde dich mit deinem bestehenden {app.name}-Konto an — per Google oder mit denselben Zugangsdaten wie in der App.</>}
        </p>

        {error && <div className="error-box">{error}</div>}
        {info && <div className="info-box">{info}</div>}
        {unconfirmed && mode === 'login' && (
          <button type="button" className="btn ghost small" style={{ marginBottom: 12 }} disabled={busy} onClick={onResend}>
            Bestätigungs-Mail erneut senden
          </button>
        )}

        {(mode === 'login' || mode === 'signup') && googleOk === true && (
          <>
            <button
              type="button"
              className="btn google"
              style={{ width: '100%' }}
              disabled={busy}
              onClick={onGoogle}
            >
              <GoogleIcon />
              {mode === 'signup' ? 'Mit Google registrieren' : 'Mit Google anmelden'}
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
                onClick={() => { setError(null); setInfo(null); setMode('reset-request'); }}
              >
                Passwort vergessen?
              </button>
              {app.webSignup ? (
                <button type="button" className="btn ghost small" onClick={() => { setError(null); setInfo(null); setMode('signup'); }}>
                  Noch kein Konto? Jetzt registrieren
                </button>
              ) : (
                <a href={app.landingUrl} target="_blank" rel="noreferrer">
                  Noch kein Konto? → App laden
                </a>
              )}
            </div>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={onSignup}>
            <label className="field">
              E-Mail
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              Passwort (mindestens 6 Zeichen)
              <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Konto wird angelegt …' : 'Konto anlegen'}
            </button>
            <p className="muted small" style={{ marginTop: 10 }}>
              Mit der Registrierung akzeptierst du die{' '}
              <a href={`${app.landingUrl}/agb.html`} target="_blank" rel="noreferrer">AGB</a> und die{' '}
              <a href={`${app.landingUrl}/datenschutz.html`} target="_blank" rel="noreferrer">Datenschutzerklärung</a>.
            </p>
            <div className="auth-links">
              <button type="button" className="btn ghost small" onClick={() => { setError(null); setMode('login'); }}>
                ← Ich habe schon ein Konto
              </button>
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
                onClick={() => { setError(null); setInfo(null); setMode('reset-request'); }}
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
      <LegalLinks />
    </div>
  );
}

/** Bewirbt den Haupteinstieg: eine Übersicht aller App-Dashboards der Suite. */
function SuiteHint() {
  return (
    <div className="suite-hint">
      <LayoutGrid className="i" aria-hidden />
      <p>
        Mehrere Dexware-Apps im Einsatz? <b>dashboard.dexware.app</b> ist dein
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

function signupErrorText(raw: string): string {
  if (/already (been )?registered|user already exists/i.test(raw)) {
    return 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden — oder über „Passwort vergessen?“ ein neues Passwort festlegen.';
  }
  if (/password should (be at least|contain)|weak password|password is too weak/i.test(raw)) {
    return 'Das Passwort ist zu schwach — bitte mindestens 6 Zeichen wählen.';
  }
  if (/rate limit|too many|only request this after/i.test(raw)) {
    return 'Zu viele Versuche in kurzer Zeit. Bitte ein paar Minuten warten und erneut versuchen.';
  }
  if (/invalid.*email|unable to validate email/i.test(raw)) {
    return 'Diese E-Mail-Adresse sieht nicht gültig aus. Bitte prüfen.';
  }
  if (/signups? (are )?(not allowed|disabled)/i.test(raw)) {
    return 'Die Registrierung ist gerade nicht möglich. Bitte später erneut versuchen oder support@dexware.app schreiben.';
  }
  if (/failed to fetch|load failed|networkerror/i.test(raw)) {
    return 'Keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.';
  }
  return raw;
}

function googleErrorText(raw: string): string {
  if (/provider is not enabled|unsupported provider/i.test(raw)) {
    return 'Google-Login ist für diese App noch nicht freigeschaltet — bitte mit E-Mail + Passwort anmelden.';
  }
  return raw;
}

const RETURN_KEY = 'dexware-dash-return';
const RETURN_MS = 10 * 60 * 1000;
const SIGNUP_RETURN_MS = 24 * 60 * 60 * 1000;

/** Vor der Google-Anmeldung bzw. Registrierung: Unterseite merken, auf der die Anmeldung begonnen wurde. */
function rememberReturnPath(appId: string, ttl = RETURN_MS): void {
  try {
    const path = window.location.pathname;
    if (path.startsWith(`/app/${appId}/`) && path.length > `/app/${appId}/`.length) {
      localStorage.setItem(RETURN_KEY, JSON.stringify({ appId, path, at: Date.now(), ttl }));
    } else {
      localStorage.removeItem(RETURN_KEY);
    }
  } catch {
    /* nur Komfort */
  }
}

/**
 * Nach der Anmeldung: gemerkte Unterseite einmalig abholen (Google: höchstens 10 Minuten alt, Registrierung: so lange
 * der Bestätigungslink gilt, 24 Stunden; nur für diese App).
 */
export function takeReturnPath(appId: string): string | null {
  try {
    const raw = localStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    localStorage.removeItem(RETURN_KEY);
    const v = JSON.parse(raw) as { appId?: string; path?: string; at?: number; ttl?: number };
    if (v.appId !== appId || typeof v.path !== 'string' || !v.path.startsWith(`/app/${appId}/`)) return null;
    if (Date.now() - (v.at ?? 0) > Math.min(v.ttl ?? RETURN_MS, SIGNUP_RETURN_MS)) return null;
    return v.path;
  } catch {
    return null;
  }
}

/**
 * Angemeldet und schon auf einer Unterseite dieser App: der Merker hat sich erledigt (z. B. nach der Registrierung auf
 * derselben Seite mit Passwort angemeldet) — sonst spränge der nächste Wechsel zur Startseite einmal dorthin zurück.
 */
export function forgetReturnPath(appId: string): void {
  try {
    const raw = localStorage.getItem(RETURN_KEY);
    if (raw && (JSON.parse(raw) as { appId?: string }).appId === appId) localStorage.removeItem(RETURN_KEY);
  } catch {
    /* nur Komfort */
  }
}
