// Kauf im Browser direkt auf der Abo-Seite (WinterDex, Weg A seit 26.11.2026): RevenueCat Web SDK
// (`@revenuecat/purchases-js`) mit Paddle Billing. Das Paket legt die Paddle-Transaktion über RevenueCat an und öffnet die
// Paddle-Kasse als Fenster ÜBER unserer Seite (dashboard.dexware.app ist bei Paddle freigegeben) — die Domain pay.rev.cat
// der Kauf-Links braucht es dafür nicht. Gekauft wird unter der Dexware-ID (sha256 der E-Mail), derselben Kennung wie in
// App, Server und den bisherigen Kauf-Links → App und Server erkennen den Kauf ohne Änderung.
//
// SCHALTER: Ohne öffentlichen RevenueCat-Schlüssel des Paddle-Eintrags (Muster pdl_…) ist die Kasse AUS — die Abo-Seite
// zeigt dann genau das, was sie bisher zeigt (ausgegraute Kacheln „In Kürze“). Schlüssel: registry.ts (paddleKasse) oder
// beim Bauen VITE_RC_PADDLE_KEY / VITE_RC_PADDLE_SANDBOX_KEY. Anleitung: docs/paddle-kasse.md
//
// Preise kommen IMMER aus dem RevenueCat-Angebot (nie aus dem Code). Bestehende Käufe (Play, Promo, Suite-Bestand …)
// berührt dieser Baustein nicht: Ob überhaupt eine Kauf-Karte erscheint, entscheidet darfKaufen() wie bisher.
//
// Bewusst ohne Laufzeit-Imports (nur Typen): Node-Tests laden die Datei direkt (tests/paddle-kasse.test.mjs); das
// SDK (~1,3 MB) wird erst auf der Abo-Seite nachgeladen (Loader von außen, siehe components/PaddleKasse.tsx).

import type { WebPlan } from '../apps/registry';

// ---------------------------------------------------------------------------- Schalter

/** Öffentlicher RevenueCat-Schlüssel eines Paddle-Eintrags — dasselbe Muster prüft das SDK. */
export const RC_PADDLE_KEY_RE = /^pdl_[a-zA-Z0-9_.-]+$/;
/**
 * GEHEIMER Paddle-API-Schlüssel (pdl_live_apikey_… / pdl_sdbx_apikey_…) — passt auch auf das Muster oben, gehört aber nie
 * in den Browser (und nie ins öffentliche Repo). Wird abgelehnt, die Kasse bleibt dann aus.
 */
export const PADDLE_GEHEIM_RE = /^pdl_(live|sdbx)_apikey_/i;

export type KasseModus = 'live' | 'sandbox';

/** Ein Paddle-Eintrag in RevenueCat: öffentlicher Schlüssel + Angebot (Offering) mit den Paketen. */
export interface PaddleEintrag {
  /** Öffentlicher RevenueCat-Schlüssel des Paddle-Eintrags (pdl_…); leer = nicht eingerichtet */
  rcKey: string;
  /** Kennung des RevenueCat-Angebots, z. B. web_pro_live */
  offering: string;
}

/** Einstellung je App (registry.ts): Live- und getrennter Sandbox-Eintrag. */
export interface PaddleKasseEinstellung {
  live?: PaddleEintrag;
  sandbox?: PaddleEintrag;
}

export interface KasseKonfig {
  modus: KasseModus;
  rcKey: string;
  offering: string;
}

const gueltig = (key: string | undefined | null): key is string =>
  typeof key === 'string' && RC_PADDLE_KEY_RE.test(key.trim()) && !PADDLE_GEHEIM_RE.test(key.trim());

/**
 * Ist die Kasse an — und mit welchem Schlüssel? null = AUS (Abo-Seite wie bisher).
 *  · Sandbox nur ausdrücklich per Adresse `?kasse=sandbox` UND mit Sandbox-Schlüssel. Fehlt der Sandbox-Schlüssel, bleibt
 *    die Kasse aus — nie stillschweigend auf Live ausweichen (wer testen will, soll kein echtes Geld zahlen).
 *  · Live, wenn ein gültiger Live-Schlüssel da ist (Bau-Variable vor registry).
 *  · Ungültige Schlüssel (z. B. versehentlich goog_… oder der GEHEIME Paddle-API-Schlüssel pdl_live_apikey_…) zählen als
 *    „nicht da“.
 */
