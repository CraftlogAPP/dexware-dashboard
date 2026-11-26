// Suite-Umstellung 26.11.2026 (Alex): Das Dexware-Suite-Abo umfasst nur noch 9 Apps. SpielDex, WinterDex, KfzDex, BaumDex,
// TourDex, CraftDex, DokuDex und ObjektDex haben ein eigenes Abo — mit BESTANDSSCHUTZ: Wer am Stichtag 26.11.2026 eine
// Suite hatte, behält diese Apps, solange das Abo ununterbrochen läuft. Nie aussperren.
//
// Geprüft wird ohne echte Server (RevenueCat und der Suite-Server sind durch einen fetch-Nachbau ersetzt):
//   [1] registry: genau die 9 Suite-Apps, genau die 8 mit suiteNurBestand, Texte mit Namen/Anzahl aus der Liste
//   [2] suiteStand(): Auswertung der suite-status-Antwort (alter Server, neuer Server mit `bestand`, Pro aus der
//       Sammel-App, Gutschein, Lesefehler beim Bestand → Suite zählt)
//   [3] suiteImBestand(): Suite aus dem RevenueCat-Projekt der App zählt nur, wenn bis Ende des Stichtags gekauft
//   [4] loadAboInfo(): &app=<id> nur für die 8, Suite aus RevenueCat nur als Bestand, Hinweis „gilt hier nicht“
//   [5] aboQuelle() (CraftDex/TourDex ohne org_pro_active): neue Suite schaltet nichts frei, Bestand schon, eine Abfrage
//   [6] Abo-Seite (aboAnzeige): Texte „gilt hier weiter“ / „nicht Teil des Dexware-Suite-Abos“ / Suite-Apps unverändert
//   [7] Quelltext: keine Suite-Werbung mehr in den 8 Apps, kein „alle Dex-Apps“
//   [8] optional: Liste gleich NUR_BESTAND im Suite-Server (dexware-suite, sonst SUITE_REPO setzen)
//
//   Aufruf:  node tests/suite-bestand.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
const speicher = new Map();
globalThis.localStorage = {
  getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => speicher.set(k, String(v)),
  removeItem: (k) => speicher.delete(k),
};
const web = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
const liesWeb = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

const R = await web('src/apps/registry.ts');
const ABO = await web('src/lib/abo.ts');
const QUELLE = await web('src/lib/aboProStand.ts');
const ANZ = await web('src/lib/aboAnzeige.ts');

