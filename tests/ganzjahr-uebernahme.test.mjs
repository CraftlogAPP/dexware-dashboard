// Prüft die Ganzjahres-Brücke WinterDex → ObjektDex im Dashboard (Plan dexware-suite/docs/ganzjahr-2026-11-24.md 5.2–5.6):
//   • Übernahme: Spalten-Mapping laut Tabelle 5.6 (areas → notes „Flächen: …“, Saison-Pause → aktiv), Dubletten (gleiche
//     Adresse, ohne Adresse gleicher Name), Umschlüsseln von route.property_ids, Gratis-Grenze wie die App (2 aktive
//     Objekte, Runden nur mit Pro; unklare Pro-Auskunft = Gratis), frische Prüfung beim Klick (inzwischen vorhanden)
//   • Spalten der Zeilen gegen das ECHTE Schema beider Apps (WinterDex lesen, ObjektDex schreiben)
//   • gegen das ECHTE ObjektDex-Schema (PGlite = Postgres im Speicher — NIE die echte Datenbank): Betrieb anlegen mit den
//     WinterDex-Angaben, Objekte/Runden/Leistungen so einfügen, wie das Dashboard sie baut (als Inhaber unter RLS),
//     Länge der Runde vom Server, umgeschlüsselte Objekt-ids, Mitarbeiter darf nichts anlegen
//
//   Aufruf:  node tests/ganzjahr-uebernahme.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
//   Braucht: die App-Repos ObjektDex und WinterDex neben dem Dashboard (sonst OBJEKTDEX_REPO / WINTERDEX_REPO setzen);
//            für den PGlite-Teil ObjektDex/supabase/tests mit „npm install“ (sonst wird dieser Teil übersprungen).
import { existsSync, readFileSync } from 'node:fs';
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
const web = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
const liesWeb = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const OD = process.env.OBJEKTDEX_REPO ?? 'C:/Users/2easy/Desktop/ObjektDex';
const WD = process.env.WINTERDEX_REPO ?? 'C:/Users/2easy/Desktop/WinterDex';
const liesRepo = (repo, f) => readFileSync(path.join(repo, f), 'utf8').replace(/\r\n/g, '\n');

const U = await web('src/objektdex/uebernahme.ts');

