// Klick-Test „Fahrt-Ansicht“ (Karte + Zeitmarken + Regler + Zeitleiste + PDF) in Edge headless — NUR erfundene
// Beispiel-Fahrten (?demo, src/winterdex/einsatz/demoFahrt.ts), nie echte Server/Kundendaten.
// Prüft je Fahrt-Form (frei/Vorlage/alt ohne Sekunden/ohne Punkte/1 Punkt/8 Std./kaputt/storniert/Zeitumstellung)
// Desktop + Handy 390 px: Karte oder Skizze sichtbar, keine Seitenfehler, kein seitliches Scrollen; dazu Maus über der
// Linie, Antippen, Tastatur am Regler, Zeitleiste, Kacheln gesperrt → Skizze, ohne Netz → Skizze, PDF mit Zeitleiste.
//
//   npx vite --port 5231 --strictPort
//   node tests/browser/fahrt-karte-klick.mjs http://localhost:5231 <ausgabe-ordner>
//
// Braucht: Microsoft Edge (EDGE_PATH), Internet für die OSM-Kacheln (sonst greift der Skizzen-Rückfall — wird gemeldet).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [base = 'http://localhost:5231', aus = path.join(tmpdir(), 'fahrt-karte-klick')] = process.argv.slice(2);
mkdirSync(aus, { recursive: true });
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(path.join(tmpdir(), 'edge-fk-'));
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

