// Prüft das Jahresabo-Dankeschön im Dashboard (src/lib/gutschein.ts + Einbau in WinterDex/ObjektDex/SpielDex) — ohne
// echte Server: der Suite-Server ist durch einen fetch-Nachbau ersetzt.
//   • Aufruf an die Funktion „gutschein“: Adresse, Methode, Anmeldung der APP (nicht der Suite-Schlüssel) als Bearer,
//     x-dexware-app, Inhalt; ohne Anmeldung kein Aufruf
//   • Fehler des Servers → verständlicher deutscher Text (alle Codes, Zusatzfelder app/pro_bis/probe_bis), Netzfehler und
//     kaputte Antworten → „server“
//   • Code-Eingabe: gleiche Vereinheitlichung wie der Server (dexware-suite/supabase/functions/gutschein), Formatieren beim
//     Tippen (inkl. Rücktaste), Datum in Wien
//   • Einbau: Routen, Abo-Hinweis, BaumDex-Weg zeigt auf den Abschnitt im BaumDex-Portal, ruhige Animation mit
//     prefers-reduced-motion
//
//   Aufruf:  node tests/gutschein.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
//   Optional: dexware-suite und BaumDex neben dem Dashboard (sonst SUITE_REPO / BAUMDEX_REPO setzen) — sonst werden die
//             beiden Abgleiche übersprungen.
import { existsSync, readFileSync } from 'node:fs';
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
const G = await import(pathToFileURL(path.join(here, '../src/lib/gutschein.ts')).href);
const ABO = await import(pathToFileURL(path.join(here, '../src/lib/abo.ts')).href);

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))}`);
};

// ------------------------------------------------------------------------------------------------ Aufruf
console.log('\n[1] Aufruf an den Server');
{
  const log = [];
  const fake = (status, body) => async (url, init) => {
    log.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  const api = G.dankeschoenApi(async () => 'app-token-123', fake(200, { berechtigt: true, gutschein: null }));
  const s = await api.status();
  const r = log.at(-1);
  const h = new Headers(r.init.headers);
  check('Adresse = Suite-Funktion gutschein, POST', r.url === `${ABO.SUITE_URL}/gutschein` && r.init.method === 'POST');
  check('Anmeldung der App als Bearer (nicht der Suite-Schlüssel), apikey = Suite-anon', h.get('authorization') === 'Bearer app-token-123' && h.get('apikey') === ABO.SUITE_ANON);
  check('x-dexware-app: winterdex, Inhalt { aktion: status }', h.get('x-dexware-app') === 'winterdex' && r.init.body === '{"aktion":"status"}');
  check('Antwort durchgereicht', s.berechtigt === true && s.gutschein === null);

  const g = { code: 'WD-7K3M-9P2X', app: 'baumdex', gueltig_bis: '2027-11-25T22:59:59.000Z', eingeloest_am: null, pro_bis: null };
  const w = await G.dankeschoenApi(async () => 't', fake(200, { gutschein: g })).waehlen('baumdex');
  check('waehlen: Inhalt { aktion, app } und Gutschein zurück', log.at(-1).init.body === '{"aktion":"waehlen","app":"baumdex"}' && w.code === g.code);

  const e = await G.einloesenApi(async () => 'od-token', 'objektdex', fake(200, { ok: true, pro_bis: '2026-12-25T22:59:59.000Z', app: 'objektdex' })).einloesen('WD-7K3M-9P2X');
  const he = new Headers(log.at(-1).init.headers);
  check('einloesen: x-dexware-app = App des Bereichs, Token dieser App', he.get('x-dexware-app') === 'objektdex' && he.get('authorization') === 'Bearer od-token' && e.pro_bis === '2026-12-25T22:59:59.000Z');
  check('einloesen: Inhalt { aktion, code }', log.at(-1).init.body === '{"aktion":"einloesen","code":"WD-7K3M-9P2X"}');

  const n = log.length;
  let f = null;
  try { await G.dankeschoenApi(async () => null, fake(200, {})).status(); } catch (x) { f = x; }
  check('ohne Anmeldung: kein Aufruf, Fehler anmeldung_ungueltig', log.length === n && f instanceof G.GutscheinFehler && f.code === 'anmeldung_ungueltig');

  const fehlerVon = async (status, body) => {
    try { await G.einloesenApi(async () => 't', 'spieldex', fake(status, body)).einloesen('WD-7K3M-9P2X'); } catch (x) { return x; }
    return null;
  };
  let x = await fehlerVon(409, { fehler: 'falsche_app', app: 'objektdex' });
  check('409 falsche_app → Code + app', x?.code === 'falsche_app' && x.extra.app === 'objektdex');
  x = await fehlerVon(409, { fehler: 'schon_eingeloest', app: 'spieldex', pro_bis: '2026-12-25T22:59:59.000Z' });
  check('409 schon_eingeloest → pro_bis', x?.code === 'schon_eingeloest' && x.extra.pro_bis === '2026-12-25T22:59:59.000Z');
  x = await fehlerVon(403, { fehler: 'nicht_berechtigt', grund: 'kein_jahresabo', probe_bis: '2026-12-02T10:00:00Z' });
  check('403 nicht_berechtigt → grund + probe_bis', x?.code === 'nicht_berechtigt' && x.extra.grund === 'kein_jahresabo' && x.extra.probe_bis === '2026-12-02T10:00:00Z');
  x = await fehlerVon(418, { fehler: 'kaffee' });
  check('unbekannter Fehler-Code → server', x?.code === 'server');
  x = await fehlerVon(502, '<html>Bad Gateway</html>');
  check('kaputte Antwort (kein JSON) → server', x?.code === 'server');
  try { await G.einloesenApi(async () => 't', 'spieldex', async () => { throw new TypeError('fetch failed'); }).einloesen('x'); } catch (y) { x = y; }
  check('Netzfehler → server', x?.code === 'server');
}

// ------------------------------------------------------------------------------------------------ Texte
console.log('\n[2] Texte');
{
  const F = (c, e) => new G.GutscheinFehler(c, e);
  const alle = ['code_unbekannt', 'nicht_dein_code', 'falsche_app', 'abgelaufen', 'schon_eingeloest', 'nicht_berechtigt', 'anmeldung_ungueltig', 'zu_viele_versuche', 'ungueltige_anfrage', 'server'];
  check('jeder Fehler-Code hat einen deutschen Satz', alle.every((c) => /[a-zäöü]{3}.*\.$/.test(G.fehlerText(F(c)))));
  check('falsche_app nennt die App des Codes', /gilt für SpielDex/.test(G.fehlerText(F('falsche_app', { app: 'spieldex' }))));
  check('schon_eingeloest nennt App und Datum (Wien)', /ObjektDex Pro läuft bis 25\.12\.2026/.test(G.fehlerText(F('schon_eingeloest', { app: 'objektdex', pro_bis: '2026-12-25T22:59:59.000Z' }))));
  check('nicht_berechtigt beim Einlösen: Erstattung', /vorzeitig beendet/.test(G.fehlerText(F('nicht_berechtigt'), 'einloesen')));
  check('nicht_berechtigt beim Wählen in der Probezeit: ab Datum', /ab 02\.12\.2026/.test(G.fehlerText(F('nicht_berechtigt', { probe_bis: '2026-12-02T10:00:00Z' }), 'waehlen')));
  check('fremder Fehler → allgemeiner Satz', /nicht geklappt/.test(G.fehlerText(new Error('x'))));
  const texte = lies('src/lib/gutschein.ts') + lies('src/winterdex/pages/Dankeschoen.tsx') + lies('src/components/CodeEinloesen.tsx');
  check('Wortwahl: kein „rechtssicher“/„lückenlos“', !/rechtssicher|lückenlos/i.test(texte));
  check('Datum in Wien: 23:59:59 Ortszeit bleibt derselbe Tag', G.datumWien('2027-11-25T22:59:59.000Z') === '25.11.2027' && G.datumWien('2027-03-31T21:59:59.000Z') === '31.03.2027' && G.datumWien(null) === '–');
}

// ------------------------------------------------------------------------------------------------ Code-Eingabe
console.log('\n[3] Code-Eingabe');
{
  check('normalisiere: klein, Leerzeichen, ohne Striche', G.normalisiereCode(' wd 7k3m 9p2x ') === 'WD-7K3M-9P2X' && G.normalisiereCode('7K3M9P2X') === 'WD-7K3M-9P2X');
  check('normalisiere: verbotene Zeichen/falsche Länge → null', G.normalisiereCode('WD-7K3M-9P2O') === null && G.normalisiereCode('WD-7K3M') === null);
  const tippen = (folge) => folge.split('').reduce((v, ch) => G.formatiereEingabe(v + ch), '');
  check('Tippen „wd7k3m9p2x“ → WD-7K3M-9P2X', tippen('wd7k3m9p2x') === 'WD-7K3M-9P2X', tippen('wd7k3m9p2x'));
  check('Tippen ohne „WD“: „7k3m9p2x“ → WD-7K3M-9P2X', tippen('7k3m9p2x') === 'WD-7K3M-9P2X', tippen('7k3m9p2x'));
  check('erstes „W“ bleibt „W“ (nicht „WD-W“)', G.formatiereEingabe('w') === 'W' && G.formatiereEingabe('wd') === 'WD');
  // Rücktaste: Feld zeigt „WD-A“ → Rücktaste → „WD-“ → muss weiter löschbar sein
  check('Rücktaste kommt durch „WD-“ hindurch', G.formatiereEingabe('WD-') === 'WD' && G.formatiereEingabe('WD-ABCD-') === 'WD-ABCD');
  check('Einfügen mit Bindestrichen/Leerzeichen, höchstens 8 Zeichen', G.formatiereEingabe('wd-7k3m-9p2x-zzz') === 'WD-7K3M-9P2X' && G.formatiereEingabe('WD 7K3M 9P2X') === 'WD-7K3M-9P2X');

  const SUITE = process.env.SUITE_REPO ?? 'C:/Users/2easy/Desktop/dexware-suite';
  const fn = path.join(SUITE, 'supabase/functions/gutschein/index.ts');
  if (existsSync(fn)) {
    globalThis.Deno = { env: { get: () => undefined }, serve: () => {} };
    const S = await import(pathToFileURL(fn).href);
    const proben = ['wd 7k3m-9p2x', '7K3M9P2X', 'WD-7K3M-9P2O', 'WD7K3M9P2', '', 'wd—7k3m—9p2x', 'WD.7K3M.9P2X', 'WDWD-ABCD-2345', 'ab cd 23 45', 'WD-ABCD-23456'];
    const ab = proben.filter((p) => S.normalisiereCode(p) !== G.normalisiereCode(p));
    check('Vereinheitlichung identisch mit dem Server (10 Proben)', ab.length === 0, ab);
    check('App-Liste identisch mit dem Server', JSON.stringify(S.ZIEL_APPS) === JSON.stringify(G.GUTSCHEIN_APPS));
    const codes = Array.from({ length: 200 }, () => S.neuerCode());
    check('jeder Server-Code übersteht Formatieren + Vereinheitlichen', codes.every((c) => G.normalisiereCode(G.formatiereEingabe(c.toLowerCase())) === c));
  } else console.log('  (übersprungen: dexware-suite nicht gefunden)');
}

// ------------------------------------------------------------------------------------------------ Einbau
console.log('\n[4] Einbau');
{
  const wd = lies('src/winterdex/WinterdexArea.tsx');
  check('WinterDex: Route dankeschoen + Eintrag nur für Berechtigte', /path="dankeschoen"/.test(wd) && /dank\.data === true/.test(wd) && /Dein Dankeschön/.test(wd));
  const od = lies('src/objektdex/ObjektdexArea.tsx');
  const sd = lies('src/spieldex/SpieldexArea.tsx');
  check('ObjektDex + SpielDex: Route code-einloesen', /path="code-einloesen"/.test(od) && /path="code-einloesen"/.test(sd));
  check('ObjektDex-Bereich bleibt unlisted (Go-Live-Schalter unverändert)', /id: 'objektdex',[\s\S]{0,500}unlisted: true/.test(lies('src/apps/registry.ts')));
  check('Abo-Seite: Hinweis „Code einlösen“ nur bei ObjektDex/SpielDex', /\(app\.id === 'objektdex' \|\| app\.id === 'spieldex'\)[\s\S]{0,400}code-einloesen/.test(lies('src/components/AboPage.tsx')));
  const css = lies('src/components/gutschein.css');
  const ruhig = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  check('Animation respektiert prefers-reduced-motion (Erfolg, Haken, Ring, Code)', ['.gs-erfolg', '.gs-kreis', '.gs-strich', '.gs-ring', '.gs-neu .gs-code'].every((s) => ruhig.includes(s)));
  check('Erfolg ohne Dauer-Animation (Ring nur einmal)', /animation: gs-ring [^;]* 1 both/.test(css) && !/infinite/.test(css));
  const weg = G.einloeseWeg('baumdex');
  check('BaumDex: Einlösen im Portal (Abo-Seite, Abschnitt #gutschein)', weg.web === 'https://baumdex.dexware.app/subscribe#gutschein');
  const BD = process.env.BAUMDEX_REPO ?? 'C:/Users/2easy/Desktop/BaumDex';
  const seite = path.join(BD, 'apps/portal/src/app/(dashboard)/subscribe/page.tsx');
  if (existsSync(seite)) check('… den Abschnitt id="gutschein" gibt es im BaumDex-Portal', /id="gutschein"/.test(readFileSync(seite, 'utf8')));
  else console.log('  (übersprungen: BaumDex nicht gefunden)');
  check('ObjektDex/SpielDex: Einlösen im Dashboard des Bereichs', G.einloeseWeg('objektdex').web === '/app/objektdex/code-einloesen' && G.einloeseWeg('spieldex').web === '/app/spieldex/code-einloesen');
}

console.log(`\n${fail ? 'FEHLER' : 'ALLES GRÜN'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
