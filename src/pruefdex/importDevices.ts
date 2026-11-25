// PrüfDex — Geräte (mit Kunde/Standort) aus einer Excel-/CSV-Liste übernehmen. Gegenstück zur Geräteliste
// (exportLists.ts → deviceSheets): deren Spalten werden wieder erkannt. Reine Logik ohne React; Oberfläche
// components/ImportWizard.tsx, Lesen der Liste lib/tableImport.ts. Eigener Adapter — PrüfDex gehört nicht zur
// pruefen-Schicht (Kunden statt Standorte, Etikett im Betrieb eindeutig, kein Notizfeld am Gerät).
//
// Regeln:
//  - Pflicht je Zeile ist die Bezeichnung („Gerät“). Ausgesonderte (Status „ausgesondert“, ein Datum unter
//    „Ausgesondert am“) werden nicht übernommen.
//  - Kunde: Name gegen die vorhandenen Kunden (Vergleichsform cmpKey). Unbekannte werden als neue Kunden mit angelegt
//    (Adresse aus „Kunde-Adresse“). Leere Zelle bzw. keine Spalte: der gewählte Kunde über der Vorschau — oder keiner
//    (wie im Formular darf ein Gerät ohne Kunde sein).
//  - Schon vorhanden: gleiches QR/Etikett oder gleiche Seriennummer im Betrieb, sonst gleiche Bezeichnung beim selben
//    Kunden (nur wenn Etikett bzw. Seriennummer nicht widersprechen — 20 „Monitor“ mit eigenem Etikett sind 20 Geräte).
//    Ein Etikett gibt es laut Server-Regel (unique org_id + qr_code) im Betrieb nur einmal: solche Zeilen lassen sich
//    nicht anhaken. Doppelte Zeilen in der Liste: nur die erste ist angehakt.
//  - Bisherige Prüfungen und Fristen werden NICHT übernommen — weder als Prüfung noch als Frist noch als Vermerk.
//    Prüfungen sind Nachweise und entstehen nur in der App bzw. „Vor Ort“; die Frist am Gerät setzt laut App allein die
//    Prüfung (das Geräteformular der App schreibt next_due_date nie, Server-Trigger und Storno rechnen sie nur aus
//    Prüfungen). Ein Vermerk in der Standort-Notiz ginge ins Prüfprotokoll („Standort“) — dort hat er nichts zu suchen.
//    Die Spalten „Letzte Prüfung“, „Ergebnis …“, „Nächste Prüfung“ werden trotzdem erkannt (damit sie nicht falsch
//    zugeordnet werden) und in der Vorschau als „wird nicht übernommen“ genannt. Neue Geräte stehen auf „ungeprüft“.
//  - Gratis-Grenze wie beim Anlegen von Hand (gate.ts → deviceGate): ohne Pro höchstens so viele, wie noch gehen.
//  - Rechte wie Formular und Server: jedes Mitglied des Betriebs darf Kunden und Geräte anlegen.
//  - Geschrieben wird EXAKT wie die Formulare (api.ts → customerRow/deviceRow), mit festen ids, Kunden zuerst.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Org } from '../lib/orgApi';
import { orgProFuerGrenze } from '../lib/proStand';
import {
  cap,
  cellOf,
  cmpKey,
  countStatus,
  dataRows,
  insertInChunks,
  oneLine,
  parseDay,
  yesNo,
  type ImportAdapter,
  type ImportField,
  type ImportPlan,
  type ImportPlanRow,
  type ImportResult,
  type InsertFailure,
  type Mapping,
  type Table,
} from '../lib/tableImport';
import { monthsFromCell, textOrNull } from '../lib/importValues';
import { downloadXlsx, type XlsxSheet } from '../lib/xlsx';
import {
  customerRow,
  deviceRow,
  fetchCustomers,
  fetchDevices,
  insertCustomers,
  insertDevices,
  type CustomerRow,
  type DeviceInput,
  type DeviceRow,
} from './api';
import { GATE_TEXT, deviceGate } from './gate';
import { skLabel } from './labels';
import { FREE_LIMITS } from './vorOrt/rows';
import type { Customer, Device, ProtectionClass } from './types';

/** Schlüssel der Felder in der Zuordnung */
export const F = {
  name: 'name',
  customer: 'customer',
  customerAddress: 'customerAddress',
  location: 'location_note',
  qr: 'qr_code',
  type: 'device_type',
  manufacturer: 'manufacturer',
  serial: 'serial_number',
  sk: 'protection_class',
  interval: 'interval_months',
  last: 'lastInspection',
  lastResult: 'lastResult',
  next: 'nextDue',
  retired: 'retired',
} as const;

