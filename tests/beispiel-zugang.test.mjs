// Beispiel-Zugang (docs/beispiel-zugang.md) — nur Dev-Server, für Bilder der Landing-Seiten und zum Durchklicken.
//   [1] Speicher-Client (src/dev/beispiel/client.ts): Filter, Sortierung, Seiten, count/head, single, Schreiben, RPC,
//       unbekannte Tabellen/RPCs → leere Antwort statt Fehler, keine Server-Anfrage
//       JSON-Pfade wie PostgREST (data->>title) für TourDex/CraftDex/DokuDex
//   [2] Beispieldaten FeuerDex/SpielDex/RegalDex/GerüstDex/ToreDex/LeiterDex mit den ECHTEN Abfragen der Übersicht
//       (src/<app>/api.ts, lib/pruefExport.ts): Kennzahlen und Fälligkeit wie in den Bildern, keine Karte „Erste Schritte“.
//       GurtDex/HebeDex/PrüfDex/SchutzDex: tests/beispiel-pruefapps.test.mjs, KfzDex/TourDex/CraftDex/DokuDex:
//       tests/beispiel-weitere.test.mjs
//   [3] Beispieldaten passen zum Schema der App (Spalten aus <App>/supabase/*.sql; fehlt das Repo: übersprungen)
//   [4] Abo im Beispielmodus: RevenueCat-Antwort ergibt „Pro aktiv“ (src/lib/abo.ts)
//   [5] Nur Dev: Schalter hinter import.meta.env.DEV, kein anderer Code bindet src/dev/beispiel ein, ?beispiel statt ?demo
//   [6] Produktions-Build (falls dist/ gebaut): Merkwort und Speicher-Schlüssel kommen in dist/ NICHT vor
//
//   Aufruf:  node tests/beispiel-zugang.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const DESKTOP = path.resolve(ROOT, '..');
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
// Kein Netz: jede fetch-Anfrage wäre ein Fehler des Speicher-Clients
let netz = 0;
globalThis.fetch = async () => {
  netz++;
  throw new Error('kein Netz im Test');
};
const web = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const lies = (f) => readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0;
let bad = 0;
const check = (name, cond, detail) => {
  cond ? ok++ : bad++;
  console.log(`  ${cond ? 'ok  ' : 'FEHL'}  ${name}${cond || detail === undefined ? '' : `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};
const teil = (t) => console.log(`\n[${t}]`);
// Konsole ruhig halten (Meldungen des Speicher-Clients prüfen wir über meldungen)
const stumm = { info: console.info, warn: console.warn };
console.info = () => {};
console.warn = () => {};

const C = await web('src/dev/beispiel/client.ts');

// ---------------------------------------------------------------------------------------------------------------- [1]
teil('1 Speicher-Client');
{
  const daten = {
    app: 'testdex',
    nutzer: { id: 'u1', email: 'test@beispiel.example' },
    tabellen: {
      org: [{ id: 'o1', name: 'Test', land: 'DE', created_at: '2025-01-01T08:00:00.000Z' }],
      membership: [{ id: 'm1', org_id: 'o1', user_id: 'u1', role: 'owner', created_at: '2025-01-01T08:00:00.000Z' }],
      item: [
        { id: 'a', name: 'Beta', n: 2, aktiv: true, tag: '2026-11-01', at: '2026-11-20T10:00:00.000Z', liste: ['x', 'y'], x: null },
        { id: 'b', name: 'Alpha', n: 10, aktiv: false, tag: '2026-10-01', at: '2026-11-21T10:00:00.000Z', liste: ['y'], x: 1 },
        { id: 'c', name: 'Gamma', n: 5, aktiv: true, tag: '2026-12-01', at: '2026-11-19T10:00:00.000Z', liste: [], x: null },
      ],
    },
  };
  const sb = C.beispielClient(daten);
  const ids = (r) => (r.data ?? []).map((z) => z.id).join(',');
  check('select * liefert alle Zeilen', ids(await sb.from('item').select('*')) === 'a,b,c');
  check('eq/neq', ids(await sb.from('item').select('id').eq('aktiv', true)) === 'a,c' && ids(await sb.from('item').select('id').neq('name', 'Beta')) === 'b,c');
  check('gt/gte/lt/lte (Zahl)', ids(await sb.from('item').select('id').gt('n', 2)) === 'b,c' && ids(await sb.from('item').select('id').lte('n', 5)) === 'a,c');
  check('gte/lt (Zeitpunkt ISO)', ids(await sb.from('item').select('id').gte('at', '2026-11-20T00:00:00.000Z').lt('at', '2026-11-21T00:00:00Z')) === 'a');
  check('in / is null / not is null', ids(await sb.from('item').select('id').in('id', ['a', 'c'])) === 'a,c' && ids(await sb.from('item').select('id').is('x', null)) === 'a,c' && ids(await sb.from('item').select('id').not('x', 'is', null)) === 'b');
  check('or (is.null, lt)', ids(await sb.from('item').select('id').or('x.is.null,n.lt.3')) === 'a,c');
  check('contains (Liste)', ids(await sb.from('item').select('id').contains('liste', ['y'])) === 'a,b');
  check('ilike', ids(await sb.from('item').select('id').ilike('name', '%a')) === 'a,b,c' && ids(await sb.from('item').select('id').ilike('name', 'al%')) === 'b');
  check('order mehrfach + absteigend', ids(await sb.from('item').select('id').order('aktiv', { ascending: false }).order('name')) === 'a,c,b');
  check('order Zeitpunkt absteigend + limit', ids(await sb.from('item').select('id').order('at', { ascending: false }).limit(2)) === 'b,a');
  check('range (Seite 2 leer → fetchAllRows endet)', ids(await sb.from('item').select('id').order('id').range(1, 2)) === 'b,c' && (await sb.from('item').select('id').range(3, 5)).data.length === 0);
  const head = await sb.from('item').select('id', { count: 'exact', head: true }).eq('aktiv', true);
  check('count + head: Anzahl ohne Daten', head.count === 2 && head.data === null && head.error === null, head);
  const proj = (await sb.from('item').select('id, name, fehlt').eq('id', 'a')).data[0];
  check('Spaltenauswahl (fehlende Spalte = null)', JSON.stringify(proj) === '{"id":"a","name":"Beta","fehlt":null}', proj);
  const one = await sb.from('item').select('*').eq('id', 'b').single();
  const none = await sb.from('item').select('*').eq('id', 'zz').maybeSingle();
  const many = await sb.from('item').select('*').single();
  check('single / maybeSingle / mehrere → PGRST116', one.data?.name === 'Alpha' && none.data === null && !none.error && many.error?.code === 'PGRST116');
  const unbekannt = await sb.from('gibtsnicht').select('*').eq('a', 1);
  check('unbekannte Tabelle → leere Liste, kein Fehler, Meldung', Array.isArray(unbekannt.data) && unbekannt.data.length === 0 && !unbekannt.error && C.meldungen.some((m) => m.includes('gibtsnicht')));
  const rpcU = await sb.rpc('gibts_nicht', { p: 1 });
  check('unbekannte RPC → null, kein Fehler, Meldung', rpcU.data === null && !rpcU.error && C.meldungen.some((m) => m.includes('gibts_nicht')));
  check('Standard-RPC org_pro_active = true (keine Paywall)', (await sb.rpc('org_pro_active')).data === true);
  const tc = await sb.rpc('team_code', { p_renew: false });
  check('team_code / sync_seat_limit / list_members', Array.isArray(tc.data) && /^TE-/.test(tc.data[0].code) && (await sb.rpc('sync_seat_limit')).data[0].members === 1 && (await sb.rpc('list_members')).data[0].email === 'test@beispiel.example');
  // Schreiben nur im Speicher
  await sb.from('item').insert({ id: 'd', name: 'Delta', n: 1, aktiv: true });
  const dup = await sb.from('item').insert({ id: 'd', name: 'Delta' });
  check('insert + doppelte id → 23505', ids(await sb.from('item').select('id').eq('name', 'Delta')) === 'd' && dup.error?.code === '23505');
  const back = await sb.from('item').update({ n: 7 }).eq('id', 'd').select('id, n').single();
  check('update … select().single()', back.data?.n === 7, back);
  await sb.from('item').upsert({ id: 'd', name: 'Delta2' });
  await sb.from('item').upsert([{ id: 'e', name: 'Epsilon' }]);
  check('upsert ändert / legt an', ids(await sb.from('item').select('id').in('name', ['Delta2', 'Epsilon'])) === 'd,e');
  await sb.from('item').delete().in('id', ['d', 'e']);
  check('delete', ids(await sb.from('item').select('id')) === 'a,b,c');
  const sb2 = C.beispielClient(daten);
  check('jede Client-Kopie hat eigenen Speicher (Ausgangsdaten unverändert)', daten.tabellen.item.length === 3 && (await sb2.from('item').select('id')).data.length === 3);
  const s = await sb.auth.getSession();
  const u = await sb.auth.getUser();
  check('auth: feste Beispiel-Sitzung', s.data.session?.user.email === 'test@beispiel.example' && u.data.user?.id === 'u1');
  const anders = await sb.auth.signInWithPassword({ email: 'x', password: 'y' });
  check('auth: anderes → Fehler „nicht möglich“ statt Absturz', !!anders.error);
  const signed = await sb.storage.from('photos').createSignedUrls(['a/b.jpg'], 60);
  check('storage: ohne Beispielbild leer, ohne Absturz', signed.data[0].signedUrl === '' && !signed.error);
  let kanal = '';
  sb.channel('x').on('postgres_changes', {}, () => {}).subscribe((st) => (kanal = st));
  await new Promise((r) => setTimeout(r, 5));
  check('channel: stumm, meldet SUBSCRIBED', kanal === 'SUBSCRIBED');
  check('keine einzige Netz-Anfrage', netz === 0, netz);
  const z = { data: { a: { b: 2, c: 'x' }, ok: true }, deleted: false };
  check('JSON-Pfade: ->> Text, -> JSON, verschachtelt, fehlend = null', C.feld(z, 'data->a->>b') === '2' && C.feld(z, 'data->a->b') === 2 && C.feld(z, 'data->ok') === true && C.feld(z, 'data->fehlt->>x') === null && C.feld(z, 'deleted') === false);
  const j = C.beispielClient({ app: 'testdex', nutzer: { id: 'u1', email: 'test@beispiel.example' }, tabellen: { doc: [
    { id: '1', data: { title: 'B', t: '2026-11-02' } }, { id: '2', data: { title: 'A', t: '2026-11-05' } }, { id: '3', data: { title: 'C', t: '2026-10-01' } },
  ] } });
  const jr = await j.from('doc').select('id, title:data->>title').gte('data->>t', '2026-11-01').order('data->>title');
  check('select/Filter/Sortierung über JSON-Pfad', JSON.stringify(jr.data) === '[{"id":"2","title":"A"},{"id":"1","title":"B"}]', jr.data);
}

// ---------------------------------------------------------------------------------------------------------------- [2]
const DAY = 86_400_000;
const PX = await web('src/lib/pruefExport.ts');
const ES = await web('src/lib/ersteSchritte.ts');
const orgApi = await web('src/lib/orgApi.ts');

async function uebersicht(app, daten) {
  const sb = C.beispielClient(daten);
  const ctx = await orgApi.fetchOrgContext(sb);
  return { sb, ctx };
}

teil('2a FeuerDex — Übersicht wie im Bild');
{
  const { daten } = await web('src/dev/beispiel/feuerdex.ts');
  const api = await web('src/feuerdex/api.ts');
  const { FEUERDEX_EXPORT } = await web('src/feuerdex/exportLists.ts');
  const { sb, ctx } = await uebersicht('feuerdex', daten);
  check('Betrieb + Rolle Inhaber', ctx?.org.name === 'Musterbetrieb GmbH' && ctx.role === 'owner', ctx);
  const [sites, units, meta, recent, open] = await Promise.all([
    api.fetchSites(sb),
    api.fetchExtinguishers(sb),
    api.fetchInspectionMeta(sb),
    api.fetchInspections(sb, { limit: 10 }),
    api.fetchDefects(sb, { status: 'open' }),
  ]);
  const valid = meta.filter((i) => !i.canceled);
  const insp30 = valid.filter((i) => Date.now() - Date.parse(i.started_at) <= 30 * DAY);
  check('Aktive Standorte 6 von 7', sites.filter((s) => s.active).length === 6 && sites.length === 7);
  check('Prüfungen 30 Tage = 29 (ohne Storno)', insp30.length === 29, insp30.length);
  check('Offene Mängel 2, davon 1× Rot', open.length === 2 && open.filter((d) => d.severity === 'red').length === 1);
  const due = PX.dueOverview(FEUERDEX_EXPORT, { org: ctx.org, sites, units, inspections: meta, openDefects: open });
  check('Prüfung fällig 3 · 4 bald · 1 gesperrt · von 30', due.due === 3 && due.soon === 4 && due.blocked === 1 && due.total === 30, { due: due.due, soon: due.soon, blocked: due.blocked, total: due.total });
  check('Tabelle „Fällige Prüfungen“: 8 Zeilen, keine „… und N weitere“', due.list.length === 8);
  check('Reihenfolge gesperrt → überfällig → nie → bald', due.list.map((r) => r.state).join(',') === 'blocked,overdue,overdue,never,soon,soon,soon,soon', due.list.map((r) => r.state));
  check('Letzte Prüfungen: 10, jüngste oben, beide Prüfarten unter den ersten zwei', recent.length === 10 && recent[0].started_at >= recent[1].started_at && new Set(recent.slice(0, 2).map((r) => r.type)).size === 2);
  check('nichts liegt in der Zukunft', [...meta, ...recent].every((i) => Date.parse(i.started_at) < Date.now()));
  const st = ES.startSteps({ stock: units.length, first: valid.length > 0, members: 3, team: true });
  check('keine Karte „Erste Schritte“', !ES.cardVisible({ owner: true, hidden: false, state: st, newOrg: ES.isNewOrg(ctx.org.created_at) }) && !ES.isNewOrg(ctx.org.created_at));
  const det = await api.fetchInspectionWithPhotos(sb, recent[0].id);
  check('Prüfung im Detail ladbar (Fotos/GPS-Nachweis ohne Fehler)', det.id === recent[0].id);
}

teil('2b SpielDex — Übersicht wie im Bild');
{
  const { daten } = await web('src/dev/beispiel/spieldex.ts');
  const api = await web('src/spieldex/api.ts');
  const { SPIELDEX_EXPORT } = await web('src/spieldex/exportLists.ts');
  const { sb, ctx } = await uebersicht('spieldex', daten);
  check('Betrieb Gemeinde Musterstadt, Inhaber', ctx?.org.name === 'Gemeinde Musterstadt' && ctx.role === 'owner');
  const [pgs, meta, recent, open] = await Promise.all([
    api.fetchPlaygrounds(sb),
    api.fetchInspectionMeta(sb),
    api.fetchInspections(sb, { limit: 10 }),
    api.fetchDefects(sb, { status: 'open' }),
  ]);
  const valid = meta.filter((i) => !i.canceled);
  const insp7 = valid.filter((i) => Date.now() - Date.parse(i.started_at) <= 7 * DAY);
  check('Aktive Spielplätze 12 von 14', pgs.filter((p) => p.active).length === 12 && pgs.length === 14);
  check('Kontrollen 7 Tage = 13', insp7.length === 13, insp7.length);
  check('Offene Mängel 4, davon 1× Gefahr', open.length === 4 && open.filter((d) => d.severity === 'danger').length === 1);
  const due = PX.dueOverview(SPIELDEX_EXPORT, { org: ctx.org, sites: pgs, units: [], inspections: meta, openDefects: open });
  check('Kontrolle fällig 2 · 3 bald · 1 gesperrt · von 12', due.due === 2 && due.soon === 3 && due.blocked === 1 && due.total === 12, { due: due.due, soon: due.soon, blocked: due.blocked, total: due.total });
  check('Reihenfolge gesperrt → überfällig → bald', due.list.map((r) => r.state).join(',') === 'blocked,overdue,overdue,soon,soon,soon', due.list.map((r) => r.state));
  check('Letzte Kontrollen: alle drei Kontrollarten unter den ersten drei', new Set(recent.slice(0, 3).map((r) => r.type)).size === 3, recent.slice(0, 3).map((r) => r.type));
  check('nichts liegt in der Zukunft', [...meta, ...recent].every((i) => Date.parse(i.started_at) < Date.now()));
  const st = ES.startSteps({ stock: pgs.length, first: valid.length > 0, members: 3, team: true });
  check('keine Karte „Erste Schritte“', !ES.cardVisible({ owner: true, hidden: false, state: st, newOrg: ES.isNewOrg(ctx.org.created_at) }));
  check('Gemeldet von/Behoben: nur erfundene Kürzel (Initial + Nachname)', [...open].every((d) => /^[A-Z]\. [A-ZÄÖÜ][a-zäöüß]+$/.test(String(d.reporter_name))));
}

for (const [teilName, app, a] of [
  ['2c RegalDex — Übersicht wie im Bild', 'regaldex', { name: 'Musterlogistik GmbH', sites: 'fetchWarehouses', units: 'fetchRacks', defects: 'fetchDamages', exp: 'REGALDEX_EXPORT', tage: 7, orte: [8, 9], insp: 9, offen: 3, due: [2, 2, 1, 8], folge: 'blocked,overdue,never,soon,soon', orts: true }],
  ['2d GerüstDex — Übersicht wie im Bild', 'geruestdex', { name: 'Musterbau GmbH', sites: 'fetchSites', units: 'fetchScaffolds', defects: 'fetchDamages', exp: 'GERUESTDEX_EXPORT', tage: 30, orte: [7, 9], inspMin: 90, offen: 3, due: [2, 3, 1, 7], folge: 'blocked,overdue,never,soon,soon,soon', orts: true }],
  ['2e ToreDex — Übersicht wie im Bild', 'toredex', { name: 'Muster Immobilien GmbH', sites: 'fetchSites', units: 'fetchGates', defects: 'fetchDefects', exp: 'TOREDEX_EXPORT', tage: 30, orte: [6, 7], insp: 28, offen: 3, due: [3, 4, 1, 26], folge: 'blocked,overdue,overdue,never,soon,soon,soon,soon' }],
  ['2f LeiterDex — Übersicht wie im Bild', 'leiterdex', { name: 'Muster Haustechnik GmbH', sites: 'fetchSites', units: 'fetchLadders', defects: 'fetchDefects', exp: 'LEITERDEX_EXPORT', tage: 30, orte: [6, 7], insp: 21, offen: 3, due: [2, 4, 1, 19], folge: 'blocked,overdue,never,soon,soon,soon,soon' }],
]) {
  teil(teilName);
  const { daten } = await web(`src/dev/beispiel/${app}.ts`);
  const api = await web(`src/${app}/api.ts`);
  const spec = (await web(`src/${app}/exportLists.ts`))[a.exp];
  const { sb, ctx } = await uebersicht(app, daten);
  check(`Betrieb ${a.name}, Inhaber`, ctx?.org.name === a.name && ctx.role === 'owner', ctx);
  const [sites, units, meta, recent, open] = await Promise.all([
    api[a.sites](sb),
    api[a.units](sb),
    api.fetchInspectionMeta(sb),
    api.fetchInspections(sb, { limit: 10 }),
    api[a.defects](sb, { status: 'open' }),
  ]);
  const valid = meta.filter((i) => !i.canceled);
  const insp = valid.filter((i) => Date.now() - Date.parse(i.started_at) <= a.tage * DAY);
  check(`Aktive Orte ${a.orte[0]} von ${a.orte[1]}`, sites.filter((s) => s.active).length === a.orte[0] && sites.length === a.orte[1]);
  if (a.insp !== undefined) check(`Prüfungen ${a.tage} Tage = ${a.insp} (ohne Storno)`, insp.length === a.insp, insp.length);
  else check(`Prüfungen ${a.tage} Tage ≥ ${a.inspMin} (arbeitstäglich)`, insp.length >= a.inspMin, insp.length);
  check(`Offene Mängel ${a.offen}, davon 1× Rot`, open.length === a.offen && open.filter((d) => d.severity === 'red').length === 1);
  const due = PX.dueOverview(spec, { org: ctx.org, sites, units: a.orts ? units : units, inspections: meta, openDefects: open });
  const [d, s, b, t] = a.due;
  check(`fällig ${d} · ${s} bald · ${b} gesperrt · von ${t}`, due.due === d && due.soon === s && due.blocked === b && due.total === t, { due: due.due, soon: due.soon, blocked: due.blocked, total: due.total });
  check('Reihenfolge gesperrt → überfällig → nie → bald, höchstens 8 Zeilen', due.list.map((r) => r.state).join(',') === a.folge && due.list.length <= 8, due.list.map((r) => r.state));
  check(`Letzte Prüfungen: 10, beide Prüfarten unter den ersten drei (${app})`, recent.length === 10 && new Set(recent.slice(0, 3).map((r) => r.type)).size === 2, recent.slice(0, 4).map((r) => `${r.started_at} ${r.type}`));
  check('nichts liegt in der Zukunft', [...meta, ...recent].every((i) => Date.parse(i.started_at) < Date.now()));
  const st = ES.startSteps({ stock: a.orts ? sites.length : units.length, first: valid.length > 0, members: 3, team: true });
  check('keine Karte „Erste Schritte“', !ES.cardVisible({ owner: true, hidden: false, state: st, newOrg: ES.isNewOrg(ctx.org.created_at) }));
  check('Gemeldet von: nur erfundene Kürzel (Initial + Nachname)', open.every((x) => /^[A-Z]\. [A-ZÄÖÜ][a-zäöüß]+$/.test(String(x.reporter_name))));
  const det = await api.fetchInspectionWithPhotos(sb, recent[0].id);
  check('Prüfung im Detail ladbar', det.id === recent[0].id);
}

// ---------------------------------------------------------------------------------------------------------------- [3]
teil('3 Beispieldaten passen zum Schema der App');
function spaltenAus(repo) {
  const dir = path.join(repo, 'supabase');
  const dateien = [];
  const sammle = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) {
        if (f !== 'tests' && f !== 'node_modules' && f !== 'email-templates') sammle(p);
      } else if (f.endsWith('.sql')) dateien.push(p);
    }
  };
  sammle(dir);
  const spalten = new Map();
  const add = (t, c) => (spalten.get(t) ?? spalten.set(t, new Set()).get(t)).add(c);
  for (const f of dateien) {
    const sql = readFileSync(f, 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
      for (const z of m[2].split('\n')) {
        const c = /^\s*([a-z_][a-z0-9_]*)\s+(uuid|text|boolean|double|integer|int|bigint|smallint|numeric|real|timestamptz|timestamp|date|jsonb|json)\b/i.exec(z);
        if (c) add(m[1], c[1]);
      }
    }
    for (const m of sql.matchAll(/alter table (?:if exists )?(?:only )?(?:public\.)?(\w+)\s+([\s\S]*?);/gi)) {
      for (const a of m[2].matchAll(/add column (?:if not exists )?([a-z_][a-z0-9_]*)/gi)) add(m[1], a[1]);
    }
  }
  return spalten;
}
// Alle Apps mit Beispieldaten (Ordnername des App-Repos auf dem Desktop); SchutzDex, KfzDex, TourDex und CraftDex haben kein
// schema.sql, nur Migrationen — spaltenAus() liest alle *.sql unter supabase/.
const APPS = [
  ['feuerdex', 'FeuerDex'], ['spieldex', 'SpielDex'], ['regaldex', 'RegalDex'], ['geruestdex', 'GeruestDex'],
  ['toredex', 'ToreDex'], ['leiterdex', 'LeiterDex'], ['gurtdex', 'GurtDex'], ['hebedex', 'HebeDex'], ['pruefdex', 'PruefDex'],
  ['schutzdex', 'SchutzDex'], ['kfzdex', 'KfzDex'], ['tourdex', 'TourDex'], ['craftdex', 'CraftDex'], ['dokudex', 'DokuDex'],
];
for (const [app, repoName] of APPS) {
  const repo = process.env[`${repoName.toUpperCase()}_REPO`] ?? path.join(DESKTOP, repoName);
  if (!existsSync(path.join(repo, 'supabase'))) {
    console.log(`  —     ${repoName}: Repo nicht gefunden (${repo}) — Schema-Abgleich übersprungen`);
    continue;
  }
  const spalten = spaltenAus(repo);
  const { daten } = await web(`src/dev/beispiel/${app}.ts`);
  for (const [tab, zeilen] of Object.entries(daten.tabellen)) {
    const soll = spalten.get(tab);
    const fremd = [...new Set(zeilen.flatMap((z) => Object.keys(z)))].filter((k) => !soll?.has(k));
    check(`${repoName}: Tabelle ${tab} (${zeilen.length} Zeilen) nur mit echten Spalten`, !!soll && fremd.length === 0, soll ? fremd : 'Tabelle fehlt im Schema');
  }
}

