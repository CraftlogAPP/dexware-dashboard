// KfzDex — Fahrzeuge bzw. Fahrer aus einer Excel-/CSV-Liste übernehmen (zwei Adapter, je ein Knopf auf der Seite
// „Fahrzeuge“ bzw. „Fahrer“). Gegenstück zur Fuhrpark-Liste (exportLists.ts → fleetSheets): die Spalten der Blätter
// „Fahrzeuge“ und „Fahrer“ werden wieder erkannt. Reine Logik ohne React; Oberfläche components/ImportWizard.tsx,
// Lesen der Liste lib/tableImport.ts.
//
// Regeln:
//  - Pflicht: Kennzeichen bzw. Name. Kennzeichen werden wie in der App groß geschrieben und zum Vergleichen ohne
//    Leer- und Bindestriche verglichen („W-12345 A“ = „w 12345a“); widersprechen sich die Bezirke vor dem Trennzeichen
//    („M-AB 123“ / „MA-B 123“), sind es zwei Fahrzeuge. Fahrernamen in beliebiger Wortfolge („Huber, Max“ = „Max Huber“).
//  - Schon vorhanden = gleiches Kennzeichen bzw. gleicher Name im Betrieb (abgewählt, anhakbar — die App fragt beim
//    doppelten Kennzeichen auch nur nach). Doppelte Zeilen in der Liste: nur die erste ist angehakt.
//  - „Letzte UVV“ / „Letzte Kontrolle“ legen KEINE Prüfung bzw. Kontrolle an (Nachweise entstehen nur in der App bzw.
//    „Vor Ort“). Das Datum wird wie im Formular in „Letzte bestandene UVV“ bzw. „Letzte Führerscheinkontrolle“
//    eingetragen (Fahrzeug und Fahrer haben kein Notizfeld; App und Dashboard bieten genau dieses Feld beim Anlegen an),
//    daraus rechnet KfzDex die Fälligkeit. Ein Datum in der Zukunft wird wie in der App nicht übernommen.
//  - Gratis-Grenze wie beim Anlegen von Hand (vorOrt/backend.ts → fleetGate): 1 Fahrzeug, 2 Fahrer (alle zählen).
//  - Rechte wie Formular und Server: jedes Mitglied des Betriebs darf Fahrzeuge und Fahrer anlegen.
//  - Geschrieben wird EXAKT wie die Formulare (api.ts → vehicleRow/driverRow), mit festen ids.

import type { SupabaseClient } from '@supabase/supabase-js';
import { todayLocalISO } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { orgProFuerGrenze } from '../lib/proStand';
import {
  cap,
  cellOf,
  cmpKey,
  countStatus,
  dataRows,
  headerKey,
  insertInChunks,
  oneLine,
  pickOption,
  type ImportAdapter,
  type ImportField,
  type ImportPlan,
  type ImportPlanRow,
  type ImportResult,
  type Mapping,
  type Table,
} from '../lib/tableImport';
import { dayIso, dayText, monthsFromCell, textOrNull } from '../lib/importValues';
import { downloadXlsx, type XlsxSheet } from '../lib/xlsx';
import { norm } from '../installateurdex/importer';
import {
  driverRow,
  fetchDrivers,
  fetchVehicles,
  insertDrivers,
  insertVehicles,
  normPlate,
  vehicleRow,
  type DriverInput,
  type DriverRow,
  type VehicleInput,
  type VehicleRow,
} from './api';
import { GATE_TEXT, fleetGate } from './vorOrt/backend';
import { FREE_LIMITS, UVV_INTERVAL_MONTHS } from './vorOrt/rows';
import { VEHICLE_TYPE_LABEL, type Driver, type Vehicle, type VehicleType } from './types';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
const STRIP = /^[^:]+ konnten nicht angelegt werden: /;

// ============================================================================ Werte

/** Kennzeichen aus der Liste — dieselbe Schreibweise wie Formular und App (api.ts → normPlate). */
export const cleanPlate = (raw: string) => cap(normPlate(oneLine(raw)), 30);

/** Vergleichsform eines Kennzeichens: nur Buchstaben/Ziffern („W-12345 A“ → „w12345a“). */
export const plateKey = (p: string) => norm(p).replace(/[^a-z0-9]/g, '');

/** Bezirk vor dem ersten Trenner („M-AB 123“ → „m“, „GU 123 AB“ → „gu“) — ohne Trenner unbekannt. */
function plateRegion(p: string): string | null {
  const m = /^\s*([a-zäöü]{1,3})\s*[-–.\s]/i.exec(p);
  return m ? norm(m[1]) : null;
}

