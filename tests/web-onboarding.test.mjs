// Prüft den ersten Start im Browser (Konto ohne Betrieb → Betrieb anlegen bzw. Team beitreten) für alle elf Apps gegen
// ihr ECHTES Schema (PGlite = Postgres im Speicher — NIE die echte Datenbank).
//
// Es läuft genau der Code der Web-Oberfläche: src/lib/webOnboarding.ts (create / join je App) und die Betriebs-Abfrage
// des jeweiligen Bereichs (fetchOrgContext, fetchKfzOrgContext, fetchOwnerOrgContext). Statt supabase-js bekommt er
// einen kleinen Nachbau, der dieselben Aufrufe (rpc, from().select()/insert()) als angemeldeter Nutzer unter RLS
// (Rolle authenticated, auth.uid()) an PGlite schickt.
//
// Je App:
//   • frisch registriertes Konto hat keinen Betrieb → anlegen → die Betriebs-Abfrage findet ihn (Rolle Inhaber),
//     die Formularwerte stehen in der Zeile; zweites Anlegen (Doppeltipp) ergibt keinen zweiten Betrieb
//   • Team-Beitritt: falscher Code → verständliche Meldung, kein Betrieb; richtiger Code (klein geschrieben, mit
//     Leerzeichen) → derselbe Betrieb, Rolle Mitarbeiter; noch einmal → kein Fehler; volles Team → „Team ist voll“
//   • ohne Anmeldung nimmt der Server nichts an
//   • die benutzten Server-Funktionen und Parameter stehen genau so im Quelltext der Android-App
//   SchutzDex: kein Team-Beitritt (die App hat keinen) — direkter INSERT unter RLS, fremder Inhaber wird abgelehnt.
// Dazu am Quelltext des Dashboards: webSignup in der Registry und das Onboarding im Bereich sind für genau diese
// Apps eingehängt.
//
// Datenstand = „live“ wie in den SQL-Tests der App-Repos (supabase/tests/teamcode-sperre.test.mjs): Aufbau-Liste von
// dort + NACHTRAG-VERWALTER-2026-11-13 + NACHTRAG-TEAMCODE-2026-11-14. SchutzDex: alle Migrationen + NACHTRAG-RUNDUMCHECK.
//
//   Aufruf:  node tests/web-onboarding.test.mjs              (alle Apps)
//            node tests/web-onboarding.test.mjs kfzdex       (nur eine App; mehrere mit Leerzeichen)
//   Braucht: die App-Repos neben dem Dashboard auf dem Desktop (sonst <APP>_REPO setzen) mit installierten SQL-Tests
//            (supabase/tests: npm install) — von dort kommt PGlite; SchutzDex nutzt PGlite und den Supabase-Nachbau
//            aus dem PrüfDex-Repo. Node ab 22.18 (liest die .ts-Dateien direkt).
//
// NICHT geprüft wird hier (läuft nicht in PGlite): die Registrierung selbst (Supabase Auth, Bestätigungs-Mail,
// erlaubte Rücksprung-Adresse), PostgREST und die echten Server.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = 'C:/Users/2easy/Desktop';
const repo = (id, dir) => process.env[`${id.toUpperCase()}_REPO`] ?? `${DESKTOP}/${dir}`;

// Die Dashboard-Quellen importieren einander ohne Dateiendung ('../lib/orgApi') — für Node ergänzen.
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

