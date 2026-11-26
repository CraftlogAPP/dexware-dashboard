// WinterDex im Dashboard: Quellenzeile je Datensatz (Bauplan „Wetter staatlich“ P8, Regel 1 mit App vc48).
// Ohne Browser und ohne Netz; erfundene Werte, keine Kundendaten.
//   [1] Herkunft aus weather.source (alt, staatlich, Kombination, unbekannt) — src/winterdex/wetterQuelle.ts
//   [2] Alte Datensätze: Seiten, Excel und PDFs Zeichen für Zeichen wie bisher (WEATHER_SOURCE / WEATHER_SOURCE_HTML)
//   [3] Neue Datensätze: Dienst je Datensatz, gemischt alle, nie „Open-Meteo“ für staatliche Werte
//   [4] Karte „Heute Nacht“: quelle_text vom Server geht vor, sonst wie bisher
//   [5] Quelltext-Wächter: keine fest eingebaute Open-Meteo-Zeile mehr auf Seiten/PDFs/Excel
//   [6] Gleich mit der App (mobile/src/lib/wetterQuelle.ts), falls eine WinterDex-Arbeitskopie mit vc48 da ist
//
//   Aufruf:  node tests/wetter-quelle.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
//            WINTERDEX_DIR=<WinterDex-Arbeitskopie> für die Gegenprobe [6]
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

