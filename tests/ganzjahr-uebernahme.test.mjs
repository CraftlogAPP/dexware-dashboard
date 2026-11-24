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
  if (cond) ok++;
  else fail++;
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

// ============================================================================ Excel-Import „Objekte aus Excel“
teil('Excel-Import (WinterDex-Objektliste passt direkt)');
// Der .xlsx-Leser braucht DOMParser (Browser). In Node: @xmldom/xmldom aus dem ObjektDex-App-Repo (nur Test, keine neue
// Abhängigkeit im Dashboard) samt „children“, das xmldom nicht kennt.
const xmldomPfad = path.join(OD, 'mobile/node_modules/@xmldom/xmldom/lib/index.js');
let xlsxLesbar = typeof DOMParser !== 'undefined';
if (!xlsxLesbar && existsSync(xmldomPfad)) {
  const { DOMParser: XP } = (await import(pathToFileURL(xmldomPfad).href)).default;
  const proto = Object.getPrototypeOf(new XP().parseFromString('<a/>', 'application/xml').documentElement);
  if (!('children' in proto)) {
    Object.defineProperty(proto, 'children', { get() { return Array.from(this.childNodes).filter((n) => n.nodeType === 1); } });
  }
  globalThis.DOMParser = XP;
  xlsxLesbar = true;
}
if (!xlsxLesbar) console.log(`  (Rundweg über .xlsx übersprungen: ${xmldomPfad} fehlt)`);
const IMP = await web('src/objektdex/importObjekte.ts');
const TI = await web('src/lib/tableImport.ts');
const XL = await web('src/lib/xlsx.ts');
const { propertySheets } = await web('src/winterdex/exportLists.ts');
const wdProps = WOBJ.map((o) => ({ ...o, org_id: 'org', duty_times: { mo_fr: '06:00-22:00', sa: '06:00-22:00', so: '06:00-22:00' }, created_at: '2026-11-01T08:00:00Z' }));
/** Blatt 1 als Tabelle: echte .xlsx bauen und mit dem Leser des Dashboards lesen (ohne DOMParser: Zellen als Text) */
const lies = async (sheets) => {
  if (xlsxLesbar) return TI.readXlsx(await XL.buildXlsx(sheets, { timeZone: 'Europe/Berlin' }), 0);
  const s0 = sheets[0];
  const rows = [s0.columns.map((c) => c.header), ...s0.rows.map((r) => r.map((v) => (v == null ? '' : typeof v === 'object' ? String(v.v ?? '') : String(v))))];
  return { rows, lines: rows.map((_, i) => i + 1) };
};
const tab = await lies(propertySheets({ id: 'org', name: 'Huber', land: 'AT', address: null, created_at: '' }, wdProps));
const lay = TI.detectFieldLayout(IMP.OD_FIELDS, tab, { name: 0, address: 1 });
check('Spalten der WinterDex-Liste erkannt (Name, Adresse, Auftraggeber, Kontakt, Flächen, Notizen, Koordinaten)', ['name', 'address', 'customer', 'contact', 'areas', 'notes', 'lat', 'lng'].every((k) => lay.mapping[k] !== undefined) && lay.hasHeader, lay.mapping);
const odVorh = [{ id: 'x', name: 'Bauhof', address: 'Industriestraße 9, 8200 Gleisdorf', active: true }];
const ip = IMP.planObjekte({ table: lay.table, hasHeader: lay.hasHeader, mapping: lay.mapping, existing: odVorh });
const zeile = (name) => ip.rows.find((r) => r.title === name);
check('alle 5 Zeilen gelesen: 3 neu, 1 schon vorhanden (Name + Adresse), 1 ohne Adresse übersprungen', ip.count.ok === 3 && ip.count.exists === 1 && ip.count.skip === 1, ip.count);
check('Flächen → Notiz, Koordinaten übernommen', zeile('WEG Hauptplatz 1')?.payload?.notes === 'Flächen: Gehsteig 30 m, Zufahrt\nSchlüssel im Kasten' && Math.abs(zeile('WEG Hauptplatz 1').payload.lat - WOBJ[0].lat) < 1e-6, zeile('WEG Hauptplatz 1')?.payload);
check('ohne Koordinaten bleibt ohne (kein Hinweis)', zeile('Gemeindeamt')?.payload?.lat === null && zeile('Gemeindeamt').hints.length === 0);
check('Pflichtzeiten fallen weg (Hinweis), Saison-Pause wird aktiv angelegt (kein active-Feld)', ip.notes.some((x) => /Pflichtzeiten/.test(x)) && !('active' in zeile('Volksschule').payload));
check('Zeile hat genau die Spalten für ObjektDex.property (ohne id/org_id)', gleich(Object.keys(zeile('Volksschule').payload).sort(), ['address', 'contact_person', 'customer_contact', 'customer_name', 'lat', 'lng', 'name', 'notes']));
// eigene Liste mit „Ansprechpartner vor Ort“, Straße/Hausnummer/PLZ/Ort und kaputten Koordinaten
const eigene = TI.tableFromPaste('Objekt\tStraße\tHausnr.\tPLZ\tOrt\tHausverwaltung\tAnsprechpartner vor Ort\tBreitengrad\tLängengrad\nWohnanlage A\tLindenweg\t4\t8010\tGraz\tHV Graz\tHr. Kern\t47,07\t15,44\nWohnanlage B\tLindenweg\t6\t8010\tGraz\t\t\t47,07\t\nWohnanlage A\tLindenweg\t4\t8010\tGraz\t\t\t\t');
const el = TI.detectFieldLayout(IMP.OD_FIELDS, eigene);
const ep = IMP.planObjekte({ table: el.table, hasHeader: el.hasHeader, mapping: el.mapping, existing: [] });
check('Straße + Nr. + PLZ + Ort → Adresse, Komma-Zahlen als Koordinaten, Ansprechpartner vor Ort', ep.rows[0].payload?.address === 'Lindenweg 4, 8010 Graz' && ep.rows[0].payload.lat === 47.07 && ep.rows[0].payload.lng === 15.44 && ep.rows[0].payload.contact_person === 'Hr. Kern' && ep.rows[0].payload.customer_name === 'HV Graz', { p: ep.rows[0].payload, m: el.mapping });
check('halbe Koordinate → ohne angelegt, mit Hinweis', ep.rows[1].payload?.lat === null && ep.rows[1].hints.length === 1);
check('doppelte Zeile in der Liste → „doppelt“', ep.rows[2].status === 'dup');
const sel = new Set(ip.rows.filter((r) => r.status === 'ok').map((r) => r.i));
let fin = IMP.endAuswahl(ip, sel, odVorh, 1);
check('Gratis mit 1 freiem Platz: nur die erste angehakte Zeile', fin.rows.length === 1 && fin.overLimit === 2);
fin = IMP.endAuswahl(ip, sel, [...odVorh, { name: 'Gemeindeamt', address: 'Hauptplatz 5/2' }], null);
check('inzwischen vorhanden (gleicher Name, Adresse ohne PLZ) → nicht noch einmal', fin.already === 1 && fin.rows.length === 2);
check('Grenzen-Text: unklare Pro-Auskunft wird gesagt', /ließ sich gerade nicht prüfen/.test(IMP.limitText({ pro: null, aktiv: 0 }, 2)) && /angelegt wird jetzt nichts/.test(IMP.limitText({ pro: false, aktiv: 2 }, 0)));
const vorlage = await lies(IMP.vorlageSheets());
const vl2 = TI.detectFieldLayout(IMP.OD_FIELDS, vorlage);
check('eigene Vorlage wird wieder vollständig erkannt', IMP.VORLAGE_SPALTEN.length === Object.keys(vl2.mapping).length && IMP.planObjekte({ ...vl2, existing: [] }).count.ok === 2, vl2.mapping);

