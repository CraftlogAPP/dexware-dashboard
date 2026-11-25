// Paywall dicht (25.11.2026): Pro-Stand und Gratis-Grenzen ALLER App-Bereiche — ohne Server. RPC org_pro_active, die
// Tabellen-Zählungen (PostgREST), RevenueCat/Suite-Server (fetch) und localStorage sind nachgebaut.
//
// Worum es geht: „Kann eine Grenze bei einer Störung oder einem Zählfehler still aufgehen?“ — vorher galt in fast allen
// Bereichen „im Zweifel Pro“ (Grenze offen, Import UNBEGRENZT) und „Zählung kaputt → 0 → erlaubt“.
//   [1] Baustein src/lib/proStand.ts: sichere Antworten, letzter sicherer Stand (je App UND Konto, 35 Tage), Grenze vs. Anzeige
//   [2] WinterDex nutzt den Baustein unverändert (gleicher Speicher-Schlüssel, gleiche Texte)
//   [3] Server-Ablehnung erkennen (gratis_grenze_…, „team needs pro“)
//   [4] Prüf-Apps (src/pruefen/pro.ts): unitGate/siteGate/importPro/mitGrenzText
//   [5] PrüfDex (Geräte, Prüfungen), KfzDex (Fahrzeuge, Fahrer)
//   [6] Abo-Quelle ohne org_pro_active (SchutzDex, CraftDex, TourDex) + deren Grenzen
//   [7] Quelltext: keine Grenze fällt mehr auf „im Zweifel erlauben“ zurück
//
//   Aufruf:  node tests/pro-stand.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { registerHooks } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
globalThis.window = globalThis.window ?? { alert: () => {} };
const web = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
const liesWeb = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

const P = await web('src/lib/proStand.ts');
const WD = await web('src/winterdex/pro.ts');
const PR = await web('src/pruefen/pro.ts');
const PD = await web('src/pruefdex/gate.ts');
const KFZ = await web('src/kfzdex/vorOrt/backend.ts');
const ABO = await web('src/lib/aboProStand.ts');
const SD = await web('src/schutzdex/pro.ts');
const TD = await web('src/tourdex/pro.ts');
const CD = await web('src/craftdex/pro.ts');

let ok = 0;
let bad = 0;
const check = (name, cond, detail) => {
  cond ? ok++ : bad++;
  console.log(`  ${cond ? 'ok  ' : 'FEHL'}  ${name}${cond || detail === undefined ? '' : `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};
const teil = (t) => console.log(`\n[${t}]`);
const wirft = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};

/**
 * Supabase-Nachbau: rpc() liefert antwort() (oder wirft), from(tabelle) eine verkettbare Abfrage, die beim await
 * tabellen[tabelle](filter) liefert ({ count, error } bzw. { data, error }). Fehlt die Tabelle: Fehler.
 */
let nr = 0;
const sb = ({ uid = `u${++nr}`, rpc = () => ({ data: false, error: null }), tabellen = {} } = {}) => {
  const c = { rpcAufrufe: 0, abfragen: [] };
  c.auth = { getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null } }) };
  c.rpc = async (name) => {
    if (name !== 'org_pro_active') throw new Error('falscher RPC ' + name);
    c.rpcAufrufe++;
    return rpc();
  };
  c.from = (t) => {
    const filter = [];
    const lauf = () => {
      c.abfragen.push([t, filter]);
      const f = tabellen[t];
      return f ? f(filter) : { data: null, count: null, error: { message: `keine Tabelle ${t}` } };
    };
    const q = {
      select: (...a) => (filter.push(['select', ...a]), q),
      eq: (...a) => (filter.push(['eq', ...a]), q),
      not: (...a) => (filter.push(['not', ...a]), q),
      gte: (...a) => (filter.push(['gte', ...a]), q),
      lt: (...a) => (filter.push(['lt', ...a]), q),
      limit: () => q,
      maybeSingle: async () => lauf(),
      then: (res, rej) => Promise.resolve().then(lauf).then(res, rej),
    };
    return q;
  };
  return c;
};
const zahl = (n) => () => ({ count: n, error: null, data: null });
const zaehlFehler = () => ({ count: null, error: { message: 'TypeError: Failed to fetch' }, data: null });
const RPC_FREI = () => ({ data: false, error: null });
const RPC_PRO = () => ({ data: true, error: null });
const RPC_NULL = () => ({ data: null, error: null });
const RPC_FEHLER = () => ({ data: null, error: { message: 'boom' } });
const NETZ_WEG = () => {
  throw new TypeError('Failed to fetch');
};