/** Gleiches Kennzeichen? Gleiche Zeichenfolge — außer die Bezirke widersprechen sich („M-AB 123“ ≠ „MA-B 123“). */
export function samePlate(a: string, b: string): boolean {
  if (plateKey(a) !== plateKey(b) || !plateKey(a)) return false;
  const ra = plateRegion(a);
  const rb = plateRegion(b);
  return !(ra && rb && ra !== rb);
}

/** Vergleichsform eines Namens: Wörter sortiert („Huber, Max“ = „Max Huber“). */
export const personKey = (name: string) => cmpKey(name).split(' ').filter(Boolean).sort().join(' ');

const TYPE_OPTIONS = (Object.keys(VEHICLE_TYPE_LABEL) as VehicleType[]).map((t) => ({ value: t, label: VEHICLE_TYPE_LABEL[t] }));
/** Vorgabe des Formulars „Fahrzeug anlegen“ */
export const VEHICLE_TYPE_DEFAULT: VehicleType = 'pkw';

/** Andere Schreibweisen der Fahrzeugtypen (Fuhrpark-Listen, Fahrzeugschein-Klassen) */
const TYPE_SYNONYMS: Record<VehicleType, string[]> = {
  pkw: ['pkw', 'auto', 'personenkraftwagen', 'personenwagen', 'kombi', 'limousine', 'suv', 'kleinwagen', 'dienstwagen', 'firmenwagen', 'eauto', 'elektroauto', 'm1'],
  transporter: ['transporter', 'kleintransporter', 'lieferwagen', 'kastenwagen', 'kleinbus', 'minibus', 'bus', 'van', 'sprinter', 'pritschenwagen', 'kleinlaster', 'n1'],
  lkw: ['lkw', 'lastkraftwagen', 'lastwagen', 'laster', 'sattelzug', 'sattelzugmaschine', 'zugmaschine', 'kipper', 'muellwagen', 'n2', 'n3'],
  anhaenger: ['anhaenger', 'haenger', 'auflieger', 'sattelauflieger', 'trailer', 'wohnwagen', 'caravan', 'tieflader', 'o1', 'o2', 'o3', 'o4'],
  stapler: ['stapler', 'gabelstapler', 'flurfoerderzeug', 'hubwagen', 'elektrostapler', 'dieselstapler', 'teleskopstapler', 'hochhubwagen', 'kommissionierer'],
  sonstig: ['sonstiges', 'sonstige', 'sonstig', 'andere', 'anderes', 'traktor', 'bagger', 'radlader', 'arbeitsmaschine', 'kehrmaschine', 'motorrad', 'quad'],
};

/** Ein Datum aus der Liste für „Letzte UVV“ / „Letzte Kontrolle“ / „Erstzulassung“: ISO-Tag oder Hinweis. */
function pastDay(raw: string, label: string, hints: string[]): string | null {
  const t = oneLine(raw);
  if (!t) return null;
  const d = dayIso(t);
  if (!d) {
    hints.push(`${label} „${t}“ ist kein Datum — leer gelassen`);
    return null;
  }
  if (d > todayLocalISO()) {
    hints.push(`${label} ${dayText(d)} liegt in der Zukunft — leer gelassen`);
    return null;
  }
  return d;
}

/** Steht `part` als ganze Wörter in `text`? („VW“ in „VW Crafter“ ja, „MAN“ in „Mannschaftsbus“ nein) */
const hasWords = (text: string, part: string) => ` ${cmpKey(text)} `.includes(` ${cmpKey(part)} `);

/** Sieht die Kopfzeile nach dem anderen Blatt aus? (Fahrer-Liste beim Fahrzeug-Import und umgekehrt) */
const headerHas = (header: string[], keys: string[]) => header.some((h) => keys.includes(headerKey(h)));

// ============================================================================ Fahrzeuge

export const V = { plate: 'plate', name: 'name', make: 'make', type: 'type', first: 'first_registration', uvv: 'last_uvv' } as const;

