// Klick-Test Mitteilungs-Center (26.11.2026, Vertrag v2) in Edge headless — NUR Beispieldaten der Vorschau
// (/vorschau?app=winterdex&seite=mitteilungen, src/dev/MitteilungenVorschau.tsx), nie echte Server/Kundendaten.
// Browser absichtlich auf UTC (falsch eingestellter PC): Tage und Uhrzeiten müssen trotzdem Wiener Zeit sein.
//   A: PC 1280 px — Glocke mit Zähler 4 (erster Besuch: letzte 24 Std.), Fenster Heute/Gestern/Älter, voller Text der
//      amtlichen Warnung, Zähler nach dem Öffnen weg, Escape schließt
//   B: Klick auf die amtliche Warnung → BOX über der Seite (Vertrag v2): voller Text, Uhrzeit in Wiener Zeit, Fokus,
//      Tab bleibt drin, Escape/OK/Klick daneben schließen; „Zur Karte“ ist ein Link (Rückfrage greift) → Karte
//      „Heute Nacht“ aufgeklappt
//   C: Handy 360 px — Kopfzeile ragt nicht heraus, Glocke im Bild, Fenster über die Breite, Tippflächen ≥ 44 px;
//      dazu 300–1000 px: kein Knopf der Kopfzeile ragt aus dem Bild (Abmelden schrumpfte bei 360/421/440 px hinaus)
//   D: Seite „Alle Mitteilungen“ am Handy — große Einträge, Klick öffnet DIESELBE Box (Knöpfe ≥ 48 px), kein Querscrollen
//   E: leer (Pro / Free: ruhiger Text, Glocke bleibt) / gestört
//   F: Hinweis „Neu: Heute Nacht und Mitteilungen“ (PC + Handy) und Onboarding-Schritt „Wetter-Guide & Mitteilungen“
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

  // ------------------------------------------------------------------ B: Klick → Box (Vertrag v2)
  console.log('\nB: Klick auf die amtliche Warnung → Box über der Seite (keine Detailseite)');
  const adresseVorher = await main.ev(`location.pathname + location.search + location.hash`);
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  await warteAuf(`!!document.querySelector('.mt-pop')`, 3000);
  // Rückfrage „Aufzeichnung läuft / Einsatz nicht gespeichert“ (useUnsavedGuard) nachgestellt: fängt Klicks auf Links in
  // der Capture-Phase ab. Ein Eintrag ist KEIN Link mehr (er wechselt die Seite nicht) — die Rückfrage darf nicht kommen.
  await main.ev(`window.__abgefangen = 0; window.__wache = (e) => { if (e.target.closest?.('a[href]')) { e.preventDefault(); e.stopPropagation(); window.__abgefangen++; } }; document.addEventListener('click', window.__wache, true); true`);
  await main.ev(`[...document.querySelectorAll('.mt-pop .mt-eintrag')].find((x) => x.querySelector('.mt-titel').textContent === 'Amtliche Warnung').click()`, true);
  check('Box offen, Fenster zu, Seite NICHT gewechselt, keine Rückfrage (Eintrag ist ein Knopf)',
    (await warteAuf(`!!document.querySelector('.mt-box')`, 3000)) && (await main.ev(`!document.querySelector('.mt-pop') && window.__abgefangen === 0`)) && (await main.ev(`location.pathname + location.search + location.hash`)) === adresseVorher,
    await main.ev(`({ box: !!document.querySelector('.mt-box'), pop: !!document.querySelector('.mt-pop'), abgefangen: window.__abgefangen, adresse: location.href })`));
  const box = await main.ev(`({ h: document.querySelector('.mt-box h2').textContent, zeit: document.querySelector('.mt-box .mt-box-titel .muted').textContent, text: document.querySelector('.mt-box-text').textContent, rolle: document.querySelector('.mt-box').getAttribute('role'), modal: document.querySelector('.mt-box').getAttribute('aria-modal'), fokus: document.activeElement?.textContent?.trim() })`);
  check(`Box: Titel + „${box.zeit}“ (Wiener Zeit)`, box.h === 'Amtliche Warnung' && box.zeit === 'Do, 26.11.2026, 00:30 Uhr', box);
  check('Box: voller Text', box.text === K9_VOLL);
  check('Box: Dialog (aria-modal), Fokus auf „OK“', box.rolle === 'dialog' && box.modal === 'true' && box.fokus === 'OK', box);
  check('Box: Symbol der Art (amtlich) groß', await main.ev(`!!document.querySelector('.mt-box .mt-sym.mt-s-amtlich.mt-sym-gross')`));
  const knoepfe = await main.ev(`[...document.querySelectorAll('.mt-box-knoepfe > *')].map((e) => ({ t: e.textContent.trim(), tag: e.tagName, h: Math.round(e.getBoundingClientRect().height) }))`);
  check('Box: Knöpfe „Zur Karte“ (Link) und „OK“, je ≥ 48 px', knoepfe.length === 2 && knoepfe[0].t === 'Zur Karte' && knoepfe[0].tag === 'A' && knoepfe[1].t === 'OK' && knoepfe.every((k) => k.h >= 48), knoepfe);
  check('Box in den Farben der App (im Bereich, nicht am <body>)', await main.ev(`!!document.querySelector('.app-scope .mt-box')`));
  console.log('  Bild:', await bild('B-pc-box.png'));
  await main.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  check('Tab bleibt in der Box (von „OK“ zurück auf „Zur Karte“)', (await main.ev(`document.activeElement?.textContent?.trim()`)) === 'Zur Karte', await main.ev(`document.activeElement?.outerHTML?.slice(0, 80)`));
  // Klick in den Text: Fokus auf der Box selbst (tabIndex -1) — Umschalt+Tab darf von dort nicht auf die Seite dahinter
  await main.ev(`document.querySelector('.mt-box').focus(); document.activeElement === document.querySelector('.mt-box')`);
  await main.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
  await main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
  check('Umschalt+Tab nach Klick in den Text bleibt in der Box (auf „OK“)', (await main.ev(`document.activeElement?.textContent?.trim()`)) === 'OK', await main.ev(`document.activeElement?.outerHTML?.slice(0, 80)`));
  await main.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('Escape schließt die Box, Fokus zurück auf der Glocke', (await warteAuf(`!document.querySelector('.mt-box')`, 2000)) && (await main.ev(`document.activeElement === document.querySelector('.due-bell-btn')`)));
  // noch einmal öffnen: „OK“ schließt; Klick daneben schließt
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  await warteAuf(`!!document.querySelector('.mt-pop')`, 3000);
  await main.ev(`document.querySelector('.mt-pop .mt-eintrag').click()`, true);
  await warteAuf(`!!document.querySelector('.mt-box')`, 3000);
  await main.ev(`[...document.querySelectorAll('.mt-box-knoepfe button')].find((b) => b.textContent.trim() === 'OK').click()`, true);
  check('„OK“ schließt', await warteAuf(`!document.querySelector('.mt-box')`, 2000));
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  await warteAuf(`!!document.querySelector('.mt-pop')`, 3000);
  await main.ev(`document.querySelector('.mt-pop .mt-eintrag').click()`, true);
  await warteAuf(`!!document.querySelector('.mt-box')`, 3000);
  const hinter = await main.ev(`(() => { const r = document.querySelector('.mt-box').getBoundingClientRect(); return { x: Math.round(r.right + 20), y: Math.round(r.top + 30) }; })()`);
  await main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hinter.x, y: hinter.y, button: 'left', clickCount: 1 });
  await main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hinter.x, y: hinter.y, button: 'left', clickCount: 1 });
  check('Klick daneben schließt', await warteAuf(`!document.querySelector('.mt-box')`, 2000));
  // „Zur Karte“ ist ein Link: die Rückfrage (Wache) greift — Abbrechen → Box bleibt, Seite bleibt
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  await warteAuf(`!!document.querySelector('.mt-pop')`, 3000);
  await main.ev(`[...document.querySelectorAll('.mt-pop .mt-eintrag')].find((x) => x.querySelector('.mt-titel').textContent === 'Amtliche Warnung').click()`, true);
  await warteAuf(`!!document.querySelector('.mt-box')`, 3000);
  await main.ev(`[...document.querySelectorAll('.mt-box a')].find((a) => a.textContent.trim() === 'Zur Karte').click()`, true);
  await sleep(300);
  check('„Zur Karte“ mit Rückfrage → Abbrechen: Box bleibt, kein Wechsel (Link, Rückfrage greift)',
    (await main.ev(`window.__abgefangen === 1 && !!document.querySelector('.mt-box') && !location.hash`)) === true,
    await main.ev(`({ abgefangen: window.__abgefangen, box: !!document.querySelector('.mt-box'), hash: location.hash })`));
  await main.ev(`document.removeEventListener('click', window.__wache, true); true`);
  await main.ev(`[...document.querySelectorAll('.mt-box a')].find((a) => a.textContent.trim() === 'Zur Karte').click()`, true);
  check('„Zur Karte“ → Box zu, #heute-nacht, Karte „Heute Nacht“ AUFGEKLAPPT (Stunden-Streifen sichtbar)',
    (await warteAuf(`location.hash === '#heute-nacht' && !document.querySelector('.mt-box') && !!document.querySelector('section.hn#heute-nacht .hn-streifen-rahmen')`, 5000)) &&
      (await main.ev(`document.querySelector('section.hn .hn-auf')?.getAttribute('aria-expanded')`)) === 'true',
    await main.ev(`({ hash: location.hash, box: !!document.querySelector('.mt-box'), karte: !!document.querySelector('section.hn'), auf: document.querySelector('section.hn .hn-auf')?.getAttribute('aria-expanded') })`));
  check('… Karte im Bild (nicht unter der Kopfzeile)', await main.ev(`(() => { const r = document.querySelector('section.hn').getBoundingClientRect(); return r.top >= 56 && r.top < window.innerHeight; })()`));
  console.log('  Bild:', await bild('B-pc-zur-karte.png'));
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
  const sz = await main.ev(`[...document.querySelectorAll('.mt-seite button.mt-eintrag')].map((e) => e.getBoundingClientRect().height)`);
  check('6 Einträge (Knöpfe), je ≥ 56 px', sz.length === 6 && sz.every((h) => h >= 56), sz);
  check('Seite öffnet = gesehen: kein Zähler an der Glocke, die 4 neuen bleiben markiert', (await main.ev(`!document.querySelector('.due-bell-count')`)) && (await main.ev(`document.querySelectorAll('.mt-seite .mt-neu').length`)) === 4);
  check('kein Querscrollen', (await querscroll()) <= 0, await querscroll());
  console.log('  Bild:', await bild('D-handy-liste.png'));
  // erst fokussieren (wie ein echter Klick in Chrome/Edge) — danach muss der Fokus dorthin zurück
  await main.ev(`(() => { const b = document.querySelector('.mt-seite button.mt-eintrag'); b.focus(); b.click(); return true; })()`, true);
  check('Klick auf Eintrag → DIESELBE Box (Schnee-Wecker), Seite bleibt darunter', (await warteAuf(`document.querySelector('.mt-box h2')?.textContent === '❄️ Schnee-Wecker'`, 5000)) && (await main.ev(`!!document.querySelector('.mt-seite')`)));
  check('kritisch: rot markiert (Rand oben)', await main.ev(`document.querySelector('.mt-box').classList.contains('mt-kritisch')`));
  const boxHandy = await main.ev(`(() => { const r = document.querySelector('.mt-box').getBoundingClientRect(); const k = [...document.querySelectorAll('.mt-box-knopf')].map((e) => { const q = e.getBoundingClientRect(); return { w: Math.round(q.width), h: Math.round(q.height), r: Math.round(q.right) }; }); return { l: r.left, r: r.right, k }; })()`);
  check('Box am Handy ganz im Bild, Knöpfe ≥ 48 px hoch und breit genug (Handschuhe)', boxHandy.l >= 0 && boxHandy.r <= 360 && boxHandy.k.length === 2 && boxHandy.k.every((k) => k.h >= 48 && k.w >= 120 && k.r <= 360), boxHandy);
  check('kein Querscrollen mit offener Box', (await querscroll()) <= 0, await querscroll());
  console.log('  Bild:', await bild('D-handy-box.png'));
  await main.ev(`[...document.querySelectorAll('.mt-box-knoepfe button')].find((b) => b.textContent.trim() === 'OK').click()`, true);
  check('„OK“ → Box zu, Fokus zurück auf dem Eintrag', (await warteAuf(`!document.querySelector('.mt-box')`, 2000)) && (await main.ev(`document.activeElement === document.querySelector('.mt-seite button.mt-eintrag')`)));
  check('keine Seitenfehler', kein().length === 0, kein().join(' | '));

  // gleich geöffnet (&id=41) am Handy: „Zur Karte“ → Karte aufgeklappt
  await oeffne(V('&id=41'), 360, 740);
  check('&id=41: Box gleich offen', await warteAuf(`document.querySelector('.mt-box h2')?.textContent === '❄️ Schnee-Wecker'`, 5000));
  await main.ev(`[...document.querySelectorAll('.mt-box a')].find((a) => a.textContent.trim() === 'Zur Karte').click()`, true);
  check('Handy: „Zur Karte“ → Karte „Heute Nacht“ aufgeklappt, kein Querscrollen',
    (await warteAuf(`location.hash === '#heute-nacht' && !!document.querySelector('section.hn .hn-streifen-rahmen')`, 5000)) && (await querscroll()) <= 0);
  console.log('  Bild:', await bild('D-handy-zur-karte.png'));

  // ruhige Nacht (grün): ohne „Zur Karte“ eingeklappt — mit „Zur Karte“ trotzdem aufgeklappt (wie am Handy)
  await oeffne(V('&teil=neu&karte=gruen'));
  check('ruhige Nacht, normal geöffnet: Karte eingeklappt', await warteAuf(`document.querySelector('section.hn .hn-auf')?.getAttribute('aria-expanded') === 'false' && !document.querySelector('section.hn .hn-streifen-rahmen')`, 5000));
  await oeffne(V('&id=41&karte=gruen'));
  await warteAuf(`!!document.querySelector('.mt-box')`, 5000);
  await main.ev(`[...document.querySelectorAll('.mt-box a')].find((a) => a.textContent.trim() === 'Zur Karte').click()`, true);
  check('ruhige Nacht: „Zur Karte“ klappt die Karte trotzdem auf',
    await warteAuf(`location.hash === '#heute-nacht' && document.querySelector('section.hn .hn-auf')?.getAttribute('aria-expanded') === 'true' && !!document.querySelector('section.hn .hn-streifen-rahmen')`, 5000),
    await main.ev(`({ hash: location.hash, auf: document.querySelector('section.hn .hn-auf')?.getAttribute('aria-expanded') })`));
  await main.ev(`document.querySelector('section.hn .hn-auf').click()`, true);
  check('… „Weniger“ klappt sie danach wieder zu (Wahl bleibt beim Nutzer)', await warteAuf(`document.querySelector('section.hn .hn-auf')?.getAttribute('aria-expanded') === 'false'`, 2000));
  console.log('  Bild:', await bild('D-pc-zur-karte-gruen.png'));

  // ------------------------------------------------------------------ E: leer / gestört
  console.log('\nE: leer / gestört');
  await oeffne(V('&teil=glocke&zustand=leer'));
  await warteAuf(`!!document.querySelector('.due-bell-btn')`);
  check('leer: Glocke ohne Zähler', await main.ev(`!document.querySelector('.due-bell-count')`));
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  check('leer (Pro): „Noch keine Mitteilungen in den letzten 30 Tagen.“', await warteAuf(`document.querySelector('.mt-pop .due-pop-empty')?.textContent === 'Noch keine Mitteilungen in den letzten 30 Tagen.'`, 3000));
  await oeffne(V('&teil=glocke&zustand=leer&pro=0'));
  await warteAuf(`!!document.querySelector('.due-bell-btn')`);
  check('leer (Free): Glocke trotzdem da', await main.ev(`!!document.querySelector('.due-bell-btn')`));
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  check('leer (Free): „Hier erscheinen Glätte-Frühwarnung und Wetter-Hinweise (WinterDex Pro).“ — ohne Kauf-Knopf',
    (await warteAuf(`document.querySelector('.mt-pop .due-pop-empty')?.textContent === 'Hier erscheinen Glätte-Frühwarnung und Wetter-Hinweise (WinterDex Pro).'`, 3000)) && (await main.ev(`![...document.querySelectorAll('.mt-pop a')].some((a) => /abo|kauf/i.test(a.href + a.textContent))`)));
  await oeffne(V('&zustand=leer&pro=0'), 360, 740);
  check('Seite leer (Free): derselbe ruhige Text', await warteAuf(`document.querySelector('.mt-seite .card.muted')?.textContent === 'Hier erscheinen Glätte-Frühwarnung und Wetter-Hinweise (WinterDex Pro).'`, 3000));
  await oeffne(V('&teil=glocke&zustand=gestoert'));
  await warteAuf(`!!document.querySelector('.due-bell-btn')`);
  await main.ev(`document.querySelector('.due-bell-btn').click()`, true);
  check('gestört: „nicht aktuell · Stand Do 10:00“ (letzter Stand bleibt)', await warteAuf(`/nicht aktuell · Stand/.test(document.querySelector('.mt-pop .due-pop-head')?.textContent ?? '') && document.querySelectorAll('.mt-pop .mt-eintrag').length === 6`, 3000), await main.ev(`document.querySelector('.mt-pop .due-pop-head')?.textContent`));
  check('keine Seitenfehler', kein().length === 0, kein().join(' | '));

  // ------------------------------------------------------------------ F: Hinweis „Neu“ und Onboarding-Schritt
  console.log('\nF: Hinweis „Neu: Heute Nacht und Mitteilungen“ und Onboarding-Schritt „Wetter-Guide & Mitteilungen“');
  for (const [breite, hoehe] of [[1280, 900], [360, 740]]) {
    await oeffne(V('&teil=neu&pro=0'), breite, hoehe);
    check(`${breite} px: Hinweis „Neu“ über der Karte „Heute Nacht“`,
      await warteAuf(`(() => { const n = document.querySelector('.mt-neu-hinweis'); const h = document.querySelector('section.hn'); return !!n && !!h && !!(n.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING); })()`, 5000));
    const neu = await main.ev(`({ h: document.querySelector('.mt-neu-hinweis h2').textContent.trim(), punkte: [...document.querySelectorAll('.mt-neu-hinweis .mt-erklaer b')].map((b) => b.textContent), pro: document.querySelectorAll('.mt-neu-hinweis .mt-erklaer .mt-pro').length, text: document.querySelector('.mt-neu-hinweis').textContent, k: [...document.querySelectorAll('.mt-neu-knoepfe .btn')].map((e) => Math.round(e.getBoundingClientRect().height)) })`);
    check(`${breite} px: Titel, vier Punkte (Schnee-Wecker frei: mit „Pro“ und Wecker-Hinweis), Pro ruhig (Free), Knöpfe ≥ 48 px`,
      neu.h === 'Neu: Heute Nacht und Mitteilungen' && neu.punkte.join('|') === 'Heute Nacht|Glocke oben rechts|Mitteilungen aufs Handy|Schnee-Wecker' && neu.pro === 1 && neu.text.includes('Der Schnee-Wecker ersetzt keinen eigenen Wecker.') &&
        neu.text.includes('Mitteilungen aufs Handy gibt es mit WinterDex Pro.') && neu.k.length === 2 && neu.k.every((h) => h >= 48), neu);
    check(`${breite} px: kein Querscrollen`, (await querscroll()) <= 0, await querscroll());
    console.log('  Bild:', await bild(`F-${breite}-neu.png`));
    await main.ev(`[...document.querySelectorAll('.mt-neu-knoepfe button')].find((b) => b.textContent.trim() === 'Alles klar').click()`, true);
    check(`${breite} px: „Alles klar“ blendet den Hinweis aus, die Karte bleibt`, (await warteAuf(`!document.querySelector('.mt-neu-hinweis')`, 2000)) && (await main.ev(`!!document.querySelector('section.hn')`)));
  }
  await oeffne(V('&teil=neu'));
  await warteAuf(`!!document.querySelector('.mt-neu-hinweis')`, 5000);
  check('Pro: kein Pro-Hinweis im Hinweis „Neu“', !(await main.ev(`document.querySelector('.mt-neu-hinweis').textContent.includes('WinterDex Pro')`)));
  // Schnee-Wecker am Server noch nicht frei (K10 fehlt in guide_live_arten): nie etwas versprechen, das man nicht findet
  await oeffne(V('&teil=neu&wecker=0'));
  await warteAuf(`!!document.querySelector('.mt-neu-hinweis')`, 5000);
  check('Schnee-Wecker noch nicht frei: Hinweis „Neu“ nennt ihn nicht (drei Punkte)',
    (await main.ev(`[...document.querySelectorAll('.mt-neu-hinweis .mt-erklaer b')].map((b) => b.textContent).join('|')`)) === 'Heute Nacht|Glocke oben rechts|Mitteilungen aufs Handy' &&
      !(await main.ev(`document.querySelector('.mt-neu-hinweis').textContent.includes('Schnee-Wecker')`)));
  for (const [rolle, breite] of [['', 360], ['team', 360], ['', 1280]]) {
    await oeffne(V(`&teil=onboarding${rolle ? `&rolle=${rolle}` : ''}`), breite, 740);
    check(`Onboarding ${rolle || 'Inhaber'} ${breite} px: Schritt „Wetter-Guide & Mitteilungen“ mit drei Punkten`,
      await warteAuf(`document.querySelector('.mt-schritt h1')?.textContent === 'Wetter-Guide & Mitteilungen' && document.querySelectorAll('.mt-schritt .mt-erklaer li').length === 3`, 5000));
    const ob = await main.ev(`({ text: document.querySelector('.mt-schritt').textContent, knopf: (() => { const r = document.querySelector('.mt-schritt .btn.ez-big').getBoundingClientRect(); return { h: Math.round(r.height), t: document.querySelector('.mt-schritt .btn.ez-big').textContent.trim() }; })() })`);
    check(`… ${rolle ? 'Mitarbeiter: kein Pro-Hinweis' : 'Inhaber: Pro-Hinweis ruhig'}, kein Schnee-Wecker (Freigabe hier unbekannt), „Weiter zum Dashboard“ ≥ 48 px`,
      (rolle ? !ob.text.includes('WinterDex Pro') && ob.text.includes('Du bist dem Team beigetreten.') : ob.text.includes('Mitteilungen aufs Handy gibt es mit WinterDex Pro.') && ob.text.includes('Dein Betrieb ist angelegt.')) &&
        !ob.text.includes('Schnee-Wecker') && ob.knopf.t === 'Weiter zum Dashboard' && ob.knopf.h >= 48, ob);
    check('… kein Querscrollen', (await querscroll()) <= 0, await querscroll());
    console.log('  Bild:', await bild(`F-onboarding-${rolle || 'inhaber'}-${breite}.png`));
  }
  check('keine Seitenfehler', kein().length === 0, kein().join(' | '));
} catch (e) {
  fail++;
  console.log('ABBRUCH', e);
} finally {
  edge.kill();
}
console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler — Bilder in ${aus}`);
process.exit(fail === 0 ? 0 : 1);
