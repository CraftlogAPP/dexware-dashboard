// Statische Kopien von index.html für die Einstiegs-Adressen der App-Bereiche (28.11.2026, Bing Webmaster Tools).
//
// GitHub Pages kennt keinen SPA-Rückfall mit Status 200: Unterseiten wie /app/winterdex oder /app/pruefdex/vor-ort kamen
// bisher über 404.html (gleicher Inhalt, aber HTTP 404). Für Menschen egal, für Bing und jede Linkprüfung ein kaputter Link
// (28 Links von 15 Landings). Mit einer Datei je Adresse liefert GitHub Pages 200 — der Inhalt ist byte-gleich index.html,
// die App verhält sich also genau wie vorher (BrowserRouter liest die Adresse, der Service Worker holt Seiten wie bisher).
//
// Je App mit status 'dashboard' (src/apps/registry.ts):
//   app/<id>.html           → /app/<id>           (GitHub Pages hängt .html selbst an)
//   app/<id>/index.html     → /app/<id>/          (mit Schrägstrich, und falls Pages den Ordner der .html-Datei vorzieht)
//   app/<id>/<unter>.html   → /app/<id>/<unter>   für die Unterseiten, auf die Landings und Startbildschirm-Symbole zeigen:
//                             vor-ort, abo, aussendienst — nur, wenn der Bereich die Route wirklich hat (Quelltext-Prüfung)
// Alle anderen Adressen bleiben beim bisherigen Weg über 404.html. robots.txt sperrt /app/ weiter für Suchmaschinen,
// canonical bleibt https://dashboard.dexware.app/.
//   node scripts/routen-seiten.mjs            (läuft als postbuild nach vite build)
//   node scripts/routen-seiten.mjs --liste    (nur die Adressen ausgeben, nichts schreiben)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Unterseiten mit Erkennungsmerkmal im Quelltext des App-Ordners src/<id>/
const UNTERSEITEN = {
  'vor-ort': /path=\{`\$\{VOR_ORT_PATH\}\/\*`\}/, // Handy-Ansicht „Vor Ort“ (src/pruefen/Scope.tsx → VOR_ORT_PATH = 'vor-ort')
  abo: /path="abo"/,
  aussendienst: /path="aussendienst\/\*"/, // WinterDex-Außendienst
};

/** App-IDs mit status 'dashboard' aus der Registry (Reihenfolge wie dort). */
export function dashboardApps(root = ROOT) {
  const src = readFileSync(path.join(root, 'src/apps/registry.ts'), 'utf8');
  const start = src.indexOf('export const APPS');
  if (start < 0) throw new Error('registry.ts: APPS nicht gefunden');
  const ids = [];
  const re = /\n {4}id: '([a-z0-9]+)',[\s\S]*?\n {4}status: '([a-z]+)'/g;
  re.lastIndex = start;
  for (let m; (m = re.exec(src)); ) if (m[2] === 'dashboard') ids.push(m[1]);
  if (!ids.length) throw new Error('registry.ts: keine App mit status dashboard gefunden');
  return ids;
}

function quelltext(dir) {
  if (!existsSync(dir)) return '';
  let out = '';
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out += quelltext(p);
    else if (/\.tsx?$/.test(e.name)) out += readFileSync(p, 'utf8');
  }
  return out;
}

/** Alle Adressen (ohne führenden Schrägstrich), für die eine Kopie entsteht. */
export function routen(root = ROOT) {
  const list = [];
  for (const id of dashboardApps(root)) {
    list.push(`app/${id}`);
    const code = quelltext(path.join(root, 'src', id));
    for (const [unter, merkmal] of Object.entries(UNTERSEITEN)) if (merkmal.test(code)) list.push(`app/${id}/${unter}`);
  }
  return list;
}

/** Ziel-Dateien in dist/ je Adresse. */
export function dateien(route) {
  const tiefe = route.split('/').length;
  return tiefe === 2 ? [`${route}.html`, `${route}/index.html`] : [`${route}.html`];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const list = routen();
  if (process.argv.includes('--liste')) {
    console.log(list.join('\n'));
  } else {
    const dist = path.join(ROOT, 'dist');
    const index = path.join(dist, 'index.html');
    if (!existsSync(index)) throw new Error('dist/index.html fehlt — erst vite build');
    let n = 0;
    for (const r of list) for (const f of dateien(r)) {
      const ziel = path.join(dist, f);
      mkdirSync(path.dirname(ziel), { recursive: true });
      copyFileSync(index, ziel);
      n++;
    }
    console.log(`routen-seiten: ${n} Kopien von index.html für ${list.length} Adressen (Status 200 statt 404 auf GitHub Pages)`);
  }
}