export function kasseKonfig(
  einst: PaddleKasseEinstellung | undefined,
  opt: { env?: Record<string, unknown>; search?: string } = {},
): KasseKonfig | null {
  if (!einst) return null;
  const env = opt.env ?? {};
  const envKey = (name: string) => (typeof env[name] === 'string' ? (env[name] as string).trim() : '');
  const sandboxGewuenscht = new URLSearchParams(opt.search ?? '').get('kasse') === 'sandbox';
  if (sandboxGewuenscht) {
    const key = envKey('VITE_RC_PADDLE_SANDBOX_KEY') || einst.sandbox?.rcKey?.trim() || '';
    const offering = einst.sandbox?.offering?.trim() || '';
    return gueltig(key) && offering ? { modus: 'sandbox', rcKey: key, offering } : null;
  }
  const key = envKey('VITE_RC_PADDLE_KEY') || einst.live?.rcKey?.trim() || '';
  const offering = einst.live?.offering?.trim() || '';
  if (!gueltig(key) || !offering) return null;
  // Derselbe Schlüssel als Live und Sandbox eingetragen = Verwechslung → lieber aus
  const sandKey = envKey('VITE_RC_PADDLE_SANDBOX_KEY') || einst.sandbox?.rcKey?.trim() || '';
  if (sandKey && sandKey === key) return null;
  return { modus: 'live', rcKey: key, offering };
}

/**
 * Darf diese Abo-Seite überhaupt eine Kauf-Karte zeigen? (gleiche Regel wie bisher für die Kauf-Kacheln)
 * Nie bei bestehendem Tarif (eigenes Pro aus Play/Web/Promo, Suite bzw. Suite-Bestand, Pro über den Betrieb), nie für
 * Teammitglieder (Pro hängt am Konto des Inhabers), nie, solange der Suite-Server gestört ist („Free“ wäre nur geraten).
 */
export function darfKaufen(s: {
  notOwner: boolean;
  suiteActive: boolean;
  proActive: boolean;
  viaOrg: boolean;
  suiteUnklar: boolean;
  dexId: string | null | undefined;
  email: string | null | undefined;
}): boolean {
  return !s.notOwner && !s.suiteActive && !s.proActive && !s.viaOrg && !s.suiteUnklar && !!s.dexId && !!s.email;
}

// ---------------------------------------------------------------------------- SDK-Ausschnitt (nur was wir nutzen)

export interface RcPreis {
  amountMicros: number;
  currency: string;
}
export interface RcPeriode {
  number: number;
  unit: string;
}
export interface RcProdukt {
  identifier: string;
  title?: string;
  price: RcPreis | null;
  period: RcPeriode | null;
  freeTrialPhase?: unknown;
  introPricePhase?: unknown;
}
export interface RcPaket {
  identifier: string;
  product: RcProdukt;
}
export interface RcAngebot {
  identifier: string;
  availablePackages: RcPaket[];
}
export interface RcAngebote {
  all: Record<string, RcAngebot>;
  current: RcAngebot | null;
}
export interface RcKundenInfo {
  entitlements: { active: Record<string, unknown> };
}
export interface RcKaufParameter {
  rcPackage: RcPaket;
  customerEmail?: string;
  selectedLocale?: string;
  defaultLocale?: string;
  skipSuccessPage?: boolean;
  metadata?: Record<string, string | null>;
}
export interface RcPurchases {
  getOfferings(params?: { offeringIdentifier?: string }): Promise<RcAngebote>;
  purchase(params: RcKaufParameter): Promise<{ customerInfo: RcKundenInfo }>;
  getCustomerInfo(): Promise<RcKundenInfo>;
  changeUser(appUserId: string): Promise<unknown>;
  getAppUserId(): string;
}
export interface RcModul {
  Purchases: {
    configure(config: {
      apiKey: string;
      appUserId: string;
      flags?: { collectAnalyticsEvents?: boolean; autoCollectUTMAsMetadata?: boolean };
    }): RcPurchases;
  };
}
export type RcLader = () => Promise<RcModul>;

// ---------------------------------------------------------------------------- Pakete aus dem Angebot

export interface KassenPaket {
  /** Paket-Kennung im Angebot ($rc_annual, $rc_monthly, …) */
  pkg: string;
  titel: string;
  /** Preis aus dem Angebot, deutsch formatiert („49,99 €“) */
  preis: string;
  /** „pro Jahr“, „pro Monat“, „für 6 Monate“ … */
  per: string;
  hinweis?: string;
  best?: boolean;
  tag?: string;
  /** Laufzeit in Monaten (zum Sortieren); 0 = unbekannt */
  monate: number;
  /** Das Paket-Objekt des SDK — genau dieses geht an purchase() */
  rcPackage: RcPaket;
}

