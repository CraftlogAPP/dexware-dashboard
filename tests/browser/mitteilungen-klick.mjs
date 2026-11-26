// Klick-Test Mitteilungs-Center (26.11.2026) in Edge headless — NUR Beispieldaten der Vorschau
// (/vorschau?app=winterdex&seite=mitteilungen, src/dev/MitteilungenVorschau.tsx), nie echte Server/Kundendaten.
// Browser absichtlich auf UTC (falsch eingestellter PC): Tage und Uhrzeiten müssen trotzdem Wiener Zeit sein.
//   A: PC 1280 px — Glocke mit Zähler 4 (erster Besuch: letzte 24 Std.), Fenster Heute/Gestern/Älter, voller Text der
//      amtlichen Warnung, Zähler nach dem Öffnen weg, Escape schließt
//   B: Klick auf die amtliche Warnung → Detail mit vollem Text, Uhrzeit in Wiener Zeit, Karte „Heute Nacht“ darunter
//   C: Handy 360 px — Kopfzeile ragt nicht heraus, Glocke im Bild, Fenster über die Breite, Tippflächen ≥ 44 px;
//      dazu 300–1000 px: kein Knopf der Kopfzeile ragt aus dem Bild (Abmelden schrumpfte bei 360/421/440 px hinaus)
//   D: Seite „Alle Mitteilungen“ am Handy — große Einträge, kein Querscrollen
//   E: leer / gestört
//
//   npx vite --port 5263 --strictPort
//   node tests/browser/mitteilungen-klick.mjs http://localhost:5263 <ausgabe-ordner>
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [base = 'http://localhost:5263', aus = path.join(tmpdir(), 'mitteilungen-klick')] = process.argv.slice(2);
mkdirSync(aus, { recursive: true });
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(path.join(tmpdir(), 'edge-mt-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || extra === '' ? '' : '  → ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400)}`);
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
  await main.send('Emulation.setTouchEmulationEnabled', { enabled: breite < 600, maxTouchPoints: breite < 600 ? 5 : 0 });
  await main.send('Emulation.setEmitTouchEventsForMouse', { enabled: breite < 600 });
  seitenFehler.length = 0;
  await main.send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    await sleep(150);
    if ((await main.ev('document.readyState')) === 'complete') break;
  }
  // erst messen, wenn die Schrift da ist (mit der Ersatzschrift sind die Knöpfe schmaler — Breiten-Prüfung sonst zu milde)
  await main.ev('document.fonts.ready.then(() => true)');
}
async function warteAuf(js, ms = 15000) {
  for (let t = 0; t < ms; t += 150) {
    if (await main.ev(js)) return true;
    await sleep(150);
  }
  return false;
}
async function bild(datei) {
  await sleep(300);
  const shot = await main.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(aus, datei), Buffer.from(shot.result.data, 'base64'));
  return path.join(aus, datei);
}
const V = (q = '') => `${base}/vorschau?app=winterdex&seite=mitteilungen${q}`;
const kein = () => seitenFehler.filter((f) => !/Failed to load resource|net::|ERR_|favicon/i.test(f));
const K9_VOLL =
  'Gelbe Schneewarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 14:00 – Graz (GeoSphere Austria). 1 Objekt betroffen. Gelbe Glatteiswarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 09:00 – Graz (GeoSphere Austria). 1 Objekt betroffen.';
/** alle sichtbaren Knöpfe/Links der Kopfzeile mit Lage */
const KOPF_TEILE = `[...document.querySelectorAll('.site-header a, .site-header button, .site-header .app-chip')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return { k: String(e.className).split(' ')[0], l: Math.round(r.left), r: Math.round(r.right) }; })`;
/** ragt etwas aus dem Bild? (Seite breiter als das Fenster) */
const querscroll = () => main.ev(`document.documentElement.scrollWidth - window.innerWidth`);

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
  await main.send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
  main.handler.add((d) => {
    if (d.method === 'Runtime.exceptionThrown') seitenFehler.push(d.params.exceptionDetails?.exception?.description ?? d.params.exceptionDetails?.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') seitenFehler.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });

  // ------------------------------------------------------------------ A: PC, Glocke + Fenster
  console.log('\nA: PC 1280 px — Glocke und Fenster (Browser auf UTC)');
  await oeffne(V('&teil=glocke'));
  check('Browser wirklich auf UTC', (await main.ev(`new Date('2026-11-26T03:12:00Z').getHours()`)) === 3);
  check('Glocke in der Kopfzeile', await warteAuf(`!!document.querySelector('.site-header .mt-platz .due-bell-btn')`));
  check('Zähler „4“ (erster Besuch: nur die letzten 24 Std.)', (await main.ev(`document.querySelector('.due-bell-count')?.textContent`)) === '4', await main.ev(`document.querySelector('.due-bell-count')?.textContent`));
  check('Bildschirmleser: „Mitteilungen: 4 neu“', (await main.ev(`document.querySelector('.due-bell-btn').getAttribute('aria-label')`)) === 'Mitteilungen: 4 neu');
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  check('Fenster offen', await warteAuf(`!!document.querySelector('.mt-pop')`, 3000));
  const gruppen = await main.ev(`[...document.querySelectorAll('.mt-pop .mt-gruppe-kopf')].map((e) => e.textContent).join(',')`);
  check(`Gruppen „${gruppen}“`, gruppen === 'Heute,Gestern,Älter', gruppen);
  const erste = await main.ev(`(() => { const e = document.querySelector('.mt-pop .mt-eintrag'); return e.querySelector('.mt-titel').textContent + ' | ' + e.querySelector('.mt-zeit').textContent; })()`);
  check(`erster Eintrag in Wiener Zeit: „${erste}“`, erste === '❄️ Schnee-Wecker | 04:12', erste);
  const k9 = await main.ev(`(() => { const e = [...document.querySelectorAll('.mt-pop .mt-eintrag')].find((x) => x.querySelector('.mt-titel').textContent === 'Amtliche Warnung'); const t = e.querySelector('.mt-text'); return { text: t.textContent, ganz: t.scrollHeight <= t.clientHeight + 1 && t.scrollWidth <= t.clientWidth + 1, zeit: e.querySelector('.mt-zeit').textContent }; })()`);
  check('amtliche Warnung mit VOLLEM Text (nicht abgeschnitten, nichts versteckt)', k9.text === K9_VOLL && k9.ganz, k9);
  check('… um 00:30 Wiener Zeit unter „Heute“ (UTC wäre gestern 23:30)', k9.zeit === '00:30', k9.zeit);
  const aelter = await main.ev(`[...document.querySelectorAll('.mt-pop .mt-gruppe')].at(-1).querySelector('.mt-zeit').textContent`);
  check(`Älter mit Tag: „${aelter}“`, aelter === 'Di 24.11., 21:42', aelter);
  check('4 Einträge als „neu“ markiert, Zähler an der Glocke weg', (await main.ev(`document.querySelectorAll('.mt-pop .mt-neu').length`)) === 4 && (await main.ev(`!document.querySelector('.due-bell-count')`)));
  check('Hinweis: ein-/ausschalten je Handy in der App', /WinterDex-App → Einstellungen → Mitteilungen/.test(await main.ev(`document.querySelector('.mt-fuss').textContent`)));
  const popPc = await main.ev(`(() => { const r = document.querySelector('.mt-pop').getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, w: window.innerWidth, h: window.innerHeight }; })()`);
  check('Fenster ganz im Bild', popPc.l >= 0 && popPc.r <= popPc.w && popPc.b <= popPc.h, popPc);
  check('kein Querscrollen', (await querscroll()) <= 0);
  console.log('  Bild:', await bild('A-pc-fenster.png'));
  await main.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('Escape schließt, Fokus zurück auf der Glocke', (await warteAuf(`!document.querySelector('.mt-pop')`, 2000)) && (await main.ev(`document.activeElement === document.querySelector('.due-bell-btn')`)));
  check('nach dem Schließen: kein Zähler (alles gesehen)', await main.ev(`!document.querySelector('.due-bell-count')`));

  // ------------------------------------------------------------------ B: Klick → Detail
  console.log('\nB: Klick auf die amtliche Warnung → Detail mit Karte „Heute Nacht“');
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  await warteAuf(`!!document.querySelector('.mt-pop')`, 3000);
  // Rückfrage „Aufzeichnung läuft / Einsatz nicht gespeichert“ (useUnsavedGuard) nachgestellt: fängt Klicks auf Links in
  // der Capture-Phase ab, „Abbrechen“ = preventDefault + stopPropagation. Der Eintrag muss dann stehen bleiben.
  await main.ev(`window.__wache = (e) => { if (e.target.closest?.('a[href]')) { e.preventDefault(); e.stopPropagation(); window.__abgefangen = (window.__abgefangen ?? 0) + 1; } }; document.addEventListener('click', window.__wache, true); true`);
  await main.ev(`[...document.querySelectorAll('.mt-pop .mt-eintrag')].find((x) => x.querySelector('.mt-titel').textContent === 'Amtliche Warnung').click()`, true);
  await sleep(400);
  check('Rückfrage „Seite verlassen?“ → Abbrechen: kein Wechsel, Fenster bleibt offen (Einträge sind Links, kein navigate())',
    (await main.ev(`window.__abgefangen === 1 && !location.search.includes('id=40') && !!document.querySelector('.mt-pop')`)) === true,
    await main.ev(`({ abgefangen: window.__abgefangen ?? 0, such: location.search, offen: !!document.querySelector('.mt-pop') })`));
  await main.ev(`document.removeEventListener('click', window.__wache, true); true`);
  await main.ev(`[...document.querySelectorAll('.mt-pop .mt-eintrag')].find((x) => x.querySelector('.mt-titel').textContent === 'Amtliche Warnung').click()`, true);
  check('Detail offen (id=40), Fenster zu', (await warteAuf(`location.search.includes('id=40') && !!document.querySelector('.mt-detail')`, 5000)) && (await main.ev(`!document.querySelector('.mt-pop')`)));
  const det = await main.ev(`({ h: document.querySelector('.mt-detail h1').textContent, zeit: document.querySelector('.mt-detail .muted').textContent, text: document.querySelector('.mt-detail-text').textContent })`);
  check(`Detail: Titel + „${det.zeit}“`, det.h === 'Amtliche Warnung' && det.zeit === 'Do, 26.11.2026, 00:30 Uhr', det);
  check('Detail: voller Text', det.text === K9_VOLL);
  check('Karte „Heute Nacht“ darunter', await main.ev(`(() => { const d = document.querySelector('.mt-detail'); const h = document.querySelector('section.hn'); return !!h && !!(d.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING); })()`));
  check('Zurück „← Alle Mitteilungen“', (await main.ev(`[...document.querySelectorAll('a')].some((a) => a.textContent === '← Alle Mitteilungen')`)) === true);
  console.log('  Bild:', await bild('B-pc-detail.png'));
  check('keine Seitenfehler', kein().length === 0, kein().join(' | '));

  // ------------------------------------------------------------------ C: Handy 360 px
  console.log('\nC: Handy 360 px — Kopfzeile und Fenster');
  await oeffne(V('&teil=glocke'), 360, 740);
  check('Glocke da', await warteAuf(`!!document.querySelector('.due-bell-btn')`));
  check('Kopfzeile ragt nicht heraus (kein Querscrollen)', (await querscroll()) <= 0, await querscroll());
  const kopf = await main.ev(KOPF_TEILE);
  check('alle Knöpfe/Links der Kopfzeile im Bild (0–360)', kopf.every((t) => t.l >= 0 && t.r <= 360), kopf);
  const knopf = await main.ev(`(() => { const r = document.querySelector('.due-bell-btn').getBoundingClientRect(); return { w: r.width, h: r.height, r: r.right }; })()`);
  check(`Glocke ≥ 44 px (Finger/Handschuhe): ${knopf.w}×${knopf.h}`, knopf.w >= 44 && knopf.h >= 44 && knopf.r <= 360, knopf);
  check('App-Symbol bleibt, Name nicht halb abgeschnitten', (await main.ev(`(() => { const c = document.querySelector('.app-chip'); return c.getBoundingClientRect().width >= 24 && c.scrollWidth <= c.clientWidth; })()`)) === true);
  console.log('  Bild:', await bild('C-handy-kopf.png'));
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  await warteAuf(`!!document.querySelector('.mt-pop')`, 3000);
  const pop = await main.ev(`(() => { const r = document.querySelector('.mt-pop').getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width }; })()`);
  check('Fenster über die Breite, ganz im Bild (14 px Rand)', pop.l >= 0 && pop.r <= 360 && pop.w >= 300, pop);
  const zeilen = await main.ev(`[...document.querySelectorAll('.mt-pop .mt-eintrag')].map((e) => e.getBoundingClientRect().height)`);
  check('Einträge ≥ 48 px hoch', zeilen.length === 6 && zeilen.every((h) => h >= 48), zeilen);
  check('kein Querscrollen mit offenem Fenster', (await querscroll()) <= 0);
  console.log('  Bild:', await bild('C-handy-fenster.png'));

  for (const breite of [300, 320, 340, 360, 390, 412, 421, 440, 460, 480, 520, 600, 768, 960, 1000]) {
    await oeffne(V('&teil=glocke'), breite, 700);
    await warteAuf(`!!document.querySelector('.due-bell-btn')`);
    const t = await main.ev(KOPF_TEILE);
    const raus = t.filter((x) => x.l < 0 || x.r > breite);
    const chip = await main.ev(`(() => { const c = document.querySelector('.app-chip'); return !c || c.getBoundingClientRect().width === 0 || c.scrollWidth <= c.clientWidth; })()`);
    check(`${breite} px: nichts ragt heraus, kein halber App-Name`, raus.length === 0 && (await querscroll()) <= 0 && chip, { raus, chip });
  }

  // ------------------------------------------------------------------ D: Seite „Alle Mitteilungen“
  console.log('\nD: Seite „Alle Mitteilungen“ am Handy');
  await oeffne(V(), 360, 740);
  check('Seite da (3 Gruppen)', await warteAuf(`document.querySelectorAll('.mt-seite h2.mt-gruppe-kopf').length === 3`));
  const sz = await main.ev(`[...document.querySelectorAll('.mt-seite a.mt-eintrag')].map((e) => e.getBoundingClientRect().height)`);
  check('6 Einträge als Links, je ≥ 56 px', sz.length === 6 && sz.every((h) => h >= 56), sz);
  check('Seite öffnet = gesehen: kein Zähler an der Glocke, die 4 neuen bleiben markiert', (await main.ev(`!document.querySelector('.due-bell-count')`)) && (await main.ev(`document.querySelectorAll('.mt-seite .mt-neu').length`)) === 4);
  check('kein Querscrollen', (await querscroll()) <= 0, await querscroll());
  console.log('  Bild:', await bild('D-handy-liste.png'));
  await main.ev(`document.querySelector('.mt-seite a.mt-eintrag').click()`, true);
  check('Klick auf Eintrag → Detail Schnee-Wecker', await warteAuf(`document.querySelector('.mt-detail h1')?.textContent === '❄️ Schnee-Wecker'`, 5000));
  check('kritisch: rot markiert (Rand)', await main.ev(`document.querySelector('.mt-detail').classList.contains('mt-kritisch')`));
  check('kein Querscrollen im Detail (Karte „Heute Nacht“ inklusive)', (await querscroll()) <= 0, await querscroll());
  console.log('  Bild:', await bild('D-handy-detail.png'));
  check('keine Seitenfehler', kein().length === 0, kein().join(' | '));

  // ------------------------------------------------------------------ E: leer / gestört
  console.log('\nE: leer / gestört');
  await oeffne(V('&teil=glocke&zustand=leer'));
  await warteAuf(`!!document.querySelector('.due-bell-btn')`);
  check('leer: Glocke ohne Zähler', await main.ev(`!document.querySelector('.due-bell-count')`));
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  check('leer: „Keine Mitteilungen in den letzten 30 Tagen.“', await warteAuf(`document.querySelector('.mt-pop .due-pop-empty')?.textContent === 'Keine Mitteilungen in den letzten 30 Tagen.'`, 3000));
  await oeffne(V('&teil=glocke&zustand=gestoert'));
  await warteAuf(`!!document.querySelector('.due-bell-btn')`);
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  check('gestört: „nicht aktuell · Stand Do 10:00“ (letzter Stand bleibt)', await warteAuf(`/nicht aktuell · Stand/.test(document.querySelector('.mt-pop .due-pop-head')?.textContent ?? '') && document.querySelectorAll('.mt-pop .mt-eintrag').length === 6`, 3000), await main.ev(`document.querySelector('.mt-pop .due-pop-head')?.textContent`));
  check('keine Seitenfehler', kein().length === 0, kein().join(' | '));
} catch (e) {
  fail++;
  console.log('ABBRUCH', e);
} finally {
  edge.kill();
}
console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler — Bilder in ${aus}`);
process.exit(fail === 0 ? 0 : 1);
