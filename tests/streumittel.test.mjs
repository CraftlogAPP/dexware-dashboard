// WinterDex: Streumittel ausblenden (Kundenwunsch 26.11.2026, Vertrag v3) im Dashboard — ohne Browser und ohne Netz.
//   [1] Schlüssel: GENAU die gespeicherten Werte von grit_material wie in der App (mobile/src/types.ts) und im Dashboard
//   [2] org.streumittel_aus lesen (Spalte fehlt → null = alle wie bisher, unbekannte Werte und „Sonstiges“ fallen weg)
//   [3] Auswahl beim Erfassen: nur aktive, „Sonstiges“ immer, gewählter Wert bleibt sichtbar, Rückfall „alle“
//   [4] Vorauswahl neuer Formulare (Splitt, sonst das erste aktive) und Einheit (Sole → Liter)
//   [5] Umschalten auf der Team-Seite (mindestens ein echtes Streumittel bleibt an, „Sonstiges“ nicht schaltbar)
//   [6] Antwort von set_streumittel_aus (ok / Rückfall ohne Server-Update / keine Rechte / alle aus / unbekannt / Netz)
//   [7] Texte (keine Versprechen) und Platzhalter beim Nachtragen
//   [8] Quelltext-Wächter: Formulare nur mit aktiven, Karte nur Inhaber/Verwalter, kein refresh() des Betriebs-Kontexts,
//       Anzeige gespeicherter Einsätze unverändert
//   [9] Gegenprobe mit dem SQL-Nachtrag der Server-Runde (falls eine WinterDex-Arbeitskopie ihn schon hat)
//
//   Aufruf:  node tests/streumittel.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
const S = await web('src/winterdex/streumittel.ts');
const A = await web('src/winterdex/einsatz/amount.ts');

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) ok++;
  else fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || extra === '' ? '' : '  → ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 500)}`);
};
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n[1] Schlüssel = gespeicherte Werte von grit_material (App und Dashboard)');
{
  const SCHLUESSEL = ['Splitt', 'Salz', 'Sole', 'Granulat', 'Sonstiges'];
  check('Streumittel-Schlüssel: Splitt, Salz, Sole, Granulat, Sonstiges', gleich([...S.STREUMITTEL], SCHLUESSEL), S.STREUMITTEL);
  check('Dashboard-Auswahl (amount.ts GRIT_MATERIALS) ist dieselbe Liste', A.GRIT_MATERIALS === S.STREUMITTEL);
  check('ausblendbar: die vier echten, „Sonstiges“ bleibt immer', gleich([...S.AUSBLENDBAR], ['Splitt', 'Salz', 'Sole', 'Granulat']) && S.IMMER_DA === 'Sonstiges');
  // App (nur lesen): Arbeitskopie der App-Runde, sonst das Haupt-Checkout
  const appDateien = ['C:/Users/2easy/Desktop/WinterDex-wt-app/mobile/src/types.ts', 'C:/Users/2easy/Desktop/WinterDex/mobile/src/types.ts'].filter((f) => existsSync(f));
  if (!appDateien.length) console.log('  –     App-Quelltext nicht gefunden — Abgleich übersprungen');
  for (const f of appDateien) {
    const m = readFileSync(f, 'utf8').match(/export const GRIT_MATERIALS = \[([^\]]*)\] as const;/);
    const app = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
    check(`App ${f.includes('wt-app') ? '(feat/wetter-app)' : '(Haupt-Checkout)'}: GRIT_MATERIALS gleich`, gleich(app, SCHLUESSEL), app);
  }
}

console.log('\n[2] org.streumittel_aus lesen');
{
  check('Spalte fehlt (Server-Update noch nicht da) → null', S.streumittelAusVon({ id: 'o1', name: 'B' }) === null);
  check('kein Betrieb → null', S.streumittelAusVon(null) === null && S.streumittelAusVon(undefined) === null);
  check('Standard leer → []', gleich(S.streumittelAusVon({ streumittel_aus: [] }), []));
  check('Spalte null (sollte nicht vorkommen) → nichts ausgeblendet', gleich(S.streumittelAusVon({ streumittel_aus: null }), []));
  check('Reihenfolge wie die Auswahl', gleich(S.streumittelAusVon({ streumittel_aus: ['Sole', 'Splitt'] }), ['Splitt', 'Sole']));
  check('unbekannte Werte, Kleinschreibung und „Sonstiges“ fallen weg', gleich(S.streumittelAusVon({ streumittel_aus: ['splitt', 'Kies', 'Sonstiges', 'Salz', 7] }), ['Salz']));
}

