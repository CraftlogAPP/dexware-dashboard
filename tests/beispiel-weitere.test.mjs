// Beispiel-Zugang (docs/beispiel-zugang.md): Beispieldaten KfzDex / TourDex / CraftDex / DokuDex mit den ECHTEN Abfragen
// der Seiten (src/<app>/api.ts) über den Speicher-Client samt JSON-Pfaden (data->>title …), Schema-Abgleich mit
// <App>/supabase/*.sql, Personen nur als Initial + Nachname, nichts in der Zukunft.
//   Aufruf:  node tests/beispiel-weitere.test.mjs
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const DESKTOP = path.resolve(ROOT, '..');
globalThis.fetch = async () => {
  throw new Error('kein Netz im Test');
};
const web = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
let ok = 0;
let bad = 0;
const check = (name, cond, detail) => {
  cond ? ok++ : bad++;
  console.log(`  ${cond ? 'ok  ' : 'FEHL'}  ${name}${cond || detail === undefined ? '' : `  → ${JSON.stringify(detail)}`}`);
};
const stumm = { info: console.info, warn: console.warn };
console.info = () => {};
console.warn = () => {};

const C = await web('src/dev/beispiel/client.ts');
check('Speicher-Client mit JSON-Pfaden (feld)', typeof C.feld === 'function');
{
  const z = { data: { a: { b: 2, c: 'x' }, t: '2026-11-20T10:00:00.000Z', ok: true }, deleted: false };
  check('feld: ->> Text, -> JSON, verschachtelt', C.feld(z, 'data->a->>b') === '2' && C.feld(z, 'data->a->b') === 2 && C.feld(z, 'data->ok') === true && C.feld(z, 'data->fehlt->>x') === null && C.feld(z, 'deleted') === false);
}
const PERSON = /^(Fam\. )?[A-Z]\. [A-ZÄÖÜ][a-zäöüß]+$|^Fam\. [A-ZÄÖÜ][a-zäöüß]+( \(Neubau\))?$/;

// ------------------------------------------------------------------------------------------------- KfzDex
console.log('\n[KfzDex]');
{
  const { daten } = await web('src/dev/beispiel/kfzdex.ts');
  const sb = C.beispielClient(daten);
  const api = await web('src/kfzdex/api.ts');
  const due = await web('src/kfzdex/due.ts');
  const ctx = await api.fetchKfzOrgContext(sb);
  check('Betrieb + Rolle Inhaber', ctx?.org?.name === 'Musterbau GmbH' && ctx.role === 'owner', ctx);
  const [v, d, uvv, lc] = await Promise.all([api.fetchVehicles(sb), api.fetchDrivers(sb), api.fetchUvvInspections(sb, { limit: 10 }), api.fetchLicenseChecks(sb, { limit: 10 })]);
  const aktiv = d.filter((x) => x.active);
  const h = due.fleetHealth(v, aktiv);
  check('Kennzahlen 13 Fahrzeuge, 14 aktive (+2), Überfällig 3 (+5 bald), 73 %', v.length === 13 && aktiv.length === 14 && d.length === 16 && h.overdue === 3 && h.soon === 5 && Math.round(h.score * 100) === 73, { v: v.length, aktiv: aktiv.length, h });
  const fz = v.map((x) => due.uvvDue(x).status);
  check('UVV: 1 nie, 2 überfällig, 3 bald fällig', fz.filter((s) => s === 'missing').length === 1 && fz.filter((s) => s === 'overdue').length === 2 && fz.filter((s) => s === 'soon').length === 3, fz);
  const fa = aktiv.map((x) => due.licenseDue(x).status);
  check('Fahrer: 1 nie, 1 überfällig, 2 bald fällig', fa.filter((s) => s === 'missing').length === 1 && fa.filter((s) => s === 'overdue').length === 1 && fa.filter((s) => s === 'soon').length === 2, fa);
  check('Letzte UVV: 10, alle drei Ergebnisse', uvv.length === 10 && ['bestanden', 'maengel', 'nicht_bestanden'].every((r) => uvv.some((i) => i.result === r)));
  check('Letzte Führerscheinkontrollen: 10', lc.length === 10);
  // last_uvv = letzte BESTANDENE Prüfung je Fahrzeug (wie addUvvInspection: nur bestanden setzt die Frist)
  const alle = daten.tabellen.uvv_inspection;
  const stimmig = v.filter((x) => x.last_uvv).every((x) => {
    const best = alle.filter((i) => i.vehicle_id === x.id && i.result === 'bestanden').map((i) => i.date).sort().pop();
    return best === x.last_uvv;
  });
  check('last_uvv = jüngste bestandene UVV je Fahrzeug', stimmig);
  const lcAlle = daten.tabellen.license_check;
  check('last_check = jüngste Kontrolle je Fahrer', d.filter((x) => x.last_check).every((x) => lcAlle.filter((c) => c.driver_id === x.id).map((c) => c.date).sort().pop() === x.last_check));
  check('Keine Prüfung in der Zukunft', [...alle.map((i) => i.created_at), ...lcAlle.map((c) => c.created_at)].every((t) => Date.parse(t) <= Date.now()));
  check('Personen nur Initial + Nachname', [...d.map((x) => x.name), ...alle.map((i) => i.inspector), ...lcAlle.map((c) => c.checked_by)].every((n) => PERSON.test(n)));
  const ES = await web('src/lib/ersteSchritte.ts');
  check('keine Karte „Erste Schritte“ (Betrieb älter als 30 Tage)', !ES.isNewOrg(ctx.org.created_at));
  const tc = await api.fetchKfzTeamCode(sb, true);
  check('Team-Code als Text (KfzDex-RPC team_code)', tc.code === 'K7F3-X2M9' && tc.canManage === true, tc);
}

