// Prüft gegen das ECHTE LeiterDex-Schema (PGlite = Postgres im Speicher — NIE die echte Datenbank), ob der Server
// die Zeilen annimmt, die „Vor Ort“ im Browser schreibt: Prüfung (mit/ohne GPS, mit Unterschrift) und Mangel.
// Die Zeilen baut genau der Code der Web-Oberfläche (src/pruefen/rows.ts).
//
//   Aufruf:  node tests/pruefen-vor-ort.test.mjs
//   Braucht: das LeiterDex-Repo (Standard: ../LeiterDex neben dem Dashboard-Ordner auf dem Desktop, sonst
//            Umgebungsvariable LEITERDEX_REPO) mit installierten SQL-Tests (supabase/tests: npm install) —
//            von dort kommt PGlite, das Dashboard bekommt keine neue Abhängigkeit.
//   Node ab 22.18 (liest die .ts-Datei direkt).
//
// NICHT geprüft wird hier (läuft nicht in PGlite): PostgREST (Fehlercode PGRST204 bei fehlender Spalte), der echte
// Foto-Speicher (nur dessen Zugriffsregeln an einer nachgebauten Tabelle storage.objects) und die Erweiterung http
// (als Attrappe, die „nicht erreichbar“ antwortet).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.LEITERDEX_REPO ?? 'C:/Users/2easy/Desktop/LeiterDex';
const sqlDir = path.join(REPO, 'supabase');
const pglite = path.join(sqlDir, 'tests/node_modules/@electric-sql/pglite/dist/index.js');
if (!existsSync(pglite)) {
  console.error(`PGlite nicht gefunden: ${pglite}\nBitte im LeiterDex-Repo unter supabase/tests einmal „npm install“ ausführen (oder LEITERDEX_REPO setzen).`);
  process.exit(2);
}
const { PGlite } = await import(pathToFileURL(pglite).href);
const { buildInspectionRow, buildDefectRow, photoPath, STORAGE_PREFIX } = await import(
  pathToFileURL(path.join(here, '../src/pruefen/rows.ts')).href
);

const lies = (n) => readFileSync(path.join(sqlDir, n), 'utf8').replace(/\r\n/g, '\n');
// Was Supabase mitbringt (Rollen, auth.uid(), Storage-Tabellen, http-Attrappe): derselbe Nachbau wie im SQL-Test des App-Repos.
const vorlage = lies('tests/verwalter.test.mjs');
const basis = vorlage.match(/const BASIS = `([\s\S]*?)`;/)?.[1];
if (!basis) throw new Error('BASIS in supabase/tests/verwalter.test.mjs nicht gefunden');
const ohneErweiterungen = (sql) => sql.replace(/^create extension if not exists [^;]+;/gim, '');
const KEY = 'goog_TESTschluesselABCDEFGHIJKLMN';

// Reihenfolge wie live / Neuinstallation (schema.sql → Zusatz → team-stufen.sql → GPS-Prüfnachweis → Nachträge)
const VOR = ['migration-2026-07-11-org-expert-interval.sql', 'migrations/2026-10-29_signatur.sql', 'fix-membership-rls.sql'];
const NACH = ['gps-pruefnachweis.sql', 'NACHTRAG-RUNDUMCHECK-2026-11-10.sql', 'NACHTRAG-TEAM-PRO-2026-11-12.sql'];