let ok = 0;
let fail = 0;
let marke = '';
const check = (name, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${marke}${name}${cond || extra === '' ? '' : '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`);
};
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const teil = (titel) => {
  marke = '';
  console.log(`\n${titel}`);
};

// ---------------------------------------------------------------------------- Beispiel-Betrieb (WinterDex)
const wid = (n) => `0000w000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const obj = (n, name, address, extra = {}) => ({
  id: wid(n),
  name,
  address,
  lat: 47.07 + n / 1000,
  lng: 15.43 + n / 1000,
  customer_name: 'HV Muster',
  customer_contact: '0316 1234',
  areas: null,
  notes: null,
  active: true,
  ...extra,
});
const WOBJ = [
  obj(1, 'WEG Hauptplatz 1', 'Hauptplatz 1, 8200 Gleisdorf', { areas: 'Gehsteig 30 m,\nZufahrt', notes: 'Schlüssel im Kasten' }),
  obj(2, 'Volksschule', 'Schulweg 3', { active: false }), // Saison-Pause
  obj(3, 'Ohne Adresse', '', { customer_name: null }),
  obj(4, 'Gemeindeamt', 'Hauptplatz 5/2, 8200 Gleisdorf', { lat: null, lng: null }),
  obj(5, 'Bauhof', 'Industriestraße 9, 8200 Gleisdorf', { active: false, areas: 'Hof' }),
];
const WSTR = [
  { id: wid(101), name: 'Tour Ortskern', notes: null, path: [[47.07, 15.43], [47.071, 15.432], 'kaputt', [47.072, 15.434]], length_m: 410, source: 'objects', property_ids: [wid(1), wid(4), wid(1), wid(9), 7], active: true },
  { id: wid(102), name: 'Räumstrecke Schulweg', notes: 'früh', path: [[47.06, 15.42], [47.061, 15.421]], length_m: 120, source: 'recorded', property_ids: [], active: false },
];

// ============================================================================ Werte
teil('Werte (Tabelle 5.6)');
check('Flächen kommen in die Notiz, darunter die alte Notiz', U.notizMitFlaechen('Schlüssel im Kasten', 'Gehsteig 30 m,\nZufahrt') === 'Flächen: Gehsteig 30 m, Zufahrt\nSchlüssel im Kasten', U.notizMitFlaechen('Schlüssel im Kasten', 'Gehsteig 30 m,\nZufahrt'));
check('ohne Flächen bleibt die Notiz', U.notizMitFlaechen('Notiz', '  ') === 'Notiz');
check('ohne beides: null', U.notizMitFlaechen(null, null) === null);
check('Notiz höchstens 2.000 Zeichen', U.notizMitFlaechen('x'.repeat(3000), 'y').length === 2000);
check('Koordinaten: gültig bleibt', gleich(U.koordinaten(47.1, 15.4), { lat: 47.1, lng: 15.4 }));
check('Koordinaten: nur eine / 0,0 / außerhalb → keine', [U.koordinaten(47.1, null), U.koordinaten(0, 0), U.koordinaten(95, 10), U.koordinaten('47', '15')].every((k) => k.lat === null && k.lng === null));
check('Name leer → Straße aus der Adresse', U.objektName('  ', 'Hauptplatz 1, 8200 Gleisdorf') === 'Hauptplatz 1');
check('Name höchstens 160 Zeichen (Prüfung im ObjektDex-Schema)', U.objektName('n'.repeat(200), '').length === 160);
check('Name und Adresse leer → „Objekt“', U.objektName('', '') === 'Objekt');
check('Betrieb vorbelegt (Name, Land, Adresse)', gleich(U.betriebVorbelegung({ name: ' Huber  Winterdienst ', land: 'AT', address: 'Hauptplatz 1,\n8200 Gleisdorf' }), { name: 'Huber Winterdienst', land: 'AT', address: 'Hauptplatz 1, 8200 Gleisdorf' }));
check('Betrieb: unbekanntes Land → DE, ohne Adresse → leer', gleich(U.betriebVorbelegung({ name: 'X', land: 'FR', address: null }), { name: 'X', land: 'DE', address: '' }));
const tt = U.teamText('OD-ABCD-EFGH');
check('Team-Text: Code, Play-Link und Weg in der App', tt.includes('OD-ABCD-EFGH') && tt.includes('https://play.google.com/store/apps/details?id=com.objektdex.app') && tt.includes('„Ich habe einen Team-Code“'), tt);

// ============================================================================ Abgleich
teil('Dubletten (gleiche Adresse schon in ObjektDex)');
const od0 = [
  { id: 'od-1', name: 'Hauptplatz 1 (Wohnhaus)', address: 'Hauptplatz 1', active: true }, // ohne PLZ/Ort
  { id: 'od-2', name: 'Alt', address: 'Hauptplatz 5, 8200 Gleisdorf', active: true }, // andere Hausnummer als 5/2
  { id: 'od-3', name: 'Ohne Adresse', address: '', active: false },
];
check('gleiche Adresse, PLZ/Ort fehlen auf einer Seite → vorhanden (anderer Name egal)', U.findeVorhandenes(WOBJ[0], od0)?.id === 'od-1');
check('andere Hausnummer (5/2 ≠ 5) → neu', U.findeVorhandenes(WOBJ[3], od0) === null);
check('ohne Adresse: gleicher Name → vorhanden (auch pausiert)', U.findeVorhandenes(WOBJ[2], od0)?.id === 'od-3');
check('„Straße“ = „Str.“', U.findeVorhandenes({ name: 'x', address: 'Industriestr. 9, 8200 Gleisdorf' }, [{ id: 'a', name: 'y', address: 'Industriestraße 9', active: true }])?.id === 'a');
check('aktives Objekt gewinnt vor pausiertem', U.findeVorhandenes({ name: 'x', address: 'Weg 1' }, [{ id: 'p', name: 'p', address: 'Weg 1', active: false }, { id: 'a', name: 'a', address: 'Weg 1', active: true }])?.id === 'a');
check('leere Adresse in ObjektDex trifft keine Adresse', U.findeVorhandenes({ name: 'Bauhof', address: 'Industriestraße 9' }, [{ id: 'e', name: 'Bauhof', address: '', active: true }]) === null);

teil('Auswahl');
const plan = U.planUebernahme({ objekte: WOBJ, strecken: WSTR, od: od0, odStrecken: [{ id: 'r-1', name: 'räumstrecke  schulweg' }] });
check('aktive zuerst, dann nach Name', gleich(plan.objekte.map((z) => z.w.id), [wid(4), wid(3), wid(1), wid(5), wid(2)]), plan.objekte.map((z) => z.w.name));
check('Status je Objekt', gleich(plan.objekte.map((z) => z.status), ['neu', 'vorhanden', 'vorhanden', 'neu', 'neu']));
check('Strecke mit gleichem Namen schon da (Groß/Klein, Leerzeichen egal)', plan.strecken.find((z) => z.w.id === wid(102))?.status === 'vorhanden');
check('Strecke zählt ihre Objekte (ohne Doppelte, nur Texte)', plan.strecken.find((z) => z.w.id === wid(101))?.objekte === 3);
const std = U.standardAuswahl(plan, true);
check('Standard: alle neuen Objekte, auch in Saison-Pause', gleich([...std.objekte].sort(), [wid(2), wid(4), wid(5)].sort()));
check('Standard: neue Strecken nur, wenn erlaubt', std.strecken.has(wid(101)) && !std.strecken.has(wid(102)) && U.standardAuswahl(plan, false).strecken.size === 0);

// ============================================================================ Gratis-Grenze
teil('Gratis-Grenze wie die App');
check('Pro: unbegrenzt', gleich(U.gratisRahmen(true, 50), { objekte: null, strecken: null }));
check('Gratis: 2 aktive insgesamt, keine Runden', gleich(U.gratisRahmen(false, 1), { objekte: 1, strecken: 0 }) && gleich(U.gratisRahmen(false, 3), { objekte: 0, strecken: 0 }));
check('Pro unklar (RevenueCat nicht erreichbar) = Gratis-Grenze', gleich(U.gratisRahmen(null, 0), { objekte: 2, strecken: 0 }));
if (existsSync(path.join(OD, 'mobile/src/lib/entitlement.ts'))) {
  const ent = liesRepo(OD, 'mobile/src/lib/entitlement.ts');
  const m = ent.match(/FREE_LIMITS = \{ properties: (\d+), routes: (\d+) \}/);
  check('Grenzen = FREE_LIMITS der ObjektDex-App', !!m && Number(m[1]) === U.GRATIS_OBJEKTE && Number(m[2]) === U.GRATIS_STRECKEN, m?.[0]);
  check('App zählt nur AKTIVE Objekte (listProperties ohne includeInactive)', /const count = \(await repo\.listProperties\(\)\)\.length;/.test(ent));
} else check('ObjektDex-Repo gefunden (FREE_LIMITS abgleichen)', false, OD);

// ============================================================================ Auftrag beim Klick
teil('Auftrag (frisch geprüft beim Klick)');
let n = 0;
const neueId = () => `neu-${++n}`;
const alle = new Set(WOBJ.map((o) => o.id));
let a = U.uebernahmeAuftrag({ plan, objekte: alle, strecken: new Set([wid(101), wid(102)]), od: od0, odStrecken: [{ id: 'r-1', name: 'Räumstrecke Schulweg' }], pro: true, neueId });
check('Pro: angehakte „schon da“ werden bewusst angelegt, neue alle', a.objekte.length === 5 && a.ueberGrenze === 0, a.objekte.map((x) => x.w.name));
check('Pro: auch die bewusst angehakte vorhandene Strecke', a.strecken.length === 2 && a.streckenUeberGrenze === 0);
const z1 = a.objekte.find((x) => x.w.id === wid(1)).zeile;
check('Mapping 1:1 + Flächen in der Notiz', z1.name === 'WEG Hauptplatz 1' && z1.address === 'Hauptplatz 1, 8200 Gleisdorf' && z1.customer_name === 'HV Muster' && z1.customer_contact === '0316 1234' && z1.contact_person === null && z1.notes === 'Flächen: Gehsteig 30 m, Zufahrt\nSchlüssel im Kasten' && z1.lat === WOBJ[0].lat, z1);
check('Zeile hat genau die Spalten für ObjektDex.property (ohne org_id, active, duty_times, areas)', gleich(Object.keys(z1).sort(), ['address', 'contact_person', 'customer_contact', 'customer_name', 'id', 'lat', 'lng', 'name', 'notes'].sort()));
check('ohne Koordinaten bleibt ohne', a.objekte.find((x) => x.w.id === wid(4)).zeile.lat === null);

n = 0;
const nurNeue = new Set([wid(1), wid(2), wid(4), wid(5)]); // 1 ist vorhanden, aber angehakt
a = U.uebernahmeAuftrag({ plan, objekte: new Set([wid(2), wid(4), wid(5)]), strecken: new Set([wid(101)]), od: od0, odStrecken: [], pro: false, neueId });
check('Gratis mit 2 aktiven: kein Objekt, keine Strecke', a.objekte.length === 0 && a.ueberGrenze === 3 && a.strecken.length === 0 && a.streckenUeberGrenze === 1, a);
a = U.uebernahmeAuftrag({ plan, objekte: nurNeue, strecken: new Set(), od: [od0[2]], odStrecken: [], pro: null, neueId });
check('Pro unklar, 0 aktive: nur die ersten 2 der Liste', gleich(a.objekte.map((x) => x.w.id), [wid(4), wid(1)]) && a.ueberGrenze === 2, a.objekte.map((x) => x.w.name));
// Inzwischen angelegt (anderer Tab): Objekt 4 gibt es jetzt
const odFrisch = [...od0, { id: 'od-9', name: 'Gemeindeamt', address: 'Hauptplatz 5/2, 8200 Gleisdorf', active: true }];
a = U.uebernahmeAuftrag({ plan, objekte: new Set([wid(4), wid(5)]), strecken: new Set(), od: odFrisch, odStrecken: [], pro: true, neueId });
check('inzwischen vorhanden → nicht noch einmal, aber zugeordnet', a.inzwischenDa === 1 && a.objekte.length === 1 && a.zuordnung.get(wid(4)) === 'od-9');
check('Zuordnung enthält auch nicht angehakte, vorhandene Objekte', a.zuordnung.get(wid(1)) === 'od-1' && a.zuordnung.get(wid(3)) === 'od-3');
a = U.uebernahmeAuftrag({ plan, objekte: new Set(), strecken: new Set([wid(101)]), od: od0, odStrecken: [{ id: 'x', name: 'Tour Ortskern' }], pro: true, neueId });
check('Strecke inzwischen vorhanden → nicht noch einmal', a.strecken.length === 0 && a.streckenInzwischenDa === 1);

teil('Strecken umschlüsseln');
n = 0;
a = U.uebernahmeAuftrag({ plan, objekte: new Set([wid(4)]), strecken: new Set([wid(101)]), od: od0, odStrecken: [], pro: true, neueId });
const neu4 = a.zuordnung.get(wid(4));
const gibtEs = new Set([...od0.map((p) => p.id), neu4]);
const r1 = U.streckenZeile(WSTR[0], 'r-neu', a.zuordnung, gibtEs);
check('property_ids → ObjektDex-ids (neu + vorhanden), Reihenfolge bleibt, Doppelte/Unbekannte fallen weg', gleich(r1.property_ids, ['od-1', neu4]), r1.property_ids);
check('Pfad: nur gültige Punkte', gleich(r1.path, [[47.07, 15.43], [47.071, 15.432], [47.072, 15.434]]));
check('Art bleibt (aus Objekten / aufgezeichnet), Länge rechnet der Server', r1.source === 'objects' && !('length_m' in r1) && U.streckenZeile(WSTR[1], 'x', a.zuordnung, gibtEs).source === 'recorded');
const r2 = U.streckenZeile(WSTR[0], 'r-neu', a.zuordnung, new Set(['od-1']));
check('fehlgeschlagenes Objekt fällt aus der Strecke', gleich(r2.property_ids, ['od-1']));
check('Zeile hat genau die Spalten für ObjektDex.route (ohne org_id/active/length_m)', gleich(Object.keys(r1).sort(), ['id', 'name', 'notes', 'path', 'property_ids', 'source']));
check('kaputte Eingaben: kein Pfad, keine ids', gleich(U.pfad('x'), []) && gleich(U.idListe(null), []));

// ============================================================================ Spalten gegen die Schemas
teil('Spalten gegen die echten Schemas');
const spalten = (sql, table) => {
  const m = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) return null;
  const cols = m[1]
    .split('\n')
    .map((l) => l.trim().match(/^([a-z_]+)\s+(uuid|text|double|jsonb|boolean|int|date|timestamptz)/)?.[1])
    .filter(Boolean);
  for (const am of sql.matchAll(new RegExp(`alter table public\\.${table} add column if not exists ([a-z_]+)`, 'g'))) cols.push(am[1]);
  return cols;
};
if (existsSync(path.join(OD, 'supabase/schema.sql')) && existsSync(path.join(WD, 'supabase/schema.sql'))) {
  const odSql = liesRepo(OD, 'supabase/schema.sql');
  const wdSql = liesRepo(WD, 'supabase/schema.sql') + liesRepo(WD, 'supabase/strecken.sql');
  const page = liesWeb('src/objektdex/pages/AusWinterdex.tsx');
  const cols = (name) => page.match(new RegExp(`const ${name} = '([^']+)'`))?.[1].split(',').map((s) => s.trim()) ?? [];
  const wdProp = spalten(wdSql, 'property');
  const wdRoute = spalten(wdSql, 'route');
  check('WinterDex: gelesene Objekt-Spalten gibt es', cols('WD_OBJEKT_COLS').length === 10 && cols('WD_OBJEKT_COLS').every((c) => wdProp?.includes(c)), cols('WD_OBJEKT_COLS').filter((c) => !wdProp?.includes(c)));
  check('WinterDex: gelesene Strecken-Spalten gibt es', cols('WD_STRECKE_COLS').length === 8 && cols('WD_STRECKE_COLS').every((c) => wdRoute?.includes(c)), cols('WD_STRECKE_COLS').filter((c) => !wdRoute?.includes(c)));
  check('WinterDex-Objekt hat duty_times (entfällt bewusst) und areas (→ Notiz)', wdProp.includes('duty_times') && wdProp.includes('areas'));
  const odProp = spalten(odSql, 'property');
  const odRoute = spalten(odSql, 'route');
  const odSvc = spalten(odSql, 'service');
  check('ObjektDex.property hat alle geschriebenen Spalten', Object.keys(z1).every((c) => odProp.includes(c)) && odProp.includes('org_id'));
  check('ObjektDex.route hat alle geschriebenen Spalten (spaltengleich mit WinterDex)', Object.keys(r1).every((c) => odRoute.includes(c)) && gleich([...odRoute].sort(), [...wdRoute].sort()), { od: odRoute, wd: wdRoute });
  check('ObjektDex.service hat die Turnus-Spalten', ['cadence', 'weekdays', 'month_day', 'start_on', 'template_key', 'sort'].every((c) => odSvc.includes(c)));
  check('Anlegen nur Inhaber (RLS property/route/service: user_owner_org_ids)', ['property', 'route', 'service'].every((t) => new RegExp(`create policy ${t}_insert on public\\.${t} for insert with check \\(org_id in \\(select public\\.user_owner_org_ids\\(\\)\\)\\)`).test(odSql)));
  check('create_org_with_owner(p_name, p_land, p_address) wie im Dashboard aufgerufen', /create_org_with_owner\(p_name text, p_land text default 'DE', p_address text default ''\)/.test(odSql) && /rpc\('create_org_with_owner', \{ p_name: name\.trim\(\), p_land: land, p_address: address\.trim\(\) \}\)/.test(page));
} else check('Schemas von ObjektDex und WinterDex gefunden', false, { OD, WD });