/** Betrag aus Mikro-Einheiten (9,99 € = 9 990 000) — deutsch formatiert, Währung aus dem Angebot. */
export function preisText(micros: number, currency: string): string {
  const betrag = micros / 1_000_000;
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(betrag);
  } catch {
    return `${betrag.toFixed(2).replace('.', ',')} ${currency}`;
  }
}

function monateVon(p: RcPeriode | null): number {
  if (!p || !(p.number > 0)) return 0;
  switch (p.unit) {
    case 'year':
      return p.number * 12;
    case 'month':
      return p.number;
    case 'week':
      return p.number / 4.345;
    case 'day':
      return p.number / 30.4;
    default:
      return 0;
  }
}

/** „pro Jahr“, „pro Monat“, „für 6 Monate“ — leer, wenn keine Laufzeit bekannt ist. */
export function laufzeitText(p: RcPeriode | null): string {
  if (!p || !(p.number > 0)) return '';
  const n = p.number;
  switch (p.unit) {
    case 'year':
      return n === 1 ? 'pro Jahr' : `für ${n} Jahre`;
    case 'month':
      return n === 1 ? 'pro Monat' : n === 12 ? 'pro Jahr' : `für ${n} Monate`;
    case 'week':
      return n === 1 ? 'pro Woche' : `für ${n} Wochen`;
    case 'day':
      return n === 1 ? 'pro Tag' : `für ${n} Tage`;
    default:
      return '';
  }
}

function laufzeitTitel(p: RcPeriode | null): string {
  const m = monateVon(p);
  if (m === 12) return 'Jährlich';
  if (m === 1) return 'Monatlich';
  if (p && p.unit === 'month') return `${p.number} Monate`;
  if (p && p.unit === 'year') return `${p.number} Jahre`;
  return 'Tarif';
}

/**
 * Pakete des Angebots für die Kauf-Karte: Preis und Laufzeit IMMER aus dem Angebot; Titel/Hinweis/Markierung aus den
 * Tarif-Texten der registry (gleiche Paket-Kennung), sonst aus der Laufzeit abgeleitet. Reihenfolge wie in der registry,
 * weitere Pakete dahinter (längste Laufzeit zuerst). Pakete ohne Preis oder mit Preis 0 werden nicht angeboten.
 */
export function paketeAusAngebot(angebot: RcAngebot | null | undefined, plaene: WebPlan[] = []): KassenPaket[] {
  if (!angebot || !Array.isArray(angebot.availablePackages)) return [];
  const out: KassenPaket[] = [];
  for (const p of angebot.availablePackages) {
    const preis = p?.product?.price;
    if (!preis || !(preis.amountMicros > 0) || !preis.currency) continue;
    const plan = plaene.find((x) => x.pkg === p.identifier);
    const period = p.product.period ?? null;
    const extra = p.product.freeTrialPhase
      ? 'mit Gratis-Testzeit — Details in der Kasse'
      : p.product.introPricePhase
        ? 'mit Einführungspreis — Details in der Kasse'
        : '';
    out.push({
      pkg: p.identifier,
      titel: plan?.title ?? laufzeitTitel(period),
      preis: preisText(preis.amountMicros, preis.currency),
      per: laufzeitText(period),
      hinweis: [plan?.note, extra].filter(Boolean).join(' · ') || undefined,
      best: plan?.best,
      tag: plan?.tag,
      monate: monateVon(period),
      rcPackage: p,
    });
  }
  const rang = (k: KassenPaket) => {
    const i = plaene.findIndex((x) => x.pkg === k.pkg);
    return i >= 0 ? i : plaene.length;
  };
  return out.sort((a, b) => rang(a) - rang(b) || b.monate - a.monate);
}

// ---------------------------------------------------------------------------- Fehler

/** Fehler-Kennungen des SDK (ErrorCode in @revenuecat/purchases-js — der Test vergleicht sie mit dem Paket). */
export const RC_FEHLER = {
  UnknownError: 0,
  UserCancelledError: 1,
  StoreProblemError: 2,
  PurchaseNotAllowedError: 3,
  PurchaseInvalidError: 4,
  ProductNotAvailableForPurchaseError: 5,
  ProductAlreadyPurchasedError: 6,
  NetworkError: 10,
  InvalidCredentialsError: 11,
  InvalidAppUserIdError: 14,
  OperationAlreadyInProgressError: 15,
  PaymentPendingError: 20,
  ConfigurationError: 23,
  InvalidEmailError: 38,
} as const;

export const KASSE_HILFE = 'Hilfe bekommst du unter support@dexware.app.';

