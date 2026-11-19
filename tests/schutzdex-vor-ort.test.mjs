// Prüft „Vor Ort“ (SchutzDex) in zwei Teilen:
//   0) gegen den QUELLTEXT der App — Fälligkeit, Auswertung des Verständnis-Checks, Inhalts-Prüfung und Spalten des
//      Nachweises müssen gleich sein: src/lib/due.ts und src/lib/aiValidate.ts der App werden geladen und Wert für
//      Wert mit src/schutzdex/vorOrt/due.ts bzw. rows.ts verglichen.
//   1) gegen das ECHTE SchutzDex-Schema (PGlite = Postgres im Speicher — NIE die echte Datenbank): Der Nachweis, den
//      der Browser schreibt (src/schutzdex/vorOrt/rows.ts), muss von RLS und Triggern angenommen werden; ein fremder
//      Betrieb wird abgelehnt; der Nachweis ist danach unveränderlich und sein Prüfcode gültig.
//
//   Aufruf:  node tests/schutzdex-vor-ort.test.mjs
//   Braucht: das App-Repo (Standard: ../SchutzDex auf dem Desktop, sonst Umgebungsvariable SCHUTZDEX_REPO) und PGlite
//            aus dem PrüfDex-Repo (../PruefDex/supabase/tests: npm install; sonst PRUEFDEX_REPO) — SchutzDex bringt
//            selbst keine SQL-Tests mit, das Dashboard bekommt keine neue Abhängigkeit. Von dort kommt auch der
//            Nachbau dessen, was Supabase mitbringt (Rollen, auth.users, auth.uid()).
//   Node ab 22.18 (liest die .ts-Dateien direkt).
//
// NICHT geprüft wird hier (läuft nicht in PGlite): PostgREST selbst, RevenueCat/Suite-Server (Pro-Auskunft) und die
// Zeichenfläche im Browser.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.SCHUTZDEX_REPO ?? 'C:/Users/2easy/Desktop/SchutzDex';
const PGREPO = process.env.PRUEFDEX_REPO ?? 'C:/Users/2easy/Desktop/PruefDex';
const pglitePfad = path.join(PGREPO, 'supabase/tests/node_modules/@electric-sql/pglite/dist/index.js');
if (!existsSync(pglitePfad)) {
  console.error(`PGlite nicht gefunden: ${pglitePfad}\nBitte im PruefDex-Repo unter supabase/tests einmal „npm install“ ausführen (oder PRUEFDEX_REPO setzen).`);
  process.exit(2);
}
if (!existsSync(path.join(REPO, 'supabase/migrations/0001_init.sql'))) {
  console.error(`SchutzDex-Repo nicht gefunden: ${REPO} (SCHUTZDEX_REPO setzen).`);
  process.exit(2);
}
const { PGlite } = await import(pathToFileURL(pglitePfad).href);
const WEB = await import(pathToFileURL(path.join(here, '../src/schutzdex/vorOrt/due.ts')).href);
const R = await import(pathToFileURL(path.join(here, '../src/schutzdex/vorOrt/rows.ts')).href);
const { buildCompletionRow, withoutNewFields, checkOutcome, contentHashInput, safeSections, safeQuestions, isSignature, withinFreeMembers, FREE_LIMITS, PASS_RATIO, NEW_COMPLETION_FIELDS } = R;

