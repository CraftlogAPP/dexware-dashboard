// Klick-Test „Prüfbericht straßen- und zeitgenau“ (Tagescheck 26.11.2026) in Edge headless — NUR erfundene
// Beispiel-Fahrten (?demo, src/winterdex/einsatz/demoFahrt.ts), nie echte Server/Kundendaten.
// Der Browser läuft absichtlich in der Zeitzone UTC (wie ein falsch eingestellter PC): alle Uhrzeiten müssen trotzdem
// in Wiener Zeit erscheinen.
//   F: Fahrt-Detail Rundfahrt Bauhof — Karte „Start/Ende“ = Zeit des Punkts, Zeitleiste mit „Erste/Letzte genaue
//      GPS-Position“ und „10:13 (46 s)“, Straßenverlauf mit Summenzeile + Verfahren 3, Uhrzeiten in Wiener Zeit
//   G: PDF Rundfahrt Bauhof — Kartenbild mit A/B/C, KEIN Schild über einem Buchstabenfeld (gemessen mit der echten
//      Schrift), Start/Ende-Uhrzeit vollständig, Zone genannt, Summenzeile; PDF + Bilder im Ausgabe-Ordner
//   H: „wird ermittelt“ auf der Seite, Server inzwischen fertig → PDF-Knopf lädt frisch: Tabelle im PDF + auf der Seite
//   I: Meter wie der alte Worker (−20 %) → PDF rechnet aus der Spur, Fußnote sagt es
//
//   npx vite --port 5241 --strictPort
//   node tests/browser/bericht-2611-klick.mjs http://localhost:5241 <ausgabe-ordner>
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [base = 'http://localhost:5241', aus = path.join(tmpdir(), 'bericht-2611-klick')] = process.argv.slice(2);
mkdirSync(aus, { recursive: true });
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(path.join(tmpdir(), 'edge-b26-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || extra === '' ? '' : '  → ' + String(extra).slice(0, 400)}`);
};

async function verbinde(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const waiting = new Map();
  const handler = new Set();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) {
      waiting.get(d.id)(d);
      waiting.delete(d.id);
    } else if (d.method) for (const h of handler) h(d);
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      waiting.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async (expression, userGesture = false) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture });
    if (r.result?.exceptionDetails) throw new Error(`Seitenfehler: ${JSON.stringify(r.result.exceptionDetails).slice(0, 400)}`);
    return r.result?.result?.value;
  };
  return { ws, send, ev, handler };
}
const ziele = async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');

let main;
const seitenFehler = [];
async function oeffne(url, breite = 1280, hoehe = 900) {
  await main.send('Emulation.setDeviceMetricsOverride', { width: breite, height: hoehe, deviceScaleFactor: 1, mobile: breite < 600 });
  seitenFehler.length = 0;
  await main.send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    await sleep(150);
    if ((await main.ev('document.readyState')) === 'complete') break;
  }
}
async function warteAuf(js, ms = 15000) {
  for (let t = 0; t < ms; t += 150) {
    if (await main.ev(js)) return true;
    await sleep(150);
  }
  return false;
}
async function bild(datei) {
  await sleep(400);
  const shot = await main.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(path.join(aus, datei), Buffer.from(shot.result.data, 'base64'));
  return path.join(aus, datei);
}
const DEMO = (id, q = '') => `${base}/app/winterdex/fahrten-demo/${id}?demo${q}`;
const fehlerOhneKacheln = () => seitenFehler.filter((f) => !/tile\.openstreetmap|ERR_|net::|Failed to load resource|Kartenbild|Kartenausschnitt|Kartenbilder/i.test(f));