async function aufbau({ ohneSignatur = false } = {}) {
  const db = new PGlite();
  await db.exec(basis);
  await db.exec(ohneErweiterungen(lies('schema.sql')));
  for (const f of VOR) if (!(ohneSignatur && f.includes('signatur'))) await db.exec(ohneErweiterungen(lies(f)));
  await db.exec(ohneErweiterungen(lies('team-stufen.sql')).replace('__RC_PUBLIC_KEY__', KEY));
  for (const f of NACH) await db.exec(ohneErweiterungen(lies(f)));
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
  // wie PostgREST: Objekte/Listen gehen als JSON in jsonb-Spalten
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
  return { db, als, insert, versuch };
}

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`);
};

// jsonb sortiert die Schlüssel um — verglichen wird der Inhalt, nicht die Reihenfolge
const gleich = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());

// ---------------------------------------------------------------- Konfiguration: Test und Oberfläche müssen dieselben Spalten meinen
const cfgText = readFileSync(path.join(here, '../src/leiterdex/vorOrt.ts'), 'utf8');
const CFG = { cols: { unitFk: 'ladder_id', blocked: 'ladder_blocked', retired: 'retired' } };
check(
  'LeiterDex-Konfiguration nennt die Spalten, die hier geprüft werden',
  cfgText.includes("unitFk: 'ladder_id'") && cfgText.includes("blocked: 'ladder_blocked'") && cfgText.includes("inspection: 'inspection', defect: 'defect'") &&
    cfgText.includes("photoFolders: { inspection: 'inspection', defect: 'defect' }"),
);

// ---------------------------------------------------------------- Daten
const U = '00000000-0000-4000-8000-0000000000b1'; // Inhaber
const W = '00000000-0000-4000-8000-0000000000b2'; // Mitarbeiter (prüft)
const X = '00000000-0000-4000-8000-0000000000b9'; // Inhaber eines FREMDEN Betriebs
const ORG = '00000000-0000-4000-8000-0000000000a1';
const ORG2 = '00000000-0000-4000-8000-0000000000a2';
const SITE = '00000000-0000-4000-8000-0000000000e1';
const LADDER = '00000000-0000-4000-8000-0000000000c1';
const DATEN = `
  insert into auth.users (id, email) values ('${U}', 'chef@example.com'), ('${W}', 'pruefer@example.com'), ('${X}', 'fremd@example.com');
  insert into public.org (id, name) values ('${ORG}', 'Testbetrieb'), ('${ORG2}', 'Fremder Betrieb');
  insert into public.membership (org_id, user_id, role) values ('${ORG}', '${U}', 'owner'), ('${ORG}', '${W}', 'worker'), ('${ORG2}', '${X}', 'owner');
  insert into public.site (id, org_id, name, address, lat, lng) values ('${SITE}', '${ORG}', 'Werkstatt Nord', 'Industriestraße 12', 47.0712, 15.4412);
  insert into public.ladder (id, org_id, site_id, name, category, material) values ('${LADDER}', '${ORG}', '${SITE}', 'L-001', 'Stehleiter', 'Aluminium');
