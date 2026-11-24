// Prüft den Ganzjahres-Nachweis je Objekt (ObjektDex-Bereich, src/objektdex/jahresnachweis.ts):
//   • Kalendertage und Abfrage-Grenzen in Europe/Vienna — auch an den Umstellungstagen, nie UTC-Tage
//   • Zeitraum: letzte 12 Monate (Schaltjahr, Monatsende), laufendes Jahr, Vorjahr, frei (Fehler verständlich)
//   • WinterDex-Objekt zum ObjektDex-Objekt per Adresse (PLZ/Ort fehlen, Straße/Str., andere Hausnummer), Vorrang
//   • Kennzahlen fürs Deckblatt (storniert zählt nicht, Soll/Ist-Quote gekappt, nach Bedarf ohne Soll, offene Mängel)
//   • Quelltext-Wächter: Route/Links da, Wortwahl ohne Absolutaussagen, keine UTC-Tage, Pro-Regeln je Teil
//
//   Aufruf:  node tests/jahresnachweis.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
// Das PDF selbst (HTML aus beiden Apps) prüft der Klick-Test im Browser: tests/browser/jahresnachweis-klick.mjs.
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
const web = (f) => import(pathToFileURL(path.join(here, '..', f)).href);
const lies = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

const J = await web('src/objektdex/jahresnachweis.ts');

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || extra === '' ? '' : '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`);
};
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const teil = (t) => console.log(`\n${t}`);

// ---------------------------------------------------------------------------- Tage + Grenzen
teil('Kalendertage und Grenzen (Europe/Vienna)');
check('kurz vor Mitternacht UTC ist in Wien schon der nächste Tag (Winter)', J.tagIn(new Date('2026-11-24T23:30:00Z')) === '2026-11-25');
check('kurz vor Mitternacht UTC ist in Wien schon der nächste Tag (Sommer)', J.tagIn(new Date('2026-06-30T22:30:00Z')) === '2026-07-01');
check('22:59 UTC im Winter ist in Wien noch derselbe Tag', J.tagIn(new Date('2026-01-10T22:59:00Z')) === '2026-01-10');
check('heute() = Wiener Tag', J.heute(new Date('2026-12-31T23:10:00Z')) === '2027-01-01');
const mi = (d, soll) => check(`Mitternacht ${d} → ${soll}`, J.mitternachtIso(d) === soll, J.mitternachtIso(d));
mi('2026-01-01', '2025-12-31T23:00:00.000Z');
mi('2026-07-01', '2026-06-30T22:00:00.000Z');
mi('2026-03-29', '2026-03-28T23:00:00.000Z'); // Umstellung auf Sommerzeit um 02:00 — Mitternacht noch Winterzeit
mi('2026-03-30', '2026-03-29T22:00:00.000Z');
mi('2026-10-25', '2026-10-24T22:00:00.000Z'); // Umstellung auf Winterzeit um 03:00 — Mitternacht noch Sommerzeit
mi('2026-10-26', '2026-10-25T23:00:00.000Z');
check(
  'Grenzen: ab Von 00:00 bis Tag nach Bis 00:00',
  gleich(J.zeitraumGrenzen({ from: '2025-11-25', to: '2026-11-24' }), { abIso: '2025-11-24T23:00:00.000Z', bisVorIso: '2026-11-24T23:00:00.000Z' }),
  J.zeitraumGrenzen({ from: '2025-11-25', to: '2026-11-24' }),
);
check(
  'Grenzen über die Sommerzeit: Bis 31.03. endet um 22:00 UTC',
  J.zeitraumGrenzen({ from: '2026-03-01', to: '2026-03-31' }).bisVorIso === '2026-03-31T22:00:00.000Z',
);
check('Berlin hat dieselben Grenzen (ObjektDex rechnet in Berlin)', J.mitternachtIso('2026-03-29', 'Europe/Berlin') === J.mitternachtIso('2026-03-29'));
// Ein Einsatz am 01.01. um 00:30 Wiener Zeit gehört ins neue Jahr (UTC wäre noch 31.12.)
{
  const g = J.zeitraumGrenzen({ from: '2026-01-01', to: '2026-12-31' });
  const einsatz = '2025-12-31T23:30:00.000Z';
  check('Einsatz 01.01. 00:30 Wien liegt im Kalenderjahr 2026', einsatz >= g.abIso && einsatz < g.bisVorIso);
  const silvester = '2026-12-31T22:59:00.000Z';
  const neujahr = '2026-12-31T23:00:00.000Z';
  check('31.12. 23:59 Wien noch drin, 01.01. 00:00 nicht mehr', silvester < g.bisVorIso && !(neujahr < g.bisVorIso));
}