export type FehlerDeutung =
  | { art: 'abbruch' }
  | {
      art: 'fehler';
      text: string;
      /** Kann der Fehler NACH der Zahlung passiert sein? Dann nichts von „nicht abgebucht“ sagen und Pro nachprüfen. */
      vielleichtBezahlt: boolean;
    };

/** Fehler aus Laden/Kauf in ruhigen deutschen Text übersetzen. Abbruch durch den Kunden ist kein Fehler. */
export function fehlerDeutung(e: unknown): FehlerDeutung {
  const code = typeof e === 'object' && e !== null ? (e as { errorCode?: unknown }).errorCode : undefined;
  const F = RC_FEHLER;
  switch (code) {
    case F.UserCancelledError:
      return { art: 'abbruch' };
    case F.NetworkError:
      return {
        art: 'fehler',
        text: 'Keine Verbindung zum Zahlungsdienst. Bitte prüfe die Internetverbindung und versuche es noch einmal. Falls du schon bezahlt hattest, schaltet sich Pro in wenigen Minuten von selbst frei.',
        vielleichtBezahlt: true,
      };
    case F.PaymentPendingError:
      return {
        art: 'fehler',
        text: 'Die Zahlung wird noch geprüft. Sobald sie bestätigt ist, wird Pro von selbst freigeschaltet — die Bestätigung kommt per E-Mail von Paddle.',
        vielleichtBezahlt: true,
      };
    case F.ProductAlreadyPurchasedError:
      return {
        art: 'fehler',
        text: 'Für dein Konto läuft bereits ein Abo. Lade die Seite bitte neu — dann siehst du es hier.',
        vielleichtBezahlt: true,
      };
    case F.OperationAlreadyInProgressError:
      return {
        art: 'fehler',
        text: 'Es läuft schon ein Kauf (vielleicht in einem anderen Fenster). Schließ das andere Bestellfenster oder warte kurz.',
        vielleichtBezahlt: true,
      };
    case F.InvalidEmailError:
      return {
        art: 'fehler',
        text: `Der Zahlungsdienst hat die E-Mail-Adresse deines Kontos nicht angenommen. ${KASSE_HILFE}`,
        vielleichtBezahlt: false,
      };
    case F.InvalidCredentialsError:
    case F.ConfigurationError:
    case F.InvalidAppUserIdError:
    case F.ProductNotAvailableForPurchaseError:
      return {
        art: 'fehler',
        text: `Der Kauf im Browser ist gerade nicht verfügbar. Bitte versuch es später noch einmal. ${KASSE_HILFE}`,
        vielleichtBezahlt: false,
      };
    case F.StoreProblemError:
      return {
        art: 'fehler',
        text: `Der Zahlungsdienst Paddle meldet gerade ein Problem. Bitte versuch es in ein paar Minuten noch einmal. ${KASSE_HILFE}`,
        vielleichtBezahlt: true,
      };
    default:
      return {
        art: 'fehler',
        text: `Der Kauf konnte nicht abgeschlossen werden. Falls du schon bezahlt hast, schaltet sich Pro in wenigen Minuten von selbst frei (die Bestätigung kommt per E-Mail von Paddle) — sonst einfach noch einmal versuchen. ${KASSE_HILFE}`,
        vielleichtBezahlt: true,
      };
  }
}

/** Fehler beim Öffnen der Kasse ohne passendes Angebot (falsche Angebots-Kennung, Pakete fehlen). */
export class AngebotFehltError extends Error {
  constructor(offering: string) {
    super(`RevenueCat-Angebot „${offering}“ nicht gefunden oder ohne Pakete`);
    this.name = 'AngebotFehltError';
  }
}

// ---------------------------------------------------------------------------- SDK einrichten + kaufen

let aktiv: { key: string; user: string; inst: RcPurchases } | null = null;

/** Nur für Tests: gemerkte SDK-Einrichtung vergessen. */
export function kasseZuruecksetzen(): void {
  aktiv = null;
}

/**
 * SDK laden und für dieses Konto einrichten. Einmal je Schlüssel; Kontowechsel im selben Tab → changeUser.
 * Ohne Analyse-Ereignisse und ohne UTM-Sammeln (Datensparsamkeit — gebraucht wird nur der Kauf selbst).
 */
export async function kasseEinrichten(lade: RcLader, konf: KasseKonfig, dexId: string): Promise<RcPurchases> {
  if (aktiv && aktiv.key === konf.rcKey) {
    if (aktiv.user !== dexId) {
      await aktiv.inst.changeUser(dexId);
      aktiv = { ...aktiv, user: dexId };
    }
    return aktiv.inst;
  }
  const mod = await lade();
  const inst = mod.Purchases.configure({
    apiKey: konf.rcKey,
    appUserId: dexId,
    flags: { collectAnalyticsEvents: false, autoCollectUTMAsMetadata: false },
  });
  aktiv = { key: konf.rcKey, user: dexId, inst };
  return inst;
}

