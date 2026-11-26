// SchutzDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/schutzdex?beispiel, docs/beispiel-zugang.md).
// Ein erfundener Zimmerei-Betrieb „Muster Holzbau GmbH“ in Musterstadt (DE): 18 Mitarbeiter (2 inaktiv), 8
// Unterweisungen, Zuweisungen mit Fälligkeit und Wiederholung (src/schutzdex/pages/Assignments.tsx), Nachweise mit
// Verständnis-Check, Klarname und Gerät (src/schutzdex/pages/Completions.tsx).
// Besonderheit SchutzDex: keine membership-Tabelle — die org gehört dem Konto direkt (owner_user_id,
// src/lib/orgApi.ts → fetchOwnerOrgContext); Mitarbeiter sind Datensätze ohne eigenes Konto.
// check_score ist wie in der App der Anteil richtiger Antworten in Prozent (SchutzDex/src/screens/briefings/
// RunBriefingScreen.tsx, bestanden ab 70 %), device_info wie die App „android 34“.
// Alle Personen sind erfunden (Initial + häufiger Nachname), keine E-Mails, keine Telefonnummern.
//
// Was die Übersicht damit zeigt (src/schutzdex/pages/Overview.tsx):
//   · Aktive Mitarbeiter 16 (18 insgesamt) · Unterweisungen 8 · Offene Zuweisungen 13, davon 6 überfällig
//   · Tabelle „Überfällige Unterweisungen“ mit 6 Zeilen · Nachweise 30 Tage und „Letzte Nachweise“ mit einem nicht
//     bestandenen Verständnis-Check
// Schema wie SchutzDex/supabase/migrations/0001_init.sql (+ Nachträge).

import { bsp, plus, vor, type BeispielDaten, type Zeile } from './typen.ts';