// ---------------------------------------------------------------------------- Zeitraum
teil('Zeitraum');
{
  const z = J.zeitraum('zwoelf', '2026-11-24');
  check('letzte 12 Monate am 24.11.2026 = 25.11.2025 – 24.11.2026', z.from === '2025-11-25' && z.to === '2026-11-24' && z.label === '25.11.2025 – 24.11.2026', z);
  const s = J.zeitraum('zwoelf', '2028-02-29');
  check('letzte 12 Monate am 29.02.2028 (Monatsende gekappt) = 01.03.2027 – 29.02.2028', s.from === '2027-03-01' && s.to === '2028-02-29', s);
  const m = J.zeitraum('zwoelf', '2027-03-31');
  check('letzte 12 Monate am 31.03.2027 = 01.04.2026 – 31.03.2027', m.from === '2026-04-01', m);
  const j = J.zeitraum('jahr', '2026-11-24');
  check('laufendes Jahr = 01.01.2026 bis heute', j.from === '2026-01-01' && j.to === '2026-11-24' && /2026 bis 24\.11\.2026/.test(j.label), j);
  const v = J.zeitraum('vorjahr', '2026-11-24');
  check('Vorjahr = 01.01.2025 – 31.12.2025', v.from === '2025-01-01' && v.to === '2025-12-31' && /Kalenderjahr 2025/.test(v.label), v);
  const v1 = J.zeitraum('vorjahr', '2026-01-01');
  check('Vorjahr am Neujahrstag = ganzes Vorjahr', v1.from === '2025-01-01' && v1.to === '2025-12-31', v1);
  const f = J.zeitraum('frei', '2026-11-24', { von: '2026-01-01', bis: '2026-03-31' });
  check('frei: Von/Bis übernommen, Label TT.MM.JJJJ', f.from === '2026-01-01' && f.to === '2026-03-31' && f.label === '01.01.2026 – 31.03.2026', f);
  const fe = (von, bis, re, name) => {
    const r = J.zeitraum('frei', '2026-11-24', { von, bis });
    check(name, 'fehler' in r && re.test(r.fehler), r);
  };
  fe('2026-04-01', '2026-03-31', /nach „Bis“/, 'frei: Von nach Bis → Fehler');
  fe('2026-01-01', '2026-12-31', /Zukunft/, 'frei: Bis in der Zukunft → Fehler (Soll zählte sonst kommende Tage)');
  fe('2025-01-01', '2026-11-24', /Höchstens 400 Tage/, 'frei: mehr als 400 Tage → Fehler');
  fe('', '2026-03-31', /Datum/, 'frei: leeres Von → Fehler');
  fe('2026-02-30', '2026-03-31', /Datum/, 'frei: 30.02. ist kein Tag → Fehler');
  fe('01.01.2026', '2026-03-31', /Datum/, 'frei: deutsches Format statt JJJJ-MM-TT → Fehler (Datumsfeld liefert JJJJ-MM-TT)');
  const g400 = J.zeitraum('frei', '2026-11-24', { von: '2025-10-21', bis: '2026-11-24' });
  check('frei: genau 400 Tage gehen', !('fehler' in g400), g400);
  check('istTag: 29.02. nur im Schaltjahr', J.istTag('2028-02-29') && !J.istTag('2027-02-29'));
}

// ---------------------------------------------------------------------------- Objekt-Abgleich
teil('WinterDex-Objekt zum ObjektDex-Objekt');
{
  const w = (id, name, address, active = true) => ({ id, name, address, customer_name: null, active });
  const wd = [
    w('a', 'WEG Lindenstraße', 'Lindenstr. 12'),
    w('b', 'Sonnenhof', 'Sonnenstraße 40–44'),
    w('c', 'Hauptplatz', 'Hauptplatz 5/2, 8200 Gleisdorf'),
    w('d', 'Kirchplatz alt', 'Kapuzinerstraße 36, 80469 München', false),
    w('e', 'Kirchplatz St. Anton', 'Kapuzinerstraße 36', true),
    w('f', 'Garage', ''),
    w('g', 'Parkplatz Nord', ''),
  ];
  const p = (name, address) => J.passendesWinterdexObjekt({ name, address }, wd)?.id ?? null;
  check('Straße = Str., PLZ/Ort fehlen auf einer Seite', p('WEG Lindenstraße 12', 'Lindenstraße 12, 80331 München') === 'a');
  check('Gedankenstrich-Hausnummer, PLZ/Ort fehlen', p('Wohnanlage Sonnenhof', 'Sonnenstraße 40–44, 80335 München') === 'b');
  check('andere Hausnummer = anderes Objekt (5 ≠ 5/2)', p('Hauptplatz', 'Hauptplatz 5, 8200 Gleisdorf') === null);
  check('mehrere Treffer: aktives zuerst', p('Pfarrei', 'Kapuzinerstraße 36, 80469 München') === 'e');
  check('keine Adresse: gleicher Name', p('Parkplatz Nord', '') === 'g');
  check('keine Adresse, anderer Name: nichts', p('Parkplatz Süd', '') === null);
  check('nichts Passendes: null', p('Bürohaus Am Ring 5', 'Am Ring 5, 80336 München') === null);
  check('leere WinterDex-Liste: null', J.passendesWinterdexObjekt({ name: 'X', address: 'Y 1' }, []) === null);
  const zwei = [w('x', 'Haus A', 'Ring 1', true), w('y', 'Haus B', 'Ring 1', true)];
  check('mehrere aktive Treffer: gleicher Name gewinnt', J.passendesWinterdexObjekt({ name: 'Haus B', address: 'Ring 1' }, zwei)?.id === 'y');
}

