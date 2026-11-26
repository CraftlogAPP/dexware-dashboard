// Prüft die Paddle-Kasse direkt auf der Abo-Seite (src/lib/paddleKasse.ts, components/PaddleKasse.tsx, AboPage.tsx) —
// ohne Netz: RevenueCat-SDK und Paddle sind durch einen Nachbau ersetzt; die Fehler-Kennungen werden mit dem echten
// Paket @revenuecat/purchases-js abgeglichen.
//
// Worum es geht:
//   • Schalter AUS (kein pdl_-Schlüssel) → keine Kasse, die Abo-Seite bleibt wie bisher; Sandbox nur ausdrücklich
//   • bestehende Tarife (Play, Promo, Suite-Bestand, Pro über den Betrieb) sehen nie eine Kauf-Karte
//   • Preise kommen IMMER aus dem RevenueCat-Angebot (nie aus dem Code), Paketwahl/Reihenfolge stimmt
//   • Kauf: Dexware-ID, E-Mail vorausgefüllt, deutsch, ohne RevenueCat-Erfolgsseite; Abbruch/Fehler ruhig, und wer
//     schon bezahlt hat, sieht nie „abgebrochen“
//   • das SDK wird nur nachgeladen (eigene Datei, nicht in der Offline-Hülle)
//
//   Aufruf:  node tests/paddle-kasse.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
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
const K = await import(pathToFileURL(path.join(root, 'src/lib/paddleKasse.ts')).href);
const R = await import(pathToFileURL(path.join(root, 'src/apps/registry.ts')).href);
const SDK = await import('@revenuecat/purchases-js');

