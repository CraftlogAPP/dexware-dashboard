// Prüft scripts/routen-seiten.mjs: Einstiegs-Adressen, auf die die Landings verlinken, bekommen eine Kopie von index.html
// (GitHub Pages liefert dann 200 statt 404). Nach `npm run build` zusätzlich: die Dateien liegen in dist/ und sind
// byte-gleich index.html.
//   Aufruf: node tests/routen-seiten.test.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dashboardApps, dateien, routen } from '../scripts/routen-seiten.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0;
const t = (name, fn) => { fn(); ok++; console.log(`✓ ${name}`); };

const list = routen();
t('alle Apps mit Dashboard haben eine Einstiegs-Adresse', () => {
  for (const id of dashboardApps()) assert.ok(list.includes(`app/${id}`), id);
  assert.ok(!list.includes('app/baumdex'), 'BaumDex ist extern (kein Bereich im Dashboard)');
});
t('Links der Landings (Stand 28.11.2026) sind abgedeckt', () => {
  const vorOrt = ['feuerdex', 'geruestdex', 'gurtdex', 'hebedex', 'kfzdex', 'leiterdex', 'pruefdex', 'regaldex', 'schutzdex', 'spieldex', 'toredex'];
  for (const a of vorOrt) assert.ok(list.includes(`app/${a}/vor-ort`), `${a}/vor-ort`);
  for (const r of ['app/winterdex', 'app/winterdex/abo', 'app/winterdex/aussendienst', 'app/craftdex', 'app/dokudex', 'app/tourdex', 'app/kfzdex'])
    assert.ok(list.includes(r), r);
});
t('keine erfundenen Unterseiten', () => {
  assert.ok(!list.includes('app/winterdex/vor-ort'), 'WinterDex hat Außendienst, kein Vor Ort');
  assert.ok(!list.includes('app/craftdex/vor-ort'));
  assert.ok(!list.includes('app/pruefdex/aussendienst'));
});
t('Dateinamen je Adresse', () => {
  assert.deepEqual(dateien('app/winterdex'), ['app/winterdex.html', 'app/winterdex/index.html']);
  assert.deepEqual(dateien('app/pruefdex/vor-ort'), ['app/pruefdex/vor-ort.html']);
});
const dist = path.join(ROOT, 'dist');
if (existsSync(path.join(dist, 'index.html')) && existsSync(path.join(dist, 'app'))) {
  t('dist/: jede Kopie ist byte-gleich index.html, 404.html bleibt', () => {
    const index = readFileSync(path.join(dist, 'index.html'));
    for (const r of list) for (const f of dateien(r)) assert.ok(readFileSync(path.join(dist, f)).equals(index), f);
    assert.ok(readFileSync(path.join(dist, '404.html')).equals(index), '404.html');
  });
} else console.log('– dist/ ohne Kopien: Datei-Prüfung übersprungen (erst npm run build)');
console.log(`${ok} Prüfungen bestanden (${list.length} Adressen)`);