/** Felder in der Reihenfolge des Formulars — Überschriften wie Formular und Fuhrpark-Liste (Blatt „Fahrzeuge“) */
export const VEHICLE_FIELDS: ImportField[] = [
  {
    key: V.plate,
    label: 'Kennzeichen',
    hint: 'Pflicht',
    exact: ['kennzeichen', 'amtlicheskennzeichen', 'kfzkennzeichen', 'polizeilicheskennzeichen', 'nummernschild', 'kennz', 'kfzkennz', 'kfz', 'kfznummer'],
    prefix: ['kennzeichen', 'amtlkennz', 'kfzkennz'],
  },
  {
    key: V.name,
    label: 'Bezeichnung',
    hint: 'z. B. Sprinter Bau',
    exact: ['bezeichnung', 'fahrzeugbezeichnung', 'fahrzeug', 'name', 'modell', 'markemodell', 'handelsbezeichnung', 'typbezeichnung', 'fahrzeugname'],
    prefix: ['bezeichnung', 'fahrzeugbez', 'modell'],
  },
  {
    key: V.make,
    label: 'Marke',
    hint: 'kommt vor die Bezeichnung',
    exact: ['marke', 'hersteller', 'fabrikat'],
    prefix: ['marke', 'hersteller'],
  },
  {
    key: V.type,
    label: 'Typ',
    hint: 'Pkw, Transporter, Lkw, Anhänger, Stapler oder Sonstiges',
    exact: ['typ', 'fahrzeugtyp', 'art', 'fahrzeugart', 'kategorie', 'fahrzeugklasse', 'fahrzeugkategorie', 'aufbau'],
    prefix: ['fahrzeugtyp', 'fahrzeugart'],
  },
  {
    key: V.first,
    label: 'Erstzulassung',
    exact: ['erstzulassung', 'ez', 'erstzulassungam', 'datumerstzulassung', 'zulassung', 'zugelassen', 'zulassungsdatum', 'erstezulassung'],
    prefix: ['erstzulassung', 'zulassung'],
  },
  {
    key: V.uvv,
    label: 'Letzte UVV (bestanden)',
    hint: 'wie im Formular „Letzte bestandene UVV“ — keine Prüfung',
    exact: ['letzteuvvbestanden', 'letzteuvv', 'letztebestandeneuvv', 'uvv', 'uvvam', 'uvvpruefung', 'letzteuvvpruefung', 'uvvgeprueftam', 'uvvzuletzt', 'uvvdatum', 'datumuvv', 'letzteuvvam'],
    prefix: ['letzteuvv', 'letztebestandeneuvv', 'uvvpruef', 'uvvgeprueft'],
    weak: ['letztepruefung', 'zuletztgeprueft'],
    notIf: /faellig|naechste|anzahl|pruefungen|ergebnis/,
  },
];

export interface VehiclePlanArgs {
  table: Pick<Table, 'rows' | 'lines'>;
  hasHeader: boolean;
  mapping: Mapping;
  vehicles: readonly Vehicle[];
}

export function planVehicles(args: VehiclePlanArgs): ImportPlan<VehicleInput> {
  const typeColumn = args.mapping[V.type] !== undefined;
  const inFile: { plate: string; line: number }[] = [];
  const rows = dataRows(args.table, args.hasHeader).map(({ cells, line }, i): ImportPlanRow<VehicleInput> => {
    const get = (key: string) => cellOf(cells, args.mapping, key);
    const plate = cleanPlate(get(V.plate));
    const row: ImportPlanRow<VehicleInput> = { i, line, status: 'ok', reason: '', title: plate, sub: '', cells: ['', ''], hints: [], payload: null };
    if (!plate) {
      row.status = 'skip';
      row.reason = 'Kennzeichen fehlt';
      row.title = cap(oneLine(get(V.name)), 120);
      return row;
    }
    // Bezeichnung: Marke davor, wenn sie nicht schon drinsteht („VW“ + „Crafter“ → „VW Crafter“)
    const nameCell = oneLine(get(V.name));
    const make = oneLine(get(V.make));
    const name = textOrNull(make && !hasWords(nameCell, make) ? `${make} ${nameCell}` : nameCell, 120);
    const typeRaw = oneLine(get(V.type));
    const t = pickOption(typeRaw, TYPE_OPTIONS, TYPE_SYNONYMS, 'sonstig');
    const type: VehicleType = t.how === 'empty' ? VEHICLE_TYPE_DEFAULT : (t.value as VehicleType);
    if (t.how === 'unknown') row.hints.push(`Typ „${typeRaw}“ unbekannt → ${VEHICLE_TYPE_LABEL.sonstig}`);
    if (t.how === 'empty' && typeColumn) row.hints.push(`Typ fehlt → ${VEHICLE_TYPE_LABEL[VEHICLE_TYPE_DEFAULT]}`);
    const input: VehicleInput = {
      plate,
      name,
      type,
      first_registration: pastDay(get(V.first), 'Erstzulassung', row.hints),
      last_uvv: pastDay(get(V.uvv), 'Letzte UVV', row.hints),
    };
    row.sub = name ?? '';
    row.cells = [VEHICLE_TYPE_LABEL[type], input.last_uvv ? dayText(input.last_uvv) : ''];
    row.payload = input;

    if (args.vehicles.some((v) => samePlate(v.plate, plate))) {
      row.status = 'exists';
      row.reason = 'schon vorhanden';
      return row;
    }
    const twin = inFile.find((x) => samePlate(x.plate, plate));
    if (twin) {
      row.status = 'dup';
      row.reason = `doppelt in der Liste (wie Zeile ${twin.line})`;
      return row;
    }
    inFile.push({ plate, line });
    return row;
  });
  const notes: string[] = [];
  const header = args.hasHeader ? (args.table.rows[0] ?? []) : [];
  if (args.mapping[V.plate] === undefined && headerHas(header, ['fahrer', 'fahrername', 'vorname', 'nachname', 'fuehrerscheinklassen', 'letztekontrolle'])) {
    notes.push('Das sieht nach einer Fahrer-Liste aus — Fahrer importierst du auf der Seite „Fahrer“.');
  }
  if (!typeColumn && rows.some((r) => r.payload)) {
    notes.push(`Die Liste hat keine Spalte „Typ“ — die Fahrzeuge werden als ${VEHICLE_TYPE_LABEL[VEHICLE_TYPE_DEFAULT]} angelegt (später je Fahrzeug änderbar).`);
  }
  return { rows, count: countStatus(rows), notes };
}