let ok = 0;
let bad = 0;
const check = (name, cond, detail) => {
  if (cond) ok++;
  else bad++;
  console.log(`  ${cond ? 'ok  ' : 'FEHL'}  ${name}${cond || detail === undefined ? '' : `\n        → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};
const teil = (t) => console.log(`\n[${t}]`);

const SUITE_9 = ['feuerdex', 'geruestdex', 'gurtdex', 'hebedex', 'leiterdex', 'pruefdex', 'regaldex', 'schutzdex', 'toredex'];
const NUR_BESTAND_8 = ['baumdex', 'craftdex', 'dokudex', 'kfzdex', 'objektdex', 'spieldex', 'tourdex', 'winterdex'];
const sortiert = (a) => [...a].sort().join(',');

// ============================================================================ [1] registry
teil('1 registry: 9 Suite-Apps, 8 nur noch mit Bestand');
check('genau die 9 Apps des Suite-Abos (inSuite)', sortiert(R.SUITE_APPS.map((a) => a.id)) === sortiert(SUITE_9), R.SUITE_APPS.map((a) => a.id));
check('genau die 8 herausgefallenen Apps haben suiteNurBestand (inkl. ObjektDex)', sortiert(R.APPS.filter((a) => a.suiteNurBestand).map((a) => a.id)) === sortiert(NUR_BESTAND_8), R.APPS.filter((a) => a.suiteNurBestand).map((a) => a.id));
check('InstallateurDex und Laufzettel (pinndex) bleiben außerhalb (notInSuite), ohne Bestandsschutz-Schalter',
  ['installateurdex', 'pinndex'].every((id) => R.getApp(id)?.notInSuite === true && !R.getApp(id)?.suiteNurBestand));
check('keine App hat beide Schalter', R.APPS.every((a) => !(a.notInSuite && a.suiteNurBestand)));
check('inSuite(): nein bei notInSuite und bei suiteNurBestand', R.inSuite({}) === true && R.inSuite({ notInSuite: true }) === false && R.inSuite({ suiteNurBestand: true }) === false);
check('Namen der Suite-Apps alphabetisch mit „und“', R.suiteAppNamen() === 'FeuerDex, GerüstDex, GurtDex, HebeDex, LeiterDex, PrüfDex, RegalDex, SchutzDex und ToreDex', R.suiteAppNamen());
check('Stichtag für Texte 26.11.2026', R.SUITE_STICHTAG === '26.11.2026');
check('Kommentar oben nennt nicht mehr „16 Apps“', !/16 Apps/.test(liesWeb('src/apps/registry.ts')));

// ============================================================================ [2] suiteStand
teil('2 suiteStand(): Antwort des Suite-Servers');
const ZUK = new Date(Date.now() + 30 * 864e5).toISOString();
const st = ABO.suiteStand;
let r = st({ active: true, expires_at: ZUK }, false);
check('ohne &app (Suite-App): active = Suite', r.aktiv === true && r.ablauf === ZUK && r.appPro === null && r.nichtHier === false, r);
check('ohne &app: active false → keine Suite', st({ active: false, expires_at: null }, false).aktiv === false);
check('keine Antwort → nichts aktiv', JSON.stringify(st(null, true)) === JSON.stringify({ aktiv: false, ablauf: null, appPro: null, appProAblauf: null, nichtHier: false }));
r = st({ active: true, expires_at: ZUK, suite: true, app_pro: false, bonus: false }, true);
check('&app, heutiger Server (noch ohne Bestand-Feld): Suite zählt wie bisher', r.aktiv === true && r.ablauf === ZUK && !r.nichtHier, r);
r = st({ active: true, expires_at: ZUK, suite: true, bestand: true, app_pro: false }, true);
check('&app, neuer Server, Kennung im Bestand: Suite zählt', r.aktiv === true && !r.nichtHier, r);
r = st({ active: false, expires_at: null, suite: true, bestand: false, app_pro: false, bonus: false }, true);
check('&app, neuer Server, Suite NACH dem Stichtag (kein Bestand): zählt nicht, Hinweis „gilt hier nicht“', r.aktiv === false && r.nichtHier === true && r.appPro === null, r);
r = st({ active: true, expires_at: null, suite: true, bestand: null }, true);
check('&app, Bestand-Liste nicht lesbar (Server zählt die Suite): zählt — nie aussperren', r.aktiv === true && !r.nichtHier, r);
r = st({ active: true }, true);
check('&app, Antwort nur mit active: zählt als Suite (nie aussperren)', r.aktiv === true, r);
r = st({ active: true, expires_at: ZUK, suite: false, app_pro: true }, true);
check('&app, Pro dieser App aus der Sammel-App: keine Suite, aber Pro „sammelapp“ mit Ablauf', r.aktiv === false && r.appPro === 'sammelapp' && r.appProAblauf === ZUK && !r.nichtHier, r);
r = st({ active: true, expires_at: ZUK, suite: false, app_pro: false, bonus: true, gutschein: true }, true);
check('&app, eingelöster Dankeschön-Code: Pro „gutschein“ mit Ablauf', r.aktiv === false && r.appPro === 'gutschein' && r.appProAblauf === ZUK, r);
r = st({ active: true, expires_at: ZUK, suite: true, bestand: false, app_pro: true }, true);
check('&app, neue Suite + Pro aus der Sammel-App: Pro ja, Suite nein, Hinweis „gilt hier nicht“', r.aktiv === false && r.appPro === 'sammelapp' && r.nichtHier === true, r);
r = st({ active: true, expires_at: ZUK, suite: true, bestand: true, app_pro: true }, true);
check('&app, Bestand + Pro aus der Sammel-App: Suite zählt (Bestand gemeldet)', r.aktiv === true && r.appPro === 'sammelapp' && !r.nichtHier, r);
r = st({ active: false, suite: false, app_pro: false }, true);
check('&app, gar nichts: alles nein', !r.aktiv && !r.appPro && !r.nichtHier, r);
// Server-Fassung zur Umstellung (dexware-suite suite-status, 26.11.2026): bei den 8 Apps meldet `suite`, ob die Suite HIER
// zählt, `bestand` nur bei laufender Suite (Lesefehler → true).
r = st({ active: true, expires_at: ZUK, suite: true, app_pro: false, bonus: false, gutschein: false, bestand: true }, true);
check('Server-Fassung 26.11.: Bestandskunde → Suite zählt', r.aktiv === true && r.ablauf === ZUK && !r.nichtHier, r);
r = st({ active: false, expires_at: null, suite: false, app_pro: false, bonus: false, gutschein: false, bestand: false }, true);
check('Server-Fassung 26.11.: neue Suite ohne Bestand → zählt nicht (Free-Text sagt „nicht Teil des Suite-Abos“)', r.aktiv === false && r.appPro === null, r);
r = st({ active: true, expires_at: ZUK, suite: false, app_pro: true, bonus: false, gutschein: false, bestand: false }, true);
check('Server-Fassung 26.11.: neue Suite + Pro aus der Sammel-App → Pro „sammelapp“, keine Suite', r.aktiv === false && r.appPro === 'sammelapp' && r.appProAblauf === ZUK, r);
r = st({ active: true, expires_at: ZUK, suite: true, app_pro: true, bonus: false, gutschein: false, bestand: true }, true);
check('Server-Fassung 26.11.: Bestand + Pro aus der Sammel-App → Suite zählt', r.aktiv === true && r.appPro === 'sammelapp', r);

// ============================================================================ [3] suiteImBestand
teil('3 suiteImBestand(): Suite aus dem RevenueCat-Projekt der App');
const bes = (d) => ABO.suiteImBestand({ originalPurchaseDate: d });
check('gekauft am 01.10.2026 → Bestand', bes('2026-10-01T08:00:00Z') === true);
check('gekauft am 26.11.2026 um 23:59 Berliner Zeit → Bestand (der Stichtag zählt mit)', bes('2026-11-26T22:59:00Z') === true);
check('gekauft am 27.11.2026 um 00:00 Berliner Zeit → kein Bestand', bes('2026-11-26T23:00:00Z') === false);
check('gekauft im Dezember 2026 → kein Bestand', bes('2026-12-03T10:00:00Z') === false);
check('kein Kaufdatum → Bestand (nie aussperren)', bes(null) === true);
check('unlesbares Kaufdatum → Bestand (nie aussperren)', bes('kaputt') === true);
check('Stichtag-Ende = 27.11.2026 00:00 Berliner Zeit', Date.parse(ABO.SUITE_STICHTAG_ENDE) === Date.parse('2026-11-26T23:00:00Z'));

// ============================================================================ [4] loadAboInfo
teil('4 loadAboInfo(): Abfrage und Bestand');
const EMAIL = 'chef@betrieb.example';
const DEX = createHash('sha256').update(EMAIL).digest('hex');
let nr = 0;
const session = () => ({ user: { id: `uid-${++nr}`, email: EMAIL, app_metadata: {} } });
const leer = { entitlements: {}, subscriptions: {}, management_url: null };
const mitSuite = (original, expires = ZUK) => ({
  entitlements: { suite: { expires_date: expires, purchase_date: '2026-12-20T00:00:00Z', product_identifier: 'suite_yearly' } },
  subscriptions: { suite_yearly: { expires_date: expires, original_purchase_date: original, unsubscribe_detected_at: null, billing_issues_detected_at: null, period_type: 'normal', store: 'play_store', is_sandbox: false } },
  management_url: null,
});
let gefragt = [];
/** rc: Abonnent an der Dexware-ID (Konto-ID leer) · suite: Antwort | HTTP-Status | 'netz' (für jede suite-status-Abfrage) */
function server({ rc = leer, suite = { active: false } } = {}) {
  gefragt = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    gefragt.push(u);
    if (u.includes('api.revenuecat.com')) {
      const id = decodeURIComponent(u.split('/subscribers/')[1]);
      const a = id === DEX ? rc : leer;
      return typeof a === 'number' ? { ok: false, status: a, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ subscriber: a }) };
    }
    const a = typeof suite === 'function' ? suite(u) : suite;
    if (a === 'netz') throw new TypeError('Failed to fetch');
    return typeof a === 'number' ? { ok: false, status: a, json: async () => ({}) } : { ok: true, status: 200, json: async () => a };
  };
}
const suiteFragen = () => gefragt.filter((u) => u.includes('/suite-status'));
const app = (id) => ({ ...R.getApp(id), revenueCat: 'goog_TEST' });