// ============================================================================ [1] Baustein
teil('1 Baustein src/lib/proStand.ts');
{
  const frei = sb({ rpc: RPC_FREI });
  check('frei: Grenze false, Anzeige false (Wasserzeichen)', (await P.orgProFuerGrenze(frei, 'leiterdex')) === false && (await P.fetchOrgPro(frei, 'leiterdex')) === false);
  const pro = sb({ rpc: RPC_PRO });
  await P.orgProFuerGrenze(pro, 'leiterdex');
  await P.orgProFuerGrenze(pro, 'leiterdex');
  check('Grenze fragt IMMER frisch (2 Aufrufe → 2 RPC)', pro.rpcAufrufe === 2, pro.rpcAufrufe);
  await P.fetchOrgPro(pro, 'leiterdex');
  check('Anzeige nutzt 5-Minuten-Speicher (kein neuer RPC)', pro.rpcAufrufe === 2, pro.rpcAufrufe);

  for (const [name, f] of [['RPC null', RPC_NULL], ['RPC-Fehler', RPC_FEHLER], ['Netz weg', NETZ_WEG]]) {
    const neu = sb({ rpc: f });
    const e = await wirft(() => P.orgProFuerGrenze(neu, 'feuerdex'));
    check(`${name}, nie ein sicherer Stand: Grenze wirft ProUnklarError (nicht still erlauben)`, e instanceof P.ProUnklarError && e.message === P.PRO_UNKLAR, String(e));
    check(`${name}, nie ein sicherer Stand: Anzeige = Pro`, (await P.fetchOrgPro(neu, 'feuerdex', true)) === true);
  }
  let antwort = RPC_FREI;
  const bekanntFrei = sb({ rpc: () => antwort() });
  await P.orgProFuerGrenze(bekanntFrei, 'toredex');
  antwort = RPC_NULL;
  check('bekannt frei + Störung: Grenze bleibt zu (letzter sicherer Stand)', (await P.orgProFuerGrenze(bekanntFrei, 'toredex')) === false);
  let a2 = RPC_PRO;
  const bekanntPro = sb({ rpc: () => a2() });
  await P.orgProFuerGrenze(bekanntPro, 'toredex');
  a2 = NETZ_WEG;
  check('bekannt Pro + Netz weg: Grenze offen (Zahlender nicht ausgesperrt)', (await P.orgProFuerGrenze(bekanntPro, 'toredex')) === true);
  a2 = RPC_FREI;
  check('nach Kündigung (sicher false): Grenze zu', (await P.orgProFuerGrenze(bekanntPro, 'toredex')) === false);
  a2 = RPC_NULL;
  check('… und bei späterer Störung bleibt es zu (kein alter Pro-Stand)', (await P.orgProFuerGrenze(bekanntPro, 'toredex')) === false);

  // je App UND Konto
  speicher.set('gurtdex.orgPro.uX', JSON.stringify({ v: true, at: Date.now() }));
  const andereApp = sb({ uid: 'uX', rpc: RPC_NULL });
  check('Stand derselben Nutzer-ID in einer ANDEREN App gilt nicht', (await wirft(() => P.orgProFuerGrenze(andereApp, 'regaldex'))) instanceof P.ProUnklarError);
  check('… in derselben App schon', (await P.orgProFuerGrenze(andereApp, 'gurtdex')) === true);
  speicher.set('spieldex.orgPro.uAlt', JSON.stringify({ v: true, at: Date.now() - 36 * 864e5 }));
  check('älter als 35 Tage zählt nicht', (await wirft(() => P.orgProFuerGrenze(sb({ uid: 'uAlt', rpc: RPC_NULL }), 'spieldex'))) instanceof P.ProUnklarError);
  speicher.set('spieldex.orgPro.uKaputt', '{kaputt');
  check('kaputter Eintrag = keiner', (await wirft(() => P.orgProFuerGrenze(sb({ uid: 'uKaputt', rpc: RPC_NULL }), 'spieldex'))) instanceof P.ProUnklarError);
  check('ohne Sitzung → ProUnklarError', (await wirft(() => P.orgProFuerGrenze(sb({ uid: null, rpc: RPC_NULL }), 'spieldex'))) instanceof P.ProUnklarError);
  const echt = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  check('Speicher gesperrt (privates Fenster): sichere Antwort geht trotzdem', (await P.orgProFuerGrenze(sb({ rpc: RPC_PRO }), 'spieldex')) === true);
  globalThis.localStorage = echt;
  check('proFuerGrenze/proFuerAnzeige', P.proFuerGrenze(true) && !P.proFuerGrenze(false) && P.proFuerAnzeige(null) === true && (await wirft(() => P.proFuerGrenze(null))) instanceof P.ProUnklarError);
}