// ============================================================================ Fahrer

export const D = { name: 'name', first: 'firstName', classes: 'license_classes', interval: 'check_interval_months', last: 'last_check', active: 'active' } as const;

/** Vorgabe des Formulars „Fahrer anlegen“ */
export const CHECK_INTERVAL_DEFAULT = 6;

export const DRIVER_FIELDS: ImportField[] = [
  {
    key: D.name,
    label: 'Name',
    hint: 'Pflicht',
    exact: ['name', 'fahrer', 'fahrername', 'fahrerin', 'mitarbeiter', 'mitarbeitername', 'mitarbeiterin', 'vornamenachname', 'nachnamevorname', 'vollername', 'nachname', 'familienname', 'zuname', 'person'],
    prefix: ['fahrername', 'name', 'mitarbeitername'],
    notIf: /kennzeichen|fahrzeug|firma|kontrolliert|kunde/,
  },
  {
    key: D.first,
    label: 'Vorname',
    hint: 'wird vor den Namen gesetzt',
    exact: ['vorname', 'vornamen', 'rufname'],
  },
  {
    key: D.classes,
    label: 'Führerscheinklassen',
    hint: 'z. B. B, BE, C1',
    exact: ['fuehrerscheinklassen', 'fuehrerscheinklasse', 'klassen', 'klasse', 'fsklassen', 'fsklasse', 'fuehrerschein', 'fahrerlaubnisklassen', 'fahrerlaubnis', 'fahrerlaubnisklasse'],
    prefix: ['fuehrerscheinkl', 'fahrerlaubnis', 'klasse'],
    notIf: /datum|gueltig|bis$|kontrolle|nummer|nr$|ausgestellt/,
  },
  {
    key: D.interval,
    label: 'Intervall (Monate)',
    hint: `leer = ${CHECK_INTERVAL_DEFAULT} Monate (wie im Formular)`,
    exact: ['intervallmonate', 'intervall', 'kontrollintervall', 'kontrollintervallmonate', 'pruefintervall', 'pruefintervallmonate', 'turnus', 'kontrollturnus'],
    prefix: ['intervall', 'kontrollintervall'],
  },
  {
    key: D.last,
    label: 'Letzte Kontrolle',
    hint: 'wie im Formular „Letzte Führerscheinkontrolle“ — keine Kontrolle',
    exact: ['letztekontrolle', 'letztefuehrerscheinkontrolle', 'fuehrerscheinkontrolle', 'zuletztkontrolliert', 'kontrolliertam', 'letztekontrolleam', 'kontrolldatum', 'letzteskontrolldatum', 'datumletztekontrolle'],
    prefix: ['letztekontrolle', 'letztefuehrerscheinkontrolle'],
    weak: ['letztepruefung', 'geprueftam'],
    notIf: /faellig|naechste|von$|durch/,
  },
  {
    key: D.active,
    label: 'Aktiv',
    hint: 'leer = aktiv; „inaktiv“ oder „nein“ = inaktiv',
    exact: ['aktiv', 'aktivinaktiv', 'status', 'beschaeftigt'],
  },
];

/** „Aktiv“-Spalte: aktiv/ja/x → true, inaktiv/nein/ausgeschieden → false, leer → true (wie das Formular), sonst null. */
export function activeOf(raw: string): boolean | null {
  const k = headerKey(raw);
  if (!k || ['aktiv', 'ja', 'j', 'x', 'yes', '1', 'true', 'wahr', 'beschaeftigt', 'imdienst'].includes(k)) return true;
  if (['inaktiv', 'nein', 'n', 'no', '0', 'false', 'falsch', 'ausgeschieden', 'ehemalig', 'nichtaktiv', 'gekuendigt', 'ruhend'].includes(k)) return false;
  return null;
}

