// Prüft „Vor Ort“ (PrüfDex) in zwei Teilen:
//   0) gegen den QUELLTEXT der App — Grenzwerte, Bewertung, Ergebnis-Regel, Fristen und Spalten müssen 1:1 gleich sein:
//      mobile/src/lib/dguv.ts wird geladen und Wert für Wert mit src/pruefdex/vorOrt/dguv.ts verglichen.
//   1) gegen das ECHTE PrüfDex-Schema (PGlite = Postgres im Speicher — NIE die echte Datenbank): Die Zeile, die der
//      Browser schreibt (src/pruefdex/vorOrt/rows.ts), muss von RLS und Triggern angenommen werden; ein fremder
//      Betrieb wird abgelehnt; der Server schreibt die Frist am Gerät fort.
//
//   Aufruf:  node tests/pruefdex-vor-ort.test.mjs
//   Braucht: das App-Repo (Standard: ../PruefDex auf dem Desktop, sonst Umgebungsvariable PRUEFDEX_REPO) mit
//            installierten SQL-Tests (supabase/tests: npm install) — von dort kommt PGlite, das Dashboard bekommt
//            keine neue Abhängigkeit.
//   Node ab 22.18 (liest die .ts-Dateien direkt).
//
// NICHT geprüft wird hier (läuft nicht in PGlite): PostgREST selbst, der Foto-Speicher (nur dessen Zugriffsregeln an
// einer nachgebauten Tabelle storage.objects) und die Erweiterung http (als Attrappe, die „nicht erreichbar“ antwortet).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.PRUEFDEX_REPO ?? 'C:/Users/2easy/Desktop/PruefDex';
const pglitePfad = path.join(REPO, 'supabase/tests/node_modules/@electric-sql/pglite/dist/index.js');
if (!existsSync(pglitePfad)) {
  console.error(`PGlite nicht gefunden: ${pglitePfad}\nBitte im PruefDex-Repo unter supabase/tests einmal „npm install“ ausführen (oder PRUEFDEX_REPO setzen).`);
  process.exit(2);
}
const { PGlite } = await import(pathToFileURL(pglitePfad).href);
const WEB = await import(pathToFileURL(path.join(here, '../src/pruefdex/vorOrt/dguv.ts')).href);
const R = await import(pathToFileURL(path.join(here, '../src/pruefdex/vorOrt/rows.ts')).href);
const { buildInspectionRow, inspectorWithQualification, photoPath, FREE_LIMITS, GPS_PROOF_KEYS, STORAGE_PREFIX, withinFree } = R;

const lies = (n) => readFileSync(path.join(REPO, 'supabase', n), 'utf8').replace(/\r\n/g, '\n');
const liesApp = (n) => readFileSync(path.join(REPO, 'mobile/src', n), 'utf8').replace(/\r\n/g, '\n');
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
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const istHash = (h) => /^[0-9a-f]{64}$/.test(h ?? '');
const tag = (d) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : String(d).slice(0, 10));

const U = '00000000-0000-4000-8000-0000000000b1'; // Inhaber
const W = '00000000-0000-4000-8000-0000000000b2'; // Prüfer im Team
const X = '00000000-0000-4000-8000-0000000000b9'; // Inhaber eines FREMDEN Betriebs
const ORG = '00000000-0000-4000-8000-0000000000a1';
const ORG2 = '00000000-0000-4000-8000-0000000000a2';
const KUNDE = '00000000-0000-4000-8000-0000000000c1';
const G1 = '00000000-0000-4000-8000-0000000000d1'; // SK I, 12 Monate
const G2 = '00000000-0000-4000-8000-0000000000d2'; // SK II, 6 Monate
const GX = '00000000-0000-4000-8000-0000000000d9'; // Gerät des fremden Betriebs
const I1 = '00000000-0000-4000-8000-0000000000e1';
const I2 = '00000000-0000-4000-8000-0000000000e2';
const I3 = '00000000-0000-4000-8000-0000000000e3';
const I4 = '00000000-0000-4000-8000-0000000000e4';
const I5 = '00000000-0000-4000-8000-0000000000e5';
const HEUTE = WEB.todayISO();
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const START = { lat: 47.10471, lng: 15.70912, accuracy: 6.5, at: '2026-11-19T08:00:05.000Z' };
const ENDE = { lat: 47.10473, lng: 15.70915, accuracy: 4, at: '2026-11-19T08:12:40.000Z' };

