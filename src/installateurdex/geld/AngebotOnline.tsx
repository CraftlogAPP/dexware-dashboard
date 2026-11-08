// Angebot online annehmen lassen (Portal): Kundenlink erstellen/kopieren/per Mail, Stand sehen (geöffnet / angenommen
// mit Unterschrift / abgelehnt). Gleiche Logik wie die App (InstallateurDex components/QuoteOnlineCard.tsx).
// Ohne NACHTRAG-ANGEBOT-ONLINE-2026-11-08.sql zeigt die Karte nichts.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Link2, Mail, RefreshCw } from 'lucide-react';
import { mailHref } from '../types';
import type { GeldData } from './api';
import { onlineStatus, quoteLinkMessage } from './angebotLink';
import type { OnlineQuote } from './nachfassLogik';
import { errText } from './util';

const VORZEITIG_JA = '⚡ Vorzeitiger Beginn verlangt — ihr dürft gleich starten.';
const VORZEITIG_NEIN = '⏳ Kein vorzeitiger Beginn — mit den Arbeiten erst nach 14 Tagen Widerrufsfrist beginnen.';

export function AngebotOnline(props: {
  geld: GeldData;
  invoiceId: string;
  number?: string;
  customer?: string;
  customerEmail?: string;
  privateCustomer?: boolean;
  validUntil?: string;
  firm?: string;
  toInvoiceHref: string;
}) {
  const { geld, invoiceId } = props;
  const [state, setState] = useState<{ online?: OnlineQuote; hasLink: boolean } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const all = await geld.quoteLinks().catch(() => null);
    if (!all) return setState(null);
    const o = all[invoiceId];
    setState({ online: o, hasLink: !!o });
    if (o?.decision === 'accepted') setSig(await geld.quoteSignature(invoiceId).catch(() => null));
  }, [geld, invoiceId]);

  useEffect(() => {
    void load();
    const onFocus = () => void load(); // zurück im Tab → neuen Stand holen (Kunde hat vielleicht gerade angenommen)
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  if (!state) return null;
  const o = state.online;
  const hasLink = state.hasLink || !!url;
  const st = onlineStatus(o, hasLink);
  const decided = o?.decision === 'accepted' || o?.decision === 'declined';

  const message = (u: string) => quoteLinkMessage({ customer: props.customer, number: props.number, firm: props.firm, url: u, validUntil: props.validUntil, privateCustomer: props.privateCustomer });

  async function create(renew = false) {
    if (renew && !window.confirm('Neuen Link erstellen?\n\nDer bisherige Link funktioniert dann nicht mehr — sinnvoll, wenn er an die falsche Person ging.')) return;
    setBusy(true);
    setMsg(null);
    try {
      const u = await geld.quoteLinkCreate(invoiceId, renew);
      setUrl(u);
      await navigator.clipboard.writeText(u).then(() => setMsg('Link kopiert — z. B. in WhatsApp oder eine E-Mail einfügen.'), () => setMsg(null));
      void load();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const mail = url && props.customerEmail ? mailHref(props.customerEmail, `Ihr Angebot ${props.number ?? ''}`.trim(), message(url)) : null;

  return (
    <div className={`card ql-card ${st.tone === 'accepted' ? 'accepted' : st.tone === 'declined' ? 'declined' : ''}`}>
      <h3 style={{ margin: 0 }}>{decided ? 'Antwort des Kunden' : '✍️ Online annehmen lassen'}</h3>
      {st.text && <div className="ql-status">{st.text}</div>}
      {!hasLink && (
        <p className="small muted" style={{ margin: '6px 0' }}>
          Der Kunde sieht das Angebot am Handy und nimmt es mit seiner Unterschrift an — ohne Ausdrucken, ohne Konto.
          {props.privateCustomer ? ' Privatkunden bekommen dabei die Widerrufsbelehrung und die Frage zum vorzeitigen Beginn.' : ''} In der App kommt eine
          Mitteilung, sobald er es öffnet und entscheidet.
        </p>
      )}
      {o?.decision === 'accepted' && o.earlyStart != null && <p className="small">{o.earlyStart ? VORZEITIG_JA : VORZEITIG_NEIN}</p>}
      {sig && (
        <div className="ql-sig">
          <img src={sig} alt={`Unterschrift ${o?.name ?? ''}`} />
        </div>
      )}
      {o?.decision === 'accepted' && (
        <Link className="btn" to={props.toInvoiceHref} style={{ marginTop: 8 }}>
          → Jetzt in Rechnung umwandeln
        </Link>
      )}
      {!decided && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" className="btn" onClick={() => void create(false)} disabled={busy}>
            {hasLink ? <Copy className="i" aria-hidden /> : <Link2 className="i" aria-hidden />} {hasLink ? 'Link kopieren' : 'Link erstellen & kopieren'}
          </button>
          {url && (
            <button type="button" className="btn ghost" onClick={() => void navigator.clipboard.writeText(message(url)).then(() => setMsg('Nachricht mit Link kopiert.'))}>
              <Copy className="i" aria-hidden /> Nachricht kopieren
            </button>
          )}
          {mail && (
            <a className="btn ghost" href={mail}>
              <Mail className="i" aria-hidden /> Per E-Mail
            </a>
          )}
          {hasLink && (
            <button type="button" className="btn ghost" onClick={() => void create(true)} disabled={busy} title="Bisherigen Link ungültig machen">
              <RefreshCw className="i" aria-hidden /> Neuer Link
            </button>
          )}
        </div>
      )}
      {url && <div className="ql-url">{url}</div>}
      {msg && <p className="small" style={{ marginTop: 6 }} role="status">{msg}</p>}
    </div>
  );
}
