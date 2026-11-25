// WinterDex Tagescheck 26.11.2026 — Prüfbericht straßen- und zeitgenau (Dashboard). Ohne Browser, nur erfundene
// Beispiel-Fahrten (einsatz/demoFahrt.ts) bzw. nachgestellte Zeiten; keine Kundendaten, kein Netz.
//   [8]  PDF-Kartenbild: A/B/C-Felder nie über einer Uhrzeit (Felder vor den Schildern belegt)
//   [29] Start = Ende am Bauhof: Start obenauf (kleiner), Schild darunter
//   [9]  Start/Ende an der Karte = Zeit des Punkts (überall gleich), Zeitleiste erklärt Abweichungen
//   [10] PDF lädt den Straßenverlauf frisch; Nachladen auch beim Zurückwechseln in den Tab
//   [11] Spalte „Strecke“ ergibt die gefahrenen Meter (sonst aus der Spur nachgerechnet + Hinweis), Summenzeile
//   [v3] Straßenverlauf mit quelle osm-overpass / version 3
//   [30] Unterbrechung in derselben Minute: „05:10 (46 s)“ statt „05:10–05:10“
//   [31] Uhrzeiten in der Zone des Betriebs, nie in der des Geräts; Zone im PDF genannt
//   [22] Import merkt den Pro-Kauf ohne Neuladen   [36] erst zählen, dann Pro fragen   [45] eine ID je Formular
//
//   Aufruf:  node tests/bericht-2611.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Gerät absichtlich auf UTC: alle Nachweis-Uhrzeiten müssen trotzdem Wiener Zeit zeigen (Fund 31)
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
const R = await web('src/winterdex/routes.ts');
const NZ = await web('src/winterdex/nachweisZeit.ts');
const API = await web('src/winterdex/api.ts');
const FMT = await web('src/lib/format.ts');
const W = 'Europe/Vienna';
const orgAT = { id: 'o', name: 'Bauhof Musterstadt', land: 'AT', address: 'Hauptplatz 1', created_at: '2026-11-01T00:00:00Z' };
const ueber = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
// Arial fett 11 px: großzügig 6,6 px je Zeichen (im Browser misst ctx.measureText)
const breite = (t) => t.length * 6.6;

const bauhof = D.demoRun('demo-bauhof');
const FB = Z.fahrtDaten(bauhof.track, bauhof.started_at, bauhof.ended_at, bauhof.gaps);

console.log('\n[8] Kartenbild: Rahmen-Buchstaben nie über einer Uhrzeit');
{
  const kp = K.kartenPlan(FB, []);
  const marken = Z.zeitMarken(FB, { timeZone: W });
  const labels = Z.startEndeLabels(FB, W);
  const p = K.beschriftungsPlan(kp.uebersicht, FB, marken, labels, kp.ausschnitte, breite);
  const felder = p.rahmen.map((r) => r.feld);
  check(`Rundfahrt Bauhof: Übersicht Zoom ${kp.uebersicht.z} mit ${kp.ausschnitte.length} Ausschnitten (A–C)`, kp.uebersicht.z <= 15 && kp.ausschnitte.length === 3);
  check('kein Schild über einem Buchstabenfeld', p.schilder.every((s) => !felder.some((f) => ueber(s.box, f))), JSON.stringify(p.schilder.map((s) => [s.text, s.box])));
  check('keine zwei Schilder übereinander', p.schilder.every((s, i) => p.schilder.every((o, j) => i === j || !ueber(s.box, o.box))));
  check('kein Feld über Start-/Ende-Punkt', felder.every((f) => [p.start, p.ende].every((q) => !q || !ueber(f, [q[0] - 9, q[1] - 9, q[0] + 9, q[1] + 9]))));
  check('Start- und Ende-Schild stehen IMMER da, mit voller Uhrzeit „HH:MM“', p.schilder.some((s) => s.art === 'start' && /^Start \d\d:\d\d$/.test(s.text)) && p.schilder.some((s) => s.art === 'ende' && /^Ende \d\d:\d\d$/.test(s.text)));
  check('alle Schilder ganz im Bild', p.schilder.every((s) => s.box[0] >= 0 && s.box[1] >= 0 && s.box[2] <= kp.uebersicht.w && s.box[3] <= kp.uebersicht.h));
  check(
    `Zeitmarken: ${p.schilder.filter((s) => s.art === 'marke').length} beschriftet, ${p.ohneSchild.length} nur als Punkt (ohne Platz — nie verdeckt)`,
    p.schilder.filter((s) => s.art === 'marke').length + p.ohneSchild.length === marken.length && p.schilder.filter((s) => s.art === 'marke').length >= marken.length / 2,
  );
  // nachgestellt wie im echten Bericht: Rahmen-Ecke genau dort, wo das Ende-Schild sonst hinkäme
  const f = { z: 14, cx: 1000, cy: 1000, w: 700, h: 400 };
  const F1 = Z.fahrtDaten([[[0, 0, 0, 5], [0, 0, 60, 5]]], '2026-11-25T08:00:00Z', '2026-11-25T08:01:00Z');
  const [wx, wy] = K.weltPx(0, 0, 14);
  const ff = { ...f, cx: wx, cy: wy };
  const rahmen = [{ z: 17, cx: (wx + 40) * 8, cy: (wy - 6) * 8, w: 340, h: 250, buchstabe: 'A' }];
  const p2 = K.beschriftungsPlan(ff, F1, [], { startLabel: 'Start 09:00', endeLabel: 'Ende 09:01' }, rahmen, breite);
  check('nachgestellt: Rahmen über dem Schild-Platz → Feld weicht bzw. Schild weicht, nichts überdeckt', p2.schilder.length === 2 && p2.schilder.every((s) => !ueber(s.box, p2.rahmen[0].feld)), JSON.stringify(p2));
  // Ausschnitt: Buchstabe oben links ist belegt
  const a = kp.ausschnitte[0];
  const pa = K.beschriftungsPlan(a, FB, marken, labels, [], breite);
  check('Ausschnitt: Buchstabe oben links (0,0,24,24) bleibt frei', !!pa.feld && pa.schilder.every((s) => !ueber(s.box, pa.feld)));
  const kb = lies('src/winterdex/kartenBild.ts');
  const zeichne = kb.slice(kb.indexOf('function zeichne('));
  check('Zeichnen: Rahmen + Felder VOR den Schildern, Schilder zuletzt', zeichne.indexOf('for (const r of plan.rahmen)') > 0 && zeichne.indexOf('for (const r of plan.rahmen)') < zeichne.indexOf('for (const s of plan.schilder)'));
  check('weiter ausgewichene Schilder bekommen eine Führungslinie', K.fuehrung({ box: [20, 0, 60, 16], p: [0, 8] }).abstand === 20 && K.fuehrung({ box: [9, 0, 60, 16], p: [0, 8] }).abstand === 9 && /fuehrung\(s\)/.test(zeichne));
}