// ---------------------------------------------------------------- je App verschieden
// app:   Ordner des App-Repos · quelle: Datei der App mit den Server-Aufrufen · bereich: Bereichs-Datei im Dashboard
// form:  was der Nutzer ins Formular tippt · erwartet: was danach in der org-Zeile stehen muss
// rolle: Rolle nach dem Beitritt (so wie sie die Betriebs-Abfrage des Dashboards meldet)
const MUSTER = { name: '  Testbetrieb Müller GmbH ', address: ' Hauptstraße 1, 8010 Graz ' };
const standard = (dir, bereich, extra = {}) => ({
  dir, bereich, modell: 'membership', quelle: 'mobile/src/data/supabaseRepository.ts',
  form: MUSTER, land: 'AT', erwartet: { name: 'Testbetrieb Müller GmbH', address: 'Hauptstraße 1, 8010 Graz', land: 'AT' },
  codeSql: `select code as c from public.team_code(false)`, rolle: 'worker', ...extra,
});
const APPS = {
  leiterdex: standard('LeiterDex', 'src/leiterdex/LeiterdexArea.tsx'),
  feuerdex: standard('FeuerDex', 'src/feuerdex/FeuerdexArea.tsx'),
  toredex: standard('ToreDex', 'src/toredex/ToredexArea.tsx'),
  gurtdex: standard('GurtDex', 'src/gurtdex/GurtdexArea.tsx'),
  hebedex: standard('HebeDex', 'src/hebedex/HebedexArea.tsx', { ohneLand: 'CH' }),
  geruestdex: standard('GeruestDex', 'src/geruestdex/GeruestdexArea.tsx'),
  regaldex: standard('RegalDex', 'src/regaldex/RegaldexArea.tsx'),
  spieldex: standard('SpielDex', 'src/spieldex/SpieldexArea.tsx'),
  pruefdex: standard('PruefDex', 'src/pruefdex/PruefdexArea.tsx', {
    form: { ...MUSTER, inspector: ' Max Muster ', qualification: 'Elektrofachkraft nach DGUV V3' },
    erwartet: { name: 'Testbetrieb Müller GmbH', address: 'Hauptstraße 1, 8010 Graz', inspector_name: 'Max Muster', inspector_qualification: 'Elektrofachkraft nach DGUV V3' },
    rolle: 'inspector',
  }),
  kfzdex: {
    dir: 'KfzDex', bereich: 'src/kfzdex/KfzdexArea.tsx', modell: 'kfz', quelle: 'src/lib/queries.ts',
    form: { name: MUSTER.name }, land: 'DE', erwartet: { name: 'Testbetrieb Müller GmbH' },
    codeSql: `select public.team_code() as c`, rolle: 'worker',
  },
  schutzdex: {
    dir: 'SchutzDex', bereich: 'src/schutzdex/SchutzdexArea.tsx', modell: 'owner', quelle: 'src/lib/queries.ts',
    form: { name: MUSTER.name, branche: ' Sanitär / Heizung ', count: '1.000' }, land: 'AT',
    erwartet: { name: 'Testbetrieb Müller GmbH', branche: 'Sanitär / Heizung', land: 'AT', mitarbeiter_anzahl: 1000 },
  },
};
// ----------------------------------------------------------------

const wahl = process.argv.slice(2).map((a) => a.toLowerCase());
const unbekannt = wahl.filter((a) => !APPS[a]);
if (unbekannt.length) {
  console.error(`Unbekannte App: ${unbekannt.join(', ')} — möglich: ${Object.keys(APPS).join(', ')}`);
  process.exit(2);
}
const dran = Object.keys(APPS).filter((a) => wahl.length === 0 || wahl.includes(a));
for (const id of Object.keys(APPS)) APPS[id].repo = repo(id, APPS[id].dir);

