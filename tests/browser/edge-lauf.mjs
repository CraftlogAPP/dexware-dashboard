// Kleiner Läufer für Browser-Tests und Bildschirmfotos mit Edge headless (ohne Zusatzpakete, über das DevTools-Protokoll).
// Eigener, leerer Browser-Ordner je Lauf — keine Anmeldung, keine echten Daten.
//
//   node tests/browser/edge-lauf.mjs <adresse> [skript.js]            Skript in der Seite ausführen, Ergebnis ausgeben
//   node tests/browser/edge-lauf.mjs <adresse> - <bild.png> [b] [h]   nur Bildschirmfoto (Standard 1280×900)
//
// Das Skript läuft in der Seite des Dev-Servers (dort sind /src/…-Module ladbar) und setzt am Ende window.__fertig
// auf den Ergebnistext. Endet der Text mit „fehlgeschlagen“, ist der Rückgabewert 1.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [url, script, png, w = '1280', h = '900'] = process.argv.slice(2);
if (!url) {
  console.error('Aufruf: node tests/browser/edge-lauf.mjs <adresse> [skript.js | - bild.png [breite] [höhe]]');
  process.exit(2);
}
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(path.join(tmpdir(), 'edge-lauf-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], {
  stdio: 'ignore',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let code = 0;
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {
      /* noch nicht bereit */
    }
  }
  if (!target) throw new Error('Edge nicht erreichbar');
  ws = new WebSocket(target.webSocketDebuggerUrl);
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
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  // warten, bis die Seite geladen ist
  for (let i = 0; i < 100; i++) {
    await sleep(200);
    const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (r.result?.result?.value === 'complete') break;
  }
  if (script && script !== '-') {
    const src = readFileSync(script, 'utf8');
    await send('Runtime.evaluate', { expression: `(async () => {\n${src}\n})().catch((e) => { window.__fertig = 'FEHLER ' + (e && e.stack || e) + '\\n1 fehlgeschlagen'; });` });
    let text = null;
    for (let i = 0; i < 300 && !text; i++) {
      await sleep(200);
      text = (await send('Runtime.evaluate', { expression: 'window.__fertig ?? null', returnByValue: true })).result?.result?.value ?? null;
    }
    console.log(text ?? '(keine Antwort — Zeitüberschreitung)\n1 fehlgeschlagen');
    if (!text || /fehlgeschlagen\s*$/.test(text)) code = 1;
  }
  if (png) {
    await sleep(1500);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(png, Buffer.from(shot.result.data, 'base64'));
    console.log('Bild:', png);
  }
} finally {
  try {
    ws?.close();
  } catch {
    /* egal */
  }
  edge.kill();
}
process.exit(code);