/** Führerscheinklassen ordnen: „b/be/c1“ → „B, BE, C1“; Freitext bleibt, wie er ist. */
export function licenseClassesOf(raw: string): string | null {
  const t = oneLine(raw);
  if (!t) return null;
  if (/^[a-z0-9]{1,4}(?:\s*[,;/+&]\s*[a-z0-9]{1,4}|\s+[a-z0-9]{1,4})*$/i.test(t)) {
    return cap(t.split(/[\s,;/+&]+/).filter(Boolean).map((c) => c.toUpperCase()).join(', '), 60);
  }
  return cap(t, 60);
}

export interface DriverPlanArgs {
  table: Pick<Table, 'rows' | 'lines'>;
  hasHeader: boolean;
  mapping: Mapping;
  drivers: readonly Driver[];
}

export function planDrivers(args: DriverPlanArgs): ImportPlan<DriverInput> {
  const known = new Set(args.drivers.map((d) => personKey(d.name)));
  const inFile = new Map<string, number>();
  const rows = dataRows(args.table, args.hasHeader).map(({ cells, line }, i): ImportPlanRow<DriverInput> => {
    const get = (key: string) => cellOf(cells, args.mapping, key);
    // Vorname davor, wenn er nicht schon im Namen steht („Max“ + „Huber“ → „Max Huber“)
    const last = oneLine(get(D.name));
    const first = oneLine(get(D.first));
    const full = first && !hasWords(last, first) ? `${first} ${last}`.trim() : last || first;
    const name = cap(full, 120);
    const row: ImportPlanRow<DriverInput> = { i, line, status: 'ok', reason: '', title: name, sub: '', cells: ['', ''], hints: [], payload: null };
    if (!name) {
      row.status = 'skip';
      row.reason = 'Name fehlt';
      return row;
    }
    const intervalRaw = oneLine(get(D.interval));
    let interval = CHECK_INTERVAL_DEFAULT;
    if (intervalRaw) {
      const n = monthsFromCell(intervalRaw, 60);
      if (n === null) row.hints.push(`Intervall „${intervalRaw}“ nicht erkannt → ${CHECK_INTERVAL_DEFAULT} Monate`);
      else interval = n;
    }
    const activeRaw = oneLine(get(D.active));
    let active = activeOf(activeRaw);
    if (active === null) {
      row.hints.push(`„${activeRaw}“ unter „Aktiv“ nicht erkannt → aktiv`);
      active = true;
    }
    const input: DriverInput = {
      name,
      license_classes: licenseClassesOf(get(D.classes)),
      check_interval_months: interval,
      last_check: pastDay(get(D.last), 'Letzte Kontrolle', row.hints),
      active,
    };
    row.sub = [active ? 'aktiv' : 'inaktiv', `Kontrolle alle ${interval} Monate`].join(' · ');
    row.cells = [input.license_classes ?? '', input.last_check ? dayText(input.last_check) : ''];
    row.payload = input;

    const key = personKey(name);
    if (known.has(key)) {
      row.status = 'exists';
      row.reason = 'schon vorhanden';
      return row;
    }
    const twin = inFile.get(key);
    if (twin !== undefined) {
      row.status = 'dup';
      row.reason = `doppelt in der Liste (wie Zeile ${twin})`;
      return row;
    }
    inFile.set(key, line);
    return row;
  });
  const notes: string[] = [];
  const header = args.hasHeader ? (args.table.rows[0] ?? []) : [];
  if (args.mapping[D.name] === undefined && headerHas(header, ['kennzeichen'])) {
    notes.push('Das ist die Fahrzeug-Liste. Aus der Fuhrpark-Datei bitte das Blatt „Fahrer“ öffnen, die Tabelle markieren, kopieren und oben einfügen.');
  }
  return { rows, count: countStatus(rows), notes };
}

// ============================================================================ Anlegen (gemeinsam)

/** Lesen und Schreiben — im Betrieb die api.ts, im Test nachgebaut. */
export interface FleetImportApi {
  fetchVehicles(sb: SupabaseClient): Promise<Vehicle[]>;
  fetchDrivers(sb: SupabaseClient): Promise<Driver[]>;
  insertVehicles(sb: SupabaseClient, rows: VehicleRow[]): Promise<void>;
  insertDrivers(sb: SupabaseClient, rows: DriverRow[]): Promise<void>;
}

export const FLEET_IMPORT_API: FleetImportApi = { fetchVehicles, fetchDrivers, insertVehicles, insertDrivers };

export type FleetKind = 'vehicle' | 'driver';

export interface FleetImportData<T> {
  /** vorhandene Fahrzeuge bzw. Fahrer */
  existing: T[];
  /** im Bestand laut Server (Gratis-Grenze — wie in der App zählen alle, auch inaktive Fahrer) */
  count: number;
  pro: boolean;
  allowance: number | null;
}

