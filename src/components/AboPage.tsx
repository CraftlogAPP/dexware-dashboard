import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { useAppAuth } from '../auth/AppAuthContext';
import {
  loadAboInfo,
  PLAY_SUBSCRIPTIONS_URL,
  dexwareId,
  type AboInfo,
  type EntitlementInfo,
} from '../lib/abo';
import { LoadGuard, useAsync } from './ui';
import { WebBuy, type WebBuyGroup } from './WebBuy';
import { WEB_OFFERS } from '../apps/webOffers';
import { inSuite } from '../apps/registry';
import { aboAnzeige, fmtAboDatum as fmtDate, suiteLead } from '../lib/aboAnzeige';
import { useOrgOptional } from './OrgContext';
import { KaufDanke, PaddleKasse, type GekauftInfo } from './PaddleKasse';
import { betriebOhneProKlar, darfKaufen, kasseKonfig, warteAufPro, type KasseKonfig } from '../lib/paddleKasse';
import { orgProStand } from '../lib/proStand';
import { meldeGratisAenderung } from '../winterdex/gratisLage';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pro des BETRIEBS laut Server (org_pro_active: Abo des Inhabers, Team-Stufen, Suite, Kommunal-Lizenz, Freischaltung auf
 * Rechnung, Empfehlungs-/Dank-Bonus). Streng: nur ein klares Ja zählt; fehlt die Funktion (App ohne Betriebs-Pro) oder ist
 * die Antwort unklar → null (dann zeigt die Seite wie bisher nur das eigene Store-Abo).
 */
async function fetchOrgProStrict(sb: SupabaseClient): Promise<boolean | null> {
  try {
    const { data, error } = await sb.rpc('org_pro_active');
    if (error) return null;
    return data === true ? true : data === false ? false : null;
  } catch {
    return null;
  }
}

/**
 * Abo-Verwaltung (generisch für alle App-Bereiche): aktueller Tarif
 * (Free / Pro / Suite), Ablauf-/Verlängerungsdatum und der Weg zur
 * Kündigung. Käufe & Kündigungen laufen über Google Play — das Dashboard
 * zeigt an und verlinkt dorthin.
 *
 * Suite-Umstellung 26.11.2026: Das Suite-Abo umfasst nur noch die Apps aus SUITE_APPS (registry). In Apps mit
 * suiteNurBestand gilt eine Suite nur noch als Bestand (Abo vom Stichtag, ohne Unterbrechung) — die Seite sagt das so,
 * verkauft dort keine Suite und wirbt dort nicht mit ihr.
 */
export function AboPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { app, session, client } = useAppAuth();
  const orgCtx = useOrgOptional()?.data;
  const state = useAsync(
    () => loadAboInfo(app, session!),
    [app.id, session?.user.id],
  );
  // Kauf direkt hier (Paddle-Kasse, src/lib/paddleKasse.ts): null = Schalter aus → Seite wie bisher. Sandbox nur mit
  // ?kasse=sandbox und eigenem Sandbox-Schlüssel.
  const { search } = useLocation();
  const kasse = embedded ? null : kasseKonfig(app.paddleKasse, { env: import.meta.env, search });
  const [kauf, setKauf] = useState<{ info: GekauftInfo; status: 'pruefe' | 'ok' | 'spaeter' } | null>(null);
  const [kaufNr, setKaufNr] = useState(0);
  const { refresh } = state;
  const lebt = useRef(true);
  // Beim (Wieder-)Einhängen auf true setzen: StrictMode (Dev-Server, Sandbox-Probekauf) hängt einmal aus und wieder ein —
  // ohne das bliebe lebt false und die Danke-Ansicht stünde für immer auf „wird bestätigt …“.
  useEffect(() => {
    lebt.current = true;
    return () => {
      lebt.current = false;
    };
  }, []);

  // Nach checkout.completed: Abo-Anzeige still neu laden (RevenueCat kennt den Kauf schon) und warten, bis die
  // vorhandene Pro-Prüfung des Betriebs (Server org_pro_active, gemerkt in proStand) Pro meldet — vorher frischt
  // pro_status_auffrischen() den Server-Speicher auf (fehlt die Funktion noch, schadet der Aufruf nicht).
  const gekauft = useCallback(
    (info: GekauftInfo) => {
      setKauf({ info, status: 'pruefe' });
      setKaufNr((n) => n + 1);
      refresh();
      void (async () => {
        const ok = await warteAufPro(
          async () => {
            try {
              await client.rpc('pro_status_auffrischen');
            } catch {
              /* Funktion fehlt/gestört: die Prüfung unten fragt trotzdem */
            }
            if (orgCtx) return orgProStand(client, app.id, true);
            return (await loadAboInfo(app, session!)).pro?.active ?? null;
          },
          { versuche: 8, pauseMs: 5000 },
        );
        // Auch wenn die Abo-Seite schon verlassen wurde („Zur Übersicht“): Der frische Stand steckt jetzt im Pro-Speicher,
        // Banner und Listen im WinterDex-Bereich fragen auf das Ereignis hin neu.
        meldeGratisAenderung();
        if (!lebt.current) return;
        setKauf((k) => (k ? { ...k, status: ok ? 'ok' : 'spaeter' } : k));
        setKaufNr((n) => n + 1);
        refresh();
      })();
    },
    [app, client, orgCtx, refresh, session],
  );

  return (
    <>
      <div className="section-head">
        {/* embedded: unter dem Betriebs-Tarif (InstallateurDex) — hier nur das eigene Store-Abo */}
        <h2>{embedded ? 'Dein Store-Abo' : <>Abo &amp; Tarif</>}</h2>
      </div>
      {kauf && session?.user.email && (
        <KaufDanke appName={app.name} info={kauf.info} email={session.user.email} status={kauf.status} weiter={`/app/${app.id}`} />
      )}
      <LoadGuard state={state}>
        {(info) => <AboContent info={info} kasse={kasse} kaufNr={kaufNr} kaufFertig={!!kauf} onGekauft={gekauft} />}
      </LoadGuard>
    </>
  );
}

