// Nur im Dev-Server (/vorschau-kauf): die Kauf-Kacheln ohne Anmeldung ansehen. Links zeigen auf den Test-Kauf-Link.
// /vorschau-kauf?bald=<app> zeigt den vorbereiteten, noch ausgegrauten Zustand einer App (webOffers).
import { WebBuy } from '../components/WebBuy';
import { WEB_OFFERS } from '../apps/webOffers';
import { APPS } from '../apps/registry';

// Kein echter Kauf-Link im öffentlichen Repo (auch kein Test-Link): Platzhalter, die Kacheln sind nur zum Ansehen.
const TEST = 'https://pay.rev.cat/beispiel';

export default function KaufVorschau() {
  const bald = new URLSearchParams(location.search).get('bald');
  const prepared = bald ? WEB_OFFERS[bald] : undefined;
  if (bald && prepared) {
    const name = APPS.find((a) => a.id === bald)?.name ?? bald;
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
        <WebBuy email="beispiel@betrieb.at" dexId="claude-sichttest-0000" groups={[{ title: `${name} Pro`, lead: prepared.lead, offer: prepared.pro }]} />
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      <WebBuy
        email="beispiel@betrieb.at"
        dexId="claude-sichttest-0000"
        groups={[
          {
            title: 'WinterDex Pro',
            lead: 'Unbegrenzt Objekte und Strecken, PDF ohne Wasserzeichen, Team bis 20 Mitarbeiter',
            offer: {
              link: TEST,
              plans: [
                { pkg: '$rc_six_month', title: 'Saison', price: '39,99 €', per: 'für 6 Monate', note: 'entspricht 6,67 € im Monat', best: true, tag: 'Meist gewählt' },
                { pkg: '$rc_monthly', title: 'Monatlich', price: '9,99 €', per: 'pro Monat', note: 'monatlich kündbar' },
              ],
            },
          },
          {
            title: 'Dexware Suite',
            lead: 'Pro in allen Prüf-Apps mit einem Abo',
            offer: {
              link: TEST,
              plans: [
                { pkg: '$rc_annual', title: 'Jährlich', price: '319,99 €', per: 'pro Jahr', note: '4 Monate geschenkt', best: true, tag: 'Bester Preis' },
                { pkg: '$rc_monthly', title: 'Monatlich', price: '39,99 €', per: 'pro Monat', note: 'monatlich kündbar' },
              ],
            },
          },
        ]}
      />
    </div>
  );
}