/** Pakete des konfigurierten Angebots laden (Preise aus RevenueCat). Wirft AngebotFehltError, wenn es leer ist. */
export async function kassePakete(inst: RcPurchases, konf: KasseKonfig, plaene: WebPlan[]): Promise<KassenPaket[]> {
  const res = await inst.getOfferings({ offeringIdentifier: konf.offering });
  const angebot = res?.all?.[konf.offering] ?? (res?.current?.identifier === konf.offering ? res.current : null);
  const pakete = paketeAusAngebot(angebot, plaene);
  if (pakete.length === 0) throw new AngebotFehltError(konf.offering);
  return pakete;
}

/** Hat der Kunde laut RevenueCat jetzt Pro? */
export function proInKundenInfo(ci: RcKundenInfo | null | undefined): boolean {
  const active = ci?.entitlements?.active;
  return !!active && typeof active === 'object' && Object.prototype.hasOwnProperty.call(active, 'pro');
}

export type KaufErgebnis =
  | { art: 'erfolg'; proBestaetigt: boolean }
  | { art: 'abbruch' }
  | { art: 'fehler'; text: string };

const schlafen = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Kauf eines Pakets: Paddle-Fenster über der Seite, deutsch, E-Mail des Kontos vorausgefüllt, ohne RevenueCat-
 * Erfolgsseite (die Danke-Ansicht zeigt die Abo-Seite selbst). Nach Abbruch oder einem Fehler, der nach der Zahlung
 * passiert sein könnte, wird still bei RevenueCat nachgefragt — ist Pro da, gilt der Kauf als erfolgreich (nie einem
 * Zahlenden „abgebrochen“ zeigen). Abbruch: eine sofortige Nachfrage (die Seite fragt danach im Hintergrund weiter);
 * Fehler: `nachpruefen` Runden mit Pause.
 */
export async function kaufen(
  inst: RcPurchases,
  paket: KassenPaket,
  email: string,
  opt: { nachpruefen?: number; pauseMs?: number; warte?: (ms: number) => Promise<void> } = {},
): Promise<KaufErgebnis> {
  const warte = opt.warte ?? schlafen;
  try {
    const r = await inst.purchase({
      rcPackage: paket.rcPackage,
      customerEmail: email.trim(),
      selectedLocale: 'de',
      defaultLocale: 'de',
      skipSuccessPage: true,
      metadata: { quelle: 'dashboard' },
    });
    return { art: 'erfolg', proBestaetigt: proInKundenInfo(r?.customerInfo) };
  } catch (e) {
    const d = fehlerDeutung(e);
    if (d.art === 'abbruch' || d.vielleichtBezahlt) {
      const versuche = d.art === 'abbruch' ? 1 : Math.max(1, opt.nachpruefen ?? 2);
      for (let i = 0; i < versuche; i += 1) {
        if (i > 0) await warte(opt.pauseMs ?? 4000);
        try {
          if (proInKundenInfo(await inst.getCustomerInfo())) return { art: 'erfolg', proBestaetigt: true };
        } catch {
          /* Nachfrage gestört: bei der Deutung bleiben */
        }
      }
    }
    return d.art === 'abbruch' ? { art: 'abbruch' } : { art: 'fehler', text: d.text };
  }
}

/**
 * Nach dem Kauf warten, bis die Pro-Prüfung (Server/Abo-Auskunft) Pro meldet: true sobald eine Antwort true ist; nach
 * `versuche` Runden ohne true → false (die Danke-Ansicht sagt dann „kann noch ein, zwei Minuten dauern“). Fehler der
 * Prüfung zählen als „noch nicht“.
 */
export async function warteAufPro(
  pruefe: () => Promise<boolean | null>,
  opt: { versuche?: number; pauseMs?: number; warte?: (ms: number) => Promise<void>; abbrechen?: () => boolean } = {},
): Promise<boolean> {
  const versuche = Math.max(1, opt.versuche ?? 8);
  const warte = opt.warte ?? schlafen;
  for (let i = 0; i < versuche; i += 1) {
    if (opt.abbrechen?.()) return false;
    if (i > 0) await warte(opt.pauseMs ?? 5000);
    try {
      if ((await pruefe()) === true) return true;
    } catch {
      /* noch nicht */
    }
  }
  return false;
}