server();
await ABO.loadAboInfo(app('winterdex'), session());
check('WinterDex fragt den Suite-Server mit &app=winterdex', suiteFragen().length === 1 && suiteFragen()[0].endsWith(`app_user_id=${DEX}&app=winterdex`), suiteFragen());
const falschGefragt = [];
const mitBereich = NUR_BESTAND_8.filter((x) => R.getApp(x)?.status === 'dashboard');
for (const id of mitBereich) {
  server();
  const i = await ABO.loadAboInfo(app(id), session());
  if (suiteFragen().length !== 1 || !suiteFragen()[0].endsWith(`&app=${id}`) || i.suiteAppParam !== id) falschGefragt.push({ id, gefragt: suiteFragen() });
}
check(`alle ${mitBereich.length} mit Dashboard-Bereich (BaumDex hat ein eigenes Portal) fragen mit ihrem &app`, mitBereich.length === 7 && falschGefragt.length === 0, falschGefragt);
server();
let i = await ABO.loadAboInfo(app('gurtdex'), session());
check('GurtDex (Suite-App) fragt wie bisher OHNE &app', suiteFragen().length === 1 && suiteFragen()[0].endsWith(`app_user_id=${DEX}`) && i.suiteAppParam === null, suiteFragen());
server();
await ABO.loadAboInfo(app('installateurdex'), session());
check('InstallateurDex (nicht in der Suite) fragt den Suite-Server gar nicht', suiteFragen().length === 0, gefragt);

