// Beispiel-Zugang (docs/beispiel-zugang.md): Beispieldaten GurtDex/HebeDex/PrüfDex/SchutzDex mit den ECHTEN Abfragen der
// Übersicht (wie Teil 2/3 von tests/beispiel-zugang.test.mjs): Kennzahlen wie in den Landing-Bildern, Schema-Abgleich mit
// <App>/supabase/*.sql (fehlt das Repo: übersprungen), Personen nur als Initial + Nachname, nichts in der Zukunft.
//   Aufruf:  node tests/beispiel-pruefapps.test.mjs [gurtdex|hebedex|pruefdex|schutzdex …]
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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
let netz = 0;
globalThis.fetch = async () => {
  netz++;
  throw new Error('kein Netz');
};
const web = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
let ok = 0;
let bad = 0;
const check = (name, cond, detail) => {
  cond ? ok++ : bad++;
  console.log(`  ${cond ? 'ok  ' : 'FEHL'}  ${name}${cond || detail === undefined ? '' : `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};
const info = (name, v) => console.log(`  ·     ${name}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
const stumm = { info: console.info, warn: console.warn };
console.info = () => {};
console.warn = () => {};

const C = await web('src/dev/beispiel/client.ts');
const PX = await web('src/lib/pruefExport.ts');
const ES = await web('src/lib/ersteSchritte.ts');
const orgApi = await web('src/lib/orgApi.ts');
const DAY = 86_400_000;
const nur = process.argv.slice(2);
const will = (a) => nur.length === 0 || nur.includes(a);
const personen = (namen) => namen.filter(Boolean).every((n) => /^[A-Z]\. [A-ZÄÖÜ][a-zäöüß]+$/.test(String(n)));

async function pruefApp(app, apiDatei, exportDatei, exportName, unitsFn, erwart) {
  console.log(`\n[${app}]`);
  const { daten } = await web(`src/dev/beispiel/${app}.ts`);
  const api = await web(apiDatei);
  const spec = (await web(exportDatei))[exportName];
  const sb = C.beispielClient(daten);
  const ctx = await orgApi.fetchOrgContext(sb);
  check('Betrieb + Rolle Inhaber', ctx?.org.name === erwart.name && ctx.role === 'owner', ctx);
  const [sites, units, meta, recent, open] = await Promise.all([
    api.fetchSites(sb),
    unitsFn(api, sb),
    api.fetchInspectionMeta(sb),
    api.fetchInspections(sb, { limit: 10 }),
    api.fetchDefects(sb, { status: 'open' }),
  ]);
  const valid = meta.filter((i) => !i.canceled);
  const insp30 = valid.filter((i) => Date.now() - Date.parse(i.started_at) <= 30 * DAY);
  info('Standorte aktiv/gesamt', `${sites.filter((s) => s.active).length}/${sites.length}`);
  info('Prüfungen 30 Tage', insp30.length);
  info('Offene Mängel / rot', `${open.length} / ${open.filter((d) => d.severity === 'red').length}`);
  const due = PX.dueOverview(spec, { org: ctx.org, sites, units, inspections: meta, openDefects: open });
  info('fällig/bald/gesperrt/gesamt', [due.due, due.soon, due.blocked, due.total]);
  info('Spalte', due.mainTitle + (due.secondTitle ? ` | ${due.secondTitle}` : ''));
  for (const r of due.list) info(`  ${r.state.padEnd(8)}`, `${r.name} · ${r.place} · ${r.alert ?? ''} · Rest ${r.stand.main.daysLeft} ${r.stand.second ? `· 2.: ${r.stand.second.state} ${r.stand.second.daysLeft}` : ''}`);
  for (const r of recent.slice(0, 4)) info('  letzte', `${r.started_at} ${r.type} ${r.canceled ? 'STORNO' : ''}`);
  check(`Kennzahlen ${JSON.stringify(erwart.kpi)}`, JSON.stringify([due.due, due.soon, due.blocked, due.total]) === JSON.stringify(erwart.kpi));
  check('Tabelle höchstens 8 Zeilen', due.list.length <= 8, due.list.length);
  check(`Prüfungen 30 Tage = ${erwart.insp30}`, insp30.length === erwart.insp30, insp30.length);
  check('nichts liegt in der Zukunft', [...meta, ...recent].every((i) => Date.parse(i.started_at) < Date.now()));
  check('Mängel-Zeitpunkte nicht in der Zukunft', daten.tabellen.defect.every((d) => Date.parse(d.created_at) < Date.now() && (!d.resolved_at || Date.parse(d.resolved_at) < Date.now())));
  const st = ES.startSteps({ stock: units.length, first: valid.length > 0, members: 3, team: true });
  check('keine Karte „Erste Schritte“', !ES.cardVisible({ owner: true, hidden: false, state: st, newOrg: ES.isNewOrg(ctx.org.created_at) }) && !ES.isNewOrg(ctx.org.created_at));
  const det = await api.fetchInspectionWithPhotos(sb, recent[0].id);
  check('Prüfung im Detail ladbar', det.id === recent[0].id);
  check('Personen nur Initial + Nachname', personen([...daten.tabellen.inspection.map((i) => i.inspector_name), ...daten.tabellen.defect.flatMap((d) => [d.reporter_name, d.resolver_name])]));
  return { daten, due, open };
}

// ---------------------------------------------------------------------------------------------------------------- Schema
function spaltenAus(dir) {
  const dateien = [];
  const sammle = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) {
        if (f !== 'tests' && f !== 'node_modules' && f !== 'email-templates' && f !== 'test') sammle(p);
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
async function schema(app, repoName) {
  const dir = path.join(DESKTOP, repoName, 'supabase');
  if (!existsSync(dir)) return console.log(`  —     ${repoName}: Repo fehlt`);
  const spalten = spaltenAus(dir);
  const { daten } = await web(`src/dev/beispiel/${app}.ts`);
  for (const [tab, zeilen] of Object.entries(daten.tabellen)) {
    const soll = spalten.get(tab);
    const fremd = [...new Set(zeilen.flatMap((z) => Object.keys(z)))].filter((k) => !soll?.has(k));
    check(`${repoName}: Tabelle ${tab} (${zeilen.length} Zeilen) nur mit echten Spalten`, !!soll && fremd.length === 0, soll ? fremd : 'Tabelle fehlt im Schema');
  }
  const mails = JSON.stringify(daten).match(/[\w.-]+@[\w.-]+/g) ?? [];
  check(`${repoName}: E-Mails nur .example`, mails.every((m) => m.endsWith('.example')), mails.filter((m) => !m.endsWith('.example')));
}

if (will('gurtdex')) {
  await pruefApp('gurtdex', 'src/gurtdex/api.ts', 'src/gurtdex/exportLists.ts', 'GURTDEX_EXPORT', (api, sb) => api.fetchItems(sb), {
    name: 'Muster Dachtechnik GmbH',
    kpi: [3, 3, 2, 28],
    insp30: 30,
  });
  const T = await web('src/gurtdex/types.ts');
  const { daten } = await web('src/dev/beispiel/gurtdex.ts');
  const sites = new Set(daten.tabellen.site.filter((s) => s.active).map((s) => s.id));
  const aktiv = daten.tabellen.psa_item.filter((e) => !e.retired && sites.has(e.site_id));
  const abl = aktiv.filter((e) => T.lifespanWarning(e)?.startsWith('Ablegereif seit'));
  check('Kennzahl „Ablegereif“ = 1', abl.length === 1, abl.map((e) => e.name));
  info('Ablegereife-Text', T.lifespanWarning(abl[0]) ?? '');
  await schema('gurtdex', 'GurtDex');
}
if (will('hebedex')) {
  await pruefApp('hebedex', 'src/hebedex/api.ts', 'src/hebedex/exportLists.ts', 'HEBEDEX_EXPORT', (api, sb) => api.fetchItems(sb), {
    name: 'Muster Stahlbau GmbH',
    kpi: [3, 3, 2, 33],
    insp30: 41,
  });
  await schema('hebedex', 'HebeDex');
}
if (will('pruefdex')) {
  console.log('\n[pruefdex]');
  const { daten } = await web('src/dev/beispiel/pruefdex.ts');
  const api = await web('src/pruefdex/api.ts');
  const L = await web('src/pruefdex/labels.ts');
  const sb = C.beispielClient(daten);
  const ctx = await orgApi.fetchOrgContext(sb);
  check('Betrieb + Rolle Inhaber', ctx?.org.name === 'Elektro Muster GmbH' && ctx.role === 'owner', ctx);
  const [devices, customers, meta] = await Promise.all([api.fetchDevices(sb), api.fetchCustomers(sb), api.fetchInspectionMeta(sb)]);
  const overdue = devices.filter((d) => L.dueStatus(d.next_due_date) === 'overdue');
  const soon = devices.filter((d) => L.dueStatus(d.next_due_date) === 'soon');
  const insp30 = meta.filter((i) => Date.now() - new Date(i.inspected_at).getTime() <= 30 * DAY);
  info('Geräte / Kunden', `${devices.length} / ${customers.length}`);
  info('überfällig / bald', `${overdue.length} / ${soon.length}`);
  info('Prüfungen 30 Tage / nicht bestanden', `${insp30.length} / ${insp30.filter((i) => i.result === 'failed').length}`);
  for (const d of [...overdue, ...soon]) info('  fällig', `${d.name} · ${d.next_due_date}`);
  for (const i of meta.slice(0, 6)) info('  letzte', `${i.inspected_at} ${i.result}`);
  const alle = await api.fetchDevices(sb, { includeRetired: true });
  for (const d of alle.slice(0, 14)) info('  liste', `${d.name} · ${d.qr_code} · SK ${d.protection_class} · ${d.next_due_date} · ${L.dueStatus(d.next_due_date)}${d.retired ? ' · ausgesondert' : ''}`);
  // Frist am Gerät = Frist der jüngsten gültigen Prüfung (wie Server-Trigger)
  const insp = daten.tabellen.inspection.filter((i) => !i.canceled);
  const juengste = new Map();
  for (const i of insp.sort((a, b) => (a.inspected_at < b.inspected_at ? 1 : a.inspected_at > b.inspected_at ? -1 : a.created_at < b.created_at ? 1 : -1))) if (!juengste.has(i.device_id)) juengste.set(i.device_id, i);
  const falsch = daten.tabellen.device.filter((d) => (juengste.get(d.id)?.next_due_date ?? null) !== d.next_due_date);
  check('Frist am Gerät = Frist der jüngsten Prüfung', falsch.length === 0, falsch.map((d) => d.name));
  check('nichts in der Zukunft', insp.every((i) => i.inspected_at <= new Date().toISOString().slice(0, 10) && Date.parse(i.created_at) < Date.now()));
  const st = ES.startSteps({ stock: devices.length, first: meta.length > 0, members: 1, team: false });
  check('keine Karte „Erste Schritte“', !ES.cardVisible({ owner: true, hidden: false, state: st, newOrg: ES.isNewOrg(ctx.org.created_at) }));
  const det = await api.fetchInspectionWithPhotos(sb, meta[0].id);
  check('Prüfung im Detail ladbar', det.id === meta[0].id);
  await schema('pruefdex', 'PruefDex');
}
if (will('schutzdex')) {
  console.log('\n[schutzdex]');
  const { daten } = await web('src/dev/beispiel/schutzdex.ts');
  const api = await web('src/schutzdex/api.ts');
  const L = await web('src/schutzdex/labels.ts');
  const sb = C.beispielClient(daten);
  const ctx = await orgApi.fetchOwnerOrgContext(sb);
  check('Betrieb (owner_user_id)', !!ctx && ctx.role === 'owner', ctx);
  info('Betrieb', ctx?.org.name);
  const [members, briefings, assignments, completions, comp30] = await Promise.all([
    api.fetchMembers(sb),
    api.fetchBriefings(sb),
    api.fetchAssignments(sb),
    api.fetchCompletions(sb, { limit: 10 }),
    api.countCompletionsSince(sb, new Date(Date.now() - 30 * DAY)),
  ]);
  const open = assignments.filter((a) => a.status !== 'erledigt');
  const overdue = open.filter(L.isOverdue);
  info('Mitarbeiter aktiv/gesamt', `${members.filter((m) => m.aktiv).length}/${members.length}`);
  info('Unterweisungen', briefings.length);
  info('offene Zuweisungen / überfällig', `${open.length} / ${overdue.length}`);
  info('Nachweise 30 Tage', comp30);
  const mn = new Map(members.map((m) => [m.id, m.name]));
  const bt = new Map(briefings.map((b) => [b.id, b.titel]));
  for (const a of overdue) info('  überfällig', `${mn.get(a.member_id)} · ${bt.get(a.briefing_id)} · ${a.faellig_am}`);
  for (const c of completions.slice(0, 6)) info('  nachweis', `${c.abgeschlossen_am} · ${mn.get(c.member_id)} · ${bt.get(c.briefing_id)} · ${c.check_passed} ${c.check_score}`);
  check('Überfällige-Tabelle höchstens 8', overdue.length <= 8, overdue.length);
  check('nichts in der Zukunft', daten.tabellen.completion.every((c) => Date.parse(c.abgeschlossen_am) < Date.now()));
  check('Personen nur Initial + Nachname', personen([...members.map((m) => m.name), ...daten.tabellen.completion.map((c) => c.signed_name)]));
  await schema('schutzdex', 'SchutzDex');
}
console.info = stumm.info;
console.warn = stumm.warn;
console.log(`\n${ok} ok, ${bad} Fehler, Netz-Anfragen: ${netz}`);
process.exit(bad ? 1 : 0);
