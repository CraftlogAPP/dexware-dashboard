// WinterDex Mitteilungs-Center im Dashboard (26.11.2026) — Glocke oben rechts, Liste, Detail. Ohne Browser und ohne
// Netz; Antworten im Format des Vertrags v1 von meine_mitteilungen (NACHTRAG-MITTEILUNGEN-2026-11-26.sql), keine
// Kundendaten (Texte wie aus Alex' Feldtest 26.11., Orte erfunden bzw. nur Gemeinde).
//   [1] meine_mitteilungen lesen (v1, Fallbacks, kaputte Einträge, Doppel, Reihenfolge, voller Text bleibt voll)
//   [2] laden (RPC fehlt → aus, kein Mitglied → aus – auch die Absage {v:1, fehler:'kein_mitglied'} –, Netzfehler
//       und andere Absagen → fehler, wirft nie, schickt NUR p_org)
//   [3] Gruppen Heute / Gestern / Älter nach dem Kalendertag in Wien (Gerät auf UTC, Sommerzeit-Wechsel)
//   [4] Uhrzeit-Texte (Liste, Detail)
//   [5] Zähler „neu seit zuletzt geöffnet“ (nur localStorage je Betrieb, nie rückwärts, erster Besuch 24 Std.,
//       Speicher kaputt/gesperrt → kein Absturz)
//   [6] Symbol und Name je Art (K1 … K10, TEST)
//   [7] Quelltext-Wächter (Glocke nur im WinterDex-Bereich, innerhalb des Betriebs-Kontexts, kein „gelesen“ an den
//       Server, voller Text in Liste und Detail, Karte „Heute Nacht“ im Detail, keine Datums-Falle)
//   [8] Gegenprobe mit dem SQL-Nachtrag (falls eine WinterDex-Arbeitskopie ihn hat)
//
//   Aufruf:  node tests/mitteilungen.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Gerät absichtlich auf UTC: Tage und Uhrzeiten müssen trotzdem Wiener Zeit sein
process.env.TZ = 'UTC';

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
// localStorage-Attrappe (Node hat keins) — austauschbar für „gesperrt“
const speicher = new Map();
const normalerSpeicher = {
  getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => speicher.set(k, String(v)),
  removeItem: (k) => speicher.delete(k),
};
globalThis.localStorage = normalerSpeicher;
const web = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
const lies = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 500)}`);
};

const MT = await web('src/winterdex/mitteilungenDaten.ts');
const WG = await web('src/winterdex/wetterGuide.ts');
const TZ = 'Europe/Vienna';
/** Do 26.11.2026, 10:00 Wien */
const JETZT = Date.parse('2026-11-26T09:00:00Z');
const kopie = (x) => JSON.parse(JSON.stringify(x));

// Amtliche Warnung K9 aus Alex' Feldtest (am Handy abgeschnitten) — hier muss sie VOLL stehen
const K9_VOLL =
  'Gelbe Schneewarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 14:00 – Graz (GeoSphere Austria). 1 Objekt betroffen. ' +
  'Gelbe Glatteiswarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 09:00 – Graz (GeoSphere Austria). 1 Objekt betroffen.';
const K9_KURZ = 'Graz: Glatteis bis 09:00, Schnee bis 14:00 (gelb). 1 Objekt betroffen.';

/** Antwort von meine_mitteilungen (Vertrag v1), absichtlich NICHT ganz sortiert und mit kaputten Einträgen */
const ANTWORT = {
  v: 1,
  mitteilungen: [
    { id: 40, kart: 'K9', art_name: 'Amtliche Warnung', titel: 'Amtliche Warnung', text: K9_VOLL, kurz: K9_KURZ, zeit: '2026-11-25T23:30:00+00:00', kritisch: false },
    { id: 41, kart: 'K10', art_name: 'Schnee-Wecker', titel: '❄️ Schnee-Wecker', text: 'Schneefall setzt ein: ca. 3–5 cm bis 05:00 bei 4 Objekten.', kurz: 'Schneefall setzt ein: ca. 3–5 cm bis 05:00 bei 4 Objekten.', zeit: '2026-11-26T03:12:00+00:00', kritisch: true },
    { id: 38, kart: 'TEST', art_name: 'Test', titel: 'Testmitteilung', text: 'Mitteilungen kommen an.', kurz: 'Mitteilungen kommen an.', zeit: '2026-11-25T22:59:00+00:00', kritisch: false },
    { id: '37', kart: 'K1', art_name: null, titel: null, text: null, kurz: 'Heute Nacht Glätte möglich ab ca. 02:00 – 3 Objekte.', zeit: '2026-11-25T18:00:00.123+00:00', kritisch: false },
    { id: 36, kart: 'K2', art_name: 'Glätte-Frühwarnung', titel: 'Glätte-Frühwarnung', text: 'Glätte bis ca. 09:00 möglich – 3 Objekte betroffen.', kurz: 'Glätte bis ca. 09:00 möglich – 3 Objekte.', zeit: '2026-11-25T01:45:00+00:00', kritisch: false },
    { id: 35, kart: 'K5', art_name: 'Achtung Glatteis', titel: 'Achtung Glatteis', text: 'Gefrierender Regen ab ca. 21:30 erwartet – 1 Objekt (Pirching am Traubenberg). Vorbeugend streuen.', kurz: 'Gefrierender Regen ab ca. 21:30 – 1 Objekt.', zeit: '2026-11-24T20:42:00+00:00', kritisch: true },
    // kaputt: ohne id, ohne gültige Zeit, doppelt, kein Objekt
    { kart: 'K4', titel: 'ohne id', text: 'x', zeit: '2026-11-26T05:00:00Z' },
    { id: 34, kart: 'K4', titel: 'kaputte Zeit', text: 'x', zeit: 'gestern' },
    { id: 40, kart: 'K9', titel: 'Doppel', text: 'doppelt', zeit: '2026-11-25T23:30:00+00:00' },
    'Unsinn',
    null,
  ],
};

/** supabase-js-Attrappe: nur rpc(name, args, opts) */
function attrappe(rpc = {}) {
  const aufrufe = [];
  return {
    aufrufe,
    rpc(name, args, opts) {
      aufrufe.push({ name, args, opts });
      const f = rpc[name];
      if (!f) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + name }, status: 404 });
      return Promise.resolve(typeof f === 'function' ? f(args) : f);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------- [1]
console.log('\n[1] meine_mitteilungen lesen (Vertrag v1)');
const liste = MT.mitteilungenLesen(ANTWORT);
{
  check('6 gültige Mitteilungen; ohne id, ohne gültige Zeit, Doppel und Unsinn fallen weg', Array.isArray(liste) && liste.length === 6, liste && liste.map((m) => m.id));
  check('neueste zuerst (der Server sortiert, der Browser verlässt sich nicht darauf)', liste.map((m) => m.id).join(',') === '41,40,38,37,36,35', liste.map((m) => m.id));
  const k9 = liste.find((m) => m.kart === 'K9');
  check('amtliche Warnung: VOLLER Text bleibt voll (nicht der kurze Handy-Text), Quelle GeoSphere steht drin', k9.text === K9_VOLL && k9.text.length > 110 && /GeoSphere Austria/.test(k9.text) && k9.kurz === K9_KURZ);
  check('Doppel: der erste Eintrag gilt (kein „doppelt“)', k9.text !== 'doppelt' && liste.filter((m) => m.id === '40').length === 1);
  check('id als Text (Zahl oder Text vom Server), ms = Zeit', liste.every((m) => typeof m.id === 'string') && liste[0].ms === Date.parse('2026-11-26T03:12:00Z'));
  const k1 = liste.find((m) => m.kart === 'K1');
  check('fehlende Felder: Art-Name aus G10 („Vorabend-Lage“), Titel = Art-Name, Text = kurzer Text', k1.art_name === 'Vorabend-Lage' && k1.titel === 'Vorabend-Lage' && k1.text === 'Heute Nacht Glätte möglich ab ca. 02:00 – 3 Objekte.');
  check('kritisch nur bei echtem true', liste.find((m) => m.kart === 'K10').kritisch === true && liste.find((m) => m.kart === 'TEST').kritisch === false && MT.mitteilungenLesen({ v: 1, mitteilungen: [{ ...ANTWORT.mitteilungen[0], kritisch: 'true' }] })[0].kritisch === false);
  check('unbekannte Fassung (v 2) → null (keine Glocke)', MT.mitteilungenLesen({ ...kopie(ANTWORT), v: 2 }) === null);
  check('kaputte Antwort → null, kein Absturz', MT.mitteilungenLesen(null) === null && MT.mitteilungenLesen('x') === null && MT.mitteilungenLesen([]) === null && MT.mitteilungenLesen({}) === null);
  check('v1 ohne Liste bzw. leere Liste → leere Liste (Glocke ohne Zähler)', MT.mitteilungenLesen({ v: 1 }).length === 0 && MT.mitteilungenLesen({ v: 1, mitteilungen: [] }).length === 0);
  const viele = { v: 1, mitteilungen: Array.from({ length: 250 }, (_, i) => ({ id: i + 1, kart: 'K4', titel: 'Schnee kommt', text: 't', zeit: new Date(JETZT - i * 60_000).toISOString() })) };
  const vl = MT.mitteilungenLesen(viele);
  check('höchstens 200 (wie der Server), die neuesten', vl.length === 200 && vl[0].id === '1' && vl[199].id === '200');
  const gleich = MT.mitteilungenLesen({ v: 1, mitteilungen: [{ id: 9, kart: 'K4', text: 'a', zeit: '2026-11-26T05:00:00Z' }, { id: 10, kart: 'K4', text: 'b', zeit: '2026-11-26T05:00:00Z' }] });
  check('gleiche Zeit → höhere id zuerst (stabil)', gleich.map((m) => m.id).join(',') === '10,9');
}

// ---------------------------------------------------------------------------------------------------------------- [2]
console.log('\n[2] laden');
{
  let a = attrappe();
  let l = await MT.ladeMitteilungen(a, 'o-1');
  check('RPC fehlt (Nachtrag nicht eingespielt, PGRST202/404) → „aus“ (keine Glocke)', l.art === 'aus');
  check('… Aufruf meine_mitteilungen mit NUR p_org (kein Gelesen-Stand, kein p_seit, nichts über Geräte)', a.aufrufe.length === 1 && a.aufrufe[0].name === 'meine_mitteilungen' && JSON.stringify(Object.keys(a.aufrufe[0].args)) === '["p_org"]' && a.aufrufe[0].args.p_org === 'o-1');
  l = await MT.ladeMitteilungen(attrappe({ meine_mitteilungen: { data: null, error: { message: 'Could not find the function public.meine_mitteilungen(p_org) in the schema cache' }, status: 404 } }), 'o-1');
  check('… auch nur am Wortlaut erkannt („Could not find the function“) → „aus“', l.art === 'aus');
  l = await MT.ladeMitteilungen(attrappe({ meine_mitteilungen: { data: null, error: null } }), 'o-1');
  check('kein Mitglied (Server antwortet null) → „aus“', l.art === 'aus');
  l = await MT.ladeMitteilungen(attrappe({ meine_mitteilungen: { data: null, error: { code: '42501', message: 'kein Mitglied' }, status: 403 } }), 'o-1');
  check('kein Mitglied (Server verweigert, 42501) → „aus“', l.art === 'aus');
  l = await MT.ladeMitteilungen(attrappe({ meine_mitteilungen: { data: { v: 1, fehler: 'kein_mitglied', mitteilungen: [] }, error: null } }), 'o-1');
  check('kein Mitglied (Vertrag: {v:1, fehler:\'kein_mitglied\', mitteilungen:[]}) → „aus“, KEINE leere Glocke', l.art === 'aus', l);
  l = await MT.ladeMitteilungen(attrappe({ meine_mitteilungen: { data: { v: 1, fehler: 'nicht_angemeldet', mitteilungen: [] }, error: null } }), 'o-1');
  check('Anmeldung abgelaufen ({v:1, fehler:\'nicht_angemeldet\'}) → „fehler“ (letzter Stand bleibt, keine leere Liste)', l.art === 'fehler', l);
  l = await MT.ladeMitteilungen(attrappe({ meine_mitteilungen: { data: { v: 1, fehler: 42, mitteilungen: [] }, error: null } }), 'o-1');
  check('unbekannte Absage → „fehler“, nie eine leere Liste', l.art === 'fehler', l);
  check('mitteilungenLesen: Antwort mit fehler → null (nie „Keine Mitteilungen“)', MT.mitteilungenLesen({ v: 1, fehler: 'kein_mitglied', mitteilungen: [] }) === null && MT.absageVon({ v: 1, fehler: 'kein_mitglied' }) === 'kein_mitglied' && MT.absageVon({ v: 1, fehler: null, mitteilungen: [] }) === null && MT.absageVon(kopie(ANTWORT)) === null);
  l = await MT.ladeMitteilungen(attrappe({ meine_mitteilungen: { data: { v: 2 }, error: null } }), 'o-1');
  check('unbekannte Fassung → „aus“', l.art === 'aus');
  l = await MT.ladeMitteilungen(attrappe({ meine_mitteilungen: { data: null, error: { message: 'Failed to fetch' }, status: 0 } }), 'o-1');
  check('Netzfehler → „fehler“ (der letzte Stand bleibt stehen, Glocke verschwindet nicht)', l.art === 'fehler');
  l = await MT.ladeMitteilungen(attrappe({ meine_mitteilungen: { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' }, status: 500 } }), 'o-1');
  check('Server-Fehler (500) → „fehler“, nicht „aus“', l.art === 'fehler');
  l = await MT.ladeMitteilungen({ rpc() { throw new Error('kaputt'); } }, 'o-1');
  check('wirft nie (Client wirft) → „fehler“', l.art === 'fehler');
  l = await MT.ladeMitteilungen({ rpc: () => Promise.reject(new Error('weg')) }, 'o-1');
  check('wirft nie (Promise abgelehnt) → „fehler“', l.art === 'fehler');
  l = await MT.ladeMitteilungen(attrappe({ meine_mitteilungen: { data: kopie(ANTWORT), error: null } }), 'o-1', () => JETZT);
  check('ok → Liste, Betrieb und Abrufzeit dabei', l.art === 'ok' && l.liste.length === 6 && l.orgId === 'o-1' && l.abgerufen === JETZT);
}

// ---------------------------------------------------------------------------------------------------------------- [3]
console.log('\n[3] Heute / Gestern / Älter (Kalendertag in Wien)');
{
  const g = MT.gruppieren(liste, JETZT, TZ);
  check('Reihenfolge Heute, Gestern, Älter; nur Gruppen mit Einträgen', g.map((x) => x.gruppe).join(',') === 'Heute,Gestern,Älter', g.map((x) => x.gruppe));
  check('Heute: 04:12 und 00:30 Wiener Zeit (00:30 ist in UTC noch „gestern“ 23:30)', g[0].eintraege.map((m) => m.id).join(',') === '41,40');
  check('Gestern: 23:59, 19:00 und 02:45 vom 25.11. (23:59 Wien ist in UTC 22:59)', g[1].eintraege.map((m) => m.id).join(',') === '38,37,36');
  check('Älter: 24.11.', g[2].eintraege.map((m) => m.id).join(',') === '35');
  check('Zukunft (schiefe Uhr) → Heute', MT.gruppeVon(JETZT + 3 * 3_600_000, JETZT, TZ) === 'Heute');
  check('leere Liste → keine Gruppe', MT.gruppieren([], JETZT, TZ).length === 0);
  // Sommerzeit beginnt So 29.03.2026 02:00 → 03:00
  const mz = Date.parse('2026-03-29T01:30:00Z'); // 03:30 MESZ
  check('Sommerzeit-Beginn: 23:30 MEZ vom 28.03. → Gestern, 00:30 vom 29.03. → Heute, 23:59 vom 27.03. → Älter',
    MT.gruppeVon(Date.parse('2026-03-28T22:30:00Z'), mz, TZ) === 'Gestern' && MT.gruppeVon(Date.parse('2026-03-28T23:30:00Z'), mz, TZ) === 'Heute' && MT.gruppeVon(Date.parse('2026-03-27T22:59:00Z'), mz, TZ) === 'Älter');
  // Sommerzeit endet So 25.10.2026 03:00 → 02:00
  const ok10 = Date.parse('2026-10-25T23:30:00Z'); // 00:30 MEZ am 26.10.
  check('Sommerzeit-Ende: 00:00 MESZ vom 25.10. → Gestern, 23:59 MESZ vom 24.10. → Älter, 00:10 vom 26.10. → Heute',
    MT.gruppeVon(Date.parse('2026-10-24T22:00:00Z'), ok10, TZ) === 'Gestern' && MT.gruppeVon(Date.parse('2026-10-24T21:59:00Z'), ok10, TZ) === 'Älter' && MT.gruppeVon(Date.parse('2026-10-25T23:10:00Z'), ok10, TZ) === 'Heute');
  check('Jahreswechsel: 31.12. 23:00 → am 01.01. „Gestern“', MT.gruppeVon(Date.parse('2026-12-31T22:00:00Z'), Date.parse('2027-01-01T08:00:00Z'), TZ) === 'Gestern');
}

// ---------------------------------------------------------------------------------------------------------------- [4]
console.log('\n[4] Uhrzeit-Texte');
{
  const k10 = liste.find((m) => m.kart === 'K10');
  const k5 = liste.find((m) => m.kart === 'K5');
  check('Liste heute/gestern: nur „04:12“ (die Gruppe sagt den Tag)', MT.eintragZeit(k10.ms, JETZT, TZ) === '04:12' && MT.eintragZeit(liste.find((m) => m.id === '38').ms, JETZT, TZ) === '23:59');
  check('Liste älter: „Di 24.11., 21:42“ (Wiener Zeit, Gerät auf UTC)', MT.eintragZeit(k5.ms, JETZT, TZ) === 'Di 24.11., 21:42', MT.eintragZeit(k5.ms, JETZT, TZ));
  check('Detail: „Do, 26.11.2026, 04:12 Uhr“', MT.vollZeit(k10.ms, TZ) === 'Do, 26.11.2026, 04:12 Uhr', MT.vollZeit(k10.ms, TZ));
  check('Detail einstellig: „So, 01.03.2026, 07:05 Uhr“', MT.vollZeit(Date.parse('2026-03-01T06:05:00Z'), TZ) === 'So, 01.03.2026, 07:05 Uhr', MT.vollZeit(Date.parse('2026-03-01T06:05:00Z'), TZ));
}

// ---------------------------------------------------------------------------------------------------------------- [5]
console.log('\n[5] Zähler „neu seit zuletzt geöffnet“ (nur dieser Browser)');
{
  speicher.clear();
  const org = 'o-1';
  check('Schlüssel je Betrieb, nur die Zeit', MT.GESEHEN_KEY(org) === 'winterdex.mitteilungen.gesehen.o-1');
  check('nie geöffnet → gesehen null', MT.gesehenLesen(org) === null);
  check('erster Besuch: nur die letzten 24 Std. zählen als neu (4 statt 6)', MT.neuZahl(liste, null, JETZT) === 4);
  const st = MT.gesehenMerken(org, liste[0].ms);
  check('Glocke geöffnet → Zeit der neuesten Mitteilung gemerkt (Server-Zeit), Zähler 0', st === liste[0].ms && MT.gesehenLesen(org) === liste[0].ms && MT.neuZahl(liste, MT.gesehenLesen(org), JETZT) === 0);
  check('… im Speicher steht nur eine Zahl (keine ids, keine Texte)', /^\d+$/.test(speicher.get(MT.GESEHEN_KEY(org))));
  const neu = [{ ...liste[0], id: '42', ms: liste[0].ms + 60_000 }, ...liste];
  check('neue Mitteilung danach → 1 neu, markiert', MT.neuZahl(neu, MT.gesehenLesen(org), JETZT) === 1 && MT.istNeu(neu[0], MT.gesehenLesen(org), JETZT) && !MT.istNeu(neu[1], MT.gesehenLesen(org), JETZT));
  MT.gesehenMerken(org, liste[3].ms);
  check('nie rückwärts (anderer Tab sah schon Neueres)', MT.gesehenLesen(org) === liste[0].ms);
  check('leere Liste / kaputte Zeit → Stand bleibt', MT.gesehenMerken(org, undefined) === liste[0].ms && MT.gesehenMerken(org, NaN) === liste[0].ms && MT.gesehenLesen(org) === liste[0].ms);
  check('anderer Betrieb: eigener Stand', MT.gesehenLesen('o-2') === null && MT.neuZahl(liste, MT.gesehenLesen('o-2'), JETZT) === 4);
  for (const roh of ['abc', '-5', '', '  ', '0', 'Infinity']) {
    speicher.set(MT.GESEHEN_KEY('o-3'), roh);
    if (MT.gesehenLesen('o-3') !== null) check(`Unsinn im Speicher („${roh}“) → null`, false);
  }
  check('Unsinn im Speicher (abc, -5, leer, 0, Infinity) → null', MT.gesehenLesen('o-3') === null);
  globalThis.localStorage = { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('gesperrt'); }, removeItem() {} };
  let wirft = false;
  let r = null;
  try {
    r = [MT.gesehenLesen(org), MT.gesehenMerken(org, liste[0].ms)];
  } catch {
    wirft = true;
  }
  check('Speicher gesperrt (privater Modus): wirft nie, Zähler rechnet weiter', !wirft && r[0] === null && r[1] === liste[0].ms);
  globalThis.localStorage = normalerSpeicher;
  check('Zähler-Text: 0 → leer, 7 → „7“, 99 → „99“, 100 → „99+“', MT.zaehlerText(0) === '' && MT.zaehlerText(7) === '7' && MT.zaehlerText(99) === '99' && MT.zaehlerText(100) === '99+');
}

// ---------------------------------------------------------------------------------------------------------------- [6]
console.log('\n[6] Symbol und Name je Art');
{
  const arten = ['K1', 'K2', 'K4', 'K5', 'K7', 'K8', 'K9', 'K10', 'TEST'];
  const sym = arten.map((k) => MT.artSymbol(k));
  check('jede Art hat ein eigenes Symbol', new Set(sym).size === arten.length && !sym.includes('info'), sym);
  check('unbekannte Art → allgemeines Symbol', MT.artSymbol('K3') === 'info' && MT.artSymbol('') === 'info');
  check('Schnee-Wecker (K10) mit Namen in G10 (Team-Karte und Glocke)', WG.ART_NAME.K10 === 'Schnee-Wecker' && MT.artName('K10') === 'Schnee-Wecker');
  check('Art extra nur, wenn der Titel sie nicht schon nennt („❄️ Schnee-Wecker“ nein, „Heute Nacht Glätte möglich“ → Vorabend-Lage ja)',
    !MT.artZeigen({ titel: '❄️ Schnee-Wecker', art_name: 'Schnee-Wecker' }) && !MT.artZeigen({ titel: 'Amtliche Warnung', art_name: 'Amtliche Warnung' }) && MT.artZeigen({ titel: 'Heute Nacht Glätte möglich', art_name: 'Vorabend-Lage' }));
  check('Name: Server-Wort zuerst, sonst G10, sonst „Mitteilung“', MT.artName('K9', 'Amtlich') === 'Amtlich' && MT.artName('K9', '  ') === 'Amtliche Warnung' && MT.artName('K99') === 'Mitteilung');
}

// ---------------------------------------------------------------------------------------------------------------- [7]
console.log('\n[7] Quelltext-Wächter');
{
  const dateien = [];
  const lauf = (d) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) lauf(p);
      else if (/\.(ts|tsx)$/.test(f)) dateien.push(p);
    }
  };
  lauf(path.join(here, '..', 'src'));
  const src = dateien.map((p) => [path.relative(path.join(here, '..'), p).split(path.sep).join('/'), readFileSync(p, 'utf8').replace(/\r\n/g, '\n')]);
  const area = lies('src/winterdex/WinterdexArea.tsx');
  // src/dev = Vorschau mit Beispieldaten, nur im Dev-Server (App.tsx: import.meta.env.DEV), nie im Produktions-Build
  const glockeIn = src.filter(([p, s]) => !p.startsWith('src/dev/') && /<MitteilungsGlocke\b/.test(s)).map(([p]) => p);
  check('Glocke nur im WinterDex-Bereich (keine andere App, nicht in der allgemeinen Kopfzeile; Vorschau nur im Dev-Server)',
    glockeIn.length === 1 && glockeIn[0] === 'src/winterdex/WinterdexArea.tsx' && !/Mitteilung/.test(lies('src/components/AppArea.tsx')) && /const Vorschau = import\.meta\.env\.DEV/.test(lies('src/App.tsx')), glockeIn);
  check('Glocke + Provider innerhalb von OrgGate (Betrieb steht fest), Platz in der Kopfzeile per ref',
    /<OrgGate[^>]*>[\s\S]*<MitteilungenProvider base=\{`\/app\/\$\{app\.id\}`\}>[\s\S]*<MitteilungsGlocke platz=\{glockenPlatz\} \/>[\s\S]*<\/MitteilungenProvider>[\s\S]*<\/OrgGate>/.test(area) && /<span className="mt-platz" ref=\{setGlockenPlatz\} \/>/.test(area));
  check('Seiten „Alle Mitteilungen“ und Detail im Dashboard', /<Route path="mitteilungen" element=\{<MitteilungenSeite \/>\} \/>/.test(area) && /<Route path="mitteilungen\/:id" element=\{<MitteilungSeite \/>\} \/>/.test(area));
  check('kein „gelesen“ an den Server (AVV § 4a): keine RPC mit gelesen, kein Schreiben in wetter_push aus dem Browser',
    !src.some(([, s]) => /rpc\(\s*['"][^'"]*(gelesen|gesehen|read)/i.test(s)) && !src.some(([, s]) => /from\(['"]wetter_push['"]\)[\s\S]{0,80}\.(insert|update|upsert|delete)\(/.test(s)));
  const center = lies('src/winterdex/MitteilungsCenter.tsx');
  const seiten = lies('src/winterdex/pages/Mitteilungen.tsx');
  check('Liste und Detail zeigen den VOLLEN Text (m.text), nie nur den kurzen Handy-Text', /<span className="mt-text">\{m\.text\}<\/span>/.test(center) && /<p className="mt-detail-text">\{m\.text\}<\/p>/.test(center) && !/m\.kurz/.test(center + seiten));
  check('Detail: Karte „Heute Nacht“ darunter (mit festen Links, nicht relativ zur Detail-Adresse)', /<HeuteNacht[\s\S]*links=\{\{ objekte: `\$\{base\}\/objekte`, team: `\$\{base\}\/team`, abo: `\$\{base\}\/abo` \}\}/.test(seiten));
  check('Glocke unsichtbar, solange der Server nichts anbietet (da = false)', /if \(!st \|\| !st\.da \|\| !platz\) return null;/.test(center));
  // useUnsavedGuard (Aufzeichnung läuft / Einsatz nicht gespeichert) fängt nur Klicks auf Links ab — ein navigate()
  // aus der Glocke verließe den Außendienst ohne Rückfrage
  const ohneKommentar = center.replace(/^\s*\/\/.*$/gm, '');
  check('Einträge im Glockenfenster sind Links (Rückfrage „Aufzeichnung läuft“ greift), kein navigate() aus der Glocke',
    /<Link key=\{m\.id\} to=\{st\.pfad\(m\.id\)\} className=\{`mt-eintrag/.test(center) && !/useNavigate|navigate\(/.test(ohneKommentar) && !/<button[^>]*mt-eintrag/.test(center));
  const schutz = lies('src/components/ui.tsx');
  check('… die Rückfrage fängt wirklich nur a[href] ab (sonst wäre der Wächter oben unnötig)', /closest\?\.\('a\[href\]'\)/.test(schutz));
  check('ein Abruf je Betrieb (Kontext), alle 2 Min. still neu', /useLiveRefresh\(\[laden\], 2 \* 60_000\)/.test(lies('src/winterdex/mitteilungenKontext.ts')));
  const neueDateien = ['src/winterdex/mitteilungenDaten.ts', 'src/winterdex/mitteilungenKontext.ts', 'src/winterdex/MitteilungsCenter.tsx', 'src/winterdex/pages/Mitteilungen.tsx'].map(lies).join('\n');
  check('keine Datums-Falle (toISOString().slice) in den neuen Dateien', !/toISOString\(\)\.slice/.test(neueDateien));
  check('Dashboard schaltet keine Arten (G8): kein set_push_arten', !/set_push_arten/.test(neueDateien.replace(/^\s*\/\/.*$/gm, '')));
}