async function bericht(knopfText, ms = 20000) {
  await main.ev(
    `(() => { window.__html = ''; window.open = () => ({ document: { open() {}, write(h) { window.__html += h; }, close() {}, readyState: 'complete' }, print() {}, addEventListener() {}, close() {}, closed: false }); return true; })()`,
  );
  await warteAuf(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes(${JSON.stringify(knopfText)}))`, 15000);
  await main.ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(knopfText)})).click()`, true);
  const fertig = await warteAuf(`/(Strecken-Nachweis Winterdienst|Fahrtenbuch Winterdienst)[\\s\\S]*Erstellt am/.test(window.__html)`, ms);
  const html = fertig ? await main.ev('window.__html') : '';
  return html.slice(html.lastIndexOf('<!doctype html>'));
}
async function alsPdf(html, name) {
  writeFileSync(path.join(aus, `${name}.html`), html);
  const t = await main.send('Target.createTarget', { url: 'about:blank' });
  const pop = await verbinde((await ziele()).find((x) => x.id === t.result.targetId).webSocketDebuggerUrl);
  await pop.send('Page.enable');
  const fr = await pop.send('Page.getFrameTree');
  await pop.send('Page.setDocumentContent', { frameId: fr.result.frameTree.frame.id, html });
  await sleep(800);
  const pdf = await pop.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  const buf = Buffer.from(pdf.result.data, 'base64');
  writeFileSync(path.join(aus, `${name}.pdf`), buf);
  await pop.send('Emulation.setDeviceMetricsOverride', { width: 794, height: 1123, deviceScaleFactor: 1, mobile: false });
  const shot = await pop.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(path.join(aus, `${name}-ansicht.png`), Buffer.from(shot.result.data, 'base64'));
  await pop.send('Page.close').catch(() => {});
  pop.ws.close();
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      target = (await ziele())[0];
    } catch {
      /* noch nicht bereit */
    }
  }
  if (!target) throw new Error('Edge nicht erreichbar');
  main = await verbinde(target.webSocketDebuggerUrl);
  await main.send('Page.enable');
  await main.send('Runtime.enable');
  // falsch eingestellter PC: Browser auf UTC
  await main.send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
  main.handler.add((d) => {
    if (d.method === 'Runtime.exceptionThrown') seitenFehler.push(d.params.exceptionDetails?.exception?.description ?? d.params.exceptionDetails?.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') seitenFehler.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });

  // ------------------------------------------------------------------ F: Fahrt-Detail
  console.log('\nF: Fahrt-Detail Rundfahrt Bauhof (Browser auf UTC)');
  await oeffne(DEMO('demo-bauhof'));
  check('Browser wirklich auf UTC', (await main.ev(`new Date('2026-11-25T08:32:00Z').getHours()`)) === 8);
  check('Karte geladen', await warteAuf(`!!document.querySelector('.fk-map.leaflet-container')`));
  const kopf = await main.ev(`document.querySelector('p.muted')?.textContent ?? ''`);
  check(`Kopf in Wiener Zeit: „${kopf.slice(0, 30)}“`, /^09:32–10:35 Uhr/.test(kopf), kopf);
  check('Karte: „Start 09:33“ / „Ende 10:31“ (Zeit des ersten/letzten GPS-Punkts)', await warteAuf(`[...document.querySelectorAll('.fk-se')].map((e) => e.textContent).sort().join('|') === 'Ende 10:31|Start 09:33'`, 5000), await main.ev(`[...document.querySelectorAll('.fk-se')].map((e) => e.textContent).join('|')`));
  await main.ev(`document.querySelector('.fk-zeitleiste summary').click()`);
  const zl = await main.ev(`[...document.querySelectorAll('.fk-zeitleiste tbody tr')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim())`);
  check('Zeitleiste: Start 09:32 · Erste genaue GPS-Position 09:33', zl.some((z) => /^09:32 0,0 km .*Start$/.test(z)) && zl.some((z) => /^09:33 0,0 km .*Erste genaue GPS-Position$/.test(z)), zl.slice(0, 3).join(' / '));
  check('Zeitleiste: Letzte genaue GPS-Position 10:31 · Ende 10:35', zl.some((z) => /^10:31 .*Letzte genaue GPS-Position$/.test(z)) && /^10:35 .*Ende$/.test(zl.at(-1)), zl.slice(-3).join(' / '));
  check('Zeitleiste: kurze Lücke „10:13 (46 s)“, nirgends „hh:mm–hh:mm“ mit gleicher Zeit', zl.some((z) => /^10:13 \(46 s\) /.test(z)) && !zl.some((z) => /^(\d\d:\d\d)–\1/.test(z)), zl.filter((z) => /Unterbrechung/.test(z)).join(' / '));
  const summe = await main.ev(`document.querySelector('.fk-strassen tr.fk-summe')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''`);
  check(`Straßenverlauf: Summenzeile „${summe}“`, /^zusammen \(gefahren laut GPS: 13,8 km\) 13,8 km$/.test(summe), summe);
  const quelle = await main.ev(`document.querySelector('.fk-strassen-quelle')?.textContent ?? ''`);
  check('Verfahren 3: „© OpenStreetMap-Mitwirkende — nach der Fahrt per Kartenabgleich jedem GPS-Punkt die passende Straße …“', /© OpenStreetMap-Mitwirkende — nach der Fahrt per Kartenabgleich jedem GPS-Punkt die passende Straße/.test(quelle) && !/overpass|nominatim/i.test(quelle), quelle);
  const ersteZeile = await main.ev(`document.querySelector('.fk-strassen tbody tr')?.innerText.replace(/\\s+/g, ' ').trim()`);
  check(`Straßenverlauf in Wiener Zeit: „${ersteZeile}“`, /^09:33–09:3\d Hauptstraße Musterstadt/.test(ersteZeile), ersteZeile);
  console.log('  Bild:', await bild('F-detail-bauhof.png'));
  check('keine Seitenfehler', fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));

  // ------------------------------------------------------------------ G: PDF mit A/B/C-Rahmen
  console.log('\nG: PDF Rundfahrt Bauhof — A/B/C-Rahmen ohne verdeckte Uhrzeiten');
  {
    const html = await bericht('Nachweis als PDF');
    check('PDF mit echtem Kartenbild + Ausschnitten A–C', html.includes('<figure class="karte"><img src="data:image/jpeg') && /<b>Ausschnitt C<\/b>/.test(html));
    check('PDF: Kopf 09:32–10:35, Zone „Alle Uhrzeiten in Ortszeit Österreich (Europe/Vienna, MEZ = UTC+1)“', html.includes('25.11.2026, 09:32–10:35 Uhr') && html.includes('Alle Uhrzeiten in Ortszeit Österreich (Europe/Vienna, MEZ = UTC+1)'));
    check('PDF: Summenzeile + „Erste/Letzte genaue GPS-Position“ + „10:13 (46 s)“', html.includes('<tr class="summe">') && html.includes('Erste genaue GPS-Position') && html.includes('Letzte genaue GPS-Position') && html.includes('10:13 (46 s)'));
    check('PDF: nirgends „hh:mm–hh:mm“ mit gleicher Uhrzeit', !/(\d\d:\d\d)–\1(?!\d)/.test(html), html.match(/(\d\d:\d\d)–\1/)?.[0]);
    const seiten = html ? await alsPdf(html, 'G-bauhof') : 0;
    check(`PDF erzeugt (${seiten} Seiten A4)`, seiten >= 1);
    // exakt die Beschriftung, die gezeichnet wurde (echte Schrift im Browser): Kartenbilder direkt erzeugen
    const plan = await main.ev(`(async () => {
      const Z = await import('/src/winterdex/fahrtZeit.ts');
      const K = await import('/src/winterdex/kartenBild.ts');
      const D = await import('/src/winterdex/einsatz/demoFahrt.ts');
      const run = D.demoRun('demo-bauhof');
      const tz = 'Europe/Vienna';
      const F = Z.fahrtDaten(run.track, run.started_at, run.ended_at, run.gaps);
      const kb = await K.kartenBilder(F, { plan: null, missed: null, marken: Z.zeitMarken(F, { timeZone: tz }), ...Z.startEndeLabels(F, tz) }, { timeZone: tz });
      if (!kb) return null;
      window.__uebersicht = kb.uebersicht.src;
      return [kb.uebersicht, ...kb.ausschnitte].map((b) => ({ buchstabe: b.buchstabe ?? '', plan: b.beschriftung }));
    })()`);
    check('Kartenbilder im Browser gezeichnet (Übersicht + Ausschnitte)', Array.isArray(plan) && plan.length >= 2, JSON.stringify(plan)?.slice(0, 200));
    const ueber = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    for (const b of plan ?? []) {
      const p = b.plan;
      const felder = [...p.rahmen.map((r) => r.feld), ...(p.feld ? [p.feld] : [])];
      const treffer = p.schilder.filter((s) => felder.some((f) => ueber(s.box, f)));
      const doppelt = p.schilder.filter((s, i) => p.schilder.some((o, j) => j !== i && ueber(s.box, o.box)));
      const se = p.schilder.filter((s) => s.art !== 'marke').map((s) => s.text);
      check(
        `${b.buchstabe ? `Ausschnitt ${b.buchstabe}` : 'Übersicht'}: ${p.schilder.length} Schilder (${se.join(', ') || '—'}), ${p.rahmen.length} Rahmen — keines über einem Buchstabenfeld oder einem anderen Schild`,
        treffer.length === 0 && doppelt.length === 0 && se.every((t) => /^(Start|Ende) \d\d:\d\d$/.test(t)),
        JSON.stringify({ treffer, doppelt }),
      );
      if (!b.buchstabe) check('Übersicht: Start 09:33 und Ende 10:31 vollständig beschriftet, Start/Ende als „nah“ erkannt', se.includes('Start 09:33') && se.includes('Ende 10:31') && p.nah, se.join(','));
    }
    const src = await main.ev('window.__uebersicht ?? ""');
    if (src) writeFileSync(path.join(aus, 'G-uebersicht.jpg'), Buffer.from(src.split(',')[1], 'base64'));
    console.log('  Bilder:', path.join(aus, 'G-uebersicht.jpg'), path.join(aus, 'G-bauhof-ansicht.png'));
  }
  check('keine Seitenfehler', fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));

  // ------------------------------------------------------------------ H: „wird ermittelt“, Server inzwischen fertig
  console.log('\nH: Straßenverlauf „wird ermittelt“ → PDF lädt frisch');
  await oeffne(DEMO('demo-frei', '&strassen=spaeter'));
  check('Seite zeigt „wird ermittelt“', await warteAuf(`document.body.innerText.includes('Straßenverlauf wird ermittelt')`, 5000));
  {
    const html = await bericht('Nachweis als PDF');
    check('PDF: Tabelle statt „noch ermittelt“ (frisch geladen)', html.includes('Straßenverlauf — wann auf welcher Straße') && !html.includes('noch ermittelt'));
    check('… und die Seite zeigt die Tabelle jetzt auch', await warteAuf(`!!document.querySelector('.fk-strassen tbody tr') && !document.body.innerText.includes('Straßenverlauf wird ermittelt')`, 5000));
  }
  await oeffne(DEMO('demo-frei', '&strassen=ermittelt'));
  {
    const html = await bericht('Nachweis als PDF');
    check('Server noch nicht fertig: PDF mit Vermerk „bei Erstellung (…) noch ermittelt“', /Straßenverlauf wurde bei Erstellung \(\d\d\.\d\d\.\d{4} \d\d:\d\d\) noch ermittelt/.test(html));
  }

  // ------------------------------------------------------------------ I: Meter wie der alte Worker
  console.log('\nI: Meter wie der alte Worker (−20 %)');
  await oeffne(DEMO('demo-bauhof', '&meter=alt'));
  {
    const html = await bericht('Nachweis als PDF');
    const m = html.match(/<tr class="summe"><td colspan="3">zusammen \(gefahren laut GPS: ([\d,]+) km\)<\/td><td class="r">([\d,]+) km<\/td>/);
    check(`PDF: Summe ${m?.[2]} km = gefahren ${m?.[1]} km (aus der Spur nachgerechnet) + Fußnote`, !!m && m[1] === m[2] && html.includes('aus der GPS-Spur im Zeitraum der Zeile berechnet'), m?.[0]);
  }
  check('keine Seitenfehler', fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));

  // ------------------------------------------------------------------ J: erst zählen, dann Pro fragen (Fund 36)
  console.log('\nJ: Strecke wieder aktivieren unter der Gratis-Grenze, Abo-Dienst gestört');
  await oeffne(`${base}/app/winterdex/aussendienst/strecken/00000000-0000-4000-8000-0000000000c1?demo&strecke=pausiert&pro=unklar`, 390, 844);
  check('pausierte Strecke geöffnet', await warteAuf(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Strecke wieder aktivieren'))`, 10000));
  await main.ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Strecke wieder aktivieren')).click()`, true);
  check(
    'aktiviert ohne Pro-Abfrage (keine andere aktive Strecke) — kein „Pro-Status lässt sich gerade nicht prüfen“',
    await warteAuf(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Strecke pausieren')) && !document.body.innerText.includes('nicht prüfen')`, 8000),
    await main.ev(`document.querySelector('.error-box')?.textContent ?? ''`),
  );
  check('keine Seitenfehler', fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));
} catch (e) {
  fail++;
  console.log('ABBRUCH', e);
} finally {
  edge.kill();
}
console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler — Dateien in ${aus}`);
process.exit(fail === 0 ? 0 : 1);