// ============================================================================ Echtes ObjektDex-Schema (PGlite)
teil('Echtes ObjektDex-Schema (PGlite, im Speicher)');
const pglitePfad = path.join(OD, 'supabase/tests/node_modules/@electric-sql/pglite/dist/index.js');
let pg = null;
if (!existsSync(pglitePfad)) {
  console.log(`  (übersprungen: ${pglitePfad} fehlt — in ObjektDex/supabase/tests einmal „npm install“)`);
} else {
  const { PGlite } = await import(pathToFileURL(pglitePfad).href);
  const { pgcrypto } = await import(pathToFileURL(path.join(path.dirname(pglitePfad), 'contrib/pgcrypto.js')).href);
  const prelude = liesRepo(OD, 'supabase/tests/verwalter.test.mjs').match(/const (?:BASIS|prelude) = `([\s\S]*?)`;/)?.[1];
  if (!prelude || prelude.includes('${')) throw new Error('Supabase-Nachbau aus ObjektDex/supabase/tests/verwalter.test.mjs nicht lesbar');
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(prelude);
  await db.exec(`set search_path = "$user", public, extensions;`);
  for (const f of ['schema.sql', 'NACHTRAG-VERWALTER-2026-11-13.sql', 'NACHTRAG-TEAMCODE-2026-11-14.sql', 'NACHTRAG-SICHERHEIT-2026-11-13.sql']) {
    await db.exec(liesRepo(OD, `supabase/${f}`).replaceAll('__RC_PUBLIC_KEY__', 'goog_TESTschluesselABCDEFGHIJKLMN'));
  }
  const su = async (text, params = []) => (await db.query(text, params)).rows;
  const als = async (uid, text, params = []) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
    try {
      return { rows: (await db.query(text, params)).rows };
    } catch (e) {
      return { err: e.message, code: e.code };
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  };
  let nr = 0;
  const nutzer = async (name) => (await su(`insert into auth.users (email) values ($1) returning id`, [`${name}${++nr}@beispiel.de`]))[0].id;
  /** wie supabase-js .insert(rows) mit org_id (data.ts → insertRows): nur die Spalten der Zeilen, Rest = Vorgabe */
  const einfuegen = (uid, table, rows, orgId) => {
    const cols = ['org_id', ...Object.keys(rows[0])].map((c) => `"${c}"`).join(', ');
    return als(uid, `insert into public.${table} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`, [JSON.stringify(rows.map((r) => ({ org_id: orgId, ...r })))]);
  };
  pg = { su, als, nutzer, einfuegen };

  const chef = await nutzer('chef');
  const vb = U.betriebVorbelegung({ name: 'Huber Hausbetreuung', land: 'AT', address: 'Hauptplatz 1, 8200 Gleisdorf' });
  const o1 = await als(chef, `select public.create_org_with_owner($1, $2, $3) as id`, [vb.name, vb.land, vb.address]);
  const orgId = o1.rows?.[0]?.id;
  const org = (await su(`select name, land, address from public.org where id = $1`, [orgId]))[0];
  check('Betrieb mit den WinterDex-Angaben angelegt (Inhaber)', !!orgId && gleich(org, { name: 'Huber Hausbetreuung', land: 'AT', address: 'Hauptplatz 1, 8200 Gleisdorf' }) && (await su(`select role from public.membership where user_id = $1`, [chef]))[0]?.role === 'owner', o1.err ?? org);
  const o2 = await als(chef, `select public.create_org_with_owner('Zweiter', 'DE', '') as id`);
  check('zweiter Klick: kein zweiter Betrieb', o2.rows?.[0]?.id === orgId && (await su(`select count(*)::int as n from public.org`))[0].n === 1);

  // vorhandenes Objekt (wie od0[0]) — die Übernahme ordnet es zu statt es doppelt anzulegen
  const vorh = (await als(chef, `insert into public.property (org_id, name, address) values ($1, 'Hauptplatz 1 (Wohnhaus)', 'Hauptplatz 1') returning id, name, address, active`, [orgId])).rows[0];
  const odJetzt = (await als(chef, `select id, name, address, active from public.property order by name, id`)).rows;
  const odStr = (await als(chef, `select id, name from public.route order by name, id`)).rows;
  const p2 = U.planUebernahme({ objekte: WOBJ, strecken: WSTR, od: odJetzt, odStrecken: odStr });
  const aus2 = U.standardAuswahl(p2, true);
  const auf = U.uebernahmeAuftrag({ plan: p2, objekte: aus2.objekte, strecken: aus2.strecken, od: odJetzt, odStrecken: odStr, pro: true, neueId: () => crypto.randomUUID() });
  const insP = await einfuegen(chef, 'property', auf.objekte.map((x) => x.zeile), orgId);
  check('Objekte so eingefügt, wie das Dashboard sie baut (als Inhaber, RLS)', !insP.err, insP.err);
  const props = (await als(chef, `select id, name, address, lat, lng, notes, active, customer_name from public.property order by name`)).rows;
  check('alle Standard-Objekte da (auch die aus der Saison-Pause, jetzt aktiv)', props.length === 1 + auf.objekte.length && props.every((p) => p.active), props.map((p) => p.name));
  check('Flächen stehen in der Notiz', props.find((p) => p.name === 'Bauhof')?.notes === 'Flächen: Hof');
  const gibt = new Set(props.map((p) => p.id));
  const routen = auf.strecken.map((w) => U.streckenZeile(w, crypto.randomUUID(), auf.zuordnung, gibt));
  const insR = await einfuegen(chef, 'route', routen, orgId);
  check('Runden eingefügt (Pfad als jsonb, Server rechnet die Länge)', !insR.err, insR.err);
  const rr = (await als(chef, `select name, length_m, source, property_ids, path from public.route`)).rows;
  const tour = rr.find((r) => r.name === 'Tour Ortskern');
  const amt = props.find((p) => p.name === 'Gemeindeamt');
  check('Länge vom Server (route_bi)', tour?.length_m > 0, tour);
  check('property_ids zeigen auf ObjektDex-Objekte (vorhanden + neu)', gleich(tour?.property_ids, [vorh.id, amt?.id]), tour?.property_ids);
  check('beide neuen Strecken angelegt (auch die aus der Saison-Pause)', rr.length === 2 && rr.some((r) => r.name === 'Räumstrecke Schulweg' && r.source === 'recorded' && gleich(r.property_ids, [])), rr.map((r) => r.name));

  // Rechte: Mitarbeiter und nicht angemeldet dürfen nichts anlegen
  const mit = await nutzer('mitarbeiter');
  await su(`insert into public.membership (org_id, user_id, role) values ($1, $2, 'worker')`, [orgId, mit]);
  const wP = await einfuegen(mit, 'property', [{ id: crypto.randomUUID(), name: 'X', address: 'Y 1', lat: null, lng: null, customer_name: null, customer_contact: null, contact_person: null, notes: null }], orgId);
  check('Mitarbeiter darf keine Objekte anlegen (RLS)', !!wP.err && /row-level security/i.test(wP.err), wP);
  const wR = await einfuegen(mit, 'route', [routen[0] && { ...routen[0], id: crypto.randomUUID() }], orgId);
  check('Mitarbeiter darf keine Runden anlegen (RLS)', !!wR.err, wR);
  const fremd = await nutzer('fremd');
  await als(fremd, `select public.create_org_with_owner('Fremd', 'DE', '')`);
  const fP = await einfuegen(fremd, 'property', [{ id: crypto.randomUUID(), name: 'X', address: 'Y 1', lat: null, lng: null, customer_name: null, customer_contact: null, contact_person: null, notes: null }], orgId);
  check('Inhaber eines anderen Betriebs darf hier nichts anlegen', !!fP.err, fP);
  pg.orgId = orgId;
  pg.chef = chef;
  pg.mit = mit;
}