// ---------------------------------------------------------------------------------------------------------------- [8]
console.log('\n[8] Gegenprobe SQL-Nachtrag');
{
  let sql = null;
  for (const d of [process.env.WINTERDEX_DIR, ...['WinterDex-wt-mitteilungen', 'WinterDex-wt-einbau', 'WinterDex'].map((n) => path.join(here, '..', '..', n))].filter(Boolean)) {
    const p = path.join(d, 'supabase', 'NACHTRAG-MITTEILUNGEN-2026-11-26.sql');
    if (existsSync(p)) {
      sql = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
      break;
    }
  }
  if (sql) {
    check('SQL: meine_mitteilungen(p_org …) liefert die Felder, die das Dashboard liest', /function public\.meine_mitteilungen\s*\(\s*p_org uuid/i.test(sql) && ['mitteilungen', 'art_name', 'titel', 'text', 'kurz', 'zeit', 'kritisch'].every((k) => sql.includes(`'${k}'`)));
    check('SQL: Fassung v 1', /'v',\s*1\b/.test(sql));
    // Absage des Servers: das Dashboard versteckt die Glocke nur beim Wort „kein_mitglied“ (sonst: letzter Stand bleibt)
    const rpc = sql.slice(sql.search(/create or replace function public\.meine_mitteilungen/i));
    const rpcAbsagen = [...rpc.slice(0, rpc.search(/\bend \$\$;/)).matchAll(/'fehler',\s*'([a-z_]+)'/g)].map((x) => x[1]);
    check('SQL: Absage für Nicht-Mitglieder heißt „kein_mitglied“ (vom Dashboard erkannt), sonst nur „nicht_angemeldet“',
      rpcAbsagen.includes('kein_mitglied') && rpcAbsagen.every((w) => ['kein_mitglied', 'nicht_angemeldet'].includes(w)), rpcAbsagen);
    check('SQL: kein Gelesen-Stand am Server', !/gelesen_at|gelesen\s+(boolean|timestamptz)/i.test(sql));
  } else console.log('  --    (Gegenprobe übersprungen: keine WinterDex-Arbeitskopie mit NACHTRAG-MITTEILUNGEN-2026-11-26.sql gefunden)');
}

console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail === 0 ? 0 : 1);
