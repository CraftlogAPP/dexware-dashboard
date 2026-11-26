// KfzDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/kfzdex?beispiel, docs/beispiel-zugang.md).
// Ein erfundener Betrieb „Musterbau GmbH“ (DE) mit 13 Fahrzeugen und Arbeitsgeräten und 16 Fahrern (2 ausgeschieden).
// UVV-Frist 12 Monate (src/kfzdex/due.ts → UVV_INTERVAL_MONTHS, DGUV Vorschrift 70), Führerscheinkontrolle je Fahrer
// alle 6 bzw. 12 Monate (driver.check_interval_months), „bald fällig“ ab 30 Tagen (SOON_DAYS).
// Personen nur als Initial + häufiger Nachname, keine Markennamen (Fahrzeuge nach Einsatz benannt), Kennzeichen „MU-…“
// bzw. „STAPLER n“ für Geräte ohne Kennzeichen.
//
// Was die Übersicht damit zeigt (src/kfzdex/pages/Overview.tsx):
//   · Fahrzeuge 13 · Aktive Fahrer 14 (+ 2 inaktiv) · Überfällig 3 (+ 5 bald fällig) · Fuhrpark-Gesundheit 73 %
//   · Fällige UVV-Prüfungen: 1× nie geprüft, 2× überfällig, 3× bald fällig
//   · Fällige Führerscheinkontrollen: 1× nie geprüft, 1× überfällig, 2× bald fällig
//   · Letzte UVV-Prüfungen mit allen drei Ergebnissen (bestanden, Mängel festgestellt, nicht bestanden)
//   · keine Karte „Erste Schritte“ (Betrieb älter als 30 Tage, Bestand und Prüfungen vorhanden)
// Schema wie KfzDex/supabase/migrations/*.sql + Nachträge (org, org_member, vehicle, driver, uvv_inspection, license_check).

import { CHECK_ITEMS } from '../../kfzdex/types.ts';
import { bsp, vor, type BeispielDaten, type Zeile } from './typen.ts';

const ORG = bsp(1, 1);
const INHABER = bsp(2, 1);
const WAGNER = bsp(2, 2);
const SEIT = vor(530, 8, 40, false);

// ---------------------------------------------------------------------------- Datums-Helfer (lokale Kalendertage)

/** Lokales Datum YYYY-MM-DD (nie toISOString().slice — Zeitzone) */
function lokal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Letzte Prüfung (Datum) für eine Frist von `monate` Monaten, die in `tage` Tagen abläuft (negativ = seit so vielen Tagen
 * überfällig). Fällt der Tag auf ein Wochenende, zählt der Freitag davor (Prüfungen an Werktagen) — die Restzeit wird
 * dann höchstens 2 Tage kürzer.
 */
