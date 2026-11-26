// Nur im Dev-Server (/vorschau-kauf): die Kauf-Kacheln ohne Anmeldung ansehen. Links zeigen auf den Test-Kauf-Link.
// /vorschau-kauf?bald=<app> zeigt den vorbereiteten, noch ausgegrauten Zustand einer App (webOffers).
// /vorschau-kauf?kasse=<fall> zeigt die Paddle-Kasse von WinterDex mit einem NACHGEBAUTEN SDK (kein Netz, kein Paddle):
//   fall = erfolg | abbruch | spaet (Fenster nach Zahlung geschlossen) | fehler | netz | ladefehler | leer | sandbox
//   /vorschau-kauf?kasse=danke&status=pruefe|ok|spaeter[&sandbox] zeigt nur die Danke-Ansicht.
//   Darüber/darunter wie auf der echten Abo-Seite (Free, Kasse an): Tarif-Karte mit dem Text aus aboAnzeige (kasseAn) und
//   der neutrale Verwalten-Hinweis.
import { useState } from 'react';
import { WebBuy } from '../components/WebBuy';
import { KaufDanke, PaddleKasse, type GekauftInfo } from '../components/PaddleKasse';
import type { KasseKonfig, RcAngebot, RcLader, RcPurchases } from '../lib/paddleKasse';
import { WEB_OFFERS } from '../apps/webOffers';
import { APPS } from '../apps/registry';
import { aboAnzeige, suiteLead } from '../lib/aboAnzeige';
import type { AboInfo } from '../lib/abo';
import { VerwaltenNeutral } from '../components/AboPage';

/** Konto ohne Tarif (Free) — für Tarif-Karte und Verwalten-Hinweis der Vorschau */
const FREE: AboInfo = {
  pro: null,
  suite: null,
  suiteBackendActive: false,
  suiteBackendExpires: null,
  suiteBackendUnknown: false,
  appProBackend: null,
  appProBackendExpires: null,
  suiteNichtHier: false,
  suiteAppParam: null,
  managementUrl: null,
};

// Kein echter Kauf-Link im öffentlichen Repo (auch kein Test-Link): Platzhalter, die Kacheln sind nur zum Ansehen.
const TEST = 'https://pay.rev.cat/beispiel';

/** Beispiel-Angebot (nur Vorschau): so liefert RevenueCat die Pakete — Preise in Mikro-Einheiten. */
const BEISPIEL: RcAngebot = {
  identifier: 'web_pro_live',
  availablePackages: [
    { identifier: '$rc_monthly', product: { identifier: 'pri_monat', price: { amountMicros: 19_990_000, currency: 'EUR' }, period: { number: 1, unit: 'month' } } },
    { identifier: '$rc_annual', product: { identifier: 'pri_jahr', price: { amountMicros: 69_990_000, currency: 'EUR' }, period: { number: 1, unit: 'year' } } },
  ],
};

function demoLader(fall: string): RcLader {
  let pro = false;
  const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const info = () => ({ entitlements: { active: pro ? { pro: {} } : {} } });
  const inst: RcPurchases = {
    async getOfferings() {
      await warte(600);
      if (fall === 'ladefehler') throw Object.assign(new Error('Netz'), { errorCode: 10 });
      const all: Record<string, RcAngebot> = fall === 'leer' ? {} : { web_pro_live: BEISPIEL, web_pro: BEISPIEL };
      return { all, current: null };
    },
    async purchase() {
      await warte(1200);
      if (fall === 'abbruch') throw Object.assign(new Error('abgebrochen'), { errorCode: 1 });
      if (fall === 'spaet') {
        setTimeout(() => (pro = true), 3000);
        throw Object.assign(new Error('abgebrochen'), { errorCode: 1 });
      }
      if (fall === 'fehler') throw Object.assign(new Error('Paddle'), { errorCode: 2 });
      if (fall === 'netz') throw Object.assign(new Error('Netz'), { errorCode: 10 });
      pro = true;
      return { customerInfo: info() };
    },
    async getCustomerInfo() {
      return info();
    },
    async changeUser() {
      return info();
    },
    getAppUserId: () => 'vorschau-0000',
  };
  return async () => ({ Purchases: { configure: () => inst } });
}

