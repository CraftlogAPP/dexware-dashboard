// Bild einer Dashboard-Seite mit Beispieldaten für die Landing-Seiten (Dashboard-Block, wie das WinterDex-Bild):
// nur der Inhaltsbereich — ohne Kopfzeile und ohne Menü links —, 1440 px breit. Startet KEINEN Server: Der Dev-Server
// muss laufen (npm run dev), die Seite kommt mit ?beispiel (docs/beispiel-zugang.md).
//
//   node tests/browser/beispiel-bild.mjs <adresse> <ziel.png> [--ausschnitt links,oben,breite,höhe] [--fenster BxH]
//
//   Standard: Fenster 1672×1004 = Menü (232 px) + Inhalt 1440 px breit, Kopfzeile 60 px + Inhalt 944 px hoch
//             (Höhe wie das WinterDex-Bild), Ausschnitt 232,60,1440,944.
//   --hoehe H         nur die Inhaltshöhe ändern (Fenster und Ausschnitt passen sich an)
//   --ohne-menue      Seiten ohne Menü links (z. B. WinterDex fahrten-demo): Fenster 1440×(60+H), Ausschnitt 0,60,1440,H
//
// Beispiel:
//   node tests/browser/beispiel-bild.mjs "http://127.0.0.1:5173/app/feuerdex?beispiel" \
//        ../dexware-suite/landing-system/assets/feuerdex-dashboard.png
//
// Aufnahme: Edge headless (--headless=new --screenshot --virtual-time-budget=12000 --hide-scrollbars) in einem eigenen,
// leeren Profil je Lauf. Zuschneiden mit sharp aus dexware-suite/landing-system/node_modules (keine neue Abhängigkeit
// im Dashboard; anderer Ort per Umgebungsvariable SHARP_DIR).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MENUE = 232; // .app-nav (src/index.css)
const KOPF = 60; // .site-header (src/index.css)
const BREITE = 1440;

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const hoehe = Number(opt('--hoehe') ?? 944);
const ohneMenue = flag('--ohne-menue');
const ausschnittText = opt('--ausschnitt');
const fensterText = opt('--fenster');
const [url, ziel] = args;
if (!url || !ziel) {
  console.error('Aufruf: node tests/browser/beispiel-bild.mjs <adresse> <ziel.png> [--hoehe H] [--ohne-menue] [--ausschnitt l,o,b,h] [--fenster BxH]');
  process.exit(2);
}
if (!/[?&]beispiel\b/.test(url)) console.warn('Hinweis: Adresse ohne ?beispiel — es erscheint die Anmeldung statt der Beispieldaten.');

const links = ohneMenue ? 0 : MENUE;
const [fb, fh] = fensterText ? fensterText.split('x').map(Number) : [links + BREITE, KOPF + hoehe];
const [al, ao, ab, ah] = ausschnittText ? ausschnittText.split(',').map(Number) : [links, KOPF, BREITE, hoehe];
if ([fb, fh, al, ao, ab, ah].some((n) => !Number.isFinite(n) || n < 0) || al + ab > fb || ao + ah > fh) {
  console.error(`Ausschnitt ${al},${ao},${ab},${ah} passt nicht ins Fenster ${fb}×${fh}.`);
  process.exit(2);
}

const sharpDir = process.env.SHARP_DIR ?? path.resolve(import.meta.dirname, '../../../dexware-suite/landing-system');
let sharp;
try {
  const req = createRequire(path.join(sharpDir, 'package.json'));
  sharp = (await import(pathToFileURL(req.resolve('sharp')).href)).default;
} catch {
  console.error(`sharp nicht gefunden in ${sharpDir}/node_modules (dort npm install oder SHARP_DIR setzen).`);
  process.exit(2);
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const prof = mkdtempSync(path.join(tmpdir(), 'beispiel-bild-'));
const roh = path.join(prof, 'roh.png');
const r = spawnSync(
  EDGE,
  [
    '--headless=new',
    `--user-data-dir=${prof}`,
    '--no-first-run',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${fb},${fh}`,
    '--virtual-time-budget=12000',
    `--screenshot=${roh}`,
    url,
  ],
  { stdio: 'ignore', timeout: 90_000 },
);
if (!existsSync(roh) || statSync(roh).size === 0) {
  console.error(`Edge hat kein Bild geliefert (Rückgabe ${r.status ?? r.error}). Läuft der Dev-Server unter ${new URL(url).origin}?`);
  rmSync(prof, { recursive: true, force: true });
  process.exit(1);
}
const meta = await sharp(roh).metadata();
if (meta.width !== fb || meta.height !== fh) console.warn(`Hinweis: Rohbild ${meta.width}×${meta.height} statt ${fb}×${fh}.`);
await sharp(roh).extract({ left: al, top: ao, width: ab, height: ah }).png({ compressionLevel: 9 }).toFile(ziel);
rmSync(prof, { recursive: true, force: true });
console.log(`Bild: ${ziel} (${ab}×${ah}, Ausschnitt ab ${al},${ao} aus ${fb}×${fh})`);
