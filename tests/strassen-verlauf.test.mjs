// WinterDex Straßenverlauf + Kartenbild im Bericht (25.11.2026) — ohne Browser: Daten (src/winterdex/strassen.ts),
// Bildplan (kartenBild.ts kartenPlan/sammelFenster), Einzel-PDF und Fahrtenbuch (routeReport.ts) mit den erfundenen
// Beispiel-Fahrten (einsatz/demoFahrt.ts), Quelltext-Wächter. Keine Kundendaten, kein Netz.
//   [1] Daten: säubern, Zustände (fertig/in Arbeit/leer/aufgegeben/fehlt), Straße zur Uhrzeit, Texte, Laden ohne Fehler
//   [2] Beispiel-Fahrten: Abschnitte decken die Fahrt, kaputte Einträge werden gesäubert
//   [3] Bildplan: Zoom ≤ 17, alle Punkte im Bild, Kacheln begrenzt, Ausschnitte nur bei großen Fahrten (8 Std.)
//   [4] Einzel-PDF: Straßenverlauf, Spalte „Straße“, „wird ermittelt“, Kartenbild statt Skizze, Quellenangabe, A4
//   [5] Fahrtenbuch: je Fahrt Straßenverlauf + Kartenbild, Fristen/Fehler → PDF entsteht trotzdem, > 100 Fahrten
//   [6] Quelltext: gleiche Kacheln, Zeitlimit, CORS, Rückfall, eine Tabelle für Einzel- und Sammel-PDF
//
//   Aufruf:  node tests/strassen-verlauf.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { readFileSync } from 'node:fs';
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
globalThis.window = globalThis.window ?? { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
const web = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
const lies = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + String(extra).slice(0, 400)}`);
};

const S = await web('src/winterdex/strassen.ts');
const K = await web('src/winterdex/kartenBild.ts');
const Z = await web('src/winterdex/fahrtZeit.ts');
const D = await web('src/winterdex/einsatz/demoFahrt.ts');
const RR = await web('src/winterdex/routeReport.ts');
const W = 'Europe/Vienna';
const org = { id: 'o', name: 'Bauhof Musterstadt', land: 'AT', address: 'Hauptplatz 1', created_at: '2026-11-01T00:00:00Z' };
const START = '2026-11-24T05:12:00.000Z'; // 06:12 Wien

console.log('\n[1] Daten');
{
  const ab = S.cleanAbschnitte([
    { sek_von: 300, sek_bis: 900, strasse: 'Wiener Straße', ort: 'Eggenburg', m: 1200 },
    { sek_von: 0, sek_bis: 300, strasse: '  Hauptplatz ', ort: 'Eggenburg', ortsteil: 'Altstadt' },
    { sek_von: 'x', sek_bis: 3 },
    null,
    { sek_von: 50, sek_bis: 10, strasse: 'rückwärts' },
    { sek_von: 900, sek_bis: 960, strasse: '', ort: null },
  ]);
  check('säubern: ungültige raus, sortiert, Straße nie leer', ab.length === 3 && ab[0].strasse === 'Hauptplatz' && ab[2].strasse === 'Weg ohne Namen', JSON.stringify(ab));
  const stand = { status: 'fertig', abschnitte: ab, quelle: 'osm-nominatim' };
  const a = S.strassenAnzeige(stand, { started_at: START }, true);
  check('fertig → Tabelle mit Uhrzeiten = started_at + sek', a?.art === 'tabelle' && a.zeilen[0].von === Date.parse(START) && a.zeilen[1].bis === Date.parse(START) + 900000, JSON.stringify(a));
  check('Straße zur Uhrzeit (Mitte, Start, kurz nach Ende)', S.strasseZu(a.zeilen, Date.parse(START) + 400000)?.strasse === 'Wiener Straße' && S.strasseZu(a.zeilen, Date.parse(START) - 30000)?.strasse === 'Hauptplatz' && S.strasseZu(a.zeilen, Date.parse(START) + 1000000)?.strasse === 'Weg ohne Namen');
  check('Ortsteil wird NIE angezeigt (Nominatim-Fund Eggenburg 25.11.): nur „Eggenburg“, Text „Wiener Straße, Eggenburg“', S.ortText(a.zeilen[0]) === 'Eggenburg' && a.zeilen.every((z) => z.ortsteil === null) && S.strassenText(a.zeilen[0]) === 'Hauptplatz, Eggenburg' && S.strassenText(a.zeilen[1]) === 'Wiener Straße, Eggenburg' && S.strassenText(a.zeilen[1], false) === 'Wiener Straße');
  check('Strecke „1,2 km“ / „350 m“', S.fmtStrecke(1200) === '1,2 km' && S.fmtStrecke(347) === '350 m' && S.fmtStrecke(null) === '');
  check('in Arbeit → „wird ermittelt“, storniert → nichts', S.strassenAnzeige({ status: 'in_arbeit', abschnitte: [], quelle: null }, { started_at: START }, true)?.art === 'ermittelt' && S.strassenAnzeige({ status: 'in_arbeit', abschnitte: [], quelle: null }, { started_at: START, canceled: true }, true) === null);
  check('leer / aufgegeben / Tabelle fehlt / ohne Punkt-Zeiten / noch nicht geladen → nichts', ['leer', 'aufgegeben', 'fehlt'].every((s) => S.strassenAnzeige({ status: s, abschnitte: ab, quelle: null }, { started_at: START }, true) === null) && S.strassenAnzeige(stand, { started_at: START }, false) === null && S.strassenAnzeige(null, { started_at: START }, true) === null);
  check('keine Zeile in der Datenbank = „in Arbeit“ (wird ermittelt)', S.strassenStandAus(null).status === 'in_arbeit');
  const fake = (antwort) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => antwort }), in: async () => antwort }) }) });
  check('Laden: Tabelle fehlt (Fehler) → „fehlt“, keine Zeile → „in Arbeit“, Zeile → fertig', (await S.fetchStrassen(fake({ data: null, error: { code: 'PGRST205' } }), 'r')).status === 'fehlt' && (await S.fetchStrassen(fake({ data: null, error: null }), 'r')).status === 'in_arbeit' && (await S.fetchStrassen(fake({ data: { status: 'fertig', abschnitte: ab, quelle: 'osm-nominatim' }, error: null }), 'r')).abschnitte.length === 3);
  const wirft = { from: () => { throw new Error('kein Netz'); } };
  check('Laden wirft nie (Netzfehler → „fehlt“)', (await S.fetchStrassen(wirft, 'r')).status === 'fehlt' && (await S.fetchStrassenViele(wirft, ['r'])) === null);
  const viele = await S.fetchStrassenViele(fake({ data: [{ run_id: 'a', status: 'fertig', abschnitte: ab, quelle: 'osm-nominatim' }], error: null }), ['a', 'b']);
  check('viele laden: Map je Fahrt, ohne Zeile fehlt sie', viele.get('a')?.abschnitte.length === 3 && !viele.has('b'));
}

console.log('\n[2] Beispiel-Fahrten');
{
  for (const id of ['demo-frei', 'demo-vorlage', 'demo-lang', 'demo-storno', 'demo-sommerzeit']) {
    const run = D.demoRun(id);
    const st = S.strassenStandAus(D.demoStrassen(id));
    const F = Z.fahrtDaten(run.track, run.started_at, run.ended_at, run.gaps);
    const a = S.strassenAnzeige(st, run, F.mitZeit && F.n >= 2);
    const ende = F.t[F.n - 1];
    const zeilen = a?.art === 'tabelle' ? a.zeilen : [];
    check(`${id}: fertig, ${zeilen.length} Abschnitte von Start bis Ende, Musterstadt`, zeilen.length >= (id === 'demo-lang' ? 60 : 3) && zeilen[0].von === F.t[0] && Math.abs(zeilen.at(-1).bis - ende) < 60000 && zeilen.every((z) => z.ort === 'Musterstadt'), JSON.stringify(zeilen.slice(0, 2)));
  }
  const k = S.strassenStandAus(D.demoStrassen('demo-kaputt'));
  check('demo-kaputt: kaputte Einträge gesäubert, gültige bleiben', k.status === 'fertig' && k.abschnitte.length >= 3 && k.abschnitte.every((a) => Number.isFinite(a.sek_von) && a.sek_bis >= a.sek_von && a.strasse));
  check('demo-alt (ohne Sekunden) → nichts, demo-leer → leer', S.strassenAnzeige(S.strassenStandAus(D.demoStrassen('demo-alt')), D.demoRun('demo-alt'), false) === null && D.demoStrassen('demo-leer').status === 'leer');
  check('Ortsteil im Beispiel („Am Bach“ in Unterdorf)', D.demoStrassen('demo-frei').abschnitte.some((a) => a.strasse === 'Am Bach' && a.ortsteil === 'Unterdorf'));
}

console.log('\n[3] Bildplan');
{
  const imBild = (f, la, ln) => {
    const [x, y] = K.weltPx(la, ln, f.z);
    const px = x - f.cx + f.w / 2;
    const py = y - f.cy + f.h / 2;
    return px >= 0 && py >= 0 && px <= f.w && py <= f.h;
  };
  for (const id of ['demo-frei', 'demo-vorlage', 'demo-lang', 'demo-ein-punkt', 'demo-kaputt', 'demo-sommerzeit']) {
    const run = D.demoRun(id);
    const F = Z.fahrtDaten(run.track, run.started_at, run.ended_at, run.gaps);
    const plan = Z.vereinfacheLinie(run.planned_path, 1);
    const kp = K.kartenPlan(F, plan);
    let alle = true;
    for (let i = 0; i < F.n; i++) if (!imBild(kp.uebersicht, F.lat[i], F.lng[i])) alle = false;
    for (const p of plan) if (!imBild(kp.uebersicht, p[0], p[1])) alle = false;
    const kacheln = kp.uebersicht.kacheln.length + kp.ausschnitte.reduce((s, a) => s + a.kacheln.length, 0);
    check(
      `${id}: Zoom ${kp.uebersicht.z} (≤ 17), ${kp.uebersicht.w}×${kp.uebersicht.h}, alle Punkte im Bild, ${kp.uebersicht.kacheln.length} Kacheln (≤ 48), ${kp.ausschnitte.length} Ausschnitte, Σ ${kacheln} Kacheln (≤ 84)`,
      kp.uebersicht.z <= 17 && alle && kp.uebersicht.kacheln.length <= K.MAX_KACHELN_UEBERSICHT && kp.ausschnitte.length <= 3 && kp.ausschnitte.every((a) => a.kacheln.length <= K.MAX_KACHELN_AUSSCHNITT) && kacheln <= 84 && kp.uebersicht.kacheln.every((k) => k.z === kp.uebersicht.z + 1),
    );
  }
  const eins = D.demoRun('demo-ein-punkt');
  check('1 Punkt: Straßen-Zoom 17, keine Ausschnitte', (() => { const kp = K.kartenPlan(Z.fahrtDaten(eins.track, eins.started_at)); return kp.uebersicht.z === 17 && kp.ausschnitte.length === 0; })());
  check('ohne Punkte und Vorlage: kein Bild (Skizze)', K.kartenPlan(Z.fahrtDaten([], START)) === null);
  // große Fahrt (~10 km breit) → Übersicht grob → Ausschnitte mit Besuchszeiten
  const gross = [[...Array(3000)].map((_, i) => [47.0 + Math.sin(i / 300) * 0.03, 15.4 + i * 0.00004, i * 2, 5])];
  const G = Z.fahrtDaten(gross, START, '2026-11-24T07:00:00Z');
  const kg = K.kartenPlan(G);
  check(`große Fahrt: Übersicht Zoom ${kg.uebersicht.z} ≤ 15 → 1–3 Ausschnitte in Straßen-Zoom (${kg.ausschnitte.map((a) => a.z).join(',')})`, kg.uebersicht.z <= 15 && kg.ausschnitte.length >= 1 && kg.ausschnitte.every((a) => a.z >= 16 && a.besuche?.length >= 1));
  check('Ausschnitt-Zeiten „HH:MM–HH:MM Uhr“', /^\d\d:\d\d(–\d\d:\d\d)?(, \d\d:\d\d(–\d\d:\d\d)?)* Uhr$/.test(K.besuchsZeiten(G, kg.ausschnitte[0].besuche, W)), K.besuchsZeiten(G, kg.ausschnitte[0].besuche, W));
  // Sammel: alle Beispiel-Fahrten auf einem Kachelsatz
  const alleF = D.DEMO_FAHRTEN.map((f) => D.demoRun(f.id)).map((r) => Z.fahrtDaten(r.track, r.started_at, r.ended_at, r.gaps)).filter((F) => F.n > 0);
  const sf = K.sammelFenster(alleF, D.demoRun('demo-vorlage').planned_path);
  check(`Sammel-Nachweis: EIN Kachelsatz für alle ${alleF.length} Fahrten (${sf.kacheln.length} Kacheln ≤ 12, 2-fach)`, sf.kacheln.length <= 12 && sf.skala === 2 && sf.w === K.SAMMEL_W);
  const viel = Array.from({ length: 60 }, () => alleF[0]);
  check('ab 31 Fahrten einfache Auflösung, über 100 kein Kartenbild', K.sammelFenster(viel).skala === 1 && K.sammelFenster(Array.from({ length: 101 }, () => alleF[0])) === null);
}

console.log('\n[4] Einzel-PDF');
{
  const frei = D.demoRun('demo-frei');
  const st = S.strassenStandAus(D.demoStrassen('demo-frei'));
  const html = RR.buildRunHtml(org, frei, W, { strassen: st });
  check('Abschnitt „Straßenverlauf — wann auf welcher Straße“ mit Uhrzeit, Straße, Ort, Strecke', html.includes('Straßenverlauf — wann auf welcher Straße') && /<tr><td>06:12–06:2\d<\/td><td><b>Hauptstraße<\/b><\/td><td>Musterstadt<\/td><td class="r">1,5 km<\/td><\/tr>/.test(html), html.match(/<table class="sv">[\s\S]{0,400}/)?.[0]);
  check('… Ortsteil aus alten Zeilen („Unterdorf“) erscheint NICHT im PDF', !html.includes('Unterdorf') && html.includes('<td>Musterstadt</td>'));
  check('Zeitleiste mit Spalte „Straße“ (einspaltig)', /<th>Uhrzeit<\/th><th>km seit Start<\/th><th>Straße<\/th><th>Abschnitt<\/th>/.test(html) && html.includes('<td>06:12</td><td>0,0 km</td><td>Hauptstraße</td><td>Start</td>') && !html.includes('class="zt-2"'));
  check('Quellenangabe „© OpenStreetMap-Mitwirkende“ bei Tabelle und in der Fußzeile', (html.match(/© OpenStreetMap-Mitwirkende/g) ?? []).length >= 2 && /Karte und Straßennamen: <a href="https:\/\/www.openstreetmap.org\/copyright">/.test(html));
  check('A4 hoch', html.includes('@page { size: A4 portrait; margin: 12mm; }'));
  const ohne = RR.buildRunHtml(org, frei, W);
  check('ohne Straßenverlauf: Bericht wie bisher (zweispaltige Zeitleiste, Skizze, keine OSM-Fußzeile)', ohne.includes('class="zt-2"') && ohne.includes('<svg') && !ohne.includes('Straßenverlauf') && !ohne.includes('Karte und Straßennamen'));
  const erm = RR.buildRunHtml(org, D.demoRun('demo-vorlage'), W, { strassen: { status: 'in_arbeit', abschnitte: [], quelle: null } });
  check('noch nicht ermittelt → PDF entsteht, an der Stelle der Tabelle „wurde bei Erstellung (TT.MM.JJJJ HH:MM) noch ermittelt – Bericht später erneut erstellen.“', /Straßenverlauf wurde bei Erstellung \(\d\d\.\d\d\.\d{4} \d\d:\d\d\) noch ermittelt – Bericht später erneut erstellen\./.test(erm) && erm.includes('Nicht befahren') && erm.includes('der Strecke abgedeckt'), erm.match(/Straßenverlauf wurde[^<]*/)?.[0]);
  check('stornierte Fahrt, nie ermittelt → kein Hinweis', !RR.buildRunHtml(org, D.demoRun('demo-storno'), W, { strassen: { status: 'in_arbeit', abschnitte: [], quelle: null } }).includes('noch ermittelt'));
  check('fertig → kein Hinweis im PDF', !html.includes('noch ermittelt') && !html.includes('wird ermittelt'));
  check('alte Fahrt ohne Sekunden → kein Straßenverlauf', !RR.buildRunHtml(org, D.demoRun('demo-alt'), W, { strassen: { status: 'fertig', abschnitte: st.abschnitte, quelle: 'x' } }).includes('Straßenverlauf'));
  const bild = { src: 'data:image/jpeg;base64,AAAA', w: 700, h: 460 };
  const mitKarte = RR.buildRunHtml(org, frei, W, { strassen: st, karte: { uebersicht: bild, ausschnitte: [{ ...bild, w: 340, h: 250, buchstabe: 'A', zeiten: '06:12–06:31 Uhr' }] } });
  check('Kartenbild statt Skizze, Legende mit Quelle und A/B/C, Ausschnitte mit Zeiten', mitKarte.includes('<img src="data:image/jpeg;base64,AAAA" width="700" height="460"') && !mitKarte.includes('<svg') && mitKarte.includes('Ausschnitte in Straßen-Zoom') && mitKarte.includes('<b>Ausschnitt A</b> · dort 06:12–06:31 Uhr') && mitKarte.includes('A/B/C = Ausschnitt unten') && mitKarte.includes('Karte: © OpenStreetMap-Mitwirkende'));
  check('Reihenfolge: Karte → Straßenverlauf → Ausschnitte → Zeitleiste', (() => { const p = ['<figure class="karte">', 'Straßenverlauf — wann', 'Ausschnitte in Straßen-Zoom', 'Zeitleiste — wann']; const i = p.map((x) => mitKarte.indexOf(x)); return i.every((v, j) => v >= 0 && (j === 0 || v > i[j - 1])); })());
  let alle = true;
  for (const f of D.DEMO_FAHRTEN) {
    try {
      const h = RR.buildRunHtml(org, D.demoRun(f.id), W, { strassen: S.strassenStandAus(D.demoStrassen(f.id)) });
      if (!h.includes('Strecken-Nachweis Winterdienst')) alle = false;
    } catch (e) {
      alle = false;
      console.log('   ', f.id, e);
    }
  }
  check(`Einzel-PDF mit Straßenverlauf für alle ${D.DEMO_FAHRTEN.length} Beispiel-Formen`, alle);
  const lang = RR.buildRunHtml(org, D.demoRun('demo-lang'), W, { strassen: S.strassenStandAus(D.demoStrassen('demo-lang')) });
  check('8 Std.: alle Abschnitte in der Tabelle', (lang.match(/<tr><td>\d\d:\d\d(–\d\d:\d\d)?<\/td><td><b>/g) ?? []).length >= 60);
  // ohne Browser: Bericht „mit Karte“ fällt auf die Skizze zurück und entsteht trotzdem
  const t0 = Date.now();
  const mk = await RR.buildRunHtmlMitKarte(org, frei, st);
  check('ohne Browser/Kartenbild: Skizze + Straßenverlauf, sofort', mk.includes('<svg') && mk.includes('Straßenverlauf — wann') && Date.now() - t0 < 2000);
}

console.log('\n[5] Fahrtenbuch (Sammel-Nachweis)');
{
  const route = { id: 'r', org_id: 'o', name: 'Ortskern Runde', notes: null, path: D.demoRun('demo-vorlage').planned_path, length_m: 7800, source: 'recorded', property_ids: [], active: true, created_at: START };
  const ids = ['demo-frei', 'demo-vorlage', 'demo-alt', 'demo-lang', 'demo-storno', 'demo-leer'];
  const runs = ids.map((id) => D.demoRun(id));
  const lader = {
    spuren: async (l) => new Map(l.map((id) => [id, D.demoRun(id)])),
    strassen: async (l) => new Map(l.map((id) => [id, S.strassenStandAus(D.demoStrassen(id))])),
  };
  const html = await RR.buildRouteLogHtmlMitDetails(org, route, runs, 'Nov. 2026', lader, { timeZone: W });
  const bloecke = html.match(/<div class="fahrt">/g) ?? [];
  check('„Die Fahrten im Einzelnen“: Block je Fahrt mit Straßenverlauf (frei, Vorlage, lang)', html.includes('Die Fahrten im Einzelnen') && bloecke.length >= 3 && html.includes('<b>Hauptstraße</b>') && html.includes('<td>Musterstadt</td>') && !html.includes('Unterdorf'), bloecke.length);
  check('stornierte Fahrt nur in der Liste (Storno-Kennzeichen), nicht im Einzelteil', html.includes('Storno:') && !html.includes('Doppelt erfasst (Beispiel)</h3>'));
  check('alte Fahrt ohne Sekunden: kein Straßenverlauf', !/<h3>20\.11\.2026[^<]*<\/h3><div class="fahrt-inhalt"><div class="fahrt-str"><table/.test(html));
  check('ohne Browser: keine Kartenbilder, Hinweis, PDF entsteht', html.includes('Kartenbilder ließen sich gerade nicht laden') && html.includes('Fahrtenbuch Winterdienst'));
  check('gleiche Tabelle wie im Einzel-PDF (class="sv"), Fußnote mit Quelle einmal', html.includes('<table class="sv">') && (html.match(/Straßennamen: © OpenStreetMap-Mitwirkende \(ODbL\)/g) ?? []).length === 1);
  // Lader hängt / wirft → trotzdem ein PDF
  const haengt = { spuren: () => new Promise(() => {}), strassen: () => Promise.reject(new Error('kaputt')) };
  const t0 = Date.now();
  const h2 = await Promise.race([RR.buildRouteLogHtmlMitDetails(org, route, runs.slice(0, 2), 'x', { ...haengt, spuren: async () => { throw new Error('weg'); } }, { timeZone: W }), new Promise((r) => setTimeout(() => r('ZEIT'), 5000))]);
  check('Lader wirft → Fahrtenbuch ohne Straßenverlauf, mit Hinweis, sofort', typeof h2 === 'string' && h2.includes('Fahrtenbuch Winterdienst') && Date.now() - t0 < 3000, String(h2).slice(0, 80));
  const viele = Array.from({ length: 120 }, (_, i) => ({ ...D.demoRun('demo-frei'), id: `v${i}` }));
  const h3 = await RR.buildRouteLogHtmlMitDetails(org, route, viele, 'x', { spuren: async () => new Map(), strassen: async (l) => new Map(l.map((id) => [id, S.strassenStandAus(D.demoStrassen('demo-frei'))])) }, { timeZone: W });
  check('120 Fahrten: Straßenverlauf für jede, ohne Kartenbilder (Hinweis Dateigröße)', (h3.match(/<div class="fahrt">/g) ?? []).length === 120 && h3.includes('Kartenbilder nur bis 100 Fahrten'));
  check('Fahrtenbuch ohne Details (alter Aufruf) wie bisher', !RR.buildRouteLogHtml(org, route, runs, 'x').includes('Die Fahrten im Einzelnen'));
}

console.log('\n[6] Quelltext');
{
  const kb = lies('src/winterdex/kartenBild.ts');
  const fk = lies('src/winterdex/FahrtKarte.tsx');
  const tile = (s) => s.match(/TILE_URL = '([^']+)'/)?.[1];
  check('Kartenbild nutzt dieselben Kacheln wie die Fahrt-Karte', tile(kb) && tile(kb) === tile(fk));
  check('Zeitlimit 8 s, CORS (crossOrigin), ohne Netz sofort Rückfall', /zeitlimitMs \?\? 8000/.test(kb) && /crossOrigin = 'anonymous'/.test(kb) && /navigator\.onLine === false/.test(kb));
  check('Spur „volle Genauigkeit“: höchstens 1 m vereinfacht', /spurStuecke\(F, 1\)/.test(kb));
  check('Quellenangabe im Bild', /KARTE_QUELLE = '© OpenStreetMap-Mitwirkende'/.test(kb) && /fillText\(q,/.test(kb));
  const rd = lies('src/winterdex/pages/RunDetail.tsx');
  check('Fahrt-Detail: PDF-Fenster sofort im Klick, Bericht mit Karte danach', /openReportWindowAfter\(async \(\) => \{[\s\S]{0,600}?withWatermark\(await buildRunHtmlMitKarte\(/.test(rd) && /fetchStrassen\(client, id!\)/.test(rd));
  const rt = lies('src/winterdex/pages/RouteDetail.tsx');
  check('Strecke (Dashboard): letzte Fahrt mit Zeiten + Straßenverlauf, Fahrtenbuch mit Details', /zeit=\{!!last\}/.test(rt) && /strassen=\{lastStr\}/.test(rt) && /buildRouteLogHtmlMitDetails\(/.test(rt));
  const sd = lies('src/winterdex/aussendienst/StreckeDetail.tsx');
  check('Strecke (Außendienst): letzte Fahrt mit Zeiten + Straßenverlauf', /zeit=\{!!last\}/.test(sd) && /strassen=\{lastStr\}/.test(sd) && /useStrassenNachladen\(last\?\.run\.id, last\?\.strassen/.test(sd));
  const rr = lies('src/winterdex/routeReport.ts');
  check('EINE Straßenverlauf-Tabelle für Einzel- und Sammel-PDF', (rr.match(/function strassenTabelle/g) ?? []).length === 1 && /strassenTabelle\(d\.str, timeZone, true\)/.test(rr) && /strassenTabelle\(str, tz\)/.test(rr));
  const fa = lies('src/winterdex/FahrtAnsicht.tsx');
  check('Detail: Straßenverlauf + Spalte „Straße“ + Quellenangabe', /Straßenverlauf — wann auf welcher Straße/.test(fa) && /<th>Straße<\/th>/.test(fa) && /STRASSEN_QUELLE/.test(fa));
  check('Kundendaten nicht im Beispiel', !/Eggenburg/i.test(lies('src/winterdex/einsatz/demoFahrt.ts')));
}

console.log('\n[7] Straßen jede Minute (25.11.): „meist in 1–3 Minuten“, selbst nachfragen, Hinweis beim PDF');
{
  check('Hinweis-Text „Straßenverlauf wird ermittelt – meist in 1–3 Minuten.“', S.STRASSEN_ERMITTELT === 'Straßenverlauf wird ermittelt – meist in 1–3 Minuten.');
  check('PDF-Knopf-Hinweis', S.STRASSEN_PDF_HINWEIS === 'Straßenverlauf kommt in wenigen Minuten – für den vollständigen Bericht kurz warten');
  check('PDF-Vermerk mit Erstellungszeit (Ortszeit)', S.strassenPdfNochOffen(Date.parse('2026-11-25T17:05:00Z'), 'Europe/Vienna') === 'Straßenverlauf wurde bei Erstellung (25.11.2026 18:05) noch ermittelt – Bericht später erneut erstellen.', S.strassenPdfNochOffen(Date.parse('2026-11-25T17:05:00Z'), 'Europe/Vienna'));
  check('nachfragen alle 20 s, höchstens 10 Minuten', S.STRASSEN_NACHLADEN_MS === 20000 && S.STRASSEN_NACHLADEN_MAX_MS === 600000);
  const leer = { status: 'in_arbeit', abschnitte: [], quelle: null };
  check('offen: in Arbeit bzw. keine Zeile; nicht bei fertig/fehlt/storniert', S.strassenOffen(leer) && S.strassenOffen(S.strassenStandAus(null)) && !S.strassenOffen({ ...leer, status: 'fertig' }) && !S.strassenOffen({ ...leer, status: 'fehlt' }) && !S.strassenOffen(leer, { canceled: true }) && !S.strassenOffen(null));
  const hook = lies('src/winterdex/strassenNachladen.ts');
  check('Nachlade-Hook: Intervall mit Frist, hört bei fertig auf (offen = strassenOffen), Lesefehler ändern nichts', /setInterval\(/.test(hook) && /STRASSEN_NACHLADEN_MAX_MS/.test(hook) && /strassenOffen\(stand, run\)/.test(hook) && /s\.status !== 'fehlt'/.test(hook) && /clearInterval\(t\)/.test(hook));
  for (const f of ['src/winterdex/pages/RunDetail.tsx', 'src/winterdex/pages/RouteDetail.tsx', 'src/winterdex/aussendienst/StreckeDetail.tsx'])
    check(`${f.split('/').pop()}: fragt selbst nach (useStrassenNachladen)`, /useStrassenNachladen\(/.test(lies(f)));
  check('Fahrt-Detail + Fahrtenbuch: Hinweis neben dem PDF-Knopf, nur solange offen', ['src/winterdex/pages/RunDetail.tsx', 'src/winterdex/pages/RouteDetail.tsx'].every((f) => /strassenOffen\([^)]*\)[^\n]*\n\s*<span className="small muted" role="status"[^>]*>\n\s*\{STRASSEN_PDF_HINWEIS\}/.test(lies(f))));
}

console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail === 0 ? 0 : 1);