// ---------------------------------------------------------------------------------------------------------------- [4]
teil('4 Abo im Beispielmodus: Pro aktiv');
{
  const N = await web('src/dev/beispiel/netz.ts');
  const antwort = N.rcAntwort('feuerdex');
  const ent = antwort.subscriber.entitlements.pro;
  check('Entitlement pro aktiv (Ablauf in der Zukunft)', Date.parse(ent.expires_date) > Date.now());
  check('Produkt wie im Store (feuerdex_pro_yearly), Google Play, verlängert sich', ent.product_identifier === 'feuerdex_pro_yearly' && antwort.subscriber.subscriptions.feuerdex_pro_yearly.store === 'play_store' && antwort.subscriber.subscriptions.feuerdex_pro_yearly.unsubscribe_detected_at === null);
  const src = lies('src/dev/beispiel/netz.ts');
  check('Suite-Server wird beantwortet, andere Supabase-Server gesperrt (503)', /suite-status/.test(src) && /supabase\\\.co/.test(src) && /503/.test(src));
}

// ---------------------------------------------------------------------------------------------------------------- [5]
teil('5 Nur im Dev-Server');
{
  const ctx = lies('src/auth/AppAuthContext.tsx');
  check('lazy import nur hinter import.meta.env.DEV', /const BeispielZugang = import\.meta\.env\.DEV\s*\?\s*lazy\(\(\) => import\('\.\.\/dev\/beispiel\/zugang'\)/.test(ctx));
  check('Schalter nur hinter import.meta.env.DEV aufgerufen', /if \(import\.meta\.env\.DEV && BeispielZugang && beispielAn\(app\.id\)\)/.test(ctx) && (ctx.match(/beispielAn\(/g) ?? []).length === 1);
  const alle = [];
  const sammle = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) sammle(p);
      else if (/\.(ts|tsx)$/.test(f)) alle.push(p);
    }
  };
  sammle(path.join(ROOT, 'src'));
  const einbinder = alle
    .filter((p) => !p.includes(`${path.sep}dev${path.sep}beispiel${path.sep}`))
    .filter((p) => /dev\/beispiel/.test(readFileSync(p, 'utf8')))
    .map((p) => path.relative(ROOT, p).replace(/\\/g, '/'));
  check('nur AppAuthContext bindet src/dev/beispiel ein', einbinder.join(',') === 'src/auth/AppAuthContext.tsx', einbinder);
  const sch = lies('src/dev/beispiel/schalter.ts');
  check('Adresszusatz ?beispiel (nicht ?demo — Vor-Ort-Demo der Prüf-Apps)', /has\('beispiel'\)/.test(sch) && !/has\('demo'\)/.test(sch));
  const fehlt = APPS.map(([a]) => a).filter((a) => !sch.includes(`${a}: () => import('./${a}')`));
  check(`Beispieldaten für alle ${APPS.length} Apps eingetragen`, fehlt.length === 0, fehlt);
  const daten = APPS.map(([a]) => lies(`src/dev/beispiel/${a}.ts`)).join('\n');
  check('keine echten E-Mail-Domains in den Beispieldaten (nur .example)', [...daten.matchAll(/[\w.-]+@([\w.-]+)/g)].every((m) => m[1].endsWith('.example')));
}