const LIMIT: Record<FleetKind, number> = { vehicle: FREE_LIMITS.vehicles, driver: FREE_LIMITS.drivers };

/** Wie viele der Import anlegen darf: mit Pro unbegrenzt, sonst bis zur Gratis-Grenze. */
export function fleetAllowance(kind: FleetKind, pro: boolean, count: number): number | null {
  return pro ? null : Math.max(0, LIMIT[kind] - count);
}

export async function loadVehicleImport(sb: SupabaseClient, api: FleetImportApi = FLEET_IMPORT_API): Promise<FleetImportData<Vehicle>> {
  const [existing, gate, pro] = await Promise.all([api.fetchVehicles(sb), fleetGate(sb, 'vehicle', LIMIT.vehicle), orgProFuerGrenze(sb, 'kfzdex')]);
  return { existing, count: gate.count, pro, allowance: fleetAllowance('vehicle', pro, gate.count) };
}

export async function loadDriverImport(sb: SupabaseClient, api: FleetImportApi = FLEET_IMPORT_API): Promise<FleetImportData<Driver>> {
  const [existing, gate, pro] = await Promise.all([api.fetchDrivers(sb), fleetGate(sb, 'driver', LIMIT.driver), orgProFuerGrenze(sb, 'kfzdex')]);
  return { existing, count: gate.count, pro, allowance: fleetAllowance('driver', pro, gate.count) };
}

/**
 * Was beim Klick wirklich angelegt wird — gegen die frisch geladenen Fahrzeuge/Fahrer und die frische Pro-Auskunft:
 * angehakte Zeilen in Listen-Reihenfolge, ohne inzwischen Vorhandenes (bewusst angehakte „schon vorhanden“ bleiben),
 * höchstens bis zur Gratis-Grenze.
 */
export function finalizeFleet<P>(
  plan: ImportPlan<P>,
  selected: ReadonlySet<number>,
  isKnown: (p: P) => boolean,
  allowance: number | null,
): { rows: ImportPlanRow<P>[]; already: number; overLimit: number } {
  let already = 0;
  const wanted: ImportPlanRow<P>[] = [];
  for (const r of plan.rows) {
    if (!r.payload || !selected.has(r.i)) continue;
    if (r.status !== 'exists' && isKnown(r.payload)) {
      already++;
      continue;
    }
    wanted.push(r);
  }
  const rows = allowance === null ? wanted : wanted.slice(0, allowance);
  return { rows, already, overLimit: wanted.length - rows.length };
}

interface KindText {
  one: string;
  many: string;
  /** „das erste“ / „den ersten“ */
  first: string;
  /** „war“-Satz: „1 Fahrzeug war“ */
  wasOne: string;
  wasMany: string;
  gate: string;
}

const TEXT: Record<FleetKind, KindText> = {
  vehicle: { one: 'Fahrzeug', many: 'Fahrzeuge', first: 'das erste', wasOne: 'Fahrzeug war', wasMany: 'Fahrzeuge waren', gate: GATE_TEXT.vehicle },
  driver: { one: 'Fahrer', many: 'Fahrer', first: 'der erste', wasOne: 'Fahrer war', wasMany: 'Fahrer waren', gate: GATE_TEXT.driver },
};

function limitText(kind: FleetKind, count: number, allowance: number): string {
  const t = TEXT[kind];
  return `${
    allowance === 0
      ? `Dein Betrieb hat die Gratis-Grenze schon erreicht (${plural(count, t.one, t.many)}) — angelegt wird jetzt nichts.`
      : `Angelegt ${allowance === 1 ? 'wird' : 'werden'} jetzt nur ${allowance === 1 ? t.first : `die ersten ${allowance}`} der Auswahl.`
  } ${t.gate}`;
}

async function writeRows<P, R extends { id: string }>(
  kind: FleetKind,
  fin: { rows: ImportPlanRow<P>[]; already: number; overLimit: number },
  toRow: (p: P) => R,
  insert: (rows: R[]) => Promise<void>,
  progress: (p: { label: string; done: number; total: number }) => void,
): Promise<ImportResult> {
  const t = TEXT[kind];
  const items = fin.rows.map((r) => ({ r, row: toRow(r.payload!) }));
  const res = await insertInChunks(
    items,
    (part) => insert(part.map((x) => x.row)),
    (x) => ({ line: x.r.line, name: x.r.title }),
    { strip: STRIP, progress: (done) => progress({ label: `${t.many} werden angelegt …`, done, total: items.length }) },
  );
  const notes: string[] = [];
  if (fin.already) notes.push(`${plural(fin.already, t.wasOne, t.wasMany)} inzwischen schon vorhanden und ${fin.already === 1 ? 'wurde' : 'wurden'} nicht noch einmal angelegt.`);
  if (fin.overLimit) notes.push(`${plural(fin.overLimit, t.one, t.many)} nicht angelegt — Gratis-Grenze erreicht.`);
  return { created: res.ok.length, failed: res.failed, notes };
}

