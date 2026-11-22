// KfzDex — Fuhrpark als Excel-Liste (Dashboard). Reine Logik ohne React.
//
// Zweck: AUSWERTEN (was ist wann fällig, Historie je Fahrzeug und Fahrer). Kein Nachweis — eine Excel-Datei lässt sich
// ändern; rechtssicher bleiben die Prüfprotokolle und Kontrollnachweise in KfzDex.
// Fälligkeit und Status kommen 1:1 aus due.ts — dieselbe Rechnung wie Fahrzeuge-/Fahrer-Seite und Übersicht
// (UVV ab der letzten BESTANDENEN Prüfung, Führerscheinkontrolle im Intervall je Fahrer, Monatsende gekappt).
// Aufbau: „Fahrzeuge“, „Fahrer“, „UVV-Prüfungen“, „Führerscheinkontrollen“ (komplette Historie, neueste zuerst
// wie in den Historien der Seiten), „Info“. Stornos gibt es in KfzDex nicht (Einträge werden gelöscht, nicht storniert).

import { ExportNotice, type XlsxCell, type XlsxSheet, type XlsxValue } from '../lib/xlsx';
import { fmtDateTime, toInputDate } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { DUE_STATUS_LABEL, SOON_DAYS, UVV_INTERVAL_MONTHS, licenseDue, uvvDue, type DueInfo, type DueStatus } from './due';
import {
  checklistSummary,
  UVV_RESULT_LABEL,
  VEHICLE_TYPE_LABEL,
  type Driver,
  type LicenseExportRow,
  type UvvExportRow,
  type Vehicle,
} from './types';

export const EXPORT_TZ = 'Europe/Berlin';

export const EXPORT_NOTE =
  'Arbeitsliste zum Auswerten — kein Nachweis. Eine Excel-Datei lässt sich ändern; rechtssicherer Nachweis sind die Prüfprotokolle und Kontrollnachweise in KfzDex.';

const DUE_NOTE =
  `UVV-Prüfung alle ${UVV_INTERVAL_MONTHS} Monate ab der letzten BESTANDENEN Prüfung (DGUV Vorschrift 70) — Prüfungen mit Mängeln oder „nicht bestanden“ verlängern die Frist nicht. ` +
  `Führerscheinkontrolle im Intervall je Fahrer. „bald fällig“ = in höchstens ${SOON_DAYS} Tagen; Monatsende gekappt (31.08. + 6 Monate = 28./29.02.). ` +
  'Tage bis fällig: negativ = überfällig, 0 = heute. Inaktive Fahrer ohne Status (wie im Dashboard) und nicht in den Summen.';

export interface FleetExportInput {
  org: Org;
  vehicles: Vehicle[];
  drivers: Driver[];
  /** komplette UVV-Historie, beliebige Reihenfolge */
  inspections: UvvExportRow[];
  /** komplette Kontroll-Historie, beliebige Reihenfolge */
  checks: LicenseExportRow[];
  /** Stichtag der Fristen (Standard: jetzt) — für Tests */
  now?: Date;
}

const GONE_VEHICLE = '(Fahrzeug nicht mehr vorhanden)';
const GONE_DRIVER = '(Fahrer nicht mehr vorhanden)';

const cmpText = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true });
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Neueste zuerst: Datum, dann Erfassung, dann id — wie die Historien der Seiten (stabil). */
const newestFirst = <T extends { id: string; date: string; created_at: string }>(a: T, b: T) =>
  cmpStr(b.date, a.date) || cmpStr(b.created_at, a.created_at) || cmpStr(b.id, a.id);

/** Fälligkeit als Kalendertag 'yyyy-mm-dd' (lokal, nie toISOString). */
const dueDay = (due: DueInfo): string | null => (due.dueDate ? toInputDate(due.dueDate) : null);
/** Tage bis fällig — -0 (Math.ceil knapp unter null) als 0 schreiben. */
const dueDays = (due: DueInfo): number | null => (due.days == null ? null : due.days || 0);
/** Status-Wort wie die Ampel der Seiten; überfällig fett. */
const statusCell = (s: DueStatus): XlsxCell => ({ v: DUE_STATUS_LABEL[s], bold: s === 'overdue' });

