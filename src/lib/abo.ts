// ============================================================================
//  Abo-Status fürs Dashboard — liest RevenueCat (per App) + Suite-Backend.
//
//  Identitäten (Suite-Standard, gleich wie in den Mobile-Apps):
//   - Supabase-User-ID          → Purchases.logIn(session.user.id) in der App
//   - Dexware-ID = sha256(email) → configureSuiteIdentity(email) in der App
//  Beide sind in RevenueCat Aliase desselben Kunden; wir fragen beide ab und
//  mergen die Entitlements (nimmt jeweils das mit dem spätesten Ablauf).
//
//  Käufe/Kündigungen laufen ausschließlich über den Store (Google Play) —
//  das Dashboard zeigt nur an und verlinkt zur Verwaltung.
// ============================================================================
import type { Session } from '@supabase/supabase-js';
import type { AppConfig } from '../apps/registry';

/** Suite-Backend (eigenes Supabase-Projekt) — Werte identisch zu den App-Builds. */
const SUITE_URL = 'https://jsrfxentjqfmpusaubyw.supabase.co/functions/v1';
const SUITE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzcmZ4ZW50anFmbXB1c2F1Ynl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTk4OTAsImV4cCI6MjA5ODY5NTg5MH0.Tj7ezscGHn-naqMpsR7oMf-iYgiDfbK8LNZn3H5tqJI';

/** Entitlement-Kennungen im RevenueCat-Dashboard (Suite-Standard). */
const ENTITLEMENT_PRO = 'pro';
const ENTITLEMENT_SUITE = 'suite';

export type AboStore = 'play_store' | 'app_store' | 'promotional' | 'stripe' | string;

export interface EntitlementInfo {
  active: boolean;
  /** null = lebenslang / kein Ablauf hinterlegt */
  expiresDate: string | null;
  /** Verlängert sich automatisch (keine Kündigung erkannt, kein Zahlungsproblem)? */
  willRenew: boolean;
  /** Kündigung im Store erkannt — läuft zum Ablaufdatum aus */
  unsubscribed: boolean;
  /** trial | normal | intro */
  periodType: string | null;
  store: AboStore | null;
  productId: string | null;
  /** Test-/Sandbox-Kauf (kein echter Store-Kauf) */
  sandbox: boolean;
}

export interface AboInfo {
  /** Einzel-Abo dieser App */
  pro: EntitlementInfo | null;
  /** Suite-Bundle, gekauft in DIESER App (RevenueCat-Entitlement) */
  suite: EntitlementInfo | null;
  /** Suite-Bundle laut Suite-Backend (deckt Käufe in anderen Apps ab) */
  suiteBackendActive: boolean;
  suiteBackendExpires: string | null;
  /** Store-Verwaltungslink des Abos (Google Play), falls RevenueCat einen kennt */
  managementUrl: string | null;
}

/** Dexware-ID: SHA-256 der normalisierten E-Mail (identisch zu den Apps). */
export async function dexwareId(email: string): Promise<string> {
  const norm = email.trim().toLowerCase();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- RevenueCat REST (v1, öffentlicher SDK-Key) -----------------------------

interface RcEntitlement {
  expires_date: string | null;
  purchase_date: string;
  product_identifier: string;
}

interface RcSubscription {
  expires_date: string | null;
  unsubscribe_detected_at: string | null;
  billing_issues_detected_at: string | null;
  period_type: string;
  store: string;
  is_sandbox: boolean;
}

interface RcSubscriber {
  entitlements: Record<string, RcEntitlement>;
  subscriptions: Record<string, RcSubscription>;
  management_url: string | null;
}

async function fetchSubscriber(rcKey: string, appUserId: string): Promise<RcSubscriber | null> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${rcKey}` } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { subscriber?: RcSubscriber };
  return body.subscriber ?? null;
}

function toInfo(sub: RcSubscriber, key: string): EntitlementInfo | null {
  const ent = sub.entitlements[key];
  if (!ent) return null;
  const subscription = sub.subscriptions[ent.product_identifier] ?? null;
  const expires = ent.expires_date;
  const active = !expires || new Date(expires) > new Date();
  const unsubscribed = !!subscription?.unsubscribe_detected_at;
  return {
    active,
    expiresDate: expires,
    willRenew:
      active && !!subscription && !unsubscribed && !subscription.billing_issues_detected_at,
    unsubscribed,
    periodType: subscription?.period_type ?? null,
    store: subscription?.store ?? (expires ? null : 'promotional'),
    productId: ent.product_identifier,
    sandbox: !!subscription?.is_sandbox,
  };
}

/** Von zwei Abfragen (User-ID / Dexware-ID) das „bessere" Entitlement behalten. */
function better(a: EntitlementInfo | null, b: EntitlementInfo | null): EntitlementInfo | null {
  if (!a) return b;
  if (!b) return a;
  if (a.active !== b.active) return a.active ? a : b;
  if (!a.expiresDate) return a; // lebenslang schlägt befristet
  if (!b.expiresDate) return b;
  return new Date(a.expiresDate) >= new Date(b.expiresDate) ? a : b;
}

// --- Suite-Backend -----------------------------------------------------------

async function fetchSuiteStatus(
  id: string,
): Promise<{ active: boolean; expires_at?: string | null }> {
  try {
    const res = await fetch(`${SUITE_URL}/suite-status?app_user_id=${id}`, {
      headers: { Authorization: `Bearer ${SUITE_ANON}`, apikey: SUITE_ANON },
    });
    if (!res.ok) return { active: false };
    return (await res.json()) as { active: boolean; expires_at?: string | null };
  } catch {
    // Offline/CORS → Suite unbekannt, Anzeige degradiert zu „nicht aktiv".
    return { active: false };
  }
}

// --- Öffentliche API ----------------------------------------------------------

export async function loadAboInfo(app: AppConfig, session: Session): Promise<AboInfo> {
  if (!app.revenueCat) {
    throw new Error(`Für ${app.name} ist kein RevenueCat-Key hinterlegt`);
  }
  const email = session.user.email ?? '';
  const dexId = email ? await dexwareId(email) : null;

  const [byUid, byDexId, suiteStatus] = await Promise.all([
    fetchSubscriber(app.revenueCat, session.user.id),
    dexId ? fetchSubscriber(app.revenueCat, dexId) : Promise.resolve(null),
    dexId ? fetchSuiteStatus(dexId) : Promise.resolve({ active: false as const }),
  ]);

  if (!byUid && !byDexId) {
    throw new Error('Abo-Status konnte nicht geladen werden — bitte später erneut versuchen.');
  }

  const pro = better(
    byUid ? toInfo(byUid, ENTITLEMENT_PRO) : null,
    byDexId ? toInfo(byDexId, ENTITLEMENT_PRO) : null,
  );
  const suite = better(
    byUid ? toInfo(byUid, ENTITLEMENT_SUITE) : null,
    byDexId ? toInfo(byDexId, ENTITLEMENT_SUITE) : null,
  );

  return {
    pro,
    suite,
    suiteBackendActive: suiteStatus.active,
    suiteBackendExpires: 'expires_at' in suiteStatus ? (suiteStatus.expires_at ?? null) : null,
    managementUrl: byDexId?.management_url ?? byUid?.management_url ?? null,
  };
}

/** Google-Play-Abo-Übersicht — funktioniert am Handy und im Browser (gleiches Google-Konto). */
export const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';
