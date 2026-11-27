// WinterDex Dashboard, Übersicht: Karte „Heute Nacht“ zeigt nur Aktuelles (27.11.2026). Alex: „Im Web-Dashboard in der
// Übersicht im Wetter-Guide stehen noch alte Meldungen, z. B. amtliche Warnung vom 26.11. – das war gestern.“ Ursache: das
// amtliche Ereignis lief am Server bis Fr 08:00 weiter (Folgewarnung), die Karte zeigte dazu den Wortlaut der ersten
// Mitteilung von Do 07:12 („… von Do, 26.11.2026 00:00 bis Do, 26.11.2026 14:00 …“). Ohne Browser und ohne Netz; die Zeiten
// des Falls wie am Server (wetter_ereignis / wetter_push), Ort nur Gemeinde, keine Kundendaten.
//   [1] amtliche Warnungen: nur bis zu ihrem Ende
//   [2] Ereignisse: abgelaufen / beendet / läuft / angekündigt / ohne Ende älter als 24 Std. / „Schneefall vorbei“ ≤ 6 Std.
//   [3] Wortlaut der Mitteilung nur, wenn er aktuell ist (heute in Wien oder ≤ 12 Std.) — sonst die Zeile aus den heutigen
//       Werten, ein Beginn vor heute steht nicht mehr da
//   [4] Kalendertag in Wien, Gerät auf UTC (Mitternacht Wien ≠ Mitternacht UTC)
//   [5] Sichtbarkeit außerhalb der Saison: abgelaufene amtliche Warnung macht die Karte nicht mehr sichtbar
//   [6] Quelltext-Wächter (Karte filtert, „Alle Mitteilungen ›“ nur auf der Übersicht, Seite behält den vollen Verlauf)
//
//   Aufruf:  node tests/wetter-guide-aktuell.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { readFileSync } from 'node:fs';
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
const DEMO = await web('src/winterdex/wetterDemo.ts');
const TZ = 'Europe/Vienna';
const t = (iso) => Date.parse(iso);

// Alex' Fall (Server-Stand 27.11.): amtliches Ereignis 25.11. 23:00Z (Do 00:00 Wien) bis 27.11. 07:00Z (Fr 08:00 Wien),
// erste und einzige Mitteilung K9 am 26.11. 06:12Z (Do 07:12 Wien)
const K9_TEXT =
  'Gelbe Schneewarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 14:00 – Graz (GeoSphere Austria). 1 Objekt betroffen. ' +
  'Gelbe Glatteiswarnung von Do, 26.11.2026 00:00 bis Do, 26.11.2026 09:00 – Graz (GeoSphere Austria). 1 Objekt betroffen.';
const AMTLICH = {
  art: 'amtlich',
  status: 'laeuft',
  beginn: '2026-11-25T23:00:00Z',
  ende: '2026-11-27T07:00:00Z',
  menge_klasse: null,
  objekte: 1,
  strecken: 0,
  gemeinde: 'Graz',
  mitteilung: { art: 'K9', at: '2026-11-26T06:12:25Z', titel: 'Amtliche Warnung', text: K9_TEXT },
};
const schnee = (x = {}) => ({
  art: 'schnee',
  status: 'laeuft',
  beginn: '2026-11-27T09:15:00Z',
  ende: null,
  menge_klasse: 1,
  objekte: 3,
  strecken: 0,
  gemeinde: 'Graz',
  mitteilung: null,
  ...x,
});

/** Fr 27.11.2026, 10:00 Wien — da sah Alex die Meldung vom Vortag */
const FR_10 = t('2026-11-27T09:00:00Z');
/** Fr 27.11.2026, 06:00 Wien — Warnung gilt noch (bis 08:00) */
const FR_06 = t('2026-11-27T05:00:00Z');
/** Do 26.11.2026, 10:00 / 21:00 Wien */
const DO_10 = t('2026-11-26T09:00:00Z');
const DO_21 = t('2026-11-26T20:00:00Z');

