// Prüft gegen das ECHTE Schema der Prüf-Apps (PGlite = Postgres im Speicher — NIE die echte Datenbank), ob der Server
// die Zeilen annimmt, die „Vor Ort“ im Browser schreibt: Prüfung (mit/ohne GPS, mit Unterschrift) und Mangel.
// Die Zeilen baut genau der Code der Web-Oberfläche (src/pruefen/rows.ts); außer bei LeiterDex kommt auch die
// Konfiguration (Tabellen, Spalten, Checkliste, Prüfarten, Einstufung, Foto-Ordner) direkt aus src/<app>/vorOrt.ts.
//
// Zwei Familien:
//   Einheiten-Modus  LeiterDex, FeuerDex, ToreDex, GurtDex, HebeDex — die Prüfung trägt die Einheit   → pruefe()
//                    HebeDex zusätzlich: Checkliste je Teil-Typ, Messwerte-JSON (Spalte measurements), Prüfcode mit
//                    Messwerten, Rissprüfung, Gratis-Grenze ohne Beispieldaten (der Rechner selbst: hebedex-rechner.test.mjs)
//   Orts-Modus       GerüstDex, RegalDex, SpielDex — die Prüfung trägt nur den Ort (site_id / warehouse_id /
//                    playground_id), der Mangel/Schaden die betroffene Einheit oder keine              → pruefeOrt()
//                    Dort wird zusätzlich am Quelltext der App geprüft, dass die Web-Zeilen dieselben Spalten haben
//                    wie addInspection/addDamage/addDefect und dass Checkliste und Hinweistexte wortgleich sind.
//
//   Aufruf:  node tests/pruefen-vor-ort.test.mjs              (alle Apps)
//            node tests/pruefen-vor-ort.test.mjs gurtdex      (nur eine App; mehrere mit Leerzeichen)
//   Braucht: die App-Repos (Standard: ../LeiterDex, ../FeuerDex, ../ToreDex, ../GurtDex, ../GeruestDex, ../RegalDex,
//            ../SpielDex, ../HebeDex neben dem Dashboard-Ordner auf dem Desktop, sonst Umgebungsvariable LEITERDEX_REPO,
//            FEUERDEX_REPO, TOREDEX_REPO, GURTDEX_REPO, GERUESTDEX_REPO, REGALDEX_REPO, SPIELDEX_REPO, HEBEDEX_REPO) mit
//            installierten SQL-Tests (supabase/tests: npm install) — von dort kommt PGlite, das Dashboard bekommt
//            keine neue Abhängigkeit.
//   Node ab 22.18 (liest die .ts-Dateien direkt).
//
// NICHT geprüft wird hier (läuft nicht in PGlite): PostgREST (Fehlercode PGRST204 bei fehlender Spalte), der echte
// Foto-Speicher (nur dessen Zugriffsregeln an einer nachgebauten Tabelle storage.objects) und die Erweiterung http
// (als Attrappe, die „nicht erreichbar“ antwortet).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = 'C:/Users/2easy/Desktop';