/** Vorgabe des Formulars „Gerät anlegen“ (Richtwert DGUV Vorschrift 3) */
export const INTERVAL_DEFAULT = 6;

// ---------------------------------------------------------------------------- Felder

/**
 * Felder in der Reihenfolge der Zuordnung — Überschriften wie Formular und Geräteliste (Export). Frühere Einträge in
 * `exact` haben Vorrang (in der Geräteliste stehen „Status“ und „Ausgesondert am“: „Status“ entscheidet).
 */
export const DEVICE_FIELDS: ImportField[] = [
  {
    key: F.name,
    label: 'Gerät',
    hint: 'Pflicht — die Bezeichnung, z. B. Bohrmaschine',
    exact: ['geraet', 'geraetebezeichnung', 'bezeichnung', 'geraetename', 'name', 'betriebsmittel', 'artikel', 'artikelbezeichnung', 'gegenstand', 'pruefling'],
    prefix: ['bezeichnung', 'geraetebez'],
  },
  {
    key: F.customer,
    label: 'Kunde/Standort',
    hint: 'unbekannte Kunden werden mit angelegt',
    exact: ['kundestandort', 'kunde', 'kunden', 'kundenname', 'kundename', 'auftraggeber', 'kundestandortname'],
    prefix: ['kunde'],
    notIf: /adresse|anschrift|strasse|plz|nummer|nr$|kontakt|telefon|mail/,
  },
  {
    key: F.customerAddress,
    label: 'Kunde-Adresse',
    hint: 'nur für neue Kunden',
    exact: ['kundeadresse', 'kundenadresse', 'adresse', 'anschrift', 'kundenanschrift', 'adressedeskunden', 'standortadresse'],
    prefix: ['kundenadresse', 'kundeadresse', 'adresse', 'anschrift'],
  },
  {
    key: F.location,
    label: 'Standort-Notiz',
    hint: 'z. B. Werkstatt Regal 3',
    // nicht „Ort“: das ist in Kundenlisten meist der Ort der Adresse (PLZ/Ort)
    exact: ['standortnotiz', 'standort', 'raum', 'raumnummer', 'raumnr', 'abteilung', 'aufstellort', 'einsatzort', 'bereich', 'lagerort', 'gebaeude', 'arbeitsplatz'],
    prefix: ['standortnotiz', 'raum', 'aufstellort'],
    notIf: /adresse|anschrift/,
  },
  {
    key: F.qr,
    label: 'QR/Etikett',
    hint: 'im Betrieb eindeutig',
    exact: ['qretikett', 'qrcode', 'qr', 'etikett', 'etikettnummer', 'etikettnr', 'geraeteid', 'geraeteidqrcode', 'geraetenummer', 'geraetenr', 'inventarnummer', 'inventarnr', 'invnr', 'identnummer', 'identnr', 'barcode', 'prueflingsnummer', 'kennung'],
    prefix: ['qr', 'etikett', 'inventarn', 'geraeteid'],
  },
  {
    key: F.type,
    label: 'Gerätetyp',
    exact: ['geraetetyp', 'typ', 'geraeteart', 'art', 'kategorie', 'geraetekategorie', 'typmodell', 'modell', 'typbezeichnung', 'geraetegruppe'],
    prefix: ['geraetetyp', 'geraeteart'],
  },
  {
    key: F.manufacturer,
    label: 'Hersteller',
    exact: ['hersteller', 'marke', 'fabrikat'],
    prefix: ['hersteller', 'fabrikat'],
  },
  {
    key: F.serial,
    label: 'Seriennummer',
    exact: ['seriennummer', 'seriennr', 'snr', 'sn', 'serialnumber', 'serial', 'fabriknummer', 'fabriknr', 'herstellernummer'],
    prefix: ['seriennummer', 'seriennr', 'fabriknummer'],
  },
  {
    key: F.sk,
    label: 'Schutzklasse',
    hint: 'I, II oder III — auch „SK 1“, „Schutzklasse II“',
    exact: ['schutzklasse', 'sk', 'klasse', 'schutzkl'],
    prefix: ['schutzklasse'],
  },
  {
    key: F.interval,
    label: 'Prüfintervall (Monate)',
    hint: `leer = ${INTERVAL_DEFAULT} Monate (wie im Formular)`,
    exact: ['pruefintervallmonate', 'pruefintervall', 'intervall', 'intervallmonate', 'intervallinmonaten', 'pruefzyklus', 'pruefzyklusmonate', 'prueffristmonate', 'turnus', 'pruefturnus', 'wiederholungsfrist'],
    prefix: ['pruefintervall', 'intervall', 'pruefzyklus', 'prueffristmonat'],
    weak: ['prueffrist'],
  },
  {
    key: F.last,
    label: 'Letzte Prüfung',
    hint: 'wird erkannt, aber nicht übernommen',
    exact: ['letztepruefung', 'letztepruefungam', 'zuletztgeprueft', 'geprueftam', 'pruefdatum', 'datumletztepruefung', 'letztespruefdatum'],
    prefix: ['letztepruefung', 'zuletztgeprueft'],
  },
  {
    key: F.lastResult,
    label: 'Ergebnis letzte Prüfung',
    hint: 'wird erkannt, aber nicht übernommen',
    exact: ['ergebnisletztepruefung', 'ergebnis', 'pruefergebnis', 'befund'],
    prefix: ['ergebnis', 'pruefergebnis'],
  },
  {
    key: F.next,
    label: 'Nächste Prüfung',
    hint: 'wird erkannt, aber nicht übernommen',
    exact: ['naechstepruefungfaelligam', 'naechstepruefung', 'naechstepruefungam', 'faelligam', 'pruefungfaellig', 'faellig', 'naechsterprueftermin', 'naechstertermin', 'faelligkeit', 'wiedervorlage'],
    prefix: ['naechstepruefung', 'faellig'],
  },
  {
    key: F.retired,
    label: 'Ausgesondert',
    hint: '„ausgesondert“ oder ein Datum = wird nicht übernommen',
    exact: ['status', 'ausgesondert', 'ausgesondertam', 'ausserbetrieb', 'stillgelegt', 'verschrottet', 'ausgemustert'],
  },
];