function infoSheet(title: string, lines: [string, XlsxValue | XlsxCell][]): XlsxSheet {
  return {
    name: 'Info',
    table: false,
    landscape: false,
    columns: [{ header: '', width: 26 }, { header: '', width: 90 }],
    rows: [[{ v: title, bold: true }], [], ...lines.map(([k, v]) => (k ? [{ v: k, bold: true }, v] : []))],
  };
}

function countBy<T>(list: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of list) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
  return m;
}

/** Erster Eintrag je Schlüssel — bei einer neueste-zuerst-Liste also der jüngste. */
function firstBy<T>(list: T[], key: (t: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const t of list) if (!m.has(key(t))) m.set(key(t), t);
  return m;
}

/** Alle Blätter der Datei „Fuhrpark“. Leerer Fuhrpark → ExportNotice (blauer Hinweis am Knopf). */
export function fleetSheets(input: FleetExportInput): XlsxSheet[] {
  const now = input.now ?? new Date();
  if (input.vehicles.length === 0 && input.drivers.length === 0) {
    throw new ExportNotice('Noch keine Fahrzeuge und keine Fahrer angelegt — die Excel-Liste wäre leer.');
  }

  const vehicles = [...input.vehicles].sort((a, b) => cmpText(a.plate, b.plate) || cmpStr(a.id, b.id));
  // wie die Fahrer-Seite: aktive zuerst, dann nach Name
  const drivers = [...input.drivers].sort((a, b) => Number(b.active) - Number(a.active) || cmpText(a.name, b.name) || cmpStr(a.id, b.id));
  const inspections = [...input.inspections].sort(newestFirst);
  const checks = [...input.checks].sort(newestFirst);
  const vehicleById = new Map(input.vehicles.map((v) => [v.id, v]));
  const driverById = new Map(input.drivers.map((d) => [d.id, d]));
  const inspCount = countBy(inspections, (i) => i.vehicle_id);
  const lastInsp = firstBy(inspections, (i) => i.vehicle_id);
  const checkCount = countBy(checks, (c) => c.driver_id);
  const lastCheck = firstBy(checks, (c) => c.driver_id);

  const uvvCount: Record<DueStatus, number> = { ok: 0, soon: 0, overdue: 0, missing: 0 };
  const vehicleRows = vehicles.map((v) => {
    const due = uvvDue(v, now);
    uvvCount[due.status]++;
    const last = lastInsp.get(v.id);
    return [
      v.plate,
      v.name,
      VEHICLE_TYPE_LABEL[v.type] ?? v.type,
      v.first_registration,
      v.last_uvv,
      dueDay(due),
      dueDays(due),
      statusCell(due.status),
      inspCount.get(v.id) ?? 0,
      last?.date ?? null,
      last ? (UVV_RESULT_LABEL[last.result] ?? last.result) : null,
    ];
  });

  const licCount: Record<DueStatus, number> = { ok: 0, soon: 0, overdue: 0, missing: 0 };
  const driverRows = drivers.map((d) => {
    const due = licenseDue(d, now);
    // wie Fahrer-Seite und Übersicht: Frist-Status nur für aktive Fahrer
    if (d.active) licCount[due.status]++;
    return [
      d.name,
      d.license_classes,
      d.active ? 'aktiv' : 'inaktiv',
      d.check_interval_months,
      d.last_check,
      dueDay(due),
      dueDays(due),
      d.active ? statusCell(due.status) : null,
      checkCount.get(d.id) ?? 0,
      lastCheck.get(d.id)?.checked_by ?? null,
    ];
  });

  const inspectionRows = inspections.map((i) => {
    const v = vehicleById.get(i.vehicle_id);
    const checklist = checklistSummary(i.checklist);
    return [
      i.date,
      v?.plate ?? GONE_VEHICLE,
      v ? (v.name ?? VEHICLE_TYPE_LABEL[v.type] ?? null) : null,
      i.inspector,
      UVV_RESULT_LABEL[i.result] ?? i.result,
      checklist === '—' ? null : checklist,
      i.defects,
      i.created_at,
    ];
  });

  const checkRows = checks.map((c) => {
    const d = driverById.get(c.driver_id);
    return [c.date, d?.name ?? GONE_DRIVER, d?.license_classes ?? null, c.checked_by, c.created_at];
  });

  const activeDrivers = input.drivers.filter((d) => d.active).length;
  const int = (n: number): XlsxCell => ({ v: n, kind: 'int' });
  return [
    {
      name: 'Fahrzeuge',
      columns: [
        { header: 'Kennzeichen' },
        { header: 'Bezeichnung' },
        { header: 'Typ' },
        { header: 'Erstzulassung', kind: 'date' },
        { header: 'Letzte UVV (bestanden)', kind: 'date' },
        { header: 'UVV fällig am', kind: 'date' },
        { header: 'Tage bis fällig', kind: 'int' },
        { header: 'Status' },
        { header: 'UVV-Prüfungen', kind: 'int' },
        { header: 'Letzte Prüfung am', kind: 'date' },
        { header: 'Ergebnis letzte Prüfung' },
      ],
      rows: vehicleRows,
    },
    {
      name: 'Fahrer',
      columns: [
        { header: 'Name' },
        { header: 'Führerscheinklassen' },
        { header: 'Aktiv' },
        { header: 'Intervall (Monate)', kind: 'int' },
        { header: 'Letzte Kontrolle', kind: 'date' },
        { header: 'Kontrolle fällig am', kind: 'date' },
        { header: 'Tage bis fällig', kind: 'int' },
        { header: 'Status' },
        { header: 'Kontrollen', kind: 'int' },
        { header: 'Zuletzt kontrolliert von' },
      ],
      rows: driverRows,
    },
    {
      name: 'UVV-Prüfungen',
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Kennzeichen' },
        { header: 'Fahrzeug' },
        { header: 'Prüfer' },
        { header: 'Ergebnis' },
        { header: 'Checkliste' },
        { header: 'Mängel' },
        { header: 'Erfasst am', kind: 'datetime' },
      ],
      rows: inspectionRows,
    },
    {
      name: 'Führerscheinkontrollen',
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Fahrer' },
        { header: 'Führerscheinklassen' },
        { header: 'Kontrolliert von' },
        { header: 'Erfasst am', kind: 'datetime' },
      ],
      rows: checkRows,
    },
    infoSheet('KfzDex · Fuhrpark', [
      ['Betrieb', input.org.name],
      ['Auswahl', 'Ganzer Fuhrpark: alle Fahrzeuge und Fahrer, UVV- und Kontroll-Historie komplett (Suche und Typ-Filter der Seite gelten nicht)'],
      ['Erstellt', fmtDateTime(now.toISOString())],
      ['Fahrzeuge', int(vehicles.length)],
      ['UVV überfällig', { v: uvvCount.overdue, kind: 'int', bold: uvvCount.overdue > 0 }],
      ['UVV bald fällig', int(uvvCount.soon)],
      ['UVV nie geprüft', int(uvvCount.missing)],
      ['Fahrer', `${activeDrivers} aktiv, ${input.drivers.length - activeDrivers} inaktiv`],
      ['Kontrolle überfällig', { v: licCount.overdue, kind: 'int', bold: licCount.overdue > 0 }],
      ['Kontrolle bald fällig', int(licCount.soon)],
      ['Nie kontrolliert', int(licCount.missing)],
      ['UVV-Prüfungen', int(inspections.length)],
      ['Führerscheinkontrollen', int(checks.length)],
      ['', null],
      ['Hinweis', EXPORT_NOTE],
      ['Fristen', DUE_NOTE],
      ['Fotos', 'Fotos der Führerscheinkontrolle liegen nur auf dem kontrollierenden Gerät und sind nicht Teil der Liste.'],
    ]),
  ];
}