// ================================================================ 0) Web-Code gegen den Quelltext der App
const tmp = mkdtempSync(path.join(tmpdir(), 'pruefdex-test-'));
async function gegenApp() {
  console.log(`\n=== PrüfDex — Web gegen den Quelltext der App (${path.join(REPO, 'mobile/src')})`);
  // Die App-Datei importiert nur Typen aus ../types — die Zeile entfällt, der Rest läuft unverändert.
  const quelle = liesApp('lib/dguv.ts');
  const ohneImport = quelle.replace(/^import \{[^}]*\} from '\.\.\/types';\n/m, '');
  check('App-Datei lib/dguv.ts gefunden (nur die Typ-Importzeile entfernt)', ohneImport !== quelle && !/^import /m.test(ohneImport));
  const kopie = path.join(tmp, 'app-dguv.ts');
  writeFileSync(kopie, ohneImport);
  const APP = await import(pathToFileURL(kopie).href);

  check('Sichtprüfung: 9 Punkte, Kennung und Bezeichnung wortgleich zur App', WEB.VISUAL_CHECKS.length === 9 && gleich(WEB.VISUAL_CHECKS, APP.VISUAL_CHECKS));
  check('Messungen: 4 Felder mit Einheit und Hinweistext wortgleich zur App', WEB.MEASUREMENTS.length === 4 && gleich(WEB.MEASUREMENTS, APP.MEASUREMENTS));

  // --- Zahlen lesen
  const TEXTE = [undefined, null, '', ' ', '0', '0,3', '0.3', '0,30', '0,31', '0,29', ',5', '.5', '5,', '> 300', '>300 MΩ', '1.234,5', '1.500', '1.000.000', '1,2,3', 'abc',
    '12abc', '-3', '1e3', '3,5', '3,51', '0,5', '0,51', '2', '2,0', '1,99', '1', '0,99', '0,25', '0,24', '0,249', '1000', '0,0', '00,3', '1 000', '½', '３', '0,3 Ω', 'ca. 0,2'];
  let abw = TEXTE.filter((t) => !Object.is(WEB.parseMeasure(t), APP.parseMeasure(t)));
  check(`parseMeasure: ${TEXTE.length} Eingaben wie in der App gelesen`, abw.length === 0, abw);
  check('… Stichprobe: „1.234,5“ = 1234,5 · „1.500“ = 1,5 · „> 300“ = 300 · „1.000.000“ unlesbar',
    WEB.parseMeasure('1.234,5') === 1234.5 && WEB.parseMeasure('1.500') === 1.5 && WEB.parseMeasure('> 300') === 300 && WEB.parseMeasure('1.000.000') === null);

  // --- Grenzwert Schutzleiterwiderstand je Leitungslänge
  const LAENGEN = [undefined, '', '0', '3', '5', '5,01', '6', '12,5', '12,51', '20', '20,01', '27,5', '35', '42,5', '50', '57,5', '57,6', '100', '1000', 'abc'];
  abw = LAENGEN.filter((l) => WEB.schutzleiterLimit(l) !== APP.schutzleiterLimit(l));
  check(`schutzleiterLimit: ${LAENGEN.length} Leitungslängen wie in der App`, abw.length === 0, abw);
  check('… Stichprobe: bis 5 m 0,3 Ω · 12,5 m 0,4 Ω · 20 m 0,5 Ω · sehr lang höchstens 1 Ω',
    WEB.schutzleiterLimit('5') === 0.3 && WEB.schutzleiterLimit('12,5') === 0.4 && WEB.schutzleiterLimit('20') === 0.5 && WEB.schutzleiterLimit('1000') === 1);

  // --- Bewertung jedes Messwerts: alle Felder × alle Schutzklassen × alle Texte × mehrere Leitungslängen
  const SK = ['I', 'II', 'III', null];
  const KEYS = [...WEB.MEASUREMENTS.map((m) => m.key), 'unbekannt'];
  let n = 0;
  abw = [];
  for (const key of KEYS) for (const sk of SK) for (const t of TEXTE) for (const len of [undefined, '3', '12', '30', '80']) {
    n++;
    const all = len === undefined ? undefined : { leitungslaenge: len };
    const a = WEB.evaluateMeasurement(key, t, sk, all);
    const b = APP.evaluateMeasurement(key, t, sk, all);
    if (a !== b && abw.length < 5) abw.push({ key, sk, t, len, web: a, app: b });
  }
  check(`evaluateMeasurement: ${n} Kombinationen (Feld × Schutzklasse × Wert × Leitungslänge) wie in der App`, abw.length === 0, abw);
  const ev = (key, v, sk, all) => WEB.evaluateMeasurement(key, v, sk, all);
  check('… Grenzwerte SK I: Schutzleiter ≤ 0,3 Ω · Isolation ≥ 1,0 MΩ · Ableitstrom ≤ 3,5 mA',
    ev('schutzleiterwiderstand', '0,3', 'I') === 'ok' && ev('schutzleiterwiderstand', '0,31', 'I') === 'fail' && ev('isolationswiderstand', '1', 'I') === 'ok' &&
      ev('isolationswiderstand', '0,99', 'I') === 'fail' && ev('ableitstrom', '3,5', 'I') === 'ok' && ev('ableitstrom', '3,51', 'I') === 'fail');
  check('… Grenzwerte SK II: Isolation ≥ 2,0 MΩ · Berührstrom ≤ 0,5 mA · Schutzleiter nicht erforderlich',
    ev('isolationswiderstand', '2,0', 'II') === 'ok' && ev('isolationswiderstand', '1,99', 'II') === 'fail' && ev('ableitstrom', '0,5', 'II') === 'ok' &&
      ev('ableitstrom', '0,51', 'II') === 'fail' && ev('schutzleiterwiderstand', '5', 'II') === 'na');
  check('… Grenzwerte SK III: Isolation ≥ 0,25 MΩ · Ableitstrom und Schutzleiter nicht erforderlich',
    ev('isolationswiderstand', '0,25', 'III') === 'ok' && ev('isolationswiderstand', '0,24', 'III') === 'fail' && ev('ableitstrom', '9', 'III') === 'na' && ev('schutzleiterwiderstand', '9', 'III') === 'na');
  check('… ohne Schutzklasse nie „in Ordnung“: guter Wert bleibt unbewertet, grober Verstoß bleibt rot',
    ev('isolationswiderstand', '1,5', null) === 'none' && ev('isolationswiderstand', '0,5', null) === 'fail' && ev('ableitstrom', '1', null) === 'none' &&
      ev('ableitstrom', '4', null) === 'fail' && ev('schutzleiterwiderstand', '9', null) === 'none');
  check('… lange Leitung hebt den Grenzwert: 0,45 Ω bei 20 m in Ordnung, bei 3 m nicht',
    ev('schutzleiterwiderstand', '0,45', 'I', { leitungslaenge: '20' }) === 'ok' && ev('schutzleiterwiderstand', '0,45', 'I', { leitungslaenge: '3' }) === 'fail');

  // --- Ganze Prüfungen
  const MESSUNGEN = [{}, { isolationswiderstand: '0,5' }, { isolationswiderstand: '2,5' }, { schutzleiterwiderstand: '0,5' }, { schutzleiterwiderstand: '0,5', leitungslaenge: '25' },
    { ableitstrom: '1' }, { ableitstrom: '4' }, { leitungslaenge: '10' }, { isolationswiderstand: 'abc' }, { isolationswiderstand: '', ableitstrom: ' ' },
    { schutzleiterwiderstand: '0,2', isolationswiderstand: '> 300', ableitstrom: '0,1' }, { schutzleiterwiderstand: '0,2', isolationswiderstand: '1,5', ableitstrom: '0,6' }];
  abw = [];
  for (const m of MESSUNGEN) {
    if (WEB.hasAnyMeasurement(m) !== APP.hasAnyMeasurement(m)) abw.push({ hasAny: m });
    for (const sk of SK) if (WEB.anyMeasurementFail(m, sk) !== APP.anyMeasurementFail(m, sk)) abw.push({ m, sk });
  }
  check(`anyMeasurementFail / hasAnyMeasurement: ${MESSUNGEN.length} Messreihen × 4 Schutzklassen wie in der App`, abw.length === 0, abw.slice(0, 5));
  check('… die Leitungslänge allein zählt nicht als Messwert', WEB.hasAnyMeasurement({ leitungslaenge: '10' }) === false && WEB.hasAnyMeasurement({ ableitstrom: '0,1' }) === true);

  // --- Fristen und Datum
  const TAGE = ['2026-08-31', '2024-02-29', '2026-11-19', '2026-01-31', '2026-12-31', '2026-03-30'];
  abw = [];
  for (const t of TAGE) for (const mon of [1, 6, 12, 24, 48]) if (WEB.addMonthsISO(t, mon) !== APP.addMonthsISO(t, mon)) abw.push({ t, mon });
  check('addMonthsISO wie in der App (31.08. + 6 = 28.02., 29.02. + 12 = 28.02.)', abw.length === 0 && WEB.addMonthsISO('2026-08-31', 6) === '2027-02-28' && WEB.addMonthsISO('2024-02-29', 12) === '2025-02-28', abw);
  const FAELLIG = [null, undefined, '', HEUTE, WEB.addMonthsISO(HEUTE, 1), WEB.addMonthsISO(HEUTE, -1), WEB.addMonthsISO(HEUTE, 12), '2020-01-01', '2099-12-31',
    ...[-400, -2, -1, 1, 2, 29, 30, 31, 32, 200].map((d) => { const x = new Date(); x.setDate(x.getDate() + d); return tag(x); })];
  abw = FAELLIG.filter((f) => WEB.dueStatus(f) !== APP.dueStatus(f) || WEB.dueLabel(f) !== APP.dueLabel(f) || WEB.daysUntilDue(f) !== APP.daysUntilDue(f));
  check(`dueStatus / dueLabel / daysUntilDue: ${FAELLIG.length} Fälligkeiten wie in der App (gleiche Ampel, gleicher Satz)`, abw.length === 0, abw);
  check('… todayISO und formatDE wie in der App', WEB.todayISO() === APP.todayISO() && WEB.formatDE('2026-11-19') === APP.formatDE('2026-11-19') && WEB.formatDE(null) === APP.formatDE(null));

  // --- Regeln aus dem Prüf-Bildschirm der App (dort keine eigene Funktion → am Quelltext festgemacht)
  const screen = liesApp('screens/InspectionScreen.tsx');
  const fnText = screen.match(/function notNeeded\(key: string, sk: ProtectionClass \| null\): boolean \{\n([\s\S]*?)\n\}/)?.[1];
  const notNeededApp = fnText ? new Function('key', 'sk', fnText) : null;
  abw = [];
  if (notNeededApp) for (const key of KEYS) for (const sk of SK) if (WEB.notNeeded(key, sk) !== notNeededApp(key, sk)) abw.push({ key, sk });
  check('notNeeded (welche Messung je Schutzklasse eingeklappt ist): Funktion der App ausgeführt und verglichen', !!notNeededApp && abw.length === 0, abw);
  check('… und deckt sich mit der Bewertung „nicht erforderlich“',
    KEYS.every((key) => ['I', 'II', 'III'].every((sk) => key === 'leitungslaenge' || WEB.notNeeded(key, sk) === (ev(key, '1', sk) === 'na'))));

  check('Ergebnis-Regel steht so in der App (Mangel → nicht bestanden; eigenes „bestanden“ wird durch einen neuen Mangel aufgehoben)',
    screen.includes(`const anyVisualFail = Object.values(visual).some((v) => !v);`) && screen.includes(`const anyFail = anyVisualFail || anyMeasFail;`) &&
      screen.includes(`    if (anyFail) {\n      if (userChoice.current === 'passed') userChoice.current = null;\n      setResult('failed');\n    } else setResult(userChoice.current ?? 'passed');`));
  // derselbe Ablauf, in beiden Fassungen durchgespielt: [anyFail, eigene Wahl davor]
  const appRegel = (anyFail, choice) => (anyFail ? { result: 'failed', userChoice: choice === 'passed' ? null : choice } : { result: choice ?? 'passed', userChoice: choice });
  abw = [];
  for (const anyFail of [true, false]) for (const c of [null, 'passed', 'failed']) if (!gleich(WEB.followResult(anyFail, c), appRegel(anyFail, c))) abw.push({ anyFail, c });
  check('… und so rechnet der Browser (followResult, alle 6 Fälle)', abw.length === 0, abw);
  let st = WEB.followResult(false, null);
  const schritte = [st.result];
  st = WEB.followResult(true, st.userChoice); schritte.push(st.result); // Mangel
  st = { result: 'passed', userChoice: 'passed' }; schritte.push(st.result); // Prüfer wählt bewusst „bestanden“
  st = WEB.followResult(false, st.userChoice); schritte.push(st.result); // Mangel weg
  st = WEB.followResult(true, st.userChoice); schritte.push(st.result + (st.userChoice === null ? '!' : '')); // neuer Mangel hebt die Wahl auf
  st = WEB.followResult(false, 'failed'); schritte.push(st.result); // eigene Wahl „nicht bestanden“ bleibt
  check('… Ablauf: bestanden → Mangel → bewusst bestanden → neuer Mangel hebt es auf → eigenes „nicht bestanden“ bleibt', gleich(schritte, ['passed', 'failed', 'passed', 'passed', 'failed!', 'failed']), schritte);
  check('Sichtprüfung: ein Punkt „nicht in Ordnung“ genügt', WEB.anyVisualFail({ a: true, b: false }) === true && WEB.anyVisualFail({ a: true }) === false && WEB.anyVisualFail({}) === false);

  check('Nächste Fälligkeit steht so in der App (bestanden: Prüfdatum + Intervall, sonst sofort)',
    screen.includes(`nextDueDate: result === 'passed' ? addMonthsISO(inspectedAt, device.intervalMonths) : inspectedAt,`) &&
      WEB.nextDueDate('passed', '2026-08-31', 6) === '2027-02-28' && WEB.nextDueDate('failed', '2026-08-31', 6) === '2026-08-31');
  check('Rückfragen vor dem Speichern stehen so in der App („Bestanden“ trotz Mangel; „Bestanden“ ohne Messwert außer bei SK III)',
    screen.includes(`if (result === 'passed' && anyFail) {`) && screen.includes(`      result === 'passed' &&\n      sk !== 'III' &&\n      !hasAnyMeasurement(meas) &&`));
  const webForm = liesWeb('src/pruefdex/vorOrt/Pruefen.tsx');
  check('… und genauso im Browser-Formular',
    webForm.includes(`if (form.result === 'passed' && anyFail && !confirmedPassedRef.current) return setAsk('passed-anyway');`) &&
      webForm.includes(`if (form.result === 'passed' && sk !== 'III' && !hasAnyMeasurement(form.measurements) && !confirmedNoMeasureRef.current) return setAsk('no-measure');`));
  check('Texte der Bewertung wie in der App („✓ im Grenzwert“ / „✗ Grenzwert nicht eingehalten“ / „für diese Schutzklasse nicht erforderlich“)',
    ['✓ im Grenzwert', '✗ Grenzwert nicht eingehalten', 'für diese Schutzklasse nicht erforderlich'].every((t) => screen.includes(`text: '${t}'`) && webForm.includes(`text: '${t}'`)));

  // --- Prüfer + Qualifikation
  const qText = liesApp('lib/qualification.ts').match(/export function inspectorWithQualification\(name: string, qualification: string\): string \{\n([\s\S]*?)\n\}/)?.[1];
  const qApp = qText ? new Function('name', 'qualification', qText) : null;
  const NAMEN = [['Max Huber', 'Elektrofachkraft'], [' Max ', ' EFK '], ['Max', ''], ['', 'EFK'], ['', ''], ['Max (EFK)', 'EFK'], ['Max (EFK)', 'EuP']];
  abw = qApp ? NAMEN.filter(([a, b]) => inspectorWithQualification(a, b) !== qApp(a, b)) : NAMEN;
  check('„Name (Qualifikation)“: Funktion der App ausgeführt und verglichen (hängt nie doppelt an)', !!qApp && abw.length === 0 && inspectorWithQualification('Max (EFK)', 'EFK') === 'Max (EFK)', abw);

  // --- Gratis-Grenzen
  const frei = liesApp('lib/entitlement.ts').match(/FREE_LIMITS = \{ devices: (\d+), inspections: (\d+) \}/);
  check('Gratis-Grenze wie in der App: 3 Geräte, 5 Prüfungen', !!frei && FREE_LIMITS.devices === Number(frei[1]) && FREE_LIMITS.inspections === Number(frei[2]) && FREE_LIMITS.devices === 3 && FREE_LIMITS.inspections === 5, frei?.slice(1));
  check('… gezählt < Grenze ist frei, ab der Grenze nur mit Pro (wie gate() in der App: allowed = count < limit)',
    liesApp('lib/entitlement.ts').includes('return { allowed: count < limit, pro, count, limit };') && withinFree('inspections', 4) && !withinFree('inspections', 5) && withinFree('devices', 2) && !withinFree('devices', 3));

  // --- Spalten der Zeile
  const repo = liesApp('data/supabaseRepository.ts');
  const block = repo.slice(repo.indexOf('async addInspection(inspection: Inspection)')).match(/const row = \{\n([\s\S]*?)\n    \};/)?.[1] ?? '';
  const appSpalten = [...new Set([...block.matchAll(/(?:^|\{ )\s*([a-z_]+): /gm)].map((m) => m[1]))].sort();
  const voll = buildInspectionRow({ id: I1, orgId: ORG, deviceId: G1, intervalMonths: 12, inspectedAt: HEUTE, at: '2026-11-19T08:12:41.000Z', inspectorName: ' Max Huber ', qualification: 'Elektrofachkraft',
    signature: SIG, visual: { leitung: false }, measurements: { schutzleiterwiderstand: '0,12', isolationswiderstand: '> 300' }, result: 'passed', notes: 'ok', start: START, end: ENDE });
  const webSpalten = [...Object.keys(voll), 'photo_urls'].sort();
  check(`Zeile hat dieselben ${appSpalten.length} Spalten wie addInspection der App (mit Unterschrift und GPS-Stempel)`, appSpalten.length === 23 && gleich(webSpalten, appSpalten), { web: webSpalten, app: appSpalten });
  const schmal = buildInspectionRow({ id: I2, orgId: ORG, deviceId: G1, intervalMonths: 12, inspectedAt: HEUTE, at: '2026-11-19T09:00:00.000Z', inspectorName: '', qualification: 'EFK',
    signature: '', visual: {}, measurements: {}, result: 'failed', notes: '', start: null, end: null });
  check('Ohne Unterschrift und ohne GPS fehlen diese Spalten ganz (wie in der App), Rest bleibt',
    !('signature' in schmal) && GPS_PROOF_KEYS.every((k) => !(k in schmal)) && Object.keys(schmal).length === 11 && schmal.inspector_name === '' && schmal.notes === '', Object.keys(schmal));
  check('Sichtprüfung in der Zeile: genau die 9 Punkte, jeder true/false (Vorbelegung in Ordnung)',
    Object.keys(voll.visual_checks).length === 9 && voll.visual_checks.leitung === false && voll.visual_checks.gehaeuse === true && Object.values(schmal.visual_checks).every((v) => v === true));
  check('Messwerte bleiben Text wie eingegeben; Prüfer mit Qualifikation; Frist bestanden +12 Monate, nicht bestanden sofort',
    voll.measurements.isolationswiderstand === '> 300' && voll.inspector_name === 'Max Huber (Elektrofachkraft)' && voll.next_due_date === WEB.addMonthsISO(HEUTE, 12) && schmal.next_due_date === HEUTE);
  check('GPS-Stempel: Beginn und Ende, Fake-GPS-Spalten leer (der Browser meldet keines)',
    voll.lat === START.lat && voll.gps_accuracy_m === 6.5 && voll.gps_at === START.at && voll.end_lng === ENDE.lng && voll.end_gps_at === ENDE.at && voll.gps_mocked === null && voll.end_mocked === null);
  check('Die Frist am Gerät setzt der Browser NICHT selbst (wie die App seit 10.11.: das macht der Server-Trigger)',
    !/from\('device'\)\s*\.update/.test(liesWeb('src/pruefdex/vorOrt/backend.ts')) && repo.includes('KEIN zusätzliches Setzen der Frist von hier'));
  return { voll, schmal };
}