// ---------------------------------------------------------------------------- Werte

/** Schutzklasse aus einer Zelle: „I“, „1“, „SK I“, „SK1“, „Schutzklasse 2“, „SK II (Schutzisolierung)“, „schutzisoliert“ … */
export function protectionClassOf(raw: string): { value: ProtectionClass | null; how: 'ok' | 'empty' | 'unknown' } {
  const k = cmpKey(raw);
  if (!k) return { value: null, how: 'empty' };
  const m = /^(?:schutz ?klasse|schutzkl|sk|klasse|kl)? ?(iii|ii|i|3|2|1)(?: |$)/.exec(k);
  const roman: Record<string, ProtectionClass> = { i: 'I', '1': 'I', ii: 'II', '2': 'II', iii: 'III', '3': 'III' };
  if (m) return { value: roman[m[1]], how: 'ok' };
  if (/schutzleiter|schutzerde/.test(k)) return { value: 'I', how: 'ok' };
  if (/schutzisol|isoliert|doppelt isol/.test(k)) return { value: 'II', how: 'ok' };
  if (/kleinspannung|selv|pelv/.test(k)) return { value: 'III', how: 'ok' };
  return { value: null, how: 'unknown' };
}

/** Ausgesondert laut Liste? „ja“, „ausgesondert“ (Status der Geräteliste), ein Datum (Spalte „Ausgesondert am“) … */
export function isRetiredCell(raw: string): boolean {
  if (!raw.trim()) return false;
  if (yesNo(raw) === true || parseDay(raw)) return true;
  return /ausgesondert|ausgemustert|verschrottet|stillgelegt|ausser betrieb|entsorgt/.test(cmpKey(raw));
}

/** Spalten zu bisherigen Prüfungen: erkannt (damit sie nichts anderem zugeordnet werden), aber nicht übernommen */
export const NOT_TAKEN: readonly string[] = [F.last, F.lastResult, F.next];

// ---------------------------------------------------------------------------- Plan

/** Stammdaten des Geräts ohne Kunde — genau die Eingabe des Formulars */
export type DeviceData = Omit<DeviceInput, 'customer_id'>;

export interface DevicePayload {
  input: DeviceData;
  /** vorhandener Kunde (oder keiner) … */
  customerId: string | null;
  /** … oder neuer (Schlüssel in plan.newCustomers) */
  newCustomer: string | null;
}

export interface NewCustomer {
  key: string;
  name: string;
  address: string;
}

export interface DevicePlan extends ImportPlan<DevicePayload> {
  newCustomers: Map<string, NewCustomer>;
}

