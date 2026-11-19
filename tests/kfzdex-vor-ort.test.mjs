// Prüft gegen das ECHTE KfzDex-Schema (PGlite = Postgres im Speicher — NIE die echte Datenbank), ob der Server die
// Zeilen annimmt, die „Vor Ort“ im Browser schreibt: UVV-Prüfung und Führerscheinkontrolle, dazu das Nachziehen der
// Frist am Fahrzeug bzw. Fahrer. Die Zeilen baut genau der Code der Web-Oberfläche (src/kfzdex/vorOrt/rows.ts).
// Zusätzlich am Quelltext der App: gleiche Spalten wie insertUvvInspection/insertLicenseCheck, gleiche Checkliste,
// gleiche Gratis-Grenzen, gleiche Ergebnis-Regel.
//
//   Aufruf:  node tests/kfzdex-vor-ort.test.mjs
//   Braucht: das App-Repo (Standard: ../KfzDex auf dem Desktop, sonst Umgebungsvariable KFZDEX_REPO) mit installierten
//            SQL-Tests (supabase/tests: npm install) — von dort kommt PGlite, das Dashboard bekommt keine neue Abhängigkeit.
//   Node ab 22.18 (liest die .ts-Dateien direkt).
//
// NICHT geprüft wird hier (läuft nicht in PGlite): PostgREST selbst (z. B. der Filter „last_uvv.is.null,last_uvv.lt.…“
// — hier als gleichbedeutendes SQL), und die Erweiterung http (als Attrappe, die „nicht erreichbar“ antwortet).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.KFZDEX_REPO ?? 'C:/Users/2easy/Desktop/KfzDex';
const pglitePfad = path.join(REPO, 'supabase/tests/node_modules/@electric-sql/pglite/dist/index.js');
if (!existsSync(pglitePfad)) {
  console.error(`PGlite nicht gefunden: ${pglitePfad}\nBitte im KfzDex-Repo unter supabase/tests einmal „npm install“ ausführen (oder KFZDEX_REPO setzen).`);
  process.exit(2);
}
const { PGlite } = await import(pathToFileURL(pglitePfad).href);
const R = await import(pathToFileURL(path.join(here, '../src/kfzdex/vorOrt/rows.ts')).href);
const { buildUvvRow, buildLicenseRow, uvvResult, dueBump, addMonths, newerDay, todayIso, FREE_LIMITS, UVV_INTERVAL_MONTHS } = R;

const lies = (n) => readFileSync(path.join(REPO, 'supabase', n), 'utf8').replace(/\r\n/g, '\n');
const liesApp = (n) => readFileSync(path.join(REPO, n), 'utf8').replace(/\r\n/g, '\n');
const liesWeb = (n) => readFileSync(path.join(here, '..', n), 'utf8').replace(/\r\n/g, '\n');
const ohneErweiterungen = (sql) => sql.replace(/^create extension if not exists [^;]+;/gim, '');
const KEY = 'goog_TESTschluesselABCDEFGHIJKLMN';

