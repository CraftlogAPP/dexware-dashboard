// Kauf im Browser (ohne Google Play): Tarif-Kacheln, die direkt zur Kasse führen. Bezahlt wird bei Paddle über einen
// RevenueCat-Kauf-Link; an die Adresse wird die Dexware-ID des Kontos gehängt (dieselbe Kennung wie in der App), deshalb
// gilt der Tarif danach in App und Browser. Erscheint nur, wenn für die App Kauf-Links eingetragen sind (registry).
import { CreditCard, ShieldCheck, Smartphone } from 'lucide-react';
import type { WebOffer } from '../apps/registry';
import { webCheckoutUrl } from '../lib/abo';

export interface WebBuyGroup {
  /** Überschrift der Gruppe, z. B. „WinterDex Pro“ */
  title: string;
  /** Eine Zeile, was der Tarif bringt */
  lead: string;
  offer: WebOffer;
}

export function WebBuy({ groups, dexId, email }: { groups: WebBuyGroup[]; dexId: string; email: string }) {
  const shown = groups.filter((g) => g.offer.link.startsWith('https://') && g.offer.plans.length > 0);
  if (shown.length === 0) return null;
  return (
    <div className="card buy">
      <h3 style={{ marginTop: 0 }}>Direkt hier kaufen</h3>
      <p className="muted" style={{ marginTop: 4 }}>
        Ohne App-Store — zum Beispiel am iPhone. Der Tarif gilt für dein Konto <b>{email}</b>, im Browser und in der App.
      </p>
      {shown.map((g) => (
        <section key={g.title} className="buy-group">
          <div className="buy-head">
            <b>{g.title}</b>
            <span className="muted small">{g.lead}</span>
          </div>
          <div className="buy-grid">
            {g.offer.plans.map((p) => (
              <a
                key={p.pkg}
                className={`buy-plan${p.best ? ' best' : ''}`}
                href={webCheckoutUrl(g.offer.link, dexId, p.pkg)}
                target="_blank"
                rel="noreferrer"
              >
                {p.best && <span className="buy-tag">{p.tag ?? 'Beliebt'}</span>}
                <span className="buy-title">{p.title}</span>
                <span className="buy-price">
                  {p.price} <small>{p.per}</small>
                </span>
                {p.note && <span className="buy-note">{p.note}</span>}
                <span className="btn buy-btn">Weiter zur Kasse</span>
              </a>
            ))}
          </div>
        </section>
      ))}
      <ul className="buy-trust">
        <li>
          <ShieldCheck className="i" aria-hidden /> 14 Tage Geld zurück
        </li>
        <li>
          <CreditCard className="i" aria-hidden /> Karte oder PayPal, Preise inkl. USt.
        </li>
        <li>
          <Smartphone className="i" aria-hidden /> Jederzeit kündbar
        </li>
      </ul>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Verkäufer und Zahlungsabwicklung: Paddle. Nach dem Kauf diese Seite neu laden — die Freischaltung dauert meist unter
        einer Minute. <a href="https://dexware.app/erstattung.html" target="_blank" rel="noreferrer">Widerruf &amp; Erstattung</a>
      </p>
    </div>
  );
}