/** Vergleichsform eines Geräts: Etikett, Seriennummer, Bezeichnung, Kunde ('' = ohne, 'neu:…' = neuer Kunde) */
interface Ident {
  qr: string;
  serial: string;
  name: string;
  place: string;
}

/** Gleiches Gerät? Etikett oder Seriennummer gleich; sonst Bezeichnung beim selben Kunden, wenn nichts widerspricht. */
export function sameDevice(a: Ident, b: Ident): boolean {
  if (a.qr && b.qr && a.qr === b.qr) return true;
  if (a.serial && b.serial && a.serial === b.serial) return true;
  if ((a.qr && b.qr) || (a.serial && b.serial)) return false;
  return a.place === b.place && a.name === b.name;
}

const identOf = (d: Pick<Device, 'qr_code' | 'serial_number' | 'name' | 'customer_id'>): Ident => ({
  qr: cmpKey(d.qr_code ?? ''),
  serial: cmpKey(d.serial_number ?? ''),
  name: cmpKey(d.name),
  place: d.customer_id ?? '',
});

export interface DevicePlanArgs {
  table: Pick<Table, 'rows' | 'lines'>;
  hasHeader: boolean;
  mapping: Mapping;
  /** Kunde für Zeilen ohne Kunde (id) — '' = ohne Kunde */
  target: string;
  customers: readonly Customer[];
  /** alle Geräte des Betriebs (auch ausgesonderte — ihr Etikett ist weiter vergeben) */
  devices: readonly Device[];
}