teil('Excel-Liste der Einsätze');
const EX = await web('src/objektdex/exportEinsaetze.ts');
const eprops = [
  { id: 'p1', name: 'WEG Hauptplatz 1', address: 'Hauptplatz 1', customer_name: 'HV Muster', active: true },
  { id: 'p2', name: 'Volksschule', address: 'Schulweg 3', customer_name: null, active: true },
  { id: 'p3', name: 'Pausiert', address: 'X', customer_name: null, active: false },
];
const op = (id, pid, start, end, services, extra = {}) => ({
  id, property_id: pid, started_at: start, ended_at: end, lat: 47, lng: 15, gps_accuracy_m: 7.6, gps_mocked: null, service_ids: [],
  services: services.map((name, i) => ({ id: `s${i}`, name })), photo_count: 0, notes: null, performer_name: 'Lena K.', received_at: null,
  distance_m: 5, entry_hash: 'abcdef0123456789', canceled: false, cancel_reason: null, canceled_at: null, ...extra,
});
const eops = [
  op('o2', 'p1', '2027-04-02T06:00:00Z', '2027-04-02T07:30:00Z', ['Rasen mähen', 'Kehren'], { photo_count: 2, notes: 'alles gut' }),
  op('o1', 'p1', '2027-04-01T06:00:00Z', '2027-04-01T06:45:00Z', ['Kehren']),
  op('o3', 'p2', '2027-04-03T21:30:00Z', '2027-04-03T22:30:00Z', [], { lat: null, lng: null }),
  op('o4', 'p2', '2027-04-04T08:00:00Z', null, ['Kehren'], { gps_mocked: true }),
  op('o5', 'p1', '2027-04-05T08:00:00Z', '2027-04-05T09:00:00Z', ['Kehren'], { canceled: true, cancel_reason: 'falsches Objekt', canceled_at: '2027-04-05T10:00:00Z' }),
];
const sh = EX.einsatzSheets({ orgName: 'Huber', properties: eprops, ops: eops, from: '2027-04-01', to: '2027-04-30', propertyId: null, person: '' });
check('Blätter: Einsätze, Je Objekt, Je Leistung, Storniert, Info', gleich(sh.map((s) => s.name), ['Einsätze', 'Je Objekt', 'Je Leistung', 'Storniert', 'Info']));
const haupt = sh[0];
check('Spalten: Datum … Leistungen, Durchgeführt von, Fotos, GPS, Notiz, Prüfcode', gleich(haupt.columns.map((c) => c.header), ['Datum', 'Beginn', 'Ende', 'Dauer (Std.)', 'Objekt', 'Adresse', 'Auftraggeber', 'Leistungen', 'Durchgeführt von', 'Fotos', 'GPS-Stempel', 'Notiz', 'Prüfcode']));
check('chronologisch, ohne Storno', gleich(haupt.rows.map((r) => r[0]), ['2027-04-01T06:00:00Z', '2027-04-02T06:00:00Z', '2027-04-03T21:30:00Z', '2027-04-04T08:00:00Z']));
check('Dauer in Stunden (2 Stellen), ohne Ende leer', gleich(haupt.rows.map((r) => r[3]), [0.75, 1.5, 1, null]));
check('Leistungen, Fotos ja/nein, GPS', haupt.rows[1][7] === 'Rasen mähen, Kehren' && haupt.rows[1][9] === 'ja (2)' && haupt.rows[0][9] === 'nein' && haupt.rows[0][10] === 'ja (±8 m)' && haupt.rows[2][7] === 'Kontrolle vor Ort' && haupt.rows[2][10] === 'nein' && haupt.rows[3][10] === 'Fake-GPS gemeldet');
check('Ende an einem anderen Tag (Berlin) mit Datum', typeof haupt.rows[2][2] === 'object' && haupt.rows[2][2].kind === 'datetime' && typeof haupt.rows[0][2] === 'string', haupt.rows[2][2]);
const jeObj = sh[1].rows;
check('Je Objekt: Auftraggeber zuerst, Summen, Storno gezählt, pausiertes Objekt fehlt', gleich(jeObj.map((r) => [r[0], r[3], r[4], r[5], r[6], r[9]]), [['WEG Hauptplatz 1', 2, 2.25, 0, 1, 1], ['Volksschule', 2, 1, 1, 0, 0]]), jeObj);
check('Je Leistung: Kehren 3× (p1 2×, p2 1×), Rasen 1×, Kontrolle vor Ort 1×', gleich(sh[2].rows.map((r) => `${r[0]}|${r[2]}|${r[3]}`), ['WEG Hauptplatz 1|Kehren|2', 'WEG Hauptplatz 1|Rasen mähen|1', 'Volksschule|Kehren|1', 'Volksschule|Kontrolle vor Ort|1']), sh[2].rows);
check('Storniert mit Grund', sh[3].rows.length === 1 && sh[3].rows[0][6] === 'falsches Objekt');
const infoText = JSON.stringify(sh[4].rows);
check('Info: Betrieb, Zeitraum, Summe, Hinweis „kein Nachweis“, ohne „rechtssicher/lückenlos“', infoText.includes('Huber') && infoText.includes('01.04.2027 – 30.04.2027') && infoText.includes('kein Nachweis') && !/rechtssicher|lückenlos/i.test(infoText + EX.EXPORT_NOTE));
const mitPerson = EX.einsatzSheets({ orgName: 'Huber', properties: eprops, ops: eops.slice(0, 1), from: '2027-04-01', to: '2027-04-30', propertyId: 'p1', person: ' Lena ' });
check('Filter stehen im Info-Blatt, ohne Storno kein Storno-Blatt', !mitPerson.some((s) => s.name === 'Storniert') && JSON.stringify(mitPerson.at(-1).rows).includes('nur „Lena“') && mitPerson[1].rows.length === 1);
const zurueck = await lies(sh);
check('Datei lässt sich lesen (Blatt „Einsätze“, 4 Zeilen + Kopf)', zurueck.rows.length === 5 && zurueck.rows[0][0] === 'Datum' && zurueck.rows[2][7] === 'Rasen mähen, Kehren', zurueck.rows[2]);
check('keine Fotos/Koordinaten in der Datei', !/storage:|data:image|"lat"|47\.0/.test(JSON.stringify(sh.map((s) => s.rows))));