const ORG = bsp(1, 1);
const INHABER = bsp(2, 1);
const SEIT = vor(395, 16, 20, false);

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Kalendertag vor `tage` Tagen (negativ = in der Zukunft) als YYYY-MM-DD, lokal */
function datum(tage: number): string {
  const d = new Date();
  d.setDate(d.getDate() - tage);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const org: Zeile[] = [
  {
    id: ORG,
    owner_user_id: INHABER,
    name: 'Muster Holzbau GmbH',
    branche: 'Holzbau / Zimmerei',
    land: 'DE',
    mitarbeiter_anzahl: 18,
    created_at: SEIT,
  },
];

// ---------------------------------------------------------------------------- Mitarbeiter

// [nr, Name, Tätigkeit, Eintritt vor Tagen, aktiv]
type M = [number, string, string, number, boolean?];
const MITARBEITER: M[] = [
  [1, 'A. Becker', 'Zimmerer (Polier)', 4100],
  [2, 'M. Hoffmann', 'Zimmerer', 2900],
  [3, 'J. Schäfer', 'Zimmerer', 2300],
  [4, 'L. Koch', 'Zimmerer', 1500],
  [5, 'T. Bauer', 'Dachdecker', 1900],
  [6, 'S. Richter', 'Dachdecker', 820],
  [7, 'K. Wolf', 'Lager / Staplerfahrer', 3300],
  [8, 'P. Neumann', 'Maschinist Abbund', 2600],
  [9, 'F. Schwarz', 'Auszubildender Zimmerer', 85],
  [10, 'N. Zimmermann', 'Auszubildende Zimmerin', 85],
  [11, 'D. Braun', 'Kraftfahrer', 1200],
  [12, 'C. Krüger', 'Büro', 3600],
  [13, 'R. Hartmann', 'Bauleiter', 2000],
  [14, 'E. Lange', 'Zimmerer', 640],
  [15, 'B. Schmitz', 'Monteur Fenster und Türen', 410],
  [16, 'H. Werner', 'Helfer', 52],
  [17, 'O. Krause', 'Zimmerer', 3000, false],
  [18, 'G. Meier', 'Helfer', 700, false],
];
const ma = (nr: number) => bsp(3, nr);
const member: Zeile[] = MITARBEITER.map(([nr, name, taetigkeit, eintritt, aktiv]) => ({
  id: ma(nr),
  org_id: ORG,
  name,
  taetigkeit,
  email: null,
  telefon: null,
  eintritt_am: datum(eintritt),
  aktiv: aktiv ?? true,
  // vor dem Betrieb Eingetretene beim Einrichten angelegt, neue am Eintrittstag
  created_at: eintritt > 395 ? plus(SEIT, 30 + nr * 4) : vor(eintritt, 7, 30),
}));

// ---------------------------------------------------------------------------- Unterweisungen

// [nr, Titel, Tätigkeit, Version, angelegt vor Tagen, erstellt von]
type U = [number, string, string | null, number, number, 'ki' | 'manuell'];
const UNTERWEISUNGEN: U[] = [
  [1, 'Arbeiten auf Dächern und Absturzsicherung', 'Zimmerer, Dachdecker', 2, 390, 'ki'],
  [2, 'Erste Hilfe und Notfallorganisation', null, 1, 389, 'ki'],
  [3, 'Brandschutz und Verhalten im Brandfall', null, 1, 389, 'ki'],
  [4, 'Leitern und Tritte sicher benutzen', null, 1, 388, 'ki'],
  [5, 'Holzbearbeitungsmaschinen im Abbund', 'Maschinist Abbund', 1, 380, 'ki'],
  [6, 'Gabelstapler fahren', 'Lager / Staplerfahrer', 1, 372, 'ki'],
  [7, 'Lärm und Gehörschutz', null, 1, 120, 'ki'],
  [8, 'Ladungssicherung auf dem Lkw', 'Kraftfahrer', 1, 300, 'manuell'],
];
const uw = (nr: number) => bsp(4, nr);
const briefing: Zeile[] = UNTERWEISUNGEN.map(([nr, titel, taetigkeit, version, angelegt, von]) => ({
  id: uw(nr),
  org_id: ORG,
  titel,
  thema: null,
  land: 'DE',
  branche: 'Holzbau / Zimmerei',
  taetigkeit,
  // Inhalt und Fragen lädt das Dashboard nicht (api.ts → BRIEFING_COLS); hier nur in Kurzform wie aus der App
  content: [{ titel: 'Worum es geht', text: titel, kernpunkte: [] }],
  questions: [],
  generiert_von: von,
  version,
  created_at: vor(angelegt, 17, 5),
}));

// ---------------------------------------------------------------------------- Zuweisungen und Nachweise

const assignment: Zeile[] = [];
const completion: Zeile[] = [];
let zNr = 0;
let nNr = 0;

const GERAETE = ['android 34', 'android 35', 'android 34', 'ios 18.6', 'android 33'];

/** Nachweis: Unterschrift auf dem Gerät des Chefs (wie die App), Ergebnis des Verständnis-Checks in Prozent */
function nachweis(opt: { m: number; u: number; tage: number; uhr: [number, number]; score?: number; zuweisung?: string; version?: number }): void {
  const at = vor(opt.tage, opt.uhr[0], opt.uhr[1]);
  const score = opt.score ?? 100;
  nNr++;
  completion.push({
    id: bsp(6, nNr),
    org_id: ORG,
    assignment_id: opt.zuweisung ?? null,
    member_id: ma(opt.m),
    briefing_id: uw(opt.u),
    briefing_version: opt.version ?? UNTERWEISUNGEN[opt.u - 1][3],
    abgeschlossen_am: at,
    check_score: score,
    check_passed: score >= 70,
    signature_path: null,
    signed_name: MITARBEITER[opt.m - 1][1],
    device_info: GERAETE[nNr % GERAETE.length],
    created_at: plus(at, 1),
  });
}

/**
 * Zuweisung. `erledigt` = Nachweis vor so vielen Tagen (bestanden), `faellig` = Fälligkeit in Tagen
 * (positiv = schon vorbei). Ein nicht bestandener Check lässt die Zuweisung offen (wie die App: nur bestandene zählen).
 */
function zuweisung(opt: {
  m: number;
  u: number;
  faellig: number;
  wdh?: 'jaehrlich' | 'halbjaehrlich' | 'einmalig';
  erledigt?: { tage: number; uhr: [number, number]; score?: number };
  versuch?: { tage: number; uhr: [number, number]; score: number };
  angelegt: number;
}): void {
  zNr++;
  const id = bsp(5, zNr);
  assignment.push({
    id,
    org_id: ORG,
    briefing_id: uw(opt.u),
    member_id: ma(opt.m),
    faellig_am: datum(opt.faellig),
    status: opt.erledigt ? 'erledigt' : 'offen',
    wiederholung: opt.wdh ?? 'jaehrlich',
    created_at: vor(opt.angelegt, 16, 45),
  });
  if (opt.versuch) nachweis({ m: opt.m, u: opt.u, tage: opt.versuch.tage, uhr: opt.versuch.uhr, score: opt.versuch.score, zuweisung: id });
  if (opt.erledigt) nachweis({ m: opt.m, u: opt.u, tage: opt.erledigt.tage, uhr: opt.erledigt.uhr, score: opt.erledigt.score, zuweisung: id });
}

const BAU = [1, 2, 3, 4, 5, 6, 14];
const ALLE_AKTIV = MITARBEITER.filter((m) => m[4] !== false).map((m) => m[0]);

// Jahresunterweisung am Jahresanfang (Erste Hilfe, Brandschutz, Leitern) — vor gut 10 Monaten, alle bestanden
ALLE_AKTIV.filter((m) => ![9, 10, 16].includes(m)).forEach((m, i) => {
  const uhr: [number, number] = [7, 10 + i * 3];
  zuweisung({ m, u: 2, faellig: 318, erledigt: { tage: 321, uhr }, angelegt: 340 });
  zuweisung({ m, u: 3, faellig: 318, erledigt: { tage: 321, uhr: [uhr[0], uhr[1] + 1] }, angelegt: 340 });
  if (m !== 12) zuweisung({ m, u: 4, faellig: 318, erledigt: { tage: 320, uhr: [8, 10 + i * 3] , score: i % 5 === 3 ? 80 : 100 }, angelegt: 340 });
});
// Absturzsicherung für Zimmerer und Dachdecker (Version 2 seit dem Frühjahr)
BAU.forEach((m, i) => zuweisung({ m, u: 1, faellig: 228, erledigt: { tage: 230, uhr: [7, 5 + i * 4], score: i === 2 ? 80 : 100 }, angelegt: 240 }));
zuweisung({ m: 13, u: 1, faellig: 228, erledigt: { tage: 229, uhr: [15, 20] }, angelegt: 240 });
zuweisung({ m: 8, u: 5, faellig: 200, erledigt: { tage: 203, uhr: [13, 0] }, angelegt: 210 });
zuweisung({ m: 7, u: 6, faellig: 360, erledigt: { tage: 362, uhr: [6, 50] }, angelegt: 365 });
zuweisung({ m: 11, u: 8, faellig: 290, erledigt: { tage: 293, uhr: [6, 40] }, angelegt: 300 });

// Lärm und Gehörschutz (neu seit dem Sommer): ein Teil schon unterwiesen, der Rest in den nächsten Wochen
[1, 2, 3, 8].forEach((m, i) => zuweisung({ m, u: 7, faellig: 6, erledigt: { tage: 8 + i, uhr: [7, 15 + i * 6], score: i === 1 ? 80 : 100 }, angelegt: 110 }));
[4, 5, 6, 14].forEach((m) => zuweisung({ m, u: 7, faellig: -24, angelegt: 110 }));

// Neue Mitarbeiter und Auszubildende: Erstunterweisung vor Arbeitsaufnahme
zuweisung({ m: 9, u: 2, faellig: 84, wdh: 'halbjaehrlich', erledigt: { tage: 84, uhr: [8, 30] }, angelegt: 86 });
zuweisung({ m: 10, u: 2, faellig: 84, wdh: 'halbjaehrlich', erledigt: { tage: 84, uhr: [8, 36] }, angelegt: 86 });
zuweisung({ m: 9, u: 3, faellig: 84, wdh: 'halbjaehrlich', erledigt: { tage: 84, uhr: [8, 50] }, angelegt: 86 });
zuweisung({ m: 10, u: 3, faellig: 84, wdh: 'halbjaehrlich', erledigt: { tage: 83, uhr: [7, 20] }, angelegt: 86 });
zuweisung({ m: 16, u: 2, faellig: 50, erledigt: { tage: 52, uhr: [7, 0] }, angelegt: 53 });
zuweisung({ m: 16, u: 3, faellig: 50, erledigt: { tage: 52, uhr: [7, 9] }, angelegt: 53 });

// überfällig (6): Maschinen im Abbund für die Azubis (einer hat den Check nicht bestanden), Stapler-Wiederholung,
// Absturzsicherung für den Dachdecker nach dem Urlaub, Erste Hilfe und Leitern für Neue
zuweisung({ m: 9, u: 5, faellig: 10, wdh: 'halbjaehrlich', versuch: { tage: 2, uhr: [14, 35], score: 60 }, angelegt: 30 });
zuweisung({ m: 10, u: 5, faellig: 10, wdh: 'halbjaehrlich', angelegt: 30 });
zuweisung({ m: 7, u: 6, faellig: 3, angelegt: 21 });
zuweisung({ m: 5, u: 1, faellig: 17, wdh: 'einmalig', angelegt: 35 });
zuweisung({ m: 16, u: 4, faellig: 24, angelegt: 53 });
zuweisung({ m: 15, u: 4, faellig: 5, angelegt: 40 });
// offen in den nächsten Wochen
zuweisung({ m: 11, u: 8, faellig: -30, angelegt: 15 });
zuweisung({ m: 12, u: 4, faellig: -45, angelegt: 15 });
zuweisung({ m: 13, u: 7, faellig: -38, angelegt: 15 });

// Nachweise der letzten Tage (Nachschulung Absturzsicherung, Stapler)
nachweis({ m: 6, u: 1, tage: 1, uhr: [15, 5], version: 2 });
nachweis({ m: 14, u: 1, tage: 1, uhr: [15, 18], score: 80, version: 2 });

export const daten: BeispielDaten = {
  app: 'schutzdex',
  nutzer: { id: INHABER, email: 'inhaber@muster-holzbau.example' },
  tabellen: { org, member, briefing, assignment, completion },
};