const pglitePfad = (r) => path.join(r, 'supabase/tests/node_modules/@electric-sql/pglite/dist/index.js');
const PGREPO = repo('pruefdex', 'PruefDex'); // PGlite + Supabase-Nachbau für SchutzDex (bringt selbst keine SQL-Tests mit)
for (const id of dran) {
  const r = APPS[id].modell === 'owner' ? PGREPO : APPS[id].repo;
  if (!existsSync(pglitePfad(r))) {
    console.error(`PGlite nicht gefunden: ${pglitePfad(r)}\nBitte dort unter supabase/tests einmal „npm install“ ausführen (oder ${id.toUpperCase()}_REPO setzen).`);
    process.exit(2);
  }
}
const web = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
const { WEB_ONBOARDING, parseStaffCount } = await web('src/lib/webOnboarding.ts');
const { fetchOrgContext, fetchOwnerOrgContext } = await web('src/lib/orgApi.ts');
const { fetchKfzOrgContext } = await web('src/kfzdex/api.ts');
const FETCHER = { membership: fetchOrgContext, kfz: fetchKfzOrgContext, owner: fetchOwnerOrgContext };
const FETCHER_NAME = { membership: null, kfz: 'fetchKfzOrgContext', owner: 'fetchOwnerOrgContext' };