`;
const t = await aufbau();
await t.db.exec(DATEN);

// 1 × 1 px PNG — steht für die Unterschrift (PNG-Daten-URI wie aus dem Zeichenfeld)
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CHECKLIST = { stiles: 'ok', rungs: 'defect', feet: 'ok', spreader: 'na', joints: 'ok', connections: 'ok', hooks: 'na', platform: 'na', accessories: 'ok', wood: 'na', marking: 'ok', cleanliness: 'ok' };
const AT = '2026-11-19T10:56:01.207Z';

// ---------------------------------------------------------------- 1) Prüfung mit GPS (Beginn + Ende), Unterschrift, Foto — als Mitarbeiter
const I1 = '00000000-0000-4000-8000-0000000000d1';
const insp1 = {
  ...buildInspectionRow(CFG, {
    id: I1, orgId: ORG, userId: W, siteId: SITE, unitId: LADDER, type: 'expert', at: AT,
    start: { lat: 47.0712, lng: 15.4412, accuracy: 8, at: '2026-11-19T10:50:29.326Z' },
    end: { lat: 47.07121, lng: 15.44119, accuracy: 9, at: '2026-11-19T10:55:58.000Z' },
    checklist: CHECKLIST, notes: '  Fußkappen vorsorglich erneuert ', inspectorName: ' Max Muster ', qualification: 'befähigte Person nach TRBS 1203', signature: SIG,
  }),
  photo_urls: [STORAGE_PREFIX + photoPath(ORG, 'inspection', I1, 1)],
};
check('Zeile: Einheit steht unter ladder_id, Name mit Qualifikation, Notiz getrimmt, Fake-GPS-Felder leer',
  insp1.ladder_id === LADDER && insp1.inspector_name === 'Max Muster (befähigte Person nach TRBS 1203)' && insp1.notes === 'Fußkappen vorsorglich erneuert' &&
    insp1.gps_mocked === null && insp1.end_mocked === null && insp1.started_at === AT && insp1.created_at === AT && insp1.performed_by === W, insp1);
let r = await t.versuch(W, 'public.inspection', insp1);
check('Prüfung mit GPS + Unterschrift wird angenommen (Mitarbeiter)', r === null, r);
let row = (await t.db.query(`select * from public.inspection where id = '${I1}'`)).rows[0];
check('Prüfcode (entry_hash), Version 2 und Server-Eingang entstehen', /^[0-9a-f]{64}$/.test(row?.entry_hash ?? '') && row.hash_version === 2 && !!row.received_at, { h: row?.entry_hash, v: row?.hash_version });
check('Abstand zum Standort rechnet der Server (Beginn 0 m, Ende > 0 m)', row?.distance_m === 0 && row.end_distance_m > 0 && row.end_distance_m < 5, { d: row?.distance_m, e: row?.end_distance_m });
check('Unterschrift, Checkliste, Foto-Pfad und GPS-Stempel stehen unverändert in der Zeile',
  row?.signature === SIG && gleich(row.checklist, CHECKLIST) && row.photo_urls?.[0] === `storage:${ORG}/inspection/${I1}/1.jpg` &&
    row.gps_accuracy_m === 8 && row.end_accuracy_m === 9 && new Date(row.gps_at).toISOString() === '2026-11-19T10:50:29.326Z' && row.gps_mocked === null,
  { sig: row?.signature === SIG, checklist: row?.checklist, foto: row?.photo_urls, gps: [row?.gps_accuracy_m, row?.end_accuracy_m, row?.gps_at, row?.gps_mocked] });
r = (await t.als(W, () => t.db.query(`select * from public.verify_inspection('${I1}')`))).rows[0];
check('Prüfcode lässt sich bestätigen (verify_inspection)', r?.ok === true, r);

// ---------------------------------------------------------------- 2) Prüfung OHNE GPS und ohne Unterschrift
const I2 = '00000000-0000-4000-8000-0000000000d2';
const insp2 = {
  ...buildInspectionRow(CFG, {
    id: I2, orgId: ORG, userId: W, siteId: SITE, unitId: LADDER, type: 'visual', at: AT, start: null, end: null,
    checklist: CHECKLIST, notes: '', inspectorName: '', qualification: 'wird ohne Namen nicht angehängt', signature: '',
  }),
  photo_urls: [],
};
check('Zeile ohne GPS: alle Ortsfelder leer, kein Feld „signature“, kein Name', insp2.lat === null && insp2.end_lat === null && insp2.gps_at === null && !('signature' in insp2) && insp2.inspector_name === null && insp2.notes === null);
r = await t.versuch(W, 'public.inspection', insp2);
check('Prüfung ohne GPS und ohne Unterschrift wird angenommen', r === null, r);
row = (await t.db.query(`select entry_hash, distance_m, end_distance_m, signature, lat from public.inspection where id = '${I2}'`)).rows[0];
check('… mit Prüfcode, ohne Abstand, ohne Unterschrift', /^[0-9a-f]{64}$/.test(row?.entry_hash ?? '') && row.distance_m === null && row.end_distance_m === null && row.signature === null && row.lat === null, row);

// ---------------------------------------------------------------- 3) Wiederholung, fremde Angaben
r = await t.versuch(W, 'public.inspection', insp1);
check('Prüfung doppelt gesendet → Fehler 23505 (wertet der Browser als „schon gespeichert“)', r?.code === '23505', r);
check('… und es gibt sie weiterhin genau einmal', (await t.db.query(`select count(*)::int as n from public.inspection where id = '${I1}'`)).rows[0].n === 1);
r = await t.versuch(W, 'public.inspection', { ...insp2, id: '00000000-0000-4000-8000-0000000000d3', performed_by: U });
check('Prüfung im Namen eines anderen Kontos wird abgelehnt', /row-level security/i.test(r?.message ?? ''), r);
r = await t.versuch(X, 'public.inspection', { ...insp2, id: '00000000-0000-4000-8000-0000000000d4', performed_by: X });
check('Konto eines fremden Betriebs kann hier keine Prüfung anlegen', /row-level security/i.test(r?.message ?? ''), r);

// ---------------------------------------------------------------- 4) Mangel zur Prüfung (mit Sperre und Foto)
const D1 = '00000000-0000-4000-8000-0000000000f1';
const def1 = {
  ...buildDefectRow(CFG, {
    id: D1, orgId: ORG, userId: W, siteId: SITE, unitId: LADDER, inspectionId: I1, at: AT,
    title: ' Sprosse locker ', description: '', severity: 'amber', blocked: true, inspectorName: 'Max Muster',
  }),
  photo_urls: [STORAGE_PREFIX + photoPath(ORG, 'defect', D1, 1), STORAGE_PREFIX + photoPath(ORG, 'defect', D1, 2)],
};
check('Mangel-Zeile: ladder_id, ladder_blocked, Titel getrimmt, Melder = Prüfername (ohne Qualifikation)',
  def1.ladder_id === LADDER && def1.ladder_blocked === true && def1.title === 'Sprosse locker' && def1.description === null && def1.reporter_name === 'Max Muster' && def1.reported_by === W && def1.inspection_id === I1, def1);
r = await t.versuch(W, 'public.defect', def1);
check('Mangel wird angenommen (Mitarbeiter)', r === null, r);
row = (await t.db.query(`select status, severity, ladder_blocked, inspection_id, photo_urls, created_at from public.defect where id = '${D1}'`)).rows[0];
check('Mangel: offen, Orange, gesperrt, hängt an der Prüfung, zwei Foto-Pfade',
  row?.status === 'open' && row.severity === 'amber' && row.ladder_blocked === true && row.inspection_id === I1 && row.photo_urls?.length === 2 && row.photo_urls[1] === `storage:${ORG}/defect/${D1}/2.jpg`, row);
r = await t.versuch(W, 'public.defect', def1);
check('Mangel doppelt gesendet → Fehler 23505', r?.code === '23505', r);
r = await t.versuch(W, 'public.defect', { ...def1, id: '00000000-0000-4000-8000-0000000000f2', reported_by: U });
check('Mangel im Namen eines anderen Kontos wird abgelehnt', /row-level security/i.test(r?.message ?? ''), r);
r = await t.versuch(W, 'public.defect', { ...def1, id: '00000000-0000-4000-8000-0000000000f3', severity: 'gelb' });
check('Unbekannte Ampel-Stufe wird abgelehnt (nur green/amber/red)', r?.code === '23514', r);
r = await t.versuch(W, 'public.inspection', { ...insp2, id: '00000000-0000-4000-8000-0000000000d5', type: 'jaehrlich' });
check('Unbekannte Prüfart wird abgelehnt (nur visual/expert)', r?.code === '23514', r);

// ---------------------------------------------------------------- 5) Unveränderlich
const geaendert = await t.als(W, async () => (await t.db.query(`update public.inspection set notes = 'x' where id = '${I1}'`)).affectedRows);
check('Prüfung nachträglich ändern: für App-Konten wirkungslos (0 Zeilen)', geaendert === 0, String(geaendert));
let gesperrt = '';
try {
  await t.db.query(`update public.inspection set notes = 'x' where id = '${I1}'`);
} catch (e) {
  gesperrt = String(e.message);
}
check('… und selbst mit vollen Rechten verhindert der Schutz-Trigger die Änderung', /append-only/i.test(gesperrt), gesperrt);

// ---------------------------------------------------------------- 6) Foto-Speicher: Zugriffsregeln (nachgebaute Tabelle storage.objects)
const foto = (uid, name) => t.versuch(uid, 'storage.objects', { bucket_id: 'photos', name });
check('Foto-Pfad der Prüfung (<org>/inspection/<id>/1.jpg) darf der Mitarbeiter anlegen', (await foto(W, photoPath(ORG, 'inspection', I1, 1))) === null);
check('Foto-Pfad des Mangels (<org>/defect/<id>/1.jpg) darf der Mitarbeiter anlegen', (await foto(W, photoPath(ORG, 'defect', D1, 1))) === null);
r = await foto(W, photoPath(ORG2, 'inspection', I1, 1));
check('Foto in den Ordner eines fremden Betriebs wird abgelehnt', /row-level security/i.test(r?.message ?? ''), r);
const bucket = (await t.db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'photos'`)).rows[0];
check('Bucket „photos“: privat, 3 MB, nur JPEG (so verkleinert der Browser die Fotos)', bucket?.public === false && Number(bucket.file_size_limit) === 3145728 && String(bucket.allowed_mime_types) === 'image/jpeg', bucket);