// ---------------------------------------------------------------------------------------------------------------- [1]
console.log('\n[1] Amtliche Warnungen nur bis zu ihrem Ende');
{
  const a = (bis) => ({ typ: 3, stufe: 1, von: '2026-11-25T23:00:00Z', bis, text: null, gemeinde: 'Graz' });
  const liste = [a('2026-11-26T13:00:00Z'), a('2026-11-27T07:00:00Z'), a(null)];
  const r = HN.amtlichAktuell(liste, FR_10);
  check('Fr 10:00: beide abgelaufenen fallen weg, ohne Ende bleibt (Server schickt nur laufende)', r.length === 1 && r[0].bis === null, r);
  check('Fr 06:00: die bis 08:00 gilt noch', HN.amtlichAktuell(liste, FR_06).length === 2);
  check('genau am Ende: weg (gilt nicht mehr)', HN.amtlichAktuell([a('2026-11-27T07:00:00Z')], t('2026-11-27T07:00:00Z')).length === 0);
  check('null (Land nicht angebunden) bleibt null — der Hinweis „nicht angebunden“ hängt daran', HN.amtlichAktuell(null, FR_10) === null);
  check('kaputte Zeit → wie ohne Ende (nie ein Absturz)', HN.amtlichAktuell([a('kaputt')], FR_10).length === 1);
}

// ---------------------------------------------------------------------------------------------------------------- [2]
console.log('\n[2] Ereignisse: was auf die Übersicht gehört');
{
  check('Alex\' Fall Fr 10:00: amtliche Warnung bis Fr 08:00 ist abgelaufen → weg, auch wenn der Server sie noch als „läuft“ führt',
    HN.ereignisAktuell(AMTLICH, FR_10) === false);
  check('… Fr 06:00 gilt sie noch → bleibt', HN.ereignisAktuell(AMTLICH, FR_06) === true);
  check('… vorzeitig beendet (Ende noch in der Zukunft) → weg, keine aufgehobene Warnung auf der Übersicht',
    HN.ereignisAktuell({ ...AMTLICH, status: 'beendet' }, FR_06) === false);
  check('Schneefall läuft ohne Ende → bleibt (Server sagt, dass er gilt), auch seit Tagen', HN.ereignisAktuell(schnee({ beginn: '2026-11-24T09:15:00Z' }), FR_10) === true);
  check('angekündigt (Beginn in der Zukunft) → bleibt', HN.ereignisAktuell(schnee({ status: 'angekuendigt', beginn: '2026-11-27T18:00:00Z' }), FR_10) === true);
  check('läuft, aber Gültigkeitsende vorbei → weg', HN.ereignisAktuell(schnee({ ende: '2026-11-27T08:00:00Z' }), FR_10) === false);
  const k7 = (at) => ({ art: 'K7', at, titel: 'Schneefall vorbei', text: 'Der Schneefall in Graz ist vorbei.' });
  check('beendet mit „Schneefall vorbei“ vor 2 Std. → bleibt (aktuelle Nachricht von heute)',
    HN.ereignisAktuell(schnee({ status: 'beendet', mitteilung: k7('2026-11-27T07:00:00Z') }), FR_10) === true);
  check('… auch mit Ende in der Vergangenheit', HN.ereignisAktuell(schnee({ status: 'beendet', ende: '2026-11-27T06:45:00Z', mitteilung: k7('2026-11-27T07:00:00Z') }), FR_10) === true);
  check('… „vorbei“ vor 7 Std. → weg', HN.ereignisAktuell(schnee({ status: 'beendet', mitteilung: k7('2026-11-27T02:00:00Z') }), FR_10) === false);
  check('beendet mit „Schnee kommt“ (K4) → weg (die Ankündigung gilt nicht mehr)',
    HN.ereignisAktuell(schnee({ status: 'beendet', mitteilung: { art: 'K4', at: '2026-11-27T08:00:00Z', titel: 'Schnee kommt', text: 'X' } }), FR_10) === false);
  check('beendet ohne Mitteilung → weg („Schneefall · ab ca. 08:15“ klänge nach laufend)', HN.ereignisAktuell(schnee({ status: 'beendet' }), FR_10) === false);
  check('„Schneefall vorbei“ aus der Zukunft (Uhr falsch) zählt nicht', HN.ereignisAktuell(schnee({ status: 'beendet', mitteilung: k7('2026-11-27T10:00:00Z') }), FR_10) === false);
  check('unbekannter Zustand ohne Ende: Beginn vor 23 Std. → bleibt, vor 25 Std. → weg',
    HN.ereignisAktuell(schnee({ status: '', beginn: '2026-11-26T10:00:00Z' }), FR_10) === true && HN.ereignisAktuell(schnee({ status: '', beginn: '2026-11-26T08:00:00Z' }), FR_10) === false);
  check('unbekannter Zustand ohne jede Zeit → weg', HN.ereignisAktuell(schnee({ status: '', beginn: null }), FR_10) === false);
  check('unbekannter Zustand mit Ende in der Zukunft → bleibt', HN.ereignisAktuell(schnee({ status: '', ende: '2026-11-27T12:00:00Z' }), FR_10) === true);

  const liste = [AMTLICH, schnee(), schnee({ status: 'beendet' }), schnee({ status: 'angekuendigt', beginn: '2026-11-27T18:00:00Z' })];
  const r = HN.aktuelleEreignisse(liste, FR_10);
  check('Liste Fr 10:00: 2 von 4 bleiben, Reihenfolge des Servers, 2 ausgeblendet',
    r.zeigen.length === 2 && r.zeigen[0] === liste[1] && r.zeigen[1] === liste[3] && r.ausgeblendet === 2, { n: r.zeigen.length, aus: r.ausgeblendet });
  check('ohne Pro (null) → nichts zeigen, nichts ausgeblendet', (() => { const x = HN.aktuelleEreignisse(null, FR_10); return x.zeigen.length === 0 && x.ausgeblendet === 0; })());
  check('Eingabe bleibt unverändert', liste.length === 4 && liste[0].mitteilung.text === K9_TEXT);
}