let ok = 0;
let fail = 0;
let marke = '';
const check = (name, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${marke}${name}${cond || !extra ? '' : '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`);
};
const gleich = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
const istHash = (h) => /^[0-9a-f]{64}$/.test(h ?? '');
const tag = (d) => (d instanceof Date ? todayIso(d) : String(d).slice(0, 10));

const U = '00000000-0000-4000-8000-0000000000b1'; // Inhaber
const W = '00000000-0000-4000-8000-0000000000b2'; // Mitarbeiter (prüft)
const X = '00000000-0000-4000-8000-0000000000b9'; // Inhaber eines FREMDEN Betriebs
const ORG = '00000000-0000-4000-8000-0000000000a1';
const ORG2 = '00000000-0000-4000-8000-0000000000a2';
const V1 = '00000000-0000-4000-8000-0000000000c1';
const V2 = '00000000-0000-4000-8000-0000000000c2';
const VX = '00000000-0000-4000-8000-0000000000c9'; // Fahrzeug des fremden Betriebs
const F1 = '00000000-0000-4000-8000-0000000000e1';
const F2 = '00000000-0000-4000-8000-0000000000e2';
const P1 = '00000000-0000-4000-8000-0000000000d1';
const P2 = '00000000-0000-4000-8000-0000000000d2';
const P3 = '00000000-0000-4000-8000-0000000000d3';
const K1 = '00000000-0000-4000-8000-0000000000f1';
const HEUTE = '2026-11-19';

// ---------------------------------------------------------------- Aufbau wie im SQL-Test des App-Repos
const test = lies('tests/verwalter.test.mjs');
const BASIS = test.match(/const BASIS = `([\s\S]*?)`;/)?.[1];
const AUFBAU = [...(test.match(/const AUFBAU = \[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (!BASIS || AUFBAU.length === 0) throw new Error('BASIS/AUFBAU in KfzDex/supabase/tests/verwalter.test.mjs nicht gefunden');

async function aufbau(nachtraege = []) {
  const db = new PGlite();
  await db.exec(BASIS);
  for (const f of [...AUFBAU, ...nachtraege]) await db.exec(ohneErweiterungen(lies(f)).replace('__RC_PUBLIC_KEY__', KEY));
  const als = async (uid, fn) => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
    await db.exec('set role authenticated');
    try {
      return await fn();
    } finally {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };
  // wie PostgREST: Objekte gehen als JSON in jsonb-Spalten
  const insert = (table, row) => {
    const keys = Object.keys(row);
    const vals = keys.map((k) => row[k]).map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v));
    return db.query(`insert into ${table} (${keys.join(', ')}) values (${keys.map((_, i) => '$' + (i + 1)).join(', ')})`, vals);
  };
  /** null = angenommen, sonst { code, message } */
  const versuch = async (uid, table, row) => {
    try {
      await als(uid, () => insert(table, row));
      return null;
    } catch (e) {
      return { code: e.code, message: String(e.message) };
    }
  };
  /** Frist nur vorziehen — dasselbe wie backend.ts → bumpDue (PostgREST: .eq('id').or('<col>.is.null,<col>.lt.<date>')) */
  const bump = (uid, b) =>
    als(uid, async () => (await db.query(`update public.${b.table} set ${b.col} = $1, updated_at = now() where id = $2 and (${b.col} is null or ${b.col} < $1)`, [b.date, b.id])).affectedRows);
  await db.exec(`
    insert into auth.users (id, email) values ('${U}', 'chef@example.com'), ('${W}', 'pruefer@example.com'), ('${X}', 'fremd@example.com');
    insert into public.org (id, owner_user_id, name) values ('${ORG}', '${U}', 'Testbetrieb'), ('${ORG2}', '${X}', 'Fremder Betrieb');
    insert into public.org_member (org_id, user_id, role) values ('${ORG}', '${U}', 'owner'), ('${ORG}', '${W}', 'member'), ('${ORG2}', '${X}', 'owner');
    insert into public.vehicle (id, org_id, plate, name, type, last_uvv) values
      ('${V1}', '${ORG}', 'W-12345X', 'Sprinter Bau 1', 'transporter', '2025-10-01'),
      ('${V2}', '${ORG}', 'G-BAU 77', null, 'lkw', null),
      ('${VX}', '${ORG2}', 'X-FREMD 1', null, 'pkw', null);
    insert into public.driver (id, org_id, name, license_classes, check_interval_months, last_check) values
      ('${F1}', '${ORG}', 'Max Huber', 'B, BE', 6, '2026-04-01'),
      ('${F2}', '${ORG}', 'Anna Steiner', null, 12, null);
  `);
  return { db, als, versuch, bump };
}

// ---------------------------------------------------------------- 0) Web-Code gegen den Quelltext der App
function gegenApp() {
  const queries = liesApp('src/lib/queries.ts');
  const spalten = (fn) => {
    const start = queries.indexOf(`export async function ${fn}(`);
    const block = queries.slice(start).match(/\.insert\(\{\n([\s\S]*?)\n    \}\)/)?.[1] ?? '';
    return [...block.matchAll(/^\s{6}(?:\.\.\.\(id \? \{ (\w+) \}|(\w+):)/gm)].map((m) => m[1] ?? m[2]).sort();
  };
  const CHECK_APP = [...liesApp('src/lib/uvv.ts').matchAll(/\{ id: '(\w+)', label: '([^']+)' \}/g)].map((m) => `${m[1]}=${m[2]}`);
  const CHECK_WEB = [...(liesWeb('src/kfzdex/types.ts').match(/export const CHECK_ITEMS[\s\S]*?\n\];/)?.[0] ?? '').matchAll(/\{ id: '(\w+)', label: '([^']+)' \}/g)].map((m) => `${m[1]}=${m[2]}`);
  check('Checkliste: 10 Punkte, Kennung und Bezeichnung wortgleich zur App (src/lib/uvv.ts)', CHECK_APP.length === 10 && JSON.stringify(CHECK_APP) === JSON.stringify(CHECK_WEB), { app: CHECK_APP.length, web: CHECK_WEB.length });
  const ids = CHECK_APP.map((c) => c.split('=')[0]);

  const uvv = buildUvvRow({ id: P1, orgId: ORG, vehicleId: V1, date: HEUTE, inspector: ' Max Huber ', pointIds: ids, checked: Object.fromEntries(ids.map((i) => [i, true])), defects: '' });
  check('UVV-Zeile hat dieselben Spalten wie insertUvvInspection der App', JSON.stringify(Object.keys(uvv).sort()) === JSON.stringify(spalten('insertUvvInspection')), { web: Object.keys(uvv).sort(), app: spalten('insertUvvInspection') });
  const lic = buildLicenseRow({ id: K1, orgId: ORG, driverId: F1, date: HEUTE, checkedBy: ' Alex ' });
  check('Kontroll-Zeile hat dieselben Spalten wie insertLicenseCheck der App', JSON.stringify(Object.keys(lic).sort()) === JSON.stringify(spalten('insertLicenseCheck')), { web: Object.keys(lic).sort(), app: spalten('insertLicenseCheck') });
  check('Führerscheinfoto wird nie hochgeladen: photo_uri ist immer NULL, Name getrimmt', lic.photo_uri === null && lic.checked_by === 'Alex' && uvv.inspector === 'Max Huber');

  const frei = liesApp('src/lib/purchases.ts').match(/FREE_LIMITS = \{\s*vehicles: (\d+),\s*drivers: (\d+),/);
  check('Gratis-Grenze wie in der App: 1 Fahrzeug, 2 Fahrer', !!frei && FREE_LIMITS.vehicles === Number(frei[1]) && FREE_LIMITS.drivers === Number(frei[2]) && FREE_LIMITS.vehicles === 1 && FREE_LIMITS.drivers === 2, frei?.slice(1));
  check('UVV-Frist 12 Monate wie in der App (UVV_INTERVAL_MONTHS)', UVV_INTERVAL_MONTHS === 12 && /UVV_INTERVAL_MONTHS = 12;/.test(liesApp('src/lib/due.ts')));
  check('Ergebnis-Regel steht so in der App (alle i. O. → bestanden, sonst mit Text „maengel“, ohne „nicht_bestanden“)',
    liesApp('src/screens/UvvCheckScreen.tsx').includes(`result: allOk ? 'bestanden' : defects.trim() ? 'maengel' : 'nicht_bestanden'`));
  const alle = Object.fromEntries(ids.map((i) => [i, true]));
  const einer = { ...alle, reifen: false };
  check('… und so rechnet der Browser', uvvResult(ids, alle, '') === 'bestanden' && uvvResult(ids, einer, ' Reifen ') === 'maengel' && uvvResult(ids, einer, '  ') === 'nicht_bestanden' && uvvResult(ids, {}, '') === 'nicht_bestanden');
  const m = buildUvvRow({ id: P2, orgId: ORG, vehicleId: V1, date: HEUTE, inspector: 'M', pointIds: ids, checked: { reifen: false, bremsen: true }, defects: ' Reifen vorne links unter 3 mm ' });
  check('Checkliste in der Zeile: genau die 10 Punkte, jeder true/false; Mängeltext getrimmt', Object.keys(m.checklist).length === 10 && m.checklist.bremsen === true && m.checklist.reifen === false && m.checklist.lenkung === false && m.defects === 'Reifen vorne links unter 3 mm' && m.result === 'maengel', m);
  check('Bestanden mit stehengebliebenem Mängeltext: der Text wird NICHT gespeichert (Feld ist dann unsichtbar)', buildUvvRow({ id: P1, orgId: ORG, vehicleId: V1, date: HEUTE, inspector: 'M', pointIds: ids, checked: alle, defects: 'alt' }).defects === null);
  check('Frist nachziehen: nur nach bestandener UVV das Fahrzeug, nach jeder Kontrolle der Fahrer',
    gleich(dueBump('uvv', uvv), { table: 'vehicle', col: 'last_uvv', id: V1, date: HEUTE }) && dueBump('uvv', m) === null && gleich(dueBump('license', lic), { table: 'driver', col: 'last_check', id: F1, date: HEUTE }));
  check('Monate addieren wie in der App: 31.08. + 6 = 28.02., 29.02. + 12 = 28.02., 19.11. + 12 = 19.11.',
    tag(addMonths('2026-08-31', 6)) === '2027-02-28' && tag(addMonths('2024-02-29', 12)) === '2025-02-28' && tag(addMonths('2026-11-19', 12)) === '2027-11-19', [tag(addMonths('2026-08-31', 6)), tag(addMonths('2024-02-29', 12))]);
  check('Eine Frist wird nie zurückgesetzt (newerDay)', newerDay('2026-11-19', '2026-01-01') === '2026-11-19' && newerDay(null, '2026-01-01') === '2026-01-01' && newerDay('2026-01-01', '2026-11-19') === '2026-11-19');
  return ids;
}

async function pruefe(ids, nachtraege = []) {
  const t = await aufbau(nachtraege);
  const alle = Object.fromEntries(ids.map((i) => [i, true]));

  // ---------------------------------------------------------------- 1) UVV bestanden — als Mitarbeiter
  const uvv1 = buildUvvRow({ id: P1, orgId: ORG, vehicleId: V1, date: HEUTE, inspector: 'Max Huber', pointIds: ids, checked: alle, defects: '' });
  let r = await t.versuch(W, 'public.uvv_inspection', uvv1);
  check('UVV-Prüfung (bestanden) wird angenommen (Mitarbeiter)', r === null, r);
  let row = (await t.db.query(`select * from public.uvv_inspection where id = '${P1}'`)).rows[0];
  check('… mit Prüfcode (entry_hash) und Server-Eingang; Checkliste, Datum, Prüfer, Ergebnis unverändert',
    istHash(row?.entry_hash) && !!row.received_at && gleich(row.checklist, uvv1.checklist) && tag(row.date) === HEUTE && row.inspector === 'Max Huber' && row.result === 'bestanden' && row.defects === null, row);
  r = (await t.als(W, () => t.db.query(`select * from public.verify_uvv_inspection('${P1}')`))).rows[0];
  check('Prüfcode lässt sich bestätigen (verify_uvv_inspection)', r?.ok === true, r);
  let n = await t.bump(W, dueBump('uvv', uvv1));
  row = (await t.db.query(`select last_uvv from public.vehicle where id = '${V1}'`)).rows[0];
  check('Frist am Fahrzeug wird vorgezogen (last_uvv = heute) — auch durch den Mitarbeiter', n === 1 && tag(row.last_uvv) === HEUTE, { n, row });

  // ---------------------------------------------------------------- 2) Wiederholung (Funkloch, zweiter Versuch)
  r = await t.versuch(W, 'public.uvv_inspection', uvv1);
  check('UVV doppelt gesendet → Fehler 23505 (wertet der Browser als „schon gespeichert“)', r?.code === '23505', r);
  check('… und es gibt sie weiterhin genau einmal', (await t.db.query(`select count(*)::int as n from public.uvv_inspection where id = '${P1}'`)).rows[0].n === 1);
  n = await t.bump(W, dueBump('uvv', uvv1));
  check('Frist erneut nachziehen trifft 0 Zeilen (gilt als erledigt)', n === 0, String(n));
  n = await t.bump(W, { table: 'vehicle', col: 'last_uvv', id: V1, date: '2026-01-15' });
  row = (await t.db.query(`select last_uvv from public.vehicle where id = '${V1}'`)).rows[0];
  check('Ein später nachgesendeter ÄLTERER Nachweis setzt die Frist nicht zurück', n === 0 && tag(row.last_uvv) === HEUTE, { n, row });

  // ---------------------------------------------------------------- 3) UVV mit Mängeln / nicht bestanden
  const einer = { ...alle, reifen: false };
  const uvv2 = buildUvvRow({ id: P2, orgId: ORG, vehicleId: V2, date: HEUTE, inspector: 'Max Huber', pointIds: ids, checked: einer, defects: 'Reifen vorne links unter 3 mm' });
  r = await t.versuch(W, 'public.uvv_inspection', uvv2);
  check('UVV mit Mängeln („maengel“) wird angenommen; die Frist des Fahrzeugs bleibt unberührt', r === null && dueBump('uvv', uvv2) === null && (await t.db.query(`select last_uvv from public.vehicle where id = '${V2}'`)).rows[0].last_uvv === null, r);
  const uvv3 = buildUvvRow({ id: P3, orgId: ORG, vehicleId: V2, date: HEUTE, inspector: 'Max Huber', pointIds: ids, checked: {}, defects: '' });
  r = await t.versuch(W, 'public.uvv_inspection', uvv3);
  check('UVV „nicht_bestanden“ (kein Punkt i. O., kein Text) wird angenommen', r === null && uvv3.result === 'nicht_bestanden', r);
  r = await t.versuch(W, 'public.uvv_inspection', { ...uvv3, id: '00000000-0000-4000-8000-0000000000d4', result: 'ok' });
  check('Unbekanntes Ergebnis wird abgelehnt (nur bestanden/maengel/nicht_bestanden)', r?.code === '23514', r);

  // ---------------------------------------------------------------- 4) Führerscheinkontrolle
  const lic = buildLicenseRow({ id: K1, orgId: ORG, driverId: F1, date: HEUTE, checkedBy: 'Alexander Pfalz' });
  r = await t.versuch(W, 'public.license_check', lic);
  check('Führerscheinkontrolle wird angenommen (Mitarbeiter)', r === null, r);
  row = (await t.db.query(`select * from public.license_check where id = '${K1}'`)).rows[0];
  check('… mit Prüfcode und Server-Eingang, ohne Foto', istHash(row?.entry_hash) && !!row.received_at && row.photo_uri === null && row.checked_by === 'Alexander Pfalz' && tag(row.date) === HEUTE, row);
  r = (await t.als(W, () => t.db.query(`select * from public.verify_license_check('${K1}')`))).rows[0];
  check('Prüfcode lässt sich bestätigen (verify_license_check)', r?.ok === true, r);
  n = await t.bump(W, dueBump('license', lic));
  row = (await t.db.query(`select last_check from public.driver where id = '${F1}'`)).rows[0];
  check('Frist am Fahrer wird vorgezogen (last_check = heute)', n === 1 && tag(row.last_check) === HEUTE, { n, row });
  r = await t.versuch(W, 'public.license_check', lic);
  check('Kontrolle doppelt gesendet → Fehler 23505', r?.code === '23505', r);

  // ---------------------------------------------------------------- 5) Fremder Betrieb
  r = await t.versuch(X, 'public.uvv_inspection', { ...uvv1, id: '00000000-0000-4000-8000-0000000000d7' });
  check('Konto eines fremden Betriebs kann hier keine UVV-Prüfung anlegen', /row-level security/i.test(r?.message ?? ''), r);
  r = await t.versuch(X, 'public.license_check', { ...lic, id: '00000000-0000-4000-8000-0000000000f7' });
  check('… und keine Führerscheinkontrolle', /row-level security/i.test(r?.message ?? ''), r);
  r = await t.versuch(W, 'public.uvv_inspection', { ...uvv1, id: '00000000-0000-4000-8000-0000000000d8', org_id: ORG2, vehicle_id: VX });
  check('Mitarbeiter kann nichts in einen fremden Betrieb schreiben', /row-level security/i.test(r?.message ?? ''), r);
  n = await t.bump(X, { table: 'vehicle', col: 'last_uvv', id: V2, date: HEUTE });
  check('Fremder Betrieb kann die Frist eines Fahrzeugs nicht ändern (0 Zeilen)', n === 0 && (await t.db.query(`select last_uvv from public.vehicle where id = '${V2}'`)).rows[0].last_uvv === null, String(n));
  r = (await t.als(X, () => t.db.query(`select id from public.uvv_inspection union all select id from public.license_check`))).rows;
  check('Fremder Betrieb sieht keinen der Nachweise', r.length === 0, r);

  // ---------------------------------------------------------------- 6) Unveränderlich
  let meldung = '';
  try {
    await t.db.query(`update public.uvv_inspection set inspector = 'x' where id = '${P1}'`);
  } catch (e) {
    meldung = String(e.message);
  }
  check('UVV-Prüfung nachträglich ändern verhindert der Schutz-Trigger (selbst mit vollen Rechten)', meldung !== '', meldung);
  meldung = '';
  try {
    await t.db.query(`update public.license_check set checked_by = 'x' where id = '${K1}'`);
  } catch (e) {
    meldung = String(e.message);
  }
  check('… ebenso die Führerscheinkontrolle', meldung !== '', meldung);
  const geaendert = await t.als(W, async () => (await t.db.query(`update public.uvv_inspection set inspector = 'x' where id = '${P1}'`)).affectedRows).catch(() => 0);
  check('… für App-Konten ohnehin wirkungslos', geaendert === 0, String(geaendert));

  // ---------------------------------------------------------------- 7) Was die Listen lesen und zählen (Mitarbeiter)
  r = (await t.als(W, () => t.db.query(`select * from public.vehicle order by plate`))).rows;
  check('Fahrzeug-Liste ist lesbar (nur der eigene Betrieb)', r.length === 2 && r.every((v) => v.org_id === ORG), r.map((v) => v.plate));
  r = (await t.als(W, () => t.db.query(`select * from public.driver order by name`))).rows;
  check('Fahrer-Liste ist lesbar (Intervall und letzte Kontrolle)', r.length === 2 && r[1].check_interval_months === 6 && tag(r[1].last_check) === HEUTE, r.map((d) => d.name));
  r = (await t.als(W, () => t.db.query(`select (select count(*)::int from public.vehicle) as v, (select count(*)::int from public.driver) as d`))).rows[0];
  check('Zählung für die Gratis-Grenze klappt (2 Fahrzeuge ≥ 1, 2 Fahrer ≥ 2 → Pro-Frage an den Server)', r?.v === 2 && r.d === 2 && r.v >= FREE_LIMITS.vehicles && r.d >= FREE_LIMITS.drivers, r);
  r = (await t.als(W, () => t.db.query(`select public.org_pro_active() as pro`))).rows[0];
  check('org_pro_active() antwortet „unbekannt“ (NULL), wenn der Anbieter nicht erreichbar ist → Browser sperrt dann nicht', r?.pro === null, r);
}

console.log(`\n=== KfzDex — echtes Schema aus ${path.join(REPO, 'supabase')}`);
const ids = gegenApp();
await pruefe(ids);
console.log('--- KfzDex: mit den Nachträgen Verwalter (13.11.) und Team-Code (14.11.)');
marke = '[Nachträge] ';
await pruefe(ids, ['NACHTRAG-VERWALTER-2026-11-13.sql', 'NACHTRAG-TEAMCODE-2026-11-14.sql']);

console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