const KEY = 'goog_TESTschluesselABCDEFGHIJKLMN';
const liesWeb = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0;
let fail = 0;
let marke = '';
const check = (name, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${marke}${name}${cond || !extra ? '' : '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`);
};

// ---------------------------------------------------------------- Datenbank je App aufbauen (Stand „live“)
async function aufbau(app) {
  const sqlDir = path.join(app.repo, 'supabase');
  const lies = (n, dir = sqlDir) => readFileSync(path.join(dir, n), 'utf8').replace(/\r\n/g, '\n');
  let basis;
  let dateien;
  let pgcrypto = false;
  let PGlite;
  if (app.modell === 'owner') {
    ({ PGlite } = await import(pathToFileURL(pglitePfad(PGREPO)).href));
    basis = lies('tests/verwalter.test.mjs', path.join(PGREPO, 'supabase')).match(/const BASIS = `([\s\S]*?)`;/)?.[1];
    dateien = [
      ...readdirSync(path.join(sqlDir, 'migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => `migrations/${f}`),
      'NACHTRAG-RUNDUMCHECK-2026-11-10.sql',
    ];
  } else {
    ({ PGlite } = await import(pathToFileURL(pglitePfad(app.repo)).href));
    basis = lies('tests/verwalter.test.mjs').match(/const (?:BASIS|prelude) = `([\s\S]*?)`;/)?.[1];
    const tc = lies('tests/teamcode-sperre.test.mjs');
    const cfg = tc.match(/^const APP = (\{[\s\S]*?\n\});/m)?.[1];
    const liste = tc.match(/^const AUFBAU = (\[[\s\S]*?\n\]);/m)?.[1];
    if (cfg) {
      const c = JSON.parse(cfg);
      pgcrypto = !!c.pgcrypto;
      dateien = [...c.aufbau, 'NACHTRAG-VERWALTER-2026-11-13.sql'];
    } else if (liste) {
      dateien = JSON.parse(liste.replace(/'/g, '"').replace(/,\s*\]/, ']'));
    } else throw new Error(`Aufbau-Liste in ${app.dir}/supabase/tests/teamcode-sperre.test.mjs nicht gefunden`);
    if (!dateien.includes('NACHTRAG-VERWALTER-2026-11-13.sql')) dateien.push('NACHTRAG-VERWALTER-2026-11-13.sql');
    dateien.push('NACHTRAG-TEAMCODE-2026-11-14.sql');
  }
  if (!basis || basis.includes('${')) throw new Error(`Supabase-Nachbau (BASIS) für ${app.dir} nicht lesbar`);
  const vorbereiten = (sql) => (pgcrypto ? sql : sql.replace(/^create extension if not exists [^;]+;/gim, '')).replaceAll('__RC_PUBLIC_KEY__', KEY);
  let db;
  if (pgcrypto) {
    const ext = await import(pathToFileURL(path.join(path.dirname(pglitePfad(app.repo)), 'contrib/pgcrypto.js')).href);
    db = new PGlite({ extensions: { pgcrypto: ext.pgcrypto } });
  } else db = new PGlite();
  await db.exec(basis);
  if (pgcrypto) await db.exec(`set search_path = "$user", public, extensions;`);
  for (const f of dateien) {
    try {
      await db.exec(vorbereiten(lies(f)));
    } catch (e) {
      throw new Error(`${app.dir}/supabase/${f}: ${e?.message ?? e}`);
    }
  }
  const als = async (uid, fn) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
    await db.exec(uid ? 'set role authenticated' : 'set role anon');
    try {
      return await fn();
    } finally {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  let nr = 0;
  const nutzer = async (name) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [`${name}${++nr}@beispiel.de`])).rows[0].id;
  return { db, als, nutzer, dateien };
}

// ---------------------------------------------------------------- supabase-js-Nachbau (nur was der Web-Code benutzt)
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`unerwarteter Name: ${s}`);
  return `"${s}"`;
};
const fehler = (e) => ({ message: String(e?.message ?? e), code: e?.code });

/** Client „als dieser Nutzer“ (uid null = nicht angemeldet). log sammelt die Aufrufe für den Abgleich mit der App. */
function client(t, uid, log = []) {
  const run = async (fn) => {
    try {
      return { data: await t.als(uid, fn), error: null };
    } catch (e) {
      return { data: null, error: fehler(e) };
    }
  };
  const from = (table) => {
    const q = { cols: '*', wo: [], werte: [], order: null, limit: null, modus: 'viele', insert: null };
    const ausfuehren = async () => {
      if (q.insert) {
        const keys = Object.keys(q.insert);
        log.push({ art: 'insert', table, keys });
        const r = await run(() => t.db.query(
          `insert into public.${ident(table)} (${keys.map(ident).join(', ')}) values (${keys.map((_, i) => '$' + (i + 1)).join(', ')})`,
          keys.map((k) => q.insert[k]),
        ));
        return { data: null, error: r.error };
      }
      const cols = q.cols === '*' ? '*' : q.cols.split(',').map((c) => ident(c.trim())).join(', ');
      const sql = `select ${cols} from public.${ident(table)}${q.wo.length ? ' where ' + q.wo.join(' and ') : ''}${q.order ? ' order by ' + ident(q.order) : ''}${q.limit ? ' limit ' + Number(q.limit) : ''}`;
      const r = await run(async () => (await t.db.query(sql, q.werte)).rows);
      if (r.error || q.modus === 'viele') return r;
      if (r.data.length === 1) return { data: r.data[0], error: null };
      if (r.data.length === 0 && q.modus === 'vielleicht') return { data: null, error: null };
      return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    };
    const b = {
      select: (cols = '*') => ((q.cols = cols), b),
      insert: (row) => ((q.insert = row), b),
      eq: (col, v) => (q.werte.push(v), q.wo.push(`${ident(col)} = $${q.werte.length}`), b),
      order: (col) => ((q.order = col), b),
      limit: (n) => ((q.limit = n), b),
      single: () => ((q.modus = 'eine'), b),
      maybeSingle: () => ((q.modus = 'vielleicht'), b),
      then: (res, rej) => ausfuehren().then(res, rej),
    };
    return b;
  };
  const rpc = async (fn, args = {}) => {
    const keys = Object.keys(args);
    log.push({ art: 'rpc', fn, keys });
    const sig = (await t.db.query(
      `select p.proretset, ty.typtype from pg_proc p join pg_type ty on ty.oid = p.prorettype
        where p.pronamespace = 'public'::regnamespace and p.proname = $1 and p.proargnames @> $2::text[]`, [fn, keys],
    )).rows;
    if (sig.length !== 1) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}(${keys.join(', ')}) in the schema cache` } };
    const r = await run(async () => (await t.db.query(
      `select * from public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`, keys.map((k) => args[k]),
    )).rows);
    if (r.error) return r;
    if (sig[0].proretset) return r;
    return { data: sig[0].typtype === 'c' ? r.data[0] : r.data[0]?.[fn], error: null };
  };
  return { from, rpc, auth: { getUser: async () => ({ data: { user: uid ? { id: uid } : null }, error: null }) } };
}

const wurf = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return String(e?.message ?? e);
  }
};
const anzahl = async (t, sql, params) => (await t.db.query(sql, params)).rows[0].n;

// ---------------------------------------------------------------- 0) Dashboard-Quelltext: für genau diese Apps eingehängt
function eingehaengt() {
  marke = '';
  console.log('\n=== Dashboard: Registrierung und Onboarding eingehängt');
  const ids = Object.keys(APPS);
  check('lib/webOnboarding.ts kennt genau die elf Apps', JSON.stringify(Object.keys(WEB_ONBOARDING).sort()) === JSON.stringify([...ids].sort()), Object.keys(WEB_ONBOARDING));
  const reg = liesWeb('src/apps/registry.ts');
  const bloecke = reg.split(/\n  \{\n/).slice(1);
  const mitSignup = bloecke.filter((b) => /^\s*webSignup: true,/m.test(b)).map((b) => b.match(/id: '([a-z]+)'/)?.[1]);
  check('Registry: webSignup genau bei den elf Apps und WinterDex', JSON.stringify([...mitSignup].sort()) === JSON.stringify([...ids, 'winterdex'].sort()), mitSignup);
  for (const id of ids) {
    const src = liesWeb(APPS[id].bereich);
    const f = FETCHER_NAME[APPS[id].modell];
    const soll = f ? `<OrgProvider fetch={${f}}>\n        <OrgGate noOrg={<WebOnboarding fetchOrg={${f}} />}>` : `<OrgProvider>\n        <OrgGate noOrg={<WebOnboarding />}>`;
    check(`${id}: Bereich zeigt ohne Betrieb das Onboarding (mit derselben Betriebs-Abfrage wie der Bereich)`, src.includes(soll));
  }
  const gate = liesWeb('src/components/OrgContext.tsx');
  check('Apps ohne Onboarding: Hinweistext „Lege den Betrieb zuerst in der …-App am Handy an“ unverändert',
    gate.includes('Dieses Konto gehört noch zu keinem Betrieb. Lege den Betrieb zuerst in der{\' \'}') && gate.includes('if (!data && noOrg) return <>{noOrg}</>;'));
  check('SchutzDex: Mitarbeiterzahl wie in der App gelesen („1.000“ = 1000, „8“ = 8, „ca. 8“ / leer = keine Angabe)',
    parseStaffCount('1.000') === 1000 && parseStaffCount(' 8 ') === 8 && parseStaffCount('1 000') === 1000 && parseStaffCount('ca. 8') === null && parseStaffCount('') === null && parseStaffCount('12345678') === null);
}

// ---------------------------------------------------------------- 1) je App gegen das echte Schema
async function pruefe(id) {
  const app = APPS[id];
  const spec = WEB_ONBOARDING[id];
  const fetcher = FETCHER[app.modell];
  marke = `${id}: `;
  const t = await aufbau(app);
  console.log(`\n=== ${id} — ${t.dateien.length} SQL-Dateien aus ${app.dir}/supabase (bis ${t.dateien.at(-1)})`);
  const log = [];
  const A = await t.nutzer('inhaber');
  const sbA = client(t, A, log);

  // ---- Felder der Oberfläche
  check('Formular: Betriebsname ist Pflicht, jedes Feld hat eine Beschriftung, alle Formularwerte des Tests sind Felder',
    spec.fields.some((f) => f.key === 'name' && f.required) && spec.fields.every((f) => f.label) && Object.keys(app.form).every((k) => spec.fields.some((f) => f.key === k)), spec.fields.map((f) => f.key));
  if (app.ohneLand) check(`Länderwahl ohne ${app.ohneLand} (wie in der App)`, !!spec.lands && !spec.lands.includes(app.ohneLand), spec.lands);
  if ('land' in app.erwartet) check('Länderwahl wird angeboten und enthält das Test-Land', !!spec.lands?.includes(app.land), spec.lands);
  else check('keine Länderwahl (die App fragt kein Land ab)', !spec.lands);

  // ---- Betrieb anlegen
  check('frisch registriert: kein Betrieb', (await fetcher(sbA)) === null);
  let e = await wurf(() => spec.create(client(t, null), app.form, app.land));
  check('ohne Anmeldung nimmt der Server nichts an', !!e && (await anzahl(t, `select count(*)::int as n from public.org`)) === 0, e ?? 'kein Fehler');
  e = await wurf(() => spec.create(sbA, app.form, app.land));
  check('Betrieb anlegen als frisch registrierter Nutzer (unter RLS)', e === null, e);
  let ctx = await fetcher(sbA);
  check('danach findet die Betriebs-Abfrage des Bereichs den Betrieb, Rolle Inhaber', !!ctx?.org?.id && ctx.role === 'owner', ctx);
  const zeile = ctx?.org ?? {};
  check('Formularwerte stehen getrimmt in der Betriebs-Zeile', Object.entries(app.erwartet).every(([k, v]) => zeile[k] === v), Object.fromEntries(Object.keys(app.erwartet).map((k) => [k, zeile[k]])));
  e = await wurf(() => spec.create(sbA, { ...app.form, name: 'Zweiter Versuch' }, app.land));
  const eigene = app.modell === 'owner'
    ? await anzahl(t, `select count(*)::int as n from public.org where owner_user_id = $1`, [A])
    : await anzahl(t, `select count(*)::int as n from public.${app.modell === 'kfz' ? 'org_member' : 'membership'} where user_id = $1`, [A]);
  check('zweites Anlegen (Doppeltipp, Antwort verloren): kein Fehler, kein zweiter Betrieb, Name bleibt', e === null && eigene === 1 && (await fetcher(sbA))?.org?.name === app.erwartet.name, { e, eigene });

  // ---- zweiter Inhaber: getrennte Betriebe
  const X = await t.nutzer('fremd');
  const sbX = client(t, X);
  await spec.create(sbX, { ...app.form, name: 'Fremder Betrieb' }, app.land);
  const ctxX = await fetcher(sbX);
  check('zweites Konto bekommt einen eigenen Betrieb und sieht den ersten nicht',
    !!ctxX && ctxX.org.id !== ctx.org.id && ctxX.org.name === 'Fremder Betrieb' && (await sbX.from('org').select('*')).data.length === 1, ctxX?.org?.name);

  // ---- Team-Beitritt
  if (app.modell === 'owner') {
    check('kein Team-Beitritt im Browser (die App hat keinen Server-Weg dafür)', spec.join === undefined);
    const r = await client(t, X).from('org').insert({ owner_user_id: A, name: 'Untergeschoben', land: 'DE' });
    check('RLS: Betrieb für ein fremdes Konto anlegen wird abgelehnt', !!r.error, r.error ?? 'angenommen');
  } else {
    const join = spec.join;
    check('Team-Beitritt wird angeboten (Erklärtext, Feld, Knopf)', !!join?.hint && !!join.label && !!join.button);
    const code = (await t.als(A, async () => (await t.db.query(app.codeSql)).rows[0])).c;
    check('Inhaber hat einen Team-Code', typeof code === 'string' && code.length >= 6, String(code));
    const B = await t.nutzer('mitarbeiter');
    const sbB = client(t, B, log);
    e = await wurf(() => join.run(sbB, 'XX-FALSCH-0000'));
    const text = e && (join.errorText(e, 'DieApp') ?? e);
    check('ungültiger Code: abgelehnt, deutsche Meldung, weiterhin kein Betrieb', !!e && /ungültig/i.test(text) && (await fetcher(sbB)) === null, { e, text });
    e = await wurf(() => join.run(sbB, `  ${code.toLowerCase()} `));
    check('gültiger Code (klein geschrieben, mit Leerzeichen): Beitritt klappt', e === null, e);
    ctx = await fetcher(sbB);
    check(`danach findet die Betriebs-Abfrage den Betrieb des Inhabers, Rolle ${app.rolle}`, ctx?.org?.id === zeile.id && ctx.role === app.rolle, ctx && { org: ctx.org.id, role: ctx.role });
    e = await wurf(() => join.run(sbB, code));
    check('noch einmal mit demselben Code (Antwort war verloren gegangen): kein Fehler, weiter genau ein Betrieb',
      e === null && (await anzahl(t, `select count(*)::int as n from public.${app.modell === 'kfz' ? 'org_member' : 'membership'} where user_id = $1`, [B])) === 1, e);
    // volles Team: Plätze des Betriebs auf den aktuellen Stand begrenzen (1 Mitarbeiter) → der nächste bekommt „team full“
    await t.db.query(`update public.org set seat_limit = 1, seat_override = null where id = $1`, [zeile.id]);
    const C = await t.nutzer('mitarbeiter');
    const sbC = client(t, C);
    e = await wurf(() => join.run(sbC, code));
    check('volles Team: abgelehnt mit „Das Team ist voll …“ samt App-Namen', !!e && /^Das Team ist voll\. .*DieApp/.test(join.errorText(e, 'DieApp') ?? ''), { e, text: e && join.errorText(e, 'DieApp') });
    check('… und das Konto bleibt ohne Betrieb', (await fetcher(sbC)) === null);
    check('„removed from team“ wird übersetzt, Unbekanntes bleibt wörtlich (null)', /entfernt/.test(join.errorText('removed from team', 'DieApp') ?? '') && join.errorText('irgendwas anderes', 'DieApp') === null);
  }

  // ---- derselbe Server-Weg wie die Android-App
  const quelle = readFileSync(path.join(app.repo, app.quelle), 'utf8');
  const rpcs = [...new Map(log.filter((l) => l.art === 'rpc').map((l) => [l.fn, l])).values()];
  for (const r of rpcs) {
    const stelle = quelle.indexOf(`rpc('${r.fn}'`);
    const umfeld = stelle < 0 ? '' : quelle.slice(stelle, stelle + 400);
    check(`App ruft ${r.fn}(${r.keys.join(', ')}) genauso auf (${app.dir}/${app.quelle})`, stelle >= 0 && r.keys.every((k) => umfeld.includes(k)), umfeld.slice(0, 120));
  }
  for (const ins of log.filter((l) => l.art === 'insert').slice(0, 1)) {
    const stelle = quelle.indexOf(`.from('${ins.table}')\n    .insert({`);
    const umfeld = stelle < 0 ? '' : quelle.slice(stelle, quelle.indexOf('})', stelle));
    check(`App schreibt ${ins.table} mit denselben Spalten (${ins.keys.join(', ')})`, stelle >= 0 && ins.keys.every((k) => new RegExp(`\\b${k}\\b`).test(umfeld)) && (umfeld.match(/^\s+[a-z_]+[:,]/gm) ?? []).length === ins.keys.length, umfeld);
  }
  check(app.modell === 'owner' ? 'benutzt wurde genau ein INSERT, keine Server-Funktion' : 'benutzt wurden genau zwei Server-Funktionen (anlegen, beitreten), kein direkter INSERT',
    app.modell === 'owner' ? rpcs.length === 0 && log.some((l) => l.art === 'insert') : rpcs.length === 2 && !log.some((l) => l.art === 'insert'), rpcs.map((r) => r.fn));
  await t.db.close();
}

eingehaengt();
for (const id of dran) {
  try {
    await pruefe(id);
  } catch (e) {
    marke = `${id}: `;
    check('Ablauf ohne Abbruch', false, String(e?.stack ?? e).slice(0, 600));
  }
}
console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