server({ suite: { active: false, expires_at: null, suite: true, bestand: false, app_pro: false, bonus: false } });
i = await ABO.loadAboInfo(app('winterdex'), session());
check('WinterDex, Suite in einer Suite-App NACH dem Stichtag gekauft: keine Suite hier, Hinweis „gilt hier nicht“', !i.suite && !i.suiteBackendActive && i.suiteNichtHier === true && !i.suiteBackendUnknown, i);

server({ suite: { active: true, expires_at: ZUK, suite: true, bestand: true } });
i = await ABO.loadAboInfo(app('spieldex'), session());
check('SpielDex, Bestandskunde laut Server: Suite zählt, Ablauf bekannt', i.suiteBackendActive === true && i.suiteBackendExpires === ZUK && !i.suiteNichtHier, i);

server({ rc: mitSuite('2026-11-02T09:00:00Z'), suite: 500 });
i = await ABO.loadAboInfo(app('kfzdex'), session());
check('KfzDex, Suite in KfzDex VOR dem Stichtag gekauft, Server gestört: Suite zählt (Bestand), Server „unbekannt“', i.suite?.active === true && i.suiteBackendUnknown === true, i);

server({ rc: mitSuite('2026-12-01T09:00:00Z'), suite: { active: false, suite: true, bestand: false } });
i = await ABO.loadAboInfo(app('kfzdex'), session());
check('KfzDex, Suite in KfzDex NACH dem Stichtag gekauft: zählt nicht, Hinweis „gilt hier nicht“', i.suite === null && !i.suiteBackendActive && i.suiteNichtHier === true, i);

server({ rc: mitSuite('2026-12-01T09:00:00Z'), suite: 'netz' });
i = await ABO.loadAboInfo(app('kfzdex'), session());
check('… dasselbe bei gestörtem Server: zählt nicht, Auskunft als unsicher markiert, KEIN Hinweis „gilt hier nicht“ (Server könnte den Bestand bestätigen)', i.suite === null && i.suiteBackendUnknown === true && i.suiteNichtHier === false, i);

server({ rc: mitSuite('2026-12-01T09:00:00Z'), suite: { active: true, expires_at: ZUK, suite: true, bestand: true } });
i = await ABO.loadAboInfo(app('kfzdex'), session());
check('KfzDex, späteres Kaufdatum, aber der Server bestätigt den Bestand: Suite zählt (Server hat Vorrang)', i.suite?.active === true && i.suiteBackendActive === true && !i.suiteNichtHier, i);

server({ rc: mitSuite('2026-12-01T09:00:00Z'), suite: { active: true, expires_at: ZUK } });
i = await ABO.loadAboInfo(app('gurtdex'), session());
check('GurtDex (Suite-App): Suite-Kauf nach dem Stichtag zählt — dort ändert sich nichts', i.suite?.active === true && i.suiteBackendActive === true, i);