// ---------------------------------------------------------------------------- Kennzahlen
teil('Kennzahlen fürs Deckblatt');
{
  const k = J.kennzahlen({
    wdOps: [
      { canceled: false, lat: 48.1, end_lat: 48.1 },
      { canceled: false, lat: null, end_lat: null, nachgetragen: true },
      { canceled: true, lat: 48.1 },
    ],
    odOps: [
      { canceled: false, services: [{}, {}] },
      { canceled: false, services: [{}] },
      { canceled: true, services: [{}, {}, {}] },
    ],
    sollIst: [
      { soll: 10, ist: 8 },
      { soll: 4, ist: 6 }, // mehr als Soll gleicht die Lücke oben NICHT aus
      { soll: null, ist: 3 },
      { soll: 0, ist: 1 },
    ],
    maengel: [{ status: 'open' }, { status: 'done' }, { status: 'open' }],
  });
  check('Winterdienst: stornierte zählen nicht', k.winter.einsaetze === 2 && k.winter.storniert === 1, k.winter);
  check('Winterdienst: nachgetragen und ohne GPS gezählt', k.winter.nachgetragen === 1 && k.winter.ohneGps === 1, k.winter);
  check('Objektbetreuung: Einsätze ohne Storno', k.objekt.einsaetze === 2 && k.objekt.storniert === 1, k.objekt);
  check('erledigte Leistungen = Häkchen in gültigen Einsätzen', k.objekt.leistungen === 3, k.objekt);
  check('Soll/Ist: Termine 14, erledigt 12 (gekappt je Leistung)', k.objekt.termine === 14 && k.objekt.erledigt === 12, k.objekt);
  check('nach Bedarf ohne Soll gezählt', k.objekt.nachBedarf === 3, k.objekt);
  check('Mängel: 3, davon 2 offen', k.objekt.maengel === 3 && k.objekt.offeneMaengel === 2, k.objekt);
  check('Quote 12/14 = 86 %', J.quoteText(k.objekt) === '86 %', J.quoteText(k.objekt));
  const ohne = J.kennzahlen({ wdOps: null, odOps: [], sollIst: [], maengel: [] });
  check('ohne WinterDex: kein Winterdienst-Block', ohne.winter === null);
  check('ohne feste Termine: Quote „—“', J.quoteText(ohne.objekt) === '—');
  check('199 von 200 ist nicht „100 %“', J.quoteText({ termine: 200, erledigt: 199 }) === '99 %');
  check('1 von 300 ist nicht „0 %“', J.quoteText({ termine: 300, erledigt: 1 }) === '1 %');
  check('alles erledigt = 100 %', J.quoteText({ termine: 7, erledigt: 7 }) === '100 %');
  check('0 erledigt = 0 %', J.quoteText({ termine: 7, erledigt: 0 }) === '0 %');
  check('anzahl: Einzahl/Mehrzahl', J.anzahl(1, 'Einsatz', 'Einsätze') === '1 Einsatz' && J.anzahl(1200, 'Einsatz', 'Einsätze') === '1.200 Einsätze');
}