// ---------------------------------------------------------------- je App verschieden
// vor/nach: Reihenfolge wie live / Neuinstallation (schema.sql → vor → team-stufen.sql → nach), wie im SQL-Test des App-Repos.
// unitCols: Pflichtspalten der Einheit (außer id, org_id, site_id, name).
const APPS = {
  leiterdex: {
    name: 'LeiterDex',
    repo: process.env.LEITERDEX_REPO ?? `${DESKTOP}/LeiterDex`,
    vor: ['migration-2026-07-11-org-expert-interval.sql', 'migrations/2026-10-29_signatur.sql', 'fix-membership-rls.sql'],
    nach: ['gps-pruefnachweis.sql', 'NACHTRAG-RUNDUMCHECK-2026-11-10.sql', 'NACHTRAG-TEAM-PRO-2026-11-12.sql'],
    unitCols: { category: 'Stehleiter', material: 'Aluminium' },
    // LeiterDex (Vorlage, unverändert): Die Konfiguration lässt sich mit Node nicht laden (Importe ohne Dateiendung) —
    // geprüft wird am Text, dass sie dieselben Spalten nennt wie hier.
    cfgText: {
      file: 'src/leiterdex/vorOrt.ts',
      muss: ["unitFk: 'ladder_id'", "blocked: 'ladder_blocked'", "inspection: 'inspection', defect: 'defect'", "photoFolders: { inspection: 'inspection', defect: 'defect' }"],
      cfg: {
        tables: { site: 'site', unit: 'ladder', inspection: 'inspection', defect: 'defect' },
        cols: { unitFk: 'ladder_id', blocked: 'ladder_blocked', retired: 'retired' },
        unitSelect: 'id, site_id, name, category, material, retired',
        photoFolders: { inspection: 'inspection', defect: 'defect' },
      },
      checklist: ['stiles', 'rungs', 'feet', 'spreader', 'joints', 'connections', 'hooks', 'platform', 'accessories', 'wood', 'marking', 'cleanliness'],
    },
  },
  feuerdex: {
    name: 'FeuerDex',
    repo: process.env.FEUERDEX_REPO ?? `${DESKTOP}/FeuerDex`,
    vor: ['migrations/2026-10-29_signatur.sql', 'fix-membership-rls.sql'],
    nach: ['gps-pruefnachweis.sql', 'NACHTRAG-RUNDUMCHECK-2026-11-10.sql', 'NACHTRAG-TEAM-PRO-2026-11-12.sql'],
    unitCols: { category: 'Pulver (ABC)', build_type: 'Aufladelöscher' },
    cfgModule: { file: 'src/feuerdex/vorOrt.ts', name: 'FEUERDEX_VOR_ORT' },
    extra: feuerdexExtra,
  },
  toredex: {
    name: 'ToreDex',
    repo: process.env.TOREDEX_REPO ?? `${DESKTOP}/ToreDex`,
    vor: ['migrations/2026-10-29_signatur.sql', 'fix-membership-rls.sql'],
    nach: ['gps-pruefnachweis.sql', 'NACHTRAG-RUNDUMCHECK-2026-11-10.sql', 'NACHTRAG-TEAM-PRO-2026-11-12.sql'],
    unitCols: { category: 'Sectionaltor', drive_type: 'Kraftbetätigt' },
    cfgModule: { file: 'src/toredex/vorOrt.ts', name: 'TOREDEX_VOR_ORT' },
    extra: toredexExtra,
  },
  gurtdex: {
    name: 'GurtDex',
    repo: process.env.GURTDEX_REPO ?? `${DESKTOP}/GurtDex`,
    vor: ['migrations/2026-10-29_signatur.sql', 'fix-membership-rls.sql'],
    nach: ['fix-invite-prefix.sql', 'gps-pruefnachweis.sql', 'NACHTRAG-RUNDUMCHECK-2026-11-10.sql', 'NACHTRAG-TEAM-PRO-2026-11-12.sql'],
    unitCols: { category: 'Auffanggurt (EN 361)' },
    cfgModule: { file: 'src/gurtdex/vorOrt.ts', name: 'GURTDEX_VOR_ORT' },
    extra: gurtdexExtra,
    // Die Live-Datenbank wurde am 15.07.2026 mit repair-psa-item.sql neu aufgebaut (Tabellen gelöscht und neu angelegt)
    // — dieser Weg wird zusätzlich geprüft.
    variante: { name: 'nach repair-psa-item.sql (Weg der Live-Datenbank)', nachSchema: ['repair-psa-item.sql'] },
  },
  // einheit: was bei HebeDex anders ist als bei den vier anderen Einheiten-Apps — Zahl der Checklisten-Punkte (des
  // Teil-Typs der Test-Einheit), vorbelegte Prüfart, Gratis-Grenze; die Unterschrift-Spalte steht schon in schema.sql
  // (kein Stand „ohne Unterschrift“); messwerte: was die Test-Prüfung in die Spalte measurements schreibt.
  hebedex: {
    name: 'HebeDex',
    repo: process.env.HEBEDEX_REPO ?? `${DESKTOP}/HebeDex`,
    vor: [],
    nach: ['gps-pruefnachweis.sql', 'demo-schutz.sql', 'NACHTRAG-RUNDUMCHECK-2026-11-10.sql', 'NACHTRAG-TEAM-PRO-2026-11-12.sql'],
    unitCols: { kind: 'chain' },
    cfgModule: { file: 'src/hebedex/vorOrt.ts', name: 'HEBEDEX_VOR_ORT' },
    einheit: { punkte: 6, erste: 'expert', frei: 3, ohneSignaturStand: false },
    messwerte: { nominal: '10', d1: '9.7', d2: '9.8', pitchNew: '30', pitchMeasured: '30.4' },
    extra: hebedexExtra,
  },
  // ------------------------------------------------------------ Orts-Modus (Prüfung je Ort)
  // ort: was die App vorgibt — Gratis-Grenze in entitlement.ts, Name der Einfüge-Funktion des Mangels, Zahl der Punkte.
  geruestdex: {
    name: 'GerüstDex',
    repo: process.env.GERUESTDEX_REPO ?? `${DESKTOP}/GeruestDex`,
    vor: ['migrations/2026-10-29_signatur.sql', 'fix-membership-rls.sql'],
    nach: ['gps-pruefnachweis.sql', 'NACHTRAG-RUNDUMCHECK-2026-11-10.sql', 'NACHTRAG-TEAM-PRO-2026-11-12.sql'],
    unitCols: { category: 'Fassadengerüst' },
    cfgModule: { file: 'src/geruestdex/vorOrt.ts', name: 'GERUESTDEX_VOR_ORT' },
    ort: { frei: 'sites: 1', addDefect: 'addDamage', punkte: 12, stufen: ['green', 'amber', 'red'], arten: ['visual', 'expert'], faellig: 'expert', sperrStufe: 'amber' },
    extra: geruestdexExtra,
  },
  regaldex: {
    name: 'RegalDex',
    repo: process.env.REGALDEX_REPO ?? `${DESKTOP}/RegalDex`,
    vor: ['migrations/2026-10-29_signatur.sql', 'fix-membership-rls.sql'],
    nach: ['gps-pruefnachweis.sql', 'NACHTRAG-RUNDUMCHECK-2026-11-10.sql', 'NACHTRAG-TEAM-PRO-2026-11-12.sql'],
    unitCols: { category: 'Palettenregal' },
    cfgModule: { file: 'src/regaldex/vorOrt.ts', name: 'REGALDEX_VOR_ORT' },
    ort: { frei: 'warehouses: 1', addDefect: 'addDamage', punkte: 12, stufen: ['green', 'amber', 'red'], arten: ['visual', 'expert'], faellig: 'expert', sperrStufe: 'red' },
    extra: regaldexExtra,
  },
  spieldex: {
    name: 'SpielDex',
    repo: process.env.SPIELDEX_REPO ?? `${DESKTOP}/SpielDex`,
    vor: ['migrations/2026-10-29_signatur.sql', 'fix-membership-rls.sql'],
    nach: ['gps-pruefnachweis.sql', 'NACHTRAG-RUNDUMCHECK-2026-11-10.sql', 'NACHTRAG-TEAM-PRO-2026-11-12.sql'],
    unitCols: { category: 'Schaukel' },
    cfgModule: { file: 'src/spieldex/vorOrt.ts', name: 'SPIELDEX_VOR_ORT' },
    ort: { frei: 'playgrounds: 1', addDefect: 'addDefect', punkte: 10, stufen: ['low', 'medium', 'danger'], arten: ['visual', 'operational', 'main'], faellig: 'main', sperrStufe: 'danger' },
    extra: spieldexExtra,
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

const pglitePfad = (repo) => path.join(repo, 'supabase/tests/node_modules/@electric-sql/pglite/dist/index.js');
for (const a of dran) {
  if (!existsSync(pglitePfad(APPS[a].repo))) {
    console.error(
      `PGlite nicht gefunden: ${pglitePfad(APPS[a].repo)}\nBitte im ${APPS[a].name}-Repo unter supabase/tests einmal „npm install“ ausführen (oder ${a.toUpperCase()}_REPO setzen).`,
    );
    process.exit(2);
  }
}
const { PGlite } = await import(pathToFileURL(pglitePfad(APPS[dran[0]].repo)).href);
const { buildInspectionRow, buildDefectRow, photoPath, STORAGE_PREFIX } = await import(
  pathToFileURL(path.join(here, '../src/pruefen/rows.ts')).href
);

const ohneErweiterungen = (sql) => sql.replace(/^create extension if not exists [^;]+;/gim, '');
const KEY = 'goog_TESTschluesselABCDEFGHIJKLMN';

let ok = 0;
let fail = 0;
let marke = '';
const check = (name, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${marke}${name}${cond || !extra ? '' : '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`);
};

// jsonb sortiert die Schlüssel um — verglichen wird der Inhalt, nicht die Reihenfolge
const gleich = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
const istHash = (h) => /^[0-9a-f]{64}$/.test(h ?? '');

// ---------------------------------------------------------------- Daten (in jeder App gleich)
const U = '00000000-0000-4000-8000-0000000000b1'; // Inhaber
const W = '00000000-0000-4000-8000-0000000000b2'; // Mitarbeiter (prüft)
const X = '00000000-0000-4000-8000-0000000000b9'; // Inhaber eines FREMDEN Betriebs
const ORG = '00000000-0000-4000-8000-0000000000a1';
const ORG2 = '00000000-0000-4000-8000-0000000000a2';
const SITE = '00000000-0000-4000-8000-0000000000e1';
const UNIT = '00000000-0000-4000-8000-0000000000c1';
// 1 × 1 px PNG — steht für die Unterschrift (PNG-Daten-URI wie aus dem Zeichenfeld)
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const AT = '2026-11-19T10:56:01.207Z';
const I1 = '00000000-0000-4000-8000-0000000000d1';
const I2 = '00000000-0000-4000-8000-0000000000d2';
const D1 = '00000000-0000-4000-8000-0000000000f1';
const D2 = '00000000-0000-4000-8000-0000000000f7'; // Orts-Modus: Mangel ohne Einheit („Lager allgemein“)

const sqlText = (v) => `'${String(v).replace(/'/g, "''")}'`;

async function aufbau(app, { ohneSignatur = false, nachSchema = [] } = {}) {
  const sqlDir = path.join(app.repo, 'supabase');
  const lies = (n) => readFileSync(path.join(sqlDir, n), 'utf8').replace(/\r\n/g, '\n');
  // Was Supabase mitbringt (Rollen, auth.uid(), Storage-Tabellen, http-Attrappe): derselbe Nachbau wie im SQL-Test des App-Repos.
  const basis = lies('tests/verwalter.test.mjs').match(/const BASIS = `([\s\S]*?)`;/)?.[1];
  if (!basis) throw new Error(`BASIS in ${app.name}/supabase/tests/verwalter.test.mjs nicht gefunden`);
  const db = new PGlite();
  await db.exec(basis);
  await db.exec(ohneErweiterungen(lies('schema.sql')));
  for (const f of nachSchema) await db.exec(ohneErweiterungen(lies(f)));
  for (const f of app.vor) if (!(ohneSignatur && f.includes('signatur'))) await db.exec(ohneErweiterungen(lies(f)));
  await db.exec(ohneErweiterungen(lies('team-stufen.sql')).replace('__RC_PUBLIC_KEY__', KEY));
  for (const f of app.nach) await db.exec(ohneErweiterungen(lies(f)));
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

function daten(app, cfg) {
  const cols = Object.keys(app.unitCols);
  const siteFk = cfg.cols.siteFk ?? 'site_id';
  return `
  insert into auth.users (id, email) values ('${U}', 'chef@example.com'), ('${W}', 'pruefer@example.com'), ('${X}', 'fremd@example.com');
  insert into public.org (id, name) values ('${ORG}', 'Testbetrieb'), ('${ORG2}', 'Fremder Betrieb');
  insert into public.membership (org_id, user_id, role) values ('${ORG}', '${U}', 'owner'), ('${ORG}', '${W}', 'worker'), ('${ORG2}', '${X}', 'owner');
  insert into public.${cfg.tables.site} (id, org_id, name, address, lat, lng) values ('${SITE}', '${ORG}', 'Werkstatt Nord', 'Industriestraße 12', 47.0712, 15.4412);
  insert into public.${cfg.tables.unit} (id, org_id, ${siteFk}, name, ${cols.join(', ')}) values ('${UNIT}', '${ORG}', '${SITE}', 'E-001', ${cols.map((c) => sqlText(app.unitCols[c])).join(', ')});
`;
}

/** Konfiguration der App: echt aus src/<app>/vorOrt.ts — oder (LeiterDex) am Text geprüft. */
async function konfiguration(app) {
  if (app.cfgModule) {
    const mod = await import(pathToFileURL(path.join(here, '..', app.cfgModule.file)).href);
    const cfg = mod[app.cfgModule.name];
    check(`Konfiguration ${app.cfgModule.name} lädt (src/${app.cfgModule.file.slice(4)}) — der Test nutzt genau sie`, !!cfg?.tables && !!cfg.cols && Array.isArray(cfg.checklist), Object.keys(mod));
    const liste = cfg.checklistFor ? cfg.checklistFor(app.unitCols) : cfg.checklist;
    return { cfg, checklistIds: liste.map((c) => c.id), liste, mod };
  }
  const text = readFileSync(path.join(here, '..', app.cfgText.file), 'utf8');
  check(`${app.name}-Konfiguration nennt die Spalten, die hier geprüft werden`, app.cfgText.muss.every((m) => text.includes(m)));
  return { cfg: app.cfgText.cfg, checklistIds: app.cfgText.checklist, mod: null };
}

// ---------------------------------------------------------------- der gemeinsame Ablauf (für jede App derselbe)
async function pruefe(app, { nachSchema = [] } = {}) {
  const { cfg, checklistIds, liste, mod } = await konfiguration(app);
  const E = { punkte: 12, erste: 'visual', frei: 2, ohneSignaturStand: true, ...app.einheit };
  // Apps mit Messwerten (HebeDex): die Prüfung trägt die Spalte measurements — mit Messung die Werte, ohne {}
  const MW1 = app.messwerte ? { measurements: app.messwerte } : {};
  const MW0 = app.messwerte ? { measurements: {} } : {};
  const FK = cfg.cols.unitFk;
  const BLOCKED = cfg.cols.blocked;
  const T = { insp: `public.${cfg.tables.inspection}`, def: `public.${cfg.tables.defect}`, unit: `public.${cfg.tables.unit}`, site: `public.${cfg.tables.site}` };
  const t = await aufbau(app, { nachSchema });
  const DATEN = daten(app, cfg);
  await t.db.exec(DATEN);

  // Checkliste wie aus dem Formular: alle Punkte der App, der zweite auf „Mangel“, der vierte „n. z.“
  const CHECKLIST = Object.fromEntries(checklistIds.map((id, i) => [id, i === 1 ? 'defect' : i === 3 ? 'na' : 'ok']));

  if (mod) {
    // -------------------------------------------------------------- Konfiguration in sich stimmig (nur echte Konfigurationen)
    check(`Checkliste: ${E.punkte} Punkte mit eindeutiger Kennung, Bezeichnung und Prüfhinweis`, liste.length === E.punkte && new Set(checklistIds).size === E.punkte && liste.every((c) => c.label && c.hint), checklistIds);
    check('Prüfarten und Ampel-Stufen haben Bezeichnung und Erklärung; Fälligkeits-Art und Vorbelegung gibt es',
      cfg.kinds.every((k) => k.label && k.short && k.hint) && cfg.severities.every((s) => s.label && s.short && s.hint) &&
        cfg.kinds.some((k) => k.id === cfg.dueKind) && cfg.severities.some((s) => s.id === cfg.defaultSeverity) && cfg.kinds[0].id === E.erste,
      { kinds: cfg.kinds.map((k) => k.id), sev: cfg.severities.map((s) => s.id), due: cfg.dueKind, def: cfg.defaultSeverity });
    check(`Gratis-Grenze ${E.frei} Einheiten (wie FREE_LIMITS der App)`, cfg.freeUnits === E.frei, String(cfg.freeUnits));
  }

  // ---------------------------------------------------------------- 1) Prüfung mit GPS (Beginn + Ende), Unterschrift, Foto — als Mitarbeiter
  const insp1 = {
    ...buildInspectionRow(cfg, {
      id: I1, orgId: ORG, userId: W, siteId: SITE, unitId: UNIT, type: 'expert', at: AT,
      start: { lat: 47.0712, lng: 15.4412, accuracy: 8, at: '2026-11-19T10:50:29.326Z' },
      end: { lat: 47.07121, lng: 15.44119, accuracy: 9, at: '2026-11-19T10:55:58.000Z' },
      checklist: CHECKLIST, notes: '  Vorsorglich erneuert ', inspectorName: ' Max Muster ', qualification: 'befähigte Person nach TRBS 1203', signature: SIG, ...MW1,
    }),
    photo_urls: [STORAGE_PREFIX + photoPath(ORG, cfg.photoFolders.inspection, I1, 1)],
  };
  check(`Zeile: Einheit steht unter ${FK}, Name mit Qualifikation, Notiz getrimmt, Fake-GPS-Felder leer`,
    insp1[FK] === UNIT && insp1.inspector_name === 'Max Muster (befähigte Person nach TRBS 1203)' && insp1.notes === 'Vorsorglich erneuert' &&
      insp1.gps_mocked === null && insp1.end_mocked === null && insp1.started_at === AT && insp1.created_at === AT && insp1.performed_by === W, insp1);
  let r = await t.versuch(W, T.insp, insp1);
  check('Prüfung mit GPS + Unterschrift wird angenommen (Mitarbeiter)', r === null, r);
  let row = (await t.db.query(`select * from ${T.insp} where id = '${I1}'`)).rows[0];
  check('Prüfcode (entry_hash), Version 2 und Server-Eingang entstehen', istHash(row?.entry_hash) && row.hash_version === 2 && !!row.received_at, { h: row?.entry_hash, v: row?.hash_version });
  check('Abstand zum Standort rechnet der Server (Beginn 0 m, Ende > 0 m)', row?.distance_m === 0 && row.end_distance_m > 0 && row.end_distance_m < 5, { d: row?.distance_m, e: row?.end_distance_m });
  check('Unterschrift, Checkliste, Foto-Pfad und GPS-Stempel stehen unverändert in der Zeile',
    row?.signature === SIG && gleich(row.checklist, CHECKLIST) && row.photo_urls?.[0] === `storage:${ORG}/inspection/${I1}/1.jpg` &&
      row.gps_accuracy_m === 8 && row.end_accuracy_m === 9 && new Date(row.gps_at).toISOString() === '2026-11-19T10:50:29.326Z' && row.gps_mocked === null,
    { sig: row?.signature === SIG, checklist: row?.checklist, foto: row?.photo_urls, gps: [row?.gps_accuracy_m, row?.end_accuracy_m, row?.gps_at, row?.gps_mocked] });
  r = (await t.als(W, () => t.db.query(`select * from public.verify_inspection('${I1}')`))).rows[0];
  check('Prüfcode lässt sich bestätigen (verify_inspection)', r?.ok === true, r);

  // ---------------------------------------------------------------- 2) Prüfung OHNE GPS und ohne Unterschrift
  const insp2 = {
    ...buildInspectionRow(cfg, {
      id: I2, orgId: ORG, userId: W, siteId: SITE, unitId: UNIT, type: 'visual', at: AT, start: null, end: null,
      checklist: CHECKLIST, notes: '', inspectorName: '', qualification: 'wird ohne Namen nicht angehängt', signature: '', ...MW0,
    }),
    photo_urls: [],
  };
  check('Spalte measurements nur bei Apps mit Messwerten — sonst fehlt das Feld ganz', 'measurements' in insp1 === !!app.messwerte && 'measurements' in insp2 === !!app.messwerte, Object.keys(insp1));
  check('Zeile ohne GPS: alle Ortsfelder leer, kein Feld „signature“, kein Name', insp2.lat === null && insp2.end_lat === null && insp2.gps_at === null && !('signature' in insp2) && insp2.inspector_name === null && insp2.notes === null);
  r = await t.versuch(W, T.insp, insp2);
  check('Prüfung ohne GPS und ohne Unterschrift wird angenommen', r === null, r);
  row = (await t.db.query(`select entry_hash, distance_m, end_distance_m, signature, lat from ${T.insp} where id = '${I2}'`)).rows[0];
  check('… mit Prüfcode, ohne Abstand, ohne Unterschrift', istHash(row?.entry_hash) && row.distance_m === null && row.end_distance_m === null && row.signature === null && row.lat === null, row);

  // ---------------------------------------------------------------- 3) Wiederholung, fremde Angaben
  r = await t.versuch(W, T.insp, insp1);
  check('Prüfung doppelt gesendet → Fehler 23505 (wertet der Browser als „schon gespeichert“)', r?.code === '23505', r);
  check('… und es gibt sie weiterhin genau einmal', (await t.db.query(`select count(*)::int as n from ${T.insp} where id = '${I1}'`)).rows[0].n === 1);
  r = await t.versuch(W, T.insp, { ...insp2, id: '00000000-0000-4000-8000-0000000000d3', performed_by: U });
  check('Prüfung im Namen eines anderen Kontos wird abgelehnt', /row-level security/i.test(r?.message ?? ''), r);
  r = await t.versuch(X, T.insp, { ...insp2, id: '00000000-0000-4000-8000-0000000000d4', performed_by: X });
  check('Konto eines fremden Betriebs kann hier keine Prüfung anlegen', /row-level security/i.test(r?.message ?? ''), r);

  // ---------------------------------------------------------------- 4) Mangel zur Prüfung (mit Sperre und Foto)
  const def1 = {
    ...buildDefectRow(cfg, {
      id: D1, orgId: ORG, userId: W, siteId: SITE, unitId: UNIT, inspectionId: I1, at: AT,
      title: ' Bauteil locker ', description: '', severity: 'amber', blocked: true, inspectorName: 'Max Muster',
    }),
    photo_urls: [STORAGE_PREFIX + photoPath(ORG, cfg.photoFolders.defect, D1, 1), STORAGE_PREFIX + photoPath(ORG, cfg.photoFolders.defect, D1, 2)],
  };
  check(`Mangel-Zeile: ${FK}, ${BLOCKED}, Titel getrimmt, Melder = Prüfername (ohne Qualifikation)`,
    def1[FK] === UNIT && def1[BLOCKED] === true && def1.title === 'Bauteil locker' && def1.description === null && def1.reporter_name === 'Max Muster' && def1.reported_by === W && def1.inspection_id === I1, def1);
  r = await t.versuch(W, T.def, def1);
  check('Mangel wird angenommen (Mitarbeiter)', r === null, r);
  row = (await t.db.query(`select status, severity, ${BLOCKED} as blocked, inspection_id, photo_urls, created_at from ${T.def} where id = '${D1}'`)).rows[0];
  check('Mangel: offen, Orange, gesperrt, hängt an der Prüfung, zwei Foto-Pfade',
    row?.status === 'open' && row.severity === 'amber' && row.blocked === true && row.inspection_id === I1 && row.photo_urls?.length === 2 && row.photo_urls[1] === `storage:${ORG}/defect/${D1}/2.jpg`, row);
  r = await t.versuch(W, T.def, def1);
  check('Mangel doppelt gesendet → Fehler 23505', r?.code === '23505', r);
  r = await t.versuch(W, T.def, { ...def1, id: '00000000-0000-4000-8000-0000000000f2', reported_by: U });
  check('Mangel im Namen eines anderen Kontos wird abgelehnt', /row-level security/i.test(r?.message ?? ''), r);
  r = await t.versuch(W, T.def, { ...def1, id: '00000000-0000-4000-8000-0000000000f3', severity: 'gelb' });
  check('Unbekannte Ampel-Stufe wird abgelehnt (nur green/amber/red)', r?.code === '23514', r);
  r = await t.versuch(W, T.insp, { ...insp2, id: '00000000-0000-4000-8000-0000000000d5', type: 'jaehrlich' });
  check('Unbekannte Prüfart wird abgelehnt (nur visual/expert)', r?.code === '23514', r);
  if (mod) {
    // jede Ampel-Stufe und jede Prüfart der Konfiguration nimmt der Server an (Mangel ohne Sperre, ohne Fotos)
    const abgelehnt = [];
    let n = 0;
    for (const s of cfg.severities) {
      const id = `00000000-0000-4000-8000-0000000001f${++n}`;
      const e = await t.versuch(W, T.def, {
        ...buildDefectRow(cfg, { id, orgId: ORG, userId: W, siteId: SITE, unitId: UNIT, inspectionId: I1, at: AT, title: `Stufe ${s.id}`, description: 'Text', severity: s.id, blocked: false, inspectorName: '' }),
        photo_urls: [],
      });
      if (e) abgelehnt.push({ stufe: s.id, e });
    }
    for (const k of cfg.kinds) {
      const id = `00000000-0000-4000-8000-0000000001d${++n}`;
      const e = await t.versuch(W, T.insp, { ...insp2, id, type: k.id });
      if (e) abgelehnt.push({ art: k.id, e });
    }
    check(`Alle Ampel-Stufen (${cfg.severities.map((s) => s.id).join('/')}) und Prüfarten (${cfg.kinds.map((k) => k.id).join('/')}) der Konfiguration nimmt der Server an`, abgelehnt.length === 0, abgelehnt);
  }

  // ---------------------------------------------------------------- 5) Unveränderlich
  const geaendert = await t.als(W, async () => (await t.db.query(`update ${T.insp} set notes = 'x' where id = '${I1}'`)).affectedRows);
  check('Prüfung nachträglich ändern: für App-Konten wirkungslos (0 Zeilen)', geaendert === 0, String(geaendert));
  let gesperrt = '';
  try {
    await t.db.query(`update ${T.insp} set notes = 'x' where id = '${I1}'`);
  } catch (e) {
    gesperrt = String(e.message);
  }
  check('… und selbst mit vollen Rechten verhindert der Schutz-Trigger die Änderung', /append-only/i.test(gesperrt), gesperrt);

  // ---------------------------------------------------------------- 6) Foto-Speicher: Zugriffsregeln (nachgebaute Tabelle storage.objects)
  const foto = (uid, name) => t.versuch(uid, 'storage.objects', { bucket_id: 'photos', name });
  check('Foto-Pfad der Prüfung (<org>/inspection/<id>/1.jpg) darf der Mitarbeiter anlegen', (await foto(W, photoPath(ORG, cfg.photoFolders.inspection, I1, 1))) === null);
  check('Foto-Pfad des Mangels (<org>/defect/<id>/1.jpg) darf der Mitarbeiter anlegen', (await foto(W, photoPath(ORG, cfg.photoFolders.defect, D1, 1))) === null);
  r = await foto(W, photoPath(ORG2, cfg.photoFolders.inspection, I1, 1));
  check('Foto in den Ordner eines fremden Betriebs wird abgelehnt', /row-level security/i.test(r?.message ?? ''), r);
  const bucket = (await t.db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'photos'`)).rows[0];
  check('Bucket „photos“: privat, 3 MB, nur JPEG (so verkleinert der Browser die Fotos)', bucket?.public === false && Number(bucket.file_size_limit) === 3145728 && String(bucket.allowed_mime_types) === 'image/jpeg', bucket);

  // ---------------------------------------------------------------- 7) Was die Listen lesen (Mitarbeiter) — dieselben Spalten wie src/pruefen/backend.ts
  r = (await t.als(W, () => t.db.query(`select id, site_id, ${FK}, severity, ${BLOCKED} from ${T.def} where status = 'open'`))).rows;
  check('Offene Mängel mit Ort und Sperr-Vermerk sind für den Mitarbeiter lesbar',
    r.length === 1 + (mod ? cfg.severities.length : 0) && r.some((d) => d.id === D1 && d[BLOCKED] === true && d[FK] === UNIT && d.site_id === SITE) && r.filter((d) => d[BLOCKED]).length === 1, r);
  r = (await t.als(W, () => t.db.query(`select ${cfg.unitSelect} from ${T.unit}`))).rows;
  check(`Einheiten-Liste (Spalten der Konfiguration: ${cfg.unitSelect}) ist lesbar`, r.length === 1 && r[0][cfg.cols.retired] === false && r[0].name === 'E-001' && r[0].site_id === SITE, r);
  r = (await t.als(W, () => t.db.query(`select id, name, address, active from ${T.site}`))).rows;
  check('Standort-Liste (id, name, address, active) ist lesbar', r.length === 1 && r[0].active === true, r);
  r = (await t.als(W, () => t.db.query(`select id, ${FK}, type, started_at, canceled from ${T.insp} where id in ('${I1}', '${I2}') order by type`))).rows;
  check('Prüf-Daten für die Fälligkeit (Einheit, Art, Zeitpunkt, storniert) sind lesbar', r.length === 2 && r[0].type === 'expert' && r[0][FK] === UNIT && r[0].canceled === false, r);
  r = (await t.als(W, () => t.db.query(`select count(*)::int as n from ${T.unit} where ${cfg.cols.retired} = false`))).rows[0];
  check('Zählung für die Gratis-Grenze (Einheiten im Bestand) klappt', r?.n === 1, r);
  r = (await t.als(X, () => t.db.query(`select id from ${T.insp}`))).rows;
  check('Fremder Betrieb sieht keine der Prüfungen', r.length === 0, r);
  r = await t.versuch(W, T.unit, { id: '00000000-0000-4000-8000-0000000000c2', org_id: ORG, site_id: SITE, name: 'E-002', ...app.unitCols });
  check('Einheit anlegen darf nur der Inhaber (Mitarbeiter wird abgelehnt)', /row-level security/i.test(r?.message ?? ''), r);

  // ---------------------------------------------------------------- 8) Pro-Auskunft: Anbieter nicht erreichbar → „unbekannt“
  r = (await t.als(W, () => t.db.query(`select public.org_pro_active() as pro`))).rows[0];
  check('org_pro_active() antwortet „unbekannt“ (NULL), wenn der Anbieter nicht erreichbar ist → Browser sperrt dann nicht', r?.pro === null, r);
  const aufrufe = (await t.db.query(`select count(*)::int as n from public.test_http_aufrufe where uri not like '%revenuecat%' and uri not like '%suite-status%'`)).rows[0].n;
  check('Kein unerwarteter Aufruf nach außen', aufrufe === 0, String(aufrufe));

  // ---------------------------------------------------------------- App-eigene Punkte (Fälligkeit je Land, Sperr-Rückfragen, Ablegereife …)
  if (app.extra) await app.extra({ t, cfg, mod, T });

  // ---------------------------------------------------------------- 9) Datenbank OHNE Unterschrift-Spalte (Stand vor dem 29.10.): Ersatzweg der Oberfläche
  // (HebeDex: die Spalte steht von Anfang an in schema.sql — diesen Stand gab es dort nie)
  if (!E.ohneSignaturStand) return;
  const alt = await aufbau(app, { ohneSignatur: true, nachSchema });
  await alt.db.exec(DATEN);
  r = await alt.versuch(W, T.insp, insp1);
  check('Ohne Spalte „signature“: Postgres meldet 42703 (Spalte fehlt) — darauf reagiert der Ersatzweg', r?.code === '42703' && /signature/.test(r.message), r);
  const { signature: _weg, ...ohneSig } = insp1;
  r = await alt.versuch(W, T.insp, ohneSig);
  check('… dieselbe Prüfung ohne das Feld wird angenommen, mit Prüfcode', r === null && istHash((await alt.db.query(`select entry_hash from ${T.insp} where id = '${I1}'`)).rows[0]?.entry_hash), r);
}

// ================================================================ ORTS-MODUS (GerüstDex, RegalDex, SpielDex)
// Die Spaltennamen einer Einfüge-Funktion der App (mobile/src/data/supabaseRepository.ts → const row = { … }).
function appZeile(app, fn) {
  const text = readFileSync(path.join(app.repo, 'mobile/src/data/supabaseRepository.ts'), 'utf8').replace(/\r\n/g, '\n');
  const start = text.indexOf(`async ${fn}(`);
  const block = start < 0 ? '' : (text.slice(start).match(/const row = \{\n([\s\S]*?)\n    \};/)?.[1] ?? '');
  const keys = [...block.matchAll(/^\s{6}(?:\.\.\.\(.*\{ (\w+):|(\w+):)/gm)].map((m) => m[1] ?? m[2]);
  const ordner = start < 0 ? null : (text.slice(start).match(/photoFolder: '([^']+)'/)?.[1] ?? null);
  const tabelle = start < 0 ? null : (text.slice(start).match(/target: '([^']+)'/)?.[1] ?? null);
  return { keys: keys.sort(), ordner, tabelle };
}

/** Ein Block `export const NAME… = …;` aus der types.ts der App bzw. des Dashboards — ohne Leerraum-Unterschiede. */
function typBlock(datei, name) {
  const text = readFileSync(datei, 'utf8').replace(/\r\n/g, '\n');
  return (text.match(new RegExp(`export const ${name}[^=]*= [\\[{][\\s\\S]*?\\n[\\]}];`))?.[0] ?? '').replace(/\s+/g, ' ');
}

async function pruefeOrt(app) {
  const { cfg, checklistIds, mod } = await konfiguration(app);
  const SFK = cfg.cols.siteFk ?? 'site_id';
  const UFK = cfg.cols.unitFk;
  const BLOCKED = cfg.cols.blocked;
  const T = { insp: `public.${cfg.tables.inspection}`, def: `public.${cfg.tables.defect}`, unit: `public.${cfg.tables.unit}`, site: `public.${cfg.tables.site}` };
  const O = app.ort;
  const SEV = O.sperrStufe; // Stufe mit Sperr-Rückfrage
  const DUE = O.faellig;
  const t = await aufbau(app);
  const DATEN = daten(app, cfg);
  await t.db.exec(DATEN);
  const CHECKLIST = Object.fromEntries(checklistIds.map((id, i) => [id, i === 1 ? 'defect' : i === 3 ? 'na' : 'ok']));

  // -------------------------------------------------------------- 0) Konfiguration in sich stimmig und wie die App
  check('Orts-Modus: mode = site; die Prüfung hängt am Ort', cfg.mode === 'site', cfg.mode);
  check(`Checkliste: ${O.punkte} Punkte mit eindeutiger Kennung, Bezeichnung und Prüfhinweis`,
    cfg.checklist.length === O.punkte && new Set(checklistIds).size === O.punkte && cfg.checklist.every((c) => c.label && c.hint), checklistIds);
  check('Prüfarten und Stufen haben Bezeichnung und Erklärung; Fälligkeits-Art und Vorbelegung gibt es',
    cfg.kinds.every((k) => k.label && k.short && k.hint) && cfg.severities.every((s) => s.label && s.short && s.hint && ['green', 'amber', 'red'].includes(s.tone)) &&
      JSON.stringify(cfg.kinds.map((k) => k.id)) === JSON.stringify(O.arten) && JSON.stringify(cfg.severities.map((s) => s.id)) === JSON.stringify(O.stufen) &&
      cfg.dueKind === DUE && cfg.severities.some((s) => s.id === cfg.defaultSeverity) && cfg.kinds[0].id === 'visual',
    { kinds: cfg.kinds.map((k) => k.id), sev: cfg.severities.map((s) => s.id), due: cfg.dueKind, def: cfg.defaultSeverity });
  const dash = path.join(here, '..', path.dirname(app.cfgModule.file), 'types.ts');
  const mobil = path.join(app.repo, 'mobile/src/types.ts');
  for (const name of ['CHECKLIST', 'INSPECTION_LABELS', 'INSPECTION_HINTS', 'SEVERITY_LABELS', 'SEVERITY_HINTS', 'INSPECTION_INTERVAL_DAYS']) {
    const a = typBlock(dash, name);
    check(`types.ts: ${name} ist wortgleich zur App (mobile/src/types.ts)`, a !== '' && a === typBlock(mobil, name), a.slice(0, 120));
  }
  const frei = readFileSync(path.join(app.repo, 'mobile/src/lib/entitlement.ts'), 'utf8');
  check(`Gratis-Grenze: 1 aktiver Ort — wie FREE_LIMITS der App ({ ${O.frei} }); keine Einheiten-Grenze`,
    cfg.freeSites === 1 && cfg.freeUnits === undefined && frei.includes(`FREE_LIMITS = { ${O.frei} }`), { freeSites: cfg.freeSites, freeUnits: cfg.freeUnits });
  const appInsp = appZeile(app, 'addInspection');
  const appDef = appZeile(app, O.addDefect);
  check('Tabellen und Foto-Ordner wie in der App (target / photoFolder der Einfüge-Funktionen)',
    appInsp.tabelle === cfg.tables.inspection && appDef.tabelle === cfg.tables.defect && appInsp.ordner === cfg.photoFolders.inspection && appDef.ordner === cfg.photoFolders.defect,
    { appInsp, appDef, cfg: [cfg.tables, cfg.photoFolders] });

  // -------------------------------------------------------------- 1) Prüfung mit GPS (Beginn + Ende), Unterschrift, Foto — als Mitarbeiter
  const insp1 = {
    ...buildInspectionRow(cfg, {
      id: I1, orgId: ORG, userId: W, siteId: SITE, type: DUE, at: AT,
      start: { lat: 47.0712, lng: 15.4412, accuracy: 8, at: '2026-11-19T10:50:29.326Z' },
      end: { lat: 47.07121, lng: 15.44119, accuracy: 9, at: '2026-11-19T10:55:58.000Z' },
      checklist: CHECKLIST, notes: '  Vorsorglich erneuert ', inspectorName: ' Max Muster ', qualification: 'befähigte Person nach TRBS 1203', signature: SIG,
    }),
    photo_urls: [STORAGE_PREFIX + photoPath(ORG, cfg.photoFolders.inspection, I1, 1)],
  };
  check(`Zeile: Ort steht unter ${SFK}, KEINE Einheiten-Spalte (${UFK}), Name mit Qualifikation, Notiz getrimmt, Fake-GPS-Felder leer`,
    insp1[SFK] === SITE && !(UFK in insp1) && insp1.inspector_name === 'Max Muster (befähigte Person nach TRBS 1203)' && insp1.notes === 'Vorsorglich erneuert' &&
      insp1.gps_mocked === null && insp1.end_mocked === null && insp1.started_at === AT && insp1.created_at === AT && insp1.performed_by === W, insp1);
  check('Zeile hat genau die Spalten, die auch die App schreibt (addInspection)', appInsp.keys.length >= 20 && JSON.stringify(Object.keys(insp1).sort()) === JSON.stringify(appInsp.keys),
    { web: Object.keys(insp1).sort(), app: appInsp.keys });
  let r = await t.versuch(W, T.insp, insp1);
  check('Prüfung mit GPS + Unterschrift wird angenommen (Mitarbeiter)', r === null, r);
  let row = (await t.db.query(`select * from ${T.insp} where id = '${I1}'`)).rows[0];
  check('Prüfcode (entry_hash), Version 2 und Server-Eingang entstehen', istHash(row?.entry_hash) && row.hash_version === 2 && !!row.received_at, { h: row?.entry_hash, v: row?.hash_version });
  check('Abstand zum Ort rechnet der Server (Beginn 0 m, Ende > 0 m)', row?.distance_m === 0 && row.end_distance_m > 0 && row.end_distance_m < 5, { d: row?.distance_m, e: row?.end_distance_m });
  check('Unterschrift, Checkliste, Foto-Pfad und GPS-Stempel stehen unverändert in der Zeile',
    row?.signature === SIG && gleich(row.checklist, CHECKLIST) && row.photo_urls?.[0] === `storage:${ORG}/inspection/${I1}/1.jpg` &&
      row.gps_accuracy_m === 8 && row.end_accuracy_m === 9 && new Date(row.gps_at).toISOString() === '2026-11-19T10:50:29.326Z' && row.gps_mocked === null,
    { sig: row?.signature === SIG, checklist: row?.checklist, foto: row?.photo_urls, gps: [row?.gps_accuracy_m, row?.end_accuracy_m, row?.gps_at, row?.gps_mocked] });
  r = (await t.als(W, () => t.db.query(`select * from public.verify_inspection('${I1}')`))).rows[0];
  check('Prüfcode lässt sich bestätigen (verify_inspection)', r?.ok === true, r);

  // -------------------------------------------------------------- 2) Prüfung OHNE GPS und ohne Unterschrift
  const insp2 = {
    ...buildInspectionRow(cfg, {
      id: I2, orgId: ORG, userId: W, siteId: SITE, type: 'visual', at: AT, start: null, end: null,
      checklist: CHECKLIST, notes: '', inspectorName: '', qualification: 'wird ohne Namen nicht angehängt', signature: '',
    }),
    photo_urls: [],
  };
  check('Zeile ohne GPS: alle Ortsfelder leer, kein Feld „signature“, kein Name', insp2.lat === null && insp2.end_lat === null && insp2.gps_at === null && !('signature' in insp2) && insp2.inspector_name === null && insp2.notes === null);
  r = await t.versuch(W, T.insp, insp2);
  check('Prüfung ohne GPS und ohne Unterschrift wird angenommen', r === null, r);
  row = (await t.db.query(`select entry_hash, distance_m, end_distance_m, signature, lat from ${T.insp} where id = '${I2}'`)).rows[0];
  check('… mit Prüfcode, ohne Abstand, ohne Unterschrift', istHash(row?.entry_hash) && row.distance_m === null && row.end_distance_m === null && row.signature === null && row.lat === null, row);

  // -------------------------------------------------------------- 3) Wiederholung, fremde Angaben
  r = await t.versuch(W, T.insp, insp1);
  check('Prüfung doppelt gesendet → Fehler 23505 (wertet der Browser als „schon gespeichert“)', r?.code === '23505', r);
  check('… und es gibt sie weiterhin genau einmal', (await t.db.query(`select count(*)::int as n from ${T.insp} where id = '${I1}'`)).rows[0].n === 1);
  r = await t.versuch(W, T.insp, { ...insp2, id: '00000000-0000-4000-8000-0000000000d3', performed_by: U });
  check('Prüfung im Namen eines anderen Kontos wird abgelehnt', /row-level security/i.test(r?.message ?? ''), r);
  r = await t.versuch(X, T.insp, { ...insp2, id: '00000000-0000-4000-8000-0000000000d4', performed_by: X });
  check('Konto eines fremden Betriebs kann hier keine Prüfung anlegen', /row-level security/i.test(r?.message ?? ''), r);
  r = await t.versuch(W, T.insp, { ...insp2, id: '00000000-0000-4000-8000-0000000000d5', type: 'jaehrlich' });
  check(`Unbekannte Prüfart wird abgelehnt (nur ${O.arten.join('/')})`, r?.code === '23514', r);

  // -------------------------------------------------------------- 4) Mangel/Schaden: mit Einheit + Sperre + Fotos, und ohne Einheit („… allgemein“)
  const def1 = {
    ...buildDefectRow(cfg, {
      id: D1, orgId: ORG, userId: W, siteId: SITE, unitId: UNIT, inspectionId: I1, at: AT,
      title: ' Bauteil locker ', description: '', severity: SEV, blocked: true, inspectorName: 'Max Muster',
    }),
    photo_urls: [STORAGE_PREFIX + photoPath(ORG, cfg.photoFolders.defect, D1, 1), STORAGE_PREFIX + photoPath(ORG, cfg.photoFolders.defect, D1, 2)],
  };
  check(`Mangel-Zeile: ${SFK}, ${UFK}, ${BLOCKED}, Titel getrimmt, Melder = Prüfername (ohne Qualifikation)`,
    def1[SFK] === SITE && def1[UFK] === UNIT && def1[BLOCKED] === true && def1.title === 'Bauteil locker' && def1.description === null && def1.reporter_name === 'Max Muster' && def1.reported_by === W && def1.inspection_id === I1, def1);
  check(`Mangel-Zeile hat genau die Spalten, die auch die App schreibt (${O.addDefect})`, appDef.keys.length >= 12 && JSON.stringify(Object.keys(def1).sort()) === JSON.stringify(appDef.keys),
    { web: Object.keys(def1).sort(), app: appDef.keys });
  r = await t.versuch(W, T.def, def1);
  check('Mangel mit Einheit, Sperre und zwei Fotos wird angenommen (Mitarbeiter)', r === null, r);
  row = (await t.db.query(`select status, severity, ${BLOCKED} as blocked, ${UFK} as unit, ${SFK} as site, inspection_id, photo_urls from ${T.def} where id = '${D1}'`)).rows[0];
  check(`Mangel: offen, Stufe ${SEV}, gesperrt, hängt an Prüfung, Ort und Einheit, zwei Foto-Pfade im Ordner „${cfg.photoFolders.defect}“`,
    row?.status === 'open' && row.severity === SEV && row.blocked === true && row.unit === UNIT && row.site === SITE && row.inspection_id === I1 &&
      row.photo_urls?.length === 2 && row.photo_urls[1] === `storage:${ORG}/${cfg.photoFolders.defect}/${D1}/2.jpg`, row);
  const def2 = {
    ...buildDefectRow(cfg, {
      id: D2, orgId: ORG, userId: W, siteId: SITE, unitId: null, inspectionId: I1, at: AT,
      title: 'Verkehrsweg zugestellt', description: ' beim Tor ', severity: cfg.severities[0].id, blocked: false, inspectorName: '',
    }),
    photo_urls: [],
  };
  check(`Mangel ohne Einheit („${cfg.labels.general}“): ${UFK} ist NULL (nicht weggelassen), kein Melder-Name`, UFK in def2 && def2[UFK] === null && def2.reporter_name === null && def2.description === 'beim Tor' && def2[BLOCKED] === false, def2);
  r = await t.versuch(W, T.def, def2);
  check('… wird angenommen', r === null, r);
  r = await t.versuch(W, T.def, def1);
  check('Mangel doppelt gesendet → Fehler 23505', r?.code === '23505', r);
  r = await t.versuch(W, T.def, { ...def1, id: '00000000-0000-4000-8000-0000000000f2', reported_by: U });
  check('Mangel im Namen eines anderen Kontos wird abgelehnt', /row-level security/i.test(r?.message ?? ''), r);
  r = await t.versuch(X, T.def, { ...def2, id: '00000000-0000-4000-8000-0000000000f4', reported_by: X });
  check('Konto eines fremden Betriebs kann hier keinen Mangel anlegen', /row-level security/i.test(r?.message ?? ''), r);
  r = await t.versuch(W, T.def, { ...def1, id: '00000000-0000-4000-8000-0000000000f3', severity: 'gelb' });
  check(`Unbekannte Stufe wird abgelehnt (nur ${O.stufen.join('/')})`, r?.code === '23514', r);
  {
    // jede Stufe und jede Prüfart der Konfiguration nimmt der Server an (Mangel ohne Sperre, ohne Fotos)
    const abgelehnt = [];
    let n = 0;
    for (const s of cfg.severities) {
      const id = `00000000-0000-4000-8000-0000000001f${++n}`;
      const e = await t.versuch(W, T.def, {
        ...buildDefectRow(cfg, { id, orgId: ORG, userId: W, siteId: SITE, unitId: UNIT, inspectionId: I1, at: AT, title: `Stufe ${s.id}`, description: 'Text', severity: s.id, blocked: false, inspectorName: '' }),
        photo_urls: [],
      });
      if (e) abgelehnt.push({ stufe: s.id, e });
    }
    for (const k of cfg.kinds) {
      const id = `00000000-0000-4000-8000-0000000001d${++n}`;
      const e = await t.versuch(W, T.insp, { ...insp2, id, type: k.id });
      if (e) abgelehnt.push({ art: k.id, e });
    }
    check(`Alle Stufen (${cfg.severities.map((s) => s.id).join('/')}) und Prüfarten (${cfg.kinds.map((k) => k.id).join('/')}) der Konfiguration nimmt der Server an`, abgelehnt.length === 0, abgelehnt);
  }

  // -------------------------------------------------------------- 5) Unveränderlich
  const geaendert = await t.als(W, async () => (await t.db.query(`update ${T.insp} set notes = 'x' where id = '${I1}'`)).affectedRows);
  check('Prüfung nachträglich ändern: für App-Konten wirkungslos (0 Zeilen)', geaendert === 0, String(geaendert));
  let gesperrt = '';
  try {
    await t.db.query(`update ${T.insp} set notes = 'x' where id = '${I1}'`);
  } catch (e) {
    gesperrt = String(e.message);
  }
  check('… und selbst mit vollen Rechten verhindert der Schutz-Trigger die Änderung', /append-only/i.test(gesperrt), gesperrt);
  const defGeaendert = await t.als(W, async () => (await t.db.query(`update ${T.def} set title = 'x' where id = '${D1}'`)).affectedRows);
  check('Mangel nachträglich ändern: für App-Konten wirkungslos (0 Zeilen, Behebung nur über die Server-Funktion)', defGeaendert === 0, String(defGeaendert));

  // -------------------------------------------------------------- 6) Foto-Speicher: Zugriffsregeln (nachgebaute Tabelle storage.objects)
  const foto = (uid, name) => t.versuch(uid, 'storage.objects', { bucket_id: 'photos', name });
  check('Foto-Pfad der Prüfung (<org>/inspection/<id>/1.jpg) darf der Mitarbeiter anlegen', (await foto(W, photoPath(ORG, cfg.photoFolders.inspection, I1, 1))) === null);
  check(`Foto-Pfad des Mangels (<org>/${cfg.photoFolders.defect}/<id>/1.jpg) darf der Mitarbeiter anlegen`, (await foto(W, photoPath(ORG, cfg.photoFolders.defect, D1, 1))) === null);
  r = await foto(W, photoPath(ORG2, cfg.photoFolders.inspection, I1, 1));
  check('Foto in den Ordner eines fremden Betriebs wird abgelehnt', /row-level security/i.test(r?.message ?? ''), r);
  const bucket = (await t.db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'photos'`)).rows[0];
  check('Bucket „photos“: privat, 3 MB, nur JPEG (so verkleinert der Browser die Fotos)', bucket?.public === false && Number(bucket.file_size_limit) === 3145728 && String(bucket.allowed_mime_types) === 'image/jpeg', bucket);

  // -------------------------------------------------------------- 7) Was die Listen lesen (Mitarbeiter) — dieselben Spalten wie src/pruefen/backend.ts
  r = (await t.als(W, () => t.db.query(`select id, ${SFK}, ${UFK}, severity, ${BLOCKED} from ${T.def} where status = 'open'`))).rows;
  check('Offene Mängel mit Ort, Einheit (oder keiner) und Sperr-Vermerk sind für den Mitarbeiter lesbar',
    r.length === 2 + cfg.severities.length && r.some((d) => d.id === D1 && d[BLOCKED] === true && d[UFK] === UNIT && d[SFK] === SITE) &&
      r.some((d) => d.id === D2 && d[UFK] === null && d[SFK] === SITE) && r.filter((d) => d[BLOCKED]).length === 1, r);
  r = (await t.als(W, () => t.db.query(`select ${cfg.unitSelect} from ${T.unit}`))).rows;
  check(`Einheiten-Liste (Spalten der Konfiguration: ${cfg.unitSelect}) ist lesbar, die Unterzeile entsteht`,
    r.length === 1 && r[0][cfg.cols.retired] === false && r[0].name === 'E-001' && r[0][SFK] === SITE && cfg.unitInfo(r[0]) === Object.values(app.unitCols)[0], r);
  r = (await t.als(W, () => t.db.query(`select id, name, address, active from ${T.site}`))).rows;
  check('Orts-Liste (id, name, address, active) ist lesbar', r.length === 1 && r[0].active === true, r);
  r = (await t.als(W, () => t.db.query(`select id, ${SFK}, type, started_at, canceled from ${T.insp} where id in ('${I1}', '${I2}') order by type`))).rows;
  check('Prüf-Daten für die Fälligkeit (Ort, Art, Zeitpunkt, storniert) sind lesbar',
    r.length === 2 && r.some((x) => x.type === DUE && x[SFK] === SITE && x.canceled === false) && r.some((x) => x.type === 'visual'), r);
  r = (await t.als(X, () => t.db.query(`select id from ${T.insp}`))).rows;
  check('Fremder Betrieb sieht keine der Prüfungen', r.length === 0, r);
  r = (await t.als(X, () => t.db.query(`select id from ${T.def}`))).rows;
  check('… und keinen der Mängel', r.length === 0, r);

  // -------------------------------------------------------------- 8) Gratis-Grenze der Orte: Zählung + wer anlegen darf
  r = (await t.als(U, () => t.db.query(`select count(*)::int as n from ${T.site} where active = true`))).rows[0];
  check('Zählung für die Gratis-Grenze (aktive Orte des Betriebs) klappt: 1 → Grenze erreicht', r?.n === 1 && r.n >= cfg.freeSites, r);
  const ORT2 = '00000000-0000-4000-8000-0000000000e2';
  r = await t.versuch(W, T.site, { id: ORT2, org_id: ORG, name: 'Zweiter Ort', address: 'Nebenstraße 1' });
  check('Ort anlegen darf nur der Inhaber (Mitarbeiter wird abgelehnt)', /row-level security/i.test(r?.message ?? ''), r);
  r = await t.versuch(U, T.site, { id: ORT2, org_id: ORG, name: 'Zweiter Ort', address: 'Nebenstraße 1', active: false });
  const aktiv = (await t.als(U, () => t.db.query(`select count(*)::int as n from ${T.site} where active = true`))).rows[0];
  check('Ein stillgelegter Ort zählt nicht mit (Inhaber legt ihn an, Zählung bleibt 1)', r === null && aktiv?.n === 1, { r, aktiv });
  r = await t.versuch(W, T.unit, { id: '00000000-0000-4000-8000-0000000000c2', org_id: ORG, [SFK]: SITE, name: 'E-002', ...app.unitCols });
  check('Einheit anlegen darf nur der Inhaber (Mitarbeiter wird abgelehnt)', /row-level security/i.test(r?.message ?? ''), r);
  r = (await t.als(W, () => t.db.query(`select public.org_pro_active() as pro`))).rows[0];
  check('org_pro_active() antwortet „unbekannt“ (NULL), wenn der Anbieter nicht erreichbar ist → Browser sperrt dann nicht', r?.pro === null, r);
  const aufrufe = (await t.db.query(`select count(*)::int as n from public.test_http_aufrufe where uri not like '%revenuecat%' and uri not like '%suite-status%'`)).rows[0].n;
  check('Kein unerwarteter Aufruf nach außen', aufrufe === 0, String(aufrufe));

  // -------------------------------------------------------------- App-eigene Punkte
  if (app.extra) await app.extra({ t, cfg, mod, T });

  // -------------------------------------------------------------- 9) Datenbank OHNE Unterschrift-Spalte (Stand vor dem 29.10.): Ersatzweg der Oberfläche
  const alt = await aufbau(app, { ohneSignatur: true });
  await alt.db.exec(DATEN);
  r = await alt.versuch(W, T.insp, insp1);
  check('Ohne Spalte „signature“: Postgres meldet 42703 (Spalte fehlt) — darauf reagiert der Ersatzweg', r?.code === '42703' && /signature/.test(r.message), r);
  const { signature: _weg, ...ohneSig } = insp1;
  r = await alt.versuch(W, T.insp, ohneSig);
  check('… dieselbe Prüfung ohne das Feld wird angenommen, mit Prüfcode', r === null && istHash((await alt.db.query(`select entry_hash from ${T.insp} where id = '${I1}'`)).rows[0]?.entry_hash), r);
}

const sperren = (cfg) => Object.fromEntries(cfg.severities.map((s) => [s.id, { frage: !!s.blockQuestion, schalter: !!s.blockQuestion || s.blockable === true }]));

// ---------------------------------------------------------------- GerüstDex: Baustelle, Frist 30 Tage, Rückfrage bei Orange und Rot
async function geruestdexExtra({ cfg }) {
  check('Bezeichnungen: Baustelle / Gerüst / Prüfung / Mangel; Verwaltung unter „baustellen“, Listen unter „pruefungen“ und „maengel“ (Standard)',
    cfg.labels.site.one === 'Baustelle' && cfg.labels.unit.one === 'Gerüst' && cfg.labels.inspection === undefined && cfg.labels.defect === undefined &&
      cfg.sitesPath === 'baustellen' && cfg.inspectionsPath === undefined && cfg.defectsPath === undefined && cfg.labels.general === 'Baustelle allgemein');
  check('Tabellen: site / scaffold / inspection / damage; Ort unter site_id (Standard), Einheit unter scaffold_id, Sperre scaffold_blocked',
    JSON.stringify(cfg.tables) === JSON.stringify({ site: 'site', unit: 'scaffold', inspection: 'inspection', defect: 'damage' }) &&
      cfg.cols.siteFk === undefined && cfg.cols.unitFk === 'scaffold_id' && cfg.cols.blocked === 'scaffold_blocked', cfg.cols);
  check('Frist der Prüfung durch die befähigte Person: 30 Tage, „bald fällig“ ab 14 Tagen (wie lib/due.ts der App)', cfg.dueIntervalDays({}) === 30 && cfg.dueSoonDays === 14, [cfg.dueIntervalDays({}), cfg.dueSoonDays]);
  const s = sperren(cfg);
  check('Sperr-Rückfrage bei Orange und Rot, nicht bei Grün', !s.green.frage && !s.green.schalter && s.amber.frage && s.red.frage, s);
}

// ---------------------------------------------------------------- RegalDex: Lager / Inspektion / Schaden, Rückfrage nur bei Rot
async function regaldexExtra({ cfg }) {
  check('Bezeichnungen: Lager / Regalzeile / Inspektion / Schaden; Pfade „lager“, „inspektionen“, „schaeden“ (wie im Dashboard)',
    cfg.labels.site.one === 'Lager' && cfg.labels.unit.one === 'Regalzeile' && cfg.labels.inspection?.one === 'Inspektion' && cfg.labels.inspection.kind === 'Inspektionsart' &&
      cfg.labels.defect?.one === 'Schaden' && cfg.labels.defect.many === 'Schäden' && cfg.sitesPath === 'lager' && cfg.inspectionsPath === 'inspektionen' && cfg.defectsPath === 'schaeden' &&
      cfg.labels.general === 'Lager allgemein');
  check('Tabellen: warehouse / rack / inspection / damage; Ort unter warehouse_id, Einheit unter rack_id, Sperre rack_blocked',
    JSON.stringify(cfg.tables) === JSON.stringify({ site: 'warehouse', unit: 'rack', inspection: 'inspection', defect: 'damage' }) &&
      cfg.cols.siteFk === 'warehouse_id' && cfg.cols.unitFk === 'rack_id' && cfg.cols.blocked === 'rack_blocked', cfg.cols);
  check('Frist der Experteninspektion: 365 Tage, „bald fällig“ ab 30 Tagen (Standard)', cfg.dueIntervalDays({}) === 365 && cfg.dueSoonDays === undefined, [cfg.dueIntervalDays({}), cfg.dueSoonDays]);
  const s = sperren(cfg);
  check('Sperr-Rückfrage nur bei Rot; den Sperr-Schalter gibt es bei Orange und Rot (wie in der App), nicht bei Grün',
    s.red.frage && !s.amber.frage && !s.green.frage && s.red.schalter && s.amber.schalter && !s.green.schalter, s);
}

// ---------------------------------------------------------------- SpielDex: drei Kontrollarten, Gering/Mittel/Gefahr, operative Frist
async function spieldexExtra({ t, cfg, T }) {
  check('Bezeichnungen: Spielplatz / Spielgerät / Kontrolle / Mangel; Pfade „spielplaetze“, „kontrollen“, „maengel“ (Standard)',
    cfg.labels.site.one === 'Spielplatz' && cfg.labels.unit.one === 'Spielgerät' && cfg.labels.inspection?.one === 'Kontrolle' && cfg.labels.inspection.kind === 'Kontrollart' &&
      cfg.labels.defect === undefined && cfg.sitesPath === 'spielplaetze' && cfg.inspectionsPath === 'kontrollen' && cfg.defectsPath === undefined && cfg.labels.general === 'Fläche allgemein');
  check('Tabellen: playground / equipment / inspection / defect; Ort unter playground_id, Einheit unter equipment_id, Sperre equipment_blocked',
    JSON.stringify(cfg.tables) === JSON.stringify({ site: 'playground', unit: 'equipment', inspection: 'inspection', defect: 'defect' }) &&
      cfg.cols.siteFk === 'playground_id' && cfg.cols.unitFk === 'equipment_id' && cfg.cols.blocked === 'equipment_blocked', cfg.cols);
  check('Frist der Jahreshauptinspektion: 365 Tage; zweite Frist „Operative Kontrolle“ 90 Tage, bald fällig ab 14, die Hauptinspektion zählt mit',
    cfg.dueIntervalDays({}) === 365 && cfg.extraDue?.intervalDays === 90 && cfg.extraDue.soonDays === 14 && JSON.stringify(cfg.extraDue.kinds) === JSON.stringify(['operational', 'main']) && cfg.extraDue.doneKind === 'operational', cfg.extraDue);
  const s = sperren(cfg);
  const gefahr = cfg.severities.find((x) => x.id === 'danger');
  check('Sperre und Rückfrage nur bei „Gefahr“; ohne gewähltes Gerät eigener Text („Bereich“ statt „Gerät“)',
    s.danger.frage && s.danger.schalter && !s.medium.frage && !s.medium.schalter && !s.low.schalter && /Gerät sofort gesperrt/.test(gefahr.blockQuestion) && /Bereich sofort abgesperrt/.test(gefahr.blockQuestionGeneral ?? '') &&
      cfg.labels.blocked === 'Gerät gesperrt' && cfg.labels.blockedGeneral === 'Bereich gesperrt', { s, gefahr });
  check('Farben der Stufen wie in der App: Gering grün, Mittel orange, Gefahr rot; vorbelegt ist „Mittel“',
    JSON.stringify(cfg.severities.map((x) => x.tone)) === JSON.stringify(['green', 'amber', 'red']) && cfg.defaultSeverity === 'medium');
  // Gefahr-Mangel ohne Gerät, aber mit Sperre („Bereich gesperrt“) — nimmt der Server an
  const r = await t.versuch(W, T.def, {
    ...buildDefectRow(cfg, { id: '00000000-0000-4000-8000-0000000000fb', orgId: ORG, userId: W, siteId: SITE, unitId: null, inspectionId: I1, at: AT, title: 'Glasscherben im Sand', description: '', severity: 'danger', blocked: true, inspectorName: 'Max Muster' }),
    photo_urls: [STORAGE_PREFIX + photoPath(ORG, cfg.photoFolders.defect, '00000000-0000-4000-8000-0000000000fb', 1)],
  });
  check('Gefahr-Mangel ohne Gerät mit Sperre („Bereich gesperrt“) wird angenommen', r === null, r);
}

// ---------------------------------------------------------------- FeuerDex: Frist je Land (DE/AT 2 Jahre, Schweiz 3 Jahre)
async function feuerdexExtra({ t, cfg }) {
  const org = async () => (await t.als(W, () => t.db.query(`select * from public.org where id = '${ORG}'`))).rows[0];
  let o = await org();
  check('Frist der Sachkundigen-Prüfung aus der Betriebs-Zeile: Land DE → 730 Tage', o?.land === 'DE' && cfg.dueIntervalDays(o) === 730, { land: o?.land, tage: cfg.dueIntervalDays(o ?? {}) });
  await t.db.query(`update public.org set land = 'CH' where id = '${ORG}'`);
  o = await org();
  check('… Land CH → 1095 Tage (3 Jahre)', o?.land === 'CH' && cfg.dueIntervalDays(o) === 1095, { land: o?.land, tage: cfg.dueIntervalDays(o ?? {}) });
  await t.db.query(`update public.org set land = 'AT' where id = '${ORG}'`);
  o = await org();
  check('… Land AT → 730 Tage; ohne Angabe ebenfalls 730', cfg.dueIntervalDays(o) === 730 && cfg.dueIntervalDays({}) === 730);
  const frage = Object.fromEntries(cfg.severities.map((s) => [s.id, !!s.blockQuestion]));
  check('Sperr-Rückfrage bei Orange und Rot, nicht bei Grün', frage.green === false && frage.amber === true && frage.red === true, frage);
}

// ---------------------------------------------------------------- ToreDex: „Objekt“, Rückfrage nur bei Rot
async function toredexExtra({ cfg }) {
  check('Der Ort heißt „Objekt“, die Verwaltung liegt unter „objekte“ (wie im Dashboard)', cfg.labels.site.one === 'Objekt' && cfg.labels.site.many === 'Objekte' && cfg.sitesPath === 'objekte', cfg.sitesPath);
  check('Frist der Sachkundigen-Prüfung: 365 Tage in jedem Land', ['DE', 'AT', 'CH'].every((land) => cfg.dueIntervalDays({ land }) === 365) && cfg.dueIntervalDays({}) === 365);
  const sev = Object.fromEntries(cfg.severities.map((s) => [s.id, { frage: !!s.blockQuestion, schalter: !!s.blockQuestion || s.blockable === true }]));
  check('Sperr-Rückfrage nur bei Rot; den Sperr-Schalter gibt es bei Orange und Rot (wie in der App), nicht bei Grün',
    sev.red.frage && !sev.amber.frage && !sev.green.frage && sev.red.schalter && sev.amber.schalter && !sev.green.schalter, sev);
}

// ---------------------------------------------------------------- HebeDex: Messwerte-JSON, Prüfcode, Checkliste je Teil-Typ, Rissprüfung, Gratis-Grenze
async function hebedexExtra({ t, cfg, mod, T }) {
  const { measurementsForRow } = await import(pathToFileURL(path.join(here, '../src/pruefen/rows.ts')).href);
  const app = APPS.hebedex;
  const SEIL = '00000000-0000-4000-8000-0000000000c5';
  const HAKEN = '00000000-0000-4000-8000-0000000000c6';
  const BAND = '00000000-0000-4000-8000-0000000000c7';
  const DEMO = '00000000-0000-4000-8000-0000000000c8';
  await t.db.exec(`
    insert into ${T.unit} (id, org_id, site_id, name, kind, wll_kg, length_m, nominal_mm, rope_kind, build_year, is_demo) values
      ('${SEIL}', '${ORG}', '${SITE}', 'S-001', 'wire_rope', 1500, '4', '12', 'cable', '2023', false),
      ('${HAKEN}', '${ORG}', '${SITE}', 'H-001', 'hook', 3200, null, null, null, '2022', false),
      ('${BAND}', '${ORG}', '${SITE}', 'HB-001', 'webbing_sling', 2000, '3', null, null, '2024', false),
      ('${DEMO}', '${ORG}', '${SITE}', 'Beispiel-Kette', 'chain', 2000, '2', '10', null, '2020', true);
  `);

  // ---- Spalten wie die App
  const insp = buildInspectionRow(cfg, { id: I1, orgId: ORG, userId: W, siteId: SITE, unitId: UNIT, type: 'expert', at: AT, start: null, end: null, checklist: {}, notes: '', inspectorName: 'M', qualification: '', signature: SIG, measurements: {} });
  const appInsp = appZeile(app, 'addInspection');
  check('Prüfung: dieselben Spalten wie addInspection der App (samt measurements), Tabelle und Foto-Ordner gleich',
    JSON.stringify([...Object.keys(insp), 'photo_urls'].sort()) === JSON.stringify(appInsp.keys) && appInsp.tabelle === cfg.tables.inspection && appInsp.ordner === cfg.photoFolders.inspection,
    { web: [...Object.keys(insp), 'photo_urls'].sort(), app: appInsp });
  const def = buildDefectRow(cfg, { id: D1, orgId: ORG, userId: W, siteId: SITE, unitId: UNIT, inspectionId: I1, at: AT, title: 'x', description: '', severity: 'red', blocked: true, inspectorName: 'M' });
  const appDef = appZeile(app, 'addDefect');
  check('Mangel: dieselben Spalten wie addDefect der App, Tabelle und Foto-Ordner gleich',
    JSON.stringify([...Object.keys(def), 'photo_urls'].sort()) === JSON.stringify(appDef.keys) && appDef.tabelle === cfg.tables.defect && appDef.ordner === cfg.photoFolders.defect, { web: Object.keys(def).sort(), app: appDef });
  check('Die App schreibt ohne Messung „{}“ in measurements (so auch der Browser)', readFileSync(path.join(app.repo, 'mobile/src/data/supabaseRepository.ts'), 'utf8').includes('measurements: i.measurements ?? {},'));

  // ---- Messwerte in der Datenbank (Prüfung I1 aus dem gemeinsamen Ablauf: Kette mit Messung; I2: ohne)
  let row = (await t.db.query(`select measurements, entry_hash from ${T.insp} where id = '${I1}'`)).rows[0];
  check('Messwerte-JSON der Kette steht unverändert in der Zeile (Text wie eingegeben), mit Prüfcode', gleich(row?.measurements, app.messwerte) && Object.values(row.measurements).every((v) => typeof v === 'string') && istHash(row.entry_hash), row);
  row = (await t.db.query(`select measurements from ${T.insp} where id = '${I2}'`)).rows[0];
  check('Ohne Messung steht „{}“ in measurements', gleich(row?.measurements, {}) && row.measurements !== null, row);
  let geschuetzt = '';
  try {
    await t.db.query(`update ${T.insp} set measurements = '{"d1":"10"}'::jsonb where id = '${I1}'`);
  } catch (e) {
    geschuetzt = String(e.message);
  }
  check('Messwerte nachträglich ändern verhindert der Schutz-Trigger (sie gehören zum Nachweis)', /append-only/i.test(geschuetzt), geschuetzt);
  row = (await t.als(W, () => t.db.query(`select * from public.verify_inspection('${I1}')`))).rows[0];
  check('… der Prüfcode der Prüfung mit Messwerten bestätigt sich weiter', row?.ok === true, row);

  // ---- was das Formular speichert (measurementsForRow) — und was die Datenbank daraus macht
  check('Nur Vorbelegung (Nenndicke/Seilart), nichts gemessen → {}; mit Messwert alle ausgefüllten Felder, leere fallen weg',
    gleich(measurementsForRow({ nominal: '12', ropeKind: 'cable', b3: '' }, cfg.measure({ kind: 'wire_rope' }).measuredKeys), {}) &&
      gleich(measurementsForRow({ nominal: '12', ropeKind: 'cable', b3: '4', b6: '', b30: ' ' }, cfg.measure({ kind: 'wire_rope' }).measuredKeys), { nominal: '12', ropeKind: 'cable', b3: '4' }) &&
      gleich(measurementsForRow({ nominal: '10', d2: '9' }, cfg.measure({ kind: 'chain' }).measuredKeys), {}));
  const rows = (await t.als(W, () => t.db.query(`select ${cfg.unitSelect} from ${T.unit}`))).rows;
  const zeile = (id) => rows.find((x) => x.id === id);
  check(`Einheiten-Liste liefert, was Checkliste, Rechner und Rissprüfung brauchen (${cfg.unitSelect})`, rows.length === 5 && zeile(SEIL).rope_kind === 'cable' && zeile(SEIL).nominal_mm === '12' && zeile(DEMO).is_demo === true && !!zeile(UNIT).created_at, zeile(SEIL));
  check('Unterzeile wie in der App: „Drahtseil · 1,5 t · 4 m · Ø 12 mm“', cfg.unitInfo(zeile(SEIL)) === 'Drahtseil · 1,5 t · 4 m · Ø 12 mm' && cfg.unitInfo(zeile(BAND)) === 'Hebeband · 2 t · 3 m', [cfg.unitInfo(zeile(SEIL)), cfg.unitInfo(zeile(BAND))]);

  // Drahtseil: 4 Brüche auf 3d bei Kabelschlagseil (Grenze 10) → grün; Haken 25 → 28 → rot, Rot-Mangel mit Sperre
  const fall = async (id, unit, type, werte, defId) => {
    const spec = cfg.measure(zeile(unit));
    const o = spec ? spec.evaluate(werte) : undefined;
    const checklist = Object.fromEntries(cfg.checklistFor(zeile(unit)).map((c) => [c.id, o?.red && c.id === spec.checkId ? 'defect' : 'ok']));
    const measurements = spec ? measurementsForRow(werte, spec.measuredKeys) : {};
    let r = await t.versuch(W, T.insp, { ...buildInspectionRow(cfg, { id, orgId: ORG, userId: W, siteId: SITE, unitId: unit, type, at: AT, start: null, end: null, checklist, notes: '', inspectorName: 'Max Muster', qualification: '', signature: '', measurements }), photo_urls: [] });
    if (!r && defId) {
      r = await t.versuch(W, T.def, { ...buildDefectRow(cfg, { id: defId, orgId: ORG, userId: W, siteId: SITE, unitId: unit, inspectionId: id, at: AT, title: spec.texts.defectTitle(o.text), description: '', severity: spec.redSeverity, blocked: true, inspectorName: 'Max Muster' }), photo_urls: [] });
    }
    const db = (await t.db.query(`select checklist, measurements, entry_hash, type from ${T.insp} where id = '${id}'`)).rows[0];
    return { r, o, db, checklist, measurements };
  };
  const IS = '00000000-0000-4000-8000-0000000002d1';
  const IH = '00000000-0000-4000-8000-0000000002d2';
  const IB = '00000000-0000-4000-8000-0000000002d3';
  const IR = '00000000-0000-4000-8000-0000000002d4';
  const DH = '00000000-0000-4000-8000-0000000002f2';
  let f = await fall(IS, SEIL, 'expert', { ...cfg.measure(zeile(SEIL)).prefill({}), b3: '4' });
  check('Drahtseil (Kabelschlagseil aus den Stammdaten), 4 Brüche auf 3d: grün, angenommen, Messwerte samt Seilart gespeichert',
    f.r === null && f.o.red === false && gleich(f.db?.measurements, { nominal: '12', ropeKind: 'cable', b3: '4' }) && Object.keys(f.db.checklist).length === 7 && f.db.checklist.wireBreaks === 'ok' && istHash(f.db.entry_hash), f);
  f = await fall(IH, HAKEN, 'expert', { openingNew: '25', openingMeasured: '28' }, DH);
  check('Lasthaken 25 → 28 mm: rot („Maulaufweitung 12 %“), Punkt „Maulaufweitung“ = Mangel, Prüfung + Rot-Mangel mit Sperre angenommen',
    f.r === null && f.o.red === true && f.o.text === 'Maulaufweitung 12 %' && f.db?.checklist?.opening === 'defect' && Object.keys(f.db.checklist).length === 6 && gleich(f.db.measurements, { openingNew: '25', openingMeasured: '28' }), f);
  row = (await t.db.query(`select title, severity, item_blocked from ${T.def} where id = '${DH}'`)).rows[0];
  check('… Mangel „Ablegereif: Maulaufweitung 12 %“, Rot, gesperrt', row?.title === 'Ablegereif: Maulaufweitung 12 %' && row.severity === 'red' && row.item_blocked === true, row);
  f = await fall(IB, BAND, 'visual', {});
  check('Hebeband (kein Rechner): Checkliste des Typs (6 Punkte), measurements = {}', f.r === null && cfg.measure(zeile(BAND)) === null && Object.keys(f.db?.checklist ?? {}).length === 6 && 'webbing' in f.db.checklist && gleich(f.db.measurements, {}), f);
  f = await fall(IR, UNIT, 'crack', {});
  check('Rissprüfung (Prüfart „crack“) der Kette wird angenommen', f.r === null && f.db?.type === 'crack', f);

  // ---- Vorbelegung beim nächsten Mal: Messwerte der jüngsten gültigen Prüfung (Abfrage wie src/pruefen/backend.ts)
  row = (await t.als(W, () => t.db.query(`select measurements from ${T.insp} where item_id = '${HAKEN}' and canceled = false order by started_at desc limit 1`))).rows[0];
  check('Jüngste Messwerte je Teil sind für den Mitarbeiter lesbar → nächstes Mal ist „Maulweite neu“ vorbelegt', gleich(cfg.measure(zeile(HAKEN)).prefill(row?.measurements ?? {}), { openingNew: '25', nominal: '' }), row);

  // ---- Rissprüfungs-Frist (Kette: 3 Jahre ab letzter Rissprüfung, sonst ab Herstelljahr)
  check('Rissprüfung: Kette Bj. 2020 ohne Rissprüfung → überfällig; nach einer Rissprüfung heute → nicht fällig; Haken → keine',
    cfg.unitExtraDue(zeile(DEMO), () => undefined)?.state === 'overdue' && /^Rissprüfung überfällig \(seit 01\.01\.2023\)$/.test(cfg.unitExtraDue(zeile(DEMO), () => undefined).text) &&
      cfg.unitExtraDue(zeile(UNIT), () => new Date().toISOString())?.state === 'ok' && cfg.unitExtraDue(zeile(HAKEN), () => undefined) === null, cfg.unitExtraDue(zeile(DEMO), () => undefined));

  // ---- Frist je Land aus der Betriebs-Zeile
  const org = async () => (await t.als(W, () => t.db.query(`select * from public.org where id = '${ORG}'`))).rows[0];
  const tag = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let o = await org();
  check('Frist aus der Betriebs-Zeile: Land DE → 12 Monate', o?.land === 'DE' && tag(cfg.dueDate(new Date('2026-11-19T10:00:00'), o)) === '2027-11-19', o?.land);
  await t.db.query(`update public.org set land = 'AT' where id = '${ORG}'`);
  o = await org();
  check('… Land AT → 15 Monate, spätestens 31.12. des Folgejahres', o?.land === 'AT' && tag(cfg.dueDate(new Date('2026-11-19T10:00:00'), o)) === '2027-12-31' && tag(cfg.dueDate(new Date('2026-03-10T10:00:00'), o)) === '2027-06-10');

  // ---- Gratis-Grenze: 3 aktive Teile, Beispieldaten und ausgesonderte zählen nicht (Zählung wie src/pruefen/pro.ts)
  const zahl = async () => (await t.als(W, () => t.db.query(`select count(*)::int as n from ${T.unit} where ${cfg.cols.retired} = false and ${cfg.cols.demo} = false`))).rows[0].n;
  check('Gratis-Grenze: 4 eigene Teile + 1 Beispiel-Teil → gezählt werden 4 (≥ 3 → Pro-Frage an den Server)', (await zahl()) === 4 && cfg.freeUnits === 3, String(await zahl()));
  await t.db.query(`update ${T.unit} set retired = true, retired_at = now(), retire_reason = 'Test' where id in ('${BAND}', '${HAKEN}')`);
  check('… nach dem Aussondern von zwei Teilen: 2 (< 3 → ein weiteres Teil ist frei)', (await zahl()) === 2);
  const { gateText } = await import(pathToFileURL(path.join(here, '../src/pruefen/pro.ts')).href);
  check('Hinweistext der Grenze (gateText) nennt 3 Teile und was nicht zählt', !!mod && gateText(cfg).startsWith('Im Gratis-Paket sind 3 Teile im Bestand möglich (ausgesonderte Teile und Beispieldaten zählen nicht)'), gateText(cfg));
}

// ---------------------------------------------------------------- GurtDex: Ablegereife (Herstellungsdatum + max. Gebrauchsdauer)
async function gurtdexExtra({ t, cfg, T }) {
  const ALT = '00000000-0000-4000-8000-0000000000c5'; // Gebrauchsdauer überschritten
  const ALT2 = '00000000-0000-4000-8000-0000000000c6'; // überschritten, Datum als „03/2014“ eingetragen
  const NEU = '00000000-0000-4000-8000-0000000000c7'; // noch lange gut
  const dieses = new Date().getFullYear();
  await t.db.exec(`
    insert into ${T.unit} (id, org_id, site_id, name, category, serial_no, wearer_name, manufacture_date, max_life_years) values
      ('${ALT}', '${ORG}', '${SITE}', 'Gurt alt', 'Auffanggurt (EN 361)', '14-A-0311', 'M. Krause', '2014-03', '10'),
      ('${ALT2}', '${ORG}', '${SITE}', 'Gurt alt 2', 'Auffanggurt (EN 361)', null, null, '03/2014', '10'),
      ('${NEU}', '${ORG}', '${SITE}', 'Gurt neu', 'Auffanggurt (EN 361)', null, null, '${dieses - 1}-01', '10');
  `);
  check('Frist der Sachkundigen-Prüfung: 365 Tage in jedem Land', ['DE', 'AT', 'CH'].every((land) => cfg.dueIntervalDays({ land }) === 365) && cfg.dueIntervalDays({}) === 365);
  const frage = Object.fromEntries(cfg.severities.map((s) => [s.id, !!s.blockQuestion]));
  check('Sperr-Rückfrage bei Orange und Rot, nicht bei Grün', frage.green === false && frage.amber === true && frage.red === true, frage);

  // Zeilen so, wie die Liste sie liest (Spalten aus unitSelect, als Mitarbeiter)
  const rows = (await t.als(W, () => t.db.query(`select ${cfg.unitSelect} from ${T.unit}`))).rows;
  const zeile = (id) => rows.find((x) => x.id === id);
  const a = cfg.unitAlert(zeile(ALT));
  check('Ablegereif (2014-03 + 10 Jahre): Warnung „Ablegereif“ mit Text, Vorbelegung lifetime = Mangel, eigener Abschluss-Text',
    a?.badge === 'Ablegereif' && /^Ablegereif seit März 2024 \(max\. Gebrauchsdauer 10 Jahre überschritten\)/.test(a.text) && a.checklist?.lifetime === 'defect' &&
      Object.keys(a.checklist).length === 1 && /Ablegereife & Gebrauchsdauer/.test(a.formHint ?? '') && /aussondern/.test(a.doneText), a);
  check('… der vorbelegte Punkt „lifetime“ ist ein Punkt der Checkliste', cfg.checklist.some((c) => c.id === 'lifetime'));
  check('… auch wenn das Herstellungsdatum als „03/2014“ eingetragen ist (wie in der App)', cfg.unitAlert(zeile(ALT2))?.badge === 'Ablegereif', cfg.unitAlert(zeile(ALT2)));
  check('Nicht ablegereif (Vorjahr + 10 Jahre) und ohne Angaben: keine Warnung', cfg.unitAlert(zeile(NEU)) === null && cfg.unitAlert(zeile(UNIT)) === null, [cfg.unitAlert(zeile(NEU)), cfg.unitAlert(zeile(UNIT))]);
  check('Unterzeile wie in der App: Art · Nr. · Träger/in', cfg.unitInfo(zeile(ALT)) === 'Auffanggurt (EN 361) · Nr. 14-A-0311 · Träger/in: M. Krause' && cfg.unitInfo(zeile(NEU)) === 'Auffanggurt (EN 361)', cfg.unitInfo(zeile(ALT)));

  // Prüfung des ablegereifen Artikels: Checkliste mit der Vorbelegung, dazu der Rot-Mangel mit Sperre
  const IA = '00000000-0000-4000-8000-0000000000da';
  const DA = '00000000-0000-4000-8000-0000000000fa';
  const checklist = { ...Object.fromEntries(cfg.checklist.map((c) => [c.id, 'ok'])), ...a.checklist };
  let r = await t.versuch(W, T.insp, {
    ...buildInspectionRow(cfg, { id: IA, orgId: ORG, userId: W, siteId: SITE, unitId: ALT, type: 'expert', at: AT, start: null, end: null, checklist, notes: '', inspectorName: 'Max Muster', qualification: '', signature: SIG }),
    photo_urls: [],
  });
  check('Prüfung des ablegereifen Artikels (lifetime = Mangel) wird angenommen', r === null, r);
  r = await t.versuch(W, T.def, {
    ...buildDefectRow(cfg, { id: DA, orgId: ORG, userId: W, siteId: SITE, unitId: ALT, inspectionId: IA, at: AT, title: 'Ablegereife & Gebrauchsdauer', description: a.text, severity: 'red', blocked: true, inspectorName: 'Max Muster' }),
    photo_urls: [STORAGE_PREFIX + photoPath(ORG, cfg.photoFolders.defect, DA, 1)],
  });
  check('… und der Rot-Mangel mit Sperre dazu', r === null, r);
  const row = (await t.db.query(`select i.checklist, i.entry_hash, d.severity, d.item_blocked from ${T.insp} i join ${T.def} d on d.inspection_id = i.id where i.id = '${IA}'`)).rows[0];
  check('… in der Datenbank: lifetime = defect, Prüfcode, Rot, gesperrt', row?.checklist?.lifetime === 'defect' && istHash(row.entry_hash) && row.severity === 'red' && row.item_blocked === true, row);
}

// ---------------------------------------------------------------- Lauf
for (const a of dran) {
  const app = APPS[a];
  console.log(`\n=== ${app.name} — echtes Schema aus ${path.join(app.repo, 'supabase')}`);
  marke = '';
  const vorher = { ok, fail };
  if (app.ort) await pruefeOrt(app);
  else await pruefe(app);
  if (app.variante) {
    console.log(`--- ${app.name}: ${app.variante.name}`);
    marke = '[Variante] ';
    await pruefe(app, { nachSchema: app.variante.nachSchema });
    marke = '';
  }
  console.log(`--- ${app.name}: ${ok - vorher.ok} bestanden, ${fail - vorher.fail} fehlgeschlagen`);
}

console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
