// WinterDex: eigene Uhrzeit der Glätte-Frühwarnung im Dashboard (25.11.2026) — ohne Browser und ohne Netz.
//   [1] Auswahl 02:00–05:30 in 15-min-Schritten, Standard 02:45, Werte aus der Datenbank
//   [2] Laden: Spalte fehlt (Nachtrag noch nicht eingespielt) → null (Karte unsichtbar); Speichern über glaette_zeit_setzen
//   [3] Quelltext: Karte nur bei WinterDex, Inhaber + Verwalter dürfen ändern, Erklärsatz
//
//   Aufruf:  node tests/glaette-zeit.test.mjs        (Node ab 22.18, liest die .ts-Dateien direkt)
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
const lies = (f) => readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const G = await import(pathToFileURL(path.join(here, '..', 'src/winterdex/glaetteZeit.ts')).href);

let ok = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  cond ? ok++ : fail++;
  console.log(`${cond ? '  ok  ' : 'FEHLER'}  ${name}${cond || !extra ? '' : '  → ' + extra}`);
};

console.log('\n[1] Auswahl und Werte');
{
  const o = G.glaetteZeitOptionen();
  check('15 Uhrzeiten von 02:00 bis 05:30', o.length === 15 && o[0].label === '02:00 Uhr' && o.at(-1).label === '05:30 Uhr' && o.every((x, i) => x.value === 120 + i * 15), JSON.stringify(o.map((x) => x.label)));
  check('Standard 02:45 markiert', o.find((x) => x.value === 165)?.label === '02:45 Uhr (Standard)' && o.filter((x) => /Standard/.test(x.label)).length === 1);
  check('leer / ungültig → 02:45, gültig bleibt', G.glaetteZeitAus(null) === 165 && G.glaetteZeitAus(undefined) === 165 && G.glaetteZeitAus(170) === 165 && G.glaetteZeitAus(345) === 165 && G.glaetteZeitAus('240') === 165 && G.glaetteZeitAus(240) === 240);
  check('hhmm', G.hhmm(165) === '02:45' && G.hhmm(330) === '05:30' && G.hhmm(120) === '02:00');
}

console.log('\n[2] Laden und Speichern (Supabase-Attrappe)');
{
  const leser = (antwort) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => antwort }) }) }) });
  check('Spalte fehlt (42703) → null = Karte unsichtbar', (await G.ladeGlaetteZeit(leser({ data: null, error: { code: '42703', message: 'column org.glaette_morgen_zeit does not exist' } }), 'o')) === null);
  check('Netz weg (wirft) → null', (await G.ladeGlaetteZeit({ from: () => { throw new TypeError('fetch failed'); } }, 'o')) === null);
  check('leer → 02:45 (165)', (await G.ladeGlaetteZeit(leser({ data: { glaette_morgen_zeit: null }, error: null }), 'o')) === 165);
  check('04:00 → 240', (await G.ladeGlaetteZeit(leser({ data: { glaette_morgen_zeit: 240 }, error: null }), 'o')) === 240);
  let gerufen = null;
  const rpc = (antwort) => ({ rpc: async (f, args) => ((gerufen = { f, args }), antwort) });
  check('Speichern ruft glaette_zeit_setzen(p_org, p_minuten)', (await G.speichereGlaetteZeit(rpc({ data: 240, error: null }), 'org-1', 240)) === 240 && gerufen.f === 'glaette_zeit_setzen' && gerufen.args.p_org === 'org-1' && gerufen.args.p_minuten === 240, JSON.stringify(gerufen));
  check('02:45 gespeichert → Antwort 165 (Server speichert leer)', (await G.speichereGlaetteZeit(rpc({ data: 165, error: null }), 'o', 165)) === 165);
  let msg = '';
  try {
    gerufen = null;
    await G.speichereGlaetteZeit(rpc({ data: null, error: null }), 'o', 170);
  } catch (e) {
    msg = e.message;
  }
  check('ungültige Uhrzeit → Fehler ohne Server-Aufruf', /02:00 bis 05:30/.test(msg) && gerufen === null, msg);
  msg = '';
  try {
    await G.speichereGlaetteZeit(rpc({ data: null, error: { code: '42501', message: 'nur Inhaber' } }), 'o', 240);
  } catch (e) {
    msg = e.message;
  }
  check('Server lehnt ab (Mitarbeiter) → verständliche Meldung', msg === 'Nur Inhaber oder Verwalter können die Uhrzeit ändern.', msg);
}

console.log('\n[3] Quelltext');
{
  const team = lies('src/components/TeamPage.tsx');
  const karte = lies('src/winterdex/GlaetteFruehwarnung.tsx');
  check('Team-Seite: Karte nur bei WinterDex, Inhaber + Verwalter (canTeam) dürfen ändern', /app\.id === 'winterdex' && orgCtx && <GlaetteFruehwarnung client=\{client\} orgId=\{orgCtx\.org\.id\} darf=\{canTeam\} \/>/.test(team));
  check('Karte unsichtbar, solange kein Wert (Spalte fehlt / lädt)', /if \(wert == null\) return null;/.test(karte));
  check('Beschriftung „Glätte-Frühwarnung morgens um …“ + Erklärsatz', karte.includes('Glätte-Frühwarnung morgens um …') && karte.includes('{GLAETTE_ERKLAERUNG}') && /nur, wenn wirklich Glätte droht/.test(G.GLAETTE_ERKLAERUNG) && /19:00/.test(G.GLAETTE_ERKLAERUNG));
  check('Mitarbeiter sehen die Uhrzeit nur (ohne Auswahl)', /\{darf \? \(/.test(karte) && karte.includes('ändern können Inhaber oder Verwalter'));
}

console.log(`\n${fail === 0 ? 'ALLES GRÜN' : 'FEHLER'}: ${ok} ok, ${fail} Fehler`);
process.exit(fail === 0 ? 0 : 1);