// ============================================================================ WinterDex: „Nach dem Winter weitermachen“
teil('WinterDex: Nach dem Winter (Betriebstyp, Kacheln, Links, Schalter)');
const G = await web('src/lib/ganzjahr.ts');
const typ = (name, email = '') => G.betriebstyp(name, email);
check('Gemeinde: Name, .gv.at, gde@, Bauhof, Stadt/Markt am Wortanfang', ['Marktgemeinde Gnas', 'Stadtgemeinde Gleisdorf', 'Bauhof Feldbach', 'Wirtschaftshof Weiz', 'Stadt Graz', 'Markt Hartmannsdorf', 'Bauamt Musterstadt'].every((n) => typ(n) === 'gemeinde') && typ('Winterdienst', 'bauhof@gnas.gv.at') === 'gemeinde' && typ('X', 'gde@st-anna.at') === 'gemeinde');
check('keine Gemeinde: Neustadt, Supermarkt, Gesamtservice', typ('Hausbetreuung Neustadt') === 'hausbetreuung' && typ('Supermarkt Huber') === 'unbekannt' && typ('Gesamtservice Berger') === 'unbekannt');
check('Hausbetreuung (auch mit „Winterdienst“ im Namen)', ['Hausbetreuung & Winterdienst Huber', 'Hausmeisterservice Kern', 'Reinigung Gruber', 'Immobilien Graz', 'Objektservice Brandl'].every((n) => typ(n) === 'hausbetreuung'));
check('GaLaBau/Winterdienst (Umlaute egal)', ['Huber Garten- und Landschaftsbau', 'Grünraumpflege Müller', 'Winterdienst Pichler', 'Schneeräumung Gruber', 'Lohnunternehmen Hofer', 'Erdbau Weber'].every((n) => typ(n) === 'galabau') && typ('Firma X', 'office@gartenbau-x.at') === 'galabau');
check('unbekannt ohne Treffer', typ('Huber GmbH', 'info@huber.at') === 'unbekannt' && typ(null, null) === 'unbekannt');
check('Reihenfolge laut 5.4, höchstens 3, ObjektDex außer Gemeinde zuerst', gleich(G.kacheln('gemeinde'), ['spieldex', 'objektdex', 'baumdex']) && gleich(G.kacheln('galabau'), ['objektdex', 'baumdex', 'spieldex']) && gleich(G.kacheln('hausbetreuung'), ['objektdex', 'spieldex']) && gleich(G.kacheln('unbekannt'), ['objektdex', 'spieldex', 'baumdex']));
check('BaumDex nur bei Hausbetreuung weggelassen', ['gemeinde', 'galabau', 'unbekannt'].every((t) => G.kacheln(t).includes('baumdex')) && !G.kacheln('hausbetreuung').includes('baumdex'));
const utm = 'utm_source=winterdex&utm_medium=dashboard&utm_campaign=nach-dem-winter';
check('Links: Websites mit Herkunft, nie Google Play', ['objektdex', 'spieldex', 'baumdex'].every((a) => G.websiteLink(a) === `https://${a}.dexware.app/?${utm}`) && G.KOMMUNAL_LINK.endsWith(utm));
check('Übernahme-Adresse = Route im ObjektDex-Bereich', G.UEBERNAHME_PFAD === '/app/objektdex/aus-winterdex' && /<Route path="aus-winterdex"/.test(liesWeb('src/objektdex/ObjektdexArea.tsx')));
check('Schalter OBJEKTDEX_OEFFENTLICH steht auf false (ObjektDex noch nicht öffentlich)', G.OBJEKTDEX_OEFFENTLICH === false);
const wdArea = liesWeb('src/winterdex/WinterdexArea.tsx');
check('WinterDex-Bereich: Eintrag UND Adresse hängen am Schalter', /\{OBJEKTDEX_OEFFENTLICH && \(\s*<Route\s+path="nach-dem-winter"/.test(wdArea) && /\{OBJEKTDEX_OEFFENTLICH && \(\s*<NavLink to=\{`\$\{base\}\/nach-dem-winter`\}/.test(wdArea) && (wdArea.match(/nach-dem-winter/g) ?? []).length === 2);
const reg = liesWeb('src/apps/registry.ts');
check('ObjektDex-Bereich bleibt unlisted', /id: 'objektdex',[\s\S]{0,500}?unlisted: true/.test(reg));
const ndw = liesWeb('src/winterdex/pages/NachDemWinter.tsx');
check('Seite ohne Play-Link und ohne „rechtssicher/lückenlos“, Übernahme nur für Inhaber', !/play\.google|market:\/\//.test(ndw) && !/rechtssicher|lückenlos/i.test(ndw) && /id === 'objektdex' && inhaber/.test(ndw));

// ============================================================================ Gratis-Grenze von Hand
teil('Gratis-Grenze von Hand (Formular, Wieder aktivieren, Team-Code)');
const GR = await web('src/objektdex/grenze.ts');
check('ohne Pro bei 2 aktiven: gesperrt mit Erklärung; bei 1 aktivem frei', /2 aktive Objekte möglich/.test(GR.objektGrenzeText(false, 2) ?? '') && GR.objektGrenzeText(false, 1) === null);
check('Pro oder unklare Auskunft: ein einzelnes Objekt wird nie gesperrt', GR.objektGrenzeText(true, 9) === null && GR.objektGrenzeText(null, 9) === null);
check('Übernahme nutzt dieselben Werte (Re-Export)', U.GRATIS_OBJEKTE === GR.GRATIS_OBJEKTE && U.gratisRahmen === GR.gratisRahmen);
const pd = liesWeb('src/objektdex/pages/PropertyDetail.tsx');
check('„Objekt anlegen“ und „Wieder aktivieren“ prüfen die Grenze', pd.includes('if (!property) await grenzePruefen(data);') && pd.includes('if (!p.active) await grenzePruefen(data);'));
if (existsSync(path.join(OD, 'mobile/src/screens/TeamScreen.tsx'))) {
  check('App zeigt den Team-Code nur mit Pro — Dashboard ebenso', /if \(await isPro\(\)\) setTeamCode/.test(liesRepo(OD, 'mobile/src/screens/TeamScreen.tsx')) && /manages && pro !== false \? data\.teamCode\(false\)/.test(liesWeb('src/objektdex/pages/Team.tsx')));
}

// ============================================================================ Ergebnis
console.log(`\n${ok} ok, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