export function planDevices(args: DevicePlanArgs): DevicePlan {
  const byKey = new Map<string, Customer>();
  for (const c of args.customers) if (!byKey.has(cmpKey(c.name))) byKey.set(cmpKey(c.name), c);
  const target = args.customers.find((c) => c.id === args.target) ?? null;
  const known = args.devices.map((d) => ({ d, k: identOf(d) }));
  const inFile: { k: Ident; line: number }[] = [];
  const newCustomers = new Map<string, NewCustomer>();
  const intervalColumn = args.mapping[F.interval] !== undefined;

  const rows = dataRows(args.table, args.hasHeader).map(({ cells, line }, i): ImportPlanRow<DevicePayload> => {
    const get = (key: string) => cellOf(cells, args.mapping, key);
    const name = cap(oneLine(get(F.name)), 200);
    const row: ImportPlanRow<DevicePayload> = { i, line, status: 'ok', reason: '', title: name, sub: '', cells: ['', ''], hints: [], payload: null };
    const skip = (reason: string) => {
      row.status = 'skip';
      row.reason = reason;
      return row;
    };
    if (!name) return skip('Bezeichnung fehlt');
    if (isRetiredCell(get(F.retired))) return skip('ausgesondert — wird nicht übernommen');

    // Kunde: vorhandener, neuer oder der gewählte für Zeilen ohne Kunde
    const custText = cap(oneLine(get(F.customer)), 200);
    let customerId: string | null = null;
    let newKey: string | null = null;
    let custName = '';
    if (custText) {
      const found = byKey.get(cmpKey(custText));
      if (found) {
        customerId = found.id;
        custName = found.name;
      } else {
        newKey = cmpKey(custText);
        custName = custText;
        const address = cap(oneLine(get(F.customerAddress)), 240);
        const nc = newCustomers.get(newKey);
        if (!nc) newCustomers.set(newKey, { key: newKey, name: custText, address });
        else if (!nc.address && address) nc.address = address;
      }
    } else if (target) {
      customerId = target.id;
      custName = target.name;
    }

    // Stammdaten wie das Formular (orNull / num ?? 6)
    const qr = textOrNull(get(F.qr), 80);
    const sk = protectionClassOf(get(F.sk));
    if (sk.how === 'unknown') row.hints.push(`Schutzklasse „${oneLine(get(F.sk))}“ nicht erkannt — leer gelassen`);
    const intervalRaw = oneLine(get(F.interval));
    let interval = INTERVAL_DEFAULT;
    if (intervalRaw) {
      const n = monthsFromCell(intervalRaw);
      if (n === null) row.hints.push(`Prüfintervall „${intervalRaw}“ nicht erkannt → ${INTERVAL_DEFAULT} Monate`);
      else interval = n;
    }
    const input: DeviceData = {
      qr_code: qr,
      name,
      device_type: textOrNull(get(F.type), 120),
      manufacturer: textOrNull(get(F.manufacturer), 120),
      serial_number: textOrNull(get(F.serial), 120),
      protection_class: sk.value,
      // genau wie in der Liste (kein Vermerk: die Standort-Notiz steht im Prüfprotokoll)
      location_note: textOrNull(get(F.location), 500),
      interval_months: interval,
      // Frist setzt allein die Prüfung (siehe oben) — neue Geräte stehen auf „ungeprüft“
      next_due_date: null,
    };
    row.cells = [custName ? (newKey ? `${custName} (neu)` : custName) : '', qr ?? ''];
    row.sub = [input.device_type, input.manufacturer, input.protection_class ? skLabel(input.protection_class) : '', intervalColumn ? `alle ${interval} Monate` : '']
      .filter(Boolean)
      .join(' · ');
    row.payload = { input, customerId, newCustomer: newKey };

    // schon vorhanden / doppelt in der Liste
    const me: Ident = { qr: cmpKey(qr ?? ''), serial: cmpKey(input.serial_number ?? ''), name: cmpKey(name), place: customerId ?? (newKey ? `neu:${newKey}` : '') };
    const hit = known.find((x) => sameDevice(x.k, me));
    if (hit) {
      row.status = 'exists';
      row.reason = 'schon vorhanden';
      if (me.qr && me.qr === hit.k.qr) {
        // Etikett ist vergeben — ein zweites Gerät damit nimmt der Server nicht an
        row.payload = null;
        if (cmpKey(hit.d.name) !== me.name || hit.d.retired) {
          row.hints.push(`QR/Etikett „${qr}“ gehört schon zu „${hit.d.name}“${hit.d.retired ? ' (ausgesondert)' : ''}`);
        }
      }
      return row;
    }
    const twin = inFile.find((x) => sameDevice(x.k, me));
    if (twin) {
      row.status = 'dup';
      row.reason = `doppelt in der Liste (wie Zeile ${twin.line})`;
      if (me.qr && me.qr === twin.k.qr) row.payload = null;
      return row;
    }
    inFile.push({ k: me, line });
    return row;
  });

  // Satz zur Zusammenfassung: neue Kunden, die eine neue Zeile braucht
  const used = new Set(rows.filter((r) => r.status === 'ok' && r.payload?.newCustomer).map((r) => r.payload!.newCustomer!));
  const notes: string[] = [];
  if (used.size) {
    const names = [...used].map((k) => `„${newCustomers.get(k)!.name}“`);
    notes.push(
      `${used.size === 1 ? 'Der Kunde' : `${used.size} Kunden`} ${names.slice(0, 5).join(', ')}${names.length > 5 ? ' …' : ''} ${used.size === 1 ? 'ist neu und wird' : 'sind neu und werden'} mit angelegt.`,
    );
  }
  // Spalten zu bisherigen Prüfungen: einmal sagen, dass sie nicht übernommen werden
  const header = args.hasHeader ? (args.table.rows[0] ?? []) : [];
  const skipped = NOT_TAKEN.filter((k) => args.mapping[k] !== undefined).map((k) => `„${header[args.mapping[k]!] || DEVICE_FIELDS.find((f) => f.key === k)!.label}“`);
  if (skipped.length) {
    notes.push(
      `${skipped.length === 1 ? 'Die Spalte' : 'Die Spalten'} ${skipped.join(', ')} ${skipped.length === 1 ? 'wird' : 'werden'} nicht übernommen (bisherige Prüfungen und Fristen).`,
    );
  }
  return { rows, count: countStatus(rows), notes, newCustomers };
}

/** Wie viele Geräte der Import anlegen darf: mit Pro unbegrenzt, sonst bis zur Gratis-Grenze (Geräte in Betrieb). */
export function deviceAllowance(pro: boolean, count: number): number | null {
  return pro ? null : Math.max(0, FREE_LIMITS.devices - count);
}

export interface FinalDevice {
  row: ImportPlanRow<DevicePayload>;
  customerId: string | null;
  newCustomer: string | null;
}

/**
 * Was beim Klick wirklich angelegt wird — gegen die frisch geladenen Kunden/Geräte und die frische Pro-Auskunft:
 * angehakte Zeilen in Listen-Reihenfolge, ohne inzwischen Vorhandenes (anderer Tab, zweiter Klick), höchstens bis zur
 * Gratis-Grenze; neue Kunden, die es inzwischen gibt, werden benutzt statt doppelt angelegt.
 */
