// Kauf-Karte „Direkt hier kaufen“ mit der Paddle-Kasse über der Seite (RevenueCat Web SDK, Weg A seit 26.11.2026).
// Erscheint nur, wenn die Kasse eingeschaltet ist (src/lib/paddleKasse.ts → kasseKonfig) und die Abo-Seite überhaupt
// eine Kauf-Karte zeigen darf (darfKaufen) — sonst bleibt alles wie bisher (WebBuy mit ausgegrauten Kacheln).
//
// Das SDK (~1,3 MB) wird erst hier nachgeladen (eigene Datei im Build, nicht in der Offline-Hülle des Service Workers);
// Paddle.js holt das SDK seinerseits erst beim Klick auf einen Tarif von cdn.paddle.com. Preise kommen aus dem RevenueCat-
// Angebot. Rechtliches: Paddle ist Verkäufer (Merchant of Record) und zeigt im Bestellfenster seine Kaufbedingungen samt
// Widerrufsbelehrung; hier stehen die Pflicht-Hinweise vor dem Klick (Preis, Laufzeit, Verlängerung, Kündigung, Händler).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CreditCard, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import type { WebPlan } from '../apps/registry';
import {
  kasseEinrichten,
  kassePakete,
  kaufen,
  proInKundenInfo,
  warteAufPro,
  AngebotFehltError,
  type KasseKonfig,
  type KassenPaket,
  type RcLader,
  type RcPurchases,
} from '../lib/paddleKasse';

/** Standard-Lader: das Paket erst bei Bedarf holen (Vite legt es in eine eigene Datei). */
const ladeRevenueCat: RcLader = () => import('@revenuecat/purchases-js');

export interface GekauftInfo {
  paket: Pick<KassenPaket, 'pkg' | 'titel' | 'preis' | 'per'>;
  /** RevenueCat hat Pro sofort nach dem Kauf bestätigt */
  proBestaetigt: boolean;
  sandbox: boolean;
}

const PADDLE_KAUFBEDINGUNGEN = 'https://www.paddle.com/legal/checkout-buyer-terms';