// ================================================================ 1) Echtes Schema
const test = lies('tests/verwalter.test.mjs');
const BASIS = test.match(/const BASIS = `([\s\S]*?)`;/)?.[1];
const AUFBAU = [...(test.match(/const AUFBAU = \[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (!BASIS || AUFBAU.length === 0) throw new Error('BASIS/AUFBAU in PruefDex/supabase/tests/verwalter.test.mjs nicht gefunden');

async function aufbau(nachtraege = []) {
  const db = new PGlite();
  await db.exec(BASIS);
  for (const f of [...AUFBAU, ...nachtraege]) {
    try {
      await db.exec(ohneErweiterungen(lies(f)).replace('__RC_PUBLIC_KEY__', KEY));
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
      return { code: e.code, message: String(e.message), detail: String(e.detail ?? '') };
    }
  };
  await db.exec(`
    insert into auth.users (id, email) values ('${U}', 'chef@example.com'), ('${W}', 'pruefer@example.com'), ('${X}', 'fremd@example.com');
    insert into public.org (id, name) values ('${ORG}', 'Testbetrieb'), ('${ORG2}', 'Fremder Betrieb');
    insert into public.membership (org_id, user_id, role) values ('${ORG}', '${U}', 'owner'), ('${ORG}', '${W}', 'inspector'), ('${ORG2}', '${X}', 'owner');
    insert into public.customer (id, org_id, name) values ('${KUNDE}', '${ORG}', 'Tischlerei Huber');
    insert into public.device (id, org_id, customer_id, qr_code, name, protection_class, interval_months, next_due_date) values
      ('${G1}', '${ORG}', '${KUNDE}', 'PD-0001', 'Kabeltrommel', 'I', 12, '2026-01-01'),
      ('${G2}', '${ORG}', null, 'PD-0002', 'Bohrhammer', 'II', 6, null),
      ('${GX}', '${ORG2}', null, 'PD-0001', 'Fremdes Gerät', 'I', 12, null);
  `);
  return { db, als, versuch };
}

async function pruefe({ voll, schmal }, nachtraege = []) {
  const t = await aufbau(nachtraege);
  const q = async (sql, p) => (await t.db.query(sql, p)).rows;
  let r;

  // ---------------------------------------------------------------- 1) Prüfung des Prüfers (Team-Mitglied) wird angenommen
  const foto = STORAGE_PREFIX + photoPath(ORG, I1, 1);
  r = await t.versuch(W, 'public.inspection', { ...voll, photo_urls: [foto, STORAGE_PREFIX + photoPath(ORG, I1, 2)] });
  check('Prüfung des Prüfers mit Unterschrift, GPS-Stempel und 2 Fotos wird angenommen', r === null, r);
  let row = (await q(`select * from public.inspection where id = $1`, [I1]))[0];
  check('Gespeichert wie gesendet: Gerät, Prüfdatum heute, Ergebnis, Sichtprüfung, Messwerte, Prüfer, Bemerkung',
    row?.device_id === G1 && tag(row.inspected_at) === HEUTE && row.result === 'passed' && row.visual_checks?.leitung === false && Object.keys(row.visual_checks).length === 9 &&
      row.measurements?.isolationswiderstand === '> 300' && row.inspector_name === 'Max Huber (Elektrofachkraft)' && row.notes === 'ok', row);
  check('Unterschrift (PNG-Daten-URI) und Foto-Pfade <org>/inspection/<id>/<n>.jpg gespeichert',
    row?.signature === SIG && row.photo_urls?.length === 2 && row.photo_urls[0] === `storage:${ORG}/inspection/${I1}/1.jpg`, row?.photo_urls);
  check('GPS-Stempel Beginn und Ende gespeichert', row?.lat === START.lat && row.lng === START.lng && row.gps_accuracy_m === 6.5 && row.end_lat === ENDE.lat && row.end_accuracy_m === 4 && row.gps_mocked === null, row);
  check('Server ergänzt: wer geprüft hat (angemeldeter Nutzer), Eingang und Prüfcode', row?.performed_by === W && row.received_at instanceof Date && istHash(row.entry_hash), [row?.performed_by, row?.entry_hash]);
  r = (await t.als(W, () => t.db.query(`select ok from public.verify_inspection($1)`, [I1]))).rows[0];
  check('Prüfcode passt zum Inhalt (verify_inspection)', r?.ok === true, r);
  r = (await q(`select next_due_date from public.device where id = $1`, [G1]))[0];
  check('Server schreibt die Frist am Gerät fort: heute + 12 Monate', tag(r?.next_due_date) === WEB.addMonthsISO(HEUTE, 12), tag(r?.next_due_date));

  // ---------------------------------------------------------------- 2) Wiederholung, schmale Zeile, Nachprüfung
  r = await t.versuch(W, 'public.inspection', { ...voll, photo_urls: [foto] });
  check('Wiederholter Versuch mit derselben ID: „gibt es schon“ (23505 am Primärschlüssel) — der Browser wertet das als gespeichert',
    r?.code === '23505' && (/_pkey\b/.test(r.message) || /^Key \(id\)=/.test(r.detail)), r);
  check('… und es bleibt bei EINER Prüfung', (await q(`select count(*)::int as n from public.inspection where device_id = $1`, [G1]))[0].n === 1);
  r = await t.versuch(U, 'public.inspection', { ...schmal, id: I2, device_id: G2, photo_urls: [] });
  check('Prüfung ohne Unterschrift, ohne GPS, ohne Fotos, ohne Prüfername (Inhaber, nicht bestanden) wird angenommen', r === null, r);
  row = (await q(`select i.result, i.lat, i.signature, i.inspector_name, i.notes, i.photo_urls, d.next_due_date from public.inspection i join public.device d on d.id = i.device_id where i.id = $1`, [I2]))[0];
  check('… gespeichert ohne Ort und Unterschrift; Gerät sofort wieder fällig (Nachprüfung)', row?.result === 'failed' && row.lat === null && row.signature === null && row.inspector_name === '' && row.photo_urls?.length === 0 && tag(row.next_due_date) === HEUTE, row);
  const nach = buildInspectionRow({ id: I3, orgId: ORG, deviceId: G2, intervalMonths: 6, inspectedAt: HEUTE, at: new Date(Date.now() + 60000).toISOString(), inspectorName: 'Max', qualification: '', signature: '',
    visual: {}, measurements: { isolationswiderstand: '2,5', ableitstrom: '0,1' }, result: 'passed', notes: '', start: START, end: null });
  r = await t.versuch(W, 'public.inspection', { ...nach, photo_urls: [] });
  row = (await q(`select next_due_date from public.device where id = $1`, [G2]))[0];
  check('Nachprüfung am selben Tag (bestanden, nur Beginn-Stempel): die spätere Prüfung setzt die Frist auf heute + 6 Monate', r === null && tag(row?.next_due_date) === WEB.addMonthsISO(HEUTE, 6), [r, tag(row?.next_due_date)]);

  // ---------------------------------------------------------------- 3) Fremder Betrieb wird abgelehnt
  r = await t.versuch(X, 'public.inspection', { ...voll, id: I4, photo_urls: [] });
  check('Fremder Nutzer kann keine Prüfung in diesen Betrieb schreiben (RLS)', r?.code === '42501', r);
  r = await t.versuch(W, 'public.inspection', { ...voll, id: I4, org_id: ORG2, device_id: GX, photo_urls: [] });
  check('Prüfer kann keine Prüfung in einen fremden Betrieb schreiben (RLS)', r?.code === '42501', r);
  check('… nichts davon gespeichert', (await q(`select count(*)::int as n from public.inspection where id = $1`, [I4]))[0].n === 0);
  r = await t.als(X, () => t.db.query(`select count(*)::int as n from public.inspection`));
  check('Fremder Nutzer sieht keine Prüfung dieses Betriebs', r.rows[0].n === 0, r.rows[0]);
  r = await t.versuch(null, 'public.inspection', { ...voll, id: I5, photo_urls: [] }).catch((e) => ({ code: 'x', message: String(e) }));
  check('Ohne Anmeldung wird nichts angenommen', r !== null, r);

  // ---------------------------------------------------------------- 4) Unveränderlich
  const geaendert = await t.als(W, async () => (await t.db.query(`update public.inspection set result = 'failed' where id = '${I1}'`)).affectedRows).catch(() => 0);
  check('Gespeicherte Prüfung lässt sich vom App-Konto nicht ändern', geaendert === 0 && (await q(`select result from public.inspection where id = $1`, [I1]))[0].result === 'passed', String(geaendert));
  let meldung = '';
  try {
    await t.db.query(`update public.inspection set notes = 'x' where id = '${I1}'`);
  } catch (e) {
    meldung = String(e.message);
  }
  check('… und auch intern nicht (Schutz-Trigger: append-only)', /append-only/.test(meldung), meldung);
  const geloescht = await t.als(W, async () => (await t.db.query(`delete from public.inspection where id = '${I1}'`)).affectedRows).catch(() => 0);
  check('… und nicht löschen', geloescht === 0, String(geloescht));

  // ---------------------------------------------------------------- 5) Foto-Speicher: Zugriffsregeln (nachgebaute Tabelle storage.objects)
  const fotoRegel = (uid, name) => t.versuch(uid, 'storage.objects', { bucket_id: 'photos', name });
  check('Foto-Pfad der Prüfung (<org>/inspection/<id>/1.jpg) darf der Prüfer anlegen', (await fotoRegel(W, photoPath(ORG, I1, 1))) === null);
  r = await fotoRegel(W, photoPath(ORG2, I1, 1));
  check('… in den Ordner eines fremden Betriebs nicht', r?.code === '42501', r);
  r = await fotoRegel(X, photoPath(ORG, I1, 3));
  check('… und ein Fremder nicht in diesen', r?.code === '42501', r);

  // ---------------------------------------------------------------- 6) Was die Listen lesen und die Gratis-Grenze zählt (als Prüfer)
  const devCols = liesWeb('src/pruefdex/api.ts').match(/const DEVICE_COLS_BASE =\n\s+'([^']+)'/)?.[1];
  r = devCols ? (await t.als(W, () => t.db.query(`select ${devCols}, retired, retired_at from public.device order by name`))).rows : [];
  check('Geräte-Liste mit den Spalten des Dashboards lesbar (nur der eigene Betrieb, mit Frist)', r.length === 2 && r.every((d) => d.org_id === ORG) && r.some((d) => d.protection_class === 'II'), r.map((d) => d.name));
  r = (await t.als(W, () => t.db.query(`select (select count(*)::int from public.inspection) as pruefungen, (select count(*)::int from public.device where retired = false) as geraete`))).rows[0];
  check('Zählung für die Gratis-Grenze klappt (3 Prüfungen < 5 frei; 2 Geräte < 3 frei)', r?.pruefungen === 3 && r.geraete === 2 && withinFree('inspections', r.pruefungen) && withinFree('devices', r.geraete), r);
  await t.als(U, () => t.db.query(`select public.cancel_inspection($1, $2)`, [I3, 'Testweise storniert']));
  r = (await t.als(W, () => t.db.query(`select count(*)::int as n, count(*) filter (where canceled)::int as storniert from public.inspection`))).rows[0];
  check('Stornierte Prüfungen zählen für die Grenze weiter mit (wie in der App)', r?.n === 3 && r.storniert === 1, r);
  r = (await t.als(W, () => t.db.query(`select public.org_pro_active() as pro`))).rows[0];
  check('org_pro_active() antwortet ohne Abo nicht „Pro“ (false oder unbekannt) — bei „unbekannt“ sperrt der Browser nicht', r?.pro !== true, r);
  await t.db.close?.();
}

const zeilen = await gegenApp();
console.log(`\n=== PrüfDex — echtes Schema aus ${path.join(REPO, 'supabase')} (Stand der SQL-Tests der App)`);
await pruefe(zeilen);
console.log('--- PrüfDex: mit den Nachträgen Verwalter (13.11.) und Team-Code (14.11.)');
marke = '[Nachträge] ';
await pruefe(zeilen, ['NACHTRAG-VERWALTER-2026-11-13.sql', 'NACHTRAG-TEAMCODE-2026-11-14.sql']);
rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
