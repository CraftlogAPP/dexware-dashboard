// Nur im Dev-Server (/vorschau-kauf): die Kauf-Kacheln ohne Anmeldung ansehen. Links zeigen auf den Test-Kauf-Link.
import { WebBuy } from '../components/WebBuy';

const TEST = 'https://pay.rev.cat/jbswzhlxbgsrgube';

export default function KaufVorschau() {
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
