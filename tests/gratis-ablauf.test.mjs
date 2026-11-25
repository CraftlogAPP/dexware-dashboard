// WinterDex „Gratis nach Ablauf von Pro“ + Tour-Reihenfolge (25.11.2026) — ohne Server. Die RPC gratis_lage ist nachgebaut.
// Server-Seite: WinterDex/supabase/NACHTRAG-GRATIS-NACH-ABLAUF-2026-11-25.sql (eigener PGlite-Test dort).
//   [1] Ablehnung erkennen: hint UND Text (Warteschlangen speichern nur den Text, fail() verpackt ihn)
//   [2] Antwort lesen + RPC fehlt (Nachtrag nicht live) → null, kein zweiter Aufruf, nie werfen
//   [3] Banner: nur sicher kein Pro + über Grenze + Frist; Texte Frist/gesperrt; Objekte/Strecken
//   [4] Vorauswahl im Dialog (Pflicht-Ziel, zuletzt dokumentiert, Tour)
//   [5] Tour-Sortierung (leere zuletzt, dann Name; ohne Spalte wie bisher), neue Plätze, Verschieben
//   [6] Quelltext: Listen sortieren nach Tour, Banner/Hinweise eingebunden, Upsert überschreibt tour_pos nie
//
//   Aufruf:  node tests/gratis-ablauf.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
globalThis.window = globalThis.window ?? { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
const web = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
const lies = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + extra}`);
};

const G = await web('src/winterdex/gratisLage.ts');
const T = await web('src/winterdex/tour.ts');

// Texte genau wie der Server (NACHTRAG-GRATIS-NACH-ABLAUF-2026-11-25.sql) — aus der Datei, wenn das WinterDex-Repo daneben liegt
const SQL_DATEI = 'WinterDex/supabase/NACHTRAG-GRATIS-NACH-ABLAUF-2026-11-25.sql';
const sqlPfad = [path.join(here, '../..', SQL_DATEI), path.join('C:/Users/2easy/Desktop', SQL_DATEI)].find((p) => existsSync(p));
const serverTexte = sqlPfad
  ? [...readFileSync(sqlPfad, 'utf8').matchAll(/'(Gratis-Grenze: [^']+)'/g)].map((m) => m[1])
  : [
      'Gratis-Grenze: Nach dem Ende von Pro sind 2 Objekte aktiv nutzbar — wähle deine 2 Objekte (die übrigen werden stillgelegt, nichts wird gelöscht) oder hol dir WinterDex Pro.',
      'Gratis-Grenze: Nach dem Ende von Pro ist 1 Strecke aktiv nutzbar — wähle deine Strecke (die übrigen werden stillgelegt, nichts wird gelöscht) oder hol dir WinterDex Pro.',
      'Gratis-Grenze: Dieses Objekt ist stillgelegt — im Gratis-Paket sind 2 Objekte aktiv nutzbar. Tausche es gegen ein aktives Objekt oder hol dir WinterDex Pro.',
      'Gratis-Grenze: Diese Strecke ist stillgelegt — im Gratis-Paket ist 1 Strecke aktiv nutzbar. Tausche sie gegen die aktive Strecke oder hol dir WinterDex Pro.',
    ];
if (!sqlPfad) console.log('  (WinterDex-Repo nicht daneben — Server-Texte aus der Kopie im Test)');

console.log('\n[1] Ablehnung erkennen');
{
  check('Server-Datei hat 4 Texte', serverTexte.length === 4, String(serverTexte.length));
  const erwartet = ['auswahl_objekte', 'auswahl_strecken', 'objekt_stillgelegt', 'strecke_stillgelegt'];
  check('jeder Server-Text wird als Text erkannt (Warteschlange)', JSON.stringify(serverTexte.map(G.gratisArt)) === JSON.stringify(erwartet), JSON.stringify(serverTexte.map(G.gratisArt)));
  check('… auch verpackt von fail()', G.gratisArt(new Error(`Einsatz konnte nicht gespeichert werden: ${serverTexte[0]}`)) === 'auswahl_objekte');
  for (const h of ['gratis_auswahl_objekte', 'gratis_objekt_stillgelegt', 'gratis_auswahl_strecken', 'gratis_strecke_stillgelegt']) {
    check(`hint ${h}`, G.gratisArt({ hint: h, message: 'x' }) === h.replace('gratis_', ''));
  }
  check('alte Grenze beim Anlegen (gratis_grenze_property) ist KEINE Ablauf-Ablehnung',
    G.gratisArt({ hint: 'gratis_grenze_property', message: 'Gratis-Grenze: Im Gratis-Paket sind 2 aktive Objekte möglich — unbegrenzt viele gibt es mit WinterDex Pro.' }) === null);
  check('anderer Fehler / null / Netz → null', G.gratisArt(new Error('failed to fetch')) === null && G.gratisArt(null) === null && G.gratisArt('') === null);
  check('Texte für alle Arten', ['auswahl_objekte', 'objekt_stillgelegt', 'auswahl_strecken', 'strecke_stillgelegt'].every((a) => G.gratisArtText(a).length > 40));
}

console.log('\n[2] Antwort lesen, RPC fehlt');
{
  const voll = { pro: false, aktive_objekte: 5, aktive_strecken: 1, limit_objekte: 2, limit_strecken: 1, frist_bis: '2026-12-02T10:00:00+00:00', bestandsschutz: false, gesperrt_objekte: false, gesperrt_strecken: false };
  check('vollständige Antwort', JSON.stringify(G.leseLage(voll)) === JSON.stringify(voll));
  check('Müll → null', G.leseLage(null) === null && G.leseLage([]) === null && G.leseLage({ pro: true }) === null);
  check('pro unbekannt bleibt null', G.leseLage({ ...voll, pro: null }).pro === null);
  let aufrufe = 0;
  const gut = { rpc: async () => (aufrufe++, { data: voll, error: null }) };
  check('RPC liefert Lage', (await G.fetchGratisLage(gut))?.aktive_objekte === 5);
  const kaputt = { rpc: async () => { throw new Error('netz'); } };
  check('Netzfehler → null (wirft nie)', (await G.fetchGratisLage(kaputt)) === null);
  const anderer = { rpc: async () => ({ data: null, error: { code: '500', message: 'boom' } }) };
  check('Serverfehler → null', (await G.fetchGratisLage(anderer)) === null);
  check('… und danach wird weiter gefragt', (await G.fetchGratisLage(gut))?.pro === false);
  let fehltAufrufe = 0;
  const fehlt = { rpc: async () => (fehltAufrufe++, { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.gratis_lage' } }) };
  check('RPC fehlt (Nachtrag nicht live) → null', (await G.fetchGratisLage(fehlt)) === null);
  check('… danach kein weiterer Aufruf bis zum Neuladen', (await G.fetchGratisLage(fehlt)) === null && (await G.fetchGratisLage(gut)) === null && fehltAufrufe === 1, `${fehltAufrufe}`);
}

console.log('\n[3] Banner');
{
  const f = (iso) => `[${iso.slice(0, 10)}]`;
  const basis = { pro: false, aktive_objekte: 5, aktive_strecken: 1, limit_objekte: 2, limit_strecken: 1, frist_bis: '2026-12-02T10:00:00Z', bestandsschutz: false, gesperrt_objekte: false, gesperrt_strecken: false };
  const b1 = G.bannerInhalt(basis, f);
  check('in Frist: „Pro ist beendet. Noch bis <Datum> alle Objekte nutzbar – danach 2 Objekte aktiv.“',
    b1?.stufe === 'frist' && b1.titel === 'Pro ist beendet.' && b1.text.startsWith('Noch bis [2026-12-02] alle Objekte nutzbar – danach 2 Objekte aktiv.') && b1.objekteWaehlen && !b1.streckeWaehlen, JSON.stringify(b1));
  const b2 = G.bannerInhalt({ ...basis, gesperrt_objekte: true }, f);
  check('gesperrt: „Wähle deine 2 Objekte“', b2?.stufe === 'gesperrt' && b2.titel === 'Wähle deine 2 Objekte' && b2.objekteWaehlen && /bisherigen Nachweise bleiben/.test(b2.text), JSON.stringify(b2));
  const b3 = G.bannerInhalt({ ...basis, aktive_objekte: 2, aktive_strecken: 3, gesperrt_strecken: true }, f);
  check('nur Strecken gesperrt: „Wähle deine Strecke“', b3?.titel === 'Wähle deine Strecke' && b3.streckeWaehlen && !b3.objekteWaehlen, JSON.stringify(b3));
  const b4 = G.bannerInhalt({ ...basis, aktive_strecken: 2 }, f);
  check('beides in Frist', /alle Objekte und Strecken nutzbar – danach 2 Objekte und 1 Strecke aktiv/.test(b4?.text ?? '') && b4.objekteWaehlen && b4.streckeWaehlen, JSON.stringify(b4));
  const b5 = G.bannerInhalt({ ...basis, aktive_strecken: 2, gesperrt_objekte: true, gesperrt_strecken: true }, f);
  check('beides gesperrt', b5?.titel === 'Wähle deine 2 Objekte und deine Strecke', JSON.stringify(b5));
  check('Pro → kein Banner', G.bannerInhalt({ ...basis, pro: true }, f) === null);
  check('Pro unbekannt → kein Banner', G.bannerInhalt({ ...basis, pro: null }, f) === null);
  check('Bestandsschutz → kein Banner', G.bannerInhalt({ ...basis, bestandsschutz: true }, f) === null);
  check('innerhalb der Grenzen → kein Banner', G.bannerInhalt({ ...basis, aktive_objekte: 2 }, f) === null);
  check('ohne Frist → kein Banner', G.bannerInhalt({ ...basis, frist_bis: null }, f) === null);
  check('keine Lage (RPC fehlt) → kein Banner', G.bannerInhalt(null, f) === null);
}

console.log('\n[4] Vorauswahl');
{
  const ids = ['a', 'b', 'c', 'd'];
  const zuletzt = new Map([['c', '2026-11-20T08:00:00Z'], ['d', '2026-11-24T08:00:00Z'], ['a', '2026-11-01T08:00:00Z']]);
  check('die 2 zuletzt dokumentierten', JSON.stringify(G.vorauswahl(ids, zuletzt, 2)) === '["d","c"]', JSON.stringify(G.vorauswahl(ids, zuletzt, 2)));
  check('Pflicht-Ziel (Tausch) zuerst', JSON.stringify(G.vorauswahl(ids, zuletzt, 2, 'b')) === '["b","d"]');
  check('ohne Einsätze: nach Tour-Reihenfolge aufgefüllt', JSON.stringify(G.vorauswahl(ids, new Map(), 2)) === '["a","b"]');
  check('Strecke: genau 1', JSON.stringify(G.vorauswahl(ids, zuletzt, 1)) === '["d"]');
  check('unbekanntes Pflicht-Ziel ignoriert', JSON.stringify(G.vorauswahl(ids, zuletzt, 2, 'x')) === '["d","c"]');
}

console.log('\n[5] Tour-Reihenfolge');
{
  const p = (name, tour_pos, active = true) => ({ id: name, name, tour_pos, active });
  const liste = [p('Zeta', null), p('Alpha', 3), p('Beta', 1), p('Ärztehaus', null), p('Gamma', 2)];
  check('tour_pos aufsteigend, leere zuletzt, dann Name (deutsch)',
    [...liste].sort(T.nachTour).map((x) => x.name).join(',') === 'Beta,Gamma,Alpha,Ärztehaus,Zeta', [...liste].sort(T.nachTour).map((x) => x.name).join(','));
  const ohne = [{ name: 'b' }, { name: 'A' }, { name: 'c' }];
  check('ohne Spalte (Nachtrag nicht live): nur nach Name wie bisher', [...ohne].sort(T.nachTour).map((x) => x.name).join('') === 'Abc');
  check('aktive zuerst', [p('A', 1, false), p('B', 2)].sort(T.aktivNachTour)[0].name === 'B');
  check('Spalte erkannt', T.hatTourSpalte([{ tour_pos: null }]) && !T.hatTourSpalte([{ name: 'x' }]) && !T.hatTourSpalte([]));
  const reihe = [p('x', 1), p('y', 5), p('z', null)];
  check('neue Plätze nur für geänderte', JSON.stringify(T.neuePlaetze(reihe)) === '[{"id":"y","tour_pos":2},{"id":"z","tour_pos":3}]', JSON.stringify(T.neuePlaetze(reihe)));
  check('verschieben', T.verschiebe(['a', 'b', 'c'], 2, -1).join('') === 'acb' && T.verschiebe(['a', 'b'], 0, -1).join('') === 'ab');
}

console.log('\n[6] Quelltext');
{
  const api = lies('src/winterdex/api.ts');
  check('fetchProperties sortiert aktiv + Tour', /\.sort\(aktivNachTour\)/.test(api));
  check('propertyRow schreibt KEIN tour_pos (Upsert lässt die Reihenfolge stehen)', !/tour_pos/.test(api.slice(api.indexOf('export function propertyRow'), api.indexOf('export async function saveProperty'))));
  check('Außendienst-Objekte nach Tour', /\.sort\(nachTour\)/.test(lies('src/winterdex/einsatz/backend.ts')));
  check('Außendienst-Liste: offen zuerst, dann Tour', /doneAt\.has\(b\.id\)\) \|\| nachTour\(a, b\)/.test(lies('src/winterdex/pages/Einsatz.tsx')));
  check('Banner im Dashboard', /<GratisBanner aboUrl=/.test(lies('src/winterdex/WinterdexArea.tsx')));
  check('Banner im Außendienst', /<GratisBanner aboUrl=/.test(lies('src/winterdex/aussendienst/Aussendienst.tsx')));
  for (const f of ['src/winterdex/pages/EinsatzErfassen.tsx', 'src/winterdex/pages/Operations.tsx', 'src/winterdex/aussendienst/StreckeFahren.tsx', 'src/winterdex/aussendienst/Strecken.tsx', 'src/winterdex/pages/Einsatz.tsx']) {
    check(`Ablehnung → Auswahl/Pro statt rohem Fehler: ${path.basename(f)}`, /gratisArt\(/.test(lies(f)) && /<GratisFehler/.test(lies(f)));
  }
  const props = lies('src/winterdex/pages/Properties.tsx');
  check('„Reihenfolge ändern“ nur mit Spalte und nur für Inhaber', /tourMoeglich = owner && hatTourSpalte\(props\)/.test(props));
  const ui = lies('src/winterdex/GratisHinweise.tsx');
  check('Auswahl: erst stilllegen, dann aktivieren', ui.indexOf("update({ active: false })") > 0 && ui.indexOf("update({ active: false })") < ui.indexOf("update({ active: true })"));
  check('nichts wird gelöscht (kein delete im Gratis-Baustein)', !/\.delete\(/.test(ui));
}

console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail === 0 ? 0 : 1);