process.env.TZ = 'UTC';
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
globalThis.window = globalThis.window ?? { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
globalThis.localStorage = globalThis.localStorage ?? { getItem: () => null, setItem() {}, removeItem() {} };
const web = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
const lies = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600)}`);
};

const Q = await web('src/winterdex/wetterQuelle.ts');
const L = await web('src/winterdex/labels.ts');
const HN = await web('src/winterdex/heuteNachtDaten.ts');
const WB = await web('src/winterdex/wetterBeleg.ts');
const REP = await web('src/winterdex/report.ts');
const RR = await web('src/winterdex/routeReport.ts');
const XL = await web('src/winterdex/exportLists.ts');

const W = (source, x = {}) => ({ temp_c: -2.2, snowfall_cm: 1.4, ...(source === undefined ? {} : { source }), fetched_at: '2026-11-27T05:40:00Z', ...x });
const GS = 'Datenquelle: GeoSphere Austria – data.hub.geosphere.at (CC BY 4.0)';
const DWD = 'Datenbasis: Deutscher Wetterdienst, eigene Berechnungen (CC BY 4.0)';
const MCH = 'Quelle: MeteoSchweiz (CC BY 4.0)';
const OM = 'Wetterdaten: Open-Meteo.com (CC BY 4.0)';
const NB = 'Ausgewertet von WinterDex; die genannten Stellen sind daran nicht beteiligt.';

console.log('\n[1] Herkunft aus weather.source');
check("'open-meteo' und fehlend/leer (alte Datensätze) → Open-Meteo", ['open-meteo', '', null, undefined].every((s) => JSON.stringify(Q.anbieterAus(s)) === '["open-meteo"]'));
check("staatlich einzeln und als Kombination (feste Reihenfolge, ohne Doppel)", Q.anbieterAus('dwd')[0] === 'dwd' && JSON.stringify(Q.anbieterAus('meteoschweiz+geosphere+geosphere')) === '["geosphere","meteoschweiz"]');
check("unbekannt ('demo') → kein Dienst", Q.anbieterAus('demo').length === 0 && Q.momentQuelleKurz(W('demo')) === null);
check('Vermerke feste Reihenfolge GeoSphere, DWD, MeteoSchweiz, Open-Meteo', JSON.stringify(Q.momentVermerke([W('open-meteo'), W('meteoschweiz'), W('dwd'), W('geosphere')])) === JSON.stringify([GS, DWD, MCH, OM]));

console.log('\n[2] Alte Datensätze wie bisher');
check('quelleFuer: nur alt / ohne Werte / Beispieldaten → genau WEATHER_SOURCE', [[W('open-meteo')], [W(undefined), null], [], [W('demo')], W('open-meteo')].every((x) => L.quelleFuer(x) === L.WEATHER_SOURCE));
check('quelleFuerHtml: nur alt → genau WEATHER_SOURCE_HTML', L.quelleFuerHtml([W('open-meteo'), null]) === L.WEATHER_SOURCE_HTML);
check('momentwert alt: „Modell-Momentwert bei Beginn: −2 °C (Open-Meteo)“ (mit und ohne source)', WB.momentwert(W('open-meteo')) === 'Modell-Momentwert bei Beginn: −2 °C (Open-Meteo)' && WB.momentwert({ temp_c: -2.2 }) === 'Modell-Momentwert bei Beginn: −2 °C (Open-Meteo)');
const orgAT = { id: 'o', name: 'Bauhof Musterstadt', land: 'AT', address: 'Hauptplatz 1', created_at: '2026-11-01T00:00:00Z' };
const prop = { id: 'p1', org_id: 'o', name: 'Rathaus', address: 'Hauptplatz 1', lat: 47.07, lng: 15.44, customer_name: null, customer_contact: null, areas: null, duty_times: {}, notes: null, active: true, created_at: '2026-11-01T00:00:00Z' };
const op = (id, weather) => ({
  id, org_id: 'o', property_id: 'p1', started_at: '2026-11-26T04:50:00Z', ended_at: '2026-11-26T05:20:00Z', lat: 47.07, lng: 15.44, gps_accuracy_m: 8, gps_at: '2026-11-26T04:50:00Z',
  action: 'cleared_gritted', grit_material: 'Splitt', grit_amount: null, weather, notes: null, performed_by: null, performer_name: 'Fahrer 1',
  canceled: false, cancel_reason: null, canceled_at: null, created_at: '2026-11-26T05:21:00Z', entry_hash: 'a'.repeat(64), photo_urls: [],
});
const fussPdf = (h) => (h.match(/<div class="footer">\s*<span>([^]*?)<\/span>/) ?? [])[1] ?? '';
const repAlt = REP.buildReportHtml(orgAT, prop, [op('e1', W('open-meteo')), op('e2', W(undefined))], 'November 2026');
check('Einsatz-Nachweis alt: Fußzeile „Erstellt mit WinterDex — winterdex.dexware.app · WEATHER_SOURCE_HTML“', fussPdf(repAlt) === `Erstellt mit WinterDex — winterdex.dexware.app · ${L.WEATHER_SOURCE_HTML}`, fussPdf(repAlt));
const run = (id, weather) => ({
  id, org_id: 'o', route_id: 'r1', route_name: 'Runde Nord', started_at: '2026-11-26T04:50:00Z', ended_at: '2026-11-26T05:40:00Z', track: [], gaps: [], planned_path: null, missed: [],
  track_length_m: 12000, coverage_pct: null, missed_m: null, action: 'cleared', grit_material: null, grit_amount: null, weather, notes: null, performer_name: 'Fahrer 1',
  canceled: false, cancel_reason: null, canceled_at: null, created_at: '2026-11-26T05:41:00Z', entry_hash: 'b'.repeat(64), photo_urls: [], gps_mocked: false, nachgetragen: false,
});
const route = { id: 'r1', name: 'Runde Nord', path: null, length_m: 12000 };
check('Strecken-Nachweis alt / ohne Wetter: Fußzeile wie bisher bzw. ohne Wetter-Quelle',
  RR.buildRunHtml(orgAT, run('f1', W('open-meteo')), 'Europe/Vienna').includes(`winterdex.dexware.app · ${L.WEATHER_SOURCE_HTML}`) &&
  !/Open-Meteo|GeoSphere/.test(fussPdf(RR.buildRunHtml(orgAT, run('f1', null), 'Europe/Vienna'))));
const xl = (ops) => XL.operationSheets({ org: orgAT, properties: [prop], ops, period: { from: '2026-11-01', to: '2026-11-26' }, propertyId: null, wetter: null });
// Info-Blatt: Zeilen [{ v: 'Wetter', bold: true }, Text]
const zeileWetter = (sheets) => (sheets.find((s) => s.name === 'Info')?.rows ?? []).find((r) => r[0]?.v === 'Wetter')?.[1];
check('Excel alt: Zeile „Wetter“ = WEATHER_SOURCE', zeileWetter(xl([op('e1', W('open-meteo'))])) === L.WEATHER_SOURCE, zeileWetter(xl([op('e1', W('open-meteo'))])));

console.log('\n[3] Neue Datensätze: Dienst je Datensatz');
check('quelleFuer nur staatlich: Vermerk + „nicht beteiligt“, kein Open-Meteo', L.quelleFuer([W('geosphere')]) === `${GS}. ${NB}`);
check('quelleFuer Klammer (zusatz=false) für einen Einzelwert: nur der Vermerk', L.quelleFuer(W('dwd'), false) === DWD);
check('gemischt (alt + neu): alle vorkommenden Vermerke', L.quelleFuer([W('open-meteo'), W('geosphere+meteoschweiz')]) === `${GS} · ${MCH} · ${OM}. ${NB}`);
check('momentwert neu: „Momentwert bei Beginn: −2 °C (GeoSphere Austria)“; unbekannt ohne Klammer', WB.momentwert(W('geosphere')) === 'Momentwert bei Beginn: −2 °C (GeoSphere Austria)' && WB.momentwert(W('demo')) === 'Modell-Momentwert bei Beginn: −2 °C');
const repNeu = REP.buildReportHtml(orgAT, prop, [op('e1', W('open-meteo')), op('e2', W('dwd'))], 'November 2026');
check('Einsatz-Nachweis gemischt: Fußzeile mit DWD-Link und Open-Meteo-Link, „nicht beteiligt“', /href="https:\/\/opendata\.dwd\.de\/">Deutscher Wetterdienst<\/a>, eigene Berechnungen/.test(fussPdf(repNeu)) && /href="https:\/\/open-meteo\.com\/"/.test(fussPdf(repNeu)) && fussPdf(repNeu).includes('nicht beteiligt'), fussPdf(repNeu));
const buch = RR.buildRouteLogHtml(orgAT, route, [run('f1', W('geosphere')), run('f2', W('geosphere'))], 'Europe/Vienna');
check('Fahrtenbuch nur staatlich: GeoSphere-Link, kein Open-Meteo', /href="https:\/\/data\.hub\.geosphere\.at\/"/.test(fussPdf(buch)) && !/Open-Meteo/.test(fussPdf(buch)), fussPdf(buch));
check('Excel neu: Zeile „Wetter“ nennt GeoSphere', zeileWetter(xl([op('e1', W('geosphere'))])) === `${GS}. ${NB}`, zeileWetter(xl([op('e1', W('geosphere'))])));
const runXl = XL.runSheets({ org: orgAT, routes: [route], runs: [run('f1', W('meteoschweiz'))], period: { from: '2026-11-01', to: '2026-11-26' }, routeId: null, wetter: null });
check('Excel Fahrten neu: Zeile „Wetter“ nennt MeteoSchweiz', zeileWetter(runXl) === `${MCH}. ${NB}`, zeileWetter(runXl));
check('Server-Vermerk (quelle_text) wird im HTML escaped', !/<b>/.test(L.quelleFuerHtml([W('x', { quelle_text: '<b>Quelle: X</b>' })])));

console.log('\n[4] Karte „Heute Nacht“');
const basis = { v: 1, karte_live: true, stand_at: '2026-11-25T21:27:00Z', quelle: 'geosphere', gebiet: {}, stunden: [], lage: {}, morgen: {}, je_ort: [] };
const ABEND = Date.parse('2026-11-25T21:32:00Z');
const d0 = HN.heuteNachtLesen(basis);
check('ohne quellen/quelle_text: wie bisher', d0.quellen.length === 0 && d0.quelle_text === null && HN.fussZeile(d0, ABEND, 'Europe/Vienna') === 'Vorhersage, Stand 22:27 · Datenquelle: GeoSphere Austria · ohne Gewähr');
const d1 = HN.heuteNachtLesen({ ...basis, quelle: null, quellen: ['dwd'], quelle_text: 'Datenbasis: Deutscher Wetterdienst, eigene Berechnungen' });
check('staatlich (quelle null, quelle_text gesetzt): genau der Server-Text', HN.fussZeile(d1, ABEND, 'Europe/Vienna') === 'Vorhersage, Stand 22:27 · Datenbasis: Deutscher Wetterdienst, eigene Berechnungen · ohne Gewähr');
const d2 = HN.heuteNachtLesen({ ...basis, quelle: 'open-meteo', quelle_text: 'x'.repeat(301), quellen: [3, 'open-meteo'] });
check('zu langer quelle_text → wie bisher aus quelle; Unsinn in quellen fällt weg', d2.quelle_text === null && /Wetterdaten: Open-Meteo\.com/.test(HN.fussZeile(d2, ABEND, 'Europe/Vienna')) && d2.quellen.join() === 'open-meteo');

console.log('\n[5] Quelltext-Wächter');
const dateien = ['src/winterdex/pages/EinsatzErfassen.tsx', 'src/winterdex/pages/OperationDetail.tsx', 'src/winterdex/pages/Operations.tsx', 'src/winterdex/pages/Overview.tsx',
  'src/winterdex/pages/PropertyDetail.tsx', 'src/winterdex/pages/RunDetail.tsx', 'src/winterdex/report.ts', 'src/winterdex/routeReport.ts', 'src/winterdex/exportLists.ts', 'src/objektdex/jahresnachweisPdf.ts'];
const fest = dateien.filter((f) => /\bWEATHER_SOURCE(_HTML)?\b/.test(lies(f)));
check('Seiten, PDFs, Excel und ObjektDex-Jahresnachweis nehmen quelleFuer/quelleFuerHtml (kein festes WEATHER_SOURCE)', fest.length === 0, fest);
check('wetterBeleg.ts: kein festes „(Open-Meteo)“ mehr im Momentwert', !/°C \(Open-Meteo\)`/.test(lies('src/winterdex/wetterBeleg.ts')));

