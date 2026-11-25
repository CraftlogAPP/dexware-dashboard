// WinterDex Fahrt-Ansicht „wann war er wo“ (25.11.2026) — Rechnung ohne Browser (src/winterdex/fahrtZeit.ts),
// Skizze/PDF mit Zeitmarken (routes.ts, routeReport.ts) und Quelltext-Wächter. Nur erfundene Beispiel-Fahrten
// (src/winterdex/einsatz/demoFahrt.ts), keine Kundendaten.
//   [1] Vorbereitung: Zeit = started_at + sek, km je Punkt (Lücken zählen nicht), Stücke, Unterbrechungen
//   [2] Uhrzeit → Ort (eingepasst, Lücke, vor/nach den Punkten)
//   [3] Zeitmarken: Abstand 5/10/15/30/60, 6–12 Stück, Europe/Vienna inkl. Zeitumstellung, Stillstand zusammengefasst
//   [4] Ort → Uhrzeit: nächster Punkt (= Brute Force), Vorbeifahrten („Hier auch“), Tempo bei 28.000+ Punkten
//   [5] Zeitleiste (Tabelle)
//   [6] Vereinfachen (Douglas-Peucker): Endpunkte, Abweichung ≤ Toleranz, spart bei langen Fahrten
//   [7] Kaputte/alte Daten: nie ein Absturz, Skizze und PDF entstehen immer
//   [8] PDF: Zeitmarken in der Skizze + Zeit-Tabelle; alte Fahrt ohne Sekunden wie bisher
//   [9] Quelltext: Karte in Fahrt/Strecke, Skizze als Rückfall, gleiche Kacheln wie Außendienst, Hinweis freie Fahrt
//
//   Aufruf:  node tests/fahrt-zeit.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
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
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + extra}`);
};

const Z = await web('src/winterdex/fahrtZeit.ts');
const R = await web('src/winterdex/routes.ts');
const D = await web('src/winterdex/einsatz/demoFahrt.ts');
const W = 'Europe/Vienna';
const uhr = (iso) => Z.fmtUhr(Date.parse(iso), W);
const hav = (a, b, c, d) => {
  const r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(x)));
};

// kleine, nachrechenbare Fahrt: 4 Punkte nach Norden (je ~111 m, je 60 s), Pause, 3 Punkte
const START = '2026-11-24T05:12:00.000Z'; // 06:12 Uhr Wien
const KLEIN = [
  [
    [47.0, 15.4, 0, 5],
    [47.001, 15.4, 60, 5],
    [47.002, 15.4, 120, 5],
    [47.003, 15.4, 180, 5],
  ],
  [
    [47.004, 15.4, 600, 5],
    [47.005, 15.4, 660, 5],
    [47.006, 15.4, 720, 5],
  ],
];
const KLEIN_GAPS = [['2026-11-24T05:15:05.000Z', '2026-11-24T05:21:55.000Z']];

console.log('\n[1] Vorbereitung');
{
  const F = Z.fahrtDaten(KLEIN, START, '2026-11-24T05:24:30.000Z', KLEIN_GAPS);
  check('7 Punkte, mit Zeit', F.n === 7 && F.mitZeit);
  check('Zeit = started_at + sek (Punkt 2: +120 s)', F.t[2] === Date.parse(START) + 120000);
  check('… angezeigt in Wien: 06:12 / 06:14 / 06:22', Z.fmtUhr(F.t[0], W) === '06:12' && Z.fmtUhr(F.t[2], W) === '06:14' && Z.fmtUhr(F.t[4], W) === '06:22');
  const seg1 = hav(47, 15.4, 47.003, 15.4);
  const seg2 = hav(47.004, 15.4, 47.006, 15.4);
  check('km je Punkt: Lücke zwischen Teilstücken zählt nicht (wie der Server)', Math.abs(F.d[6] - (seg1 + seg2)) < 0.5 && Math.abs(F.d[4] - seg1) < 0.5, `${F.d[6]} vs ${seg1 + seg2}`);
  check('2 Zeichen-Stücke', JSON.stringify(F.stuecke) === '[[0,3],[4,6]]');
  check('1 Unterbrechung mit den vermerkten Zeiten', F.unterbrechungen.length === 1 && F.unterbrechungen[0].von === Date.parse(KLEIN_GAPS[0][0]) && F.unterbrechungen[0].bis === Date.parse(KLEIN_GAPS[0][1]));
  check('… mit Position davor/danach', JSON.stringify(F.unterbrechungen[0].ab) === '[47.003,15.4]' && JSON.stringify(F.unterbrechungen[0].an) === '[47.004,15.4]');

  // GPS-Loch im selben Teilstück (Recorder schreibt weiter, vermerkt aber die Unterbrechung) → Stück wird geteilt
  const loch = [[[47, 15.4, 0], [47.001, 15.4, 30], [47.0012, 15.4, 130], [47.002, 15.4, 160]]];
  const G = Z.fahrtDaten(loch, START, null, [['2026-11-24T05:12:31.000Z', '2026-11-24T05:14:09.000Z']]);
  check('GPS-Loch im Teilstück: als Lücke gezeichnet (2 Stücke)', JSON.stringify(G.stuecke) === '[[0,1],[2,3]]');
  check('… km zählen trotzdem durch (Server rechnet je Teilstück)', Math.abs(G.d[3] - hav(47, 15.4, 47.002, 15.4)) < 1);
  check('kurze Lücke zwischen Punkten ohne Vermerk: kein Schnitt', Z.fahrtDaten([[[47, 15.4, 0], [47.001, 15.4, 40]]], START).stuecke.length === 1);
}

console.log('\n[2] Uhrzeit → Ort');
{
  const F = Z.fahrtDaten(KLEIN, START, null, KLEIN_GAPS);
  const t0 = Date.parse(START);
  const p = Z.positionZu(F, t0 + 90000);
  check('zwischen zwei Punkten eingepasst (Mitte)', p.art === 'fahrt' && Math.abs(p.lat - 47.0015) < 1e-9 && Math.abs(p.dM - (F.d[1] + F.d[2]) / 2) < 0.01);
  const l = Z.positionZu(F, t0 + 400000);
  check('in der Pause: Lücke, Position = letzte davor', l.art === 'luecke' && l.lat === 47.003 && l.luecke.bis === Date.parse(KLEIN_GAPS[0][1]));
  check('vor dem ersten Punkt / nach dem letzten', Z.positionZu(F, t0 - 1000).art === 'vorher' && Z.positionZu(F, t0 + 999999).art === 'nachher');
  check('genau auf einem Punkt', Z.positionZu(F, t0 + 660000).i === 5);
  const alt = Z.fahrtDaten([[[47, 15.4], [47.001, 15.4]]], START);
  check('alte Fahrt ohne Sekunden: keine Zeiten, keine Position', !alt.mitZeit && Z.positionZu(alt, t0) === null && Z.zeitMarken(alt).length === 0 && Z.zeitleiste(alt).length === 0);
  check('ohne started_at: keine Zeiten', !Z.fahrtDaten(KLEIN, null).mitZeit);
}

console.log('\n[3] Zeitmarken');
{
  const m = (min) => min * 60000;
  const s = Date.parse('2026-11-24T05:12:00Z');
  check('Abstand: 20 Min → 5, 60 Min → 5, 2 Std 3 Min → 10, 3 Std → 15, 5 Std → 30, 10 Std → 60',
    Z.waehleSchritt(s, s + m(20)) === 5 && Z.waehleSchritt(s, s + m(60)) === 5 && Z.waehleSchritt(s, s + m(123)) === 10 &&
      Z.waehleSchritt(s, s + m(180)) === 15 && Z.waehleSchritt(s, s + m(300)) === 30 && Z.waehleSchritt(s, s + m(600)) === 60,
    [20, 60, 123, 180, 300, 600].map((x) => Z.waehleSchritt(s, s + m(x))).join(','));

  const run = D.demoRun('demo-frei');
  const F = Z.fahrtDaten(run.track, run.started_at, run.ended_at, run.gaps);
  const dauer = (F.t[F.n - 1] - F.t[0]) / 60000;
  const mk = Z.zeitMarken(F, { timeZone: W });
  check(`Beispiel-Fahrt ${Math.round(dauer)} Min. → 6–12 Marken`, mk.length >= 6 && mk.length <= 12, String(mk.length));
  check('Beschriftung „HH:MM“ bzw. zusammengefasst „HH:MM–HH:MM“', mk.every((x) => /^\d\d:\d\d(–\d\d:\d\d)?$/.test(x.label)), mk.map((x) => x.label).join(' '));
  const schritt = Z.waehleSchritt(F.t[0], F.t[F.n - 1]);
  check(`auf vollen ${schritt} Minuten in Wiener Zeit (außer Stillstand „von–bis“)`, mk.filter((x) => !x.bis).every((x) => Number(x.label.slice(3, 5)) % schritt === 0), mk.map((x) => x.label).join(' '));
  check('beide Stillstände (7 und 15 Min.) haben eine Marke, auch zwischen den Rasterzeiten', mk.filter((x) => x.bis && x.bis - x.t >= 5 * 60000).length === 2, mk.map((x) => x.label).join(' '));
  check('Marken nach Zeit sortiert', mk.every((x, i) => i === 0 || x.t >= mk[i - 1].t));
  check('Stillstand am Bauhof als „von–bis“-Marke',mk.some((x) => x.bis && x.bis - x.t >= 10 * 60000), mk.map((x) => x.label).join(' '));
  // 25 Min. Stillstand (alle 15 s ein Punkt am selben Ort, 06:20–06:45) → eine Marke „06:20–06:45“ statt drei übereinander
  const steh = [[[47, 15.4, 0], [47.003, 15.4, 300]]];
  for (let s = 315; s <= 1800; s += 15) steh[0].push([47.003, 15.4, s]);
  steh[0].push([47.006, 15.4, 2100], [47.009, 15.4, 2400]);
  const S = Z.fahrtDaten(steh, '2026-11-24T05:15:00Z');
  const mkS = Z.zeitMarken(S, { schrittMin: 10, timeZone: W });
  check('Stillstand = eine Marke mit echter Dauer („06:20–06:45“)', mkS.filter((x) => x.label.includes('–')).length === 1 && mkS.some((x) => x.label === '06:20–06:45'), mkS.map((x) => x.label).join(' '));
  const zlS = Z.zeitleiste(S, { schrittMin: 10 });
  check('… in der Zeitleiste eine Zeile „Stillstand“ von–bis (keine Rasterzeilen darin)', zlS.filter((z) => z.art === 'steht').length === 1 && zlS.some((z) => z.art === 'steht' && z.bis - z.t === 25 * 60000 && z.text.startsWith('Stillstand')), zlS.map((z) => z.art).join(','));
  check('langsam bewegt (< 50 m je Abschnitt) → „kaum bewegt“', Z.zeitleiste(Z.fahrtDaten([[[47, 15.4, 0], [47.0001, 15.4, 200], [47.0002, 15.4, 400], [47.0003, 15.4, 600], [47.0004, 15.4, 800], [47.01, 15.4, 900]]], '2026-11-24T05:15:00Z'), { schrittMin: 5 }).some((z) => z.text === 'kaum bewegt (unter 50 m)'));
  check('keine Marke in einer Unterbrechung', mk.every((x) => !F.unterbrechungen.some((u) => x.t >= u.von && x.t <= u.bis)));
  check('Marke liegt auf der Spur (Position zur Uhrzeit)', mk.every((x) => { const p = Z.positionZu(F, x.t); return Math.abs(p.lat - x.lat) < 1e-9; }));
  check('nicht direkt neben Start/Ende (≥ ¼ Abstand)', mk.every((x) => x.t - F.t[0] >= 2.5 * 60000 && F.t[F.n - 1] - x.t >= 2.5 * 60000));

  // Sommer-/Winterzeit (Europe/Vienna): Uhrzeit = started_at + sek, Intl rechnet die Umstellung
  check('Winterzeit: 05:12 UTC = 06:12', uhr('2026-11-24T05:12:00Z') === '06:12');
  check('Sommerzeit: 05:12 UTC = 07:12', uhr('2026-07-01T05:12:00Z') === '07:12');
  check('Umstellung 25.10.2026: 00:30 UTC = 02:30 (MESZ), 01:30 UTC = 02:30 (MEZ)', uhr('2026-10-25T00:30:00Z') === '02:30' && uhr('2026-10-25T01:30:00Z') === '02:30');
  check('Umstellung 29.03.2026: 00:59 UTC = 01:59, 01:00 UTC = 03:00', uhr('2026-03-29T00:59:00Z') === '01:59' && uhr('2026-03-29T01:00:00Z') === '03:00');
  const dst = D.demoRun('demo-sommerzeit');
  const FD = Z.fahrtDaten(dst.track, dst.started_at, dst.ended_at, dst.gaps);
  const mkD = Z.zeitMarken(FD, { timeZone: W });
  check('Fahrt über die Umstellung: Marken bleiben auf vollen Minuten, Zeit läuft weiter', mkD.length >= 3 && mkD.every((x, i) => i === 0 || x.t > mkD[i - 1].t) && mkD.every((x) => Number(x.label.slice(3, 5)) % 5 === 0), mkD.map((x) => x.label).join(' '));
  check('… Beginn 02:20 (Sommerzeit)', Z.fmtUhr(FD.t[0], W) === '02:20');
}

console.log('\n[4] Ort → Uhrzeit');
{
  const run = D.demoRun('demo-lang');
  let t = performance.now();
  const F = Z.fahrtDaten(run.track, run.started_at, run.ended_at, run.gaps);
  const prepMs = performance.now() - t;
  check(`lange Fahrt: ${F.n} Punkte vorbereitet in ${prepMs.toFixed(0)} ms (< 400 ms)`, F.n > 25000 && prepMs < 400);
  // Brute Force zum Vergleich
  const brute = (la, ln, maxM) => {
    const [px, py] = [(ln - F.lng0) * F.kx * 111195, (la - F.lat0) * 111195];
    let best = -1;
    let bd = maxM * maxM;
    for (let k = 0; k < F.n; k++) {
      const dd = (F.x[k] - px) ** 2 + (F.y[k] - py) ** 2;
      if (dd <= bd) {
        bd = dd;
        best = k;
      }
    }
    return [best, bd];
  };
  let gleich = 0;
  let rnd = 42;
  const zufall = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  const fragen = [];
  for (let q = 0; q < 300; q++) fragen.push([F.lat0 - 0.002 + zufall() * 0.016, F.lng0 - 0.004 + zufall() * 0.03, 5 + zufall() * 400]);
  for (const [la, ln, maxM] of fragen) {
    const i = Z.naechsterPunkt(F, la, ln, maxM);
    const [b, bd] = brute(la, ln, maxM);
    const di = i < 0 ? -1 : (F.x[i] - (ln - F.lng0) * F.kx * 111195) ** 2 + (F.y[i] - (la - F.lat0) * 111195) ** 2;
    if ((i < 0 && b < 0) || (i >= 0 && b >= 0 && Math.abs(di - bd) < 1e-6)) gleich++;
  }
  check('nächster Punkt = Brute Force (300 Stellen, Umkreis 5–405 m)', gleich === fragen.length, `${gleich}/${fragen.length}`);
  t = performance.now();
  for (let q = 0; q < 2000; q++) Z.naechsterPunkt(F, fragen[q % 300][0], fragen[q % 300][1], 60);
  const suchMs = performance.now() - t;
  check(`2.000 Suchen (Mausbewegung) in ${suchMs.toFixed(0)} ms (< 150 ms)`, suchMs < 150);
  check('weit weg → keiner', Z.naechsterPunkt(F, 48, 16, 50) === -1);

  const frei = D.demoRun('demo-frei');
  const G = Z.fahrtDaten(frei.track, frei.started_at, frei.ended_at, frei.gaps);
  // Straße y = 800 m wird zweimal gefahren (Runde 1 nach Westen, später nochmal) → zwei Vorbeifahrten
  const i = Z.naechsterPunkt(G, 47.0705 + 800 / 111195, 15.4385 + 700 / (Math.cos((47.0705 * Math.PI) / 180) * 111195), 30);
  const vb = Z.vorbeifahrten(G, G.lat[i], G.lng[i], 25);
  check('zweimal dieselbe Straße → 2 Vorbeifahrten, nach Zeit sortiert', vb.length === 2 && G.t[vb[0].i] < G.t[vb[1].i], JSON.stringify(vb));
  const info = Z.infoZuPunkt(G, vb[0].i, true, W);
  check('Text: „HH:MM Uhr · x,x km seit Start“ + „Hier auch: …“', /^\d\d:\d\d Uhr · \d+,\d km seit Start$/.test(info.titel) && /^Hier auch: \d\d:\d\d Uhr$/.test(info.zusatz ?? ''), JSON.stringify(info));
  const iz = Z.infoZuZeit(G, G.unterbrechungen[0].von + 1000, W);
  check('Regler in einer Unterbrechung: „Unterbrechung“ mit Von–Bis', iz.titel.endsWith('· Unterbrechung') && /\d\d:\d\d–\d\d:\d\d Uhr/.test(iz.zusatz), JSON.stringify(iz));
  check('ohne Zeiten nur km', Z.infoZuPunkt(G, 5, false).titel.endsWith('km seit Start') && !/Uhr/.test(Z.infoZuPunkt(G, 5, false).titel));
}

console.log('\n[5] Zeitleiste');
{
  const run = D.demoRun('demo-frei');
  const F = Z.fahrtDaten(run.track, run.started_at, run.ended_at, run.gaps);
  const zl = Z.zeitleiste(F);
  check('beginnt mit Start (0 km, Startzeit) und endet mit Ende (Endzeit)', zl[0].art === 'start' && zl[0].dM === 0 && zl[0].t === Date.parse(run.started_at) && zl.at(-1).art === 'ende' && zl.at(-1).t === Date.parse(run.ended_at));
  check('nach Zeit sortiert, km steigen nie', zl.every((z, i) => i === 0 || (z.t >= zl[i - 1].t && z.dM >= zl[i - 1].dM - 0.01)));
  check('Ende = gefahrene km (wie Server-Länge)', Math.abs(zl.at(-1).dM - run.track_length_m) < 5, `${zl.at(-1).dM} / ${run.track_length_m}`);
  check('Pause und GPS-Loch als Unterbrechung mit Von–Bis', zl.filter((z) => z.art === 'luecke' && z.bis > z.t).length === 2);
  check('Stillstände (7 Min. und 15 Min. Bauhof) als Zeilen von–bis', zl.filter((z) => z.art === 'steht' && z.bis - z.t >= 5 * 60000).length === 2, zl.map((z) => `${Z.fmtUhr(z.t, W)} ${z.art}`).join(', '));
  check('Fahrt-Zeilen mit „+x,x km gefahren“', zl.some((z) => z.art === 'fahrt' && /^\+\d+,\d km gefahren$/.test(z.text)));
  check('Zeilenzahl übersichtlich (≤ 18)', zl.length <= 18, String(zl.length));
  check('fmtKm: 0 → „0,0 km“, 13.512 m → „13,5 km“', Z.fmtKm(0) === '0,0 km' && Z.fmtKm(13512) === '13,5 km');
}

console.log('\n[6] Vereinfachen');
{
  const frei = D.demoRun('demo-frei');
  const F = Z.fahrtDaten(frei.track, frei.started_at, frei.ended_at, frei.gaps);
  const st = Z.spurStuecke(F, 2);
  check('je Stück erster und letzter Punkt bleiben', st.every((s, k) => s[0][0] === F.lat[F.stuecke[k][0]] && s.at(-1)[0] === F.lat[F.stuecke[k][1]]));
  // jeder Originalpunkt liegt höchstens ~2 m von der vereinfachten Linie entfernt
  let maxAbw = 0;
  F.stuecke.forEach(([a, b], k) => {
    const line = st[k].map(([la, ln]) => [(ln - F.lng0) * F.kx * 111195, (la - F.lat0) * 111195]);
    for (let i = a; i <= b; i++) {
      let best = Infinity;
      for (let j = 1; j < line.length; j++) {
        const [x1, y1] = line[j - 1];
        const [x2, y2] = line[j];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const l2 = dx * dx + dy * dy;
        const u = l2 ? Math.max(0, Math.min(1, ((F.x[i] - x1) * dx + (F.y[i] - y1) * dy) / l2)) : 0;
        best = Math.min(best, Math.hypot(x1 + u * dx - F.x[i], y1 + u * dy - F.y[i]));
      }
      if (line.length === 1) best = Math.hypot(line[0][0] - F.x[i], line[0][1] - F.y[i]);
      maxAbw = Math.max(maxAbw, best);
    }
  });
  check(`größte Abweichung ${maxAbw.toFixed(2)} m ≤ 2 m`, maxAbw <= 2.0001);
  const lang = D.demoRun('demo-lang');
  const FL = Z.fahrtDaten(lang.track, lang.started_at, lang.ended_at, lang.gaps);
  const t = performance.now();
  const sl = Z.spurStuecke(FL, 2);
  const ms = performance.now() - t;
  const n = sl.reduce((a, s) => a + s.length, 0);
  check(`lange Fahrt: ${FL.n} → ${n} Punkte zum Zeichnen in ${ms.toFixed(0)} ms`, n < FL.n * 0.2 && ms < 300);
  check('Vorlage vereinfachen, kaputte Punkte raus', Z.vereinfacheLinie([[47, 15], 'x', [47.001, 15], [47.002, 15]]).length === 2 && Z.vereinfacheLinie(null).length === 0);
}

console.log('\n[7] Kaputte und alte Daten');
{
  let wirft = null;
  try {
    for (const t of [null, undefined, {}, 'x', [], [[]], [null], [[null, 'a', [1]]], [[[NaN, 1, 2]]], [[[47, 15.4, 'x']]]]) {
      const F = Z.fahrtDaten(t, START, null, [null, ['a', 'b'], [1, 2]]);
      Z.zeitMarken(F);
      Z.zeitleiste(F);
      Z.positionZu(F, Date.parse(START));
      Z.naechsterPunkt(F, 47, 15.4, 50);
      Z.vorbeifahrten(F, 47, 15.4, 50);
      Z.spurStuecke(F);
      R.buildSketch(null, t, [null, 'x'], 640, 360, [{ lat: NaN, lng: 1, label: 'x' }]);
    }
  } catch (e) {
    wirft = e;
  }
  check('Unsinn in track/gaps/missed wirft nie', wirft === null, String(wirft?.stack ?? wirft));
  const k = D.demoRun('demo-kaputt');
  const F = Z.fahrtDaten(k.track, k.started_at, k.ended_at, k.gaps);
  check('Beispiel „kaputt“: gültige Punkte bleiben (Karte), Zeiten aus (ein Punkt ohne sek)', F.n > 40 && !F.mitZeit);
  check('cleanTrack: Teilstücke ohne Müll, Sekunden bleiben', JSON.stringify(R.cleanTrack([[[47, 15, 3, 5], 'x', [47, 'y']], null, 5])) === '[[[47,15,3,5]]]');
  check('cleanGaps: nur lesbare Zeiten', JSON.stringify(R.cleanGaps([['2026-11-24T05:00:00Z', '2026-11-24T05:10:00Z'], ['x', 'y'], null, [1, 2]])) === '[["2026-11-24T05:00:00Z","2026-11-24T05:10:00Z"]]');
  const eins = D.demoRun('demo-ein-punkt');
  const E = Z.fahrtDaten(eins.track, eins.started_at, eins.ended_at, eins.gaps);
  check('1 Punkt: kein Absturz, keine Marken', E.n === 1 && Z.zeitMarken(E).length === 0 && Z.spurStuecke(E)[0].length === 1);
  check('ohne Punkte (nachgemeldet): leer', Z.fahrtDaten([], START).n === 0 && Z.naechsterPunkt(Z.fahrtDaten([], START), 47, 15, 99) === -1);
}

console.log('\n[8] Nachweis-PDF');
{
  const RR = await web('src/winterdex/routeReport.ts');
  const org = { id: 'o', name: 'Bauhof Musterstadt', land: 'AT', address: 'Hauptplatz 1', created_at: '2026-11-01T00:00:00Z' };
  const frei = D.demoRun('demo-frei');
  const html = RR.buildRunHtml(org, frei, W);
  check('Zeitleiste im PDF', /Zeitleiste — wann war das Fahrzeug wo \(alle (5|10|15|30) Min\.\)/.test(html));
  check('… zweispaltig ab 9 Zeilen', html.includes('class="zt-2"'));
  check('… Start 06:12 und Pause rot', html.includes('<td>06:12</td><td>0,0 km</td><td>Start</td>') && html.includes('<tr class="warn">'));
  const mk = Z.zeitMarken(Z.fahrtDaten(frei.track, frei.started_at, frei.ended_at, frei.gaps), { timeZone: W });
  check('Zeitmarken als Text in der Skizze', mk.filter((m) => html.includes(`>${m.label}</text>`)).length >= Math.min(4, mk.length), mk.map((m) => m.label).join(' '));
  check('Legende erklärt die Marken', html.includes('09:45 = Uhrzeit an dieser Stelle'));
  check('Marken-Text ohne Text-Rand (sonst doppelte Ziffern beim Kopieren aus dem PDF)', !/paint-order/.test(html) && /<rect [^>]*fill="#fff"/.test(html));
  const alt = RR.buildRunHtml(org, D.demoRun('demo-alt'), W);
  check('alte Fahrt ohne Sekunden: Bericht wie bisher (Skizze, keine Zeitleiste)', alt.includes('<svg') && !alt.includes('Zeitleiste') && !alt.includes('Uhrzeit an dieser Stelle'));
  check('nachgemeldet ohne Punkte: „Keine Kartenskizze“', RR.buildRunHtml(org, D.demoRun('demo-leer'), W).includes('Keine Kartenskizze'));
  let alle = true;
  for (const f of D.DEMO_FAHRTEN) {
    try {
      const h = RR.buildRunHtml(org, D.demoRun(f.id), W);
      if (!h.includes('Strecken-Nachweis Winterdienst')) alle = false;
    } catch (e) {
      alle = false;
      console.log('   ', f.id, e);
    }
  }
  check(`PDF entsteht für alle ${D.DEMO_FAHRTEN.length} Beispiel-Formen (auch kaputt/1 Punkt/8 Std.)`, alle);
  const vl = RR.buildRunHtml(org, D.demoRun('demo-vorlage'), W);
  check('Fahrt mit Vorlage: Abdeckung, nicht befahren und Zeitleiste', vl.includes('der Strecke abgedeckt') && vl.includes('Nicht befahren') && vl.includes('Zeitleiste'));
  const st = R.buildSketch(null, frei.track, null, 640, 360, mk);
  const lab = st.marks.filter((m) => m.lx != null).map((m) => [m.lx, m.ly, m.lx + m.label.length * 6.3 + 6, m.ly + 15]);
  check('Skizze: Beschriftungen überlappen nicht und bleiben im Bild', lab.every((a, i) => lab.every((b, j) => i === j || !(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]))) && lab.every((b) => b[0] >= 0 && b[2] <= 640 && b[1] >= 0 && b[3] <= 360));
}

console.log('\n[9] Quelltext');
{
  const rd = lies('src/winterdex/pages/RunDetail.tsx');
  const fa = lies('src/winterdex/FahrtAnsicht.tsx');
  const fk = lies('src/winterdex/FahrtKarte.tsx');
  const karte = lies('src/winterdex/aussendienst/Karte.tsx');
  check('Fahrt-Detail zeigt die FahrtAnsicht mit Zeiten und Lücken', /<FahrtAnsicht[\s\S]*?gaps=\{gaps\}[\s\S]*?startedAt=\{run\.started_at\}/.test(rd));
  check('Hinweis bei freier Fahrt (Vorlage optional)', rd.includes('Freie Fahrt reicht als Nachweis. Mit einer Strecken-Vorlage siehst du zusätzlich, wie viel der geplanten Strecke'));
  check('Strecke im Außendienst + Dashboard: echte Karte', /<FahrtAnsicht/.test(lies('src/winterdex/aussendienst/StreckeDetail.tsx')) && /<FahrtAnsicht/.test(lies('src/winterdex/pages/RouteDetail.tsx')));
  check('Skizze als Rückfall: Fehlergrenze, ohne Netz, Kachel-Fehler', /class Rueckfall/.test(fa) && /navigator\.onLine === false/.test(fa) && /onKachelFehler/.test(fa) && /<RouteSketch/.test(fa));
  check('Karte lazy (eigener Chunk)', /lazy\(\(\) => import\('\.\/FahrtKarte'\)\)/.test(fa));
  const tile = (s) => s.match(/TILE_URL = '([^']+)'/)?.[1];
  const attr = (s) => s.match(/ATTRIBUTION = '([^']+)'/)?.[1];
  check('gleiche Kacheln + Namensnennung wie die Außendienst-Karte', tile(fk) && tile(fk) === tile(karte) && attr(fk) === attr(karte));
  check('Rechnungen gemerkt (useMemo), nicht je Render', /useMemo\(\(\) => fahrtDaten\(/.test(fa) && /spurStuecke\(F\)/.test(fa));
  check('Regler mit Tastatur (±1/±10 Min.) und aria-valuetext', /ArrowRight/.test(fa) && /PageUp/.test(fa) && /aria-valuetext=/.test(fa));
  check('keine UTC-Tage (toISOString().slice) in den neuen Dateien', ![fa, fk, lies('src/winterdex/fahrtZeit.ts')].some((s) => /toISOString\(\)\.slice/.test(s)));
  check('Kundendaten nicht im Beispiel (nur Musterstadt)', !/Eggenburg/i.test(lies('src/winterdex/einsatz/demoFahrt.ts')));
  check('PDF: Zeitleiste und Marken eingebunden, Fehler stoppen den Bericht nie', /zeitTeile\(run, timeZone\)/.test(lies('src/winterdex/routeReport.ts')) && /catch \(e\)/.test(lies('src/winterdex/routeReport.ts')));
}

console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail === 0 ? 0 : 1);
