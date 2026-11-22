// PrüfDex — Geräteliste (Prüfbuch) und Prüfungen im Zeitraum als Excel-Liste (Dashboard). Reine Logik ohne React.
//
// Zweck: AUSWERTEN und ABRECHNEN (Fristen je Kunde planen, geprüfte Geräte je Kunde abrechnen). Kein Nachweis — eine
// Excel-Datei lässt sich beliebig ändern; rechtssicher bleibt das Prüfprotokoll (PDF) aus PrüfDex.
// Aufbau:
//   Geräteliste: „Geräte“ (Filter wie die Seite: Kunde + Fälligkeit; Status = dieselbe Ampel wie im Dashboard) + „Info“
//   Prüfungen:   „Prüfungen“ (nur gültige, chronologisch, Messwerte als Zahl), „Je Kunde“ (Abrechnungsgrundlage),
//                „Storniert“ (nur wenn es Stornos gibt, mit Grund), „Info“
// Bewusst nur .ts-Imports (läuft auch im Node-Test ohne Bundler).

import { excelSerial, ExportNotice, type XlsxCell, type XlsxSheet, type XlsxValue } from '../lib/xlsx';
import { fmtDateTime } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { dueStatus, parseMeasure, skLabel, type DueStatus } from './labels';
import {
  MEASUREMENTS,
  RESULT_LABELS,
  VISUAL_CHECKS,
  type Customer,
  type Device,
  type Inspection,
  type InspectionResult,
} from './types';

export const EXPORT_TZ = 'Europe/Berlin';

export const EXPORT_NOTE =
  'Arbeitsliste zum Auswerten — kein Nachweis. Eine Excel-Datei lässt sich ändern; rechtssicherer Nachweis ist das Prüfprotokoll (PDF) aus PrüfDex.';

export interface ExportPeriod {
  /** yyyy-mm-dd aus dem Filter (lokale Kalendertage) */
  from: string;
  to: string;
}

/** „01.11.2026 – 22.11.2026“ — Kalendertage ohne Zeitzonen-Verschiebung. */
export function periodLabel(p: ExportPeriod): string {
  const d = (s: string) => s.split('-').reverse().join('.');
  return `${d(p.from)} – ${d(p.to)}`;
}

/** Status-Texte wie die Ampel im Dashboard (badges.tsx → DueBadge). */
export const DUE_TEXT: Record<DueStatus, string> = { overdue: 'überfällig', soon: 'bald fällig', ok: 'ok', none: 'ungeprüft' };
export const RETIRED_TEXT = 'ausgesondert';
/** Beschriftung des Fälligkeits-Filters (wie die Auswahl auf der Geräte-Seite). */
const DUE_FILTER: Record<DueStatus, string> = { overdue: 'Überfällig', soon: 'Bald fällig', ok: 'Frist ok', none: 'Ungeprüft' };

/** Fälligkeits-Filter der Geräte-Seite — EINE Quelle für Tabelle und Excel-Liste. */
export function filterByDue<T extends Pick<Device, 'next_due_date'>>(devices: T[], due: '' | DueStatus): T[] {
  return due ? devices.filter((d) => dueStatus(d.next_due_date) === due) : devices;
}

const NO_CUSTOMER = '(ohne Kunde)';
const GONE_DEVICE = '(Gerät nicht mehr vorhanden)';

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cmpText = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true });
/** Kalendertage aufsteigend, ohne Datum zuletzt (wie die Sortierung der Geräte-Seite). */
const cmpDue = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : cmp(a, b));
const skCell = (c: Device['protection_class']) => (c ? skLabel(c) : null);
const resultText = (r: InspectionResult) => RESULT_LABELS[r] ?? r;
const proofCode = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : null);
const created = () => fmtDateTime(new Date().toISOString());
const int = (v: number): XlsxCell => ({ v, kind: 'int' });

function infoSheet(title: string, lines: [string, XlsxValue | XlsxCell][]): XlsxSheet {
  return {
    name: 'Info',
    table: false,
    landscape: false,
    columns: [{ header: '', width: 24 }, { header: '', width: 90 }],
    rows: [[{ v: title, bold: true }], [], ...lines.map(([k, v]) => (k ? [{ v: k, bold: true }, v] : []))],
  };
}

// ---------------------------------------------------------------------------- Geräteliste (Prüfbuch)

export interface LastInspection {
  inspected_at: string;
  result: InspectionResult;
}

