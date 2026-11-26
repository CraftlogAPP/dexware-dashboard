// Kauf im Browser (ohne Google Play): Tarif-Kacheln, die direkt zur Kasse führen. Bezahlt wird bei Paddle über einen
// RevenueCat-Kauf-Link; an die Adresse wird die Dexware-ID des Kontos gehängt (dieselbe Kennung wie in der App), deshalb
// gilt der Tarif danach in App und Browser. Ist für einen Tarif noch kein Kauf-Link eingetragen (registry / webOffers),
// stehen die Kacheln schon da, der Knopf ist aber ausgegraut („In Kürze verfügbar“) — nichts führt ins Leere.
import { CreditCard, Smartphone } from 'lucide-react';
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
  const shown = groups.filter((g) => g.offer.plans.length > 0);
  if (shown.length === 0) return null;
  const isLive = (g: WebBuyGroup) => g.offer.link.startsWith('https://');
  const anyLive = shown.some(isLive);
  return (
    <div className="card buy">
      <h3 style={{ marginTop: 0 }}>
        Direkt hier kaufen {!anyLive && <span className="badge amber">in Kürze</span>}
      </h3>
      <p className="muted" style={{ marginTop: 4 }}>
        {anyLive ? (
          <>
            Ohne App-Store — zum Beispiel am iPhone. Der Tarif gilt für dein Konto <b>{email}</b>, im Browser und in der App.
          </>
        ) : (
          <>
            Bald kannst du Pro ohne App-Store kaufen — zum Beispiel am iPhone. Der Tarif gilt dann für dein Konto{' '}
            <b>{email}</b>, im Browser und in der App. Bis dahin gibt es Pro in der Android-App.
          </>
        )}
      </p>
      {shown.map((g) => (
        <section key={g.title} className="buy-group">
          <div className="buy-head">
            <b>{g.title}</b>
            <span className="muted small">{g.lead}</span>
          </div>
          <div className="buy-grid">
            {g.offer.plans.map((p) => {
              const inner = (
                <>
                  {p.best && <span className="buy-tag">{p.tag ?? 'Beliebt'}</span>}
                  <span className="buy-title">{p.title}</span>
                  <span className="buy-price">
                    {p.price} <small>{p.per}</small>
                  </span>
                  {p.note && <span className="buy-note">{p.note}</span>}
                  <span className="btn buy-btn">{isLive(g) ? 'Weiter zur Kasse' : 'In Kürze verfügbar'}</span>
                </>
              );
              return isLive(g) ? (
                <a
                  key={p.pkg}
                  className={`buy-plan${p.best ? ' best' : ''}`}
                  href={webCheckoutUrl(g.offer.link, dexId, p.pkg)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {inner}
                </a>
              ) : (
                <div key={p.pkg} className={`buy-plan off${p.best ? ' best' : ''}`} aria-disabled="true">
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <ul className="buy-trust">
        <li>
          <CreditCard className="i" aria-hidden /> Karte oder PayPal, Preise inkl. USt.
        </li>
        <li>
          <Smartphone className="i" aria-hidden /> Jederzeit zum Laufzeitende kündbar
        </li>
      </ul>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Verkäufer und Zahlungsabwicklung: Paddle.{' '}
        {anyLive && <>Nach dem Kauf diese Seite neu laden — die Freischaltung dauert meist unter einer Minute. </>}<a href="https://dexware.app/erstattung.html" target="_blank" rel="noreferrer">Widerruf &amp; Erstattung</a>
        {' · '}
        <a href="https://dexware.app/agb.html" target="_blank" rel="noreferrer">AGB</a>
      </p>
    </div>
  );
}