console.log('\n[6] Gleich mit der App (vc48)');
const appDatei = [process.env.WINTERDEX_DIR, path.join(here, '..', '..', 'WinterDex-wt-quelle-vc48'), path.join(here, '..', '..', 'WinterDex')]
  .filter(Boolean).map((d) => path.join(d, 'mobile', 'src', 'lib', 'wetterQuelle.ts')).find((p) => existsSync(p));
if (!appDatei) console.log('  übersprungen: keine WinterDex-Arbeitskopie mit mobile/src/lib/wetterQuelle.ts (WINTERDEX_DIR setzen)');
else {
  const A = await import(pathToFileURL(appDatei).href);
  const quellen = ['open-meteo', undefined, '', 'geosphere', 'dwd', 'meteoschweiz', 'geosphere+meteoschweiz', 'dwd+geosphere', 'GeoSphere, DWD', 'demo', 'inca+dwd', 'open-meteo+geosphere'];
  const abw = [];
  for (const s of quellen) {
    const w = W(s);
    for (const [name, a, b] of [['anbieterAus', A.anbieterAus(s), Q.anbieterAus(s)], ['momentQuelleKurz', A.momentQuelleKurz(w), Q.momentQuelleKurz(w)], ['momentTitel', A.momentTitel(w), Q.momentTitel(w)],
      ['momentVermerke', A.momentVermerke([w]), Q.momentVermerke([w])], ['nurOpenMeteo', A.nurOpenMeteo([w]), Q.nurOpenMeteo([w])]])
      if (JSON.stringify(a) !== JSON.stringify(b)) abw.push(`${name}(${s}): App ${JSON.stringify(a)} ≠ Dashboard ${JSON.stringify(b)}`);
  }
  const misch = quellen.map((s) => W(s));
  if (JSON.stringify(A.momentVermerke(misch)) !== JSON.stringify(Q.momentVermerke(misch))) abw.push('momentVermerke(alle)');
  check(`App ${path.relative(path.join(here, '..', '..'), appDatei)} und Dashboard: gleiche Herkunft, Namen, Titel und Vermerke (${quellen.length} Quellwerte)`, abw.length === 0, abw.join(' | '));
  check('… gleiche Dienst-Tabelle (Kurzname + Vermerk) und „nicht beteiligt“', A.NICHT_BETEILIGT === Q.NICHT_BETEILIGT && A.ANBIETER_REIHE.every((k) => A.ANBIETER[k].kurz === Q.ANBIETER[k].kurz && A.ANBIETER[k].vermerk === Q.ANBIETER[k].vermerk));
}

console.log(`\n${fail ? 'FEHLER' : 'ALLES GRÜN'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