// ============================================================================ Leistungen für mehrere Objekte
teil('Leistungen für mehrere Objekte');
const { SERVICE_TEMPLATES } = await web('src/objektdex/types.ts');
const vl = (key, extra = {}) => {
  const t = SERVICE_TEMPLATES.find((x) => x.key === key);
  return { key, name: t.name, cadence: t.cadence, weekdays: [...t.weekdays], monthDay: t.monthDay ?? null, ...extra };
};
check('Vorlage ohne Wochentag (wöchentlich) → Fehler wie service_cadence_ok', !!U.vorlageFehler(vl('stairs', { weekdays: [] })) && !!U.vorlageFehler(vl('mow', { weekdays: [9] })));
check('monatlich ohne Tag → Fehler; mit Tag 1–31 in Ordnung', !!U.vorlageFehler(vl('lights', { monthDay: null })) && !!U.vorlageFehler(vl('lights', { monthDay: 32 })) && U.vorlageFehler(vl('meters')) === null);
check('leerer bzw. zu langer Name → Fehler', !!U.vorlageFehler(vl('special', { name: '  ' })) && !!U.vorlageFehler(vl('special', { name: 'x'.repeat(81) })));
check('Vorlagen der App: täglich/nach Bedarf ohne Tage in Ordnung', SERVICE_TEMPLATES.every((t) => U.vorlageFehler(vl(t.key)) === null));
const vorh = [
  { property_id: 'p1', name: 'Kehren Zufahrt', template_key: 'sweep', active: true },
  { property_id: 'p1', name: 'Rasen mähen', template_key: null, active: true },
  { property_id: 'p2', name: 'Kehren', template_key: 'sweep', active: false }, // beendet
  { property_id: 'p2', name: 'Sonderreinigung', template_key: 'special', active: true },
];
n = 0;
const pl = U.planLeistungen({ objektIds: ['p1', 'p2', 'p3'], vorlagen: [vl('sweep'), vl('mow'), vl('special'), vl('stairs', { weekdays: [4, 1, 1] })], vorhandene: vorh, startOn: '2027-03-01', neueId });
const paare = pl.zeilen.map((z) => `${z.property_id}:${z.template_key}`);
check('gleiche Vorlage läuft schon → übersprungen (p1 Kehren)', !paare.includes('p1:sweep'));
check('gleicher Name ohne Vorlage → übersprungen (p1 Rasen mähen)', !paare.includes('p1:mow'));
check('beendete Leistung zählt nicht → p2 bekommt Kehren', paare.includes('p2:sweep'));
check('Sonderreinigung darf mehrfach — aber nicht mit gleichem Namen', paare.includes('p1:special') && !paare.includes('p2:special'));
check('Anzahl: 3 Objekte × 4 Vorlagen − 3 Doppelte', pl.zeilen.length === 9 && pl.doppelt === 3, { n: pl.zeilen.length, doppelt: pl.doppelt });
const st = pl.zeilen.find((z) => z.template_key === 'stairs');
check('Wochentage sortiert ohne Doppelte, Start, Turnus-Spalten wie die App (serviceToRow)', gleich(st.weekdays, [1, 4]) && st.start_on === '2027-03-01' && st.month_day === null && st.sort === 0 && st.notes === null);
const ms = U.planLeistungen({ objektIds: ['p9'], vorlagen: [vl('meters'), vl('hedge', { weekdays: [3] })], vorhandene: [], startOn: '2027-03-01', neueId }).zeilen;
check('monatlich: month_day gesetzt, keine Wochentage; nach Bedarf: keine Tage', ms[0].month_day === 31 && gleich(ms[0].weekdays, []) && ms[1].cadence === 'on_demand' && gleich(ms[1].weekdays, []) && ms[1].month_day === null);
check('Zeile hat genau die Spalten für ObjektDex.service (ohne org_id)', gleich(Object.keys(st).sort(), ['cadence', 'id', 'month_day', 'name', 'notes', 'property_id', 'sort', 'start_on', 'template_key', 'weekdays']));
if (existsSync(path.join(OD, 'mobile/src/types.ts'))) {
  const appTypes = liesRepo(OD, 'mobile/src/types.ts');
  const keys = [...appTypes.matchAll(/\{ key: '([a-z]+)', name: '([^']+)',[^}]*?cadence: '([a-z_]+)', weekdays: \[([\d, ]*)\](?:, monthDay: (\d+))? \}/g)].map(
    (m) => `${m[1]}|${m[2]}|${m[3]}|${m[4].replace(/ /g, '')}|${m[5] ?? ''}`,
  );
  const unsere = SERVICE_TEMPLATES.map((t) => `${t.key}|${t.name}|${t.cadence}|${t.weekdays.join(',')}|${t.monthDay ?? ''}`);
  check('Vorlagen = SERVICE_TEMPLATES der App (Schlüssel, Name, Turnus, Tage)', keys.length === 12 && gleich(keys, unsere), { app: keys, dashboard: unsere });
}
if (pg) {
  const props = (await pg.als(pg.chef, `select id, name from public.property where active order by name`)).rows;
  const svcVorher = (await pg.als(pg.chef, `select property_id, name, template_key, active from public.service`)).rows;
  const ids = props.map((p) => p.id);
  const plan1 = U.planLeistungen({ objektIds: ids, vorlagen: [vl('sweep'), vl('lights'), vl('mow', { weekdays: [3] })], vorhandene: svcVorher, startOn: '2027-03-01', neueId: () => crypto.randomUUID() });
  const insS = await pg.einfuegen(pg.chef, 'service', plan1.zeilen, pg.orgId);
  check('Leistungen eingefügt (Turnus-Prüfungen des Servers bestanden)', !insS.err && plan1.zeilen.length === ids.length * 3, insS.err);
  const svc = (await pg.als(pg.chef, `select property_id, name, template_key, active from public.service`)).rows;
  const plan2 = U.planLeistungen({ objektIds: ids, vorlagen: [vl('sweep'), vl('bins')], vorhandene: svc, startOn: '2027-03-01', neueId: () => crypto.randomUUID() });
  check('zweiter Durchgang: laufende Leistungen übersprungen, nur neue Vorlage', plan2.doppelt === ids.length && plan2.zeilen.length === ids.length && plan2.zeilen.every((z) => z.template_key === 'bins'));
  const ueb = (await pg.als(pg.chef, `select count(*)::int as n from public.today_overview('2027-03-03')`)).rows?.[0]?.n;
  check('Heute-Übersicht kennt die Objekte mit Leistungen', ueb === ids.length, ueb);
  const wS = await pg.einfuegen(pg.mit, 'service', [{ ...plan2.zeilen[0], id: crypto.randomUUID() }], pg.orgId);
  check('Mitarbeiter darf keine Leistungen anlegen (RLS)', !!wS.err, wS);
  const falsch = await pg.einfuegen(pg.chef, 'service', [{ ...plan2.zeilen[0], id: crypto.randomUUID(), cadence: 'weekly', weekdays: [] }], pg.orgId);
  check('Gegenprobe: wöchentlich ohne Tag lehnt der Server ab (darum vorlageFehler)', !!falsch.err, falsch);
}

// ============================================================================ Ergebnis
console.log(`\n${ok} ok, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