console.log('\n[29] Start = Ende am Bauhof');
{
  const kp = K.kartenPlan(FB, []);
  const p = K.beschriftungsPlan(kp.uebersicht, FB, [], Z.startEndeLabels(FB, W), kp.ausschnitte, breite);
  const st = p.schilder.find((s) => s.art === 'start');
  const en = p.schilder.find((s) => s.art === 'ende');
  check('erkannt: Start und Ende am selben Ort (25 m)', p.nah === true);
  check('Rundfahrt (Bauhof unten links neben dem Maßstab): beide Schilder da, getrennt, nicht über dem Maßstab', !!st && !!en && !ueber(st.box, en.box) && [st, en].every((s) => !ueber(s.box, [0, kp.uebersicht.h - 30, 176, kp.uebersicht.h])), JSON.stringify({ st: st?.box, en: en?.box }));
  // freie Fläche: Start-Schild unter den Punkt, Ende-Schild darüber (wie die Bildschirmkarte)
  const [wx, wy] = K.weltPx(47.07, 15.43, 15);
  const fx = { z: 15, cx: wx, cy: wy, w: 700, h: 400 };
  const Fn = Z.fahrtDaten([[[47.07, 15.43, 0, 5], [47.075, 15.44, 600, 5], [47.0701, 15.4302, 1200, 5]]], '2026-11-25T08:00:00Z', '2026-11-25T08:20:00Z');
  const pn = K.beschriftungsPlan(fx, Fn, [], Z.startEndeLabels(Fn, W), [], breite);
  const sn = pn.schilder.find((s) => s.art === 'start');
  const enn = pn.schilder.find((s) => s.art === 'ende');
  check('freie Fläche: Start-Schild unter dem Punkt, Ende-Schild darüber', pn.nah && sn.box[1] >= pn.start[1] && enn.box[3] <= pn.ende[1], JSON.stringify({ sn: sn?.box, enn: enn?.box, s: pn.start, e: pn.ende }));
  const kb = lies('src/winterdex/kartenBild.ts');
  check('Start-Punkt nach dem Ende-Punkt gezeichnet, kleiner bei „nah“', kb.indexOf('punkt(plan.start[0]') > kb.indexOf('punkt(plan.ende[0]') && /plan\.nah \? 4\.5 : 7/.test(kb));
  const weit = D.demoRun('demo-frei');
  const Fw = Z.fahrtDaten(weit.track, weit.started_at, weit.ended_at, weit.gaps);
  const pw = K.beschriftungsPlan(K.kartenPlan(Fw, []).uebersicht, Fw, [], Z.startEndeLabels(Fw, W), [], breite);
  check('Start und Ende weit auseinander → kein Sonderfall', pw.nah === false || Math.hypot(Fw.x[Fw.n - 1] - Fw.x[0], Fw.y[Fw.n - 1] - Fw.y[0]) < 60);
}

