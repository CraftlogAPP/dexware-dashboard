// Klick-Test „Ganzjahres-Nachweis“ (ObjektDex-Bereich) in Edge headless — NUR Beispieldaten (?demo), nie echte Server.
// Klickt die Seite wie ein Nutzer, fängt das Berichtsfenster ab (Druckdialog stumm), macht daraus über das
// DevTools-Protokoll ein echtes PDF und prüft Seitenzahl und Texte im PDF (pdftotext) sowie die Pro-Regeln je Teil.
//
//   npx vite --port 5207 --strictPort
//   node tests/browser/jahresnachweis-klick.mjs http://localhost:5207 <ausgabe-ordner>
//
// Braucht: Microsoft Edge (EDGE_PATH), pdftotext (Poppler, z. B. Git-Bash ucrt64) im PATH. Bilder/PDFs landen im Ausgabeordner.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [base = 'http://localhost:5207', aus = path.join(tmpdir(), 'jahresnachweis-klick')] = process.argv.slice(2);
mkdirSync(aus, { recursive: true });
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(path.join(tmpdir(), 'edge-jn-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WEG = '00001000-0000-4000-8000-000000000001'; // WEG Lindenstraße 12 — gleiche Adresse in WinterDex
const RING = '00001000-0000-4000-8000-000000000003'; // Bürohaus Am Ring 5 — kein WinterDex-Objekt

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
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) {
      waiting.get(d.id)(d);
      waiting.delete(d.id);
    }
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
  return { ws, send, ev };
}

async function ziele() {
  return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
}

