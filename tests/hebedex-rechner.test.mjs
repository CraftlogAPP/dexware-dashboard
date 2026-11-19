// Sichert den Ablegereife-Rechner von „Vor Ort“ (src/hebedex/rechner.ts) gegen die HebeDex-App ab: Dieselben
// Eingaben müssen in beiden dasselbe Ergebnis liefern (Rot/Grün, Text, „fehlt“-Hinweis, Prozentwerte). Verglichen
// wird direkt mit dem Code der App (HebeDex/mobile/src/types.ts) — dazu feste Beispielwerte aus den Beispieldaten
// der App (supabase/seed-demo.sql) und die Grenzfälle genau an der Grenze.
//
//   Aufruf:  node tests/hebedex-rechner.test.mjs
//   Braucht: das App-Repo (Standard: ../HebeDex auf dem Desktop, sonst Umgebungsvariable HEBEDEX_REPO).
//   Node ab 22.18 (liest die .ts-Dateien direkt).
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.HEBEDEX_REPO ?? 'C:/Users/2easy/Desktop/HebeDex';
const APP = await import(pathToFileURL(path.join(REPO, 'mobile/src/types.ts')).href);
const WEB = await import(pathToFileURL(path.join(here, '../src/hebedex/rechner.ts')).href);
const TYPES = await import(pathToFileURL(path.join(here, '../src/hebedex/types.ts')).href);
const VORORT = await import(pathToFileURL(path.join(here, '../src/hebedex/vorOrt.ts')).href);

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`);
};
// undefined-Felder zählen nicht (JSON lässt sie weg)
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log(`\n=== HebeDex-Rechner — Browser (src/hebedex/rechner.ts) gegen App (${path.join(REPO, 'mobile/src/types.ts')})`);

// ---------------------------------------------------------------- Grenzwerte und Tabellen
check('Grenzwerte gleich: Glieddicke −10 %, Längung 5 %, Maulaufweitung 10 %',
  WEB.CHAIN_WEAR_LIMIT_PCT === APP.CHAIN_WEAR_LIMIT_PCT && WEB.CHAIN_ELONG_LIMIT_PCT === APP.CHAIN_ELONG_LIMIT_PCT && WEB.HOOK_OPENING_LIMIT_PCT === APP.HOOK_OPENING_LIMIT_PCT &&
    WEB.CHAIN_WEAR_LIMIT_PCT === 10 && WEB.CHAIN_ELONG_LIMIT_PCT === 5 && WEB.HOOK_OPENING_LIMIT_PCT === 10);
check('Drahtbruch-Tabelle gleich (DGUV Regel 109-017, Tabellen 1 und 2): Litzenseil –/6/14, Kabelschlagseil 10/15/40', gleich(WEB.WIRE_LIMITS, APP.WIRE_LIMITS) && gleich(WEB.WIRE_LIMITS, { strand: [null, 6, 14], cable: [10, 15, 40] }) && gleich(WEB.ROPE_KIND_LABELS, APP.ROPE_KIND_LABELS));
check('Grenzen als Satz wortgleich zur App (wireLimitText), Litzenseil nennt die 3 benachbarten Drahtbrüche', WEB.wireLimitText('strand') === APP.wireLimitText('strand') && WEB.wireLimitText('cable') === APP.wireLimitText('cable') && WEB.wireLimitText('strand').includes('6 Brüchen auf 6d oder 14 Brüchen auf 30d') && WEB.wireLimitText('strand').includes('3 benachbarten Drahtbrüchen in einer Litze') && WEB.wireLimitText('cable').includes('10 / 15 / 40'));

// ---------------------------------------------------------------- Feste Beispiele (Beispieldaten der App + Grenzfälle)
const kette = (m, nominal = null) => WEB.rechne('chain', { nominal_mm: nominal }, m);
let r = kette({ nominal: '10', d1: '9.7', d2: '9.8', pitchNew: '30', pitchMeasured: '30.4' });
check('Beispiel der App (K-001): d 10, d1 9,7, d2 9,8, Teilung 30 → 30,4 = „Glieddicke −2,5 % · Längung 1,3 %“, grün', r.red === false && r.complete && r.text === 'Glieddicke −2,5 % · Längung 1,3 %', r);
r = kette({ nominal: '10', d1: '9', d2: '9' });
check('Kette genau an der Grenze: Glieddicke −10 % → rot', r.red === true && r.text === 'Glieddicke −10 %', r);
r = kette({ nominal: '10', d1: '9,1', d2: '9,1' });
check('Kette knapp darunter (−9 %, Komma-Eingabe) → grün', r.red === false && r.text === 'Glieddicke −9,0 %', r);
r = kette({ nominal: '10', pitchMeasured: '31.5' });
check('Längung genau 5 % (Normteilung 3 × d = 30) → rot', r.red === true && r.text === 'Längung 5,0 %', r);
r = kette({ d1: '9' }, '10');
check('Nenndicke aus den Stammdaten, wenn im Formular nichts steht', r.red === true && r.complete, r);
r = kette({ d1: '9' });
check('Messwert ohne Nenndicke → „Nenndicke d fehlt“, keine Bewertung', r.complete === false && r.missing === 'Nenndicke d' && r.red === false, r);

r = WEB.rechne('hook', {}, { openingNew: '25', openingMeasured: '28' });
check('Beispiel der App (H-001): Maulweite 25 → 28 = „Maulaufweitung 12 %“, rot', r.red === true && r.text === 'Maulaufweitung 12 %', r);
r = WEB.rechne('hook', {}, { openingNew: '25', openingMeasured: '27.5' });
check('Haken genau 10 % → noch grün (Grenze: über 10 %)', r.red === false && r.text === 'Maulaufweitung 10 %', r);
r = WEB.rechne('hook', {}, { openingMeasured: '28' });
check('Maulweite ohne Neumaß → „Maulweite neu fehlt“', r.complete === false && r.missing === 'Maulweite neu', r);

r = WEB.rechne('wire', { rope_kind: 'strand' }, { b3: '3', b6: '6' });
check('Litzenseil: 3 auf 3d (kein Grenzwert), 6 auf 6d (Grenze 6) → rot', r.red === true && r.text === 'Litzenseil: 3 auf 3d (kein Grenzwert), 6 auf 6d (Grenze 6)', r);
r = WEB.rechne('wire', { rope_kind: 'strand' }, { b3: '9', b6: '5', b30: '13' });
check('Litzenseil knapp darunter: 5 auf 6d, 13 auf 30d → grün; die Zahl auf 3d wird nicht bewertet', r.red === false && r.text === 'Litzenseil: 9 auf 3d (kein Grenzwert), 5 auf 6d (Grenze 6), 13 auf 30d (Grenze 14)', r);
r = WEB.rechne('wire', { rope_kind: 'strand' }, { b30: '14' });
check('Litzenseil genau an der Grenze: 14 auf 30d → rot', r.red === true && r.text === 'Litzenseil: 14 auf 30d (Grenze 14)', r);
check('Balken: Litzenseil 3 von 6 auf 6d = halbe Grenze; Wert auf 3d zählt nicht', WEB.anteilAnGrenze('wire', { rope_kind: 'strand' }, { b3: '50', b6: '3' }).ratio === 0.5 && WEB.anteilAnGrenze('wire', { rope_kind: 'cable' }, { b3: '5' }).ratio === 0.5);
r = WEB.rechne('wire', { rope_kind: 'strand' }, { ropeKind: 'cable', b3: '9', b6: '14', b30: '39' });
check('Kabelschlagseil (im Formular gewählt): 9/14/39 → grün', r.red === false && r.text === 'Kabelschlagseil: 9 auf 3d (Grenze 10), 14 auf 6d (Grenze 15), 39 auf 30d (Grenze 40)', r);
r = WEB.rechne('wire', { rope_kind: 'cable' }, { b30: '40' });
check('Seilart aus den Stammdaten (Kabelschlagseil), 40 auf 30d → rot', r.red === true && r.text.startsWith('Kabelschlagseil'), r);
check('Kein Rechner für Hebeband & Co.', WEB.rechne(null, {}, { d1: '9' }) === undefined);

// ---------------------------------------------------------------- Viele Eingaben: Browser = App
const zahlen = ['', '0', '8', '9', '9,05', '9.1', '9.5', '10', '10,5', '12', 'abc'];
let n = 0;
const abweichung = [];
for (const nominal of ['', '10', '13', '8,5'])
  for (const d1 of zahlen)
    for (const d2 of ['', '9', '9,4', '10'])
      for (const [pitchNew, pitchMeasured] of [['', ''], ['', '31'], ['30', '31.5'], ['30', '31,4'], ['', '40'], ['39', '']]) {
        const m = { nominal, d1, d2, pitchNew, pitchMeasured };
        n++;
        if (!gleich(WEB.chainWear(m), APP.chainWear(m))) abweichung.push(m);
      }
check(`Kette: ${n} Eingaben — Ergebnis, Text, Prozentwerte und „fehlt“ gleich der App`, abweichung.length === 0, abweichung.slice(0, 3));

n = 0;
abweichung.length = 0;
for (const ropeKind of [undefined, '', 'strand', 'cable', 'x'])
  for (const b3 of ['', '0', '3', '4', '9', '10', 'x'])
    for (const b6 of ['', '5', '6', '14', '15'])
      for (const b30 of ['', '13', '14', '15', '16', '39', '40', 12]) {
        const m = { ropeKind, b3, b6, b30 };
        n++;
        if (!gleich(WEB.wireRopeBreaks(m), APP.wireRopeBreaks(m))) abweichung.push(m);
      }
check(`Drahtseil: ${n} Eingaben — gleich der App`, abweichung.length === 0, abweichung.slice(0, 3));

n = 0;
abweichung.length = 0;
for (const openingNew of ['', '0', '20', '25', '25,5', 'x'])
  for (const openingMeasured of ['', '20', '25', '27.5', '27,51', '28', '40']) {
    const m = { openingNew, openingMeasured };
    n++;
    if (!gleich(WEB.hookOpening(m), APP.hookOpening(m))) abweichung.push(m);
  }
check(`Haken: ${n} Eingaben — gleich der App`, abweichung.length === 0, abweichung.slice(0, 3));

// Über den Teil-Typ wie in der App (measureResult) — samt Ersatzwerten aus den Stammdaten
n = 0;
abweichung.length = 0;
const beispiele = [
  {},
  { d1: '9', d2: '9' },
  { nominal: '13', d1: '11,5' },
  { pitchMeasured: '31.6' },
  { b3: '4' },
  { ropeKind: 'cable', b3: '4', b30: '41' },
  { openingNew: '25', openingMeasured: '28' },
  { openingMeasured: '28' },
];
for (const k of APP.ITEM_KINDS)
  for (const stamm of [{}, { nominalMm: '10' }, { nominalMm: '12', ropeKind: 'cable' }])
    for (const m of beispiele) {
      n++;
      const app = APP.measureResult({ kind: k.id, ...stamm }, m);
      const web = WEB.rechne(TYPES.kindInfo(k.id).measure, { nominal_mm: stamm.nominalMm, rope_kind: stamm.ropeKind }, m);
      if (!gleich(app, web)) abweichung.push({ kind: k.id, stamm, m, app, web });
    }
check(`Je Teil-Typ (alle ${APP.ITEM_KINDS.length}) mit Stammdaten: ${n} Fälle — gleich measureResult der App`, abweichung.length === 0, abweichung.slice(0, 2));
check('Prozent-Schreibweise gleich (fmtPct)', [0, 0.04, 1.33, 2.5, 9.95, 10, 12, 33.333].every((p) => WEB.fmtPct(p) === APP.fmtPct(p)));

// ---------------------------------------------------------------- Teil-Typen, Checklisten und Texte
check('Teil-Typen gleich: Kennung, Bezeichnung, Rechner-Art, Rissprüfung',
  gleich(TYPES.ITEM_KINDS.map((k) => [k.id, k.label, k.measure, k.crackTest]), APP.ITEM_KINDS.map((k) => [k.id, k.label, k.measure, k.crackTest])));
const cfg = VORORT.HEBEDEX_VOR_ORT;
abweichung.length = 0;
for (const k of APP.ITEM_KINDS) {
  const web = cfg.checklistFor({ kind: k.id });
  if (!gleich(web, APP.checklistFor(k.id))) abweichung.push(k.id);
}
check('Checkliste je Teil-Typ: Punkte, Reihenfolge, Bezeichnung und Prüfhinweis wortgleich zur App', abweichung.length === 0, abweichung);
check('Unbekannter Teil-Typ → Checkliste „Sonstiges“ (wie in der App)', gleich(cfg.checklistFor({ kind: 'gibt-es-nicht' }), APP.checklistFor('gibt-es-nicht')) && cfg.checklistFor({ kind: 'x' }).length === 4);
check('Prüfart- und Ampel-Erklärungen wortgleich zur App', gleich(TYPES.INSPECTION_HINTS, APP.INSPECTION_HINTS) && gleich(TYPES.SEVERITY_HINTS, APP.SEVERITY_HINTS) && gleich(TYPES.SEVERITY_LABELS, APP.SEVERITY_LABELS));
check('Prüfarten in „Vor Ort“ heißen wie in der App, die wiederkehrende Prüfung ist vorbelegt',
  cfg.kinds[0].id === 'expert' && cfg.kinds.every((k) => k.label === APP.INSPECTION_LABELS[k.id] && k.hint === APP.INSPECTION_HINTS[k.id]) && gleich(cfg.kinds.map((k) => k.id), ['expert', 'visual', 'crack']));
check('Rissprüfung nur bei Teil-Typen mit Rissprüfung (Rundstahlkette)',
  APP.ITEM_KINDS.every((k) => cfg.kindsFor({ kind: k.id }).some((x) => x.id === 'crack') === k.crackTest) && gleich(cfg.kindsFor({ kind: 'chain' }).map((k) => k.id), ['expert', 'visual', 'crack']) && gleich(cfg.kindsFor({ kind: 'hook' }).map((k) => k.id), ['expert', 'visual']));

// ---------------------------------------------------------------- Rechner-Karte der Konfiguration (was das Formular zeigt und speichert)
const schirm = readFileSync(path.join(REPO, 'mobile/src/screens/InspectionScreen.tsx'), 'utf8');
const spec = (row) => cfg.measure(row);
check('Rechner je Teil-Typ wie in der App: Kette/Zurrkette, Drahtseil, Haken/Kettenzug — sonst keiner',
  APP.ITEM_KINDS.every((k) => (spec({ kind: k.id }) === null) === (k.measure === null)) && spec({ kind: 'chain' }).checkId === 'chainWear' && spec({ kind: 'lashing_chain' }).checkId === 'chainWear' &&
    spec({ kind: 'wire_rope' }).checkId === 'wireBreaks' && spec({ kind: 'hook' }).checkId === 'opening' && spec({ kind: 'hoist' }).checkId === 'opening');
check('… der Punkt, der bei Rot auf „Mangel“ springt, steht in der Checkliste des Typs', APP.ITEM_KINDS.filter((k) => k.measure).every((k) => cfg.checklistFor({ kind: k.id }).some((c) => c.id === spec({ kind: k.id }).checkId)));
const felder = (row) => spec(row).rows.flat().map((f) => f.key);
check('Felder (= Schlüssel im JSON) wie in der App: nominal/d1/d2/pitchNew/pitchMeasured, b3/b6/b30 (+ropeKind), openingNew/openingMeasured',
  gleich(felder({ kind: 'chain' }), ['nominal', 'd1', 'd2', 'pitchNew', 'pitchMeasured']) && gleich(felder({ kind: 'wire_rope' }), ['b3', 'b6', 'b30']) && spec({ kind: 'wire_rope' }).choice.key === 'ropeKind' &&
    gleich(felder({ kind: 'hook' }), ['openingNew', 'openingMeasured']) && [...felder({ kind: 'chain' }), ...felder({ kind: 'wire_rope' }), 'ropeKind', ...felder({ kind: 'hook' })].every((k) => new RegExp(`measure\\.${k}\\b|'${k}'`).test(schirm)));
check('„Gemessen“-Felder wie in der App (nur dann werden Messwerte gespeichert)',
  gleich(spec({ kind: 'chain' }).measuredKeys, ['d1', 'pitchMeasured', 'b3', 'b6', 'b30', 'openingMeasured']) &&
    schirm.includes('const hasMeasured = !!(filled.d1 || filled.pitchMeasured || filled.b3 || filled.b6 || filled.b30 || filled.openingMeasured);'));
const s = spec({ kind: 'chain', nominal_mm: '10' });
let o = s.evaluate({ nominal: '10', d1: '9', d2: '9' });
check('Rechner-Karte Kette: rot, Text, Balken an der Grenze („10 % von 10 %“)', o.red && o.complete && o.text === 'Glieddicke −10 %' && o.ratio === 1 && o.ratioLabel === '10 % von 10 %', o);
check('Texte wie in der App: Mangel-Titel „Ablegereif: …“, Rückfrage, Knopf',
  s.texts.defectTitle(o.text) === 'Ablegereif: Glieddicke −10 %' && s.texts.redAsk(o.text) === 'Glieddicke −10 %. Das Teil ist ablegereif — als roten Mangel erfassen und sperren?' && s.redSeverity === 'red' &&
    schirm.includes('`Ablegereif: ${result.text}`') && schirm.includes('`${result.text}. Das Teil ist ablegereif — als roten Mangel erfassen und sperren?`') && schirm.includes(s.texts.redAction) && schirm.includes(s.texts.red) && schirm.includes(s.texts.ok));
check('Vorbelegung wie in der App: Nenndicke aus den Stammdaten; nach einer Prüfung deren Neumaße; Seilart beim Drahtseil',
  gleich(s.prefill({}), { nominal: '10' }) && gleich(s.prefill({ nominal: '13', pitchNew: '39', d1: '12' }), { pitchNew: '39', nominal: '13' }) &&
    gleich(spec({ kind: 'wire_rope', rope_kind: 'cable', nominal_mm: '12' }).prefill({}), { nominal: '12', ropeKind: 'cable' }) && gleich(spec({ kind: 'wire_rope' }).prefill({}), { nominal: '', ropeKind: 'strand' }) &&
    gleich(spec({ kind: 'hook' }).prefill({ openingNew: '25', openingMeasured: '28' }), { openingNew: '25', nominal: '' }));
check('Hinweistexte der Rechner nennen die Grenzen der App',
  s.hint({}).includes('−10 % Glieddicke, 5 % Längung') && spec({ kind: 'wire_rope' }).hint({ ropeKind: 'cable' }).includes('Ablegereif ab 10 / 15 / 40 Brüchen') && spec({ kind: 'wire_rope' }).hint({}).includes('ab 6 Brüchen auf 6d oder 14 Brüchen auf 30d') && spec({ kind: 'hook' }).hint({}).includes('über 10 %'));
check('Teilung neu: Platzhalter zeigt die Normteilung 3 × d', s.rows[1][0].placeholder({ nominal: '10' }) === '30' && s.rows[1][0].placeholder({ nominal: '8,5' }) === '25.5' && s.rows[1][0].placeholder({}) === '3 × d');
check('Sperr-Rückfragen wortgleich zur App; bei Rot ist die Sperre gleich gesetzt',
  cfg.severities.filter((x) => x.blockQuestion).every((x) => schirm.includes(x.blockQuestion)) && cfg.severities.find((x) => x.id === 'red').autoBlock === true && !cfg.severities.find((x) => x.id === 'amber').autoBlock &&
    !cfg.severities.find((x) => x.id === 'green').blockQuestion && cfg.defaultSeverity === 'amber');

// ---------------------------------------------------------------- Frist (lib/due.ts der App: DE +12 Monate; AT +15 Monate, spätestens 31.12. des Folgejahres)
const due = readFileSync(path.join(REPO, 'mobile/src/lib/due.ts'), 'utf8');
const tag = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const frist = (iso, land) => tag(cfg.dueDate(new Date(iso), { land }));
check('Frist wie in der App: DE 12 Monate (19.11.2026 → 19.11.2027; 29.02.2024 → 28.02.2025)',
  frist('2026-11-19T10:00:00', 'DE') === '2027-11-19' && frist('2024-02-29T10:00:00', 'DE') === '2025-02-28' && frist('2026-11-19T10:00:00', undefined) === '2027-11-19' && due.includes('return addMonths(last, 12);'));
check('… AT: 15 Monate (10.03.2026 → 10.06.2027), aber spätestens 31.12. des Folgejahres (19.11.2026 → 31.12.2027)',
  frist('2026-03-10T10:00:00', 'AT') === '2027-06-10' && frist('2026-11-19T10:00:00', 'AT') === '2027-12-31' && due.includes('const by15 = addMonths(last, 15);') && due.includes('new Date(last.getFullYear() + 1, 11, 31, 23, 59)'));
const frei = readFileSync(path.join(REPO, 'mobile/src/lib/entitlement.ts'), 'utf8');
check('Gratis-Grenze wie in der App: 3 aktive Teile (ausgesonderte und Beispieldaten zählen nicht)', cfg.freeUnits === 3 && frei.includes('FREE_LIMITS = { items: 3 }') && cfg.cols.demo === 'is_demo' && frei.includes('!l.retired && !l.isDemo'));

console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