export function finalizeDevices(
  plan: DevicePlan,
  selected: ReadonlySet<number>,
  fresh: { customers: readonly Customer[]; devices: readonly Device[] },
  allowance: number | null,
): { devices: FinalDevice[]; newCustomers: NewCustomer[]; already: number; overLimit: number } {
  const byKey = new Map(fresh.customers.map((c) => [cmpKey(c.name), c.id] as const));
  const known = fresh.devices.map(identOf);
  let already = 0;
  const wanted: FinalDevice[] = [];
  for (const row of plan.rows) {
    if (!row.payload || !selected.has(row.i)) continue;
    const p = row.payload;
    const customerId = p.newCustomer ? (byKey.get(p.newCustomer) ?? null) : p.customerId;
    const newCustomer = p.newCustomer && !customerId ? p.newCustomer : null;
    const me: Ident = {
      qr: cmpKey(p.input.qr_code ?? ''),
      serial: cmpKey(p.input.serial_number ?? ''),
      name: cmpKey(p.input.name),
      place: customerId ?? (newCustomer ? `neu:${newCustomer}` : ''),
    };
    // Etikett inzwischen vergeben: geht nicht. Sonst nur, was nicht bewusst trotz „schon vorhanden“ angehakt wurde.
    if ((me.qr && known.some((k) => k.qr === me.qr)) || (row.status !== 'exists' && known.some((k) => sameDevice(k, me)))) {
      already++;
      continue;
    }
    wanted.push({ row, customerId, newCustomer });
  }
  const devices = allowance === null ? wanted : wanted.slice(0, allowance);
  const keys = new Set(devices.filter((d) => d.newCustomer).map((d) => d.newCustomer!));
  return {
    devices,
    newCustomers: [...keys].map((k) => plan.newCustomers.get(k)!).filter(Boolean),
    already,
    overLimit: wanted.length - devices.length,
  };
}

// ---------------------------------------------------------------------------- Vorlage

/** Beispielzeilen der Vorlage (Feld-Schlüssel → Wert) */
export const DEVICE_EXAMPLES: Record<string, string>[] = [
  { customer: 'Bäckerei Huber', customerAddress: 'Hauptstraße 5, 8010 Graz', location_note: 'Backstube', name: 'Teigknetmaschine', qr_code: 'PD-0001', device_type: 'Küchengerät', manufacturer: 'Diosna', serial_number: 'SP12-4471', protection_class: 'SK I', interval_months: '12' },
  { customer: 'Bäckerei Huber', location_note: 'Verkauf', name: 'Kaffeemaschine', qr_code: 'PD-0002', manufacturer: 'Jura', protection_class: 'I', interval_months: '12' },
  { customer: 'Büro Maier', customerAddress: 'Bahnhofweg 2, 80331 München', location_note: 'Empfang', name: 'Verlängerungskabel 10 m', qr_code: 'PD-0003', device_type: 'Leitung', protection_class: 'Schutzklasse 1', interval_months: '24' },
  { customer: 'Büro Maier', name: 'Bohrmaschine', qr_code: 'PD-0004', device_type: 'Handwerkzeug', manufacturer: 'Bosch', protection_class: 'II', interval_months: '6' },
];

/** Spalten der Vorlage (Reihenfolge wie die Geräteliste) */
const TEMPLATE_KEYS = [F.customer, F.customerAddress, F.location, F.name, F.qr, F.type, F.manufacturer, F.serial, F.sk, F.interval];