let main;
let mainId;
async function oeffne(url, breite = 1280) {
  await main.send('Emulation.setDeviceMetricsOverride', { width: breite, height: 900, deviceScaleFactor: 1, mobile: breite < 600 });
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
const seitenText = () => main.ev('document.body.innerText');
async function bild(datei) {
  await sleep(400);
  const shot = await main.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(path.join(aus, datei), Buffer.from(shot.result.data, 'base64'));
  return path.join(aus, datei);
}
const klick = (text) =>
  main.ev(
    `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (!b || b.disabled) return false; b.click(); return true; })()`,
    true,
  );

/** Erstellen klicken, Berichtsfenster abfangen, PDF drucken, Text lesen. */
async function erstelleNachweis(knopf, datei) {
  await main.ev(`(() => {
    window.__popup = null; window.__gedruckt = 0;
    if (!window.__origOpen) window.__origOpen = window.open.bind(window);
    window.open = (...a) => { const w = window.__origOpen(...a); if (w) { try { w.print = () => { window.__gedruckt++; }; } catch {} window.__popup = w; } return w; };
    return true; })()`);
  const vorher = new Set((await ziele()).map((t) => t.id));
  await warteAuf(`[...document.querySelectorAll('button')].some((x) => x.textContent.includes(${JSON.stringify(knopf)}) && !x.disabled)`);
  if (!(await klick(knopf))) throw new Error(`Knopf „${knopf}“ fehlt oder ist gesperrt`);
  const fertig = await warteAuf(`!!(window.__popup && window.__popup.document && /nachweis/i.test(window.__popup.document.title) && !/wird erstellt/.test(window.__popup.document.title))`, 30000);
  if (!fertig) throw new Error('Berichtsfenster nicht fertig');
  await sleep(800);
  const info = await main.ev(`(() => { const d = window.__popup.document; const t = (s) => d.querySelector(s)?.innerText ?? null;
    return { titel: d.title, text: d.body.innerText, deck: t('.deck'), wd: t('.wd'), od: t('.od'), wdFree: !!d.querySelector('.wd-free'),
      imgs: d.querySelectorAll('img').length, fehler: (document.querySelector('.error-box')?.innerText ?? null) }; })()`);
  // Popup als echtes PDF ausgeben (Hintergrundgrafiken AUS wie im Druckdialog voreingestellt)
  const neu = (await ziele()).find((t) => !vorher.has(t.id) && t.id !== mainId);
  let pdfText = '';
  let seiten = 0;
  if (neu) {
    const pop = await verbinde(neu.webSocketDebuggerUrl);
    const r = await pop.send('Page.printToPDF', { printBackground: false, preferCSSPageSize: true });
    const pdf = path.join(aus, datei);
    writeFileSync(pdf, Buffer.from(r.result.data, 'base64'));
    pdfText = execFileSync('pdftotext', ['-enc', 'UTF-8', '-layout', pdf, '-'], { encoding: 'utf8' });
    seiten = pdfText.split('\f').filter((s) => s.trim()).length;
    // Ansicht wie gedruckt (Druck-Medium, A4-Breite) als Bild — nur zum Anschauen, ohne Seitenumbrüche
    await pop.send('Emulation.setEmulatedMedia', { media: 'print' });
    await pop.send('Emulation.setDeviceMetricsOverride', { width: 794, height: 1123, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const hoehe = Number((await pop.send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true })).result?.result?.value ?? 1123);
    const shot = await pop.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 794, height: Math.min(3400, hoehe), scale: 1 } });
    if (shot.result?.data) writeFileSync(pdf.replace(/\.pdf$/, '-ansicht.png'), Buffer.from(shot.result.data, 'base64'));
    await pop.send('Page.close').catch(() => {});
    pop.ws.close();
  }
  return { ...info, pdfText, seiten };
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
  mainId = target.id;
  main = await verbinde(target.webSocketDebuggerUrl);
  await main.send('Page.enable');

  // ------------------------------------------------------------------ A: Standard (beide Pro, Objekt mit Winterdienst)
  console.log('\nA: WEG Lindenstraße 12, letzte 12 Monate, mit Fotos, beide Apps Pro');
  await oeffne(`${base}/app/objektdex/jahresnachweis?demo&sauber&objekt=${WEG}`);
  check('Seite lädt mit Objekt und WinterDex-Wahl', await warteAuf(`document.body.innerText.includes('Über die Adresse gefunden')`));
  let t = await seitenText();
  check('Überschrift + Abschnitte', /Ganzjahres-Nachweis/.test(t) && /1\. Objekt und Zeitraum/.test(t) && /2\. Winterdienst aus WinterDex/.test(t) && /3\. Erstellen/.test(t));
  check('WinterDex-Objekt automatisch per Adresse', /Enthält: Winterdienst \(WinterDex-Objekt „WEG Lindenstraße 12“\)/.test(t), t);
  check('Zeitraum-Vorauswahl letzte 12 Monate', /Zeitraum: \d\d\.\d\d\.\d{4} – \d\d\.\d\d\.\d{4}/.test(t));
  console.log('  Bild:', await bild('A-seite.png'));
  const a = await erstelleNachweis('Ganzjahres-Nachweis erstellen', 'A-nachweis.pdf');
  check('PDF hat Seiten (Deckblatt + 2 Teile)', a.seiten >= 3, a.seiten);
  const muss = ['GANZJAHRES-NACHWEIS', 'WEG Lindenstraße 12', 'Lindenstraße 12, 80331 München', 'Hausverwaltung Meier GmbH', 'Objektservice Brandl', 'Übersicht', 'Winterdienst-Einsätze', 'Soll/Ist', 'offene Mängel', 'Winterdienst', 'Objektbetreuung', 'Wetterdaten: Open-Meteo.com (CC BY 4.0)', 'Prüfcode', 'STORNIERT', 'Nachgetragen*', 'Geräumt + gestreut', 'Treppenhausreinigung', 'Mängel'];
  for (const s of muss) check(`PDF-Text enthält „${s}“`, a.pdfText.includes(s));
  check('Rechtsgrundlage-Zeile aus WinterDex', /Verkehrssicherungspflicht/.test(a.pdfText));
  check('kein Wasserzeichen / Gratis-Hinweis mit Pro', !/WinterDex Free/.test(a.text) && !/Gratis-Version/.test(a.text) && !a.wdFree);
  check('Fotos eingebettet', a.imgs > 0, a.imgs);
  check('Druckdialog wurde angestoßen (abgefangen)', (await main.ev('window.__gedruckt')) >= 1);
  check('Reihenfolge: Deckblatt, Winterdienst, Objektbetreuung', a.text.indexOf('Übersicht') < a.text.indexOf('aus WinterDex\n') || (a.text.indexOf('Übersicht') < a.text.lastIndexOf('Winterdienst') && a.text.lastIndexOf('Winterdienst') < a.text.lastIndexOf('Objektbetreuung')));
  check('Kennzeichnung „nachgetragen“ erklärt', /\* Nachgetragen:/.test(a.text));

  // ------------------------------------------------------------------ B: ohne Pro in beiden Apps
  console.log('\nB: beide Apps ohne Pro (Wasserzeichen/Hinweis je Teil)');
  await oeffne(`${base}/app/objektdex/jahresnachweis?demo&sauber&gratis&wdgratis&objekt=${WEG}`);
  await warteAuf(`document.body.innerText.includes('Über die Adresse gefunden')`);
  const b = await erstelleNachweis('Ganzjahres-Nachweis erstellen', 'B-gratis.pdf');
  check('WinterDex-Teil trägt das Wasserzeichen (Klasse wd-free)', b.wdFree);
  check('„Erstellt mit WinterDex Free“ im Winterdienst-Teil', /Erstellt mit WinterDex Free/.test(b.wd ?? ''));
  check('kein WinterDex-Wasserzeichen im ObjektDex-Teil', !/WinterDex Free/.test(b.od ?? ''));
  check('ObjektDex-Gratis-Hinweis im ObjektDex-Teil', /Erstellt mit ObjektDex – Gratis-Version · objektdex\.dexware\.app/.test(b.od ?? ''));
  check('kein ObjektDex-Hinweis im Winterdienst-Teil', !/Gratis-Version/.test(b.wd ?? ''));
  check('Hinweise auch im PDF-Text', /Erstellt mit WinterDex Free/.test(b.pdfText) && /Gratis-Version/.test(b.pdfText));
  check('Deckblatt nennt die Gratis-Stände', /\(WinterDex Free\)/.test(b.deck ?? '') && /\(ObjektDex Gratis-Version\)/.test(b.deck ?? ''));

  // ------------------------------------------------------------------ C: Objekt ohne Winterdienst, dann von Hand gewählt
  console.log('\nC: Bürohaus Am Ring 5 (kein WinterDex-Objekt mit dieser Adresse)');
  await oeffne(`${base}/app/objektdex/jahresnachweis?demo&sauber&objekt=${RING}`);
  check('Hinweis „kein WinterDex-Objekt gefunden“', await warteAuf(`document.body.innerText.includes('Kein WinterDex-Objekt mit dieser Adresse gefunden')`));
  t = await seitenText();
  check('Enthält nur die Objektbetreuung', /Enthält nur die Objektbetreuung/.test(t));
  const c = await erstelleNachweis('Ganzjahres-Nachweis erstellen', 'C-ohne-winterdienst.pdf');
  check('PDF ohne Winterdienst-Teil', c.wd === null && c.od !== null);
  check('dezenter Hinweis auf dem Deckblatt', /Winterdienst ist in diesem Nachweis nicht enthalten\./.test(c.pdfText));
  check('keine Winterdienst-Kachel in der Übersicht', !/Winterdienst-Einsätze/.test(c.deck ?? ''));
  check('PDF hat Seiten', c.seiten >= 2, c.seiten);
  // von Hand: Ärztehaus Mitte wählen
  await main.ev(`(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text.includes('Ärztehaus Mitte'))); const o = [...s.options].find((o) => o.text.includes('Ärztehaus Mitte'));
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  check('von Hand gewählt', await warteAuf(`document.body.innerText.includes('Von Hand gewählt.')`));
  const c2 = await erstelleNachweis('Ganzjahres-Nachweis erstellen', 'C2-von-hand.pdf');
  check('PDF nennt das gewählte WinterDex-Objekt', /Objekt in WinterDex: Ärztehaus Mitte/.test(c2.wd ?? ''), c2.wd?.slice(0, 200));

  // ------------------------------------------------------------------ D: Vorjahr, ohne Fotos
  console.log('\nD: Kalenderjahr (Vorjahr), Fotos aus');
  await oeffne(`${base}/app/objektdex/jahresnachweis?demo&sauber&objekt=${WEG}`);
  await warteAuf(`document.body.innerText.includes('Über die Adresse gefunden')`);
  const jahr = Number(await main.ev(`new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric' }).format(new Date())`));
  check('Chip Vorjahr gedrückt', await klick(`Kalenderjahr ${jahr - 1}`));
  await main.ev(`(() => { const c = [...document.querySelectorAll('input[type=checkbox]')].find((x) => x.closest('label')?.innerText.includes('Fotos anhängen')); c.click(); return c.checked; })()`, true);
  t = await seitenText();
  check('Zeitraum-Text Vorjahr', new RegExp(`Kalenderjahr ${jahr - 1} \\(01\\.01\\.${jahr - 1} – 31\\.12\\.${jahr - 1}\\)`).test(t));
  const d = await erstelleNachweis('Ganzjahres-Nachweis erstellen', 'D-vorjahr-ohne-fotos.pdf');
  check('keine Bilder im PDF', d.imgs === 0, d.imgs);
  check('Fotos werden nur gezählt, ohne Warnhinweis', /\d Fotos?/.test(d.wd ?? '') && !/nicht enthalten/.test(d.wd ?? ''));
  check('Zeitraum-Label im PDF', new RegExp(`Kalenderjahr ${jahr - 1}`).test(d.pdfText));
  check('Objektbetreuung im Vorjahr leer (Beispieldaten erst seit 6 Wochen)', /Keine Einsätze im Zeitraum\./.test(d.od ?? ''));
  check('Winterdienst-Einsätze aus Nov/Dez des Vorjahres', /Winterdienst-Einsätze\s*\n?\s*[1-9]/.test(d.deck ?? ''), d.deck?.slice(0, 400));

  // ------------------------------------------------------------------ E: freier Zeitraum mit Fehler
  console.log('\nE: freier Zeitraum (Von nach Bis)');
  await oeffne(`${base}/app/objektdex/jahresnachweis?demo&sauber&objekt=${WEG}`);
  await warteAuf(`document.body.innerText.includes('Über die Adresse gefunden')`);
  await klick('Frei wählen');
  await main.ev(`(() => { const [v, b] = document.querySelectorAll('input[type=date]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(v, '2026-05-10'); v.dispatchEvent(new Event('input', { bubbles: true })); set.call(b, '2026-05-01'); b.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(300);
  t = await seitenText();
  check('Fehler „Von liegt nach Bis“ sichtbar', /„Von“ liegt nach „Bis“/.test(t));
  check('Erstellen gesperrt', (await main.ev(`[...document.querySelectorAll('button')].find((x) => x.textContent.includes('Ganzjahres-Nachweis erstellen')).disabled`)) === true);

  // ------------------------------------------------------------------ F: Mitarbeiter
  console.log('\nF: Mitarbeiter-Sicht');
  await oeffne(`${base}/app/objektdex/jahresnachweis?demo&sauber&rolle=worker&objekt=${WEG}`);
  check('Mitarbeiter: nur Hinweis, kein Formular', await warteAuf(`document.body.innerText.includes('Den Ganzjahres-Nachweis erstellen Inhaber und Verwalter')`));
  check('kein Erstellen-Knopf', !(await main.ev(`[...document.querySelectorAll('button')].some((x) => x.textContent.includes('Ganzjahres-Nachweis erstellen'))`)));

  // ------------------------------------------------------------------ G: Wege zur Seite + Regel-1-Fix im ObjektDex-PDF
  console.log('\nG: Links und Gratis-Hinweis im Nachweis-PDF von ObjektDex');
  await oeffne(`${base}/app/objektdex/objekte/${WEG}?demo&sauber`);
  check('Objekt-Detail: Link „Ganzjahres-Nachweis“ (Inhaber)', await warteAuf(`!!document.querySelector('a[href*="/jahresnachweis?objekt=${WEG}"]')`));
  await oeffne(`${base}/app/objektdex/objekte/${WEG}?demo&sauber&rolle=worker`);
  await warteAuf(`document.body.innerText.includes('Soll/Ist')`);
  check('Objekt-Detail: kein Link für Mitarbeiter', !(await main.ev(`!!document.querySelector('a[href*="/jahresnachweis"]')`)));
  await oeffne(`${base}/app/objektdex/nachweis?demo&sauber&gratis&objekt=${WEG}`);
  check('Nachweis-PDF-Seite verweist auf den Ganzjahres-Nachweis', await warteAuf(`!!document.querySelector('a[href*="/jahresnachweis"]')`));
  const g = await erstelleNachweis('Nachweis erstellen', 'G-objektdex-gratis.pdf');
  check('ObjektDex-Nachweis ohne Pro: Gratis-Hinweis wie die App', /Erstellt mit ObjektDex – Gratis-Version/.test(g.text));
  await oeffne(`${base}/app/objektdex/nachweis?demo&sauber&objekt=${WEG}`);
  await warteAuf(`!!document.querySelector('select')`);
  const g2 = await erstelleNachweis('Nachweis erstellen', 'G2-objektdex-pro.pdf');
  check('ObjektDex-Nachweis mit Pro: kein Hinweis', !/Gratis-Version/.test(g2.text) && /Leistungsnachweis/.test(g2.text));
  await oeffne(`${base}/vorschau?app=winterdex&seite=nach-dem-winter`);
  check('„Nach dem Winter“ (Vorschau): Link zum Ganzjahres-Nachweis', await warteAuf(`!!document.querySelector('a[href="/app/objektdex/jahresnachweis"]')`));
  console.log('  Bild:', await bild('G-nach-dem-winter.png'));

  // ------------------------------------------------------------------ H: Handy-Breite
  console.log('\nH: Handy-Breite 390 px');
  await oeffne(`${base}/app/objektdex/jahresnachweis?demo&sauber&objekt=${WEG}`, 390);
  await warteAuf(`document.body.innerText.includes('Über die Adresse gefunden')`);
  const breit = await main.ev(`document.documentElement.scrollWidth`);
  check('keine waagrechte Scrollleiste bei 390 px', breit <= 392, breit);
  console.log('  Bild:', await bild('H-handy.png'));
} catch (e) {
  check('Testlauf', false, e?.stack ?? e);
} finally {
  try {
    main?.ws.close();
  } catch {
    /* egal */
  }
  edge.kill();
}
console.log(`\n${ok} ok, ${fail} fehlgeschlagen — Dateien in ${aus}`);
process.exit(fail ? 1 : 0);