const lies = (n) => readFileSync(path.join(REPO, 'supabase', n), 'utf8').replace(/\r\n/g, '\n');
const liesApp = (n) => readFileSync(path.join(REPO, 'src', n), 'utf8').replace(/\r\n/g, '\n');
const liesWeb = (n) => readFileSync(path.join(here, '..', n), 'utf8').replace(/\r\n/g, '\n');
const ohneErweiterungen = (sql) => sql.replace(/^create extension if not exists [^;]+;/gim, '');

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`);
};
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const istHash = (h) => /^[0-9a-f]{64}$/.test(h ?? '');

const U = '00000000-0000-4000-8000-0000000000b1'; // Inhaber
const X = '00000000-0000-4000-8000-0000000000b9'; // Inhaber eines FREMDEN Betriebs
const ORG = '00000000-0000-4000-8000-0000000000a1';
const ORG2 = '00000000-0000-4000-8000-0000000000a2';
const M1 = '00000000-0000-4000-8000-0000000000c1';
const M2 = '00000000-0000-4000-8000-0000000000c2';
const M3 = '00000000-0000-4000-8000-0000000000c3'; // inaktiv
const MX = '00000000-0000-4000-8000-0000000000c9'; // Mitarbeiter des fremden Betriebs
const B1 = '00000000-0000-4000-8000-0000000000d1';
const B2 = '00000000-0000-4000-8000-0000000000d2'; // ohne Fragen
const BX = '00000000-0000-4000-8000-0000000000d9';
const N1 = '00000000-0000-4000-8000-0000000000e1';
const N2 = '00000000-0000-4000-8000-0000000000e2';
const N3 = '00000000-0000-4000-8000-0000000000e3';
const N4 = '00000000-0000-4000-8000-0000000000e4';
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const HASH = 'a'.repeat(64);
const INHALT = [{ titel: 'Vor dem Benutzen', text: 'Leiter prüfen.', kernpunkte: ['Holme ohne Risse', 'Füße rutschfest'] }];
const FRAGEN = [
  { frage: 'Winkel?', optionen: ['45°', '70°', '90°'], loesung_index: 1 },
  { frage: 'Beschädigt?', optionen: ['weiter', 'aussondern'], loesung_index: 1 },
  { frage: 'Überstand?', optionen: ['keiner', '1 m'], loesung_index: 1 },
];

// ================================================================ 0) Web-Code gegen den Quelltext der App
const tmp = mkdtempSync(path.join(tmpdir(), 'schutzdex-test-'));
async function ladeApp(datei) {
  // nur Typ-Importe („import type … from '@/types/db'“) — die fallen beim Laden weg; die Datei läuft unverändert
  const quelle = liesApp(datei);
  const kopie = path.join(tmp, datei.replace(/[\\/]/g, '-'));
  writeFileSync(kopie, quelle);
  return import(pathToFileURL(kopie).href);
}

async function gegenApp() {
  console.log(`\n=== SchutzDex — Web gegen den Quelltext der App (${path.join(REPO, 'src')})`);
  const APP = await ladeApp('lib/due.ts');
  check('Fristen-Konstanten wie in der App: 365 Tage gültig, „bald fällig“ ab 30 Tagen',
    WEB.UNTERWEISUNG_VALID_DAYS === APP.UNTERWEISUNG_VALID_DAYS && WEB.DUE_SOON_DAYS === APP.DUE_SOON_DAYS && WEB.UNTERWEISUNG_VALID_DAYS === 365 && WEB.DUE_SOON_DAYS === 30);

  const JETZT = [new Date(2026, 10, 19, 9, 0), new Date(2027, 1, 28, 23, 30), new Date(2028, 1, 29, 0, 10), new Date(2026, 2, 29, 2, 30)];
  const ZEITEN = [undefined, '2025-11-19T08:00:00.000Z', '2025-11-20T08:00:00.000Z', '2025-11-18T23:30:00.000Z', '2025-12-18T10:00:00.000Z', '2025-12-19T10:00:00.000Z', '2025-12-20T10:00:00.000Z',
    '2024-02-29T10:00:00.000Z', '2026-11-19T06:00:00.000Z', '2026-01-01T00:00:00.000Z', '2020-05-05T05:05:05.000Z', '2026-03-29T01:30:00.000Z', '2027-02-27T22:59:00.000Z'];
  const kurz = (i) => ({ state: i.state, dueAt: i.dueAt?.getTime() ?? null, daysLeft: i.daysLeft });
  let abw = [];
  for (const now of JETZT) for (const z of ZEITEN) {
    const a = WEB.dueInfo(z, now);
    const b = APP.dueInfo(z, now);
    if (!gleich(kurz(a), kurz(b)) || WEB.dueLabel(a) !== APP.dueLabel(b)) abw.push({ now, z });
  }
  check(`dueInfo / dueLabel: ${JETZT.length * ZEITEN.length} Fälle wie in der App (gleiche Ampel, gleicher Tag, gleicher Satz)`, abw.length === 0, abw.slice(0, 3));
  const d = (z) => WEB.dueInfo(z, JETZT[0]);
  check('… Stichprobe: vor genau einem Jahr = heute fällig (überfällig, 0 Tage); 29.02. läuft am 28.02. ab; nie unterwiesen',
    d('2025-11-19T08:00:00.000Z').state === 'overdue' && d('2025-11-19T08:00:00.000Z').daysLeft === 0 && d('2025-11-20T08:00:00.000Z').state === 'soon' &&
      d(undefined).state === 'never' && WEB.fmtDate(WEB.dueInfo('2024-02-29T10:00:00.000Z', JETZT[0]).dueAt) === '28.02.2025' && WEB.dueLabel(d(undefined)) === 'Noch nicht unterwiesen');

  const NACHWEISE = [
    { member_id: M1, briefing_id: B1, check_passed: true, abgeschlossen_am: '2025-10-01T08:00:00.000Z' }, // abgelaufen
    { member_id: M1, briefing_id: B1, check_passed: false, abgeschlossen_am: '2026-11-01T08:00:00.000Z' }, // durchgefallen zählt nicht
    { member_id: M1, briefing_id: B2, check_passed: true, abgeschlossen_am: '2026-06-01T08:00:00.000Z' },
    { member_id: M2, briefing_id: B1, check_passed: true, abgeschlossen_am: '2025-12-01T08:00:00.000Z' }, // bald fällig
    { member_id: M2, briefing_id: B1, check_passed: true, abgeschlossen_am: '2025-01-01T08:00:00.000Z' },
    { member_id: M2, briefing_id: B2, check_passed: true, abgeschlossen_am: '2026-06-01T08:00:00.000Z' },
    { member_id: null, briefing_id: B1, check_passed: true, abgeschlossen_am: '2026-06-01T08:00:00.000Z' }, // Mitarbeiter gelöscht
    { member_id: M3, briefing_id: null, check_passed: true, abgeschlossen_am: '2026-06-01T08:00:00.000Z' }, // Unterweisung gelöscht
  ];
  const lw = WEB.lastPassedByPair(NACHWEISE);
  const la = APP.lastPassedByPair(NACHWEISE);
  check('lastPassedByPair wie in der App (nur bestandene, je Paar Mitarbeiter × Unterweisung der jüngste)', gleich([...lw].sort(), [...la].sort()) && lw.size === 4 && lw.get(`${M2}|${B1}`) === '2025-12-01T08:00:00.000Z', [...lw]);
  abw = [];
  for (const m of [M1, M2, M3]) for (const liste of [[], [B1], [B1, B2], [B2]]) {
    const a = WEB.memberStatus(m, liste, lw, JETZT[0]);
    const b = APP.memberStatus(m, liste, la, JETZT[0]);
    const flach = (s) => ({ ...s, nextDue: s.nextDue?.getTime() ?? null, items: s.items.map((i) => [i.briefingId, kurz(i.info)]) });
    if (!gleich(flach(a), flach(b)) || WEB.memberStatusLabel(a) !== APP.memberStatusLabel(b) || WEB.memberStatusBadge(a) !== APP.memberStatusBadge(b)) abw.push({ m, liste });
  }
  check('memberStatus / Label / Badge: 12 Fälle wie in der App', abw.length === 0, abw);
  const s1 = WEB.memberStatus(M1, [B1, B2], lw, JETZT[0]);
  const s2 = WEB.memberStatus(M2, [B1, B2], lw, JETZT[0]);
  const s3 = WEB.memberStatus(M3, [B1, B2], lw, JETZT[0]);
  check('… Stichprobe: abgelaufen / bald fällig / noch nie — „Unterwiesen ✓“ nur, wenn ALLE Unterweisungen aktuell sind',
    s1.state === 'expired' && WEB.memberStatusBadge(s1) === 'Abgelaufen' && s2.state === 'soon' && WEB.memberStatusBadge(s2) === 'Bald fällig' && s3.state === 'partial' &&
      WEB.memberStatusBadge(s3) === '0 von 2' && WEB.memberStatusBadge(WEB.memberStatus(M2, [B2], lw, JETZT[0])) === 'Unterwiesen ✓', [s1.state, s2.state, s3.state]);

  // --- Inhalt und Fragen defensiv lesen
  const V = await ladeApp('lib/aiValidate.ts');
  const INHALTE = [null, undefined, 'x', {}, [], INHALT, [{ titel: ' A ', text: 5, kernpunkte: ['a', '', 7, ' b '] }, null, 'x', { text: 'nur Text' }], [{ kernpunkte: 'kein Feld' }]];
  abw = INHALTE.filter((v) => !gleich(safeSections(v), V.safeSections(v)));
  check(`safeSections: ${INHALTE.length} Eingaben wie in der App (nie werfen, Fehlendes weglassen)`, abw.length === 0, abw);
  const FRAGELISTEN = [null, 'x', [], FRAGEN, [{ frage: 'ok?', optionen: ['a', 'b'], loesung_index: 0 }, { frage: '', optionen: ['a', 'b'], loesung_index: 0 }, { frage: 'eine', optionen: ['a'], loesung_index: 0 },
    { frage: 'leer', optionen: ['a', ''], loesung_index: 0 }, { frage: 'idx', optionen: ['a', 'b'], loesung_index: 2 }, { frage: 'idx', optionen: ['a', 'b'], loesung_index: '1' }, { frage: 'idx', optionen: ['a', 'b'], loesung_index: 0.5 }, null, 7]];
  abw = FRAGELISTEN.filter((v) => !gleich(safeQuestions(v), V.safeQuestions(v)));
  check(`safeQuestions: ${FRAGELISTEN.length} Eingaben wie in der App (Fragen ohne gültige Lösung entfallen)`, abw.length === 0 && safeQuestions(FRAGELISTEN[4]).length === 1, abw);

  // --- Verständnis-Check auswerten (steht in der App im Bildschirm selbst → am Quelltext festgemacht)
  const screen = liesApp('screens/briefings/RunBriefingScreen.tsx');
  const pass = screen.match(/const PASS_RATIO = ([\d.]+);/);
  check('Bestehensgrenze wie in der App: 70 %', !!pass && PASS_RATIO === Number(pass[1]) && PASS_RATIO === 0.7, pass?.[1]);
  check('Auswertung steht so in der App (ohne Fragen: kein Ergebnis, aber „durchgeführt“)',
    screen.includes(`(acc, q, i) => acc + (answers[i] === q.loesung_index ? 1 : 0),`) && screen.includes(`const s = total === 0 ? null : Math.round((c / total) * 100);`) &&
      screen.includes(`return { score: s, correct: c, passed: total === 0 || c / total >= PASS_RATIO };`));
  const appCheck = (questions, answers) => {
    const total = questions.length;
    const c = questions.reduce((acc, q, i) => acc + (answers[i] === q.loesung_index ? 1 : 0), 0);
    const s = total === 0 ? null : Math.round((c / total) * 100);
    return { score: s, correct: c, passed: total === 0 || c / total >= Number(pass?.[1]) };
  };
  const zehn = Array.from({ length: 10 }, (_, i) => ({ frage: `F${i}`, optionen: ['a', 'b'], loesung_index: 0 }));
  const ANTWORTEN = [[FRAGEN, {}], [FRAGEN, { 0: 1, 1: 1, 2: 1 }], [FRAGEN, { 0: 1, 1: 1, 2: 0 }], [FRAGEN, { 0: 0, 1: 0, 2: 0 }], [[], {}], [zehn, Object.fromEntries(zehn.map((_, i) => [i, i < 7 ? 0 : 1]))],
    [zehn, Object.fromEntries(zehn.map((_, i) => [i, i < 6 ? 0 : 1]))]];
  abw = ANTWORTEN.filter(([q, a]) => !gleich(checkOutcome(q, a), appCheck(q, a)));
  check('… und so rechnet der Browser (7 Fälle)', abw.length === 0, abw.map(([q, a]) => checkOutcome(q, a)));
  check('… Stichprobe: 2 von 3 = 67 % nicht bestanden · 7 von 10 bestanden · 6 von 10 nicht · ohne Fragen kein Ergebnis, gilt als durchgeführt',
    gleich(checkOutcome(FRAGEN, { 0: 1, 1: 1, 2: 0 }), { score: 67, correct: 2, passed: false }) && checkOutcome(zehn, ANTWORTEN[5][1]).passed === true &&
      checkOutcome(zehn, ANTWORTEN[6][1]).passed === false && gleich(checkOutcome([], {}), { score: null, correct: 0, passed: true }));

  // --- Spalten der Zeile
  const queries = liesApp('lib/queries.ts');
  const block = queries.slice(queries.indexOf('export async function createCompletion(')).match(/const row = \{\n([\s\S]*?)\n  \};/)?.[1] ?? '';
  const appSpalten = [...block.matchAll(/^\s{4}([a-z_]+): /gm)].map((m) => m[1]).sort();
  const voll = buildCompletionRow({ id: N1, at: '2026-11-19T08:12:41.000Z', orgId: ORG, memberId: M1, memberName: 'Max Huber', briefingId: B1, briefingVersion: 1, briefingTitel: ' Leitern und Tritte ',
    score: 100, passed: true, signature: SIG, deviceInfo: 'web (iPhone; CPU iPhone OS 18_1 like Mac OS X)', contentHash: HASH, trainer: ' Alex Chef ' });
  check(`Nachweis hat dieselben ${appSpalten.length} Spalten wie createCompletion der App`, appSpalten.length === 14 && gleich(Object.keys(voll).sort(), appSpalten), { web: Object.keys(voll).sort(), app: appSpalten });
  check('Zeile wie in der App gefüllt: Unterschrift als PNG-Daten-URI in signature_path, Name des Mitarbeiters, Thema und unterweisende Person getrimmt',
    isSignature(voll.signature_path) && voll.signature_path === SIG && voll.signed_name === 'Max Huber' && voll.briefing_titel === 'Leitern und Tritte' && voll.unterwiesen_von === 'Alex Chef' &&
      voll.abgeschlossen_am === '2026-11-19T08:12:41.000Z' && voll.content_hash === HASH && voll.check_score === 100 && voll.check_passed === true, voll);
  check('… gleiche Kürzung wie in der App (Thema 300, Name 120 Zeichen; leer wird NULL)',
    block.includes(`briefing_titel: input.briefing_titel?.trim().slice(0, 300) || null,`) && block.includes(`unterwiesen_von: input.unterwiesen_von?.trim().slice(0, 120) || null,`) &&
      block.includes(`content_hash: input.content_hash || null,`) && block.includes(`device_info: input.device_info ?? null,`) &&
      buildCompletionRow({ ...{ id: N2, at: 'x', orgId: ORG, memberId: M1, memberName: 'M', briefingId: B1, briefingVersion: 1, score: null, passed: true, signature: SIG }, briefingTitel: 'T'.repeat(400), trainer: 'N'.repeat(200) }).briefing_titel.length === 300 &&
      buildCompletionRow({ id: N2, at: 'x', orgId: ORG, memberId: M1, memberName: 'M', briefingId: B1, briefingVersion: 1, briefingTitel: ' ', score: null, passed: true, signature: SIG, trainer: '  ', contentHash: '' }).unterwiesen_von === null);
  const neu = queries.match(/const NEW_COMPLETION_FIELDS = \[([^\]]+)\] as const;/)?.[1].match(/'(\w+)'/g)?.map((x) => x.slice(1, -1));
  check('Felder des Nachtrags wie in der App (ohne sie wird notfalls gespeichert)', gleich(neu, [...NEW_COMPLETION_FIELDS]) && Object.keys(withoutNewFields(voll)).length === 11 && !('unterwiesen_von' in withoutNewFields(voll)), neu);
  check('Unterschrift im Format der App erkannt (PNG-Daten-URI) — die App liefert onOK(„data:image/png;base64,…“)',
    isSignature(SIG) && !isSignature('data:image/jpeg;base64,AAAA') && !isSignature('') && liesWeb('src/schutzdex/vorOrt/SignPad.tsx').includes(`out.toDataURL('image/png')`) &&
      liesApp('lib/queries.ts').includes('signature_path: input.signature_base64,'));
  check('Inhaltsversion wie in der App: sha256 über JSON.stringify([titel, content, questions])',
    liesApp('lib/nachweis.ts').includes('JSON.stringify([b.titel, b.content, b.questions]),') && contentHashInput({ titel: 'T', content: INHALT, questions: FRAGEN }) === JSON.stringify(['T', INHALT, FRAGEN]));
  check('„Unterwiesen durch“ ist Pflicht wie in der App (ohne Namen wird nicht gespeichert)',
    screen.includes(`if (!trainer.trim()) {`) && liesWeb('src/schutzdex/vorOrt/Durchfuehren.tsx').includes(`if (!trainer.trim()) return setTrainerMissing(true);`));

  // --- Gratis-Grenzen
  const frei = liesApp('lib/purchases.ts').match(/FREE_LIMITS = \{\s*members: (\d+),\s*briefings: (\d+),/);
  check('Gratis-Grenze wie in der App: 2 Mitarbeiter, 1 Unterweisung', !!frei && FREE_LIMITS.members === Number(frei[1]) && FREE_LIMITS.briefings === Number(frei[2]) && FREE_LIMITS.members === 2, frei?.slice(1));
  check('… gezählt werden die AKTIVEN Mitarbeiter; unter der Grenze frei, ab der Grenze nur mit Pro (wie overFreeLimit in der App)',
    liesApp('screens/MembersScreen.tsx').includes('if (isPro || activeCount < FREE_LIMITS.members) return false;') && withinFreeMembers(1) && !withinFreeMembers(2) &&
      liesWeb('src/schutzdex/pro.ts').includes(`.eq('aktiv', true)`));
  check('Das Durchführen selbst ist in der App nie gesperrt — im Browser auch nicht',
    !/FREE_LIMITS|isPro/.test(screen) && !/memberGate|FREE_LIMITS/.test(liesWeb('src/schutzdex/vorOrt/Durchfuehren.tsx')));
  return voll;
}

// ================================================================ 1) Echtes Schema
const basisQuelle = readFileSync(path.join(PGREPO, 'supabase/tests/verwalter.test.mjs'), 'utf8').replace(/\r\n/g, '\n');
const BASIS = basisQuelle.match(/const BASIS = `([\s\S]*?)`;/)?.[1];
if (!BASIS) throw new Error('BASIS in PruefDex/supabase/tests/verwalter.test.mjs nicht gefunden');
const MIGRATIONEN = readdirSync(path.join(REPO, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => `migrations/${f}`);
const NACHTRAG = 'NACHTRAG-RUNDUMCHECK-2026-11-10.sql';

async function aufbau(nachtrag) {
  const db = new PGlite();
  await db.exec(BASIS);
  for (const f of [...MIGRATIONEN, ...(nachtrag ? [NACHTRAG] : [])]) {
    try {
      await db.exec(ohneErweiterungen(lies(f)));
    } catch (e) {
      throw new Error(`${f}: ${e?.message ?? e}`);
    }
  }
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
  // wie PostgREST: Objekte und Listen gehen als JSON in jsonb-Spalten
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
  await db.exec(`
    insert into auth.users (id, email) values ('${U}', 'chef@example.com'), ('${X}', 'fremd@example.com');
    insert into public.org (id, owner_user_id, name) values ('${ORG}', '${U}', 'Testbetrieb'), ('${ORG2}', '${X}', 'Fremder Betrieb');
    insert into public.member (id, org_id, name, taetigkeit, aktiv) values
      ('${M1}', '${ORG}', 'Max Huber', 'Monteur', true), ('${M2}', '${ORG}', 'Anna Steiner', null, true), ('${M3}', '${ORG}', 'Peter Alt', null, false),
      ('${MX}', '${ORG2}', 'Fremder Mitarbeiter', null, true);
  `);
  await db.query(`insert into public.briefing (id, org_id, titel, content, questions) values ($1, $2, 'Leitern und Tritte', $3, $4), ($5, $2, 'Erste Hilfe', $3, '[]'), ($6, $7, 'Fremd', $3, '[]')`,
    [B1, ORG, JSON.stringify(INHALT), JSON.stringify(FRAGEN), B2, BX, ORG2]);
  return { db, als, versuch };
}

async function pruefe(voll, nachtrag, marke) {
  const t = await aufbau(nachtrag);
  const check2 = (name, cond, extra) => check(marke + name, cond, extra);
  const q = async (sql, p) => (await t.db.query(sql, p)).rows;
  let r;
  // Datenbank ohne den Nachtrag kennt Thema/Inhaltsversion/unterweisende Person nicht → der Browser lässt sie dann weg
  const zeile = (row) => (nachtrag ? row : withoutNewFields(row));

  if (!nachtrag) {
    r = await t.versuch(U, 'public.completion', voll);
    check2('Datenbank VOR dem Nachtrag lehnt die neuen Spalten ab (42703 „Spalte fehlt“) — der Browser speichert dann einmal ohne sie', r?.code === '42703', r);
  }

  // ---------------------------------------------------------------- 1) Nachweis des Inhabers wird angenommen
  r = await t.versuch(U, 'public.completion', zeile(voll));
  check2('Unterschriebener Nachweis (bestanden, 100 %) wird angenommen', r === null, r);
  let row = (await q(`select * from public.completion where id = $1`, [N1]))[0];
  check2('Gespeichert wie gesendet: Mitarbeiter, Unterweisung + Version, Ergebnis, Name, Zeitpunkt der Unterschrift',
    row?.member_id === M1 && row.briefing_id === B1 && row.briefing_version === 1 && row.check_score === 100 && row.check_passed === true && row.signed_name === 'Max Huber' &&
      row.abgeschlossen_am?.toISOString?.() === '2026-11-19T08:12:41.000Z' && row.device_info?.startsWith('web'), row);
  check2('Unterschrift steht als PNG-Daten-URI in signature_path (gleiches Format wie die App)', row?.signature_path === SIG && isSignature(row.signature_path));
  if (nachtrag) check2('Thema, Inhaltsversion und unterweisende Person gespeichert', row?.briefing_titel === 'Leitern und Tritte' && row.content_hash === HASH && row.unterwiesen_von === 'Alex Chef', row);
  check2('Server ergänzt: Eingang, Prüfcode (Formel v2) und created_at = Zeitpunkt der Übertragung',
    row?.received_at instanceof Date && istHash(row.entry_hash) && row.hash_version === 2 && row.created_at instanceof Date && row.created_at.getTime() > new Date('2026-11-19T08:12:41.000Z').getTime() - 1, [row?.entry_hash, row?.hash_version]);
  r = (await t.als(U, () => t.db.query(`select ok from public.verify_completion($1)`, [N1]))).rows[0];
  check2('Prüfcode passt zum Inhalt (verify_completion)', r?.ok === true, r);

  // ---------------------------------------------------------------- 2) Keine Doppelten, weitere Fälle
  r = await t.versuch(U, 'public.completion', zeile(voll));
  check2('Wiederholter Versuch mit derselben ID: „gibt es schon“ (23505) — der Browser wertet das als gespeichert', r?.code === '23505', r);
  check2('… und es bleibt bei EINEM Nachweis', (await q(`select count(*)::int as n from public.completion`))[0].n === 1);
  const ohneFragen = buildCompletionRow({ id: N2, at: '2026-11-19T08:20:00.000Z', orgId: ORG, memberId: M2, memberName: 'Anna Steiner', briefingId: B2, briefingVersion: 1, briefingTitel: 'Erste Hilfe',
    score: null, passed: true, signature: SIG, deviceInfo: 'web', contentHash: null, trainer: 'Alex Chef' });
  r = await t.versuch(U, 'public.completion', zeile(ohneFragen));
  row = (await q(`select check_score, check_passed${nachtrag ? ', content_hash' : ''} from public.completion where id = $1`, [N2]))[0];
  check2('Unterweisung ohne Fragen: Ergebnis leer (nicht „100 %“), gilt als durchgeführt; Inhaltsversion darf fehlen', r === null && row?.check_score === null && row.check_passed === true && (!nachtrag || row.content_hash === null), [r, row]);
  const durchgefallen = buildCompletionRow({ id: N3, at: '2026-11-19T08:30:00.000Z', orgId: ORG, memberId: M2, memberName: 'Anna Steiner', briefingId: B1, briefingVersion: 1, briefingTitel: 'Leitern und Tritte',
    score: 33, passed: false, signature: SIG, deviceInfo: 'web', contentHash: HASH, trainer: 'Alex Chef' });
  r = await t.versuch(U, 'public.completion', zeile(durchgefallen));
  check2('Nicht bestandener Check wird als Teilnahme gespeichert (check_passed = false)', r === null && (await q(`select check_passed from public.completion where id = $1`, [N3]))[0]?.check_passed === false, r);
  r = (await t.als(U, () => t.db.query(`select id, member_id, briefing_id, check_passed, abgeschlossen_am from public.completion order by abgeschlossen_am desc`))).rows;
  const stand = WEB.lastPassedByPair(r.map((c) => ({ ...c, abgeschlossen_am: c.abgeschlossen_am.toISOString() })));
  check2('Was die Listen lesen (schmale Spalten ohne Unterschrift): 3 Nachweise; bestanden zählt für die Frist, durchgefallen nicht',
    r.length === 3 && stand.size === 2 && stand.has(`${M1}|${B1}`) && stand.has(`${M2}|${B2}`) && !stand.has(`${M2}|${B1}`), [...stand.keys()]);

  // ---------------------------------------------------------------- 3) Fremder Betrieb wird abgelehnt
  r = await t.versuch(X, 'public.completion', zeile({ ...voll, id: N4 }));
  check2('Fremder Nutzer kann keinen Nachweis in diesen Betrieb schreiben (RLS)', r?.code === '42501', r);
  r = await t.versuch(U, 'public.completion', zeile({ ...voll, id: N4, org_id: ORG2, member_id: MX, briefing_id: BX }));
  check2('Inhaber kann keinen Nachweis in einen fremden Betrieb schreiben (RLS)', r?.code === '42501', r);
  check2('… nichts davon gespeichert', (await q(`select count(*)::int as n from public.completion where id = $1`, [N4]))[0].n === 0);
  r = (await t.als(X, () => t.db.query(`select (select count(*)::int from public.completion) as nachweise, (select count(*)::int from public.member) as mitarbeiter, (select count(*)::int from public.briefing) as unterweisungen`))).rows[0];
  check2('Fremder Nutzer sieht weder Nachweise noch Mitarbeiter oder Unterweisungen dieses Betriebs', r?.nachweise === 0 && r.mitarbeiter === 1 && r.unterweisungen === 1, r);

  // ---------------------------------------------------------------- 4) Unveränderlich
  const geaendert = await t.als(U, async () => (await t.db.query(`update public.completion set check_passed = true where id = '${N3}'`)).affectedRows).catch(() => 0);
  check2('Gespeicherter Nachweis lässt sich vom Inhaber nicht ändern', geaendert === 0 && (await q(`select check_passed from public.completion where id = $1`, [N3]))[0].check_passed === false, String(geaendert));
  let meldung = '';
  try {
    await t.db.query(`update public.completion set signed_name = 'x' where id = '${N1}'`);
  } catch (e) {
    meldung = String(e.message);
  }
  check2('… und auch intern nicht (Schutz-Trigger: append-only)', /append-only/.test(meldung), meldung);
  const geloescht = await t.als(U, async () => (await t.db.query(`delete from public.completion where id = '${N1}'`)).affectedRows).catch(() => 0);
  check2('… und nicht einzeln löschen', geloescht === 0 && (await q(`select count(*)::int as n from public.completion where id = $1`, [N1]))[0].n === 1, String(geloescht));
  await t.als(U, () => t.db.query(`delete from public.member where id = $1`, [M1]));
  row = (await q(`select member_id, signed_name from public.completion where id = $1`, [N1]))[0];
  r = (await t.als(U, () => t.db.query(`select ok from public.verify_completion($1)`, [N1]))).rows[0];
  check2('Mitarbeiter gelöscht: der Nachweis bleibt mit Namen stehen, der Prüfcode bleibt gültig', row?.member_id === null && row.signed_name === 'Max Huber' && r?.ok === true, [row, r]);

  // ---------------------------------------------------------------- 5) Mitarbeiter anlegen und zählen (Gratis-Grenze)
  r = await t.versuch(U, 'public.member', { org_id: ORG, name: 'Jonas Gruber', taetigkeit: 'Lehrling', email: null, telefon: null, eintritt_am: null, aktiv: true });
  check2('Mitarbeiter anlegen mit den Spalten des Dashboards (Name, Tätigkeit, aktiv) wird angenommen', r === null, r);
  r = await t.versuch(X, 'public.member', { org_id: ORG, name: 'Eindringling', taetigkeit: null, email: null, telefon: null, eintritt_am: null, aktiv: true });
  check2('… von einem Fremden in diesen Betrieb nicht (RLS)', r?.code === '42501', r);
  r = (await t.als(U, () => t.db.query(`select count(*)::int as aktiv from public.member where aktiv = true`))).rows[0];
  check2('Zählung für die Gratis-Grenze: 2 aktive Mitarbeiter (inaktive zählen nicht) → ab hier nur mit Pro', r?.aktiv === 2 && !withinFreeMembers(r.aktiv), r);
  r = (await q(`select to_regprocedure('public.org_pro_active()') is null as fehlt`))[0];
  check2('SchutzDex hat keine Server-Auskunft zum Tarif (kein org_pro_active) — deshalb liest das Dashboard RevenueCat/Suite (src/lib/abo.ts)', r?.fehlt === true && liesWeb('src/schutzdex/pro.ts').includes(`loadAboInfo(app, session)`), r);
  await t.db.close?.();
}

const voll = await gegenApp();
console.log(`\n=== SchutzDex — echtes Schema aus ${path.join(REPO, 'supabase')} (${MIGRATIONEN.length} Migrationen + ${NACHTRAG})`);
await pruefe(voll, true, '');
console.log('--- SchutzDex: Datenbank OHNE den Nachtrag vom 10.11. (ältere Spalten)');
await pruefe(voll, false, '[ohne Nachtrag] ');
rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