// ---------------------------------------------------------------- 7) Was die Listen lesen (Mitarbeiter)
r = (await t.als(W, () => t.db.query(`select id, ladder_id, severity, ladder_blocked from public.defect where status = 'open'`))).rows;
check('Offene Mängel mit Sperr-Vermerk sind für den Mitarbeiter lesbar', r.length === 1 && r[0].ladder_blocked === true && r[0].ladder_id === LADDER, r);
r = (await t.als(W, () => t.db.query(`select id, site_id, name, category, material, retired from public.ladder`))).rows;
check('Einheiten-Liste (Spalten der Konfiguration) ist lesbar', r.length === 1 && r[0].retired === false, r);
r = (await t.als(X, () => t.db.query(`select id from public.inspection`))).rows;
check('Fremder Betrieb sieht keine der Prüfungen', r.length === 0, r);
r = await t.versuch(W, 'public.ladder', { id: '00000000-0000-4000-8000-0000000000c2', org_id: ORG, site_id: SITE, name: 'L-002', category: 'Tritt', material: 'Aluminium' });
check('Einheit anlegen darf nur der Inhaber (Mitarbeiter wird abgelehnt)', /row-level security/i.test(r?.message ?? ''), r);

// ---------------------------------------------------------------- 8) Pro-Auskunft: Anbieter nicht erreichbar → „unbekannt“
r = (await t.als(W, () => t.db.query(`select public.org_pro_active() as pro`))).rows[0];
check('org_pro_active() antwortet „unbekannt“ (NULL), wenn der Anbieter nicht erreichbar ist → Browser sperrt dann nicht', r?.pro === null, r);
const aufrufe = (await t.db.query(`select count(*)::int as n from public.test_http_aufrufe where uri not like '%revenuecat%' and uri not like '%suite-status%'`)).rows[0].n;
check('Kein unerwarteter Aufruf nach außen', aufrufe === 0, String(aufrufe));

// ---------------------------------------------------------------- 9) Datenbank OHNE Unterschrift-Spalte (Stand vor dem 29.10.): Ersatzweg der Oberfläche
const alt = await aufbau({ ohneSignatur: true });
await alt.db.exec(DATEN);
r = await alt.versuch(W, 'public.inspection', insp1);
check('Ohne Spalte „signature“: Postgres meldet 42703 (Spalte fehlt) — darauf reagiert der Ersatzweg', r?.code === '42703' && /signature/.test(r.message), r);
const { signature: _weg, ...ohneSig } = insp1;
r = await alt.versuch(W, 'public.inspection', ohneSig);
check('… dieselbe Prüfung ohne das Feld wird angenommen, mit Prüfcode', r === null && /^[0-9a-f]{64}$/.test((await alt.db.query(`select entry_hash from public.inspection where id = '${I1}'`)).rows[0]?.entry_hash ?? ''), r);

console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
