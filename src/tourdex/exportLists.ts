// TourDex — Fahrtenliste als Excel (Dashboard, Seite „Fahrtenbuch-PDF“). Reine Logik ohne React.
//
// Zweck: Reisekosten und Steuerberatung (Kilometer je Fahrzeug, Monat und Art). KEIN Fahrtenbuch-Ersatz — eine
// Excel-Datei lässt sich beliebig ändern; fürs Finanzamt gilt das Fahrtenbuch-PDF.
// Aufbau:
//   1. „Fahrten“: gültige Fahrten chronologisch — Spalten lassen sich direkt summieren (Stornos stehen NICHT darin)
//   2. „Je Fahrzeug und Monat“: km nach Art + Anzahl
//   3. „Storniert“ mit Grund (nur wenn es Stornos gibt) — geschlossene Form bleibt nachvollziehbar
//   4. „Info“: Konto, Auswahl, Zeitraum, Stand, Summen, Hinweis
// Gelöschte (unbestätigte) Fahrten sind Grabsteine ohne Inhalt und werden gar nicht geladen.
// km: je Fahrt auf 1 Stelle gerundet (wie App und PDF), Summen aus den gerundeten Zeilen.
// km-Stand: dieselbe Rechnung wie das Fahrtenbuch-PDF (odometerById in report.ts).

import { excelSerial, ExportNotice, type XlsxCell, type XlsxSheet, type XlsxValue } from '../lib/xlsx';
import { fmtDateTime } from '../lib/format';
import { odometerById, type OdometerEntry } from './report';
import { CATEGORY_LABELS, type TripCategory, type TripSummary, type Vehicle } from './types';

export const EXPORT_TZ = 'Europe/Berlin';

export const EXPORT_NOTE =
  'Auswertung für Reisekosten/Steuerberatung — kein Fahrtenbuch-Ersatz. Eine Excel-Datei lässt sich ändern; fürs Finanzamt gilt das Fahrtenbuch-PDF aus TourDex.';

export interface ExportPeriod {
  /** yyyy-mm-dd aus den Feldern (lokale Kalendertage) */
  from: string;
  to: string;
}

/** Zeitraum aus den Von/Bis-Feldern prüfen. */
export function checkPeriod(from: string, to: string): ExportPeriod {
  if (!from || !to) throw new ExportNotice('Bitte Von- und Bis-Datum wählen.');
  if (from > to) throw new ExportNotice('„Von“ liegt nach „Bis“ — bitte den Zeitraum prüfen.');
  return { from, to };
}

/** „01.11.2026 – 22.11.2026“ — Kalendertage ohne Zeitzonen-Verschiebung. */
export function periodLabel(p: ExportPeriod): string {
  const d = (s: string) => s.split('-').reverse().join('.');
  return `${d(p.from)} – ${d(p.to)}`;
}