// ---------------------------------------------------------------------------------------------------------------- [3]
console.log('\n[3] Wortlaut nur, wenn er aktuell ist');
{
  const fr06 = HN.ereignisZeile(AMTLICH, FR_06, TZ);
  check('Fr 06:00: NICHT mehr der Wortlaut von Do 07:12 („… bis Do, 26.11.2026 14:00 …“), sondern die Zeile von heute',
    fr06 === 'Amtliche Warnung · bis ca. 08:00 · 1 Objekt (Graz)', fr06);
  check('… ohne „26.11.“ und ohne den Beginn vom Vortag', !/26\.11|Do /.test(fr06), fr06);
  check('Do 10:00 (gleicher Tag, 2 Std. 48): Wortlaut des Servers mit Uhrzeit', HN.ereignisZeile(AMTLICH, DO_10, TZ) === `Amtliche Warnung (07:12): ${K9_TEXT}`, HN.ereignisZeile(AMTLICH, DO_10, TZ));
  check('Do 21:00 (gleicher Tag, fast 14 Std.): weiterhin der Wortlaut', HN.wortlautFrisch(AMTLICH, DO_21, TZ) === true);
  const k4 = schnee({ status: 'angekuendigt', beginn: '2026-11-27T03:00:00Z', mitteilung: { art: 'K4', at: '2026-11-26T18:30:00Z', titel: 'Schnee kommt', text: 'Ab ca. 04:00 Schneefall.' } });
  check('Mitteilung vom Vorabend 19:30, gelesen um 02:45 (7 Std. 15, anderer Tag) → Wortlaut', HN.ereignisZeile(k4, t('2026-11-27T01:45:00Z'), TZ) === 'Schnee kommt (Do 19:30): Ab ca. 04:00 Schneefall.', HN.ereignisZeile(k4, t('2026-11-27T01:45:00Z'), TZ));
  check('Mitteilung aus der Zukunft (> 5 min) → nicht als Wortlaut', HN.wortlautFrisch({ ...AMTLICH, mitteilung: { ...AMTLICH.mitteilung, at: '2026-11-27T09:10:00Z' } }, FR_10, TZ) === false);
  check('ohne Zeit → nicht als Wortlaut', HN.wortlautFrisch({ ...AMTLICH, mitteilung: { ...AMTLICH.mitteilung, at: null } }, FR_10, TZ) === false);
  const heute = HN.ereignisZeile(schnee(), FR_10, TZ);
  check('Beginn heute bleibt stehen: „Schneefall · ab ca. 10:15 · ca. 1–3 cm · 3 Objekte (Graz)“', heute === 'Schneefall · ab ca. 10:15 · ca. 1–3 cm · 3 Objekte (Graz)', heute);
  const morgen = HN.ereignisZeile(schnee({ status: 'angekuendigt', beginn: '2026-11-28T03:00:00Z' }), FR_10, TZ);
  check('Beginn morgen bleibt stehen (mit Wochentag): „… ab ca. Sa 04:00 …“', /^Schneefall · ab ca\. Sa 04:00/.test(morgen), morgen);
}

