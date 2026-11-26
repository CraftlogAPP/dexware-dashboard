// WinterDex Wetter-Guide im Dashboard (26.11.2026) — Karte „Heute Nacht“, Wetterverlauf im Prüfbericht (Web, PDF, Excel),
// Team-Karte „Wetter-Guide“. Ohne Browser und ohne Netz; Daten = echte Antworten der WinterDex-Proben (src/winterdex/
// wetterDemo.ts: heute_nacht aus der PGlite-Probe, Belege aus dem Worker beleg.ts), keine Kundendaten.
//   [1] heute_nacht lesen + laden (Vertrag v1, RPC fehlt → aus, Fehler → letzter Stand, Paywall „ereignisse“)
//   [2] Sichtbarkeit (nur karte_live vom Server, Saison, nie ohne Warn-Ort), Titel, Ampel (nie grün aus „unbekannt“)
//   [3] Streifen 12 / 6 Spalten (Gefahr wird nie weggemittelt), Mengen
//   [4] Morgen-Satz (voraussichtlich ja/nein/knapp, gesendet, Stand > 3 Std., nach der Weckzeit nur Pro)
//   [5] Betroffen / erledigt (nur Zahlen), Fußzeile, amtlich (Stufe als Wort), Deutschland nicht angebunden
//   [6] Wetterverlauf: Stand-Texte (nie leer), Laden (500er-Blöcke, RPC fehlt → aus), Archivvermerk, Quellen, Zeitleiste
//   [7] PDFs: Einsatz-Nachweis (Kurzsatz G13 + Wetter-Prüfcode, Free „mit Pro“, Storno durchgestrichen), Fahrt-PDF-Kasten,
//       Fahrtenbuch nur Kurzsatz, ohne Wetter-Daten unverändert
//   [8] Excel: zwei Spalten nur mit Wetter-Daten
//   [9] Team-Karte: Geräte nur Inhaber/Verwalter, nur freigegebene Spalten, Mitarbeiter-Info
//   [10] Quelltext-Wächter (kein set_push_arten im Browser, kein select('*'), keine Bewertungs-Wörter, Dateinamen)
//
//   Aufruf:  node tests/wetter-dashboard.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Gerät absichtlich auf UTC: alle Uhrzeiten müssen trotzdem Wiener Zeit zeigen
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
// localStorage-Attrappe (Node hat keins)
const speicher = new Map();
globalThis.localStorage = {
  getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => speicher.set(k, String(v)),
  removeItem: (k) => speicher.delete(k),
};
const web = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
const lies = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 500)}`);
};

const HN = await web('src/winterdex/heuteNachtDaten.ts');
const WB = await web('src/winterdex/wetterBeleg.ts');
const WG = await web('src/winterdex/wetterGuide.ts');
const DEMO = await web('src/winterdex/wetterDemo.ts');
const REP = await web('src/winterdex/report.ts');
const RR = await web('src/winterdex/routeReport.ts');
const XL = await web('src/winterdex/exportLists.ts');
const TZ = 'Europe/Vienna';
const ABEND = Date.parse('2026-11-25T21:32:00Z'); // 22:32 Wien, 5 min nach dem Stand der Probe
const kopie = (x) => JSON.parse(JSON.stringify(x));
/** SQL-Nachtrag aus einer WinterDex-Arbeitskopie (Gegenprobe der Texte/Rechte) — fehlt sie, wird übersprungen */
const winterdexSql = (datei) => {
  for (const d of [process.env.WINTERDEX_DIR, path.join(here, '..', '..', 'WinterDex'), path.join(here, '..', '..', 'WinterDex-wt-einbau')].filter(Boolean)) {
    const p = path.join(d, 'supabase', datei);
    if (existsSync(p)) return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  }
  return null;
};
const VERBOTEN = /(rechtzeitig|fristgerecht|pflicht erfüllt|wartefrist|geräumt ab|keine glätte|rechtssicher|gerichtsfest|beweist|\bmessung|\bgemessen)/i;

/** supabase-js-Attrappe: rpc(name, args) und from(t).select(c).eq().order().limit() / .in() */
function attrappe({ rpc = {}, tabellen = {} } = {}) {
  const aufrufe = [];
  const kette = (t) => {
    const q = { t, sel: null, filter: [] };
    const p = {
      select(c) {
        q.sel = c;
        return p;
      },
      eq(k, v) {
        q.filter.push(['eq', k, v]);
        return p;
      },
      in(k, v) {
        q.filter.push(['in', k, v]);
        return p;
      },
      order() {
        return p;
      },
      limit() {
        return p;
      },
      then(ok, nein) {
        aufrufe.push({ art: 'from', ...q });
        const f = tabellen[t];
        return Promise.resolve(typeof f === 'function' ? f(q) : (f ?? { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } })).then(ok, nein);
      },
    };
    return p;
  };
  return {
    aufrufe,
    rpc(name, args, opts) {
      aufrufe.push({ art: 'rpc', name, args, opts });
      const f = rpc[name];
      if (!f) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, status: 404 });
      return Promise.resolve(typeof f === 'function' ? f(args) : f);
    },
    from: kette,
  };
}

// ---------------------------------------------------------------------------------------------------------------- [1]
console.log('\n[1] heute_nacht lesen + laden');
const probe = HN.heuteNachtLesen(DEMO.HN_PROBE);
{
  check('Probe (PGlite, echter Vertrag v1) wird gelesen: 24 Stunden, Ampel 3, amtlich 3, Gebiet 3 Zellen', !!probe && probe.stunden.length === 24 && probe.ampel_gesamt === 3 && probe.amtlich.length === 3 && probe.gebiet.zellen === 3, probe && { n: probe.stunden.length, a: probe.ampel_gesamt });
  check('karte_live der Probe = false (Schatten) → bleibt false', probe.karte_live === false);
  check('Paywall: ereignisse null (ohne Pro) bleibt null — nie eine leere Liste erfunden', probe.ereignisse === null);
  check('unbekannte Fassung (v 2) → null', HN.heuteNachtLesen({ ...kopie(DEMO.HN_PROBE), v: 2 }) === null);
  check('kaputte Antwort → null, kein Absturz', HN.heuteNachtLesen('x') === null && HN.heuteNachtLesen(null) === null && HN.heuteNachtLesen([]) === null);
  const k = kopie(DEMO.HN_PROBE);
  k.stunden[0].ampel = 7;
  k.stunden[1].ts = 'kaputt';
  const kl = HN.heuteNachtLesen(k);
  check('Ampel außerhalb 0–3 → null (unbekannt), Stunde ohne gültige Zeit fällt weg', kl.stunden[0].ampel === null && kl.stunden.length === 23);
  check('rpcFehlt: PGRST202 / 404 / „Could not find the function“ ja; Netzfehler nein',
    HN.rpcFehlt({ code: 'PGRST202' }) && HN.rpcFehlt({ status: 404 }) && HN.rpcFehlt({ message: 'Could not find the function public.heute_nacht' }) && !HN.rpcFehlt({ message: 'Failed to fetch' }) && !HN.rpcFehlt(null));

  const org = 'o-1';
  speicher.clear();
  let a = attrappe();
  let l = await HN.ladeHeuteNacht(a, org);
  check('RPC fehlt (Nachtrag nicht eingespielt) → „aus“ (keine Karte)', l.art === 'aus');
  check('… Aufruf per supabase.rpc ohne { get: true } (= POST, die RPC schreibt zuletzt_benutzt)', a.aufrufe[0].name === 'heute_nacht' && a.aufrufe[0].args.p_org === org && !a.aufrufe[0].opts?.get);
  l = await HN.ladeHeuteNacht(attrappe({ rpc: { heute_nacht: { data: null, error: null } } }), org);
  check('Nicht-Mitglied (Server antwortet null) → „aus“', l.art === 'aus');
  const live = { ...kopie(DEMO.HN_PROBE), karte_live: true };
  l = await HN.ladeHeuteNacht(attrappe({ rpc: { heute_nacht: { data: live, error: null } } }), org, () => ABEND);
  check('freigegeben → „ok“, Stand im Browser gemerkt', l.art === 'ok' && l.d.karte_live && !!HN.letzterStand(org, ABEND));
  l = await HN.ladeHeuteNacht(attrappe({ rpc: { heute_nacht: { data: null, error: { message: 'Failed to fetch' } } } }), org, () => ABEND + 50 * 60_000);
  check('Netzfehler → „fehler“ mit letztem Stand (offline) und warLive', l.art === 'fehler' && !!l.alt && l.alt.abgerufen === ABEND && l.warLive === true);
  l = await HN.ladeHeuteNacht(attrappe({ rpc: { heute_nacht: { data: null, error: { message: 'Failed to fetch' } } } }), org, () => ABEND + 13 * 3_600_000);
  check('… letzter Stand älter als 12 Std. wird nicht mehr gezeigt (warLive bleibt → „nicht abrufbar“)', l.art === 'fehler' && l.alt === null && l.warLive === true);
  l = await HN.ladeHeuteNacht(attrappe({ rpc: { heute_nacht: { data: kopie(DEMO.HN_PROBE), error: null } } }), org, () => ABEND);
  check('Karte (wieder) nicht freigegeben → gemerkter Stand gelöscht', l.art === 'ok' && !l.d.karte_live && HN.letzterStand(org, ABEND) === null);
  l = await HN.ladeHeuteNacht(attrappe({ rpc: { heute_nacht: { data: null, error: { message: 'Failed to fetch' } } } }), org, () => ABEND);
  check('… danach zeigt ein Netzfehler nichts (warLive false)', l.art === 'fehler' && l.alt === null && l.warLive === false);
  const wirft = { rpc() { throw new Error('kaputt'); } };
  l = await HN.ladeHeuteNacht(wirft, org);
  check('wirft nie (Client wirft) → „fehler“', l.art === 'fehler');
}

// ---------------------------------------------------------------------------------------------------------------- [2]
console.log('\n[2] Sichtbarkeit, Titel, Ampel');
{
  const d = { ...kopie(probe), karte_live: true };
  check('karte_live false → nie sichtbar (der Server entscheidet)', HN.hnSichtbar(probe, ABEND, TZ, true) === false);
  check('karte_live, Saison (25.11.) → sichtbar', HN.hnSichtbar(d, ABEND, TZ, false) === true);
  const sommer = Date.parse('2026-07-15T20:00:00Z');
  const gruen = { ...kopie(d), ampel_gesamt: 0, amtlich: [] };
  check('Sommer: grün → unsichtbar; ab gelb sichtbar', !HN.hnSichtbar(gruen, sommer, TZ, true) && HN.hnSichtbar({ ...gruen, ampel_gesamt: 1 }, sommer, TZ, true));
  const ohne = { ...kopie(d), gebiet: { ...d.gebiet, zellen: 0 }, ohne_standort_n: 3 };
  check('nur Objekte ohne Standort: Inhaber/Verwalter sehen den Hinweis, Mitarbeiter nichts', HN.hnSichtbar(ohne, ABEND, TZ, true) && !HN.hnSichtbar(ohne, ABEND, TZ, false));
  check('kein Warn-Ort und nichts ohne Standort → unsichtbar', !HN.hnSichtbar({ ...ohne, ohne_standort_n: 0 }, ABEND, TZ, true));
  check('Titel 22:32 → „Heute Nacht“, 03:59 → „Heute Nacht“, 04:00 → „Heute“, 14:59 → „Heute“, 15:00 → „Heute Nacht“',
    HN.hnTitel(ABEND, TZ) === 'Heute Nacht' && HN.hnTitel(Date.parse('2026-11-26T02:59:00Z'), TZ) === 'Heute Nacht' && HN.hnTitel(Date.parse('2026-11-26T03:00:00Z'), TZ) === 'Heute' &&
      HN.hnTitel(Date.parse('2026-11-26T13:59:00Z'), TZ) === 'Heute' && HN.hnTitel(Date.parse('2026-11-26T14:00:00Z'), TZ) === 'Heute Nacht');
  const w = (a, o) => HN.ampelAnzeige(a, o).wort;
  check('Ampel-Wörter (5.3): unwahrscheinlich / möglich / wahrscheinlich / Starke Glätte / Eisregen-Gefahr',
    w(0) === 'Glätte unwahrscheinlich' && w(1) === 'Glätte möglich' && w(2) === 'Glätte wahrscheinlich' && w(3) === 'Starke Glätte' && w(3, { eisregen: true }) === 'Eisregen-Gefahr');
  check('unbekannt → „Lage unbekannt“, nie grün', w(null) === 'Lage unbekannt' && HN.ampelAnzeige(null).klasse === 'hn-au');
  check('immer Zeichen + Wort (nie nur Farbe)', [0, 1, 2, 3, null].every((a) => HN.ampelAnzeige(a).zeichen && HN.ampelAnzeige(a).wort));
  check('Probe: gefrierender Regen in Sicht → rot heißt „Eisregen-Gefahr“', HN.eisregenInSicht(d) && HN.ampelAnzeige(d.ampel_gesamt, { eisregen: HN.eisregenInSicht(d) }).wort === 'Eisregen-Gefahr');
  check('„Glätte jetzt“ nur morgens (04–12 Uhr) bei laufender Stunde ab orange', !HN.glaetteJetzt(d, ABEND, TZ) && HN.glaetteJetzt(d, Date.parse('2026-11-26T05:00:00Z'), TZ));
  check('Saison 1.10.–30.4. (Ortszeit)', HN.inSaison(Date.parse('2026-10-01T00:30:00Z'), TZ) && HN.inSaison(Date.parse('2026-04-30T20:00:00Z'), TZ) && !HN.inSaison(Date.parse('2026-04-30T22:30:00Z'), TZ) && !HN.inSaison(Date.parse('2026-09-30T21:59:00Z'), TZ));
}

// ---------------------------------------------------------------------------------------------------------------- [3]
console.log('\n[3] Streifen');
{
  const s12 = HN.streifen(probe.stunden, 12);
  const s6 = HN.streifen(probe.stunden, 6);
  check('12 Spalten à 1 Std. / 6 Spalten à 2 Std. (jetzt + 12 Std.)', s12.length === 12 && s6.length === 6 && s6.every((s) => s.dauer === 2) && s6[1].von === s12[2].von);
  const st = (ampel, art, mm, t = -1, sc = null) => ({ ts: '2026-11-25T21:00:00Z', t, mm, schnee_cm: sc, art, ampel });
  const z = HN.streifen([st(0, 'trocken', 0), st(2, 'schnee', 1, -3, [0.5, 1])], 6)[0];
  check('zusammengelegt: Gefahr bleibt (max), Art die schwerste, Menge summiert, Tiefstwert', z.ampel === 2 && z.art === 'schnee' && z.mm === 1 && z.t === -3);
  const u = HN.streifen([st(0, 'trocken', 0), st(null, null, null, null)], 6)[0];
  check('grün + unbekannt → unbekannt (nie grün aus Lücken)', u.ampel === null && u.art === null);
  const g = HN.streifen([st(1, 'gefrierend', 0.6, -1, [0.1, 0.3]), st(null, null, null)], 6)[0];
  check('gelb + unbekannt → gelb (Gefahr auch bei Lücke)', g.ampel === 1 && g.art === 'gefrierend');
  check('Menge: Schnee als cm-Spanne, gefrierender Regen in mm (nie cm), trocken leer',
    HN.mengeText({ art: 'schnee', mm: 2, schnee: [1, 3] }) === '1–3 cm' && HN.mengeText({ art: 'gefrierend', mm: 0.6, schnee: [0.1, 0.3] }) === '0,6 mm' && HN.mengeText({ art: 'trocken', mm: 0, schnee: null }) === '');
  check('Grad: −0,6 → „−1°“, 0 → „0°“, null → „–“', HN.gradText(-0.6) === '−1°' && HN.gradText(0) === '0°' && HN.gradText(null) === '–');
}

// ---------------------------------------------------------------------------------------------------------------- [4]
console.log('\n[4] Morgen-Satz');
{
  const d = kopie(probe);
  const mit = (m, extra = {}) => ({ ...d, ...extra, morgen: { ...d.morgen, ...m } });
  check('voraussichtlich ja (+ Grund)', HN.morgenSatz(mit({ erwartet: 'ja', grund: 'Eisregen' }), ABEND, TZ)?.satz === 'Frühwarnung 02:45: voraussichtlich ja' && HN.morgenSatz(mit({ erwartet: 'ja', grund: 'Eisregen' }), ABEND, TZ).grund === 'Eisregen');
  check('voraussichtlich nein / knapp – kann kommen', HN.morgenSatz(mit({ erwartet: 'nein' }), ABEND, TZ)?.satz === 'Frühwarnung 02:45: voraussichtlich nein' && HN.morgenSatz(mit({ erwartet: 'knapp' }), ABEND, TZ)?.satz === 'Frühwarnung 02:45: knapp – kann kommen');
  check('ohne Entscheidung (erwartet null, z. B. k12_quelle ≠ geosphere) → kein Satz', HN.morgenSatz(mit({ erwartet: null }), ABEND, TZ) === null);
  check('Stand älter als 3 Std. → kein Satz', HN.morgenSatz(mit({ erwartet: 'ja' }), ABEND + 3 * 3_600_000 + 60_000, TZ) === null);
  check('im Funkloch gezeigter Stand (abgerufen vor > 3 Std.) → kein Satz', HN.morgenSatz(mit({ erwartet: 'ja' }), ABEND + 60_000, TZ, ABEND - 3 * 3_600_000 - 60_000) === null);
  check('gesendet → „Frühwarnung 02:45 gesendet ✓“ (Tatsache, auch bei altem Stand)', HN.morgenSatz(mit({ gesendet_at: '2026-11-26T01:45:00Z' }), ABEND + 6 * 3_600_000, TZ)?.satz === 'Frühwarnung 02:45 gesendet ✓');
  const frueh = Date.parse('2026-11-26T03:10:00Z'); // 04:10 Wien, nach 02:45 + 75 min
  const nachher = mit({ erwartet: 'nein', pro: true }, { stand_at: '2026-11-26T03:00:00Z' });
  check('nach der Weckzeit, Pro, Entscheidung „nein“ → „Um 02:45 keine Warnung – keine Glättegefahr erkannt. Nächste Prüfung: 19:00.“', HN.morgenSatz(nachher, frueh, TZ)?.satz === 'Um 02:45 keine Warnung – keine Glättegefahr erkannt. Nächste Prüfung: 19:00.');
  check('… ohne Pro nie (es wurde ja nichts gesendet — kein falsches „keine Gefahr“)', HN.morgenSatz({ ...nachher, morgen: { ...nachher.morgen, pro: false } }, frueh, TZ) === null);
  check('während der Prüfung (02:45–04:00) kein Satz', HN.morgenSatz(mit({ erwartet: 'ja' }, { stand_at: '2026-11-26T01:50:00Z' }), Date.parse('2026-11-26T02:00:00Z'), TZ) === null);
  const eigene = mit({ erwartet: 'ja', zeit: '03:30' });
  check('eigene Weckzeit des Betriebs (03:30) steht im Satz', HN.morgenSatz(eigene, ABEND, TZ)?.satz === 'Frühwarnung 03:30: voraussichtlich ja');
  const satz = HN.vorleseSatz(mit({ erwartet: 'ja' }), ABEND, TZ);
  check('Bildschirmleser: ein Satz mit Titel, Lage, Tiefstwert, Ampel und Morgen-Satz', /^Heute Nacht: Achtung: gefrierender Regen/.test(satz) && /Tiefste Temperatur minus 1 Grad\./.test(satz) && /Eisregen-Gefahr\./.test(satz) && /Frühwarnung 02:45: voraussichtlich ja\./.test(satz), satz);
}

// ---------------------------------------------------------------------------------------------------------------- [5]
console.log('\n[5] Betroffen, Fußzeile, amtlich');
{
  const d = kopie(probe);
  check('Betroffen: „Betroffen: 3 Objekte“ (nur Zahlen, nie Namen)', HN.betroffenZeile(d, null) === 'Betroffen: 3 Objekte');
  const ids = d.je_ort.map((o) => o.ref_id);
  check('noch 2 von 3 betroffenen offen', HN.betroffenZeile(d, new Set([ids[0]])) === 'noch 2 von 3 betroffenen offen');
  check('alle betroffenen Objekte erledigt ✓', HN.betroffenZeile(d, new Set(ids)) === 'alle betroffenen Objekte erledigt ✓');
  check('nichts betroffen → keine Zeile', HN.betroffenZeile({ ...d, je_ort: d.je_ort.map((o) => ({ ...o, ampel: 0 })) }, null) === null);
  const ops = [
    { property_id: 'a', started_at: '2026-11-26T05:10:00Z', canceled: false },
    { property_id: 'b', started_at: '2026-11-26T05:20:00Z', canceled: true },
    { property_id: 'c', started_at: '2026-11-25T22:50:00Z', canceled: false }, // 23:50 Wien = gestern
  ];
  const tag = HN.erledigtHeute(ops, Date.parse('2026-11-26T08:00:00Z'), TZ);
  check('erledigt heute (Ortszeit, ohne Storno, gestern 23:50 zählt nicht)', tag && tag.has('a') && !tag.has('b') && !tag.has('c'));
  check('abends (ab 15 Uhr) und nachts nicht gezählt (dann zählt die Nacht)', HN.erledigtHeute(ops, ABEND, TZ) === null && HN.erledigtHeute(ops, Date.parse('2026-11-26T02:00:00Z'), TZ) === null);
  check('Fußzeile: „Vorhersage, Stand 22:27 · Datenquelle: GeoSphere Austria · ohne Gewähr“', HN.fussZeile(d, ABEND, TZ) === 'Vorhersage, Stand 22:27 · Datenquelle: GeoSphere Austria · ohne Gewähr', HN.fussZeile(d, ABEND, TZ));
  check('… anderer Tag mit Wochentag', /Stand Mi 22:27/.test(HN.fussZeile(d, ABEND + 86_400_000, TZ)));
  const gl = d.amtlich.find((a) => a.typ === 4);
  check('amtlich: „Amtlich: Gelbe Glatteiswarnung bis Do 09:00 – Pirching am Traubenberg (GeoSphere Austria)“ (Stufe als Wort)', HN.amtlichZeile(gl, TZ) === 'Amtlich: Gelbe Glatteiswarnung bis Do 09:00 – Pirching am Traubenberg (GeoSphere Austria)', HN.amtlichZeile(gl, TZ));
  check('Lage-Satz der Probe nennt die Glatteiswarnung schon (Karte zeigt sie dann nicht doppelt)', d.lage.satz.includes(HN.amtlichArt(gl)));
  const de = HN.heuteNachtLesen(DEMO.HN_PROBE_DE);
  check('Deutschland: amtlich null → „Amtliche Warnungen für Deutschland: nicht angebunden.“, Quelle Open-Meteo',
    de.amtlich === null && HN.amtlichHinweis(de, 'DE') === 'Amtliche Warnungen für Deutschland: nicht angebunden.' && /Wetterdaten: Open-Meteo\.com/.test(HN.fussZeile(de, ABEND, TZ)));
  check('Österreich: kein Hinweis', HN.amtlichHinweis(d, 'AT') === null);
  check('Zustand: Probe = karte; ohne Werte = neu; ohne Zellen = ohne_standort',
    HN.hnZustand(d) === 'karte' && HN.hnZustand({ ...d, stand_at: null, stunden: d.stunden.map((s) => ({ ...s, ampel: null, t: null })) }) === 'neu' && HN.hnZustand({ ...d, gebiet: { ...d.gebiet, zellen: 0 } }) === 'ohne_standort');
  const ev = { art: 'eisregen', status: 'laeuft', beginn: '2026-11-25T20:30:00Z', ende: null, menge_klasse: null, objekte: 2, strecken: 0, gemeinde: 'Graz', mitteilung: null };
  check('Ereignis ohne Mitteilung: „Gefrierender Regen · ab ca. 21:30 · 2 Objekte (Graz)“', HN.ereignisZeile(ev, ABEND, TZ) === 'Gefrierender Regen · ab ca. 21:30 · 2 Objekte (Graz)', HN.ereignisZeile(ev, ABEND, TZ));
  check('Ereignis mit Mitteilung: Wortlaut des Servers', HN.ereignisZeile({ ...ev, mitteilung: { art: 'K5', at: '2026-11-25T20:42:00Z', titel: 'Achtung Glatteis', text: 'X' } }, ABEND, TZ) === 'Achtung Glatteis (21:42): X');
}

// ---------------------------------------------------------------------------------------------------------------- [6]
console.log('\n[6] Wetterverlauf: Stand, Laden, Texte, Zeitleiste');
const belege = DEMO.BELEGE_PROBE.map(WB.belegLesen);
const einsatz = belege.find((b) => b.id === 101);
const raeum = belege.find((b) => b.id === 102);
const fahrt = belege.find((b) => b.run_id);
const nachtrag = belege.find((b) => b.stufe === 'nachtrag');
{
  check('Belege der Worker-Probe gelesen (5), Kurzsatz genau Alex\' Beispiel', belege.every(Boolean) && belege.length === 5 && einsatz.kurz === 'Schneefall endete ca. 05:30 · Einsatz ab 05:50');
  const st = ['wird_ermittelt', 'quelle_fehlt', 'nicht_verfuegbar', 'ohne_standort', 'nur_pro'];
  check('Fehlfälle nie leer (5.5), „aus“ und „da“ ohne Text', st.every((s) => !!WB.standText(s, 'operation') && !!WB.standText(s, 'run')) && WB.standText('aus', 'operation') === null && WB.standText('da', 'run') === null);
  check('Texte wortgleich mit dem SQL-Kopf (Einsatz)',
    WB.standText('wird_ermittelt', 'operation') === 'Wetterverlauf wird ermittelt (ca. 1–3 Std. nach Einsatzende).' &&
      WB.standText('nur_pro', 'operation') === 'Wetterverlauf im Nachweis: mit WinterDex Pro.' &&
      WB.standText('ohne_standort', 'operation') === 'Kein Wetterverlauf: Objekt ohne Standort und Einsatz ohne GPS.' &&
      WB.standText('quelle_fehlt', 'operation') === 'Wetterverlauf nicht verfügbar (Datenquelle nicht erreichbar) – erneuter Versuch läuft.');
  const sql = winterdexSql('NACHTRAG-WETTER-BELEG-2026-11-26.sql');
  if (sql)
    check('… und im SQL-Kopf stehen genau diese Sätze (Gegenprobe mit der WinterDex-Arbeitskopie)', ['wird_ermittelt', 'quelle_fehlt', 'nicht_verfuegbar', 'ohne_standort', 'nur_pro'].every((s) => sql.includes(WB.standText(s, 'operation'))));
  else console.log('  --    (Gegenprobe SQL übersprungen: keine WinterDex-Arbeitskopie mit NACHTRAG-WETTER-BELEG gefunden)');

  // Laden: 1.234 IDs → 3 Aufrufe (500er), Belege in 100er-Blöcken
  const ids = Array.from({ length: 1234 }, (_, i) => `op-${i}`);
  const a = attrappe({
    rpc: { wetter_beleg_stand: ({ p_ids }) => ({ data: p_ids.map((id, i) => ({ id, stand: i % 2 ? 'nur_pro' : 'da', beleg_id: i % 2 ? null : Number(id.slice(3)) + 1 })), error: null }) },
    tabellen: { wetter_beleg: (q) => ({ data: q.filter.find((f) => f[0] === 'in')[2].map((id) => ({ ...DEMO.BELEGE_PROBE[0], id })), error: null }) },
  });
  const l = await WB.ladeWetter(a, 'operation', [...ids, ids[0]]);
  const rpcs = a.aufrufe.filter((x) => x.art === 'rpc');
  const sels = a.aufrufe.filter((x) => x.art === 'from');
  check('höchstens 500 IDs je wetter_beleg_stand (doppelte IDs nur einmal)', rpcs.length === 3 && rpcs.every((r) => r.args.p_ids.length <= 500 && r.args.p_bezug === 'operation') && rpcs.reduce((s, r) => s + r.args.p_ids.length, 0) === 1234);
  check('Belege in Blöcken ≤ 100, nur die freigegebenen Spalten (kein „*“)', sels.length === 7 && sels.every((s) => s.t === 'wetter_beleg' && s.sel === WB.BELEG_SPALTEN && s.filter[0][2].length <= 100));
  check('Ergebnis je Nachweis: da mit Beleg, nur_pro ohne', l.art === 'ok' && l.je.get('op-0').stand === 'da' && l.je.get('op-0').beleg.kurz === einsatz.kurz && l.je.get('op-1').stand === 'nur_pro' && l.je.get('op-1').beleg === null);
  const l2 = await WB.ladeWetter(attrappe(), 'run', ['x']);
  check('RPC fehlt (Nachtrag nicht eingespielt) → „aus“', l2.art === 'aus');
  const l3 = await WB.ladeWetter(attrappe({ rpc: { wetter_beleg_stand: { data: null, error: { message: 'Failed to fetch' } } } }), 'run', ['x']);
  check('Netzfehler → „fehler“ (PDF entsteht trotzdem ohne Wetter)', l3.art === 'fehler' && WB.wetterMap(l3) === null);
  const l4 = await WB.ladeWetter(attrappe({ rpc: { wetter_beleg_stand: { data: [{ id: 'x', stand: 'da', beleg_id: 5 }], error: null } }, tabellen: { wetter_beleg: { data: [], error: null } } }), 'run', ['x']);
  check('„da“, aber Beleg nicht lesbar → keine (leere) Zeile', l4.art === 'ok' && !l4.je.has('x'));
  check('keine IDs → kein Aufruf', (await WB.ladeWetter(attrappe(), 'run', [])).art === 'ok');

  check('Prüfcode = erste 12 Zeichen', WB.pruefcode(einsatz.entry_hash) === einsatz.entry_hash.slice(0, 12) && WB.pruefcode(einsatz.entry_hash).length === 12);
  check('Archivvermerk „Wetterverlauf gespeichert am 26.11.2026, 08:42 · Prüfcode …“ (Ortszeit)', WB.archivVermerk(einsatz, TZ) === `Wetterverlauf gespeichert am 26.11.2026, 08:42 · Prüfcode ${einsatz.entry_hash.slice(0, 12)}`, WB.archivVermerk(einsatz, TZ));
  check('Nachtrag: Vermerk „Aus Stundenwerten nachträglich ermittelt …“ grau', /^Aus Stundenwerten nachträglich ermittelt am/.test(WB.belegVermerk(nachtrag)));
  check('Fußzeile AT (§ 93 StVO, bewertet nicht) bzw. neutral (Deutschland)', /§ 93 StVO/.test(WB.belegFusszeile(einsatz)) && /bewertet nicht/.test(WB.belegFusszeile(einsatz)) && !/StVO/.test(WB.belegFusszeile(nachtrag)));
  check('Rückfall nach Land ohne Fakten-Fußzeile', WB.belegFusszeile({ ...einsatz, fakten: {} }) === WB.FUSS_AT && WB.belegFusszeile({ ...nachtrag, fakten: {} }) === WB.FUSS_NEUTRAL);
  const q = WB.quellenTexte([einsatz, einsatz, nachtrag]);
  check('Quellen nur aus den enthaltenen Belegen, ohne Doppel (GeoSphere + Open-Meteo)', q.length === 2 && /GeoSphere Austria/.test(q[0]) && /Open-Meteo/.test(q[1]), q);
  check('amtlich kurz: „Amtlich: Gelbe Glatteiswarnung“ (Stufe als Wort)', WB.amtlichKurz(einsatz) === 'Amtlich: Gelbe Glatteiswarnung' && WB.amtlichKurz(raeum) === null);
  check('amtlich wörtlich mit Speicher-Zeitpunkt', /^Amtliche Warnung \(GeoSphere Austria\): Gelbe Glatteiswarnung .*in WinterDex gespeichert am/.test(WB.amtlicheSaetze(einsatz)[0] ?? ''));
  check('Modell-Momentwert: „Modell-Momentwert bei Beginn: −2 °C (Open-Meteo)“', WB.momentwert({ temp_c: -2.2 }) === 'Modell-Momentwert bei Beginn: −2 °C (Open-Meteo)' && WB.momentwert(null) === null);

  const svg = WB.zeitleisteSvg(einsatz, TZ);
  check('Zeitleiste: SVG mit Niederschlagsbalken, Analyse-Band, Einsatz grün, Achse (Ortszeit)', svg.startsWith('<svg') && /fill="#1D4ED8"/.test(svg) && /fill="#16A34A"/.test(svg) && />06</.test(svg) && /Zeitleiste Wetterverlauf: Schneefall endete ca\. 05:30/.test(svg));
  check('… Räumzeit-Linie nur aus duty_times (pflicht_ab)', !/Räumzeit/.test(svg) && /Räumzeit 07:00/.test(WB.zeitleisteSvg(raeum, TZ)));
  check('… Fahrt: Legende „Fahrt“', />Fahrt</.test(WB.zeitleisteSvg(fahrt, TZ)));
  check('… kaputter Zeitraum → leer, kein Absturz', WB.zeitleisteSvg({ ...einsatz, fakten: { zeitraum: { von: 5, bis: 1 } } }, TZ) === '');
  const boese = { ...einsatz, kurz: '<img src=x onerror=alert(1)>' };
  check('… Texte escaped (kein HTML aus Daten)', !/<img/.test(WB.zeitleisteSvg(boese, TZ)) && !/<img/.test(WB.wetterKastenHtml({ stand: 'da', beleg: boese }, 'run', TZ)) && !/<img/.test(WB.wetterZelleHtml({ stand: 'da', beleg: boese }, 'operation', null)));
  const alle = [...belege.flatMap((b) => [b.kurz, b.satz, WB.archivVermerk(b, TZ), WB.belegVermerk(b) ?? '', ...WB.amtlicheSaetze(b)]), ...['wird_ermittelt', 'quelle_fehlt', 'nicht_verfuegbar', 'ohne_standort', 'nur_pro'].map((s) => WB.standText(s, 'run'))];
  check('keine Bewertungs-Wörter (5.5) in allem, was der Wetterverlauf zeigt', alle.every((t) => !VERBOTEN.test(t)), alle.find((t) => VERBOTEN.test(t)));
}

// ---------------------------------------------------------------------------------------------------------------- [7]
console.log('\n[7] PDFs');
const orgAT = { id: 'o', name: 'Bauhof Musterstadt', land: 'AT', address: 'Hauptplatz 1', created_at: '2026-11-01T00:00:00Z' };
const prop = { id: 'p1', org_id: 'o', name: 'Rathaus', address: 'Hauptplatz 1', lat: 47.07, lng: 15.44, customer_name: null, customer_contact: null, areas: null, duty_times: {}, notes: null, active: true, created_at: '2026-11-01T00:00:00Z' };
const op = (id, extra = {}) => ({
  id, org_id: 'o', property_id: 'p1', started_at: '2026-11-26T04:50:00Z', ended_at: '2026-11-26T05:20:00Z', lat: 47.07, lng: 15.44, gps_accuracy_m: 8, gps_at: '2026-11-26T04:50:00Z',
  action: 'cleared_gritted', grit_material: 'Splitt', grit_amount: null, weather: { temp_c: -2.2 }, notes: null, performed_by: null, performer_name: 'Fahrer 1',
  canceled: false, cancel_reason: null, canceled_at: null, created_at: '2026-11-26T05:21:00Z', entry_hash: 'a'.repeat(64), photo_urls: [], ...extra,
});
{
  const ops = [op('e1'), op('e2', { started_at: '2026-11-26T05:30:00Z' }), op('e3', { canceled: true, cancel_reason: 'doppelt', canceled_at: '2026-11-26T06:00:00Z' }), op('e4', { started_at: '2026-11-26T06:30:00Z' })];
  const wetter = new Map([
    ['e1', { stand: 'da', beleg: einsatz }],
    ['e2', { stand: 'nur_pro', beleg: null }],
    ['e3', { stand: 'da', beleg: raeum }],
    ['e4', { stand: 'aus', beleg: null }],
  ]);
  const html = REP.buildReportHtml(orgAT, prop, ops, '01.11.2026 – 26.11.2026', wetter);
  check('Einsatz-PDF: Spalte „Wetter“, Kurzsatz G13 genau + Wetter-Prüfcode', html.includes('<th>Wetter</th>') && html.includes('<b class="wv-kurz">Schneefall endete ca. 05:30 · Einsatz ab 05:50</b>') && html.includes(`Wetter-Prüfcode ${einsatz.entry_hash.slice(0, 12)}`));
  check('… klein: Modell-Momentwert und amtliche Stufe als Wort', html.includes('Modell-Momentwert bei Beginn: −2 °C (Open-Meteo)') && html.includes('Amtlich: Gelbe Glatteiswarnung'));
  check('… Free: „Wetterverlauf im Nachweis: mit WinterDex Pro.“', html.includes('Wetterverlauf im Nachweis: mit WinterDex Pro.'));
  check('… storniert: Wetter durchgestrichen', html.includes(`<s>${raeum.kurz}</s>`));
  check('… „aus“ → bisheriger Schnappschuss (−2,2 °C)', /<td>−?-?2,2 °C<\/td>/.test(html) || html.includes('-2,2 °C') || html.includes('−2,2 °C'));
  check('… Anhang: Quellen (GeoSphere) + Fußzeile AT, einmal', (html.match(/§ 93 StVO legt keine feste Wartezeit/g) ?? []).length === 1 && html.includes('Wetterdaten: GeoSphere Austria – data.hub.geosphere.at'));
  check('… keine Bewertungs-Wörter im ganzen Bericht', !VERBOTEN.test(html.replace(/<[^>]+>/g, ' ')), (html.replace(/<[^>]+>/g, ' ').match(VERBOTEN) ?? [])[0]);
  const alt = REP.buildReportHtml(orgAT, prop, ops, 'x');
  check('ohne Wetter-Daten (Nachtrag fehlt/Fehler): wie bisher — „Wetterlage (archiviert)“, kein Anhang', alt.includes('<th>Wetterlage (archiviert)</th>') && !alt.includes('class="wv-anhang"') && !alt.includes('Wetter-Prüfcode'));
  check('ObjektDex-Jahresnachweis (einsatzTabelle mit 3 Argumenten) unverändert', REP.einsatzTabelle(ops, true, TZ).includes('<th>Wetterlage (archiviert)</th>'));
  // Schattenbetrieb (beleg_modus 'schatten', Betrieb nicht im Test): der Server meldet für ALLE Einsätze „aus“
  // (NACHTRAG-WETTER-BELEG ab 7c8c17c: Schalter vor der Pro-Frage) → Bericht genau wie bisher, keine Zeile, kein Pro-Hinweis
  const allesAus = new Map(ops.map((o) => [o.id, { stand: 'aus', beleg: null }]));
  const aus = REP.buildReportHtml(orgAT, prop, ops, '01.11.2026 – 26.11.2026', allesAus);
  // nur der sichtbare Teil (body, ohne „Erstellt am“) — die Styles der Wetter-Bausteine stehen immer im Kopf
  const ohneZeit = (h) => h.slice(h.indexOf('<body>')).replace(/Erstellt am [^<]+/, '');
  check('alle Stände „aus“ (Schatten): Bericht wie ohne Wetter-Daten — Überschrift, Schnappschuss, kein Pro-Hinweis, kein Anhang',
    aus.includes('<th>Wetterlage (archiviert)</th>') && !aus.includes('mit WinterDex Pro') && !aus.includes('class="wv-anhang"') && !aus.includes('class="wv-stand"') &&
      ohneZeit(aus) === ohneZeit(REP.buildReportHtml(orgAT, prop, ops, '01.11.2026 – 26.11.2026')));
  check('… Excel: keine Wetter-Spalten', XL.operationSheets({ org: orgAT, properties: [prop], ops, period: { from: '2026-11-01', to: '2026-11-26' }, propertyId: null, wetter: allesAus })[0].columns.every((c) => !/Wetter \(Kurzsatz\)|Wetter-Prüfcode/.test(c.header)));
  check('… Detailseite/Kasten: „aus“ ergibt nichts', WB.wetterKastenHtml({ stand: 'aus', beleg: null }, 'operation', TZ) === '' && WB.wetterZelleHtml({ stand: 'aus', beleg: null }, 'operation', null) === null && /if \(!info \|\| info\.stand === 'aus'\) return null;/.test(lies('src/winterdex/WetterZeitleiste.tsx')));

  const run = {
    id: 'f1', org_id: 'o', route_id: 'r1', route_name: 'Runde Nord', started_at: '2026-11-26T04:50:00Z', ended_at: '2026-11-26T05:40:00Z', track: [], gaps: [], planned_path: null, missed: [],
    track_length_m: 12000, coverage_pct: null, missed_m: null, action: 'cleared', grit_material: null, grit_amount: null, weather: null, notes: null, performer_name: 'Fahrer 1',
    canceled: false, cancel_reason: null, canceled_at: null, created_at: '2026-11-26T05:41:00Z', entry_hash: 'b'.repeat(64), photo_urls: [], gps_mocked: false, nachgetragen: false,
  };
  const rh = RR.buildRunHtml(orgAT, run, TZ, { wetter: { stand: 'da', beleg: fahrt } });
  check('Fahrt-PDF: Kasten „Wetterverlauf“ unter dem Kopf mit Kurzsatz, Kernsatz, Zeitleiste, Archivvermerk', rh.includes('<div class="wv-kasten"><h2>Wetterverlauf</h2>') && rh.includes(fahrt.kurz) && rh.includes(fahrt.satz) && rh.includes('<svg') && rh.includes(WB.archivVermerk(fahrt, TZ)) && rh.indexOf('wv-kasten') < rh.indexOf('class="legend"'));
  check('… Quellen + Fußzeile am Ende', rh.includes('class="wv-anhang"') && rh.includes('§ 93 StVO'));
  const rw = RR.buildRunHtml(orgAT, run, TZ, { wetter: { stand: 'wird_ermittelt', beleg: null } });
  check('… „wird ermittelt“: „(ca. 1–3 Std. nach Fahrtende)“, nie leer', rw.includes('Wetterverlauf wird ermittelt (ca. 1–3 Std. nach Fahrtende).'));
  const r0 = RR.buildRunHtml(orgAT, run, TZ, {});
  check('… ohne Wetter-Daten kein Kasten', !r0.includes('class="wv-kasten"') && !r0.includes('class="wv-anhang"'));
  const ra = RR.buildRunHtml(orgAT, run, TZ, { wetter: { stand: 'aus', beleg: null } });
  check('… Stand „aus“ (Schatten): kein Kasten, kein Pro-Hinweis', !ra.includes('class="wv-kasten"') && !ra.includes('mit WinterDex Pro'));
  const buchAus = RR.buildRouteLogHtml(orgAT, { id: 'r1', name: 'Runde Nord', path: null, length_m: 12000 }, [run], 'Nov', { wetter: new Map([['f1', { stand: 'aus', beleg: null }]]), timeZone: TZ });
  check('… Fahrtenbuch mit „aus“: Schnappschuss wie bisher, kein Pro-Hinweis', !buchAus.includes('mit WinterDex Pro') && !buchAus.includes('class="wv-kurz"'));
  const route = { id: 'r1', name: 'Runde Nord', path: null, length_m: 12000 };
  const buch = RR.buildRouteLogHtml(orgAT, route, [run, { ...run, id: 'f2' }], 'Nov', { wetter: new Map([['f1', { stand: 'da', beleg: fahrt }], ['f2', { stand: 'nur_pro', beleg: null }]]), timeZone: TZ });
  check('Fahrtenbuch: nur der Kurzsatz in der Spalte Wetter (kein Kernsatz, keine Zeitleiste)', buch.includes(`<span class="wv-kurz">${fahrt.kurz}</span>`) && !buch.includes(fahrt.satz) && !buch.includes('<svg xmlns') && buch.includes('mit WinterDex Pro'));
}

// ---------------------------------------------------------------------------------------------------------------- [8]
console.log('\n[8] Excel');
{
  const ops = [op('e1'), op('e2', { started_at: '2026-11-26T05:30:00Z' })];
  const base = { org: orgAT, properties: [prop], ops, period: { from: '2026-11-01', to: '2026-11-26' }, propertyId: null };
  const ohne = XL.operationSheets(base);
  const mit = XL.operationSheets({ ...base, wetter: new Map([['e1', { stand: 'da', beleg: einsatz }], ['e2', { stand: 'nur_pro', beleg: null }]]) });
  const k0 = ohne[0].columns.map((c) => c.header);
  const k1 = mit[0].columns.map((c) => c.header);
  check('ohne Wetter-Daten: Spalten unverändert', !k0.includes('Wetter (Kurzsatz)') && k1.length === k0.length + 2);
  check('mit: „Wetter (Kurzsatz)“, „Wetter-Prüfcode“ am Ende', k1.at(-2) === 'Wetter (Kurzsatz)' && k1.at(-1) === 'Wetter-Prüfcode');
  const z1 = mit[0].rows[0];
  const z2 = mit[0].rows[1];
  check('… Werte: Kurzsatz + 12er-Prüfcode; Free: Stand-Text, kein Prüfcode', z1.at(-2) === einsatz.kurz && z1.at(-1) === einsatz.entry_hash.slice(0, 12) && z2.at(-2) === 'Wetterverlauf im Nachweis: mit WinterDex Pro.' && z2.at(-1) === null);
  const info = mit.find((s) => s.name === 'Info').rows.map((r) => r.map((c) => (c && typeof c === 'object' ? c.v : c)).join(' | ')).join('\n');
  check('… Info-Blatt: Wetterverlauf erklärt + Quellen der enthaltenen Belege', /Wetterverlauf \| Kurzsatz aus dem versiegelten Wetterverlauf/.test(info) && /GeoSphere Austria/.test(info));
  const nurAus = XL.operationSheets({ ...base, wetter: new Map([['e1', { stand: 'aus', beleg: null }]]) });
  check('… nur „aus“ → keine Spalten (nichts freigegeben)', nurAus[0].columns.length === k0.length);
  const runs = [{ id: 'f1', route_id: 'r1', route_name: 'Runde Nord', started_at: '2026-11-26T04:50:00Z', ended_at: '2026-11-26T05:40:00Z', track_length_m: 12000, coverage_pct: null, missed_m: null, action: 'cleared', grit_material: null, grit_amount: null, performer_name: 'x', weather: null, notes: null, canceled: false, gaps: [], entry_hash: 'b'.repeat(64) }];
  const rs = XL.runSheets({ org: orgAT, runs, period: { from: '2026-11-01', to: '2026-11-26' }, filterLabel: 'Alle', wetter: new Map([['f1', { stand: 'da', beleg: fahrt }]]) });
  check('Fahrtenliste ebenso', rs[0].columns.at(-2).header === 'Wetter (Kurzsatz)' && rs[0].rows[0].at(-2) === fahrt.kurz);
}

// ---------------------------------------------------------------------------------------------------------------- [9]
console.log('\n[9] Team-Karte Wetter-Guide');
{
  const g = WG.geraeteLesen({ v: 1, pro: true, aktiv: 1, gesamt: 2, mitglieder: [{ name: 'a@x', rolle: 'owner', status: 'aktiv' }, { name: 'b@x', rolle: 'worker', status: 'quatsch' }] });
  check('Geräte lesen: unbekannter Status → „bekommt keine“ (nie fälschlich aktiv)', g.aktiv === 1 && g.mitglieder[1].status === 'bekommt_keine');
  check('kaputt → null', WG.geraeteLesen(null) === null && WG.geraeteLesen({}) === null);
  let a = attrappe();
  let s = await WG.ladeWetterGuide(a, 'o', true);
  check('Nachtrag fehlt (Tabelle fehlt) → live false (Karte wie bisher, nur Uhrzeit)', s.live === false);
  a = attrappe({
    rpc: { wetter_guide_geraete: { data: { v: 1, pro: true, aktiv: 2, gesamt: 3, mitglieder: [] }, error: null } },
    tabellen: { wetter_push: { data: [{ id: 1, kart: 'K5', titel: 'Achtung Glatteis', text: 't', geraete: 2, status: 'gesendet', erstellt_at: '2026-11-25T20:00:00Z', gesendet_at: '2026-11-25T20:00:01Z' }], error: null } },
  });
  s = await WG.ladeWetterGuide(a, 'o', true);
  const sel = a.aufrufe.find((x) => x.art === 'from');
  check('Inhaber/Verwalter: Geräte + letzte Mitteilungen; nur freigegebene Spalten, gefiltert auf den Betrieb', s.live && s.geraete.aktiv === 2 && s.mitteilungen.length === 1 && sel.sel === WG.PUSH_SPALTEN && !sel.sel.includes('*') && sel.filter.some((f) => f[0] === 'eq' && f[1] === 'org_id' && f[2] === 'o'));
  a = attrappe({ tabellen: { wetter_push: { data: [], error: null } } });
  s = await WG.ladeWetterGuide(a, 'o', false);
  check('Mitarbeiter: KEIN Aufruf von wetter_guide_geraete, keine Geräte-Liste', s.live && s.geraete === null && !a.aufrufe.some((x) => x.art === 'rpc'));
  const gsql = winterdexSql('NACHTRAG-WETTER-GUIDE-2026-11-26.sql');
  if (gsql)
    check('freigegebene Spalten = Grant im SQL (Gegenprobe mit der WinterDex-Arbeitskopie)', (() => {
      const m = /grant select \(([^)]+)\) on public\.wetter_push to authenticated/.exec(gsql);
      return m && WG.PUSH_SPALTEN.split(',').map((x) => x.trim()).every((c) => m[1].split(',').map((x) => x.trim()).includes(c));
    })());
  else console.log('  --    (Gegenprobe Grant übersprungen: keine WinterDex-Arbeitskopie mit NACHTRAG-WETTER-GUIDE gefunden)');
  const t = WG.mitarbeiterInfo('Musterbetrieb', 'Hauptplatz 1, 8010 Graz', 'nicht');
  check('Mitarbeiter-Info: Betrieb + Anschrift, „erfolgt nicht“', t.includes('Verantwortlich: Musterbetrieb, Hauptplatz 1, 8010 Graz.') && t.includes('anhand dieser Daten erfolgt nicht.') && t.includes('Einstellungen → Wetter-Guide'));
  check('… Betriebsvereinbarung mit Datum, leer → „…“', WG.mitarbeiterInfo('B', null, 'betriebsvereinbarung', '01.12.2026').includes('nur nach Betriebsvereinbarung vom 01.12.2026.') && WG.mitarbeiterInfo('B', null, 'betriebsvereinbarung').includes('vom ….'));
  check('Haftungstext wortgleich (5.4)', WG.HAFTUNG.startsWith('Der Wetter-Guide ist eine Hilfe ohne Gewähr.') && WG.HAFTUNG.endsWith('Maßgeblich sind die amtlichen Warnungen.'));
  // Freischaltung gemeinsam mit Alex: vorher (Schatten) sehen Kunden auf der Team-Seite keine Wetter-Guide-Teile
  const hnAntwort = (extra) => attrappe({ rpc: { heute_nacht: { data: { ...kopie(DEMO.HN_PROBE), ...extra }, error: null } } });
  check('Team-Karte: nicht freigegeben (karte_live false, keine Arten live) → keine Wetter-Guide-Teile', (await WG.guideFreigegeben(hnAntwort({}), 'o-frei')) === false);
  check('… Testbetrieb in karte_orgs (karte_live) → ja', (await WG.guideFreigegeben(hnAntwort({ karte_live: true }), 'o-frei')) === true);
  check('… Arten live geschaltet (guide_live_arten) → ja', (await WG.guideFreigegeben(hnAntwort({ guide_live_arten: ['K5', 'K9'] }), 'o-frei')) === true);
  check('… Nachtrag KARTE fehlt / Fehler → nein', (await WG.guideFreigegeben(attrappe(), 'o-frei')) === false && (await WG.guideFreigegeben(attrappe({ rpc: { heute_nacht: { data: null, error: { message: 'Failed to fetch' } } } }), 'o-frei')) === false);
  check('… die Karte nutzt die Freigabe', /const live = !!guide\.data\?\.live && frei\.data === true;/.test(lies('src/winterdex/GlaetteFruehwarnung.tsx')));
}

// ---------------------------------------------------------------------------------------------------------------- [10]
console.log('\n[10] Quelltext-Wächter');
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
  const src = dateien.map((p) => [path.relative(path.join(here, '..'), p).split(path.sep).join('/'), readFileSync(p, 'utf8')]);
  check('kein set_push_arten im Browser (G8: Arten nur je Gerät in der App)', !src.some(([, s]) => /rpc\(\s*['"]set_push_arten/.test(s)));
  check('wetter_push nie mit select(\'*\')', !src.some(([, s]) => /from\(['"]wetter_push['"]\)\s*\.select\(\s*['"]\*['"]/.test(s)));
  check('heute_nacht nie per GET (rpc ohne get: true)', !src.some(([, s]) => /rpc\(['"]heute_nacht['"][^)]*get:\s*true/.test(s)));
  const lower = new Map();
  const doppelt = [];
  for (const [p] of src) {
    const k = p.replace(/\.(ts|tsx)$/, '').toLowerCase();
    if (lower.has(k) && lower.get(k) !== p) doppelt.push([lower.get(k), p]);
    lower.set(k, p);
  }
  check('keine Dateinamen, die sich nur in Groß/Klein unterscheiden (Windows/Vite)', doppelt.length === 0, doppelt);
  const karte = lies('src/winterdex/HeuteNacht.tsx');
  check('Karte: Ereignisse nur, wenn der Server sie schickt (Pro)', /d\.ereignisse && d\.ereignisse\.length > 0/.test(karte));
  check('Karte: Sichtbarkeit nur über hnSichtbar (karte_live vom Server)', /if \(!hnSichtbar\(d, jetzt, tz, darf\)\) return null;/.test(karte));
  check('Übersicht bindet die Karte über den Kennzahlen ein', /<HeuteNacht[\s\S]*?\/>[\s\S]*<LoadGuard/.test(lies('src/winterdex/pages/Overview.tsx')));
  check('Einsatz-PDF, Fahrt-PDF, Fahrtenbuch und Excel laden den Wetterverlauf mit Frist', /ladeWetterMitFrist\(client, 'operation'/.test(lies('src/winterdex/pages/Report.tsx')) && /wetter }/.test(lies('src/winterdex/pages/RunDetail.tsx')) &&
    /ladeWetterMitFrist\(client, 'run'/.test(lies('src/winterdex/pages/RouteDetail.tsx')) && /ladeWetterMitFrist\(client, 'operation'/.test(lies('src/winterdex/pages/Operations.tsx')) && /ladeWetterMitFrist\(client, 'run'/.test(lies('src/winterdex/pages/Routes.tsx')));
  check('Detailseiten zeigen den Wetterverlauf', /<WetterVerlauf info=\{wetter\.info\}/.test(lies('src/winterdex/pages/OperationDetail.tsx')) && /<WetterVerlauf info=\{wetter\}/.test(lies('src/winterdex/pages/RunDetail.tsx')));
  check('„Prüfcode prüfen“ für den Beleg: verify_wetter_beleg mit p_id (Zahl)', /verify_wetter_beleg'\s*\n?\s*\? \{ p_id: Number\(id\) \}/.test(lies('src/components/VerifyProof.tsx')));
  const texte = [lies('src/winterdex/heuteNachtDaten.ts'), lies('src/winterdex/HeuteNacht.tsx'), lies('src/winterdex/wetterBeleg.ts'), lies('src/winterdex/WetterZeitleiste.tsx'), lies('src/winterdex/GlaetteFruehwarnung.tsx'), lies('src/winterdex/wetterGuide.ts')]
    .join('\n')
    .split('\n')
    .filter((z) => !/^\s*(\/\/|\*|\/\*)/.test(z) && !/VERBOTEN|Verboten|verbotene/.test(z));
  const treffer = texte.filter((z) => /['"`][^'"`]*(rechtzeitig|fristgerecht|pflicht erfüllt|wartefrist|geräumt ab|rechtssicher|gerichtsfest|beweist|verpasst nichts|schützt vor haftung)/i.test(z));
  check('keine Bewertungs-/Werbe-Versprechen in den neuen Texten (5.5, P6)', treffer.length === 0, treffer);
  check('kein „Glätte-Wecker“ in den neuen Dateien (G10)', !texte.some((z) => /Glätte-Wecker/.test(z)));
}

console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail === 0 ? 0 : 1);