console.log('\n[3] Auswahl beim Erfassen');
{
  check('nichts ausgeblendet → alle fünf', gleich(S.streumittelZurAuswahl([]), ['Splitt', 'Salz', 'Sole', 'Granulat', 'Sonstiges']));
  check('ohne Server-Update (null) → alle fünf', gleich(S.streumittelZurAuswahl(null), [...S.STREUMITTEL]) && gleich(S.streumittelZurAuswahl(undefined), [...S.STREUMITTEL]));
  check('Splitt und Sole aus (Zimmerei) → Salz, Granulat, Sonstiges', gleich(S.streumittelZurAuswahl(['Splitt', 'Sole']), ['Salz', 'Granulat', 'Sonstiges']));
  check('„Sonstiges“ bleibt immer (auch wenn es in der Liste stünde)', S.streumittelZurAuswahl(['Sonstiges', 'Salz']).includes('Sonstiges'));
  check('gewählter Wert (angefangener Einsatz von vorher) bleibt sichtbar — nie eine unsichtbare Auswahl',
    gleich(S.streumittelZurAuswahl(['Splitt', 'Sole'], 'Splitt'), ['Splitt', 'Salz', 'Granulat', 'Sonstiges']));
  check('… gewählter aktiver Wert: keine Doppelung', gleich(S.streumittelZurAuswahl(['Sole'], 'Salz'), ['Splitt', 'Salz', 'Granulat', 'Sonstiges']));
  check('alle vier aus (lässt der Server nicht zu) → Rückfall: alle', gleich(S.streumittelZurAuswahl(['Splitt', 'Salz', 'Sole', 'Granulat']), [...S.STREUMITTEL]));
  check('unbekannte Werte ändern nichts', gleich(S.streumittelZurAuswahl(['Kies', 'splitt']), [...S.STREUMITTEL]));
}

console.log('\n[4] Vorauswahl neuer Formulare');
{
  check('Standard: Splitt (wie bisher)', S.startStreumittel([]) === 'Splitt' && S.startStreumittel(null) === 'Splitt');
  check('Splitt aus → Salz', S.startStreumittel(['Splitt']) === 'Salz');
  check('Splitt + Salz aus → Sole', S.startStreumittel(['Splitt', 'Salz']) === 'Sole');
  check('nur Granulat an → Granulat', S.startStreumittel(['Splitt', 'Salz', 'Sole']) === 'Granulat');
  const f1 = A.initialForm('Max');
  check('initialForm ohne Angabe: Splitt / kg (unverändert)', f1.gritMaterial === 'Splitt' && f1.gritUnit === 'kg' && f1.performerName === 'Max' && f1.unitTouched === false);
  const f2 = A.initialForm('', S.startStreumittel(['Splitt', 'Salz']));
  check('Vorauswahl Sole → Einheit Liter', f2.gritMaterial === 'Sole' && f2.gritUnit === 'l', f2);
  const rec = A.formToRecord({ ...A.initialForm('', 'Granulat'), gritAmount: '12,5' });
  check('gespeichert wird der Schlüssel selbst (grit_material „Granulat“, „12,5 kg“)', rec.grit_material === 'Granulat' && rec.grit_amount === '12,5 kg', rec);
}