/** Braucht die Liste die Fahrten VOR dem Zeitraum? Nur wenn ein betroffenes Fahrzeug einen Anfangs-km-Stand hat. */
export function needsHistory(vehicles: Vehicle[], vehicleId: string | null): boolean {
  return vehicles.some((v) => (!vehicleId || v.id === vehicleId) && v.initialOdometerKm != null);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** km einer Fahrt auf 1 Stelle (wie App/PDF); fehlend/ungültig = leer. */
function km1(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? round1(n) : null;
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: EXPORT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Monat einer Fahrt in Ortszeit als [Sortierschlüssel „2026-11“, Anzeige „11.2026“]. */
function monthOf(iso: string): [string, string] {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return ['', '—'];
  const p: Record<string, string> = {};
  for (const part of dayFmt.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = part.value;
  return [`${p.year}-${p.month}`, `${p.month}.${p.year}`];
}

/** Ende als Uhrzeit — an einem anderen Kalendertag mit Datum (sonst wäre „00:20“ mehrdeutig). */
function endCell(start: string, end: string | null | undefined): XlsxValue | XlsxCell {
  if (!end) return null;
  return excelSerial(start, EXPORT_TZ, true) === excelSerial(end, EXPORT_TZ, true) ? end : { v: end, kind: 'datetime' };
}

const byStart = (a: TripSummary, b: TripSummary) => {
  const x = a.start_time ?? '';
  const y = b.start_time ?? '';
  return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

const categoryLabel = (c: TripCategory | null) => (c ? (CATEGORY_LABELS[c] ?? c) : null);
const isKnownCategory = (c: TripCategory | null): c is TripCategory => !!c && c in CATEGORY_LABELS;

function infoSheet(title: string, lines: [string, XlsxValue | XlsxCell][]): XlsxSheet {
  return {
    name: 'Info',
    table: false,
    landscape: false,
    columns: [{ header: '', width: 26 }, { header: '', width: 90 }],
    rows: [[{ v: title, bold: true }], [], ...lines.map(([k, v]) => (k ? [{ v: k, bold: true }, v] : []))],
  };
}

const NO_VEHICLE = '(ohne Fahrzeug)';
const GONE_VEHICLE = '(Fahrzeug nicht mehr vorhanden)';

export interface TripExportInput {
  /** Konto (TourDex ist ein Einzelkonto ohne Betrieb) */
  accountEmail: string;
  /** alle Fahrzeuge in Anzeige-Reihenfolge (fetchVehicles) */
  vehicles: Vehicle[];
  /** geladene Fahrten bis Zeitraum-Ende, beliebige Reihenfolge — auch vor dem Zeitraum (für den km-Stand) und Stornos */
  trips: TripSummary[];
  period: ExportPeriod;
  /** Grenzen wie in der Abfrage (ISO, lokale Mitternacht): Beginn inklusiv, Ende exklusiv */
  range: { fromIso: string; toIso: string };
  /** gewähltes Fahrzeug (null = alle) */
  vehicleId: string | null;
  /** nur für Tests */
  now?: Date;
}

export function tripSheets(input: TripExportInput): XlsxSheet[] {
  const vehicles = new Map(input.vehicles.map((v) => [v.id, v]));
  const order = new Map(input.vehicles.map((v, i) => [v.id, i]));
  const sorted = input.trips
    .filter((t) => !!t.start_time && t.start_time < input.range.toIso && (!input.vehicleId || t.vehicle_id === input.vehicleId))
    .sort(byStart);
  const prior = sorted.filter((t) => t.start_time! < input.range.fromIso);
  const inPeriod = sorted.filter((t) => t.start_time! >= input.range.fromIso);
  if (inPeriod.length === 0) throw new ExportNotice('Im gewählten Zeitraum gibt es keine Fahrten.');
  const valid = inPeriod.filter((t) => !t.canceled);
  const canceled = inPeriod.filter((t) => t.canceled);

  // km-Stand je Fahrzeug fortlaufend — wie im Fahrtenbuch-PDF
  const odo = new Map<string, OdometerEntry>();
  for (const v of input.vehicles) {
    if (v.initialOdometerKm == null) continue;
    const own = (list: TripSummary[]) => list.filter((t) => t.vehicle_id === v.id);
    for (const [id, e] of odometerById(v, own(prior), own(valid))) odo.set(id, e);
  }

  const vehicleName = (id: string | null) => (id ? (vehicles.get(id)?.name ?? GONE_VEHICLE) : NO_VEHICLE);
  const plate = (id: string | null) => (id && vehicles.get(id)?.licensePlate) || null;

  const rows = valid.map((t) => {
    const o = odo.get(t.id);
    return [
      t.start_time,
      t.start_time,
      endCell(t.start_time!, t.end_time),
      vehicleName(t.vehicle_id),
      plate(t.vehicle_id),
      t.start_address,
      t.end_address,
      km1(t.distance_km),
      categoryLabel(t.category),
      t.purpose,
      o ? Math.round(o.startKm) : null,
      o ? Math.round(o.endKm) : null,
      o?.corrected ? 'ja' : null,
      t.confirmed ? 'bestätigt' : 'unbestätigt',
      t.manual ? 'manuell' : 'GPS',
    ];
  });

  // Je Fahrzeug und Monat (Ortszeit des Fahrtbeginns)
  interface Sum {
    vehicleId: string | null;
    monthKey: string;
    month: string;
    count: number;
    total: number;
    by: Record<TripCategory, number>;
    none: number;
    unconfirmed: number;
  }
  const sums = new Map<string, Sum>();
  for (const t of valid) {
    const [monthKey, month] = monthOf(t.start_time!);
    const key = `${t.vehicle_id ?? ''}|${monthKey}`;
    let s = sums.get(key);
    if (!s) {
      s = { vehicleId: t.vehicle_id, monthKey, month, count: 0, total: 0, by: { business: 0, private: 0, commute: 0 }, none: 0, unconfirmed: 0 };
      sums.set(key, s);
    }
    const k = km1(t.distance_km) ?? 0;
    s.count++;
    s.total = round1(s.total + k);
    if (isKnownCategory(t.category)) s.by[t.category] = round1(s.by[t.category] + k);
    else s.none = round1(s.none + k);
    if (!t.confirmed) s.unconfirmed++;
  }
  const rank = (id: string | null) => (id === null ? Number.MAX_SAFE_INTEGER : (order.get(id) ?? Number.MAX_SAFE_INTEGER - 1));
  const sumList = [...sums.values()].sort((a, b) => rank(a.vehicleId) - rank(b.vehicleId) || (a.monthKey < b.monthKey ? -1 : a.monthKey > b.monthKey ? 1 : 0));
  const hasNone = valid.some((t) => !isKnownCategory(t.category));
  const share = (part: number, total: number) => (total > 0 ? round1((part / total) * 100) : null);

  const totals = { total: 0, business: 0, private: 0, commute: 0, none: 0 };
  for (const s of sumList) {
    totals.total = round1(totals.total + s.total);
    totals.business = round1(totals.business + s.by.business);
    totals.private = round1(totals.private + s.by.private);
    totals.commute = round1(totals.commute + s.by.commute);
    totals.none = round1(totals.none + s.none);
  }
  const unconfirmed = valid.filter((t) => !t.confirmed).length;

  const sheets: XlsxSheet[] = [
    {
      name: 'Fahrten',
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Beginn', kind: 'time' },
        { header: 'Ende', kind: 'time' },
        { header: 'Fahrzeug' },
        { header: 'Kennzeichen' },
        { header: 'Start' },
        { header: 'Ziel' },
        { header: 'km', kind: 'dec1' },
        { header: 'Art' },
        { header: 'Zweck / Anlass' },
        { header: 'km-Stand Beginn', kind: 'int' },
        { header: 'km-Stand Ende', kind: 'int' },
        { header: 'Tachostand eingetragen' },
        { header: 'Status' },
        { header: 'Erfassung' },
      ],
      rows,
    },
    {
      name: 'Je Fahrzeug und Monat',
      columns: [
        { header: 'Fahrzeug' },
        { header: 'Kennzeichen' },
        { header: 'Monat' },
        { header: 'Fahrten', kind: 'int' },
        { header: 'km gesamt', kind: 'dec1' },
        { header: `km ${CATEGORY_LABELS.business.toLowerCase()}`, kind: 'dec1' },
        { header: `km ${CATEGORY_LABELS.private.toLowerCase()}`, kind: 'dec1' },
        { header: `km ${CATEGORY_LABELS.commute}`, kind: 'dec1' },
        ...(hasNone ? [{ header: 'km ohne Art', kind: 'dec1' as const }] : []),
        { header: `Anteil ${CATEGORY_LABELS.business.toLowerCase()} (%)`, kind: 'dec1' },
        { header: 'davon unbestätigt', kind: 'int' },
      ],
      rows: sumList.map((s) => [
        vehicleName(s.vehicleId),
        plate(s.vehicleId),
        s.month,
        s.count,
        s.total,
        s.by.business,
        s.by.private,
        s.by.commute,
        ...(hasNone ? [s.none] : []),
        share(s.by.business, s.total),
        s.unconfirmed,
      ]),
    },
  ];
  if (canceled.length) {
    sheets.push({
      name: 'Storniert',
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Beginn', kind: 'time' },
        { header: 'Fahrzeug' },
        { header: 'Start' },
        { header: 'Ziel' },
        { header: 'km', kind: 'dec1' },
        { header: 'Art' },
        { header: 'Zweck / Anlass' },
        { header: 'Storniert am', kind: 'datetime' },
        { header: 'Storno-Grund' },
      ],
      rows: canceled.map((t) => [
        t.start_time,
        t.start_time,
        vehicleName(t.vehicle_id),
        t.start_address,
        t.end_address,
        km1(t.distance_km),
        categoryLabel(t.category),
        t.purpose,
        t.canceled_at,
        t.cancel_reason,
      ]),
    });
  }

  const one = input.vehicleId ? vehicles.get(input.vehicleId) : undefined;
  const kmLine = (label: string, v: number): [string, XlsxCell] => [label, { v, kind: 'dec1' }];
  sheets.push(
    infoSheet('TourDex · Fahrtenliste', [
      ['Konto', input.accountEmail],
      [
        'Fahrzeug',
        input.vehicleId ? [one?.name ?? GONE_VEHICLE, one?.licensePlate].filter(Boolean).join(' · ') : 'Alle Fahrzeuge',
      ],
      ['Zeitraum', periodLabel(input.period)],
      ['Erstellt', fmtDateTime((input.now ?? new Date()).toISOString())],
      ['Fahrten', { v: valid.length, kind: 'int' }],
      ['davon unbestätigt', unconfirmed ? `${unconfirmed} — für ein sauberes Fahrtenbuch vorher in der App bestätigen` : 'keine'],
      kmLine('km gesamt', totals.total),
      kmLine(`km ${CATEGORY_LABELS.business.toLowerCase()}`, totals.business),
      kmLine(`km ${CATEGORY_LABELS.private.toLowerCase()}`, totals.private),
      kmLine(`km ${CATEGORY_LABELS.commute}`, totals.commute),
      ...(hasNone ? [kmLine('km ohne Art', totals.none)] : []),
      [`Anteil ${CATEGORY_LABELS.business.toLowerCase()} (%)`, { v: share(totals.business, totals.total), kind: 'dec1' }],
      ['Storniert', canceled.length ? `${canceled.length} (eigenes Blatt „Storniert“, nicht in den Summen)` : 'keine'],
      ['', null],
      ['Hinweis', EXPORT_NOTE],
      ['Zeiten', 'Alle Zeiten in Ortszeit (Mitteleuropa). Endet eine Fahrt an einem anderen Tag, steht beim Ende das Datum dabei.'],
      ['Kilometer', 'Je Fahrt auf 1 Nachkommastelle gerundet (wie in der App); alle Summen aus den gerundeten Zeilen.'],
      [
        'km-Stand',
        'Fortlaufend aus dem Anfangs-Kilometerstand des Fahrzeugs und den gefahrenen Kilometern — wie im Fahrtenbuch-PDF; ein in der App eingetragener Tachostand setzt den Stand neu. Ohne Anfangsstand beim Fahrzeug bleibt die Spalte leer.',
      ],
    ]),
  );
  return sheets;
}