// ============================================================================ Adapter für den Wizard

export function vehicleImportAdapter(sb: SupabaseClient, org: Org, data: FleetImportData<Vehicle>, api: FleetImportApi = FLEET_IMPORT_API): ImportAdapter<VehicleInput> {
  return {
    noun: { one: 'Fahrzeug', many: 'Fahrzeuge' },
    fields: VEHICLE_FIELDS,
    required: [V.plate],
    fallbackMapping: { [V.plate]: 0 },
    columns: ['Typ', 'Letzte UVV'],
    notice: `UVV-Prüfungen werden nicht übernommen: Eine Prüfung ist ein Nachweis und entsteht nur in der App oder unter „Vor Ort“. Steht in der Liste das Datum der letzten bestandenen UVV, wird es wie im Formular „Letzte bestandene UVV“ eingetragen — daraus rechnet KfzDex die nächste Fälligkeit (alle ${UVV_INTERVAL_MONTHS} Monate).`,
    plan: ({ table, hasHeader, mapping }) => planVehicles({ table, hasHeader, mapping, vehicles: data.existing }),
    allowance: data.allowance,
    limitText: (allowance) => limitText('vehicle', data.count, allowance),
    template: () => downloadXlsx('KfzDex_Fahrzeuge_Vorlage', vehicleTemplateSheets(), { title: 'KfzDex Vorlage Fahrzeuge', creator: 'Dexware KfzDex' }),
    async write(plan, selected, _choice, progress) {
      progress({ label: 'Fahrzeuge werden geprüft …', done: 0, total: 0 });
      const fresh = await loadVehicleImport(sb, api);
      const fin = finalizeFleet(plan, selected, (p) => fresh.existing.some((v) => samePlate(v.plate, p.plate)), fresh.allowance);
      return writeRows('vehicle', fin, (p) => vehicleRow(org.id, p), (rows) => api.insertVehicles(sb, rows), progress);
    },
  };
}

export function driverImportAdapter(sb: SupabaseClient, org: Org, data: FleetImportData<Driver>, api: FleetImportApi = FLEET_IMPORT_API): ImportAdapter<DriverInput> {
  return {
    noun: { one: 'Fahrer', many: 'Fahrer' },
    fields: DRIVER_FIELDS,
    required: [D.name],
    fallbackMapping: { [D.name]: 0 },
    columns: ['Führerscheinklassen', 'Letzte Kontrolle'],
    notice:
      'Führerscheinkontrollen werden nicht übernommen: Eine Kontrolle ist ein Nachweis und entsteht nur in der App oder unter „Vor Ort“. Steht in der Liste das Datum der letzten Kontrolle, wird es wie im Formular „Letzte Führerscheinkontrolle“ eingetragen — daraus rechnet KfzDex die nächste Fälligkeit.',
    plan: ({ table, hasHeader, mapping }) => planDrivers({ table, hasHeader, mapping, drivers: data.existing }),
    allowance: data.allowance,
    limitText: (allowance) => limitText('driver', data.count, allowance),
    template: () => downloadXlsx('KfzDex_Fahrer_Vorlage', driverTemplateSheets(), { title: 'KfzDex Vorlage Fahrer', creator: 'Dexware KfzDex' }),
    async write(plan, selected, _choice, progress) {
      progress({ label: 'Fahrer werden geprüft …', done: 0, total: 0 });
      const fresh = await loadDriverImport(sb, api);
      const known = new Set(fresh.existing.map((d) => personKey(d.name)));
      const fin = finalizeFleet(plan, selected, (p) => known.has(personKey(p.name)), fresh.allowance);
      return writeRows('driver', fin, (p) => driverRow(org.id, p), (rows) => api.insertDrivers(sb, rows), progress);
    },
  };
}

// ============================================================================ Vorlagen

export const VEHICLE_EXAMPLES: Record<string, string>[] = [
  { plate: 'G-123 AB', name: 'Crafter Bau', make: 'VW', type: 'Transporter', first_registration: '15.03.2021', last_uvv: '10.02.2026' },
  { plate: 'M-XY 4711', name: 'Octavia Kombi', make: 'Skoda', type: 'Pkw', first_registration: '01.07.2023' },
  { plate: 'GU-456 CD', name: 'Pritsche 7,5 t', make: 'MAN', type: 'Lkw', first_registration: '20.09.2018', last_uvv: '03.11.2025' },
  { plate: 'ST-01', name: 'Gabelstapler Halle 1', make: 'Linde', type: 'Stapler' },
];