// ------------------------------------------------------------------------------------------------- TourDex
console.log('\n[TourDex]');
{
  const { daten } = await web('src/dev/beispiel/tourdex.ts');
  const sb = C.beispielClient(daten);
  const api = await web('src/tourdex/api.ts');
  const [trips, vehicles, places] = await Promise.all([api.fetchTripSummaries(sb), api.fetchVehicles(sb), api.fetchPlaces(sb)]);
  check('Fahrten geladen, neueste zuerst', trips.length > 120 && trips.every((t, i) => i === 0 || trips[i - 1].start_time >= t.start_time), trips.length);
  check('Felder aus den JSON-Pfaden gefüllt', trips.every((t) => t.start_address && t.end_address && typeof t.distance_km === 'number' && t.category && typeof t.confirmed === 'boolean' && t.vehicle_id));
  const aktiv = trips.filter((t) => !t.canceled);
  const km = aktiv.reduce((s, t) => s + t.distance_km, 0);
  const gesch = aktiv.filter((t) => t.category === 'business').reduce((s, t) => s + t.distance_km, 0);
  check('Anteil geschäftlich 60–75 %', gesch / km > 0.6 && gesch / km < 0.75, (gesch / km).toFixed(3));
  const offen = trips.filter((t) => !t.confirmed);
  check('3 unbestätigte Fahrten, davon 2 vom letzten Werktag', offen.length === 3, offen.length);
  check('1 stornierte Fahrt mit Grund', trips.filter((t) => t.canceled && t.cancel_reason).length === 1);
  check('2 Fahrzeuge (Standard zuerst), 9 Orte', vehicles.length === 2 && vehicles[0].isDefault && places.length === 9);
  const r = await api.fetchTripsForReport(sb, vehicles[0].id, new Date(Date.now() - 30 * 86_400_000), new Date());
  check('Bericht: Filter Fahrzeug + Zeitraum (data->>vehicleId, data->>startTime), älteste zuerst', r.length > 10 && r.every((t) => t.vehicle_id === vehicles[0].id) && r.every((t, i) => i === 0 || r[i - 1].start_time <= t.start_time));
  const voll = await api.fetchTrip(sb, offen[0].id);
  check('Fahrt-Detail: KI-Vorschlag und GPS-Pfad', !!voll?.aiSuggestion && Array.isArray(voll.path) && voll.path.length >= 6);
  check('Keine Fahrt in der Zukunft', trips.every((t) => Date.parse(t.end_time) <= Date.now()));
}