// ============================================================================ [2] WinterDex
teil('2 WinterDex unverändert über den Baustein');
{
  const c = sb({ uid: 'wd-1', rpc: RPC_FREI });
  await WD.orgProFuerGrenze(c);
  check('gleicher Speicher-Schlüssel wie vorher („winterdex.orgPro.<Nutzer>“)', JSON.parse(speicher.get('winterdex.orgPro.wd-1') ?? 'null')?.v === false);
  speicher.set('winterdex.orgPro.wd-2', JSON.stringify({ v: true, at: Date.now() }));
  check('vorhandener letzter Stand aus der alten Fassung gilt weiter', (await WD.orgProFuerGrenze(sb({ uid: 'wd-2', rpc: RPC_NULL }))) === true);
  check('ProUnklarError/PRO_UNKLAR/istGratisGrenze sind dieselben wie im Baustein', WD.ProUnklarError === P.ProUnklarError && WD.PRO_UNKLAR === P.PRO_UNKLAR && WD.istGratisGrenze === P.istGratisGrenze);
  check('Anzeige ohne Stand = Pro (kein Wasserzeichen für evtl. Zahlende)', (await WD.fetchOrgPro(sb({ rpc: RPC_NULL }), true)) === true);
}

// ============================================================================ [3] Server-Ablehnung
teil('3 Server-Ablehnung erkennen');
{
  check('PostgREST-Fehler mit hint gratis_grenze_property', P.istGratisGrenze({ code: 'P0001', hint: 'gratis_grenze_property', message: 'Gratis-Grenze: …' }));
  check('in fail() verpackt', P.istGratisGrenze(new Error('Leiter konnte nicht gespeichert werden: Gratis-Grenze: Im Gratis-Paket …')));
  check('Runde und Auftraggeber-Link (ObjektDex)', P.istGratisGrenze({ hint: 'gratis_grenze_route' }) && P.istGratisGrenze({ hint: 'gratis_grenze_share_link' }));
  check('andere Fehler nicht', !P.istGratisGrenze(new Error('row-level security')) && !P.istGratisGrenze(null) && !P.istGratisGrenze('x'));
  check('Team-Beitritt „team needs pro“ (Text oder hint)', P.istTeamNeedsPro(new Error('team needs pro')) && P.istTeamNeedsPro({ hint: 'team_needs_pro' }) && !P.istTeamNeedsPro(new Error('team full')));
  check('grenzText schneidet den Technik-Vorsatz ab', P.grenzText(new Error('X konnte nicht gespeichert werden: Gratis-Grenze: Im Gratis-Paket sind 2 …')) === 'Im Gratis-Paket sind 2 …' && P.grenzText(new Error('anderes')) === null);
}