export interface DeviceExportInput {
  org: Org;
  customers: Customer[];
  /** Geräte wie auf der Seite geladen: inkl. ausgesonderter, schon nach Kunde gefiltert */
  devices: Device[];
  /** jüngste gültige Prüfung je Gerät (lastInspectionByDevice aus fetchInspectionMeta — wie das Prüflisten-PDF) */
  lastByDevice: ReadonlyMap<string, LastInspection>;
  /** gewählter Kunde (null = alle) */
  customerId: string | null;
  /** Fälligkeits-Filter der Seite ('' = alle) */
  due: '' | DueStatus;
}

export function deviceSheets(input: DeviceExportInput): XlsxSheet[] {
  const custs = new Map(input.customers.map((c) => [c.id, c]));
  const custName = (d: Device) => (d.customer_id ? (custs.get(d.customer_id)?.name ?? null) : null);
  const list = filterByDue(input.devices, input.due);
  if (list.length === 0) {
    throw new ExportNotice(input.customerId || input.due ? 'Keine Geräte mit den gewählten Filtern.' : 'Noch keine Geräte angelegt.');
  }
  // In Betrieb vor ausgesondert, darin je Kunde (ohne Kunde zuletzt), dann nach Fälligkeit wie die Seite
  const sorted = [...list].sort(
    (a, b) =>
      Number(!!a.retired) - Number(!!b.retired) ||
      Number(!custName(a)) - Number(!custName(b)) ||
      cmpText(custName(a) ?? '', custName(b) ?? '') ||
      cmpDue(a.next_due_date, b.next_due_date) ||
      cmpText(a.name, b.name) ||
      cmp(a.id, b.id),
  );

  const rows = sorted.map((d) => {
    const last = input.lastByDevice.get(d.id);
    return [
      custName(d),
      d.location_note,
      d.name,
      d.qr_code,
      d.device_type,
      d.manufacturer,
      d.serial_number,
      skCell(d.protection_class),
      d.interval_months,
      last?.inspected_at ?? null,
      last ? resultText(last.result) : null,
      d.next_due_date,
      d.retired ? RETIRED_TEXT : DUE_TEXT[dueStatus(d.next_due_date)],
      d.retired ? (d.retired_at ?? null) : null,
    ];
  });

  const active = sorted.filter((d) => !d.retired);
  const countDue = (s: DueStatus) => active.filter((d) => dueStatus(d.next_due_date) === s).length;
  const cust = input.customerId ? custs.get(input.customerId) : undefined;

  return [
    {
      name: 'Geräte',
      columns: [
        { header: 'Kunde/Standort' },
        { header: 'Standort-Notiz' },
        { header: 'Gerät' },
        { header: 'QR/Etikett' },
        { header: 'Gerätetyp' },
        { header: 'Hersteller' },
        { header: 'Seriennummer' },
        { header: 'Schutzklasse' },
        { header: 'Prüfintervall (Monate)', kind: 'int' },
        { header: 'Letzte Prüfung', kind: 'date' },
        { header: 'Ergebnis letzte Prüfung' },
        { header: 'Nächste Prüfung fällig am', kind: 'date' },
        { header: 'Status' },
        { header: 'Ausgesondert am', kind: 'date' },
      ],
      rows,
    },
    infoSheet('PrüfDex · Geräteliste (Prüfbuch)', [
      ['Betrieb', input.org.name],
      [
        'Kunde/Standort',
        input.customerId ? (cust ? `${cust.name}${cust.address ? ` · ${cust.address}` : ''}` : NO_CUSTOMER) : 'Alle Kunden',
      ],
      ['Fälligkeit', input.due ? DUE_FILTER[input.due] : 'Alle'],
      ['Erstellt', created()],
      ['Geräte', int(sorted.length)],
      ['In Betrieb', int(active.length)],
      ['davon überfällig', int(countDue('overdue'))],
      ['davon bald fällig', int(countDue('soon'))],
      ['davon Frist ok', int(countDue('ok'))],
      ['davon ungeprüft', int(countDue('none'))],
      ['Ausgesondert', int(sorted.length - active.length)],
      ['', null],
      ['Hinweis', EXPORT_NOTE],
      [
        'Status',
        'Stand „Erstellt“, dieselbe Ampel wie im Dashboard: überfällig = Prüffrist vor heute · bald fällig = innerhalb eines Monats · ok = später · ungeprüft = keine Frist hinterlegt. Ausgesonderte Geräte zählen nicht zu den Fristen.',
      ],
      ['Letzte Prüfung', 'Jüngste gültige (nicht stornierte) Prüfung des Geräts.'],
    ]),
  ];
}

// ---------------------------------------------------------------------------- Prüfungen im Zeitraum