// ---------------------------------------------------------------------------- Quelltext-Wächter
teil('Quelltext: Einbindung, Wortwahl, Regeln');
{
  const area = lies('src/objektdex/ObjektdexArea.tsx');
  check('Route …/jahresnachweis im ObjektDex-Bereich (nachgeladen)', /path="jahresnachweis"/.test(area) && /import\('\.\/pages\/Jahresnachweis'\)/.test(area));
  const detail = lies('src/objektdex/pages/PropertyDetail.tsx');
  check('Objekt-Detail verlinkt den Nachweis mit Objekt, nicht für Mitarbeiter', /role !== 'worker' && \(\s*<Link[^>]*jahresnachweis\?objekt=\$\{p\.id\}/.test(detail));
  const ndw = lies('src/winterdex/pages/NachDemWinter.tsx');
  check('„Nach dem Winter“ verlinkt den Nachweis (Inhaber/Verwalter)', /\(inhaber \|\| verwalter\) && [\s\S]{0,200}JAHRESNACHWEIS_PFAD/.test(ndw));
  const wdArea = lies('src/winterdex/WinterdexArea.tsx');
  check('„Nach dem Winter“ hängt weiter an OBJEKTDEX_OEFFENTLICH', /OBJEKTDEX_OEFFENTLICH && \(\s*<Route\s+path="nach-dem-winter"/.test(wdArea));
  const gj = lies('src/lib/ganzjahr.ts');
  check('Schalter OBJEKTDEX_OEFFENTLICH unverändert aus', /export const OBJEKTDEX_OEFFENTLICH = false;/.test(gj));
  check('JAHRESNACHWEIS_PFAD = /app/objektdex/jahresnachweis', /JAHRESNACHWEIS_PFAD = '\/app\/objektdex\/jahresnachweis'/.test(gj));

  const seite = lies('src/objektdex/pages/Jahresnachweis.tsx');
  const pdf = lies('src/objektdex/jahresnachweisPdf.ts');
  const logik = lies('src/objektdex/jahresnachweis.ts');
  // Texte und Code ohne Kommentare (die Kommentare nennen die verbotenen Wörter ja gerade)
  const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const neu = [seite, pdf, logik].map(ohneKommentare).join('\n');
  check('nur Inhaber/Verwalter (isOwnerOrAdmin für ObjektDex UND WinterDex)', (seite.match(/isOwnerOrAdmin\(/g) ?? []).length >= 2);
  check('WinterDex-Anmeldung auf der Seite mit Rückweg hierher', /<LoginScreen returnTo=\{JAHRESNACHWEIS_PFAD\} \/>/.test(seite));
  check('keine Registrierung bei WinterDex an dieser Stelle', /webSignup: false/.test(seite));
  check('WinterDex nur lesend (kein insert/update/delete/rpc außer org_pro_active)', !/\.(insert|update|upsert|delete)\(/.test(seite) && !/\.rpc\(/.test(seite));
  // Wortwahl: keine Absolutaussagen in den NEUEN Texten
  const verboten = /rechtssicher|lückenlos|luckenlos|manipulationssicher|garantiert|100 ?% sicher|gerichtsfest/i;
  check('Wortwahl ohne „rechtssicher/lückenlos/garantiert/gerichtsfest“', !verboten.test(neu), (neu.match(verboten) ?? [])[0]);
  check('keine UTC-Tage (toISOString().slice(0, 10))', !/toISOString\(\)\.slice\(0, ?10\)/.test(neu));
  check('Zeitzone Europe/Vienna', /ZEITZONE = 'Europe\/Vienna'/.test(logik));

  // Pro-Regel je Teil wie in SEINER App
  check('WinterDex ohne Pro: Wasserzeichen nur über dem Winterdienst-Teil (Klasse wd-free)', /class="teil wd\$\{wd\.pro \? '' : ' wd-free'\}"/.test(pdf) && /Erstellt mit WinterDex Free/.test(pdf));
  check('WinterDex-Wasserzeichen nicht über dem ganzen Dokument (kein position:fixed)', !/position:\s*fixed/.test(pdf));
  check('ObjektDex ohne Pro: Gratis-Hinweis wie die App', /x\.od\.pro === false \? `<div class="free">\$\{esc\(GRATIS_HINWEIS\)\}/.test(pdf));
  const odReport = lies('src/objektdex/report.ts');
  check('ObjektDex-Hinweis = Wortlaut der App', /GRATIS_HINWEIS = 'Erstellt mit ObjektDex – Gratis-Version · objektdex\.dexware\.app'/.test(odReport));
  check('Nachweis-PDF von ObjektDex trägt den Gratis-Hinweis jetzt auch (Regel 1)', /x\.pro === false \? `<div class="free">\$\{GRATIS_HINWEIS\}/.test(odReport) && /data\.proStatus\(\)/.test(lies('src/objektdex/pages/Report.tsx')));
  check('Wetter-Quelle Open-Meteo (CC BY 4.0) im Winterdienst-Teil', /WEATHER_SOURCE_HTML/.test(pdf));
  check('storniert/nachgetragen/Prüfcode aus dem WinterDex-Baustein', /wdEinsatzTabelle\(ops, !x\.fotos\)/.test(pdf) && /NACHTRAG_NOTE/.test(pdf) && /PROOF_NOTE/.test(pdf));
  check('Pro je Teil vom Server: WinterDex fetchOrgPro, ObjektDex proStatus', /fetchOrgPro\(sb\)/.test(seite) && /data\.proStatus\(\)/.test(seite));
  const api = lies('src/winterdex/api.ts');
  check('WinterDex-Einsätze mit halboffenem Intervall [ab, bisVor)', /\.gte\('started_at', abIso\)\.lt\('started_at', bisVorIso\)/.test(api));
}

console.log(`\n${ok} ok, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