// ============================================================================ [4] Prüf-Apps
teil('4 Prüf-Apps (src/pruefen/pro.ts)');
{
  const cfgU = (await web('src/leiterdex/vorOrt.ts')).LEITERDEX_VOR_ORT;
  const cfgS = (await web('src/regaldex/vorOrt.ts')).REGALDEX_VOR_ORT;
  const cfgH = (await web('src/hebedex/vorOrt.ts')).HEBEDEX_VOR_ORT;
  check('Grenzen wie die Apps: LeiterDex 2 Leitern, RegalDex 1 Lager, HebeDex 3 Teile', cfgU.freeUnits === 2 && cfgS.freeSites === 1 && cfgH.freeUnits === 3);

  let c = sb({ rpc: RPC_FREI, tabellen: { [cfgU.tables.unit]: zahl(1) } });
  let g = await PR.unitGate(c, cfgU);
  check('unter der Grenze: erlaubt, KEINE Pro-Frage', g.allowed && g.count === 1 && c.rpcAufrufe === 0, { g, rpc: c.rpcAufrufe });
  c = sb({ rpc: RPC_FREI, tabellen: { [cfgU.tables.unit]: zahl(2) } });
  check('an der Grenze ohne Pro: gesperrt', (await PR.unitGate(c, cfgU)).allowed === false);
  c = sb({ rpc: RPC_PRO, tabellen: { [cfgU.tables.unit]: zahl(40) } });
  check('mit Pro: erlaubt', (await PR.unitGate(c, cfgU)).allowed === true);
  c = sb({ rpc: RPC_NULL, tabellen: { [cfgU.tables.unit]: zahl(2) } });
  check('Pro unklar ohne letzten Stand: ProUnklarError (vorher: erlaubt)', (await wirft(() => PR.unitGate(c, cfgU))) instanceof P.ProUnklarError);
  c = sb({ rpc: RPC_PRO, tabellen: { [cfgU.tables.unit]: zaehlFehler } });
  const e1 = await wirft(() => PR.unitGate(c, cfgU));
  check('Zählung kaputt: ProUnklarError mit GRENZE_UNKLAR (vorher: „0“ → erlaubt)', e1 instanceof P.ProUnklarError && e1.message === P.GRENZE_UNKLAR, String(e1));
  c = sb({ rpc: RPC_FREI, tabellen: { [cfgU.tables.unit]: zahl(0) } });
  await PR.unitGate(c, cfgU);
  const f = c.abfragen[0]?.[1] ?? [];
  check('gezählt werden nur nicht ausgesonderte Einheiten', f.some((x) => x[0] === 'eq' && x[1] === cfgU.cols.retired && x[2] === false), f);
  c = sb({ rpc: RPC_FREI, tabellen: { [cfgH.tables.unit]: zahl(0) } });
  await PR.unitGate(c, cfgH);
  check('HebeDex: Beispieldaten zählen nicht (Filter auf die Demo-Spalte)', (c.abfragen[0]?.[1] ?? []).some((x) => x[0] === 'eq' && x[1] === cfgH.cols.demo && x[2] === false));

  c = sb({ rpc: RPC_FREI, tabellen: { [cfgS.tables.site]: zahl(1) } });
  check('Orts-App: 1 aktives Lager, kein Pro → gesperrt', (await PR.siteGate(c, cfgS)).allowed === false);
  c = sb({ rpc: RPC_NULL, tabellen: { [cfgS.tables.site]: zahl(1) } });
  check('Orts-App: Pro unklar → ProUnklarError', (await wirft(() => PR.siteGate(c, cfgS))) instanceof P.ProUnklarError);
  c = sb({ rpc: RPC_FREI, tabellen: { [cfgS.tables.site]: zaehlFehler } });
  check('Orts-App: Zählung kaputt → ProUnklarError', (await wirft(() => PR.siteGate(c, cfgS))) instanceof P.ProUnklarError);
  c = sb({ rpc: RPC_FREI });
  check('Einheiten-App: siteGate ohne Orts-Grenze erlaubt ohne Abfrage', (await PR.siteGate(c, cfgU)).allowed && c.abfragen.length === 0 && c.rpcAufrufe === 0);

  c = sb({ rpc: RPC_NULL });
  check('Import: Pro unklar ohne letzten Stand → ProUnklarError (vorher: unklar = Pro = UNBEGRENZT)', (await wirft(() => PR.importPro(c, cfgU))) instanceof P.ProUnklarError);
  c = sb({ rpc: RPC_FREI });
  check('Import: frei → false (Grenze gilt)', (await PR.importPro(c, cfgU)) === false);
  c = sb({ rpc: RPC_FREI });
  check('Import einer App ohne Grenze: true ohne Pro-Frage', (await PR.importPro(c, { ...cfgU, freeUnits: undefined, freeSites: undefined })) === true && c.rpcAufrufe === 0);
  const imp = await web('src/pruefen/importUnits.ts');
  check('Import-Rahmen: ohne Pro höchstens bis zur Grenze, mit Pro unbegrenzt', imp.unitAllowance(cfgU, false, 1) === 1 && imp.unitAllowance(cfgU, false, 5) === 0 && imp.unitAllowance(cfgU, true, 5) === null);

  const e2 = await wirft(() => PR.mitGrenzText(Promise.reject(new Error('Leiter konnte nicht gespeichert werden: Gratis-Grenze: x')), 'HINWEIS'));
  const e3 = await wirft(() => PR.mitGrenzText(Promise.reject(new Error('anderer Fehler')), 'HINWEIS'));
  check('mitGrenzText: Server-Ablehnung → Grenz-Hinweis, andere Fehler unverändert', e2?.message === 'HINWEIS' && e3?.message === 'anderer Fehler');
  check('mitGrenzText: Erfolg geht durch', (await PR.mitGrenzText(Promise.resolve(7), 'x')) === 7);
}