/** Prüfung mit Prüfcode (entry_hash, falls die Datenbank ihn schon kennt) — ohne Fotos und Unterschrift. */
export type ExportInspection = Inspection & { entry_hash?: string | null };

export interface InspectionExportInput {
  org: Org;
  customers: Customer[];
  /** alle Geräte inkl. ausgesonderter (Name, Kunde, Schutzklasse) */
  devices: Device[];
  /** alle Prüfungen im Zeitraum (inkl. Stornos), beliebige Reihenfolge */
  inspections: ExportInspection[];
  period: ExportPeriod;
  /** gewähltes Gerät (null = alle) */
  deviceId: string | null;
  /** Ergebnis-Filter der Seite ('' = alle) */
  result: '' | InspectionResult;
}

/**
 * Messwert als Zahl, wenn das Feld nur eine Zahl enthält — gelesen wie die App ('0,32', '1.500' = 1,5);
 * alles andere bleibt Text (z. B. „> 300“, sonst ginge das „>“ verloren).
 */
export function measureValue(raw: unknown): XlsxValue {
  const t = raw == null ? '' : String(raw).trim();
  if (!t) return null;
  if (/^(\d[\d.,]*|[.,]\d+)$/.test(t)) {
    const n = parseMeasure(t);
    if (n !== null) return n;
  }
  return t;
}

/** Nicht erfüllte Punkte der Sichtprüfung (in der Reihenfolge der App). */
function visualFails(v: Record<string, boolean> | null | undefined): string | null {
  if (!v) return null;
  const f = VISUAL_CHECKS.filter((c) => v[c.key] === false).map((c) => c.label);
  return f.length ? f.join('; ') : null;
}

/** Uhrzeit der Erfassung — nur, wenn am Prüftag erfasst (bei Nachträgen wäre sie irreführend). */
function timeOf(i: ExportInspection): string | null {
  if (!i.created_at) return null;
  return excelSerial(i.created_at, EXPORT_TZ, true) === excelSerial(i.inspected_at, EXPORT_TZ, true) ? i.created_at : null;
}

const byInspected = (a: ExportInspection, b: ExportInspection) =>
  cmp(a.inspected_at, b.inspected_at) || cmp(a.created_at ?? '', b.created_at ?? '') || cmp(a.id, b.id);