console.log('\n[5] Umschalten (Team-Seite)');
{
  check('Splitt ausschalten', gleich(S.streumittelUmschalten([], 'Splitt'), ['Splitt']));
  check('Sole dazu → Reihenfolge wie die Auswahl', gleich(S.streumittelUmschalten(['Sole'], 'Splitt'), ['Splitt', 'Sole']));
  check('wieder einschalten', gleich(S.streumittelUmschalten(['Splitt', 'Sole'], 'Sole'), ['Splitt']));
  check('letztes aktives echtes Streumittel bleibt an → null', S.streumittelUmschalten(['Splitt', 'Salz', 'Sole'], 'Granulat') === null);
  check('„Sonstiges“ nicht schaltbar → null', S.streumittelUmschalten([], 'Sonstiges') === null);
  check('unbekannt → null', S.streumittelUmschalten([], 'Kies') === null);
  const ein = ['Salz'];
  S.streumittelUmschalten(ein, 'Sole');
  check('Eingabe bleibt unverändert', gleich(ein, ['Salz']));
}

console.log('\n[6] Antwort von set_streumittel_aus');
{
  const fehlt = { code: 'PGRST202', message: 'Could not find the function public.set_streumittel_aus(p_aus, p_org) in the schema cache' };
  check('RPC fehlt (PGRST202) → Hinweis „nächstes Server-Update“ statt Fehler', S.streumittelAntwort(null, fehlt, ['Splitt']).art === 'fehlt');
  check('… auch 42883 / Spalte fehlt 42703', S.streumittelAntwort(null, { code: '42883', message: 'function does not exist' }, []).art === 'fehlt' && S.streumittelAntwort(null, { code: '42703', message: 'column "streumittel_aus" does not exist' }, []).art === 'fehlt');
  check('ok mit aus → Stand vom Server', gleich(S.streumittelAntwort({ ok: true, aus: ['Sole', 'Splitt'] }, null, ['Splitt']), { art: 'ok', aus: ['Splitt', 'Sole'] }));
  check('ok ohne aus → das Gesendete', gleich(S.streumittelAntwort({ ok: true }, null, ['Granulat']), { art: 'ok', aus: ['Granulat'] }));
  check('ok als Zeile in einer Liste', gleich(S.streumittelAntwort([{ ok: true, aus: [] }], null, []), { art: 'ok', aus: [] }));
  const r = (d) => S.streumittelAntwort(d, null, []);
  check('keine_rechte → „Nur Inhaber oder Verwalter …“', r({ fehler: 'keine_rechte' }).text === S.TEXT_KEINE_RECHTE && /Inhaber oder Verwalter/.test(S.TEXT_KEINE_RECHTE));
  check('42501 → derselbe Text', S.streumittelAntwort(null, { code: '42501', message: 'permission denied' }, []).text === S.TEXT_KEINE_RECHTE);
  check('alle_aus → „Mindestens ein Streumittel …“', r({ fehler: 'alle_aus' }).text === S.TEXT_ALLE_AUS);
  check('unbekannt → „Seite neu laden“', r({ fehler: 'unbekannt' }).text === S.TEXT_UNBEKANNT);
  check('Netzfehler → verständlich', S.streumittelAntwort(null, { message: 'TypeError: Failed to fetch' }, []).text === S.TEXT_NETZ);
  check('unerwartete Antwort (null) → Fehler, nie „gespeichert“', r(null).art === 'fehler' && r({}).art === 'fehler');
}

console.log('\n[7] Texte');
{
  check('Gespeichert-Satz nennt die aktiven', S.gespeichertText(['Splitt', 'Sole']) === 'Gespeichert – beim Erfassen stehen jetzt: Salz, Granulat und Sonstiges.', S.gespeichertText(['Splitt', 'Sole']));
  check('Platzhalter beim Nachtragen: nur aktive', S.nachtragBeispiel([]) === 'z. B. Splitt, Salz' && S.nachtragBeispiel(['Splitt']) === 'z. B. Salz, Sole' && S.nachtragBeispiel(null) === 'z. B. Splitt, Salz');
  check('Hinweis ohne Server-Update: „kommt mit dem nächsten Server-Update“', /kommt mit dem nächsten Server-Update/.test(S.TEXT_SERVER_UPDATE) && /alle Streumittel/.test(S.TEXT_SERVER_UPDATE));
  check('Erklärung: gilt fürs ganze Team, gespeicherte Einsätze bleiben', /für alle im Team/.test(S.TEXT_ERKLAERUNG) && /Schon gespeicherte Einsätze bleiben, wie sie sind/.test(S.TEXT_ERKLAERUNG));
  const alle = [S.TEXT_SERVER_UPDATE, S.TEXT_KEINE_RECHTE, S.TEXT_ALLE_AUS, S.TEXT_UNBEKANNT, S.TEXT_NETZ, S.TEXT_ERKLAERUNG, S.TEXT_SONSTIGES].join(' ');
  check('keine Versprechen („garantiert“, „verpasst nichts“, „Haftung“)', !/garantiert|verpasst nichts|haftung/i.test(alle));
}