// ============================================================================ [5] PrüfDex, KfzDex
teil('5 PrüfDex (3 Geräte, 5 Prüfungen) und KfzDex (1 Fahrzeug, 2 Fahrer)');
{
  let c = sb({ rpc: RPC_FREI, tabellen: { device: zahl(3) } });
  check('PrüfDex: 3 Geräte ohne Pro → gesperrt', (await PD.deviceGate(c)).allowed === false);
  c = sb({ rpc: RPC_NULL, tabellen: { device: zahl(3) } });
  check('PrüfDex: Pro unklar → ProUnklarError', (await wirft(() => PD.deviceGate(c))) instanceof P.ProUnklarError);
  c = sb({ rpc: RPC_FREI, tabellen: { device: zaehlFehler } });
  check('PrüfDex: Geräte nicht zählbar (auch Rückfall ohne „retired“) → ProUnklarError', (await wirft(() => PD.deviceGate(c))) instanceof P.ProUnklarError);
  c = sb({ rpc: RPC_FREI, tabellen: { inspection: zahl(4) } });
  check('PrüfDex: 4 Prüfungen + 1 wartende = 5 → gesperrt (wartende zählen mit)', (await PD.inspectionGate(c, 1)).allowed === false);
  c = sb({ rpc: RPC_FREI, tabellen: { inspection: zahl(4) } });
  check('PrüfDex: 4 Prüfungen → frei, keine Pro-Frage', (await PD.inspectionGate(c, 0)).allowed && c.rpcAufrufe === 0);
  c = sb({ rpc: RPC_FREI, tabellen: { vehicle: zahl(1) } });
  check('KfzDex: 1 Fahrzeug ohne Pro → gesperrt', (await KFZ.fleetGate(c, 'vehicle', 1)).allowed === false);
  c = sb({ rpc: RPC_FEHLER, tabellen: { driver: zahl(2) } });
  check('KfzDex: Pro unklar → ProUnklarError (vorher: erlaubt)', (await wirft(() => KFZ.fleetGate(c, 'driver', 2))) instanceof P.ProUnklarError);
  c = sb({ rpc: RPC_PRO, tabellen: { driver: zaehlFehler } });
  check('KfzDex: Zählung kaputt → ProUnklarError (vorher: erlaubt)', (await wirft(() => KFZ.fleetGate(c, 'driver', 2))) instanceof P.ProUnklarError);
}