// ---------------------------------------------------------------------------------------------------------------- [4]
console.log('\n[4] Kalendertag in Wien (Gerät auf UTC)');
{
  const um = (at) => ({ ...AMTLICH, ende: '2026-11-28T07:00:00Z', mitteilung: { ...AMTLICH.mitteilung, at } });
  const fr1230 = t('2026-11-27T11:30:00Z'); // Fr 12:30 Wien
  check('Do 23:50 Wien (26.11. 22:50Z), gelesen Fr 12:30: anderer Tag, 12 Std. 40 → nicht mehr aktuell', HN.wortlautFrisch(um('2026-11-26T22:50:00Z'), fr1230, TZ) === false);
  check('Fr 00:10 Wien (26.11. 23:10Z — in UTC noch Donnerstag), gelesen Fr 12:30: gleicher Tag in Wien → aktuell', HN.wortlautFrisch(um('2026-11-26T23:10:00Z'), fr1230, TZ) === true);
  // Sommerzeit-Ende 25.10.2026 (03:00 → 02:00): Sa 22:00 Wien = 20:00Z, So 23:30 Wien = 22:30Z
  check('über den Wechsel auf Winterzeit: Sa 22:00 → So 23:30 (26 Std. 30) nicht aktuell, So 00:30 → So 23:30 aktuell',
    HN.wortlautFrisch(um('2026-10-24T20:00:00Z'), t('2026-10-25T22:30:00Z'), TZ) === false && HN.wortlautFrisch(um('2026-10-24T22:30:00Z'), t('2026-10-25T22:30:00Z'), TZ) === true);
}

// ---------------------------------------------------------------------------------------------------------------- [5]
console.log('\n[5] Sichtbarkeit außerhalb der Saison');
{
  const d = HN.heuteNachtLesen(DEMO.HN_PROBE);
  const sommer = t('2027-06-10T08:00:00Z');
  const ruhig = {
    ...d,
    karte_live: true,
    ampel_gesamt: 0,
    stunden: d.stunden.map((s) => ({ ...s, ampel: 0 })),
    morgen: { ...d.morgen, erwartet: 'nein', gesendet_at: null },
  };
  const am = (bis) => [{ typ: 4, stufe: 1, von: '2027-06-10T02:00:00Z', bis, text: null, gemeinde: 'Graz' }];
  check('Juni, grün, amtliche Warnung gilt noch → Karte sichtbar', HN.hnSichtbar({ ...ruhig, amtlich: am('2027-06-10T12:00:00Z') }, sommer, TZ, true) === true);
  check('Juni, grün, amtliche Warnung abgelaufen → Karte nicht mehr sichtbar', HN.hnSichtbar({ ...ruhig, amtlich: am('2027-06-10T06:00:00Z') }, sommer, TZ, true) === false);
  check('in der Saison bleibt die Karte immer da (auch ohne Warnung)', HN.hnSichtbar({ ...ruhig, amtlich: [] }, FR_10, TZ, true) === true);
}

// ---------------------------------------------------------------------------------------------------------------- [6]
console.log('\n[6] Quelltext-Wächter');
{
  const karte = lies('src/winterdex/HeuteNacht.tsx');
  check('Karte: amtliche Zeilen aus amtlichAktuell (nicht mehr direkt aus d.amtlich)', /const amtlich = amtlichAktuell\(d\.amtlich, jetzt\) \?\? \[\];/.test(karte) && !/\(d\.amtlich \?\? \[\]\)/.test(karte));
  check('Karte: Ereignisse aus aktuelleEreignisse, höchstens 3 (nicht mehr d.ereignisse.slice)', /const ev = aktuelleEreignisse\(d\.ereignisse, jetzt\);/.test(karte) && /ev\.zeigen\.slice\(0, 3\)/.test(karte) && !/d\.ereignisse\.slice/.test(karte));
  check('Karte: „Alle Mitteilungen ›“ nur mit Link (links.mitteilungen)', /\{links\.mitteilungen && \(/.test(karte) && /<Link to=\{links\.mitteilungen\}>Alle Mitteilungen ›<\/Link>/.test(karte));
  const ueb = lies('src/winterdex/pages/Overview.tsx');
  check('Übersicht: Link nur, wenn der Server Mitteilungen anbietet (mt?.da)', /mitteilungen: mt\?\.da \? 'mitteilungen' : null/.test(ueb) && /const mt = useMitteilungen\(\);/.test(ueb));
  check('Außendienst: kein Link (bleibt bei der Arbeit)', !/mitteilungen:/.test(lies('src/winterdex/aussendienst/Aussendienst.tsx')));
  const seite = lies('src/winterdex/pages/Mitteilungen.tsx');
  check('Seite „Alle Mitteilungen“ zeigt weiter den vollen Verlauf (st.liste ungefiltert)', /gruppieren\(st\.liste, jetzt, st\.tz\)/.test(seite) && !/aktuelleEreignisse|ereignisAktuell/.test(seite));
  const daten = lies('src/winterdex/heuteNachtDaten.ts');
  check('keine Datums-Falle (toISOString().slice(0, 10)) in heuteNachtDaten.ts', !/toISOString\(\)\.slice\(0,\s*10\)/.test(daten));
}

console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail === 0 ? 0 : 1);