/** Vorlage als echte .xlsx: Spalten wie die Geräteliste, Beispielzeilen, Blatt „Info“ mit Erklärung. */
export function deviceTemplateSheets(): XlsxSheet[] {
  const cols = TEMPLATE_KEYS.map((k) => DEVICE_FIELDS.find((f) => f.key === k)!);
  return [
    {
      name: 'Geräte',
      columns: cols.map((f) => ({ header: f.label })),
      rows: DEVICE_EXAMPLES.map((r) => cols.map((f) => r[f.key] || null)),
    },
    {
      name: 'Info',
      table: false,
      landscape: false,
      columns: [{ header: '', width: 26 }, { header: '', width: 90 }],
      rows: [
        [{ v: 'PrüfDex · Vorlage für den Geräte-Import', bold: true }],
        [],
        [{ v: 'So geht es', bold: true }, 'Je Gerät eine Zeile, die Beispielzeilen überschreiben. Danach im Dashboard unter „Geräte“ → „Geräte importieren“ die Datei wählen.'],
        [{ v: 'Pflicht', bold: true }, 'nur „Gerät“ (die Bezeichnung). Alle anderen Spalten dürfen leer bleiben oder fehlen.'],
        [{ v: 'Kunde/Standort', bold: true }, 'Name wie im Dashboard. Unbekannte Kunden werden mit angelegt — die Adresse dazu aus „Kunde-Adresse“. Ohne Kunde wählst du beim Import einen aus der Liste (oder keinen).'],
        [{ v: 'QR/Etikett', bold: true }, 'Die Nummer auf dem Prüfetikett. Sie gibt es im Betrieb nur einmal — ein Gerät mit einem schon vergebenen Etikett wird nicht noch einmal angelegt.'],
        [{ v: 'Schutzklasse', bold: true }, 'I, II oder III. Auch „SK 1“, „Schutzklasse II“ oder „schutzisoliert“ werden erkannt.'],
        [{ v: 'Prüfintervall', bold: true }, `In Monaten, z. B. 6, 12 oder 24. Leer = ${INTERVAL_DEFAULT} Monate (Richtwert DGUV Vorschrift 3). Die Frist legt der Arbeitgeber fest.`],
        [{ v: 'Bisherige Prüfungen', bold: true }, 'Bisherige Prüfungen und Fristen werden nicht übernommen — Prüfungen sind Nachweise mit Messwerten, GPS-Stempel und Prüfcode und entstehen nur in der App. Die Geräte stehen bis zur ersten Prüfung in PrüfDex auf „ungeprüft“. Deine Excel-Liste bleibt dafür deine Quelle.'],
        [{ v: 'Wieder einlesen', bold: true }, 'Auch die Geräteliste aus PrüfDex (Excel) lässt sich einlesen. Was es schon gibt (gleiches Etikett, gleiche Seriennummer oder gleiche Bezeichnung beim selben Kunden), wird erkannt und nicht doppelt angelegt.'],
      ],
    },
  ];
}

// ---------------------------------------------------------------------------- Laden, Adapter für den Wizard

/** Lesen und Schreiben — im Betrieb die api.ts, im Test nachgebaut. */
export interface DeviceImportApi {
  fetchCustomers(sb: SupabaseClient): Promise<Customer[]>;
  /** alle Geräte, auch ausgesonderte */
  fetchDevices(sb: SupabaseClient): Promise<Device[]>;
  insertCustomers(sb: SupabaseClient, rows: CustomerRow[]): Promise<void>;
  insertDevices(sb: SupabaseClient, rows: DeviceRow[]): Promise<void>;
}

export const DEVICE_IMPORT_API: DeviceImportApi = {
  fetchCustomers,
  fetchDevices: (sb) => fetchDevices(sb, { includeRetired: true }),
  insertCustomers,
  insertDevices,
};

export interface DeviceImportData {
  customers: Customer[];
  devices: Device[];
  /** Geräte in Betrieb laut Server (Gratis-Grenze) */
  count: number;
  pro: boolean;
  allowance: number | null;
}