// ============================================================================ [6] Abo-Quelle + SchutzDex/CraftDex/TourDex
teil('6 Apps ohne org_pro_active: Abo-Quelle (RevenueCat/Suite) und ihre Grenzen');
{
  const zukunft = new Date(Date.now() + 20 * 864e5).toISOString();
  const leer = { entitlements: {}, subscriptions: {}, management_url: null };
  const mitPro = { entitlements: { pro: { expires_date: zukunft, product_identifier: 'p1' } }, subscriptions: { p1: { expires_date: zukunft } }, management_url: null };
  /** rc: Antwort für alle Kennungen (Abonnent | HTTP-Status) · suite/appPro: { active } | Status | 'netz' */
  const server = ({ rc = leer, suite = { active: false }, appPro = { active: false } }) => {
    const gefragt = [];
    globalThis.fetch = async (url) => {
      const u = String(url);
      gefragt.push(u);
      const antw = u.includes('api.revenuecat.com') ? (typeof rc === 'number' ? rc : { subscriber: rc }) : u.includes('&app=') ? appPro : suite;
      if (antw === 'netz') throw new TypeError('Failed to fetch');
      return typeof antw === 'number' ? { ok: false, status: antw, json: async () => ({}) } : { ok: true, status: 200, json: async () => antw };
    };
    return gefragt;
  };
  const APP = { id: 'schutzdex', name: 'SchutzDex', revenueCat: 'goog_TEST' };
  let s = 0;
  const session = (meta = {}) => ({ user: { id: `sess-${++s}`, email: `k${s}@example.at`, app_metadata: meta } });

  server({});
  check('alle Quellen sicher „nein“ → false', (await ABO.aboQuelle(APP, session(), { appParam: 'schutzdex' })()) === false);
  server({ rc: mitPro });
  check('RevenueCat Pro → true', (await ABO.aboQuelle(APP, session(), { appParam: 'schutzdex' })()) === true);
  server({ appPro: { active: true } });
  check('Pro dieser App aus der Sammel-App (&app=) → true', (await ABO.aboQuelle(APP, session(), { appParam: 'schutzdex' })()) === true);
  server({ rc: 503 });
  check('RevenueCat gestört → null (unklar)', (await ABO.aboQuelle(APP, session(), { appParam: 'schutzdex' })()) === null);
  server({ suite: 500 });
  check('Suite-Server gestört → null', (await ABO.aboQuelle(APP, session(), {})()) === null);
  server({ appPro: 'netz' });
  check('&app-Abfrage gestört → null', (await ABO.aboQuelle(APP, session(), { appParam: 'schutzdex' })()) === null);
  let gefragt = server({});
  check('app_metadata.pro (SchutzDex-Freikonto) → true ohne Abfrage', (await ABO.aboQuelle(APP, session({ pro: true }), { metaPro: true })()) === true && gefragt.length === 0, gefragt);
  server({});
  check('app-eigene Quelle unklar (z. B. pro_overrides-Fehler) → null', (await ABO.aboQuelle(APP, session(), { extra: async () => null })()) === null);
  server({});
  check('app-eigene Quelle „ja“ (pro_overrides.is_pro) → true', (await ABO.aboQuelle(APP, session(), { extra: async () => true })()) === true);
  check('ohne Sitzung → null', (await ABO.aboProStand(APP, null)) === null);

  // SchutzDex Mitarbeiter-Grenze (2 aktive)
  let c = sb({ tabellen: { member: zahl(2) } });
  check('SchutzDex: 2 aktive, kein Pro → gesperrt', (await SD.memberGate(c, async () => false)).allowed === false);
  check('SchutzDex: 1 aktiver → frei, Pro wird nicht gefragt', (await SD.memberGate(sb({ tabellen: { member: zahl(1) } }), async () => { throw new Error('nicht fragen'); })).allowed === true);
  check('SchutzDex: Pro unklar → ProUnklarError (vorher: im Zweifel erlaubt)', (await wirft(() => SD.memberGate(c, async () => null))) instanceof P.ProUnklarError);
  check('SchutzDex: Pro-Frage wirft → ProUnklarError', (await wirft(() => SD.memberGate(c, async () => { throw new Error('x'); }))) instanceof P.ProUnklarError);
  check('SchutzDex: Zählung kaputt → ProUnklarError (vorher: erlaubt)', (await wirft(() => SD.memberGate(sb({ tabellen: { member: zaehlFehler } }), async () => true))) instanceof P.ProUnklarError);
  const ses = session();
  server({ rc: mitPro });
  await SD.schutzProStand(APP, ses);
  server({ rc: 503 });
  check('SchutzDex: Pro bekannt, dann RevenueCat gestört → letzter sicherer Stand (Pro)', (await SD.schutzProStand(APP, ses)) === true);
  check('SchutzDex Anzeige: unklar ohne Stand → Pro', (await SD.fetchSchutzPro(APP, session())) === true);

  // CraftDex (2 Aufträge, Beispiele zählen nicht)
  c = sb({ tabellen: { projects: zahl(2) } });
  check('CraftDex: 2 Aufträge, kein Pro → gesperrt (vorher im Dashboard gar keine Grenze)', (await CD.projectGate(c, async () => false)).allowed === false);
  const filt = c.abfragen[0]?.[1] ?? [];
  check('CraftDex: gezählt ohne gelöschte und ohne Beispiel-Aufträge (seed-…)', filt.some((x) => x[0] === 'eq' && x[1] === 'deleted' && x[2] === false) && filt.some((x) => x[0] === 'not' && x[1] === 'id' && x[3] === 'seed-%'), filt);
  check('CraftDex: Pro unklar → ProUnklarError', (await wirft(() => CD.projectGate(c, async () => null))) instanceof P.ProUnklarError);
  check('CraftDex: 1 Auftrag → frei', (await CD.projectGate(sb({ tabellen: { projects: zahl(1) } }), async () => false)).allowed === true);
  check('CraftDex: Zählung kaputt → ProUnklarError', (await wirft(() => CD.projectGate(sb({ tabellen: { projects: zaehlFehler } }), async () => true))) instanceof P.ProUnklarError);
  c = sb({ uid: 'cd-1', tabellen: { pro_overrides: () => ({ data: { is_pro: true }, error: null }) } });
  server({});
  check('CraftDex: manuelle Freischaltung (pro_overrides) zählt als Pro', (await CD.craftProStand({ ...APP, id: 'craftdex' }, session(), c)) === true);

  // TourDex (10 Fahrten je Monat, stornierte zählen nicht)
  const m = TD.monatVon('2026-11-15T10:00:00.000Z');
  check('TourDex: Monatsgrenzen in Ortszeit, Schlüssel JJJJ-MM', m.key === '2026-11' && new Date(m.start).getDate() === 1 && new Date(m.ende).getMonth() === 11 && m.start < '2026-11-15T10:00:00.000Z' && m.ende > '2026-11-15T10:00:00.000Z', m);
  const fahrten = (n, storniert = 0, extra = []) => () => ({
    data: [...Array.from({ length: n }, (_, i) => ({ item_id: `t${i}`, canceled: i < storniert })), ...extra],
    error: null,
  });
  c = sb({ tabellen: { sync_items: fahrten(10) } });
  check('TourDex: 10 Fahrten im Monat, kein Pro → gesperrt (vorher im Dashboard gar keine Grenze)', (await TD.tripGate(c, async () => false, '2026-11-15T10:00:00.000Z')).allowed === false);
  const tf = c.abfragen[0]?.[1] ?? [];
  check('TourDex: nur Fahrten (collection trips), nicht gelöschte, im Monat der Fahrt', tf.some((x) => x[0] === 'eq' && x[1] === 'collection' && x[2] === 'trips') && tf.some((x) => x[0] === 'eq' && x[1] === 'deleted' && x[2] === false) && tf.some((x) => x[0] === 'gte' && x[2] === m.start) && tf.some((x) => x[0] === 'lt' && x[2] === m.ende), tf);
  c = sb({ tabellen: { sync_items: fahrten(12, 3) } });
  check('TourDex: stornierte zählen nicht (12 − 3 = 9 → frei)', (await TD.tripGate(c, async () => false, '2026-11-15T10:00:00.000Z')).allowed === true);
  c = sb({ tabellen: { sync_items: fahrten(10) } });
  check('TourDex: die eigene Fahrt (Bearbeiten) zählt nicht mit', (await TD.tripGate(c, async () => false, '2026-11-15T10:00:00.000Z', 't0')).allowed === true);
  check('TourDex: Pro unklar → ProUnklarError', (await wirft(() => TD.tripGate(sb({ tabellen: { sync_items: fahrten(10) } }), async () => null, '2026-11-15T10:00:00.000Z'))) instanceof P.ProUnklarError);
  check('TourDex: Zählung kaputt → ProUnklarError', (await wirft(() => TD.tripGate(sb({ tabellen: { sync_items: () => ({ data: null, error: { message: 'x' } }) } }), async () => true, '2026-11-15T10:00:00.000Z'))) instanceof P.ProUnklarError);
  check('TourDex: mit Pro unbegrenzt', (await TD.tripGate(sb({ tabellen: { sync_items: fahrten(50) } }), async () => true, '2026-11-15T10:00:00.000Z')).allowed === true);
  const tdApp = readFileSync('C:/Users/2easy/Desktop/TourDex/src/types/index.ts', 'utf8');
  check('TourDex: Grenze wie FREE_TRIP_LIMIT der App', new RegExp(`FREE_TRIP_LIMIT = ${TD.FREE_TRIP_LIMIT};`).test(tdApp));
  const cdApp = readFileSync('C:/Users/2easy/Desktop/CraftDex/src/context/SubscriptionContext.tsx', 'utf8');
  check('CraftDex: Grenze wie FREE_PROJECT_LIMIT der App', new RegExp(`FREE_PROJECT_LIMIT = ${CD.FREE_PROJECT_LIMIT};`).test(cdApp));
}