function KasseVorschau({ fall }: { fall: string }) {
  const app = APPS.find((a) => a.id === 'winterdex')!;
  const style = { '--accent': app.theme.accent, '--on-accent': app.theme.onAccent, '--bg': app.theme.bg } as React.CSSProperties;
  const sandbox = fall === 'sandbox';
  const [konf] = useState<KasseKonfig>(() => ({ modus: sandbox ? 'sandbox' : 'live', rcKey: `pdl_vorschau_${fall}_${Date.now()}`, offering: sandbox ? 'web_pro' : 'web_pro_live' }));
  const [lade] = useState(() => demoLader(fall));
  const [kauf, setKauf] = useState<{ info: GekauftInfo; status: 'pruefe' | 'ok' | 'spaeter' } | null>(() => {
    if (fall !== 'danke') return null;
    const q = new URLSearchParams(location.search);
    const st = q.get('status');
    return {
      info: { paket: { pkg: '$rc_annual', titel: 'Saison', preis: '69,99 €', per: 'pro Jahr' }, proBestaetigt: true, sandbox: q.has('sandbox') },
      status: st === 'pruefe' || st === 'spaeter' ? st : 'ok',
    };
  });
  const anz = aboAnzeige(app, FREE, { orgPro: false, bonusUntil: null, kasseAn: true });
  return (
    <div className="app-scope" style={style}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px', display: 'grid', gap: 16 }}>
        {!kauf && (
          <div className="card">
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{anz.planName}</h3>
              <span className="badge">kostenlose Version</span>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              {anz.text}
            </p>
          </div>
        )}
        {kauf ? (
          <KaufDanke appName={app.name} info={kauf.info} email="beispiel@betrieb.at" status={kauf.status} weiter="/vorschau-kauf?kasse=erfolg" />
        ) : (
          <PaddleKasse
            appName={app.name}
            lead={app.webCheckoutLead ?? ''}
            plaene={app.webCheckout?.pro?.plans ?? []}
            konf={konf}
            dexId="vorschau-0000"
            email="beispiel@betrieb.at"
            lade={lade}
            onGekauft={(info) => {
              setKauf({ info, status: 'pruefe' });
              setTimeout(() => setKauf((k) => (k ? { ...k, status: 'ok' } : k)), 2500);
            }}
          />
        )}
        {!kauf && anz.verwalten === 'neutral' && <VerwaltenNeutral appName={app.name} />}
      </div>
    </div>
  );
}

export default function KaufVorschau() {
  const kasse = new URLSearchParams(location.search).get('kasse');
  if (kasse) return <KasseVorschau fall={kasse} />;
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
  // Seit 26.11.2026 gibt es die Suite nur noch in den Apps des Suite-Abos (registry: inSuite) — WinterDex hat ein eigenes
  // Abo. Die Vorschau zeigt deshalb WinterDex allein und darunter LeiterDex mit der Suite-Kachel.
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
                { pkg: '$rc_annual', title: 'Saison', price: '69,99 €', per: 'pro Jahr', note: 'deckt die ganze Wintersaison', best: true, tag: 'Meist gewählt' },
                { pkg: '$rc_monthly', title: 'Monatlich', price: '19,99 €', per: 'pro Monat', note: 'monatlich kündbar' },
              ],
            },
          },
        ]}
      />
      <WebBuy
        email="beispiel@betrieb.at"
        dexId="claude-sichttest-0000"
        groups={[
          { title: 'LeiterDex Pro', lead: WEB_OFFERS.leiterdex.lead, offer: { ...WEB_OFFERS.leiterdex.pro, link: TEST } },
          {
            title: 'Dexware Suite',
            lead: suiteLead(),
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
