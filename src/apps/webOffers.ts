// Kauf im Browser (Paddle über RevenueCat-Kauf-Link) — vorbereitete Angebote je App.
//
// link leer = noch nicht freigeschaltet: Die Abo-Seite zeigt die Tarife schon, der Knopf ist ausgegraut („In Kürze
// verfügbar“). Sobald Paddle freigegeben hat und es für die App einen LIVE-Kauf-Link gibt, hier die Adresse eintragen
// (https://pay.rev.cat/<token>, nie den Test-Link) — dann führen die Kacheln zur Kasse.
// Anleitung: dexware-suite/vertrieb/web-checkout/README.md
//
// Preise = die Play-Preise der App (Quelle: dexware-suite/landing-system/apps/<app>.js → pricing.pro). Ein Tarif ohne
// belegten Preis wird nicht angeboten (SpielDex/SchutzDex: Jahrespreis steht auf der Landing nicht → nur monatlich).
// WinterDex steht in registry.ts (eigener Saison-Tarif).
import type { WebOffer, WebPlan } from './registry';

const monthly = (price: string): WebPlan => ({ pkg: '$rc_monthly', title: 'Monatlich', price, per: 'pro Monat', note: 'monatlich kündbar' });
const yearly = (price: string, perMonth: string): WebPlan => ({
  pkg: '$rc_annual',
  title: 'Jährlich',
  price,
  per: 'pro Jahr',
  note: `entspricht ${perMonth} im Monat`,
  best: true,
  tag: 'Meist gewählt',
});

const std = (): WebOffer => ({ link: '', plans: [yearly('79,99 €', '6,67 €'), monthly('9,99 €')] });

export const WEB_OFFERS: Record<string, { lead: string; pro: WebOffer }> = {
  leiterdex: { lead: 'Unbegrenzt Leitern und Tritte, PDF ohne Wasserzeichen, Team bis 20 Mitarbeiter', pro: std() },
  feuerdex: { lead: 'Alle Pro-Funktionen von FeuerDex — für dein Konto, im Browser und in der App', pro: std() },
  toredex: { lead: 'Alle Pro-Funktionen von ToreDex — für dein Konto, im Browser und in der App', pro: std() },
  gurtdex: { lead: 'Alle Pro-Funktionen von GurtDex — für dein Konto, im Browser und in der App', pro: std() },
  hebedex: { lead: 'Alle Pro-Funktionen von HebeDex — für dein Konto, im Browser und in der App', pro: std() },
  geruestdex: { lead: 'Alle Pro-Funktionen von GerüstDex — für dein Konto, im Browser und in der App', pro: std() },
  regaldex: { lead: 'Alle Pro-Funktionen von RegalDex — für dein Konto, im Browser und in der App', pro: std() },
  kfzdex: { lead: 'Unbegrenzt Fahrzeuge und Fahrer, Team bis 20 Mitarbeiter', pro: std() },
  spieldex: { lead: 'Alle Pro-Funktionen von SpielDex — für dein Konto, im Browser und in der App', pro: { link: '', plans: [monthly('9,99 €')] } },
  pruefdex: { lead: 'Unbegrenzt Geräte und Prüfungen, eigenes Branding im Protokoll', pro: { link: '', plans: [yearly('119,99 €', '10,00 €'), monthly('14,99 €')] } },
  schutzdex: { lead: 'Alle Pro-Funktionen von SchutzDex — für dein Konto, im Browser und in der App', pro: { link: '', plans: [monthly('14,99 €')] } },
};