server({ rc: mitSuite(null), suite: { active: false, suite: false } });
i = await ABO.loadAboInfo(app('winterdex'), session());
check('WinterDex, Suite in RevenueCat ohne Kaufdatum: zählt (nie aussperren)', i.suite?.active === true, i);

server({ suite: { active: true, expires_at: ZUK, suite: false, app_pro: true } });
i = await ABO.loadAboInfo(app('tourdex'), session());
check('TourDex Pro aus der Sammel-App: appProBackend „sammelapp“, keine Suite', i.appProBackend === 'sammelapp' && i.appProBackendExpires === ZUK && !i.suiteBackendActive, i);

server({ suite: { active: true, expires_at: ZUK, suite: false, bonus: true, gutschein: true } });
i = await ABO.loadAboInfo(app('objektdex'), session());
check('ObjektDex mit eingelöstem Dankeschön-Code: appProBackend „gutschein“', i.appProBackend === 'gutschein' && !i.suiteBackendActive, i);

server({ suite: { active: true, expires_at: ZUK, suite: true, app_pro: true } });
i = await ABO.loadAboInfo(app('gurtdex'), session());
check('GurtDex fragt ohne &app: app_pro wird dort nicht ausgewertet, Suite zählt wie bisher', i.suiteBackendActive === true && i.appProBackend === null, i);

// ============================================================================ [5] aboQuelle
teil('5 Pro-Quelle CraftDex/TourDex (ohne org_pro_active)');
const pro = (id, opt) => QUELLE.aboQuelle(app(id), session(), opt)();

server({ suite: { active: false, suite: true, bestand: false, app_pro: false, bonus: false } });
check('CraftDex: neue Suite (kein Bestand) schaltet CraftDex NICHT frei', (await pro('craftdex', { appParam: 'craftdex' })) === false);
check('… und fragt den Suite-Server nur EINMAL (mit &app=craftdex)', suiteFragen().length === 1 && suiteFragen()[0].endsWith('&app=craftdex'), suiteFragen());

server({ suite: { active: true, suite: true, bestand: true, expires_at: ZUK } });
check('CraftDex: Bestandskunde → Pro', (await pro('craftdex', { appParam: 'craftdex' })) === true);
server({ suite: { active: true, suite: true, bestand: null } });
check('TourDex: Bestand-Liste nicht lesbar, Server zählt die Suite → Pro (nie aussperren)', (await pro('tourdex', { appParam: 'tourdex' })) === true);
server({ suite: { active: true, suite: false, app_pro: true } });
check('TourDex: Pro aus der Sammel-App → Pro', (await pro('tourdex', { appParam: 'tourdex' })) === true);
server({ suite: 500 });
check('TourDex: Suite-Server gestört → unklar (null), zweiter Versuch mit &app', (await pro('tourdex', { appParam: 'tourdex' })) === null && suiteFragen().length === 2, suiteFragen());
server({ rc: mitSuite('2026-11-20T10:00:00Z'), suite: { active: false, suite: true, bestand: false } });
check('TourDex: Suite in TourDex vor dem Stichtag gekauft, Server kennt sie nicht als Bestand → trotzdem Pro (nie aussperren)', (await pro('tourdex', { appParam: 'tourdex' })) === true);
server({ rc: mitSuite('2026-12-05T10:00:00Z'), suite: { active: false, suite: true, bestand: false } });
check('TourDex: Suite in TourDex nach dem Stichtag gekauft → kein Pro', (await pro('tourdex', { appParam: 'tourdex' })) === false);

server({ suite: (u) => (u.includes('&app=') ? { active: false } : { active: true }) });
check('SchutzDex (bleibt in der Suite): Suite-Abo zählt wie bisher', (await pro('schutzdex', { appParam: 'schutzdex', metaPro: true })) === true && suiteFragen().length === 1 && !suiteFragen()[0].includes('&app='), suiteFragen());
server({ suite: (u) => (u.includes('&app=') ? { active: true } : { active: false }) });
check('SchutzDex: SchutzDex Pro aus der Sammel-App wird weiter mit &app=schutzdex gefragt', (await pro('schutzdex', { appParam: 'schutzdex', metaPro: true })) === true && suiteFragen().some((u) => u.endsWith('&app=schutzdex')), suiteFragen());