export async function loadDeviceImport(sb: SupabaseClient, api: DeviceImportApi = DEVICE_IMPORT_API): Promise<DeviceImportData> {
  const [customers, devices, gate, pro] = await Promise.all([api.fetchCustomers(sb), api.fetchDevices(sb), deviceGate(sb), orgProFuerGrenze(sb, 'pruefdex')]);
  return { customers, devices, count: gate.count, pro, allowance: deviceAllowance(pro, gate.count) };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
const STRIP = /^[^:]+ konnten nicht angelegt werden: /;

/** Adapter für components/ImportWizard.tsx */
export function deviceImportAdapter(sb: SupabaseClient, org: Org, data: DeviceImportData, api: DeviceImportApi = DEVICE_IMPORT_API): ImportAdapter<DevicePayload> {
  const sorted = [...data.customers].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
  return {
    noun: { one: 'Gerät', many: 'Geräte' },
    fields: DEVICE_FIELDS,
    required: [F.name],
    fallbackMapping: { [F.name]: 0 },
    columns: ['Kunde/Standort', 'QR/Etikett'],
    notice:
      'Bisherige Prüfungen und Fristen werden nicht übernommen — die Geräte stehen bis zur ersten Prüfung in PrüfDex auf „ungeprüft“. Deine Excel-Liste bleibt dafür deine Quelle. (Eine Prüfung ist ein Nachweis mit Messwerten, GPS-Stempel und Prüfcode und entsteht nur in der App oder unter „Vor Ort“.)',
    choice: (mapping) => {
      const hasCol = mapping[F.customer] !== undefined;
      const options = sorted.map((c) => ({ value: c.id, label: c.name }));
      return {
        label: hasCol ? 'Kunde für Zeilen ohne Kunde' : 'Zu welchem Kunden?',
        hint: hasCol
          ? 'Zeilen mit Kunde kommen zu ihrem Kunden; unbekannte Kunden werden mit angelegt.'
          : options.length
            ? 'Die Liste hat keine Spalte „Kunde“ — alle Geräte kommen zum gewählten Kunden.'
            : 'Es gibt noch keine Kunden — die Geräte werden ohne Kunde angelegt. Oder in der Liste eine Spalte „Kunde“ ergänzen.',
        options: [{ value: '', label: '— ohne Kunde —' }, ...options],
        value: !hasCol && options.length === 1 ? options[0].value : '',
      };
    },
    plan: ({ table, hasHeader, mapping, choice }) => planDevices({ table, hasHeader, mapping, target: choice, customers: data.customers, devices: data.devices }),
    allowance: data.allowance,
    limitText: (allowance) =>
      `${
        allowance === 0
          ? `Dein Betrieb hat die Gratis-Grenze schon erreicht (${plural(data.count, 'Gerät', 'Geräte')}) — angelegt wird jetzt nichts.`
          : `Angelegt ${allowance === 1 ? 'wird' : 'werden'} jetzt nur ${allowance === 1 ? 'das erste' : `die ersten ${allowance}`} der Auswahl.`
      } ${GATE_TEXT.devices}`,
    template: () => downloadXlsx('PruefDex_Geraete_Vorlage', deviceTemplateSheets(), { title: 'PrüfDex Vorlage Geräte', creator: 'Dexware PrüfDex' }),
    async write(plan, selected, _choice, progress) {
      progress({ label: 'Geräte werden geprüft …', done: 0, total: 0 });
      const fresh = await loadDeviceImport(sb, api);
      const fin = finalizeDevices(plan as DevicePlan, selected, fresh, fresh.allowance);
      const failed: InsertFailure[] = [];

      // 1. neue Kunden (wie „Kunde anlegen“: Name + Adresse, ohne Kontakt)
      const custItems = fin.newCustomers.map((nc) => ({ nc, row: customerRow(org.id, { name: nc.name, address: nc.address || null, contact: null }) }));
      const custIds = new Map<string, string>();
      if (custItems.length) {
        const res = await insertInChunks(
          custItems,
          (part) => api.insertCustomers(sb, part.map((x) => x.row)),
          (x) => ({ line: 0, name: x.nc.name }),
          { strip: STRIP, progress: (done) => progress({ label: 'Kunden werden angelegt …', done, total: custItems.length }) },
        );
        for (const x of res.ok) custIds.set(x.nc.key, x.row.id);
        for (const f of res.failed) failed.push({ line: 0, name: `Kunde „${f.name}“`, reason: f.reason });
      }

      // 2. Geräte (beim vorhandenen bzw. eben angelegten Kunden)
      const items: { d: FinalDevice; row: DeviceRow }[] = [];
      for (const d of fin.devices) {
        let customerId = d.customerId;
        if (d.newCustomer) {
          customerId = custIds.get(d.newCustomer) ?? null;
          if (!customerId) {
            failed.push({ line: d.row.line, name: d.row.title, reason: 'Kunde konnte nicht angelegt werden' });
            continue;
          }
        }
        items.push({ d, row: deviceRow(org.id, { customer_id: customerId, ...d.row.payload!.input }) });
      }
      const res = await insertInChunks(
        items,
        (part) => api.insertDevices(sb, part.map((x) => x.row)),
        (x) => ({ line: x.d.row.line, name: x.d.row.title }),
        { strip: STRIP, progress: (done) => progress({ label: 'Geräte werden angelegt …', done, total: items.length }) },
      );
      failed.push(...res.failed);
      const notes: string[] = [];
      if (custIds.size) notes.push(`${plural(custIds.size, 'neuer Kunde', 'neue Kunden')} angelegt.`);
      if (fin.already) notes.push(`${plural(fin.already, 'Gerät war', 'Geräte waren')} inzwischen schon vorhanden und ${fin.already === 1 ? 'wurde' : 'wurden'} nicht noch einmal angelegt.`);
      if (fin.overLimit) notes.push(`${plural(fin.overLimit, 'Gerät', 'Geräte')} nicht angelegt — Gratis-Grenze erreicht.`);
      if (res.ok.length) notes.push('Die neuen Geräte stehen bis zur ersten Prüfung in der App auf „ungeprüft“.');
      const result: ImportResult = { created: res.ok.length, failed, notes };
      return result;
    },
  };
}
