// Klick-Test „Prüfbericht mit Karte + Straßenverlauf“ (25.11.2026) in Edge headless — NUR erfundene Beispiel-Fahrten
// (?demo, src/winterdex/einsatz/demoFahrt.ts), nie echte Server/Kundendaten.
// Prüft: Fahrt-Detail (Straßenverlauf mit Uhrzeit/Straße/Ort, Spalte „Straße“ in der Zeitleiste, „wird ermittelt“,
// Handy 390 px), Einzel-PDF mit echtem Kartenbild (OSM-Kacheln, 2-fache Auflösung, Ausschnitte A/B/C) für frei,
// Vorlage, alt, 8 Std. (28.800 Punkte), storniert; Kacheln gesperrt bzw. ohne Netz → Skizze, PDF entsteht immer
// (≤ ~10 s); Fahrtenbuch (Sammel-Nachweis) mit Straßenverlauf + Kartenbild je Fahrt, 120 Fahrten ohne Bilder;
// Strecke im Außendienst mit letzter Fahrt. PDFs/Bilder landen im Ausgabe-Ordner.
//
//   npx vite --port 5237 --strictPort
//   node tests/browser/fahrt-pdf-karte.mjs http://localhost:5237 <ausgabe-ordner>
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [base = 'http://localhost:5237', aus = path.join(tmpdir(), 'fahrt-pdf-karte')] = process.argv.slice(2);
mkdirSync(aus, { recursive: true });
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(path.join(tmpdir(), 'edge-pk-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || extra === '' ? '' : '  → ' + String(extra).slice(0, 300)}`);
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
const KEIN_QUERSCROLL = 'document.documentElement.scrollWidth <= window.innerWidth + 1';
const DEMO = (id, rahmen = 'dashboard', q = '') =>
  rahmen === 'dashboard' ? `${base}/app/winterdex/fahrten-demo/${id}?demo${q}` : `${base}/app/winterdex/aussendienst/strecken/fahrten/${id}?demo${q}`;
const fehlerOhneKacheln = () => seitenFehler.filter((f) => !/tile\.openstreetmap|ERR_|net::|Failed to load resource|Kartenbild|Kartenausschnitt|Kartenbilder/i.test(f));

/** Bericht-Fenster abfangen (window.open), Knopf drücken, auf den fertigen Bericht warten */
async function bericht(knopfText, ms = 20000) {
  await main.ev(
    `(() => { window.__html = ''; window.open = () => ({ document: { open() {}, write(h) { window.__html += h; }, close() {}, readyState: 'complete' }, print() {}, addEventListener() {}, close() {}, closed: false }); return true; })()`,
  );
  await warteAuf(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes(${JSON.stringify(knopfText)}))`, 15000);
  const t0 = Date.now();
  await main.ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(knopfText)})).click()`, true);
  const fertig = await warteAuf(`/(Strecken-Nachweis Winterdienst|Fahrtenbuch Winterdienst)[\\s\\S]*Erstellt am/.test(window.__html)`, ms);
  const html = fertig ? await main.ev('window.__html') : '';
  return { html: html.slice(html.lastIndexOf('<!doctype html>')), ms: Date.now() - t0 };
}
/** Bericht als PDF + Bild der ersten Seiten (A4) ablegen; liefert die Seitenzahl */
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
  // Kartenbild: echte Pixelgröße prüfen
  const groesse = await pop.send('Runtime.evaluate', {
    expression: `[...document.querySelectorAll('figure.karte img')].map((i) => [i.naturalWidth, i.naturalHeight, Math.round(i.getBoundingClientRect().width)])`,
    returnByValue: true,
  });
  await pop.send('Page.close').catch(() => {});
  pop.ws.close();
  const seiten = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  return { seiten, kb: Math.round(buf.length / 1024), bilder: groesse.result?.result?.value ?? [] };
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
  await main.send('Network.enable');
  main.handler.add((d) => {
    if (d.method === 'Runtime.exceptionThrown') seitenFehler.push(d.params.exceptionDetails?.exception?.description ?? d.params.exceptionDetails?.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') seitenFehler.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });

  // ------------------------------------------------------------------ A: Fahrt-Detail
  console.log('\nA: Fahrt-Detail mit Straßenverlauf');
  await oeffne(DEMO('demo-frei'));
  check('Straßenverlauf sichtbar', await warteAuf(`!!document.querySelector('.fk-strassen tbody tr')`));
  const zeilen = await main.ev(`[...document.querySelectorAll('.fk-strassen tbody tr')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim())`);
  check(`Zeilen „06:12–06:2x Hauptstraße Musterstadt 1,5 km“ (${zeilen.length})`, zeilen.length >= 10 && /^06:12–06:2\d Hauptstraße Musterstadt 1,5 km$/.test(zeilen[0]) && zeilen.some((z) => z.includes('Musterstadt (Unterdorf)')), zeilen.slice(0, 3).join(' / '));
  check('Quellenangabe „© OpenStreetMap-Mitwirkende“ mit Link', await main.ev(`!!document.querySelector('.fk-strassen-quelle a[href="https://www.openstreetmap.org/copyright"]')`));
  await main.ev(`document.querySelector('.fk-zeitleiste summary').click()`);
  const kopf = await main.ev(`[...document.querySelectorAll('.fk-zeitleiste thead th')].map((t) => t.textContent)`);
  const z1 = await main.ev(`document.querySelector('.fk-zeitleiste tbody tr')?.innerText.replace(/\\s+/g, ' ')`);
  check('Zeitleiste mit Spalte „Straße“', kopf.join('|') === 'Uhrzeit|km seit Start|Straße|Abschnitt' && /^\d\d:\d\d 0,0 km Hauptstraße Start$/.test(z1), `${kopf.join('|')} / ${z1}`);
  await main.ev(`document.querySelectorAll('.fk-strassen .fk-zeit-btn')[3].click()`);
  check('Zeile im Straßenverlauf antippen → Regler zeigt die Uhrzeit', await warteAuf(`/\\d\\d:\\d\\d Uhr · \\d+,\\d km seit Start/.test(document.querySelector('.fk-info b')?.textContent ?? '')`, 3000));
  console.log('  Bild:', await bild('A-detail-frei.png'));
  check('keine Seitenfehler', fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));
  await oeffne(DEMO('demo-frei', 'ad'), 390, 844);
  check('Handy 390 px: Straßenverlauf ohne seitliches Scrollen', (await warteAuf(`!!document.querySelector('.fk-strassen tbody tr')`)) && (await main.ev(KEIN_QUERSCROLL)), await main.ev('document.documentElement.scrollWidth'));
  console.log('  Bild:', await bild('A-detail-handy.png'));
  await oeffne(DEMO('demo-frei', 'dashboard', '&strassen=ermittelt'));
  check('noch nicht ermittelt → Hinweis „wird ermittelt“', await warteAuf(`document.body.innerText.includes('Straßenverlauf wird ermittelt')`, 5000));
  for (const [id, soll] of [['demo-alt', false], ['demo-storno', true], ['demo-vorlage', true], ['demo-leer', false], ['demo-kaputt', false]]) {
    await oeffne(DEMO(id));
    await sleep(1200);
    const da = await main.ev(`!!document.querySelector('.fk-strassen')`);
    check(`${id}: Straßenverlauf ${soll ? 'da' : 'nicht da'}, keine Fehler`, da === soll && fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));
  }

  // ------------------------------------------------------------------ B: Einzel-PDF mit Kartenbild
  console.log('\nB: Einzel-PDF mit echtem Kartenbild');
  for (const id of ['demo-frei', 'demo-vorlage', 'demo-alt', 'demo-lang', 'demo-storno']) {
    await oeffne(DEMO(id));
    await warteAuf(`!!document.querySelector('.fk-map.leaflet-container')`, 15000);
    const { html, ms } = await bericht('Nachweis als PDF');
    const karte = html.includes('<figure class="karte"><img src="data:image/jpeg');
    const pdf = html ? await alsPdf(html, `B-${id}`) : null;
    const scharf = pdf?.bilder?.[0] && pdf.bilder[0][0] >= 1.9 * pdf.bilder[0][2];
    const str = id === 'demo-alt' ? !html.includes('Straßenverlauf') : html.includes('Straßenverlauf — wann auf welcher Straße');
    check(
      `${id}: PDF in ${ms} ms, Kartenbild (OSM, ${pdf?.bilder?.[0]?.join('×') ?? '—'} px, 2-fach), ${pdf?.bilder?.length ?? 0} Bild(er), Straßenverlauf ${id === 'demo-alt' ? 'fehlt (alt)' : 'da'}, ${pdf?.seiten} Seite(n) A4, ${pdf?.kb} KB`,
      karte && scharf && str && ms < 15000 && pdf.seiten >= 1 && html.includes('© OpenStreetMap-Mitwirkende'),
      JSON.stringify({ karte, scharf, str, ms }),
    );
    if (id === 'demo-vorlage') check('… Vorlage: Abdeckung + nicht befahren im Bericht', html.includes('der Strecke abgedeckt') && html.includes('Nicht befahren'));
    if (id === 'demo-lang') check('… 8 Std.: Ausschnitte A–C in Straßen-Zoom mit Zeiten', html.includes('Ausschnitte in Straßen-Zoom') && /<b>Ausschnitt A<\/b> · dort \d\d:\d\d/.test(html));
    if (id === 'demo-storno') check('… storniert: Storno im Bericht', html.includes('STORNIERT am'));
  }
  check('keine Seitenfehler', fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));

  // ------------------------------------------------------------------ C: Kacheln gesperrt / ohne Netz → Skizze, PDF entsteht
  console.log('\nC: Kacheln gesperrt / ohne Netz');
  await main.send('Network.setBlockedURLs', { urls: ['*tile.openstreetmap.org*'] });
  await oeffne(DEMO('demo-frei'));
  await sleep(1500);
  {
    const { html, ms } = await bericht('Nachweis als PDF');
    check(`Kacheln gesperrt: PDF mit Skizze + Straßenverlauf in ${ms} ms (≤ 10 s)`, html.includes('<svg') && !html.includes('data:image/jpeg') && html.includes('Straßenverlauf — wann') && ms <= 10000, ms);
    if (html) await alsPdf(html, 'C-gesperrt');
  }
  await main.send('Network.setBlockedURLs', { urls: [] });
  const skript = await main.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false });` });
  await oeffne(DEMO('demo-lang'));
  {
    const { html, ms } = await bericht('Nachweis als PDF');
    check(`ohne Netz (8 Std.): PDF mit Skizze sofort (${ms} ms)`, html.includes('<svg') && html.includes('Straßenverlauf') && ms < 4000, ms);
  }
  await main.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: skript.result.identifier });
  // sehr langsame Kacheln (Zeitlimit): jede Kachel 12 s verzögert → nach ~8 s Skizze
  await main.send('Fetch.enable', { patterns: [{ urlPattern: '*tile.openstreetmap.org*' }] });
  const haltSet = new Set();
  const halt = (d) => {
    if (d.method === 'Fetch.requestPaused') {
      haltSet.add(d.params.requestId);
      setTimeout(() => main.send('Fetch.continueRequest', { requestId: d.params.requestId }).catch(() => {}), 12000);
    }
  };
  main.handler.add(halt);
  await oeffne(DEMO('demo-vorlage'));
  await sleep(500);
  {
    const { html, ms } = await bericht('Nachweis als PDF', 25000);
    check(`Kacheln hängen: nach dem Zeitlimit Skizze, PDF entsteht (${ms} ms)`, html.includes('<svg') && html.includes('Strecken-Nachweis') && ms >= 7000 && ms < 14000, ms);
  }
  main.handler.delete(halt);
  await main.send('Fetch.disable');
  await sleep(500);

  // ------------------------------------------------------------------ D: Fahrtenbuch (Sammel-Nachweis)
  console.log('\nD: Fahrtenbuch (Sammel-Nachweis)');
  await oeffne(`${base}/app/winterdex/fahrten-demo?demo`);
  {
    const { html, ms } = await bericht('Fahrtenbuch-PDF', 30000);
    const bloecke = (html.match(/<div class="fahrt">/g) ?? []).length;
    const bilder = (html.match(/<figure class="karte klein"><img src="data:image\/jpeg/g) ?? []).length;
    const pdf = html ? await alsPdf(html, 'D-fahrtenbuch') : null;
    check(`Fahrtenbuch in ${ms} ms: ${bloecke} Fahrten im Einzelnen, ${bilder} Kartenbilder, ${pdf?.seiten} Seiten, ${pdf?.kb} KB`, bloecke >= 6 && bilder >= 6 && html.includes('<b>Hauptstraße</b>') && html.includes('Musterstadt (Unterdorf)') && html.includes('© OpenStreetMap-Mitwirkende'), JSON.stringify({ bloecke, bilder }));
    check('… Kartenbilder kompakt (je ≤ 120 KB)', (html.match(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g) ?? []).every((s) => s.length * 0.75 < 120 * 1024));
  }
  await oeffne(`${base}/app/winterdex/fahrten-demo?demo&buch=viele`);
  {
    const { html, ms } = await bericht('Fahrtenbuch-PDF', 40000);
    const bloecke = (html.match(/<div class="fahrt">/g) ?? []).length;
    check(`120 Fahrten in ${ms} ms: Straßenverlauf je Fahrt, keine Kartenbilder (Dateigröße)`, bloecke === 120 && !html.includes('karte klein') && html.includes('Kartenbilder nur bis 100 Fahrten'), bloecke);
    if (html) {
      const pdf = await alsPdf(html, 'D-fahrtenbuch-120');
      check(`… PDF ${pdf.seiten} Seiten, ${pdf.kb} KB`, pdf.seiten > 5 && pdf.kb < 20000);
    }
  }
  await main.send('Network.setBlockedURLs', { urls: ['*tile.openstreetmap.org*'] });
  await oeffne(`${base}/app/winterdex/fahrten-demo?demo`);
  {
    const { html, ms } = await bericht('Fahrtenbuch-PDF', 20000);
    check(`Kacheln gesperrt: Fahrtenbuch mit Straßenverlauf, ohne Bilder, Hinweis (${ms} ms)`, html.includes('Kartenbilder ließen sich gerade nicht laden') && html.includes('<b>Hauptstraße</b>') && ms < 12000, ms);
  }
  await main.send('Network.setBlockedURLs', { urls: [] });

  // ------------------------------------------------------------------ E: Strecke mit letzter Fahrt (Außendienst)
  console.log('\nE: Strecke mit letzter Fahrt (Außendienst)');
  await oeffne(`${base}/app/winterdex/aussendienst/strecken/00000000-0000-4000-8000-0000000000c1?demo&mitfahrt`, 390, 844);
  check('Karte mit Vorlage + letzter Fahrt, Zeitmarken, Straßenverlauf', await warteAuf(`!!document.querySelector('.fk-map.leaflet-container') && document.querySelectorAll('.fk-tm').length >= 3 && !!document.querySelector('.fk-strassen tbody tr')`, 15000));
  check('… Link zum Nachweis mit PDF, kein seitliches Scrollen', (await main.ev(`document.body.innerText.includes('Nachweis mit PDF öffnen')`)) && (await main.ev(KEIN_QUERSCROLL)));
  console.log('  Bild:', await bild('E-strecke-handy.png'));
  check('keine Seitenfehler', fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));
} catch (e) {
  fail++;
  console.log('ABBRUCH', e);
} finally {
  edge.kill();
}
console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler — Dateien in ${aus}`);
process.exit(fail === 0 ? 0 : 1);