async function ziele() {
  return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
}

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
async function bild(datei, ganz = true) {
  await sleep(500);
  const shot = await main.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: ganz });
  writeFileSync(path.join(aus, datei), Buffer.from(shot.result.data, 'base64'));
  return path.join(aus, datei);
}
const mausZu = async (x, y, type = 'mouseMoved') => main.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
const taste = async (key, code, keyCode, shift = false) => {
  const p = { key, code, windowsVirtualKeyCode: keyCode, modifiers: shift ? 8 : 0 };
  await main.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
  await main.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
};
/** Mitte des n-ten Zeitmarken-Punkts (liegt auf der Spur) in Seitenkoordinaten des Viewports */
const markenPunkt = (n) =>
  main.ev(`(() => { const e = document.querySelectorAll('.fk-tm i')[${n}]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
const KEIN_QUERSCROLL = 'document.documentElement.scrollWidth <= window.innerWidth + 1';

const DEMO = (id, rahmen = 'dashboard') =>
  rahmen === 'dashboard' ? `${base}/app/winterdex/fahrten-demo/${id}?demo` : `${base}/app/winterdex/aussendienst/strecken/fahrten/${id}?demo`;

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
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error')
      seitenFehler.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });
  const fehlerOhneKacheln = () => seitenFehler.filter((f) => !/tile\.openstreetmap|ERR_|net::|Failed to load resource/i.test(f));

  // ------------------------------------------------------------------ A: freie Fahrt, Desktop
  console.log('\nA: freie Fahrt (~2 Std.) im Dashboard-Rahmen, 1280 px');
  await oeffne(DEMO('demo-frei'));
  check('Karte da', await warteAuf(`!!document.querySelector('.fk-map.leaflet-container')`));
  const kacheln = await warteAuf(`document.querySelectorAll('.fk-map .leaflet-tile-loaded').length > 3`, 20000);
  check('OSM-Kacheln geladen (Internet)', kacheln);
  check('Spur gezeichnet (grüne Linien + weißer Rand)', (await main.ev(`document.querySelectorAll('.fk-map path[stroke="#16A34A"]').length`)) >= 2);
  const marken = await main.ev(`[...document.querySelectorAll('.fk-tm b')].map((b) => b.textContent)`);
  check('6–12 Zeitmarken „HH:MM“', marken.length >= 6 && marken.length <= 12 && marken.every((m) => /^\d\d:\d\d(–\d\d:\d\d)?$/.test(m)), marken.join(' '));
  const se = await main.ev(`[...document.querySelectorAll('.fk-se')].map((e) => e.textContent)`);
  check('Start/Ende mit Uhrzeit', se.some((t) => /^Start \d\d:\d\d$/.test(t)) && se.some((t) => /^Ende \d\d:\d\d$/.test(t)), se.join(' | '));
  check(
    'Start und Ende am Bauhof: Beschriftungen überdecken sich nicht',
    await main.ev(`(() => { const r = [...document.querySelectorAll('.fk-se')].map((e) => e.getBoundingClientRect()); return r.length === 2 && (r[0].bottom <= r[1].top || r[1].bottom <= r[0].top || r[0].right <= r[1].left || r[1].right <= r[0].left); })()`),
  );
  check('Pausen-Zeichen (2 Unterbrechungen)', (await main.ev(`document.querySelectorAll('.fk-pause').length`)) === 2);
  check('Hinweis freie Fahrt', (await main.ev('document.body.innerText')).includes('Freie Fahrt reicht als Nachweis.'));
  check('Beschriftungen überlappen nicht', await main.ev(`(() => { const r = [...document.querySelectorAll('.fk-tm:not(.aus) b')].map((b) => b.getBoundingClientRect()); return r.every((a, i) => r.every((b, j) => i === j || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)); })()`));
  console.log('  Bild:', await bild('A-desktop-frei.png'));

  // Maus über der Spur → Uhrzeit + km
  const p = await markenPunkt(2);
  await sleep(300);
  await mausZu(p.x + 1, p.y + 1);
  await sleep(300);
  await mausZu(p.x, p.y);
  const hover = await warteAuf(`[...document.querySelectorAll('.fk-tip')].some((t) => /\\d\\d:\\d\\d Uhr · \\d+,\\d km seit Start/.test(t.textContent))`, 3000);
  check('Maus über der Linie: „HH:MM Uhr · x,x km seit Start“', hover, await main.ev(`[...document.querySelectorAll('.fk-tip')].map((t) => t.textContent).join(' | ')`));
  console.log('  Bild:', await bild('A-desktop-hover.png', false));
  // Klick auf die Spur → Regler springt dorthin
  await mausZu(p.x, p.y, 'mousePressed');
  await mausZu(p.x, p.y, 'mouseReleased');
  check('Klick auf die Linie setzt den Regler (Info + blauer Punkt)', await warteAuf(`/\\d\\d:\\d\\d Uhr · \\d+,\\d km seit Start/.test(document.querySelector('.fk-info b')?.textContent ?? '') && !!document.querySelector('.fk-tip-cursor')`, 3000));
  // Tastatur am Regler
  await main.ev(`document.querySelector('.fk-regler input').focus()`);
  await taste('Home', 'Home', 36); // an den Anfang (Browser), damit +11 Min. nicht am Ende gekappt werden
  const vor = await main.ev(`document.querySelector('.fk-regler input').value`);
  await taste('ArrowRight', 'ArrowRight', 39);
  await taste('ArrowRight', 'ArrowRight', 39, true);
  const nach = await main.ev(`document.querySelector('.fk-regler input').value`);
  check('Pfeiltasten: +1 Min. und Umschalt +10 Min.', Number(nach) - Number(vor) === 660, `${vor} → ${nach}`);
  check('aria-valuetext nennt Uhrzeit und km', /Uhr · \d+,\d km seit Start|Unterbrechung|Stillstand|Aufzeichnung beendet|noch keine/.test(await main.ev(`document.querySelector('.fk-regler input').getAttribute('aria-valuetext')`)));
  // Regler in die Pause (Zeitleiste-Zeile der Unterbrechung anklicken)
  await main.ev(`document.querySelector('.fk-zeitleiste summary').click()`);
  const zeilen = await main.ev(`[...document.querySelectorAll('.fk-zeitleiste tbody tr')].map((r) => r.innerText.replace(/\\s+/g, ' '))`);
  check('Zeitleiste: Start … Ende, Unterbrechung, Stillstand', /^\d\d:\d\d 0,0 km (\S.* )?Start$/.test(zeilen[0]) && /Ende$/.test(zeilen.at(-1)) && zeilen.some((z) => z.includes('Unterbrechung')) && zeilen.some((z) => z.includes('Stillstand')), zeilen.join(' / '));
  await main.ev(`[...document.querySelectorAll('.fk-z-luecke .fk-zeit-btn')][0].click()`);
  check('Zeile „Unterbrechung“ antippen → Regler zeigt Unterbrechung', await warteAuf(`(document.querySelector('.fk-info')?.textContent ?? '').includes('Unterbrechung')`, 3000));
  await main.ev('window.scrollTo(0, 0)');
  console.log('  Bild:', await bild('A-desktop-zeitleiste.png'));
  check('keine Seitenfehler', fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));

  // PDF: Berichtsfenster abfangen
  await main.ev(`(() => { window.__html = null; window.open = () => { const w = { document: { open() {}, write(h) { window.__html = (window.__html ?? '') + h; }, close() {}, readyState: 'complete' }, print() {}, addEventListener() {}, closed: false }; return w; }; return true; })()`);
  await main.ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Nachweis als PDF')).click()`, true);
  // seit 25.11.2026 geht das Fenster sofort auf („Bericht wird erstellt …“), der Bericht mit Kartenbild kommt nach (≤ ~8 s)
  const roh = (await warteAuf(`/Strecken-Nachweis Winterdienst[\\s\\S]*Erstellt am/.test(window.__html ?? '')`, 15000)) ? await main.ev('window.__html') : '';
  const html = roh.slice(roh.lastIndexOf('<!doctype html>'));
  check(
    'PDF: Zeitleiste + echtes Kartenbild (Rückfall: Zeitmarken in der Skizze)',
    /Zeitleiste — wann war das Fahrzeug wo/.test(html) && (html.includes('<figure class="karte"><img src="data:image/jpeg') || /fill="#0C1B2A">\d\d:\d\d/.test(html)),
  );
  if (html) {
    writeFileSync(path.join(aus, 'A-nachweis.html'), html);
    const t = await main.send('Target.createTarget', { url: 'about:blank' });
    const pop = await verbinde((await ziele()).find((x) => x.id === t.result.targetId).webSocketDebuggerUrl);
    await pop.send('Page.enable');
    const fr = await pop.send('Page.getFrameTree');
    await pop.send('Page.setDocumentContent', { frameId: fr.result.frameTree.frame.id, html });
    await sleep(500);
    const pdf = await pop.send('Page.printToPDF', { printBackground: false, preferCSSPageSize: true });
    writeFileSync(path.join(aus, 'A-nachweis.pdf'), Buffer.from(pdf.result.data, 'base64'));
    await pop.send('Emulation.setDeviceMetricsOverride', { width: 794, height: 1123, deviceScaleFactor: 1, mobile: false });
    const shot = await pop.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(path.join(aus, 'A-nachweis-ansicht.png'), Buffer.from(shot.result.data, 'base64'));
    console.log('  PDF:', path.join(aus, 'A-nachweis.pdf'));
    await pop.send('Page.close').catch(() => {});
    pop.ws.close();
  }

  // ------------------------------------------------------------------ B: Handy 390 px, Außendienst-Rahmen
  console.log('\nB: freie Fahrt im Außendienst, 390 px');
  await oeffne(DEMO('demo-frei', 'ad'), 390, 844);
  check('Karte da (Handy)', await warteAuf(`!!document.querySelector('.fk-map.leaflet-container')`));
  await warteAuf(`document.querySelectorAll('.fk-map .leaflet-tile-loaded').length > 3`, 20000);
  check('kein seitliches Scrollen bei 390 px', await main.ev(KEIN_QUERSCROLL), await main.ev('document.documentElement.scrollWidth'));
  const mh = await main.ev(`document.querySelector('.fk-map').getBoundingClientRect().height`);
  check('Kartenhöhe am Handy 340 px', Math.round(mh) === 340, mh);
  console.log('  Bild:', await bild('B-handy-frei.png'));
  // Antippen (Touch-Gerät: kein Hover) → Regler + blauer Punkt mit Text
  const q = await markenPunkt(3);
  await sleep(300);
  await main.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: q.x, y: q.y }] });
  await main.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mausZu(q.x, q.y, 'mousePressed');
  await mausZu(q.x, q.y, 'mouseReleased');
  check('Antippen der Linie → Uhrzeit + km', await warteAuf(`/\\d\\d:\\d\\d Uhr · \\d+,\\d km seit Start/.test(document.querySelector('.fk-info b')?.textContent ?? '')`, 3000));
  check('Tooltip passt in die Breite', await main.ev(`(() => { const t = document.querySelector('.fk-tip-cursor'); if (!t) return true; const r = t.getBoundingClientRect(); return r.width <= 300; })()`));
  console.log('  Bild:', await bild('B-handy-angetippt.png', false));
  await main.ev(`document.querySelector('.fk-zeitleiste summary').click()`);
  check('Zeitleiste bei 390 px ohne seitliches Scrollen der Seite', await main.ev(KEIN_QUERSCROLL));
  await main.ev(`document.querySelector('.fk-zeitleiste').scrollIntoView()`);
  console.log('  Bild:', await bild('B-handy-zeitleiste.png', false));
  check('keine Seitenfehler', fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));

  // ------------------------------------------------------------------ C: alle Formen (Desktop + Handy)
  console.log('\nC: alle Fahrt-Formen');
  const formen = {
    'demo-vorlage': { karte: true, marken: true, text: ['Abgedeckt', 'Nicht befahren'] },
    'demo-alt': { karte: true, marken: false, text: ['Freie Fahrt'] },
    'demo-leer': { karte: false, marken: false, text: ['Keine Kartenskizze', 'Nachgemeldet'] },
    'demo-ein-punkt': { karte: true, marken: false, text: [] },
    'demo-lang': { karte: true, marken: true, text: [] },
    'demo-kaputt': { karte: true, marken: false, text: [] },
    'demo-storno': { karte: true, marken: true, text: ['Storniert am'] },
    'demo-sommerzeit': { karte: true, marken: true, text: [] },
  };
  for (const [id, soll] of Object.entries(formen)) {
    for (const [breite, rahmen] of [[1280, 'dashboard'], [390, 'ad']]) {
      const t0 = Date.now();
      await oeffne(DEMO(id, rahmen), breite, 844);
      const da = soll.karte
        ? await warteAuf(`!!document.querySelector('.fk-map.leaflet-container') && document.querySelectorAll('.fk-map .leaflet-tile-loaded').length > 0`, 20000)
        : await warteAuf(`document.body.innerText.includes('Keine Kartenskizze')`, 8000);
      const ms = Date.now() - t0;
      const body = await main.ev('document.body.innerText');
      const nMarken = await main.ev(`document.querySelectorAll('.fk-tm').length`);
      check(
        `${id} @${breite}: ${soll.karte ? 'Karte' : 'Hinweis ohne Positionen'}${soll.marken ? ' + Zeitmarken' : ''}, Texte, kein Querscrollen, keine Fehler (${ms} ms)`,
        da && (soll.marken ? nMarken >= 3 : nMarken === 0) && soll.text.every((t) => body.includes(t)) && (await main.ev(KEIN_QUERSCROLL)) && fehlerOhneKacheln().length === 0 && !/Dieser Teil lässt sich gerade nicht öffnen/.test(body),
        JSON.stringify({ da, nMarken, fehler: fehlerOhneKacheln(), fehlt: soll.text.filter((t) => !body.includes(t)) }),
      );
      if (breite === 1280 && ['demo-vorlage', 'demo-lang', 'demo-alt', 'demo-kaputt'].includes(id)) console.log('  Bild:', await bild(`C-${id}.png`));
      if (breite === 390 && ['demo-vorlage', 'demo-leer'].includes(id)) console.log('  Bild:', await bild(`C-${id}-handy.png`));
      if (id === 'demo-lang' && breite === 1280) {
        // Leistung: Maus über die Karte fahren — jede Bewegung muss flüssig bleiben
        const box = await main.ev(`(() => { const r = document.querySelector('.fk-map').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
        const s = Date.now();
        for (let k = 0; k < 60; k++) await mausZu(box.x + 40 + (k * (box.w - 80)) / 60, box.y + box.h / 2);
        const dauer = Date.now() - s;
        check(`lange Fahrt: 60 Mausbewegungen in ${dauer} ms (flüssig, < 3 s)`, dauer < 3000);
        const pts = await main.ev(`[...document.querySelectorAll('.fk-map path[stroke="#16A34A"]')].reduce((a, p) => a + (p.getAttribute('d')?.split(/[ML]/).length ?? 0), 0)`);
        check(`lange Fahrt: gezeichnete Punkte vereinfacht (${pts} statt ~28.800)`, pts > 0 && pts < 10000);
      }
    }
  }

  // ------------------------------------------------------------------ D: Kacheln gesperrt → Skizze mit Zeitmarken
  console.log('\nD: Kacheln laden nicht');
  await main.send('Network.setBlockedURLs', { urls: ['*tile.openstreetmap.org*'] });
  await oeffne(DEMO('demo-frei'));
  check('Kacheln gesperrt → Skizze (mit Zeitmarken) + Hinweis', await warteAuf(`!!document.querySelector('.route-sketch svg') && document.body.innerText.includes('Die Karte ließ sich gerade nicht laden')`, 16000));
  check('… Zeitmarken in der Skizze', (await main.ev(`document.querySelectorAll('.route-sketch svg rect').length`)) >= 3);
  check('… Zeitleiste bleibt', await main.ev(`!!document.querySelector('.fk-zeitleiste')`));
  console.log('  Bild:', await bild('D-kacheln-gesperrt.png'));
  await main.send('Network.setBlockedURLs', { urls: [] });

  // ------------------------------------------------------------------ E: ohne Netz (navigator.onLine = false) → Skizze sofort
  console.log('\nE: ohne Netz');
  const skript = await main.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false });` });
  await oeffne(DEMO('demo-vorlage', 'ad'), 390, 844);
  check('ohne Netz: Skizze sofort, kein Kartenversuch', await warteAuf(`!!document.querySelector('.route-sketch svg') && !document.querySelector('.fk-map')`, 8000));
  check('… Umschalter „Als Karte“', (await main.ev('document.body.innerText')).includes('Als Karte'));
  console.log('  Bild:', await bild('E-ohne-netz-handy.png'));
  await main.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: skript.result.identifier });

  // ------------------------------------------------------------------ F: hell (Tokens data-theme=light) und Strecke
  console.log('\nF: helle Tokens + Strecken-Seite im Außendienst');
  await oeffne(DEMO('demo-vorlage'));
  await main.ev(`document.documentElement.setAttribute('data-theme', 'light')`);
  await warteAuf(`document.querySelectorAll('.fk-map .leaflet-tile-loaded').length > 3`, 20000);
  await main.ev(`document.querySelector('.fk-zeitleiste summary').click()`);
  console.log('  Bild:', await bild('F-hell-vorlage.png'));
  await oeffne(`${base}/app/winterdex/aussendienst/strecken/00000000-0000-4000-8000-0000000000c1?demo`, 390, 844);
  check('Strecke im Außendienst: echte Karte der Vorlage', await warteAuf(`!!document.querySelector('.fk-map.leaflet-container') && document.querySelectorAll('.fk-map path').length > 0`, 15000));
  check('… ohne Regler/Zeitleiste (Vorlage hat keine Zeiten)', await main.ev(`!document.querySelector('.fk-regler, .fk-zeitleiste')`));
  console.log('  Bild:', await bild('F-strecke-handy.png'));
  check('keine Seitenfehler', fehlerOhneKacheln().length === 0, fehlerOhneKacheln().join(' | '));
} catch (e) {
  fail++;
  console.log('ABBRUCH', e);
} finally {
  edge.kill();
}
console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler — Bilder in ${aus}`);
process.exit(fail === 0 ? 0 : 1);