export function PaddleKasse({
  appName,
  lead,
  plaene,
  konf,
  dexId,
  email,
  onGekauft,
  lade = ladeRevenueCat,
}: {
  appName: string;
  lead: string;
  /** Tarif-Texte (Titel, Hinweis, Markierung) aus der registry — Preise daraus werden NICHT verwendet */
  plaene: WebPlan[];
  konf: KasseKonfig;
  dexId: string;
  email: string;
  onGekauft: (info: GekauftInfo) => void;
  /** Nur Vorschau/Test: anderer SDK-Lader */
  lade?: RcLader;
}) {
  const [phase, setPhase] = useState<'laden' | 'bereit' | 'ladefehler' | 'kauf'>('laden');
  const [pakete, setPakete] = useState<KassenPaket[]>([]);
  const [aktivPkg, setAktivPkg] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'abbruch' | 'fehler'; text: string } | null>(null);
  const [ladeVersuch, setLadeVersuch] = useState(0);
  const inst = useRef<RcPurchases | null>(null);
  const lebt = useRef(true);
  /** Nummer des laufenden Kaufs — eine Nachfrage im Hintergrund gilt nur, solange kein neuer Kauf gestartet wurde */
  const kaufLauf = useRef(0);
  const sandbox = konf.modus === 'sandbox';

  useEffect(() => {
    lebt.current = true;
    return () => {
      lebt.current = false;
    };
  }, []);

  // Tarife des Angebots laden (nur Ansehen — gekauft wird erst beim Klick)
  useEffect(() => {
    let aktuell = true;
    setPhase('laden');
    kasseEinrichten(lade, konf, dexId)
      .then((i) => {
        inst.current = i;
        return kassePakete(i, konf, plaene);
      })
      .then((p) => {
        if (!aktuell) return;
        setPakete(p);
        setPhase('bereit');
      })
      .catch((e: unknown) => {
        if (!aktuell) return;
        console.warn('[Kasse] Angebot nicht geladen:', e instanceof AngebotFehltError ? e.message : e);
        setPhase('ladefehler');
      });
    return () => {
      aktuell = false;
    };
    // plaene kommen aus der registry (fest) — nicht als Abhängigkeit, sonst lädt jede Darstellung neu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lade, konf.rcKey, konf.offering, dexId, ladeVersuch]);

  const kauf = useCallback(
    async (p: KassenPaket) => {
      const i = inst.current;
      if (!i || phase === 'kauf') return;
      const lauf = ++kaufLauf.current;
      setPhase('kauf');
      setAktivPkg(p.pkg);
      setMeldung(null);
      const gekauft = (proBestaetigt: boolean) =>
        onGekauft({ paket: { pkg: p.pkg, titel: p.titel, preis: p.preis, per: p.per }, proBestaetigt, sandbox });
      const r = await kaufen(i, p, email);
      if (!lebt.current) {
        if (r.art === 'erfolg') gekauft(r.proBestaetigt);
        return;
      }
      setPhase('bereit');
      setAktivPkg(null);
      if (r.art === 'erfolg') {
        gekauft(r.proBestaetigt);
        return;
      }
      if (r.art === 'fehler') {
        setMeldung({ art: 'fehler', text: r.text });
        return;
      }
      setMeldung({ art: 'abbruch', text: 'Bestellfenster geschlossen. Du kannst den Kauf jederzeit neu starten.' });
      // Sicherheitsnetz: Wurde das Fenster erst NACH der Zahlung geschlossen, meldet RevenueCat Pro ein paar Sekunden
      // später — dann doch die Danke-Ansicht zeigen (nie einem Zahlenden „abgebrochen“ stehen lassen).
      const spaeter = await warteAufPro(async () => proInKundenInfo(await i.getCustomerInfo()), {
        versuche: 3,
        pauseMs: 6000,
        abbrechen: () => !lebt.current || lauf !== kaufLauf.current,
      });
      if (spaeter && lebt.current && lauf === kaufLauf.current) {
        setMeldung(null);
        gekauft(true);
      }
    },
    [email, onGekauft, phase, sandbox],
  );

  return (
    <div className="card buy">
      <h3 style={{ marginTop: 0 }}>
        Direkt hier kaufen {sandbox && <span className="badge amber">Sandbox · Testkauf</span>}
      </h3>
      <p className="muted" style={{ marginTop: 4 }}>
        Ohne App-Store — zum Beispiel am iPhone. Der Tarif gilt für dein Konto <b>{email}</b> und damit für deinen Betrieb,
        im Browser und in der App.
      </p>
      {sandbox && (
        <div className="info-box">
          <b>Testmodus:</b> bezahlt wird mit der Paddle-Testkarte 4242 4242 4242 4242 (Ablauf: beliebiges künftiges Datum,
          CVC 100) — es fließt kein echtes Geld. Freigeschaltet wird nur bei freigegebenen Testkonten.
        </div>
      )}
      <section className="buy-group">
        <div className="buy-head">
          <b>{appName} Pro</b>
          <span className="muted small">{lead}</span>
        </div>
        {phase === 'laden' && (
          <p className="muted kasse-laden" role="status">
            <Loader2 className="i kasse-spin" aria-hidden /> Preise werden geladen …
          </p>
        )}
        {phase === 'ladefehler' && (
          <div className="info-box" role="status">
            Die Tarife lassen sich gerade nicht laden — der Zahlungsdienst antwortet nicht. Bitte versuch es gleich noch
            einmal.{' '}
            <button type="button" className="btn ghost small" onClick={() => setLadeVersuch((n) => n + 1)}>
              Erneut versuchen
            </button>
          </div>
        )}
        {(phase === 'bereit' || phase === 'kauf') && (
          <div className="buy-grid">
            {pakete.map((p) => (
              <button
                key={p.pkg}
                type="button"
                className={`buy-plan kasse-plan${p.best ? ' best' : ''}`}
                disabled={phase === 'kauf'}
                aria-busy={phase === 'kauf' && aktivPkg === p.pkg}
                onClick={() => void kauf(p)}
              >
                {p.best && <span className="buy-tag">{p.tag ?? 'Beliebt'}</span>}
                <span className="buy-title">{p.titel}</span>
                <span className="buy-price">
                  {p.preis} {p.per && <small>{p.per}</small>}
                </span>
                {p.hinweis ? <span className="buy-note">{p.hinweis}</span> : <span className="buy-note" />}
                <span className="btn buy-btn">{phase === 'kauf' && aktivPkg === p.pkg ? 'Kasse öffnet …' : 'Weiter zur Kasse'}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      {meldung && (
        <div className={meldung.art === 'fehler' ? 'info-box' : 'muted small kasse-abbruch'} role="status">
          {meldung.text}
        </div>
      )}
      <ul className="buy-trust">
        <li>
          <ShieldCheck className="i" aria-hidden /> 14 Tage Geld zurück
        </li>
        <li>
          <CreditCard className="i" aria-hidden /> Karte oder PayPal, Preise inkl. USt.
        </li>
        <li>
          <Smartphone className="i" aria-hidden /> Jederzeit zum Laufzeitende kündbar
        </li>
      </ul>
      <p className="muted small" style={{ marginBottom: 0 }}>
        <b>Kauf über Paddle (Händler).</b> Verkäufer und Vertragspartner für den Kauf ist Paddle.com Market Limited
        („Merchant of Record“): Paddle wickelt die Zahlung ab, stellt die Rechnung aus und zeigt im Bestellfenster seine
        Kaufbedingungen samt Widerrufsbelehrung. Das Abo verlängert sich automatisch um die gewählte Laufzeit, bis du
        kündigst — kündigen kannst du jederzeit zum Ende der Laufzeit, über den Link in der Kaufbestätigung von Paddle oder
        hier auf der Abo-Seite. Bei uns gilt zusätzlich: 14 Tage Geld zurück; dein gesetzliches Widerrufsrecht bleibt davon
        unberührt.
      </p>
      <p className="muted small" style={{ marginBottom: 0, marginTop: 8 }}>
        <a href="https://dexware.app/agb.html" target="_blank" rel="noreferrer">
          AGB
        </a>
        {' · '}
        <a href="https://dexware.app/erstattung.html" target="_blank" rel="noreferrer">
          Widerruf &amp; Erstattung
        </a>
        {' · '}
        <a href="https://dexware.app/datenschutz.html" target="_blank" rel="noreferrer">
          Datenschutz
        </a>
        {' · '}
        <a href={PADDLE_KAUFBEDINGUNGEN} target="_blank" rel="noreferrer">
          Kaufbedingungen von Paddle ↗
        </a>
      </p>
    </div>
  );
}

/** Danke-Ansicht nach dem Kauf (oben auf der Abo-Seite). status: Server-Bestätigung für den Betrieb. */
export function KaufDanke({
  appName,
  info,
  email,
  status,
  weiter,
}: {
  appName: string;
  info: GekauftInfo;
  email: string;
  status: 'pruefe' | 'ok' | 'spaeter';
  /** Adresse „Zur Übersicht“ */
  weiter: string;
}) {
  return (
    <div className="card kasse-danke" role="status">
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <CheckCircle2 className="i kasse-danke-i" aria-hidden />
        <h3 style={{ margin: 0 }}>Danke! {appName} Pro ist gekauft.</h3>
        {info.sandbox && <span className="badge amber">Sandbox · Testkauf</span>}
      </div>
      <p style={{ marginBottom: 6 }}>
        {info.paket.titel}: <b>{info.paket.preis}</b> {info.paket.per}. Die Rechnung und den Link zum Verwalten schickt dir
        Paddle per <span style={{ whiteSpace: 'nowrap' }}>E-Mail</span> an <b>{email}</b>.
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        {status === 'pruefe' && (
          <>
            <Loader2 className="i kasse-spin" aria-hidden style={{ width: 15, height: 15, verticalAlign: '-2px' }} /> Freischaltung
            für deinen Betrieb wird bestätigt …
          </>
        )}
        {status === 'ok' && (
          <>Pro ist für deinen Betrieb freigeschaltet — im Browser und in der {appName}-App (dort die App einmal neu öffnen).</>
        )}
        {status === 'spaeter' && (
          <>
            Die Freischaltung für deinen Betrieb kann noch ein, zwei Minuten dauern. Lade die Seite dann neu — du musst nichts
            weiter tun. Hilfe: support@dexware.app
          </>
        )}
      </p>
      {info.sandbox && (
        <p className="muted small" style={{ marginTop: 0 }}>
          Testkauf in der Sandbox — es wurde kein echtes Geld bewegt.
        </p>
      )}
      <Link className="btn small" to={weiter}>
        Zur Übersicht
      </Link>
    </div>
  );
}