// ---------------------------------------------------------------------------------------------------------------- [6]
teil('6 Produktions-Build ohne Beispiel-Zugang');
{
  const dist = path.join(ROOT, 'dist');
  if (!existsSync(path.join(dist, 'index.html'))) {
    console.log('  —     dist/ nicht gebaut — erst „npm run build“, dann diesen Test erneut');
  } else {
    const dateien = [];
    const sammle = (d) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) sammle(p);
        else if (/\.(js|css|html|json|webmanifest|map)$/.test(f)) dateien.push(p);
      }
    };
    sammle(dist);
    const WOERTER = [
      C.MERKWORT, 'dex-beispiel-zugang', 'Musterbetrieb GmbH', 'bauhof@musterstadt.example',
      // je eine Kennung aus den übrigen Beispieldaten (nur dort, nicht in anderen Demos)
      'Musterlogistik GmbH', 'Muster Immobilien GmbH', 'Muster Dachtechnik GmbH', 'Muster Stahlbau GmbH', 'Elektro Muster GmbH',
      'Muster Holzbau GmbH', 'MU-EL 240', 'Einbauschrank Dachschräge',
    ];
    const treffer = dateien.flatMap((p) => {
      const s = readFileSync(p, 'utf8');
      return WOERTER.filter((w) => s.includes(w)).map((w) => `${path.relative(ROOT, p)}: ${w}`);
    });
    check(`dist/ (${dateien.length} Dateien) ohne Merkwort „${C.MERKWORT}“, Speicher-Schlüssel und Beispieldaten`, dateien.length > 0 && treffer.length === 0, treffer);
  }
}

console.info = stumm.info;
console.warn = stumm.warn;
console.log(`\n${bad === 0 ? 'ALLES GRÜN: ' : ''}${ok} ok, ${bad} Fehler`);
process.exit(bad === 0 ? 0 : 1);
