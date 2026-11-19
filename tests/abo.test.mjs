// Prüft die Abo-Auskunft des Dashboards (src/lib/abo.ts) und die Gratis-Grenze von SchutzDex (src/schutzdex/pro.ts),
// die darauf aufbaut — ohne echte Server: RevenueCat und der Suite-Server sind durch einen fetch-Nachbau ersetzt.
//
// Worum es geht: „Kann jemand zu Unrecht gesperrt oder zu Unrecht freigeschaltet werden?“
//   • die Kennung ist sha256 der E-Mail (klein, ohne Leerzeichen außen) — dieselbe wie in den Apps und in org_pro_active
//   • fällt genau die Abfrage zur Dexware-ID aus, wird NICHT „Free“ gemeldet (Fehler → Seite bietet „Erneut versuchen“)
//   • antwortet der Suite-Server nicht, ist das „unbekannt“ — SchutzDex sperrt dann nicht
//   • abgelaufen / erstattet (Ablauf in der Vergangenheit) = nicht aktiv; gekündigt, aber noch bezahlt = aktiv
//   • die Kauf-Adresse hängt die Dexware-ID und den Tarif an
//
//   Aufruf:  node tests/abo.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^\.\.?\//.test(spec) && !/\.[a-z]+$/i.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});
const ABO = await import(pathToFileURL(path.join(here, '../src/lib/abo.ts')).href);
const PRO = await import(pathToFileURL(path.join(here, '../src/schutzdex/pro.ts')).href);

let ok = 0;
let bad = 0;
function check(name, cond, detail) {
  if (cond) ok += 1;
  else bad += 1;
  console.log(`  ${cond ? 'ok  ' : 'FEHL'}  ${name}${cond || detail === undefined ? '' : `\n        → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}

const EMAIL = '  Max.Huber@Example.AT ';
const DEX = createHash('sha256').update('max.huber@example.at').digest('hex');
const UID = '11111111-2222-3333-4444-555555555555';
const APP = { id: 'schutzdex', name: 'SchutzDex', revenueCat: 'goog_TEST' };
const session = (extra = {}) => ({ user: { id: UID, email: EMAIL, app_metadata: {}, ...extra } });

const zukunft = new Date(Date.now() + 20 * 86400000).toISOString();
const vorbei = new Date(Date.now() - 3600000).toISOString();
const leer = { entitlements: {}, subscriptions: {}, management_url: null };
const mitPro = (expires, sub = {}) => ({
  entitlements: { pro: { expires_date: expires, purchase_date: vorbei, product_identifier: 'p1' } },
  subscriptions: { p1: { expires_date: expires, unsubscribe_detected_at: null, billing_issues_detected_at: null, period_type: 'normal', store: 'paddle', is_sandbox: false, ...sub } },
  management_url: 'https://example.invalid/verwalten',
});

/** Antworten: rc[kennung] = Abonnent | Zahl (HTTP-Status) · suite = Antwort | Zahl | 'netz' */
let gefragt = [];
function server({ rc = {}, suite = { active: false } }) {
  gefragt = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    gefragt.push(u);
    if (u.includes('api.revenuecat.com')) {
      const id = decodeURIComponent(u.split('/subscribers/')[1]);
      const a = rc[id] ?? leer;
      return typeof a === 'number' ? { ok: false, status: a, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ subscriber: a }) };
    }
    if (suite === 'netz') throw new TypeError('Failed to fetch');
    return typeof suite === 'number' ? { ok: false, status: suite, json: async () => ({}) } : { ok: true, status: 200, json: async () => suite };
  };
}
const versuch = async (fn) => {
  try {
    return { wert: await fn() };
  } catch (e) {
    return { fehler: String(e?.message ?? e) };
  }
};

console.log('--- Kennung');
check('Dexware-ID = sha256 der E-Mail, klein geschrieben und ohne Leerzeichen außen', (await ABO.dexwareId(EMAIL)) === DEX, await ABO.dexwareId(EMAIL));
check('Groß-/Kleinschreibung der E-Mail ändert die Kennung nicht (Google-Konto „Max.Huber@…“ = „max.huber@…“)', (await ABO.dexwareId('MAX.HUBER@EXAMPLE.AT')) === DEX);
check('Kauf-Adresse: Link + Kennung + Tarif', ABO.webCheckoutUrl('https://pay.rev.cat/abc/', DEX, '$rc_monthly') === `https://pay.rev.cat/abc/${DEX}/checkout?package_id=%24rc_monthly`, ABO.webCheckoutUrl('https://pay.rev.cat/abc/', DEX, '$rc_monthly'));

console.log('--- Abo-Auskunft');
server({ rc: { [DEX]: mitPro(zukunft) } });
let r = await versuch(() => ABO.loadAboInfo(APP, session()));
check('Kauf an der Dexware-ID (App oder Web-Kauf): Pro aktiv, verlängert sich, Bezug „paddle“', r.wert?.pro?.active === true && r.wert.pro.willRenew === true && r.wert.pro.store === 'paddle', r);
check('gefragt wird RevenueCat mit Konto-ID und Dexware-ID, der Suite-Server mit der Dexware-ID',
  gefragt.some((u) => u.endsWith(`/subscribers/${UID}`)) && gefragt.some((u) => u.endsWith(`/subscribers/${DEX}`)) && gefragt.some((u) => u.includes(`suite-status?app_user_id=${DEX}`)), gefragt);