console.log('\n[8] Quelltext-Wächter');
{
  const ez = lies('src/winterdex/pages/EinsatzErfassen.tsx');
  const fe = lies('src/winterdex/aussendienst/Felder.tsx');
  const sf = lies('src/winterdex/aussendienst/StreckeFahren.tsx');
  check('Einsatz erfassen (Außendienst): Chips nur aktive, gewählter bleibt sichtbar',
    /streumittelZurAuswahl\(streumittelAus, form\.gritMaterial\)\.map\(/.test(ez) && !/GRIT_MATERIALS\.map/.test(ez));
  check('Fahrt-Abschluss (Felder): Chips nur aktive', /streumittelZurAuswahl\(streumittelAus, form\.gritMaterial\)\.map\(/.test(fe) && !/GRIT_MATERIALS\.map/.test(fe));
  check('Vorauswahl über startStreumittel (Einsatz + Fahrt)',
    /initialForm\(getPerformerName\(userId\), startStreumittel\(streumittelAus\)\)/.test(ez) && /initialForm\(getPerformerName\(userId\), startStreumittel\(streumittelAus\)\)/.test(sf));
  const alleDateien = (d) =>
    readdirSync(path.join(here, '..', d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? alleDateien(`${d}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${d}/${e.name}`] : []));
  const voll = alleDateien('src').filter((f) => /GRIT_MATERIALS\.map|STREUMITTEL\.map/.test(lies(f)));
  check('sonst nirgends eine Streumittel-Auswahl aus der vollen Liste', voll.length === 0, voll);
  const tp = lies('src/components/TeamPage.tsx');
  check('Team-Seite: Karte nur im WinterDex-Bereich, ändern nur Inhaber + Verwalter',
    /\{app\.id === 'winterdex' && orgCtx && <StreumittelKarte client=\{client\} orgId=\{orgCtx\.org\.id\} darf=\{canTeam\} \/>\}/.test(tp) && /const canTeam = isOwner \|\| isAdmin;/.test(tp));
  const k = lies('src/winterdex/StreumittelKarte.tsx');
  check('Karte: Mitarbeiter sehen nichts, RPC set_streumittel_aus mit p_org + p_aus',
    /if \(!darf\) return null;/.test(k) && /client\.rpc\('set_streumittel_aus', \{ p_org: orgId, p_aus: neu \}\)/.test(k));
  check('Karte: ohne Server-Update Hinweis statt Fehler, Chips gesperrt', /\{ohneServer && <div className="info-box">\{TEXT_SERVER_UPDATE\}<\/div>\}/.test(k) && /disabled=\{busy \|\| ohneServer\}/.test(k));
  check('Karte: Chips mit aria-pressed, „Sonstiges“ fest', /aria-pressed=\{an\}/.test(k) && /sm-fest/.test(k));
  const us = lies('src/winterdex/einsatz/useStreumittel.ts');
  check('kein refresh() des Betriebs-Kontexts (ohne Netz → „Betrieb anlegen“ mitten im Funkloch)', !/\.refresh\(|refresh\?\.\(/.test(us) && !/\.refresh\(|refresh\?\.\(/.test(k));
  check('stilles Nachladen nur der einen Spalte, Fehler/Netz weg → alter Stand',
    /select\('streumittel_aus'\)/.test(us) && /if \(error \|\| !data\) return;/.test(us) && /navigator\.onLine === false/.test(us));
  check('Außendienst lädt beim Zurückkehren in den Tab nach', /useStreumittelNachladen\(useAppAuthOptional\(\)\?\.client \?\? null, orgId\);/.test(lies('src/winterdex/aussendienst/Aussendienst.tsx')));
  check('Lesen über die vorhandene org-Abfrage (select(\'*\') bringt streumittel_aus mit)', /\.from\('org'\)\s*\.select\('\*'\)/.test(lies('src/lib/orgApi.ts')));
  // gespeicherte Einsätze: Anzeige unverändert (Liste, Detail, PDF) — kein Filter auf die Streumittel-Einstellung
  const anzeige = ['src/winterdex/labels.ts', 'src/winterdex/pages/OperationDetail.tsx', 'src/winterdex/pages/Operations.tsx', 'src/winterdex/report.ts', 'src/winterdex/routeReport.ts', 'src/winterdex/pages/RunDetail.tsx', 'src/winterdex/exportLists.ts'];
  check('Anzeige gespeicherter Einsätze (Liste, Detail, PDF, Excel) filtert nichts', anzeige.every((f) => !/streumittelZurAuswahl|streumittel_aus/.test(lies(f))));
  check('Nachtragen (Inhaber/Verwalter): freies Feld, Platzhalter nur mit aktiven', /placeholder: nachtragBeispiel\(streumittelAus\)/.test(lies('src/winterdex/pages/Operations.tsx')));
}

console.log('\n[9] Gegenprobe mit dem SQL-Nachtrag der Server-Runde');
{
  const ordner = ['C:/Users/2easy/Desktop/WinterDex-wt-mitteilungen/supabase', 'C:/Users/2easy/Desktop/WinterDex/supabase'].filter((d) => existsSync(d));
  const sql = ordner.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.sql')).map((f) => path.join(d, f))).map((f) => [f, readFileSync(f, 'utf8')]).filter(([, t]) => /set_streumittel_aus/.test(t));
  if (!sql.length) console.log('  –     noch kein Nachtrag mit set_streumittel_aus gefunden — Gegenprobe übersprungen (Rückfall im Dashboard getestet)');
  for (const [f, t] of sql) {
    const name = path.basename(f);
    // nur der SQL-Code zählt (Kommentare nennen „Sonstiges“ und Beispiele)
    const code = t.replace(/--[^\n]*/g, '');
    check(`${name}: Spalte streumittel_aus text[] not null default '{}'`, /streumittel_aus\s+text\[\]\s+not\s+null\s+default\s+'\{\}'/i.test(code));
    check(`${name}: RPC set_streumittel_aus(p_org uuid, p_aus text[]) → jsonb`, /set_streumittel_aus\s*\(\s*p_org\s+uuid\s*,\s*p_aus\s+text\[\]\s*\)\s*returns\s+jsonb/i.test(code));
    // Regel wie im Dashboard: ausblendbar sind GENAU die vier echten Schlüssel (Reihenfolge wie die Auswahl), „Sonstiges“ nie —
    // das Dashboard schickt es nie in p_aus. Jede Schlüssel-Liste im Code (Prüfregel, Funktion, Kontrolle) muss das sein.
    const listen = [...code.matchAll(/array\s*\[([^\]]*)\]/gi)].map((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1])).filter((l) => l.length > 1);
    check(`${name}: ausblendbar genau ${S.AUSBLENDBAR.join(', ')} (Schlüssel wie Dashboard und App)`, listen.length > 0 && listen.every((l) => gleich(l, [...S.AUSBLENDBAR])), listen);
    check(`${name}: „Sonstiges“ nie ausblendbar (kein Schlüssel im Code)`, !/'Sonstiges'/.test(code));
    check(`${name}: Absagen keine_rechte / unbekannt / alle_aus, Antwort {ok, aus}`,
      ['keine_rechte', 'unbekannt', 'alle_aus'].every((x) => code.includes(`'${x}'`)) && /'ok',\s*true,\s*'aus'/.test(code));
    check(`${name}: ändern nur Inhaber und Verwalter (role 'owner' / 'admin')`, /role\s+in\s*\(\s*'owner',\s*'admin'\s*\)/.test(code));
  }
}

console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail === 0 ? 0 : 1);
