// WinterDex: Standort aus der Adresse im Dashboard — an Nominatim geht nur „Straße Hausnummer, PLZ Ort“ (26.11.2026,
// Datenschutz-Nachprüfung: vorher ging das ganze Adressfeld mit, z. B. „Fam. Müller, …“). Ohne Browser und ohne Netz.
//   [1] suchText: Teile vor der Straße fallen weg, Länderkürzel weg, ohne PLZ/Ort null — gleiche Form wie der Server
//   [2] locateAddress: die abgeschickte URL enthält nur den Suchtext (fetch abgefangen)
//   [3] Quelltext: das ganze Adressfeld geht nicht mehr an Nominatim
//
//   Aufruf:  node tests/dse-suchtext.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
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
const lies = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const G = await import(pathToFileURL(path.join(here, '..', 'src/winterdex/geo.ts')).href);

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + extra}`);
};

console.log('[1] suchText');
const faelle = [
  ['Fam. Müller, Hauptstraße 5, 8010 Graz', 'Hauptstraße 5, 8010 Graz'],
  ['Volksschule, z. H. Hr. Huber, Schulgasse 3, A-8200 Gleisdorf', 'Schulgasse 3, 8200 Gleisdorf'],
  ['Hauptstraße 12a, D-80331 München', 'Hauptstraße 12a, 80331 München'],
  ['  Hauptplatz   1 ,  8200   Gleisdorf ', 'Hauptplatz 1, 8200 Gleisdorf'],
  ['8200 Gleisdorf', '8200 Gleisdorf'],
  ['Schulweg 3', null],
  ['Hauptstraße 1, 8200', null],
  ['', null],
];
for (const [ein, soll] of faelle) {
  const ist = G.suchText(ein);
  check(`„${ein}“ → ${soll === null ? 'null' : `„${soll}“`}`, ist === soll, String(ist));
}

console.log('[2] locateAddress schickt nur den Suchtext');
const urls = [];
globalThis.window = globalThis;
globalThis.fetch = async (url) => {
  urls.push(String(url));
  return { ok: true, json: async () => [] };
};
const r1 = await G.locateAddress('Fam. Müller, Hauptstraße 5, 8010 Graz');
check('kein Treffer → notFound', r1.point === null && r1.why === 'notFound', JSON.stringify(r1));
check('genau eine Anfrage', urls.length === 1, String(urls.length));
const q = new URL(urls[0] ?? 'https://x/').searchParams.get('q');
check('q = „Hauptstraße 5, 8010 Graz“', q === 'Hauptstraße 5, 8010 Graz', String(q));
check('kein „Müller“ in der URL', !/m(ü|%C3%BC)ller/i.test(urls[0] ?? ''), urls[0]);
check('Land aus der PLZ (at,ch)', new URL(urls[0] ?? 'https://x/').searchParams.get('countrycodes') === 'at,ch');
const r2 = await G.locateAddress('Schulweg 3');
check('ohne PLZ/Ort: keine Anfrage, noPlace', r2.why === 'noPlace' && urls.length === 1, JSON.stringify(r2));

console.log('[3] Quelltext');
const geo = lies('src/winterdex/geo.ts');
check('URL nutzt den Suchtext', geo.includes('&q=${encodeURIComponent(q)}'));
check('ganzes Adressfeld nicht mehr in der URL', !geo.includes('encodeURIComponent(address'));

console.log(`\n${ok} ok, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
