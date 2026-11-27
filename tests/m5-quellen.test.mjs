// WinterDex M5 „B13“ (27.11.2026): Merkmal „quellen“: 1 im Wetter-Snapshot des Außendiensts (Einsatz erfassen im Browser).
// Der Worker (ab 0.9.2) liefert staatliche/DWD-Momentwerte nur an Clients mit diesem Merkmal; ältere Apps (bis vc47)
// bekommen weiter Open-Meteo. Das Dashboard liest die Herkunft aus `weather.source` (wetterQuelle.ts, feat/quelle-staatlich).
// Ohne Browser und ohne Netz (fetch-Attrappe), erfundene Werte.
//   Aufruf:  node tests/m5-quellen.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
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
const speicher = new Map();
globalThis.localStorage = globalThis.localStorage ?? {
  getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => speicher.set(k, String(v)),
  removeItem: (k) => speicher.delete(k),
};
const lies = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + String(extra).slice(0, 500)}`);
};

const BE = await import(pathToFileURL(path.join(here, '..', 'src', 'winterdex', 'einsatz', 'backend.ts')).href);
const anfragen = [];
let naechste = null;
globalThis.fetch = async (url, init = {}) => {
  anfragen.push({ url: String(url), body: init.body == null ? null : JSON.parse(init.body), auth: new Headers(init.headers).get('Authorization') });
  return new Response(JSON.stringify(naechste), { status: 200, headers: { 'content-type': 'application/json' } });
};
const CFG = { url: 'https://wd.test/', token: 'test-token' };

console.log('\n[1] Außendienst: Snapshot mit Merkmal „quellen“: 1');
check('Merkmal-Konstante WETTER_QUELLEN = 1 (Worker-Schwelle QUELLEN_STAATLICH_AB, App vc48 gleich)', BE.WETTER_QUELLEN === 1);
naechste = { weather: { temp_c: -1.5, snowfall_cm: 0, precip_mm: 0, fetched_at: '2026-11-27T05:40:00Z' } };
let r = await BE.requestWeather(CFG, 47.07123, 15.43987);
check('POST /weather/snapshot mit Body { lat, lng, quellen: 1 }, Bearer wie bisher',
  anfragen[0]?.url === 'https://wd.test/weather/snapshot' && JSON.stringify(anfragen[0].body) === JSON.stringify({ lat: 47.07123, lng: 15.43987, quellen: 1 }) && anfragen[0].auth === 'Bearer test-token',
  JSON.stringify(anfragen[0]));
check('alte Server-Antwort ohne source: unverändert übernommen (gilt im Dashboard wie bisher als Open-Meteo)', r.weather?.temp_c === -1.5 && r.weather.source === undefined && r.netError === false);
naechste = { weather: { temp_c: 0.5, snowfall_cm: 0, precip_mm: 0.2, source: 'dwd', modell: 'ICON-D2', basis: 'modell', quelle_text: 'Datenbasis: Deutscher Wetterdienst, eigene Berechnungen (CC BY 4.0)', fetched_at: '2026-11-27T05:40:00Z' } };
r = await BE.requestWeather(CFG, 48.137, 11.575);
check('staatliche Antwort (source dwd, quelle_text) 1:1 übernommen — gespeichert wird die Herkunft des Servers',
  r.weather?.source === 'dwd' && r.weather.modell === 'ICON-D2' && /Deutscher Wetterdienst/.test(r.weather.quelle_text) && anfragen[1]?.body?.quellen === 1);
r = await BE.requestWeather(undefined, 48.137, 11.575);
check('ohne Wetter-Konfiguration: keine Anfrage (wie bisher)', r.weather === null && anfragen.length === 2);

console.log('\n[2] Quelltext-Wächter');
const be = lies('src/winterdex/einsatz/backend.ts');
check('genau EINE Snapshot-Anfrage im Dashboard, und sie trägt das Merkmal',
  (be.match(/\/weather\/snapshot/g) ?? []).length === 1 && /body: JSON\.stringify\(\{ lat, lng, quellen: WETTER_QUELLEN \}\)/.test(be));

console.log(`\n${fail ? 'FEHLER' : 'ALLES GRÜN'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