// ------------------------------------------------------------------------------------------------- CraftDex
console.log('\n[CraftDex]');
{
  const { daten } = await web('src/dev/beispiel/craftdex.ts');
  const sb = C.beispielClient(daten);
  const api = await web('src/craftdex/api.ts');
  const p = await api.fetchProjectSummaries(sb);
  const n = (s) => p.filter((x) => x.status === s).length;
  check('13 Aufträge: In Arbeit 4, Angebote 3, Abzurechnen 2, Abgerechnet 4', p.length === 13 && n('in_progress') === 4 && n('quote') === 3 && n('completed') === 2 && n('invoiced') === 4);
  check('Stunden-Summe 150', p.reduce((s, x) => s + (x.logged_hours ?? 0), 0) === 150);
  const termine = p.filter((x) => x.deadline_ms != null && x.status !== 'completed' && x.status !== 'invoiced').sort((a, b) => a.deadline_ms - b.deadline_ms);
  check('Anstehende Termine 5, erster überfällig', termine.length === 5 && termine[0].deadline_ms < Date.now() && termine[1].deadline_ms > Date.now());
  check('Zuletzt bearbeitet: absteigend', p.every((x, i) => i === 0 || p[i - 1].updated_at >= x.updated_at));
  const voll = await api.fetchProject(sb, p.find((x) => x.title === 'Einbauschrank Dachschräge').id);
  const kosten = voll.costs.reduce((s, c) => s + c.price, 0);
  check('Detail: 8 Schritte (5 erledigt), Kosten unter Budget', voll.steps.length === 8 && voll.steps.filter((s) => s.done).length === 5 && kosten < voll.budget, { kosten });
  check('Kunden nur Fam./Initial/erfundene Firma', p.every((x) => !x.customer_name || PERSON.test(x.customer_name) || /Hausverwaltung Musterstadt|Steuerbüro Klein/.test(x.customer_name)), p.map((x) => x.customer_name));
  const gate = await (await web('src/craftdex/pro.ts')).projectGate(sb, async () => true);
  check('Gratis-Zählung (count/head, not like seed-%) funktioniert', gate.count === 13 && gate.allowed === true, gate);
}

// ------------------------------------------------------------------------------------------------- DokuDex
console.log('\n[DokuDex]');
{
  const mod = await web('src/dev/beispiel/dokudex.ts');
  const sb = C.beispielClient(mod.daten);
  const api = await web('src/dokudex/api.ts');
  const [docs, projekte] = await Promise.all([api.fetchDocumentSummaries(sb), api.fetchProjects(sb)]);
  check('16 Dokumente, 4 Projekte', docs.length === 16 && projekte.length === 4);
  check('Neueste zuerst (data->>createdAt)', docs.every((x, i) => i === 0 || docs[i - 1].created_at >= x.created_at));
  check('11 mit Fristen (data->analysis->deadlines als Liste)', docs.filter((x) => (x.deadlines?.length ?? 0) > 0).length === 11 && docs.every((x) => x.deadlines === null || Array.isArray(x.deadlines)));
  check('KI-Typ und Zusammenfassung aus verschachteltem Pfad', docs.every((x) => x.ai_type && x.summary));
  const d1 = await api.fetchDocument(sb, mod.BILD_DOKUMENT);
  const a = d1.analysis;
  check('Bild-Dokument: alle fünf Abschnitte', a.summary && a.keyPoints.length === 4 && a.deadlines.length === 2 && a.actionItems.length === 3 && !!a.recommendation);
  check('Rechnung stimmt: 2.706,40 − 12 × 210 = 186,40', Math.round((2706.4 - 12 * 210) * 100) === 18640);
  check('Dokumente je Projekt zugeordnet (Projekt existiert)', docs.every((x) => !x.project_id || projekte.some((p) => p.id === x.project_id)));
}

// ------------------------------------------------------------------------------------------------- Schema
console.log('\n[Schema]');
function spaltenAus(dateien) {
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
      for (const x of m[2].matchAll(/add column (?:if not exists )?([a-z_][a-z0-9_]*)/gi)) add(m[1], x[1]);
    }
  }
  return spalten;
}
const sqlIn = (dir) => {
  const out = [];
  const sammle = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) {
        if (!['tests', 'node_modules', 'email-templates'].includes(f)) sammle(p);
      } else if (f.endsWith('.sql')) out.push(p);
    }
  };
  if (existsSync(dir)) sammle(dir);
  return out;
};
for (const [app, repo] of [['kfzdex', 'KfzDex'], ['tourdex', 'TourDex'], ['craftdex', 'CraftDex'], ['dokudex', 'DokuDex']]) {
  if (!existsSync(path.join(DESKTOP, repo, 'supabase'))) {
    console.log(`  —     ${repo}: Repo nicht gefunden — Schema-Abgleich übersprungen`);
    continue;
  }
  const spalten = spaltenAus(sqlIn(path.join(DESKTOP, repo, 'supabase')));
  const { daten } = await web(`src/dev/beispiel/${app}.ts`);
  for (const [tab, zeilen] of Object.entries(daten.tabellen)) {
    const soll = spalten.get(tab);
    const fremd = [...new Set(zeilen.flatMap((z) => Object.keys(z)))].filter((k) => !soll?.has(k));
    check(`${repo}: Tabelle ${tab} (${zeilen.length} Zeilen) nur mit echten Spalten`, !!soll && fremd.length === 0, soll ? fremd : 'Tabelle fehlt im Schema');
  }
}

console.info = stumm.info;
console.warn = stumm.warn;
console.log(`\n${bad === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${bad} Fehler`);
process.exit(bad === 0 ? 0 : 1);
