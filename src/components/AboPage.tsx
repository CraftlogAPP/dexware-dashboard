import { useAppAuth } from '../auth/AppAuthContext';
import {
  loadAboInfo,
  PLAY_SUBSCRIPTIONS_URL,
  type AboInfo,
  type EntitlementInfo,
} from '../lib/abo';
import { LoadGuard, useAsync } from './ui';

/**
 * Abo-Verwaltung (generisch für alle App-Bereiche): aktueller Tarif
 * (Free / Pro / Suite), Ablauf-/Verlängerungsdatum und der Weg zur
 * Kündigung. Käufe & Kündigungen laufen über Google Play — das Dashboard
 * zeigt an und verlinkt dorthin.
 */
export function AboPage() {
  const { app, session } = useAppAuth();
  const state = useAsync(
    () => loadAboInfo(app, session!),
    [app.id, session?.user.id],
  );

  return (
    <>
      <div className="section-head">
        <h2>💳 Abo &amp; Tarif</h2>
      </div>
      <LoadGuard state={state}>{(info) => <AboContent info={info} />}</LoadGuard>
    </>
  );
}

function AboContent({ info }: { info: AboInfo }) {
  const { app } = useAppAuth();
  const suiteActive = !!info.suite?.active || info.suiteBackendActive;
  const proActive = !!info.pro?.active;

  // Suite deckt Pro mit ab — angezeigt werden die Details des höchsten Tarifs.
  const current = suiteActive ? (info.suite?.active ? info.suite : null) : proActive ? info.pro : null;
  const planName = suiteActive ? 'Dexware Suite' : proActive ? `${app.name} Pro` : 'Free';

  return (
    <div className="abo-stack">
      <div className="card">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>{planName}</h3>
          {suiteActive || proActive ? (
            <span className="badge green">aktiv</span>
          ) : (
            <span className="badge">kostenlose Version</span>
          )}
          {current?.sandbox && <span className="badge amber">Sandbox-/Testkauf</span>}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          {suiteActive
            ? 'Das Suite-Bundle schaltet die Pro-Funktionen in allen Dex-Apps frei — auch in dieser.'
            : proActive
              ? `Dein Pro-Abo für ${app.name} ist aktiv.`
              : `Du nutzt ${app.name} im Free-Tarif. Pro oder das Suite-Bundle schließt du in der ${app.name}-App am Handy ab (Google Play).`}
        </p>
      </div>

      {current && <EntitlementDetails info={current} />}

      {suiteActive && !info.suite?.active && (
        <div className="info-box">
          Dein Suite-Bundle wurde in einer <b>anderen Dex-App</b> abgeschlossen
          {info.suiteBackendExpires && (
            <>
              {' '}
              und gilt bis <b>{fmtDate(info.suiteBackendExpires)}</b>
            </>
          )}
          . Details &amp; Kündigung findest du bei Google Play (Button unten) — dort steht
          das Abo unter der App, in der du es gekauft hast.
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Abo verwalten oder kündigen</h3>
        <p className="muted">
          Abos laufen über <b>Google Play</b> — kündigen, pausieren oder Zahlungsdaten
          ändern geht daher nicht direkt hier, sondern in deinem Play-Konto: am Handy
          über <i>Play Store → Profilbild → Zahlungen &amp; Abos → Abos</i> oder direkt im
          Browser (mit demselben Google-Konto angemeldet):
        </p>
        <a
          className="btn"
          href={info.managementUrl ?? PLAY_SUBSCRIPTIONS_URL}
          target="_blank"
          rel="noreferrer"
        >
          Abos bei Google Play öffnen ↗
        </a>
        <p className="muted small" style={{ marginBottom: 0, marginTop: 10 }}>
          Nach einer Kündigung bleibt der Tarif bis zum Ende des bezahlten Zeitraums
          aktiv und läuft dann automatisch aus.
        </p>
      </div>
    </div>
  );
}

function EntitlementDetails({ info }: { info: EntitlementInfo }) {
  return (
    <div className="kpi-grid">
      <div className="kpi">
        <div className="kpi-label">Abrechnung</div>
        <div className="kpi-value">{periodLabel(info.periodType)}</div>
        {info.productId && <div className="kpi-sub">{info.productId}</div>}
      </div>
      <div className="kpi">
        <div className="kpi-label">
          {info.willRenew ? 'Verlängert sich am' : 'Läuft ab am'}
        </div>
        <div className="kpi-value">
          {info.expiresDate ? fmtDate(info.expiresDate) : 'unbegrenzt'}
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Status</div>
        <div className="kpi-value">
          {info.willRenew ? (
            <span className="badge green">verlängert sich automatisch</span>
          ) : info.unsubscribed && info.active ? (
            <span className="badge amber">gekündigt — läuft aus</span>
          ) : info.active ? (
            <span className="badge green">aktiv</span>
          ) : (
            <span className="badge red">abgelaufen</span>
          )}
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Bezogen über</div>
        <div className="kpi-value">{storeLabel(info.store)}</div>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function periodLabel(period: string | null): string {
  switch (period) {
    case 'trial':
      return 'Testphase';
    case 'intro':
      return 'Einführungsangebot';
    case 'normal':
      return 'Abo';
    default:
      return 'Abo';
  }
}

function storeLabel(store: string | null): string {
  switch (store) {
    case 'play_store':
      return 'Google Play';
    case 'app_store':
      return 'Apple App Store';
    case 'promotional':
      return 'Freischaltung/Promo';
    case 'stripe':
      return 'Web (Stripe)';
    default:
      return store ?? '—';
  }
}
