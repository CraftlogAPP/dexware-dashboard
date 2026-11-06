import { useEffect } from 'react';
import { AboPage } from '../../components/AboPage';
import { useAppAuth } from '../../auth/AppAuthContext';
import { fmtDate } from '../../lib/format';
import { fetchSeats } from '../../lib/orgApi';
import { useInst } from '../context';
import { isProOrg } from '../types';

/**
 * Maßgeblich ist der Tarif des BETRIEBS (org.plan/plan_until) — den gleicht der Server mit dem Abo des
 * Inhabers ab (Pro, Team 3/5/10, Suite, Sonderlizenz). Monteure haben kein eigenes Abo.
 * Der Inhaber sieht darunter zusätzlich sein Store-Abo aus RevenueCat (Ablauf, Kündigung).
 */
export function Abo() {
  const { app, demo, isOwner } = useInst();
  return (
    <>
      {!demo && isOwner && <SyncOnOpen />}
      <PlanInfo />
      {!demo && isOwner && app.revenueCat && (
        <div style={{ marginTop: 28 }}>
          <AboPage embedded />
        </div>
      )}
    </>
  );
}

/** Beim Öffnen den Abgleich anstoßen (wie die Team-Seite) — ein frisch gekauftes Abo stünde sonst erst
 *  nach dem nächsten App-Start im Betrieb. Nur mit echter Anmeldung (useAppAuth fehlt bei Beispieldaten). */
function SyncOnOpen() {
  const { client } = useAppAuth();
  const { refreshOrg } = useInst();
  useEffect(() => {
    let off = false;
    fetchSeats(client)
      .then(() => !off && refreshOrg())
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [client, refreshOrg]);
  return null;
}

function PlanInfo() {
  const { app, org, isOwner } = useInst();
  const pro = isProOrg(org);
  const seats = typeof org.seat_limit === 'number' ? org.seat_limit : null;
  const expired = org.plan === 'pro' && !pro;
  return (
    <>
      <div className="section-head">
        <h2>Abo &amp; Tarif</h2>
      </div>
      <div className="abo-stack">
        <div className="card">
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{pro ? `${app.name} Pro` : 'Gratis'}</h3>
            {pro ? <span className="badge green">aktiv für den Betrieb</span> : <span className="badge">kostenlose Version</span>}
            {expired && <span className="badge amber">abgelaufen</span>}
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {pro
              ? 'Pro ist für deinen Betrieb aktiv: unbegrenzt Anlagen, PDFs ohne Wasserzeichen, Erinnerungsmails an Kunden und das Diktier-Kontingent — für alle im Team.'
              : `Im Gratis-Tarif sind 3 Anlagen enthalten, PDFs tragen ein Wasserzeichen und Erinnerungsmails werden nicht verschickt. ${
                  isOwner ? `Pro schließt du in der ${app.name}-App am Handy ab.` : 'Das Abo schließt der Inhaber des Betriebs in der App ab.'
                }`}
          </p>
          {pro && (
            <p className="muted" style={{ margin: '10px 0 0' }}>
              {org.plan_until ? `Gültig bis ${fmtDate(org.plan_until)} (verlängert sich mit dem Abo).` : 'Unbefristet freigeschaltet.'}
              {seats !== null && seats > 0 && ` · Plätze für ${seats} weitere Monteure.`}
            </p>
          )}
        </div>
        {!isOwner && (
          <div className="info-box">
            Das Abo gehört zum Konto des Inhabers. Monteure brauchen kein eigenes Abo — sie nutzen den Tarif des Betriebs.
          </div>
        )}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Abo verwalten oder kündigen</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Käufe und Kündigungen laufen über den App Store bzw. Google Play — dort unter Abos bei {app.name}. Das Portal
            zeigt den Tarif nur an.
          </p>
        </div>
      </div>
    </>
  );
}