console.log('\n[9] Start/Ende-Uhrzeit überall gleich');
{
  // wie Fahrt 13.11.: Aufzeichnung endet 277 s nach dem letzten Punkt
  const start = '2026-11-13T07:52:22.000Z';
  const pts = [[47.07, 15.43, 0, 5], [47.0705, 15.4305, 200, 5], [47.071, 15.431, 373, 5]];
  const F = Z.fahrtDaten([pts], start, '2026-11-13T08:03:12.000Z');
  const l = Z.startEndeLabels(F, W);
  check('Karte: „Start 08:52“ / „Ende 08:58“ (Zeit des Punkts)', l.startLabel === 'Start 08:52' && l.endeLabel === 'Ende 08:58', JSON.stringify(l));
  const zl = Z.zeitleiste(F);
  const letzte = zl.find((z) => z.art === 'letzte');
  check('Zeitleiste: „Letzte genaue GPS-Position 08:58“ vor „Ende 09:03“', !!letzte && Z.fmtUhr(letzte.t, W) === '08:58' && Z.fmtUhr(zl.at(-1).t, W) === '09:03' && zl.at(-1).art === 'ende', JSON.stringify(zl.map((z) => [z.art, Z.fmtUhr(z.t, W)])));
  // wie Fahrt 21.11.: erster Punkt 56 s nach dem Start, aber in der nächsten Minute
  const F2 = Z.fahrtDaten([[[47.07, 15.43, 56, 5], [47.0702, 15.4302, 120, 5], [47.0704, 15.4304, 260, 5]]], '2026-11-21T04:09:50.000Z', '2026-11-21T04:14:18.000Z');
  const zl2 = Z.zeitleiste(F2);
  check('Zeitleiste: „Erste genaue GPS-Position 05:10“ auch unter 60 s, wenn die Minute abweicht', zl2.some((z) => z.art === 'erste' && Z.fmtUhr(z.t, W) === '05:10') && Z.startEndeLabels(F2, W).startLabel === 'Start 05:10');
  // gleiche Minute → keine Zusatzzeile
  const F3 = Z.fahrtDaten([[[47.07, 15.43, 5, 5], [47.0702, 15.4302, 120, 5]]], '2026-11-21T04:09:10.000Z', '2026-11-21T04:11:30.000Z');
  check('gleiche Minute, < 60 s → keine Zusatzzeilen', !Z.zeitleiste(F3).some((z) => z.art === 'erste' || z.art === 'letzte'));
  // Rest schon durch eine vermerkte Unterbrechung erklärt → keine doppelte Zeile
  const F4 = Z.fahrtDaten([pts], start, '2026-11-13T08:03:12.000Z', [['2026-11-13T07:58:40.000Z', '2026-11-13T08:03:00.000Z']]);
  check('Rest durch Unterbrechung erklärt → keine „Letzte genaue GPS-Position“', !Z.zeitleiste(F4).some((z) => z.art === 'letzte'));
  const fa = lies('src/winterdex/FahrtAnsicht.tsx');
  check('Fahrt-Detail benutzt dieselbe Regel (startEndeLabels), nicht mehr started_at/ended_at', /startEndeLabels\(F, tz, zeit\)/.test(fa) && !/`Start \$\{fmtUhr\(lo/.test(fa));
  check('Einzel-PDF und Fahrtenbuch ebenso', /startEndeLabels\(F, tz\)/.test(lies('src/winterdex/routeReport.ts')) && /startEndeLabels\(F, opts\.timeZone\)/.test(lies('src/winterdex/kartenBild.ts')));
  const html = RR.buildRunHtml(orgAT, D.demoRun('demo-bauhof'), undefined, {});
  check('PDF der Rundfahrt: Zeitleiste mit „Erste/Letzte genaue GPS-Position“', html.includes('Erste genaue GPS-Position') && html.includes('Letzte genaue GPS-Position'));
}

console.log('\n[10] Straßenverlauf frisch fürs PDF');
{
  const fertig = { status: 'fertig', abschnitte: [{ sek_von: 0, sek_bis: 60, strasse: 'Hauptstraße', ort: 'Musterstadt', m: 100 }], quelle: 'osm-overpass' };
  check('frisch geladen → neuer Stand', (await S.strassenFrisch(async () => fertig, 500))?.status === 'fertig');
  check('Lesefehler („fehlt“) → null (bisheriger Stand bleibt)', (await S.strassenFrisch(async () => ({ status: 'fehlt', abschnitte: [], quelle: null }), 500)) === null);
  check('Fehler → null', (await S.strassenFrisch(async () => { throw new Error('Netz'); }, 500)) === null);
  const t0 = Date.now();
  check('hängt der Server → nach der Frist null (PDF wartet nicht ewig)', (await S.strassenFrisch(() => new Promise(() => {}), 300)) === null && Date.now() - t0 < 1500);
  const rd = lies('src/winterdex/pages/RunDetail.tsx');
  check('Fahrt-Detail: PDF-Knopf lädt den Straßenverlauf frisch (≤ 3 s) und zeigt ihn dann auch an', /strassenFrisch\(ladeStrassen, 3000\)/.test(rd) && /setFrisch\(/.test(rd) && /ladeStrassen=\{\(\) => fetchStrassen\(client, id!\)\}/.test(rd));
  const nl = lies('src/winterdex/strassenNachladen.ts');
  check('Nachladen auch beim Zurückwechseln in den Tab (nach den 10 Minuten)', /visibilitychange/.test(nl) && /addEventListener\('focus'/.test(nl));
}

console.log('\n[11] Spalte „Strecke“ = gefahrene Meter');
{
  const run = D.demoRun('demo-bauhof');
  const v3 = S.strassenStandAus(D.demoStrassen('demo-bauhof'));
  const a = S.strassenAnzeige(v3, run, true, { F: FB, gefahrenM: run.track_length_m });
  check(`Verfahren 3: Server-Meter stimmen (Σ ${Math.round(a.summeM)} m = ${Math.round(a.gesamtM)} m), bleiben unverändert`, a.art === 'tabelle' && !a.mAusSpur && !a.abweichung && Math.abs(a.summeM - a.gesamtM) < 0.02 * a.gesamtM);
  const alt = S.strassenStandAus(D.demoStrassen('demo-bauhof', { meterAlt: true }));
  const b = S.strassenAnzeige(alt, run, true, { F: FB, gefahrenM: run.track_length_m });
  const altSumme = alt.abschnitte.reduce((x, y) => x + y.m, 0);
  check(`alter Worker (Σ ${altSumme} m, −20 %): Meter aus der Spur nachgerechnet → Σ ${Math.round(b.summeM)} m ≈ ${Math.round(b.gesamtM)} m`, b.mAusSpur && !b.abweichung && Math.abs(b.summeM - b.gesamtM) <= Math.max(0.02 * b.gesamtM, 10));
  check('… und sagt das in der Fußnote', /aus der GPS-Spur im Zeitraum der Zeile berechnet/.test(S.strassenMeterHinweis(b)));
  // Zeilen decken nur einen Teil der Fahrt → Hinweis, dass der Rest ohne Straßenzuordnung ist
  const teil = { ...v3, abschnitte: v3.abschnitte.slice(0, 3) };
  const c = S.strassenAnzeige(teil, run, true, { F: FB, gefahrenM: run.track_length_m });
  check('Lücke zwischen den Zeilen → Hinweis „Rest auf Wegstücken ohne Straßenzuordnung“', c.abweichung && /ohne Straßenzuordnung/.test(S.strassenMeterHinweis(c)), S.strassenMeterHinweis(c));
  check('ohne Spur (z. B. Fahrtenbuch ohne geladene Punkte) → Server-Meter, kein Fehler', S.strassenAnzeige(alt, run, true).mAusSpur === false);
  // Prüfer 26.11.: ohne Spur + altes Verfahren → ehrlicher Grund (alter Wegzähler), NICHT „Wegstücke ohne Straßenzuordnung“
  const ohneSpur = S.strassenAnzeige({ ...alt, quelle: 'osm-nominatim' }, run, true, { gefahrenM: run.track_length_m });
  const hOhne = S.strassenMeterHinweis(ohneSpur);
  check('ohne Spur, altes Verfahren, Σ −20 %: Hinweis „bisheriges Verfahren … maßgeblich laut GPS“, nicht „ohne Straßenzuordnung“', ohneSpur.abweichung && /bisherigen Verfahren/.test(hOhne) && /maßgeblich ist die gefahrene Strecke laut GPS/.test(hOhne) && !/ohne Straßenzuordnung/.test(hOhne), hOhne);
  const zuViel = S.strassenMeterHinweis({ mAusSpur: true, abweichung: true, summeM: 1200, gesamtM: 1000, quelle: 'osm-overpass' });
  check('Summe ÜBER den gefahrenen Metern: kein „der Rest …“', !/der Rest/.test(zuViel) && /maßgeblich/.test(zuViel), zuViel);
  check('2-%-Regel: über 2 % und mehr als 10 m', S.meterWeichenAb(12000, 13510) && !S.meterWeichenAb(13300, 13510) && !S.meterWeichenAb(5, 12) && S.meterWeichenAb(0, 11));
  // Verfahren 1/2 (Nominatim, 20-m-Zähler): Summe nur −2,0 %, einzelne Zeilen aber bis −32 % (echte Fahrt 25.11.) →
  // bei altem Verfahren IMMER aus der Spur rechnen, auch wenn die Summe knapp passt
  const knapp = { ...v3, quelle: 'osm-nominatim', abschnitte: v3.abschnitte.map((x, i) => ({ ...x, m: i === 0 ? Math.round(x.m * 0.68) : x.m })) };
  const d = S.strassenAnzeige(knapp, run, true, { F: FB, gefahrenM: run.track_length_m });
  check('altes Verfahren (Nominatim): Zeilen immer aus der Spur, auch wenn die Summe < 2 % abweicht', d.mAusSpur && Math.abs(d.zeilen[0].m - v3.abschnitte[0].m) <= 2, `${d.zeilen[0].m} vs ${v3.abschnitte[0].m}`);
  const knapp3 = { ...knapp, quelle: 'osm-overpass' };
  check('Verfahren 3 (Overpass) mit < 2 % Abweichung: Server-Meter bleiben', !S.strassenAnzeige(knapp3, run, true, { F: FB, gefahrenM: run.track_length_m }).mAusSpur);
  const html = RR.buildRunHtml(orgAT, run, undefined, { strassen: alt });
  check('PDF: Summenzeile „zusammen … (gefahren laut GPS: …)“ + Hinweis', /<tr class="summe"><td colspan="3">zusammen \(gefahren laut GPS: [\d,]+ km\)<\/td><td class="r">[\d,]+ km<\/td><\/tr>/.test(html) && html.includes('aus der GPS-Spur im Zeitraum der Zeile berechnet'));
  const fa = lies('src/winterdex/FahrtAnsicht.tsx');
  check('Fahrt-Detail: Summenzeile und gleiche Rechnung (gefahrenM, F)', /fk-summe/.test(fa) && /strassenAnzeige\([^)]*\{ F, gefahrenM: props\.gefahrenM \}\)/.test(fa) && /gefahrenM=\{run\.track_length_m\}/.test(lies('src/winterdex/pages/RunDetail.tsx')));
}

console.log('\n[v3] Straßenverlauf mit quelle osm-overpass / version 3');
{
  const zeile = { run_id: 'r', status: 'fertig', quelle: 'osm-overpass', version: 3, abschnitte: [{ sek_von: 0, sek_bis: 120, strasse: 'Wiener Straße', ort: 'Musterstadt', m: 400, ref: 'B4', osm_id: 123 }] };
  const st = S.strassenStandAus(zeile);
  check('Zeile Verfahren 3 wird gelesen (unbekannte Felder egal)', st.status === 'fertig' && st.quelle === 'osm-overpass' && st.abschnitte.length === 1 && st.abschnitte[0].strasse === 'Wiener Straße');
  check('Verfahren-Text Overpass ≠ Nominatim, Quellenangabe gleich', /per Kartenabgleich jedem GPS-Punkt die passende Straße aus den OpenStreetMap-Straßendaten/.test(S.strassenMethode('osm-overpass')) && !/nächstgelegene/.test(S.strassenMethode('osm-overpass')) && /Stichproben/.test(S.strassenMethode('osm-nominatim')) && S.STRASSEN_QUELLE === '© OpenStreetMap-Mitwirkende');
  const html = RR.buildRunHtml(orgAT, D.demoRun('demo-bauhof'), undefined, { strassen: S.strassenStandAus(D.demoStrassen('demo-bauhof')) });
  check('PDF: Quellenangabe „© OpenStreetMap-Mitwirkende“, Verfahren 3 beschrieben, keine falsche „Abtastung alle 200 m“', html.includes('Straßennamen: © OpenStreetMap-Mitwirkende (ODbL), nach der Fahrt per Kartenabgleich jedem GPS-Punkt die passende Straße') && !html.includes('Abtastung etwa alle 200 m') && !/overpass|nominatim/i.test(html.replace(/https?:\/\/[^"]+/g, '')));
  const fa = lies('src/winterdex/FahrtAnsicht.tsx');
  check('Fahrt-Detail: Verfahren je Quelle', /strassenMethode\(strTab\.quelle\)/.test(fa));
}

console.log('\n[30] Unterbrechung in derselben Minute');
{
  check('fmtSpanne: „05:10 (46 s)“ statt „05:10–05:10“', Z.fmtSpanne(Date.parse('2026-11-21T04:10:00.824Z'), Date.parse('2026-11-21T04:10:46.876Z'), W) === '05:10 (46 s)');
  check('fmtSpanne: verschiedene Minuten „05:10–05:12“', Z.fmtSpanne(Date.parse('2026-11-21T04:10:00Z'), Date.parse('2026-11-21T04:12:10Z'), W) === '05:10–05:12');
  check('fmtTimeSpan (Warnkasten, Kopf): „05:10 Uhr (46 s)“', R.fmtTimeSpan('2026-11-21T04:10:00.824Z', '2026-11-21T04:10:46.876Z', W) === '05:10 Uhr (46 s)');
  const html = RR.buildRunHtml(orgAT, D.demoRun('demo-bauhof'));
  check('PDF der Rundfahrt (46-s-Lücke): nirgends „hh:mm–hh:mm“ mit gleicher Uhrzeit', !/(\d\d:\d\d)–\1(?!\d)/.test(html) && /\d\d:\d\d \(46 s\)/.test(html), html.match(/(\d\d:\d\d)–\1/)?.[0]);
  const F = Z.fahrtDaten([[[47.07, 15.43, 0, 5], [47.0702, 15.4302, 10, 5]], [[47.0704, 15.4304, 57, 5], [47.0706, 15.4306, 80, 5]]], '2026-11-21T04:09:50.000Z', '2026-11-21T04:11:20.000Z', [['2026-11-21T04:10:00.824Z', '2026-11-21T04:10:46.876Z']]);
  const info = Z.infoZuZeit(F, Date.parse('2026-11-21T04:10:20Z'), W);
  check('Regler in der Lücke: „05:10 (46 s) Uhr: Pause …“', /^05:10 \(46 s\) Uhr: Pause/.test(info?.zusatz ?? ''), info?.zusatz);
  for (const [f, re] of [['src/winterdex/FahrtAnsicht.tsx', /fmtSpanne\(z\.t, z\.bis, tz\)/], ['src/winterdex/FahrtKarte.tsx', /fmtSpanne\(u\.von, u\.bis, timeZone\)/], ['src/winterdex/routeReport.ts', /fmtSpanne\(z\.t, z\.bis, timeZone\)/]])
    check(`${path.basename(f)}: gemeinsame Formatierung`, re.test(lies(f)) && !/–\$\{fmtUhr\(/.test(lies(f)));
}

console.log('\n[31] Uhrzeiten in der Zone des Betriebs (Gerät hier auf UTC)');
{
  check('Testgerät wirklich auf UTC', new Date('2026-11-25T08:32:00Z').getHours() === 8);
  check('Zone je Land: AT Wien, DE Berlin, CH Zürich, sonst Wien', NZ.nachweisZone('AT') === 'Europe/Vienna' && NZ.nachweisZone('DE') === 'Europe/Berlin' && NZ.nachweisZone('CH') === 'Europe/Zurich' && NZ.nachweisZone(null) === 'Europe/Vienna');
  const run = { ...D.demoRun('demo-frei') };
  const html = RR.buildRunHtml(orgAT, run, undefined, { strassen: S.strassenStandAus(D.demoStrassen('demo-frei')) });
  check('Einzel-PDF ohne Zonen-Angabe: Kopf, Zeitleiste, Straßen in Wiener Zeit (06:12), nicht Gerät (05:12)', html.includes('24.11.2026, 06:12–') && html.includes('<td>06:12</td><td>0,0 km</td>') && /<tr><td>06:12–06:2\d<\/td>/.test(html) && !html.includes('05:12'));
  check('PDF nennt die Zone: „Alle Uhrzeiten in Ortszeit Österreich (Europe/Vienna, MEZ = UTC+1)“', html.includes('Alle Uhrzeiten in Ortszeit Österreich (Europe/Vienna, MEZ = UTC+1)'));
  const sz = D.demoRun('demo-sommerzeit');
  check('über die Zeitumstellung: „MESZ = UTC+2 bzw. MEZ = UTC+1“', NZ.zonenHinweis(W, 'AT', [Date.parse(sz.started_at), Date.parse(sz.ended_at)]).includes('MESZ = UTC+2 bzw. MEZ = UTC+1'));
  check('Nachtfahrt 23:25–00:30 auf UTC-Gerät: Tag und Uhrzeit in derselben Zone', R.fmtTimeSpan('2026-11-22T22:25:00Z', '2026-11-22T23:30:00Z', W) === '23:25–23.11., 00:30 Uhr', R.fmtTimeSpan('2026-11-22T22:25:00Z', '2026-11-22T23:30:00Z', W));
  check('lib/format mit Zone', FMT.fmtDateTime('2026-11-25T08:32:00Z', W) === '25.11.2026, 09:32 Uhr' && FMT.fmtTime('2026-11-25T08:32:00Z', W) === '09:32 Uhr' && FMT.fmtDate('2026-11-24T23:30:00Z', W) === '25.11.2026');
  check('lib/format ohne Zone wie bisher (Gerät)', FMT.fmtTime('2026-11-25T08:32:00Z') === '08:32 Uhr');
  const buch = RR.buildRouteLogHtml({ ...orgAT, land: 'DE' }, { id: 'r', name: 'Runde', path: null, length_m: 1000 }, [D.demoRun('demo-frei')], 'Nov.');
  check('Fahrtenbuch: Zone des Betriebs (DE → Berlin) + Hinweis', buch.includes('24.11.2026<br>06:12–') && buch.includes('Ortszeit Deutschland (Europe/Berlin'));
  const rd = lies('src/winterdex/pages/RunDetail.tsx');
  check('Fahrt-Detail: Zone an Karte, Kopf, Warnkasten, PDF', /const tz = nachweisZone\(org\?\.land\)/.test(rd) && /timeZone=\{tz\}/.test(rd) && /fmtTimeSpan\(a, b, tz\)/.test(rd) && /buildRunHtmlMitKarte\(org, run, str, \{ timeZone: tz \}\)/.test(rd));
  for (const f of ['src/winterdex/pages/RouteDetail.tsx', 'src/winterdex/aussendienst/StreckeDetail.tsx'])
    check(`${path.basename(f)}: Karte mit Zone des Betriebs`, /timeZone=\{tz\}/.test(lies(f)) && /nachweisZone\(/.test(lies(f)));
  const fk = lies('src/winterdex/FahrtKarte.tsx');
  check('Karte: Tooltips mit Zone', /infoZuPunkt\(F, i, zeitAn, timeZone\)/.test(fk) && !/fmtUhr\(/.test(fk));
  const fa = lies('src/winterdex/FahrtAnsicht.tsx');
  check('Fahrt-Ansicht: keine Uhrzeit ohne Zone', !/fmtUhr\([^,()]+\)/.test(fa) && /infoZuZeit\(F, t, tz\)/.test(fa));
}

console.log('\n[22] Import merkt den Pro-Kauf ohne Neuladen');
{
  const im = lies('src/winterdex/pages/PropertyImport.tsx');
  check('zurück in den Tab → Objektliste + Pro frisch', /addEventListener\('visibilitychange', zurueck\)/.test(im) && /addEventListener\('focus', zurueck\)/.test(im) && /refresh\(\);/.test(im));
  check('Knopf „Pro schon abgeschlossen? Neu prüfen“ (frische Server-Abfrage)', im.includes('Pro schon abgeschlossen? Neu prüfen') && /orgProStand\(client, true\)/.test(im));
  check('„Anlegen“ bei 0 im Gratis-Rahmen nicht gesperrt — run() entscheidet mit frischem Pro', /disabled=\{!!phase \|\| selectedCount === 0\}/.test(im) && !/disabled=\{!!phase \|\| toCreate === 0\}/.test(im) && /if \(!plan \|\| phase \|\| selectedCount === 0\) return;/.test(im));
  check('nach dem Gratis-Import bleibt der Knopf, solange Zeilen angehakt sind', /doneNothingLeft = !!result && result\.created > 0 && selectedCount === 0/.test(im));
}

console.log('\n[36] Erst zählen, dann Pro fragen');
{
  const im = lies('src/winterdex/pages/PropertyImport.tsx');
  check('Import: Pro nur, wenn aktive + neue > Gratis-Grenze', !/Promise\.all\(\[fetchProperties\(client\), orgProFuerGrenze\(client\)\]\)/.test(im) && /> FREE_PROPERTIES \? await orgProFuerGrenze\(client\) : false/.test(im));
  for (const f of ['src/winterdex/aussendienst/StreckeFahren.tsx', 'src/winterdex/aussendienst/StreckeDetail.tsx']) {
    const s = lies(f);
    check(`${path.basename(f)}: Strecken zählen, isPro() nur über der Grenze`, !/Promise\.all\(\[be\.listRoutes\(\), be\.isPro\(\)\]\)/.test(s) && />= FREE_ROUTES && !\(await be\.isPro\(\)\)/.test(s));
  }
  // Fachlich: finalRows mit pro=false unter der Grenze legt alles an (die Pro-Frage war nie nötig)
  const IO = await web('src/winterdex/importObjects.ts');
  const plan = { rows: [{ i: 0, line: 2, name: 'A', address: 'Weg 1, 8010 Graz', status: 'ok', input: { name: 'A' } }] };
  const r = IO.finalRows(plan, new Set([0]), [], false);
  check('0 aktive + 1 neues ohne Pro → wird angelegt', r.rows.length === 1 && r.overLimit === 0);
}

console.log('\n[45] Eine Kennung je Formular (Regel 1 zu App 737a926)');
{
  const neu = API.neuesObjekt();
  const input = { name: 'X', address: 'Weg 1', customer_name: null, customer_contact: null, areas: null, duty_times: { mo_fr: '', sa: '', so: '' }, notes: null, active: true };
  const a = API.propertyRow('org', input, undefined, null, neu);
  const b = API.propertyRow('org', input, undefined, null, neu);
  check('zwei Speicherversuche → dieselbe Zeile (id + created_at)', a.id === neu.id && b.id === neu.id && a.created_at === b.created_at);
  check('ohne feste Kennung (Import) wie bisher je Zeile neu', API.propertyRow('org', input).id !== API.propertyRow('org', input).id);
  const dlg = lies('src/winterdex/dialogs.tsx');
  check('Dialog: Kennung einmal je Dialog, eigene nie mitgezählt, an saveProperty übergeben', /useState\(neuesObjekt\)/.test(dlg) && /p\.active && p\.id !== eigeneId/.test(dlg) && /property === 'new' \? neu : undefined/.test(dlg));
  // Regel 1: ObjektDex-Dashboard hatte dasselbe Muster (insert ohne Kennung)
  const OD = await web('src/objektdex/demo.ts');
  const store = OD.createDemoStore({ pro: true });
  const vorher = (await store.data.listProperties()).length;
  const p = { neu_id: 'feste-id-1', name: 'Doppelt?', address: 'Weg 2', customer_name: null, customer_contact: null, contact_person: null, notes: null };
  await store.data.saveProperty(p);
  await store.data.saveProperty(p);
  check('ObjektDex: zweimal speichern mit derselben Kennung → ein Objekt', (await store.data.listProperties()).length === vorher + 1);
  const odData = lies('src/objektdex/data.ts');
  const odDlg = lies('src/objektdex/pages/PropertyDetail.tsx');
  check('ObjektDex: Upsert mit fester Kennung, Grenze ohne eigene Kennung', /upsert\(\{ \.\.\.row, org_id: orgId, id: p\.neu_id \}\)/.test(odData) && /grenzePruefen\(data, neuId\)/.test(odDlg) && /p\.id !== eigeneId/.test(odDlg));
}

console.log('\n[16] Zeile „Unterbrechungen der Aufzeichnung“ = Grenzen der Zeitleiste (App-Rechnung, Regel 1)');
{
  // Pause 10:02:30–10:34:00 UTC vermerkt, erster Punkt danach aber schon 10:33:00 (zwischengespeicherte Position)
  const basis = D.demoRun('demo-bauhof');
  const run = {
    ...basis,
    started_at: '2026-11-25T10:00:00Z',
    ended_at: '2026-11-25T10:35:00Z',
    track: [
      [[48.0, 16.0, 0], [48.0005, 16.0, 60], [48.001, 16.0, 120]],
      [[48.002, 16.0, 1980], [48.0025, 16.0, 2040], [48.003, 16.0, 2100]],
    ],
    gaps: [['2026-11-25T10:02:30Z', '2026-11-25T10:34:00Z']],
  };
  const F = Z.fahrtDaten(run.track, run.started_at, run.ended_at, run.gaps);
  const u = RR.unterbrechungenFuer(run, F);
  check('Ende auf den ersten Punkt danach begrenzt (10:33:00 statt 10:34:00)', u.length === 1 && u[0][0] === '2026-11-25T10:02:30.000Z' && u[0][1] === '2026-11-25T10:33:00.000Z', JSON.stringify(u));
  check('ohne Punkt-Zeiten / ohne F: rohe gaps', RR.unterbrechungenFuer(run, null).length === 1 && RR.unterbrechungenFuer(run, null)[0][1] === '2026-11-25T10:34:00Z');
  check('ohne vermerkte gaps: nichts', RR.unterbrechungenFuer({ ...run, gaps: [] }, F).length === 0);
  const html = RR.buildRunHtml(orgAT, run, undefined, {});
  const zeile = (html.match(/Unterbrechungen der Aufzeichnung \(Pause oder kein GPS\): ([^<]*)</) ?? [])[1] ?? '';
  check('PDF-Zeile: 11:02–11:33 (Wien), nicht bis 11:34', /11:02/.test(zeile) && /11:33/.test(zeile) && !/11:34/.test(zeile), zeile);
  const rd = lies('src/winterdex/pages/RunDetail.tsx');
  check('Fahrt-Detail: gleiche Zeile über unterbrechungenFuer', /unterbrechungenFuer\(run, F\)/.test(rd) && !/cleanGaps\(run\.gaps\)/.test(rd));
}

console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail === 0 ? 0 : 1);