export const DRIVER_EXAMPLES: Record<string, string>[] = [
  { name: 'Huber', firstName: 'Max', license_classes: 'B, BE', check_interval_months: '6', last_check: '05.10.2026', active: 'aktiv' },
  { name: 'Berger', firstName: 'Anna', license_classes: 'B, C1, C1E', check_interval_months: '6' },
  { name: 'Gruber', firstName: 'Peter', license_classes: 'B', check_interval_months: '12', active: 'inaktiv' },
];

function info(title: string, lines: [string, string][]): XlsxSheet {
  return {
    name: 'Info',
    table: false,
    landscape: false,
    columns: [{ header: '', width: 26 }, { header: '', width: 90 }],
    rows: [[{ v: title, bold: true }], [], ...lines.map(([k, v]) => [{ v: k, bold: true }, v])],
  };
}

/** Vorlage Fahrzeuge als echte .xlsx: Spalten wie Formular und Fuhrpark-Liste, Beispielzeilen, Blatt „Info“. */
export function vehicleTemplateSheets(): XlsxSheet[] {
  const order = [V.plate, V.make, V.name, V.type, V.first, V.uvv];
  const cols = order.map((k) => VEHICLE_FIELDS.find((f) => f.key === k)!);
  return [
    { name: 'Fahrzeuge', columns: cols.map((f) => ({ header: f.label })), rows: VEHICLE_EXAMPLES.map((r) => cols.map((f) => r[f.key] || null)) },
    info('KfzDex · Vorlage für den Fahrzeug-Import', [
      ['So geht es', 'Je Fahrzeug eine Zeile, die Beispielzeilen überschreiben. Danach im Dashboard unter „Fahrzeuge“ → „Fahrzeuge importieren“ die Datei wählen.'],
      ['Pflicht', 'nur „Kennzeichen“. Alle anderen Spalten dürfen leer bleiben oder fehlen.'],
      ['Kennzeichen', 'Wird groß geschrieben. Schreibweisen wie „W-12345 A“ und „w 12345a“ gelten als dasselbe Fahrzeug — Vorhandenes wird nicht doppelt angelegt.'],
      ['Typ', 'Pkw, Transporter, Lkw, Anhänger, Stapler oder Sonstiges. Andere Wörter wie „Kastenwagen“ oder „Gabelstapler“ werden erkannt. Leer = Pkw.'],
      ['Letzte UVV', `Datum der letzten BESTANDENEN UVV-Prüfung, wie im Formular. Es wird keine Prüfung angelegt — Prüfungen entstehen nur in der App. Aus dem Datum rechnet KfzDex die nächste Fälligkeit (alle ${UVV_INTERVAL_MONTHS} Monate). Leer = nie geprüft.`],
      ['Wieder einlesen', 'Auch die Fuhrpark-Liste aus KfzDex (Excel, Blatt „Fahrzeuge“) lässt sich einlesen.'],
    ]),
  ];
}

/** Vorlage Fahrer als echte .xlsx: Spalten wie Formular und Fuhrpark-Liste, Beispielzeilen, Blatt „Info“. */
export function driverTemplateSheets(): XlsxSheet[] {
  const order = [D.first, D.name, D.classes, D.interval, D.last, D.active];
  const cols = order.map((k) => DRIVER_FIELDS.find((f) => f.key === k)!);
  return [
    {
      name: 'Fahrer',
      columns: cols.map((f) => ({ header: f.key === D.name ? 'Nachname' : f.label })),
      rows: DRIVER_EXAMPLES.map((r) => cols.map((f) => r[f.key] || null)),
    },
    info('KfzDex · Vorlage für den Fahrer-Import', [
      ['So geht es', 'Je Fahrer eine Zeile, die Beispielzeilen überschreiben. Danach im Dashboard unter „Fahrer“ → „Fahrer importieren“ die Datei wählen.'],
      ['Pflicht', 'nur der Name. Vor- und Nachname dürfen auch zusammen in einer Spalte „Name“ stehen.'],
      ['Intervall', `Alle wie viele Monate der Führerschein kontrolliert wird. Leer = ${CHECK_INTERVAL_DEFAULT} Monate.`],
      ['Letzte Kontrolle', 'Datum der letzten Führerscheinkontrolle, wie im Formular. Es wird keine Kontrolle angelegt — Kontrollen entstehen nur in der App. Leer = nie kontrolliert.'],
      ['Aktiv', 'Leer oder „aktiv“ = aktiv. „inaktiv“ oder „nein“ = inaktiv (keine Kontrollen fällig).'],
      ['Wieder einlesen', 'Aus der Fuhrpark-Liste von KfzDex das Blatt „Fahrer“ öffnen, die Tabelle markieren, kopieren und beim Import einfügen. Vorhandene Fahrer (gleicher Name) werden erkannt.'],
    ]),
  ];
}