let ok = 0;
let bad = 0;
function check(name, cond, detail) {
  if (cond) ok += 1;
  else bad += 1;
  console.log(`  ${cond ? 'ok  ' : 'FEHL'}  ${name}${cond || detail === undefined ? '' : `\n        → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}
const teil = (t) => console.log(`\n[${t}]`);
const lies = (f) => readFileSync(path.join(root, f), 'utf8');
const nb = (s) => String(s).replace(/ /g, ' ');

const LIVE = 'pdl_LiveBeispiel123';
const SAND = 'pdl_SandBeispiel456';
const wd = R.getApp('winterdex');
const PLAENE = wd?.webCheckout?.pro?.plans ?? [];

// ============================================================================ [1] Schalter
teil('1 Schalter: ohne Schlüssel bleibt alles wie bisher');
const einst = (live = '', sand = '') => ({ live: { rcKey: live, offering: 'web_pro_live' }, sandbox: { rcKey: sand, offering: 'web_pro' } });
check('ohne Einstellung → aus', K.kasseKonfig(undefined) === null);
check('leere Schlüssel → aus', K.kasseKonfig(einst()) === null);
check('nur Leerzeichen → aus', K.kasseKonfig(einst('   ')) === null);
check('Google-Schlüssel (goog_…) statt pdl_ → aus', K.kasseKonfig(einst('goog_EFamBqKZmcNVjBZZoYgveMeyoUw')) === null);
check('Schlüssel mit Leer-/Sonderzeichen → aus', K.kasseKonfig(einst('pdl_abc def')) === null && K.kasseKonfig(einst('pdl_abc$')) === null);
check('GEHEIMER Paddle-API-Schlüssel (pdl_live_apikey_… / pdl_sdbx_apikey_…) → aus, auch als Bau-Variable/Sandbox',
  K.kasseKonfig(einst('pdl_live_apikey_01abcdef')) === null &&
  K.kasseKonfig(einst(), { env: { VITE_RC_PADDLE_KEY: 'pdl_live_apikey_01abcdef' } }) === null &&
  K.kasseKonfig(einst('', 'pdl_sdbx_apikey_01abcdef'), { search: '?kasse=sandbox' }) === null);
let k = K.kasseKonfig(einst(LIVE));
check('gültiger Live-Schlüssel → Live mit web_pro_live', k?.modus === 'live' && k.rcKey === LIVE && k.offering === 'web_pro_live', k);
k = K.kasseKonfig(einst(), { env: { VITE_RC_PADDLE_KEY: LIVE } });
check('Schlüssel aus der Bau-Variable VITE_RC_PADDLE_KEY → Live', k?.modus === 'live' && k.rcKey === LIVE, k);
k = K.kasseKonfig(einst('pdl_registry1'), { env: { VITE_RC_PADDLE_KEY: LIVE } });
check('Bau-Variable geht vor registry', k?.rcKey === LIVE, k);
check('?kasse=sandbox ohne Sandbox-Schlüssel → AUS (nie still auf Live ausweichen)', K.kasseKonfig(einst(LIVE), { search: '?kasse=sandbox' }) === null);
k = K.kasseKonfig(einst(LIVE), { search: '?kasse=sandbox', env: { VITE_RC_PADDLE_SANDBOX_KEY: SAND } });
check('?kasse=sandbox mit Sandbox-Schlüssel (.env.local) → Sandbox mit web_pro', k?.modus === 'sandbox' && k.rcKey === SAND && k.offering === 'web_pro', k);
k = K.kasseKonfig(einst('', SAND), { search: '?kasse=sandbox' });
check('Sandbox geht auch ohne Live-Schlüssel (Probekauf vor der Live-Schaltung)', k?.modus === 'sandbox', k);
check('Sandbox-Schlüssel allein schaltet ohne ?kasse=sandbox NICHTS ein', K.kasseKonfig(einst('', SAND)) === null);
check('gleicher Schlüssel als Live und Sandbox (Verwechslung) → aus', K.kasseKonfig(einst(LIVE, LIVE)) === null);
check('Live-Eintrag ohne Angebot → aus', K.kasseKonfig({ live: { rcKey: LIVE, offering: '' } }) === null);

teil('1b registry: nur WinterDex, Angebote getrennt, im Repo ohne Schlüssel = aus');
check('WinterDex hat paddleKasse', !!wd?.paddleKasse);
check('Live-Angebot web_pro_live, Sandbox-Angebot web_pro (getrennt)', wd?.paddleKasse?.live?.offering === 'web_pro_live' && wd?.paddleKasse?.sandbox?.offering === 'web_pro');
check('keine andere App hat eine Paddle-Kasse (Suite wird im Web nicht verkauft)', R.APPS.filter((a) => a.paddleKasse).map((a) => a.id).join() === 'winterdex');
const regLive = wd?.paddleKasse?.live?.rcKey ?? '';
if (regLive === '') {
  check('registry ohne Live-Schlüssel → Kasse aus (Abo-Seite wie bisher)', K.kasseKonfig(wd.paddleKasse, { env: {}, search: '' }) === null);
} else {
  check('eingetragener Live-Schlüssel hat das Muster pdl_…', K.RC_PADDLE_KEY_RE.test(regLive), regLive);
  check('eingetragener Live-Schlüssel schaltet Live mit web_pro_live ein', K.kasseKonfig(wd.paddleKasse, { env: {}, search: '' })?.offering === 'web_pro_live');
}
const regSand = wd?.paddleKasse?.sandbox?.rcKey ?? '';
check('Sandbox-Schlüssel in der registry leer oder pdl_… (und nie gleich dem Live-Schlüssel)', (regSand === '' || K.RC_PADDLE_KEY_RE.test(regSand)) && (regSand === '' || regSand !== regLive));
check('in der registry nie ein geheimer Paddle-API-Schlüssel', !K.PADDLE_GEHEIM_RE.test(regLive) && !K.PADDLE_GEHEIM_RE.test(regSand));
check('Muster wie im SDK: /^pdl_[a-zA-Z0-9_.-]+$/', String(K.RC_PADDLE_KEY_RE) === String(/^pdl_[a-zA-Z0-9_.-]+$/));
check('Tarif-Texte der registry (Saison/Monatlich) sind da', PLAENE.map((p) => p.pkg).join() === '$rc_annual,$rc_monthly', PLAENE.map((p) => p.pkg));

// ============================================================================ [2] wer eine Kauf-Karte sieht
teil('2 darfKaufen(): bestehende Tarife sehen nie eine Kauf-Karte');
const basis = { notOwner: false, suiteActive: false, proActive: false, viaOrg: false, suiteUnklar: false, dexId: 'abc', email: 'a@b.at' };
check('Inhaber ohne Tarif → Kauf-Karte', K.darfKaufen(basis) === true);
check('eigenes Pro (Play/Web/Promo) → keine', K.darfKaufen({ ...basis, proActive: true }) === false);
check('Suite bzw. Suite-Bestand → keine', K.darfKaufen({ ...basis, suiteActive: true }) === false);
check('Pro über den Betrieb (Rechnung, Kommunal, Bonus, Team) → keine', K.darfKaufen({ ...basis, viaOrg: true }) === false);
check('Teammitglied/Verwalter (nicht Inhaber) → keine (Pro hängt am Konto des Inhabers)', K.darfKaufen({ ...basis, notOwner: true }) === false);
check('Suite-Server gestört („Free“ nur geraten) → keine', K.darfKaufen({ ...basis, suiteUnklar: true }) === false);
check('ohne Dexware-ID oder E-Mail → keine', K.darfKaufen({ ...basis, dexId: null }) === false && K.darfKaufen({ ...basis, email: '' }) === false);
// Pro über den Betrieb kommt erst nach dem Aufbau der Seite vom Server (org_pro_active) — bis dahin ist viaOrg false
check('Kasse erst nach klarem „kein Pro über den Betrieb“: Server-Antwort noch offen (undefined/null) → keine Kasse',
  K.betriebOhneProKlar(true, undefined) === false && K.betriebOhneProKlar(true, null) === false);
check('Betrieb mit Pro (Rechnung/Kommunal/Bonus) → keine Kasse; klares Nein → Kasse', K.betriebOhneProKlar(true, true) === false && K.betriebOhneProKlar(true, false) === true);
check('Konto ohne Betrieb → nichts zu prüfen', K.betriebOhneProKlar(false, null) === true);

// ============================================================================ [3] Pakete
teil('3 paketeAusAngebot(): Preise aus dem Angebot, Reihenfolge, Texte');
const pak = (id, micros, period, extra = {}) => ({
  identifier: id,
  product: { identifier: `prod_${id}`, price: micros == null ? null : { amountMicros: micros, currency: 'EUR' }, period, ...extra },
});
const MONAT = pak('$rc_monthly', 9_990_000, { number: 1, unit: 'month' });
const JAHR = pak('$rc_annual', 49_990_000, { number: 1, unit: 'year' });
let p = K.paketeAusAngebot({ identifier: 'web_pro_live', availablePackages: [MONAT, JAHR] }, PLAENE);
check('zwei Pakete, Jahr zuerst (Reihenfolge der registry)', p.map((x) => x.pkg).join() === '$rc_annual,$rc_monthly', p.map((x) => x.pkg));
check('Preise deutsch aus dem Angebot: 49,99 € / 9,99 €', nb(p[0]?.preis) === '49,99 €' && nb(p[1]?.preis) === '9,99 €', p.map((x) => x.preis));
check('Laufzeit: „pro Jahr“ / „pro Monat“', p[0]?.per === 'pro Jahr' && p[1]?.per === 'pro Monat', p.map((x) => x.per));
check('Titel/Hinweis/Markierung aus der registry (Saison, „Meist gewählt“)', p[0]?.titel === 'Saison' && p[0]?.best === true && p[0]?.tag === 'Meist gewählt' && p[1]?.titel === 'Monatlich' && !p[1]?.best, p);
check('an purchase() geht genau das Paket-Objekt des SDK', p[0]?.rcPackage === JAHR && p[1]?.rcPackage === MONAT);
p = K.paketeAusAngebot({ identifier: 'x', availablePackages: [pak('$rc_annual', 59_990_000, { number: 1, unit: 'year' })] }, PLAENE);
check('Preis geändert in RevenueCat (59,99) → Anzeige 59,99 € — registry-Preis 49,99 wird NICHT verwendet', nb(p[0]?.preis) === '59,99 €', p[0]?.preis);
p = K.paketeAusAngebot({ identifier: 'web_pro', availablePackages: [MONAT, pak('$rc_six_month', 39_990_000, { number: 6, unit: 'month' })] }, PLAENE);
check('Paket ohne registry-Text (Sandbox $rc_six_month) → hinten, Titel „6 Monate“, „für 6 Monate“', p.map((x) => x.pkg).join() === '$rc_monthly,$rc_six_month' && p[1]?.titel === '6 Monate' && p[1]?.per === 'für 6 Monate', p);
p = K.paketeAusAngebot({ identifier: 'x', availablePackages: [pak('a', null, { number: 1, unit: 'month' }), pak('b', 0, { number: 1, unit: 'month' }), JAHR] }, PLAENE);
check('Pakete ohne Preis oder mit 0 € werden nicht angeboten', p.map((x) => x.pkg).join() === '$rc_annual', p.map((x) => x.pkg));
check('kein Angebot → keine Pakete', K.paketeAusAngebot(null, PLAENE).length === 0 && K.paketeAusAngebot({ identifier: 'x' }, PLAENE).length === 0);
p = K.paketeAusAngebot({ identifier: 'x', availablePackages: [pak('$rc_monthly', 9_990_000, { number: 1, unit: 'month' }, { freeTrialPhase: { periodDuration: 'P7D' } })] }, PLAENE);
check('Gratis-Testzeit im Angebot → Hinweis „Details in der Kasse“', /Gratis-Testzeit/.test(p[0]?.hinweis ?? ''), p[0]?.hinweis);
check('Laufzeit-Texte', K.laufzeitText({ number: 12, unit: 'month' }) === 'pro Jahr' && K.laufzeitText({ number: 2, unit: 'year' }) === 'für 2 Jahre' && K.laufzeitText(null) === '');
check('Preis in anderer Währung bleibt lesbar', nb(K.preisText(12_000_000, 'CHF')).includes('12,00'), K.preisText(12_000_000, 'CHF'));

// ============================================================================ [4] Fehler
teil('4 Fehler: ruhig, ehrlich, Abbruch ist kein Fehler');
const codes = Object.entries(K.RC_FEHLER).filter(([name, v]) => SDK.ErrorCode[name] !== v);
check('Fehler-Kennungen = ErrorCode des SDK', codes.length === 0, codes);
check('Abbruch (UserCancelledError) → abbruch, keine Fehlermeldung', K.fehlerDeutung({ errorCode: 1 }).art === 'abbruch');
check('echter PurchasesError des SDK (Abbruch) wird erkannt', K.fehlerDeutung(new SDK.PurchasesError(SDK.ErrorCode.UserCancelledError, 'x')).art === 'abbruch');
let d = K.fehlerDeutung({ errorCode: 10 });
check('Netzfehler → Text „Verbindung“, kann nach der Zahlung sein', d.art === 'fehler' && /Verbindung/.test(d.text) && d.vielleichtBezahlt === true, d);
d = K.fehlerDeutung({ errorCode: 20 });
check('Zahlung in Prüfung → „wird noch geprüft“', d.art === 'fehler' && /noch geprüft/.test(d.text), d);
d = K.fehlerDeutung({ errorCode: 11 });
check('falscher Schlüssel/Einrichtung → „gerade nicht verfügbar“, sicher vor der Zahlung', d.art === 'fehler' && /nicht verfügbar/.test(d.text) && d.vielleichtBezahlt === false, d);
d = K.fehlerDeutung(new Error('irgendwas'));
check('unbekannter Fehler → allgemeiner Text mit „Falls du schon bezahlt hast“', d.art === 'fehler' && /Falls du schon bezahlt hast/.test(d.text) && d.vielleichtBezahlt, d);
check('null/undefined → allgemeiner Text', K.fehlerDeutung(null).art === 'fehler' && K.fehlerDeutung(undefined).art === 'fehler');
const alleTexte = [0, 2, 3, 4, 5, 6, 10, 11, 14, 15, 20, 23, 38, 99].map((c) => K.fehlerDeutung({ errorCode: c })).filter((x) => x.art === 'fehler');
check('kein Fehlertext behauptet „nichts abgebucht“', alleTexte.every((x) => !/nichts (ab)?gebucht|nicht abgebucht/i.test(x.text)));
check('jeder Fehlertext ohne Technik (keine Kennung, kein „Error“)', alleTexte.every((x) => !/error|Error|code|\d{2,}/.test(x.text.replace('support@dexware.app', ''))));

// ============================================================================ [5] Einrichten + Kaufen (Nachbau)
teil('5 SDK einrichten und kaufen (Nachbau)');
function nachbau({ angebote, kauf, kunde } = {}) {
  const log = { configure: [], changeUser: [], purchase: [], offerings: [], customer: 0, geladen: 0 };
  const inst = {
    async getOfferings(params) {
      log.offerings.push(params);
      return angebote ?? { all: { web_pro_live: { identifier: 'web_pro_live', availablePackages: [MONAT, JAHR] } }, current: null };
    },
    async purchase(params) {
      log.purchase.push(params);
      return kauf ? kauf(params) : { customerInfo: { entitlements: { active: { pro: {} } } } };
    },
    async getCustomerInfo() {
      log.customer += 1;
      return kunde ? kunde(log.customer) : { entitlements: { active: {} } };
    },
    async changeUser(id) {
      log.changeUser.push(id);
      return {};
    },
    getAppUserId: () => 'x',
  };
  const lade = async () => {
    log.geladen += 1;
    return { Purchases: { configure: (c) => (log.configure.push(c), inst) } };
  };
  return { inst, lade, log };
}
const KONF = { modus: 'live', rcKey: LIVE, offering: 'web_pro_live' };
const DEX = 'a'.repeat(64);
K.kasseZuruecksetzen();
let n = nachbau();
let inst = await K.kasseEinrichten(n.lade, KONF, DEX);
const c0 = n.log.configure[0];
check('configure mit pdl_-Schlüssel und Dexware-ID', c0?.apiKey === LIVE && c0?.appUserId === DEX, c0);
check('ohne Analyse-Ereignisse und ohne UTM-Sammeln (Datensparsamkeit)', c0?.flags?.collectAnalyticsEvents === false && c0?.flags?.autoCollectUTMAsMetadata === false, c0?.flags);
await K.kasseEinrichten(n.lade, KONF, DEX);
check('zweites Öffnen: SDK nicht neu geladen/eingerichtet', n.log.geladen === 1 && n.log.configure.length === 1);
await K.kasseEinrichten(n.lade, KONF, 'b'.repeat(64));
check('anderes Konto im selben Tab → changeUser(neue Dexware-ID)', n.log.changeUser.join() === 'b'.repeat(64) && n.log.configure.length === 1);
await K.kasseEinrichten(n.lade, { ...KONF, rcKey: SAND, modus: 'sandbox', offering: 'web_pro' }, DEX);
check('anderer Schlüssel (Sandbox) → neu einrichten', n.log.configure.length === 2 && n.log.configure[1].apiKey === SAND);

K.kasseZuruecksetzen();
n = nachbau();
inst = await K.kasseEinrichten(n.lade, KONF, DEX);
p = await K.kassePakete(inst, KONF, PLAENE);
check('kassePakete fragt genau das Angebot web_pro_live', n.log.offerings[0]?.offeringIdentifier === 'web_pro_live' && p.length === 2, n.log.offerings);
let wirft = null;
try {
  await K.kassePakete(nachbau({ angebote: { all: {}, current: null } }).inst, KONF, PLAENE);
} catch (e) {
  wirft = e;
}
check('Angebot fehlt → AngebotFehltError (Karte zeigt „Tarife lassen sich gerade nicht laden“)', wirft instanceof K.AngebotFehltError, String(wirft));
p = await K.kassePakete(nachbau({ angebote: { all: {}, current: { identifier: 'web_pro_live', availablePackages: [JAHR] } } }).inst, KONF, PLAENE);
check('Angebot nur als „current“ geliefert → wird genommen', p.length === 1 && p[0].pkg === '$rc_annual');

const warteLog = [];
const warte = async (ms) => void warteLog.push(ms);
p = K.paketeAusAngebot({ identifier: 'x', availablePackages: [MONAT, JAHR] }, PLAENE);
n = nachbau();
let r = await K.kaufen(n.inst, p[0], '  max@betrieb.at ', { warte });
const kp = n.log.purchase[0];
check('Kauf: Paket, E-Mail (getrimmt) vorausgefüllt, Sprache de, ohne RevenueCat-Erfolgsseite', kp?.rcPackage === JAHR && kp?.customerEmail === 'max@betrieb.at' && kp?.selectedLocale === 'de' && kp?.skipSuccessPage === true, kp);
check('Kauf erfolgreich + Pro im Ergebnis → erfolg, bestätigt', r.art === 'erfolg' && r.proBestaetigt === true, r);
n = nachbau({ kauf: () => ({ customerInfo: { entitlements: { active: {} } } }) });
r = await K.kaufen(n.inst, p[0], 'max@betrieb.at', { warte });
check('Kauf erfolgreich, Pro noch nicht gemeldet → erfolg (Seite wartet auf die Pro-Prüfung)', r.art === 'erfolg' && r.proBestaetigt === false, r);
warteLog.length = 0;
n = nachbau({ kauf: () => Promise.reject({ errorCode: 1 }) });
r = await K.kaufen(n.inst, p[1], 'max@betrieb.at', { warte });
check('Abbruch → abbruch, genau eine sofortige stille Nachfrage, kein Warten', r.art === 'abbruch' && n.log.customer === 1 && warteLog.length === 0, { r, n: n.log.customer, warteLog });
n = nachbau({ kauf: () => Promise.reject({ errorCode: 1 }), kunde: () => ({ entitlements: { active: { pro: {} } } }) });
r = await K.kaufen(n.inst, p[1], 'max@betrieb.at', { warte });
check('Fenster NACH der Zahlung geschlossen (Pro schon da) → erfolg statt „abgebrochen“', r.art === 'erfolg' && r.proBestaetigt === true, r);
warteLog.length = 0;
n = nachbau({ kauf: () => Promise.reject({ errorCode: 10 }), kunde: (i) => ({ entitlements: { active: i >= 2 ? { pro: {} } : {} } }) });
r = await K.kaufen(n.inst, p[1], 'max@betrieb.at', { warte, pauseMs: 10 });
check('Netzfehler nach der Zahlung, Pro kommt bei der 2. Nachfrage → erfolg', r.art === 'erfolg' && n.log.customer === 2 && warteLog.join() === '10', { r, n: n.log.customer, warteLog });
n = nachbau({ kauf: () => Promise.reject({ errorCode: 11 }) });
r = await K.kaufen(n.inst, p[1], 'max@betrieb.at', { warte });
check('Einrichtungsfehler vor der Zahlung → fehler, keine Nachfrage', r.art === 'fehler' && n.log.customer === 0 && /nicht verfügbar/.test(r.text), r);
n = nachbau({
  kauf: () => Promise.reject(new Error('Paddle event handler error')),
  kunde: () => {
    throw new Error('weg');
  },
});
r = await K.kaufen(n.inst, p[1], 'max@betrieb.at', { warte });
check('unbekannter Fehler + Nachfrage gestört → ruhiger Fehlertext', r.art === 'fehler' && /Falls du schon bezahlt hast/.test(r.text), r);

// ============================================================================ [6] warteAufPro
teil('6 warteAufPro(): nach dem Kauf auf die Pro-Prüfung warten');
let i = 0;
warteLog.length = 0;
check('Pro beim 3. Mal → true nach 2 Pausen', (await K.warteAufPro(async () => ++i >= 3, { warte, pauseMs: 5 })) === true && i === 3 && warteLog.length === 2);
i = 0;
check('nie Pro → false nach allen Versuchen', (await K.warteAufPro(async () => (++i, false), { warte, versuche: 4 })) === false && i === 4);
i = 0;
check('unklar (null) und Fehler zählen als „noch nicht“', (await K.warteAufPro(async () => (++i === 1 ? null : i === 2 ? Promise.reject(new Error('x')) : true), { warte })) === true && i === 3);
i = 0;
check('Seite verlassen → sofort Schluss', (await K.warteAufPro(async () => (++i, true), { warte, abbrechen: () => true })) === false && i === 0);

// ============================================================================ [7] Einbau in die Abo-Seite
teil('7 Einbau: Abo-Seite, Rechtliches, Nachladen');
const abo = lies('src/components/AboPage.tsx');
const karte = lies('src/components/PaddleKasse.tsx');
check('Abo-Seite fragt den Schalter (kasseKonfig) — eingebettet (InstallateurDex) nie', /embedded \? null : kasseKonfig\(app\.paddleKasse/.test(abo));
check('Kauf-Karte nur nach darfKaufen(); Kasse aus → WebBuy wie bisher', /darfKaufen\(\{[^}]*\}\)/.test(abo) && /kasse && proOffer && onGekauft \?[\s\S]*<PaddleKasse[\s\S]*:\s*\(\s*<WebBuy/.test(abo));
check('nach dem Kauf: Pro-Prüfung des Betriebs frisch (orgProStand …, true) + pro_status_auffrischen + Gratis-Banner neu', /orgProStand\(client, app\.id, true\)/.test(abo) && /pro_status_auffrischen/.test(abo) && /meldeGratisAenderung\(\)/.test(abo));
check('Danke-Ansicht oben auf der Abo-Seite', /<KaufDanke/.test(abo));
check('Kasse nur nach klarer Server-Antwort zum Pro des Betriebs (nicht während des Ladens, nicht bei unklarer Antwort)',
  /betriebOhneProKlar\(!!orgCtx, orgProState\.data\)/.test(abo) && /kasseBetriebKlar \?\s*\(\s*<PaddleKasse/.test(abo));
check('lebt wird beim (Wieder-)Einhängen auf true gesetzt (StrictMode im Dev-Server: Danke-Ansicht bleibt nicht hängen)',
  /useEffect\(\(\) => \{\s*lebt\.current = true;/.test(abo));
check('Karte nennt Paddle als Händler (Merchant of Record) und die Verlängerung', /Kauf über Paddle \(Händler\)/.test(karte) && /Merchant of Record/.test(karte) && /verlängert sich automatisch/.test(karte));
check('Links: AGB, Widerruf & Erstattung, Datenschutz, Kaufbedingungen von Paddle', ['dexware.app/agb.html', 'dexware.app/erstattung.html', 'dexware.app/datenschutz.html', 'paddle.com/legal/checkout-buyer-terms'].every((u) => karte.includes(u)));
check('Widerrufsrecht bleibt unberührt (kein Verzicht-Häkchen auf unserer Seite)', /Widerrufsrecht bleibt davon\s+unberührt/.test(karte) && !/type="checkbox"/.test(karte));
const srcDateien = (dir) =>
  readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? srcDateien(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const statisch = srcDateien('src').filter((f) => /from\s+['"]@revenuecat\/purchases-js['"]/.test(lies(f)));
check('SDK nirgends statisch eingebunden (nur import() in PaddleKasse.tsx)', statisch.length === 0 && /import\('@revenuecat\/purchases-js'\)/.test(karte), statisch);
const pkg = JSON.parse(lies('package.json'));
check('SDK-Fassung fest (ohne ^/~)', /^\d+\.\d+\.\d+$/.test(pkg.dependencies?.['@revenuecat/purchases-js'] ?? ''), pkg.dependencies?.['@revenuecat/purchases-js']);
const schluessel = srcDateien('src').flatMap((f) => [...lies(f).matchAll(/['"`](pdl_[A-Za-z0-9_.-]+)/g)].map((m) => `${f}: ${m[1]}`)).filter((s) => !/pdl_vorschau_/.test(s));
check('kein pdl_-Schlüssel ausgedacht (im Code nur registry, dort leer oder echt)', schluessel.every((s) => /registry\.ts/.test(s)), schluessel);
check('nirgends im Code ein geheimer Paddle-API-Schlüssel', srcDateien('src').every((f) => !/pdl_(live|sdbx)_apikey_[A-Za-z0-9]/.test(lies(f))));

teil('7b Texte an den Gratis-Grenzen (PRO_HOW)');
const WDPRO = await import(pathToFileURL(path.join(root, 'src/winterdex/pro.ts')).href);
check('Kasse aus → Text wie bisher (Android-App oder Rechnung)', WDPRO.proHowText(false).startsWith('Pro schließt du in der WinterDex-App (Android)') && !/Dashboard/.test(WDPRO.proHowText(false)));
check('Kasse an → nennt zuerst den Kauf hier im Dashboard unter „Abo“ (Paddle)', /direkt hier im Dashboard unter „Abo“/.test(WDPRO.proHowText(true)) && /Paddle/.test(WDPRO.proHowText(true)));
check('im Repo ohne Schlüssel: PRO_HOW = Text wie bisher', regLive !== '' || WDPRO.PRO_HOW === WDPRO.proHowText(false));

// ============================================================================ [8] Build (optional)
teil('8 Build: SDK in eigener Datei, nicht in der Offline-Hülle (optional, nach npm run build)');
const dist = path.join(root, 'dist');
if (existsSync(path.join(dist, 'sw.js')) && existsSync(path.join(dist, 'assets'))) {
  const assets = readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js'));
  const sdkDatei = assets.filter((f) => readFileSync(path.join(dist, 'assets', f), 'utf8').includes('rcb-ui-root'));
  const sw = readFileSync(path.join(dist, 'sw.js'), 'utf8');
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  check('SDK steckt in genau einer eigenen Datei', sdkDatei.length === 1, sdkDatei);
  check('SDK-Datei nicht im Startskript (index.html) und nicht im Service-Worker-Vorabspeicher', sdkDatei.every((f) => !html.includes(f) && !sw.includes(f)), sdkDatei);
} else console.log('  (übersprungen: kein dist/ — erst npm run build)');

console.log(bad === 0 ? `\nALLES GRÜN: ${ok} ok, 0 Fehler` : `\n${ok} ok, ${bad} FEHLER`);
process.exit(bad ? 1 : 0);