function AboContent({
  info,
  kasse = null,
  kaufNr = 0,
  kaufFertig = false,
  onGekauft,
}: {
  info: AboInfo;
  /** Paddle-Kasse eingeschaltet (sonst null → Kacheln wie bisher) */
  kasse?: KasseKonfig | null;
  /** Zähler nach einem Kauf → Pro des Betriebs neu fragen */
  kaufNr?: number;
  /** Gerade hier gekauft (Danke-Ansicht oben) → keine Kauf-Karte mehr, auch bevor die Anzeige nachgeladen ist */
  kaufFertig?: boolean;
  onGekauft?: (info: GekauftInfo) => void;
}) {
  const { app, session } = useAppAuth();
  // Kauf im Browser (nur wenn für die App eingerichtet): Adressen vorab bauen, damit der Knopf ein echter Link ist.
  const email = session?.user.email;
  // Pro gilt für den Betrieb und hängt am Konto des INHABERS (Server: org_pro_active). Ein Kauf mit dem Konto eines
  // Mitarbeiters/Verwalters würde den Betrieb nicht freischalten → dort keine Kauf-Kacheln, stattdessen ein Hinweis.
  const orgCtx = useOrgOptional()?.data;
  const role = orgCtx?.role;
  const notOwner = !!role && role !== 'owner';
  const { client } = useAppAuth();
  // Ein Betrieb mit Pro auf Rechnung/Kommunal-Lizenz/Bonus sah hier bisher „Free“ und Kauf-Kacheln (21.11.2026).
  const orgProState = useAsync(async () => (orgCtx ? fetchOrgProStrict(client) : null), [client, orgCtx?.org.id, kaufNr]);
  const orgPro = orgProState.data === true;
  // Nur für die Kasse (echter Kauf): erst nach einem klaren „kein Pro über den Betrieb“ vom Server (paddleKasse.ts)
  const kasseBetriebKlar = betriebOhneProKlar(!!orgCtx, orgProState.data);
  const bonusUntil = (orgCtx?.org as { pro_bonus_until?: string | null } | undefined)?.pro_bonus_until ?? null;
  const dexId = useAsync(async () => (email ? dexwareId(email) : null), [email]).data;
  const groups: WebBuyGroup[] = [];
  // Angebot aus der registry (WinterDex) oder aus den vorbereiteten Angeboten (webOffers); ohne Kauf-Link ausgegraut.
  const prepared = WEB_OFFERS[app.id];
  const proOffer = app.webCheckout?.pro ?? prepared?.pro;
  if (proOffer) groups.push({ title: `${app.name} Pro`, lead: app.webCheckoutLead ?? prepared?.lead ?? 'Alle Pro-Funktionen dieser App', offer: proOffer });
  // Die Suite wird nur in Apps des Suite-Abos angeboten (nicht bei notInSuite/suiteNurBestand).
  if (app.webCheckout?.suite && inSuite(app)) groups.push({ title: 'Dexware Suite', lead: suiteLead(), offer: app.webCheckout.suite });
  // Tarif, Text und Suite-Hinweis (Entscheidung in src/lib/aboAnzeige.ts, geprüft in tests/suite-bestand.test.mjs)
  const { suiteActive, proActive, viaOrg, current, planName, text, suiteNichtHierText, suiteUnklarText } = aboAnzeige(app, info, {
    orgPro,
    bonusUntil,
  });

  return (
    <div className="abo-stack">
      <div className="card">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>{planName}</h3>
          {suiteActive || proActive || viaOrg ? (
            <span className="badge green">aktiv</span>
          ) : (
            <span className="badge">kostenlose Version</span>
          )}
          {current?.sandbox && <span className="badge amber">Sandbox-/Testkauf</span>}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          {text}
        </p>
      </div>

      {suiteNichtHierText && <div className="info-box">{suiteNichtHierText}</div>}

      {/* Suite-Server gestört: „Free“ ist nur geraten — Hinweis statt Kauf-Kacheln (Bestandskunden nicht zum Neukauf drängen) */}
      {suiteUnklarText && <div className="info-box">{suiteUnklarText}</div>}

      {notOwner && groups.length > 0 && !viaOrg && (
        <div className="info-box">
          Der Tarif gehört zum Betrieb und läuft über das Konto des <b>Inhabers</b>. Als Teammitglied arbeitest du unter
          seinem Tarif mit — ein eigenes Abo brauchst du nicht (es würde den Betrieb auch nicht freischalten). Diese Seite
          zeigt nur, ob an <b>deinem eigenen</b> Konto ein Abo hängt.
        </div>
      )}

      {/* Kauf-Karte: dieselbe Regel wie bisher (darfKaufen) — bestehende Tarife sehen nie eine. Kasse an → Paddle-Fenster
          direkt hier (nur das Pro der App; Preise aus RevenueCat), sonst die Kacheln wie bisher. */}
      {!kaufFertig &&
        darfKaufen({ notOwner, suiteActive, proActive, viaOrg, suiteUnklar: !!suiteUnklarText, dexId, email }) &&
        dexId &&
        email &&
        (kasse && proOffer && onGekauft ? (
          kasseBetriebKlar ? (
            <PaddleKasse
              appName={app.name}
              lead={groups[0]?.lead ?? 'Alle Pro-Funktionen dieser App'}
              plaene={proOffer.plans}
              konf={kasse}
              dexId={dexId}
              email={email}
              onGekauft={onGekauft}
            />
          ) : orgProState.loading ? null : (
            // Server-Antwort zum Pro des Betriebs unklar: lieber nicht verkaufen (wie beim gestörten Suite-Server)
            <div className="info-box">
              Ob für deinen Betrieb schon Pro freigeschaltet ist (z. B. auf Rechnung), konnten wir gerade nicht prüfen. Bitte
              lade die Seite später neu, bevor du ein Abo abschließt.
            </div>
          )
        ) : (
          <WebBuy groups={groups} dexId={dexId} email={email} />
        ))}

      {current && <EntitlementDetails info={current} />}

      {suiteActive && !info.suite?.active && (
        <div className="info-box">
          Dein Suite-Abo wurde in einer <b>anderen Dexware-App</b> abgeschlossen
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

      {current?.store === 'paddle' ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Abo verwalten oder kündigen</h3>
          <p className="muted">
            Dieses Abo hast du <b>im Browser</b> gekauft; Verkäufer ist unser Zahlungspartner <b>Paddle</b>. Kündigen oder
            die Zahlungsart ändern kannst du über den Link in der Kaufbestätigung (E-Mail von Paddle) oder hier:
          </p>
          <a className="btn" href={info.managementUrl ?? 'https://paddle.net'} target="_blank" rel="noreferrer">
            Abo bei Paddle verwalten ↗
          </a>
          <p className="muted small" style={{ marginBottom: 0, marginTop: 10 }}>
            Nach einer Kündigung bleibt der Tarif bis zum Ende des bezahlten Zeitraums aktiv. Innerhalb von 14 Tagen nach
            dem Kauf bekommst du dein Geld zurück — schreib an support@dexware.app.{' '}
            <a href="https://dexware.app/erstattung.html" target="_blank" rel="noreferrer">Widerruf &amp; Erstattung</a>
            {' · '}
            <a href="https://dexware.app/agb.html" target="_blank" rel="noreferrer">AGB</a>
          </p>
        </div>
      ) : (
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
      )}

      {/* Jahresabo-Dankeschön aus WinterDex (25.11.2026): Einlösen in ObjektDex/SpielDex (BaumDex im eigenen Portal) */}
      {(app.id === 'objektdex' || app.id === 'spieldex') && (
        <p className="muted small" style={{ margin: 0 }}>
          <Ticket className="i" aria-hidden style={{ width: 15, height: 15, verticalAlign: '-2px' }} /> Du hast einen
          Dankeschön-Code aus WinterDex (WD-…)? <Link to={`/app/${app.id}/code-einloesen`}>Code einlösen</Link>
        </p>
      )}
    </div>
  );
}

function EntitlementDetails({ info }: { info: EntitlementInfo }) {
  return (
    <div className="kpi-grid">
      <div className="kpi">
        <div className="kpi-label">Abrechnung</div>
        <div className="kpi-value">{periodLabel(info.periodType)}</div>
        {info.productId && info.store !== 'paddle' && <div className="kpi-sub">{tierLabel(info.productId)}{info.productId}</div>}
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

/** Teamgrößen-Stufe aus der Produkt-ID (seit 03.11.2026: *_team_* bis 50, *_teamxl_* bis 100). */
function tierLabel(productId: string): string {
  // InstallateurDex: *_team3_* / *_team5_* / *_team10_* = bis 3/5/10 Monteure (Inhaber eingerechnet).
  const n = /_team(\d+)_/i.exec(productId);
  if (n) return `Team ${n[1]} · bis ${n[1]} Monteure · `;
  if (/teamxl/i.test(productId)) return 'Team XL · bis 100 Mitarbeiter · ';
  if (/_team_/i.test(productId)) return 'Team · bis 50 Mitarbeiter · ';
  if (/suite/i.test(productId)) return '';
  return '';
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
    case 'paddle':
      return 'Web (Paddle)';
    default:
      return store ?? '—';
  }
}