// ============================================================================ [6] Abo-Seite
teil('6 Abo-Seite: Tarif und Texte (aboAnzeige)');
const info = (x = {}) => ({ pro: null, suite: null, suiteBackendActive: false, suiteBackendExpires: null, suiteBackendUnknown: false, appProBackend: null, appProBackendExpires: null, suiteNichtHier: false, suiteAppParam: null, managementUrl: null, ...x });
const ohneOrg = { orgPro: false, bonusUntil: null };
const anz = (id, x, org = ohneOrg) => ANZ.aboAnzeige(R.getApp(id), info(x), org);

let a = anz('winterdex', { suiteBackendActive: true });
check('WinterDex mit Bestands-Suite: „Dexware Suite (Bestandsschutz)“, Text „gilt hier weiter“ mit Stichtag',
  a.planName === 'Dexware Suite (Bestandsschutz)' && a.suiteActive && a.text.includes('gilt hier weiter') && a.text.includes('26.11.2026') && a.text.includes('ohne Unterbrechung'), a);
a = anz('winterdex', {});
check('WinterDex ohne Abo: Free, „nicht Teil des Dexware-Suite-Abos – … eigenes Abo“, kein Suite-Kauf-Hinweis',
  a.planName === 'Free' && a.text.includes('nicht Teil des Dexware-Suite-Abos') && a.text.includes('eigenes Abo') && !/Suite-Abo schließt/.test(a.text), a);
a = anz('spieldex', { suiteNichtHier: true });
check('SpielDex mit neuer Suite: Free + Hinweis „gilt aber nicht für SpielDex“ mit den 9 Suite-Apps',
  a.planName === 'Free' && !!a.suiteNichtHierText && a.suiteNichtHierText.includes('nicht für SpielDex') && a.suiteNichtHierText.includes(R.suiteAppNamen()), a);
a = anz('spieldex', { suiteBackendActive: true, suiteNichtHier: true });
check('Hinweis „gilt hier nicht“ erscheint nie, wenn die Suite hier zählt', a.suiteNichtHierText === null, a);
a = anz('gurtdex', { suiteBackendActive: true });
check('GurtDex mit Suite: „Dexware Suite“, Text nennt 9 Apps mit Namen, kein Bestandsschutz-Text',
  a.planName === 'Dexware Suite' && a.text.includes(`allen ${R.SUITE_APPS.length} Apps der Dexware Suite`) && a.text.includes('GurtDex') && !a.text.includes('Bestandsschutz'), a);
a = anz('gurtdex', {});
check('GurtDex ohne Abo: Pro oder das Suite-Abo in der App', a.text.includes('Pro oder das Suite-Abo') && !a.text.includes('nicht Teil'), a);
a = anz('installateurdex', {});
check('InstallateurDex ohne Abo: „nicht Teil des Dexware-Suite-Abos“', a.text.includes('nicht Teil des Dexware-Suite-Abos'), a);
a = anz('tourdex', { appProBackend: 'sammelapp', appProBackendExpires: '2027-01-15T10:00:00Z' });
check('TourDex Pro aus der Sammel-App: „TourDex Pro“, aktiv, „über die Dexware-App (bis 15.01.2027)“',
  a.planName === 'TourDex Pro' && a.proActive && a.text.includes('über die Dexware-App') && a.text.includes('15.01.2027'), a);
a = anz('objektdex', { appProBackend: 'gutschein', appProBackendExpires: '2026-12-26T10:00:00Z' });
check('ObjektDex mit Dankeschön-Code: „ObjektDex Pro“, „mit einem eingelösten Dankeschön-Code“', a.planName === 'ObjektDex Pro' && a.text.includes('Dankeschön-Code'), a);
const proAbo = { active: true, expiresDate: ZUK, willRenew: true, unsubscribed: false, periodType: 'normal', store: 'play_store', productId: 'p', sandbox: false, originalPurchaseDate: null };
a = anz('kfzdex', { pro: proAbo, appProBackend: 'sammelapp' });
check('KfzDex mit eigenem Pro-Abo (und Sammel-App-Pro): eigenes Abo hat Vorrang, Details sichtbar', a.text === 'Dein Pro-Abo für KfzDex ist aktiv.' && a.current === proAbo, a);
a = anz('winterdex', {}, { orgPro: true, bonusUntil: null });
check('WinterDex über den Betrieb (Rechnung/Kommunal-Lizenz): unverändert „für deinen Betrieb“', a.viaOrg && a.planName === 'WinterDex Pro (für deinen Betrieb)', a);
check('Web-Kauf-Zeile der Suite nennt die Anzahl aus der registry', ANZ.suiteLead() === `Pro in allen ${R.SUITE_APPS.length} Apps der Dexware Suite mit einem Abo`, ANZ.suiteLead());