server({ rc: { [DEX]: mitPro(zukunft, { unsubscribe_detected_at: vorbei }) } });
r = await versuch(() => ABO.loadAboInfo(APP, session()));
check('gekündigt, aber noch bezahlt: weiter aktiv, verlängert sich nicht', r.wert?.pro?.active === true && r.wert.pro.willRenew === false && r.wert.pro.unsubscribed === true, r);

server({ rc: { [DEX]: mitPro(zukunft, { billing_issues_detected_at: vorbei }) } });
r = await versuch(() => ABO.loadAboInfo(APP, session()));
check('Zahlungsproblem in der Nachfrist: weiter aktiv (nicht sperren), „verlängert sich“ wird nicht behauptet', r.wert?.pro?.active === true && r.wert.pro.willRenew === false, r);

server({ rc: { [DEX]: mitPro(vorbei) } });
r = await versuch(() => ABO.loadAboInfo(APP, session()));
check('abgelaufen oder erstattet (Ablauf in der Vergangenheit): nicht aktiv', r.wert?.pro?.active === false, r);

server({ rc: { [DEX]: mitPro(zukunft, { is_sandbox: true }) } });
r = await versuch(() => ABO.loadAboInfo(APP, session()));
check('Testkauf (Sandbox) wird als solcher gekennzeichnet', r.wert?.pro?.sandbox === true, r);

server({ rc: { [DEX]: 503 } });
r = await versuch(() => ABO.loadAboInfo(APP, session()));
check('Abfrage zur Dexware-ID fällt aus (Konto-ID antwortet leer): Fehler statt „Free“', !!r.fehler && /später erneut/.test(r.fehler), r);

server({ rc: { [UID]: 503, [DEX]: 503 } });
r = await versuch(() => ABO.loadAboInfo(APP, session()));
check('RevenueCat fällt ganz aus: Fehler statt „Free“', !!r.fehler, r);

server({ rc: { [UID]: 503, [DEX]: mitPro(zukunft) } });
r = await versuch(() => ABO.loadAboInfo(APP, session()));
check('nur die Abfrage zur Konto-ID fällt aus: Auskunft der Dexware-ID gilt', r.wert?.pro?.active === true, r);

server({ suite: { active: true, expires_at: zukunft } });
r = await versuch(() => ABO.loadAboInfo(APP, session()));
check('Suite-Abo aus einer anderen App: laut Suite-Server aktiv, Auskunft ist sicher', r.wert?.suiteBackendActive === true && r.wert.suiteBackendUnknown === false, r);

for (const [wie, suite] of [['Fehler 500', 500], ['nicht erreichbar', 'netz']]) {
  server({ suite });
  r = await versuch(() => ABO.loadAboInfo(APP, session()));
  check(`Suite-Server ${wie}: „nicht aktiv“, aber als unbekannt markiert`, r.wert?.suiteBackendActive === false && r.wert.suiteBackendUnknown === true, r);
}

server({ suite: { active: true } });
r = await versuch(() => ABO.loadAboInfo({ ...APP, notInSuite: true }, session()));
check('App außerhalb der Suite: Suite-Server wird nicht gefragt, Suite zählt nicht', r.wert?.suiteBackendActive === false && r.wert.suite === null && !gefragt.some((u) => u.includes('suite-status')), { r, gefragt });

console.log('--- SchutzDex: Gratis-Grenze fragt diese Auskunft');
server({});
check('ohne Abo, alle Server antworten: kein Pro', (await PRO.fetchSchutzPro(APP, session())) === false);
server({ rc: { [DEX]: mitPro(zukunft) } });
check('Pro an der Dexware-ID: Pro', (await PRO.fetchSchutzPro(APP, session())) === true);
server({ suite: { active: true } });
check('Suite-Abo aus einer anderen App: Pro', (await PRO.fetchSchutzPro(APP, session())) === true);
server({ suite: 500 });
check('Suite-Server antwortet nicht: unklar → nicht sperren', (await PRO.fetchSchutzPro(APP, session())) === true);
server({ rc: { [DEX]: 429 } });
check('RevenueCat antwortet für die Dexware-ID nicht: unklar → nicht sperren', (await PRO.fetchSchutzPro(APP, session())) === true);
server({ rc: { [DEX]: mitPro(vorbei) } });
check('abgelaufenes Abo: kein Pro', (await PRO.fetchSchutzPro(APP, session())) === false);
server({});
check('Frei-/Testkonto vom Server (app_metadata.pro): Pro ohne Abfrage', (await PRO.fetchSchutzPro(APP, session({ app_metadata: { pro: true } }))) === true && gefragt.length === 0, gefragt);
const s = session();
server({ suite: 500 });
await PRO.fetchSchutzPro(APP, s);
server({});
check('eine unklare Antwort wird nicht gemerkt: die nächste Abfrage fragt neu und meldet den echten Stand', (await PRO.fetchSchutzPro(APP, s)) === false && gefragt.length > 0, gefragt.length);

console.log(`\n${ok} bestanden, ${bad} fehlgeschlagen`);
process.exit(bad ? 1 : 0);