export function inspectionSheets(input: InspectionExportInput): XlsxSheet[] {
  if (input.inspections.length === 0) {
    throw new ExportNotice(
      input.deviceId || input.result ? 'Im gewählten Zeitraum gibt es keine Prüfungen mit diesen Filtern.' : 'Im gewählten Zeitraum gibt es keine Prüfungen.',
    );
  }
  const devs = new Map(input.devices.map((d) => [d.id, d]));
  const custs = new Map(input.customers.map((c) => [c.id, c]));
  const custOf = (deviceId: string) => {
    const cid = devs.get(deviceId)?.customer_id;
    return cid ? custs.get(cid) : undefined;
  };
  const list = [...input.inspections].sort(byInspected);
  const valid = list.filter((i) => !i.canceled);
  const canceled = list.filter((i) => i.canceled);

  const rows = valid.map((i) => {
    const d = devs.get(i.device_id);
    return [
      i.inspected_at,
      timeOf(i),
      custOf(i.device_id)?.name ?? null,
      d?.location_note ?? null,
      d?.name ?? GONE_DEVICE,
      d?.qr_code ?? null,
      skCell(d?.protection_class ?? null),
      resultText(i.result),
      visualFails(i.visual_checks),
      ...MEASUREMENTS.map((m) => measureValue(i.measurements?.[m.key])),
      i.next_due_date,
      i.inspector_name,
      i.notes,
      proofCode(i.entry_hash),
    ];
  });

  // Je Kunde: Abrechnungsgrundlage (nur Kunden mit Prüfungen oder Stornos im Zeitraum)
  interface Sum {
    customer: Customer | undefined;
    count: number;
    devices: Set<string>;
    passed: number;
    failed: number;
    first: string | null;
    last: string | null;
    canceled: number;
  }
  const sums = new Map<string, Sum>();
  const sumOf = (deviceId: string) => {
    const customer = custOf(deviceId);
    const key = customer?.id ?? '';
    let s = sums.get(key);
    if (!s) {
      s = { customer, count: 0, devices: new Set(), passed: 0, failed: 0, first: null, last: null, canceled: 0 };
      sums.set(key, s);
    }
    return s;
  };
  for (const i of valid) {
    const s = sumOf(i.device_id);
    s.count++;
    s.devices.add(i.device_id);
    if (i.result === 'passed') s.passed++;
    else if (i.result === 'failed') s.failed++;
    s.first ??= i.inspected_at;
    s.last = i.inspected_at;
  }
  for (const i of canceled) sumOf(i.device_id).canceled++;
  const sumRows = [...sums.values()]
    .sort((a, b) => Number(!a.customer) - Number(!b.customer) || cmpText(a.customer?.name ?? '', b.customer?.name ?? ''))
    .map((s) => [
      s.customer?.name ?? NO_CUSTOMER,
      s.customer?.address ?? null,
      s.devices.size,
      s.count,
      s.passed,
      s.failed,
      s.first,
      s.last,
      s.canceled,
    ]);

  const sheets: XlsxSheet[] = [
    {
      name: 'Prüfungen',
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Uhrzeit (Erfassung)', kind: 'time' },
        { header: 'Kunde/Standort' },
        { header: 'Standort-Notiz' },
        { header: 'Gerät' },
        { header: 'QR/Etikett' },
        { header: 'Schutzklasse' },
        { header: 'Ergebnis' },
        { header: 'Sichtprüfung nicht erfüllt' },
        ...MEASUREMENTS.map((m) => ({ header: `${m.label} (${m.unit})`, kind: 'num' as const })),
        { header: 'Nächste Prüfung', kind: 'date' },
        { header: 'Geprüft von' },
        { header: 'Notiz' },
        { header: 'Prüfcode' },
      ],
      rows,
    },
    {
      name: 'Je Kunde',
      columns: [
        { header: 'Kunde/Standort' },
        { header: 'Adresse' },
        { header: 'Geprüfte Geräte', kind: 'int' },
        { header: 'Prüfungen', kind: 'int' },
        { header: 'Bestanden', kind: 'int' },
        { header: 'Nicht bestanden', kind: 'int' },
        { header: 'Erste Prüfung', kind: 'date' },
        { header: 'Letzte Prüfung', kind: 'date' },
        { header: 'Storniert', kind: 'int' },
      ],
      rows: sumRows,
    },
  ];
  if (canceled.length) {
    sheets.push({
      name: 'Storniert',
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Kunde/Standort' },
        { header: 'Gerät' },
        { header: 'QR/Etikett' },
        { header: 'Ergebnis' },
        { header: 'Geprüft von' },
        { header: 'Storniert am', kind: 'datetime' },
        { header: 'Storno-Grund' },
        { header: 'Prüfcode' },
      ],
      rows: canceled.map((i) => [
        i.inspected_at,
        custOf(i.device_id)?.name ?? null,
        devs.get(i.device_id)?.name ?? GONE_DEVICE,
        devs.get(i.device_id)?.qr_code ?? null,
        resultText(i.result),
        i.inspector_name,
        i.canceled_at ?? null,
        i.cancel_reason ?? null,
        proofCode(i.entry_hash),
      ]),
    });
  }
  const passed = valid.filter((i) => i.result === 'passed').length;
  const failed = valid.filter((i) => i.result === 'failed').length;
  sheets.push(
    infoSheet('PrüfDex · Prüfungen im Zeitraum', [
      ['Betrieb', input.org.name],
      ['Gerät', input.deviceId ? (devs.get(input.deviceId)?.name ?? GONE_DEVICE) : 'Alle Geräte'],
      ['Ergebnis', input.result ? `nur „${resultText(input.result)}“` : 'Alle'],
      ['Zeitraum', periodLabel(input.period)],
      ['Erstellt', created()],
      ['Prüfungen', int(valid.length)],
      ['davon bestanden', int(passed)],
      ['davon nicht bestanden', int(failed)],
      ['Geprüfte Geräte', int(new Set(valid.map((i) => i.device_id)).size)],
      ['Storniert', canceled.length ? `${canceled.length} (eigenes Blatt „Storniert“, nicht in den Summen)` : 'keine'],
      ['', null],
      ['Hinweis', EXPORT_NOTE],
      [
        'Zeiten',
        'Datum = Prüftag. Uhrzeit = Zeitpunkt der Erfassung in Ortszeit (Mitteleuropa); leer, wenn die Prüfung an einem anderen Tag nachgetragen wurde.',
      ],
      [
        'Messwerte',
        'Als Zahl in der Einheit der Spaltenüberschrift, genau wie erfasst. Einträge wie „> 300“ bleiben Text.',
      ],
      ['Kunde/Standort', 'Aktuelle Zuordnung des Geräts. „Je Kunde“ zählt nur Kunden mit Prüfungen im Zeitraum.'],
    ]),
  );
  return sheets;
}