// ============================================================================ [7] Quelltext
teil('7 Quelltext: keine Suite-Werbung in den 8 Apps, kein „alle Dex-Apps“');
const dateien = [];
const lauf = (d) => {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) lauf(p);
    else if (/\.(ts|tsx)$/.test(f)) dateien.push(p);
  }
};
lauf(path.join(here, '..', 'src'));
// Nur was Nutzer lesen: Kommentare (Block- und ganze //-Zeilen) zählen nicht — dort heißt „alle Dex-Apps“ nur „gleicher Code“.
const text = (p) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const treffer = (re) => dateien.filter((p) => re.test(text(p))).map((p) => path.relative(path.join(here, '..'), p));
check('nirgends „alle(n) Dex-Apps“ / „anderen Dex-App“ / „Suite-Bundle“', treffer(/alle[n]? Dex-Apps|anderen Dex-App|Suite-Bundle/).length === 0, treffer(/alle[n]? Dex-Apps|anderen Dex-App|Suite-Bundle/));
check('CraftDex/TourDex: kein „oder du nutzt die Dexware Suite“', treffer(/oder du nutzt die Dexware Suite/).length === 0, treffer(/oder du nutzt die Dexware Suite/));
check('ObjektDex: kein „mit einem Dexware-Suite-Abo ist es schon dabei“', !['src/objektdex/grenze.ts', 'src/objektdex/importObjekte.ts', 'src/objektdex/pages/AusWinterdex.tsx', 'src/objektdex/pages/Team.tsx'].some((f) => /Dexware-Suite-Abo ist es schon dabei/.test(liesWeb(f))));
check('Team-Seite: Suite-Hinweis nur in Suite-Apps (inSuite)', /inSuite\(app\) \? ' \(mit einem Dexware-Suite-Abo ist es schon dabei\)'/.test(liesWeb('src/components/TeamPage.tsx')));
check('Abo-Seite: Suite-Kauf nur in Suite-Apps (inSuite), Text aus aboAnzeige', /webCheckout\?\.suite && inSuite\(app\)/.test(liesWeb('src/components/AboPage.tsx')) && /aboAnzeige\(app, info/.test(liesWeb('src/components/AboPage.tsx')));
check('Startseite: „Dexware-Web-Dashboard“ statt „Web-Dashboard zur Dexware-Suite“', !/Web-Dashboard zur Dexware-Suite/.test(liesWeb('src/pages/Home.tsx')));
const webOffers = liesWeb('src/apps/webOffers.ts');
check('webOffers: kein Suite-Angebot vorbereitet', !/suite\s*:/.test(webOffers.replace(/\/\/.*$/gm, '')));

// ============================================================================ [8] Suite-Server (optional)
teil('8 Abgleich mit dem Suite-Server (optional)');
const SUITE = process.env.SUITE_REPO ?? 'C:/Users/2easy/Desktop/dexware-suite';
const fn = path.join(SUITE, 'supabase/functions/suite-status/index.ts');
const server_ = existsSync(fn) ? readFileSync(fn, 'utf8') : '';
const m = /NUR_BESTAND\s*=\s*new Set\(\[([^\]]*)\]/.exec(server_);
if (m) {
  const liste = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
  check(`NUR_BESTAND in ${fn} = die 8 Apps mit suiteNurBestand`, sortiert(liste) === sortiert(NUR_BESTAND_8), liste);
} else console.log(`  (übersprungen: NUR_BESTAND in ${fn} nicht gefunden — SUITE_REPO auf den Stand mit der Umstellung setzen)`);

console.log(bad === 0 ? `\nALLES GRÜN: ${ok} ok, 0 Fehler` : `\n${ok} ok, ${bad} FEHLER`);
process.exit(bad ? 1 : 0);