// ============================================================================ [7] Quelltext
teil('7 Quelltext: keine Grenze fällt mehr auf „im Zweifel erlauben“ zurück');
{
  const alle = [];
  const lauf = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) lauf(p);
      else if (/\.(ts|tsx)$/.test(f)) alle.push(p);
    }
  };
  lauf(path.join(here, '../src'));
  const treffer = [];
  for (const p of alle) {
    const s = readFileSync(p, 'utf8');
    const rel = path.relative(path.join(here, '..'), p).replace(/\\/g, '/');
    if (/Gate\([^)]*\)\.catch\(\(\) => \(\{ allowed: true \}\)\)/.test(s)) treffer.push(`${rel}: Gate(…).catch → erlaubt`);
    if (/if \(error \|\| count === null\) return \{ allowed: true/.test(s)) treffer.push(`${rel}: Zählfehler → erlaubt`);
    if (/data === null \|\| data === undefined\) return true/.test(s)) treffer.push(`${rel}: org_pro_active null → Pro`);
    if (/memberGate\([^)]*\)[\s\S]{0,40}\.catch\(\(\) => true\)/.test(s) || /isPro\(\)\.catch\(\(\) => true\)/.test(s)) treffer.push(`${rel}: isPro().catch → Pro`);
  }
  check('keine Fundstelle der alten Rückfälle', treffer.length === 0, treffer);
  const team = liesWeb('src/components/TeamPage.tsx');
  check('TeamPage: Code nur bei sicherem Pro, unklar → Hinweis, kein Einmal-Code als Umweg', /orgProStand\(client, app\.id, true\)/.test(team) && /proUnklar: true/.test(team) && /!team\.data\?\.code && !proSperre/.test(team));
  const reg = liesWeb('src/apps/registry.ts');
  const ids = ['winterdex', 'spieldex', 'regaldex', 'feuerdex', 'geruestdex', 'toredex', 'gurtdex', 'hebedex', 'leiterdex'];
  const ohne = ids.filter((id) => !new RegExp(`id: '${id}',[\\s\\S]*?teamNeedsPro: true[\\s\\S]*?\\n  \\},`).test(reg) || new RegExp(`id: '${id}',[\\s\\S]*?\\n  \\},`).exec(reg)[0].indexOf('teamNeedsPro: true') < 0);
  check('Team nur mit Pro: WinterDex + 8 Prüf-Apps (wie TeamScreen der Apps)', ohne.length === 0, ohne);
  for (const a of ['leiterdex', 'feuerdex', 'toredex', 'gurtdex', 'hebedex']) {
    const s = liesWeb(`src/${a}/pages/SiteDetail.tsx`);
    check(`${a}: neue Einheit wird beim SPEICHERN geprüft (nicht nur am „+“), Server-Ablehnung als Hinweis`, /const isNew = editing\w+ === 'new'/.test(s) && /\(isNew \|\| backInUse\) && !\(await unitGate/.test(s) && /mitGrenzText\(/.test(s) && /zeigeGrenzFehler\(e\)/.test(s));
  }
  check('KfzDex: neues Fahrzeug/neuer Fahrer beim Speichern geprüft', /neuMitGrenze\(client, 'vehicle'/.test(liesWeb('src/kfzdex/dialogs.tsx')) && /neuMitGrenze\(client, 'driver'/.test(liesWeb('src/kfzdex/dialogs.tsx')));
  check('CraftDex: „Auftrag anlegen“ prüft die Grenze', /projectGate\(client/.test(liesWeb('src/craftdex/dialogs.tsx')));
  check('TourDex: „Fahrt nachtragen“ prüft die Grenze', /tripGate\(client/.test(liesWeb('src/tourdex/dialogs.tsx')));
  check('Importe fragen Pro wie eine Grenze (PrüfDex, KfzDex, Prüf-Apps)', /orgProFuerGrenze\(sb, 'pruefdex'\)/.test(liesWeb('src/pruefdex/importDevices.ts')) && (liesWeb('src/kfzdex/importFleet.ts').match(/orgProFuerGrenze\(sb, 'kfzdex'\)/g) ?? []).length === 2 && /importPro\(sb, cfg\)/.test(liesWeb('src/pruefen/importUnits.ts')));
}

console.log(`\n${bad === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${bad} Fehler`);
process.exit(bad === 0 ? 0 : 1);
