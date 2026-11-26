// Beispiel-Zugang (NUR Dev-Server, siehe docs/beispiel-zugang.md): Abo-Abfragen beantworten, Server sperren.
// Die Abo-Seite und die Pro-Quellen ohne org_pro_active (src/lib/abo.ts, src/lib/aboProStand.ts) fragen RevenueCat und
// den Suite-Server direkt per fetch. Im Beispielmodus antwortet hier ein Jahresabo „Pro“ (aktiv, verlängert sich) — so
// erscheinen keine Kauf-Kacheln und keine Gratis-Hinweise. Jede andere Anfrage an einen Supabase-Server wird gesperrt
// (503 + Meldung in der Konsole): Im Beispielmodus geht nichts an echte Server, auch kein Lesen.

const RC = 'https://api.revenuecat.com/v1/subscribers/';
const TAG = 86_400_000;

let aktiv = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** RevenueCat-Antwort: Einzel-Abo „pro“ dieser App, Jahrestarif, seit gut drei Monaten, verlängert sich */
export function rcAntwort(app: string): unknown {
  const kauf = new Date(Date.now() - 97 * TAG).toISOString();
  const ablauf = new Date(Date.now() + 268 * TAG).toISOString();
  const produkt = `${app}_pro_yearly`;
  return {
    request_date: new Date().toISOString(),
    subscriber: {
      entitlements: { pro: { expires_date: ablauf, purchase_date: kauf, product_identifier: produkt } },
      subscriptions: {
        [produkt]: {
          expires_date: ablauf,
          original_purchase_date: kauf,
          purchase_date: kauf,
          unsubscribe_detected_at: null,
          billing_issues_detected_at: null,
          period_type: 'normal',
          store: 'play_store',
          is_sandbox: false,
        },
      },
      management_url: 'https://play.google.com/store/account/subscriptions',
    },
  };
}

function adresse(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

/** fetch umleiten (einmal je Seite). `app` = App-Kennung für die Abo-Antwort. */
export function netzUmleiten(app: string): void {
  if (aktiv || typeof window === 'undefined') return;
  aktiv = true;
  const echt = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = adresse(input);
    if (url.startsWith(RC)) return json(rcAntwort(app));
    // Suite-Server: keine Suite, kein Bestand — Pro kommt im Beispiel aus dem Einzel-Abo
    if (/\/functions\/v1\/suite-status\b/.test(url)) return json({ active: false, suite: false, bestand: false, expires_at: null });
    if (/^https:\/\/[a-z0-9-]+\.supabase\.co\//i.test(url)) {
      console.warn(`[Beispiel] Anfrage an einen echten Server gesperrt: ${url.split('?')[0]}`);
      return json({ message: 'Im Beispielmodus gesperrt (kein Server).' }, 503);
    }
    return echt(input, init);
  };
  console.info('[Beispiel] Abo-Abfragen (RevenueCat, Suite-Server) werden im Beispielmodus beantwortet, Server gesperrt.');
}