function letzte(monate: number, tage: number): string {
  const ziel = new Date();
  ziel.setHours(12, 0, 0, 0);
  ziel.setDate(ziel.getDate() + tage);
  const d = new Date(ziel.getFullYear(), ziel.getMonth() - monate, 1, 12);
  d.setDate(Math.min(ziel.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return lokal(d);
}

/** Datum `monate` Monate vor `iso` (für ältere Einträge der Historie), auf Werktag zurückgelegt */
function zurueck(iso: string, monate: number, tage = 0): string {
  const [y, m, t] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 - monate, 1, 12);
  d.setDate(Math.min(t, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) - tage);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return lokal(d);
}

/** Zeitpunkt am Tag `iso` um hh:mm (lokal) als ISO */
function um(iso: string, hh: number, mm: number): string {
  const [y, m, t] = iso.split('-').map(Number);
  return new Date(y, m - 1, t, hh, mm).toISOString();
}

// ---------------------------------------------------------------------------- Betrieb + Team

const org: Zeile[] = [
  { id: ORG, owner_user_id: INHABER, name: 'Musterbau GmbH', invite_code: 'K7F3-X2M9', created_at: SEIT, seat_limit: 20, seat_override: null },
];
const org_member: Zeile[] = [
  { id: bsp(9, 1), org_id: ORG, user_id: INHABER, role: 'owner', is_admin: false, created_at: SEIT },
  { id: bsp(9, 2), org_id: ORG, user_id: WAGNER, role: 'member', is_admin: true, created_at: vor(522, 9, 15, false) },
  { id: bsp(9, 3), org_id: ORG, user_id: bsp(2, 3), role: 'member', is_admin: false, created_at: vor(401, 7, 5, false) },
  { id: bsp(9, 4), org_id: ORG, user_id: bsp(2, 4), role: 'member', is_admin: false, created_at: vor(260, 6, 50, false) },
];

// ---------------------------------------------------------------------------- Fahrzeuge

// Prüfer der UVV (befähigte Personen, erfunden)
const HOFFMANN = 'K. Hoffmann';
const LANGE = 'T. Lange';

interface F {
  nr: number;
  plate: string;
  name: string;
  type: 'pkw' | 'transporter' | 'lkw' | 'anhaenger' | 'stapler' | 'sonstig';
  ez: string | null;
  /** Tage bis zur UVV-Fälligkeit (negativ = überfällig); null = noch nie geprüft */
  tage: number | null;
  pruefer: string;
}

const FAHRZEUGE: F[] = [
  { nr: 1, plate: 'MU-MB 101', name: 'Transporter Kundendienst 1', type: 'transporter', ez: '2021-03-15', tage: 358, pruefer: HOFFMANN },
  { nr: 2, plate: 'MU-MB 102', name: 'Transporter Kundendienst 2', type: 'transporter', ez: '2021-03-15', tage: 12, pruefer: HOFFMANN },
  { nr: 3, plate: 'MU-MB 103', name: 'Transporter Kundendienst 3', type: 'transporter', ez: '2023-06-01', tage: 330, pruefer: HOFFMANN },
  { nr: 4, plate: 'MU-MB 110', name: 'Pritschenwagen Bau', type: 'transporter', ez: '2019-09-20', tage: 167, pruefer: LANGE },
  { nr: 5, plate: 'MU-MB 120', name: 'Kipper 7,5 t', type: 'lkw', ez: '2016-04-11', tage: -9, pruefer: LANGE },
  { nr: 6, plate: 'MU-MB 121', name: 'Kipper 12 t', type: 'lkw', ez: '2020-02-03', tage: 241, pruefer: LANGE },
  { nr: 7, plate: 'MU-MB 130', name: 'Pkw Bauleitung', type: 'pkw', ez: '2022-08-29', tage: 23, pruefer: HOFFMANN },
  { nr: 8, plate: 'MU-MB 131', name: 'Pkw Büro', type: 'pkw', ez: '2024-01-17', tage: 301, pruefer: HOFFMANN },
  { nr: 9, plate: 'MU-MB 140', name: 'Kastenwagen Elektro', type: 'transporter', ez: '2018-11-05', tage: -3, pruefer: HOFFMANN },
  { nr: 10, plate: 'MU-MB 150', name: 'Tandemanhänger 2,7 t', type: 'anhaenger', ez: '2017-05-22', tage: 344, pruefer: LANGE },
  { nr: 11, plate: 'MU-MB 151', name: 'Tieflader-Anhänger', type: 'anhaenger', ez: '2015-07-08', tage: 6, pruefer: LANGE },
  { nr: 12, plate: 'STAPLER 1', name: 'Gabelstapler Lagerhalle', type: 'stapler', ez: null, tage: 128, pruefer: LANGE },
  { nr: 13, plate: 'STAPLER 2', name: 'Teleskoplader Baustelle', type: 'stapler', ez: null, tage: null, pruefer: LANGE },
];

const fz = (nr: number) => bsp(3, nr);
const vehicle: Zeile[] = FAHRZEUGE.map((f) => ({
  id: fz(f.nr),
  org_id: ORG,
  plate: f.plate,
  name: f.name,
  type: f.type,
  first_registration: f.ez,
  last_uvv: f.tage == null ? null : letzte(12, f.tage),
  created_at: f.tage == null ? vor(16, 14, 5) : SEIT,
  updated_at: f.tage == null ? vor(16, 14, 5) : vor(Math.max(1, 365 - (f.tage ?? 0)), 15, 30),
}));

// ---------------------------------------------------------------------------- UVV-Prüfungen

const ALLE_OK = Object.fromEntries(CHECK_ITEMS.map((c) => [c.id, true]));
const mit = (fehler: string[]) => ({ ...ALLE_OK, ...Object.fromEntries(fehler.map((f) => [f, false])) });

const uvv_inspection: Zeile[] = [];
let uvvNr = 0;
function uvv(fNr: number, datum: string, result: 'bestanden' | 'maengel' | 'nicht_bestanden', pruefer: string, fehler: string[] = [], defects: string | null = null, hh = 9, mm = 30) {
  uvvNr++;
  const created = um(datum, hh, mm);
  uvv_inspection.push({
    id: bsp(4, uvvNr),
    org_id: ORG,
    vehicle_id: fz(fNr),
    date: datum,
    inspector: pruefer,
    result,
    defects,
    checklist: mit(fehler),
    created_at: created,
    received_at: new Date(Date.parse(created) + 2 * 60_000).toISOString(),
  });
}

// Je Fahrzeug: die bestandene Prüfung, die die Frist setzt, und die vom Jahr davor
FAHRZEUGE.forEach((f, i) => {
  if (f.tage == null) return;
  const last = letzte(12, f.tage);
  uvv(f.nr, zurueck(last, 12, 2), 'bestanden', f.pruefer, [], null, 8 + (i % 4), 10 + (i * 7) % 40);
  uvv(f.nr, last, 'bestanden', f.pruefer, [], null, 9 + (i % 5), 5 + (i * 11) % 50);
});

// Mängel bei der Prüfung, zwei Tage später behoben und bestanden (Tandemanhänger)
uvv(10, zurueck(letzte(12, 344), 0, 2), 'maengel', LANGE, ['beleuchtung', 'aufbau'], 'Rückleuchte links ohne Funktion, Zurrösen an der Bordwand lose. Instand gesetzt, Nachprüfung angesetzt.', 10, 15);
// Kastenwagen: Verbandkasten abgelaufen (Mängel), Frist inzwischen überschritten — Nachprüfung steht aus
uvv(9, letzte(0, -6), 'maengel', HOFFMANN, ['ausruestung', 'reifen'], 'Verbandkasten abgelaufen, Reifen hinten rechts mit Schnitt in der Flanke. Reifenwechsel beauftragt, Nachprüfung danach.', 14, 20);
// Kipper 7,5 t: Frist abgelaufen, Prüfung nicht bestanden — stillgelegt bis zur Reparatur
uvv(5, letzte(0, -2), 'nicht_bestanden', LANGE, ['bremsen', 'fluessigkeiten'], 'Feststellbremse ohne ausreichende Wirkung, Ölverlust am Getriebe. Fahrzeug stillgelegt, Werkstatttermin vereinbart.', 7, 45);

// ---------------------------------------------------------------------------- Fahrer + Führerscheinkontrollen

interface D {
  nr: number;
  name: string;
  klassen: string;
  monate: number;
  /** Tage bis zur nächsten Kontrolle (negativ = überfällig); null = noch nie kontrolliert */
  tage: number | null;
  aktiv?: boolean;
}

const FAHRER: D[] = [
  { nr: 1, name: 'M. Becker', klassen: 'B, BE, C1, C1E', monate: 6, tage: 120 },
  { nr: 2, name: 'J. Fischer', klassen: 'B, BE', monate: 6, tage: 9 },
  { nr: 3, name: 'A. Weber', klassen: 'B, C, CE', monate: 6, tage: -14 },
  { nr: 4, name: 'L. Meyer', klassen: 'B', monate: 6, tage: 63 },
  { nr: 5, name: 'T. Schulz', klassen: 'B, BE, C1', monate: 6, tage: 172 },
  { nr: 6, name: 'D. Koch', klassen: 'B, C, CE', monate: 6, tage: 18 },
  { nr: 7, name: 'S. Richter', klassen: 'B', monate: 12, tage: 201 },
  { nr: 8, name: 'P. Klein', klassen: 'B, BE', monate: 6, tage: 44 },
  { nr: 9, name: 'N. Wolf', klassen: 'B, C1', monate: 6, tage: 97 },
  { nr: 10, name: 'F. Schröder', klassen: 'B, BE, C, CE', monate: 6, tage: 151 },
  { nr: 11, name: 'C. Neumann', klassen: 'B', monate: 12, tage: 288 },
  { nr: 12, name: 'R. Schwarz', klassen: 'B, BE', monate: 6, tage: 71 },
  { nr: 13, name: 'E. Zimmermann', klassen: 'B', monate: 6, tage: null },
  { nr: 14, name: 'B. Krüger', klassen: 'B, C1', monate: 6, tage: 160 },
  { nr: 15, name: 'H. Braun', klassen: 'B', monate: 6, tage: -260, aktiv: false },
  { nr: 16, name: 'G. Lange', klassen: 'B, BE', monate: 6, tage: -410, aktiv: false },
];

const fa = (nr: number) => bsp(5, nr);
const driver: Zeile[] = FAHRER.map((d) => ({
  id: fa(d.nr),
  org_id: ORG,
  name: d.name,
  license_classes: d.klassen,
  check_interval_months: d.monate,
  last_check: d.tage == null ? null : letzte(d.monate, d.tage),
  active: d.aktiv ?? true,
  created_at: d.tage == null ? vor(11, 10, 20) : SEIT,
  updated_at: d.tage == null ? vor(11, 10, 20) : vor(3, 16, 40),
}));

// Kontrollen: Fuhrparkleitung (S. Wagner) in der App — das Foto bleibt dort auf dem Gerät, photo_uri ist der lokale Pfad
// (DriverDetail.tsx zeigt nur „Foto auf dem Kontroll-Gerät“). Vereinzelt der Inhaber (A. Schneider) im Browser „Vor Ort“:
// ohne Foto, photo_uri leer (vorOrt/rows.ts).
const license_check: Zeile[] = [];
let lcNr = 0;
FAHRER.forEach((d, i) => {
  if (d.tage == null) return;
  const last = letzte(d.monate, d.tage);
  for (const [k, datum] of [[1, zurueck(last, d.monate, 1)], [0, last]] as const) {
    lcNr++;
    const created = um(datum, 7 + (i % 3), 10 + ((i * 13 + k * 7) % 45));
    license_check.push({
      id: bsp(6, lcNr),
      org_id: ORG,
      driver_id: fa(d.nr),
      date: datum,
      checked_by: i % 5 === 3 ? 'A. Schneider' : 'S. Wagner',
      photo_uri: i % 5 === 3 ? null : `file:///data/user/0/kfzdex/files/fuehrerschein/${bsp(6, lcNr).slice(-6)}.jpg`,
      created_at: created,
      received_at: new Date(Date.parse(created) + 60_000).toISOString(),
    });
  }
});

export const daten: BeispielDaten = {
  app: 'kfzdex',
  nutzer: { id: INHABER, email: 'inhaber@musterbau.example' },
  tabellen: { org, org_member, vehicle, driver, uvv_inspection, license_check },
  rpc: {
    // KfzDex: EIN dauerhafter Einladungscode je Betrieb, team_code() liefert den Text (src/kfzdex/api.ts → fetchKfzTeamCode)
    team_code: () => 'K7F3-X2M9',
    renew_invite_code: () => 'R4D8-P6WQ',
  },
};
