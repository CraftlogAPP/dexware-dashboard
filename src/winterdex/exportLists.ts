// WinterDex — Einsätze, Strecken-Fahrten und Objekte als Excel-Liste (Dashboard). Reine Logik ohne React.
//
// Zweck: ABRECHNEN und AUSWERTEN (Rechnung je Auftraggeber, Bauhof-Stunden, Kontrolle). Kein Nachweis — eine
// Excel-Datei lässt sich beliebig ändern; rechtssicher bleibt das Nachweis-PDF (GPS-Stempel, Wetter, Prüfcode).
// Aufbau jeder Liste:
//   1. gültige Einträge chronologisch — Spalten lassen sich direkt summieren (Stornos stehen NICHT darin)
//   2. Summen je Objekt bzw. Strecke (Rechnungsgrundlage)
//   3. „Storniert“ mit Grund (nur wenn es Stornos gibt) — append-only bleibt nachvollziehbar
//   4. „Info“: Betrieb, Filter, Zeitraum, Stand, Hinweis „kein Nachweis“
// Stunden: je Zeile auf 2 Stellen gerundet, Summen aus den gerundeten Zeilen (Excel-Summe = Summe im Blatt).

import { excelSerial, type XlsxCell, type XlsxSheet, type XlsxValue } from '../lib/xlsx';
import { fmtDateTime } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { GPS_WEAK_M } from './einsatz/gps';
import { WEATHER_SOURCE, weatherLabel } from './labels';
import { excelWetter, quellenTexte, type WetterBeleg, type WetterInfo } from './wetterBeleg';
import type { RunMeta } from './routes';
import { ACTION_LABELS, type Operation, type OperationAction, type Property } from './types';

export const EXPORT_TZ = 'Europe/Berlin';

export const EXPORT_NOTE =
  'Arbeitsliste zum Abrechnen und Auswerten — kein Nachweis. Eine Excel-Datei lässt sich ändern; rechtssicherer Nachweis ist das Nachweis-PDF aus WinterDex (GPS-Stempel, Wetter, Prüfcode).';

const TIME_NOTE =
  'Alle Zeiten in Ortszeit (Mitteleuropa). Dauer = Ende − Beginn in Stunden, auf 2 Stellen gerundet; Einträge ohne Ende zählen ohne Stunden.';

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

/** Stunden zwischen zwei Zeitpunkten, 2 Stellen; ohne Ende oder unplausibel (Ende vor Beginn) = leer. */
export function hoursBetween(start: string, end: string | null | undefined): number | null {
  if (!end) return null;
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 36e5) * 100) / 100;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Ende als Uhrzeit — an einem anderen Kalendertag mit Datum (sonst wäre „00:20“ mehrdeutig). */
function endCell(start: string, end: string | null | undefined): XlsxValue | XlsxCell {
  if (!end) return null;
  return excelSerial(start, EXPORT_TZ, true) === excelSerial(end, EXPORT_TZ, true) ? end : { v: end, kind: 'datetime' };
}

function gpsCell(op: Operation): string {
  if (op.gps_mocked || op.end_mocked) return 'Fake-GPS gemeldet';
  if (op.lat == null || op.lng == null) return op.nachgetragen ? 'nein (nachgetragen)' : 'nein';
  if (op.gps_accuracy_m != null && op.gps_accuracy_m > GPS_WEAK_M) return `ungenau (±${Math.round(op.gps_accuracy_m)} m)`;
  return 'ja';
}

const proofCode = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : null);

// Wetterverlauf (Bauplan P3): zwei Spalten, aber nur wenn für mindestens einen Eintrag ein Stand ≠ „aus“ geladen wurde
const hatWetter = (w: Map<string, WetterInfo> | null | undefined, xs: Array<{ id: string }>) => !!w && xs.some((x) => { const i = w.get(x.id); return !!i && i.stand !== 'aus'; });
const WETTER_SPALTEN = (an: boolean) => (an ? [{ header: 'Wetter (Kurzsatz)', width: 48 }, { header: 'Wetter-Prüfcode' }] : []);
/** Info-Blatt: Quellen nur der tatsächlich enthaltenen Belege */
function wetterInfo(w: Map<string, WetterInfo> | null | undefined, xs: Array<{ id: string }>): [string, XlsxValue][] {
  if (!hatWetter(w, xs)) return [];
  const belege = xs.map((x) => w?.get(x.id)?.beleg).filter((b): b is WetterBeleg => !!b);
  const q = quellenTexte(belege);
  return [['Wetterverlauf', 'Kurzsatz aus dem versiegelten Wetterverlauf je Nachweis (Wetter-Prüfcode = erste 12 Zeichen des SHA-256). Zeiten auf 15 Min. gerundet, keine Bewertung.'], ...q.map((t, i): [string, XlsxValue] => [i === 0 ? 'Wetterdaten' : '', t])];
}
const byStart = <T extends { started_at: string; id: string }>(a: T, b: T) =>
  a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const cmpText = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true });

function infoSheet(title: string, lines: [string, XlsxValue | XlsxCell][]): XlsxSheet {
  return {
    name: 'Info',
    table: false,
    landscape: false,
    columns: [{ header: '', width: 24 }, { header: '', width: 90 }],
    rows: [[{ v: title, bold: true }], [], ...lines.map(([k, v]) => (k ? [{ v: k, bold: true }, v] : []))],
  };
}

const created = () => fmtDateTime(new Date().toISOString());

// ---------------------------------------------------------------------------- Einsätze

export interface OperationExportInput {
  org: Org;
  properties: Property[];
  /** alle Einsätze im Zeitraum (inkl. Stornos), beliebige Reihenfolge */
  ops: Operation[];
  period: ExportPeriod;
  /** gewähltes Objekt (null = alle) */
  propertyId: string | null;
  /** Wetterverlauf je Einsatz (wetter_beleg) — mit Daten kommen die Spalten „Wetter (Kurzsatz)“, „Wetter-Prüfcode“ dazu */
  wetter?: Map<string, WetterInfo> | null;
}

export function operationSheets(input: OperationExportInput): XlsxSheet[] {
  const props = new Map(input.properties.map((p) => [p.id, p]));
  const ops = [...input.ops].sort(byStart);
  const valid = ops.filter((o) => !o.canceled);
  const canceled = ops.filter((o) => o.canceled);
  const gone = '(Objekt nicht mehr vorhanden)';
  const mitWetter = hatWetter(input.wetter, valid);

  const rows = valid.map((op) => {
    const p = props.get(op.property_id);
    return [
      op.started_at,
      op.started_at,
      endCell(op.started_at, op.ended_at),
      hoursBetween(op.started_at, op.ended_at),
      p?.name ?? gone,
      p?.address ?? null,
      p?.customer_name ?? null,
      ACTION_LABELS[op.action] ?? op.action,
      op.grit_material,
      op.grit_amount,
      op.performer_name,
      op.weather ? weatherLabel(op.weather) : null,
      gpsCell(op),
      op.notes,
      proofCode(op.entry_hash),
      ...(mitWetter ? excelWetter(input.wetter?.get(op.id), 'operation') : []),
    ];
  });

  // Je Objekt: Rechnungsgrundlage. Ohne Objekt-Filter auch aktive Objekte ohne Einsatz (Kontrolle „wo waren wir nicht“).
  interface Sum {
    id: string;
    count: number;
    by: Record<OperationAction, number>;
    hours: number;
    noEnd: number;
    first: string | null;
    last: string | null;
    canceled: number;
  }
  const sums = new Map<string, Sum>();
  const sumOf = (id: string) => {
    let s = sums.get(id);
    if (!s) {
      s = { id, count: 0, by: { cleared: 0, gritted: 0, cleared_gritted: 0, checked_no_action: 0 }, hours: 0, noEnd: 0, first: null, last: null, canceled: 0 };
      sums.set(id, s);
    }
    return s;
  };
  if (!input.propertyId) {
    for (const p of input.properties) if (p.active) sumOf(p.id);
  } else if (props.has(input.propertyId)) {
    sumOf(input.propertyId);
  }
  for (const op of valid) {
    const s = sumOf(op.property_id);
    s.count++;
    if (op.action in s.by) s.by[op.action]++;
    const h = hoursBetween(op.started_at, op.ended_at);
    if (h === null) s.noEnd++;
    else s.hours = round2(s.hours + h);
    s.first ??= op.started_at;
    s.last = op.started_at;
  }
  for (const op of canceled) sumOf(op.property_id).canceled++;
  const sumRows = [...sums.values()]
    .map((s) => ({ s, p: props.get(s.id) }))
    .sort(
      (a, b) =>
        // Auftraggeber zusammen (ohne Auftraggeber zuletzt), darin nach Objekt
        Number(!a.p?.customer_name) - Number(!b.p?.customer_name) ||
        cmpText(a.p?.customer_name ?? '', b.p?.customer_name ?? '') ||
        cmpText(a.p?.name ?? gone, b.p?.name ?? gone),
    )
    .map(({ s, p }) => [
      p?.name ?? gone,
      p?.address ?? null,
      p?.customer_name ?? null,
      s.count,
      s.by.cleared,
      s.by.gritted,
      s.by.cleared_gritted,
      s.by.checked_no_action,
      s.hours,
      s.noEnd,
      s.first,
      s.last,
      s.canceled,
    ]);

  const totalHours = round2(valid.reduce((a, o) => a + (hoursBetween(o.started_at, o.ended_at) ?? 0), 0));
  const sheets: XlsxSheet[] = [
    {
      name: 'Einsätze',
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Beginn', kind: 'time' },
        { header: 'Ende', kind: 'time' },
        { header: 'Dauer (Std.)', kind: 'dec2' },
        { header: 'Objekt' },
        { header: 'Adresse' },
        { header: 'Auftraggeber' },
        { header: 'Maßnahme' },
        { header: 'Streumittel' },
        { header: 'Streumenge' },
        { header: 'Durchgeführt von' },
        { header: 'Wetter (archiviert)' },
        { header: 'GPS-Stempel' },
        { header: 'Notiz' },
        { header: 'Prüfcode' },
        ...WETTER_SPALTEN(mitWetter),
      ],
      rows,
    },
    {
      name: 'Je Objekt',
      columns: [
        { header: 'Objekt' },
        { header: 'Adresse' },
        { header: 'Auftraggeber' },
        { header: 'Einsätze', kind: 'int' },
        { header: 'Geräumt', kind: 'int' },
        { header: 'Gestreut', kind: 'int' },
        { header: 'Geräumt + gestreut', kind: 'int' },
        { header: 'Kontrolliert, keine Maßnahme', kind: 'int' },
        { header: 'Stunden', kind: 'dec2' },
        { header: 'Ohne Ende (ohne Stunden)', kind: 'int' },
        { header: 'Erster Einsatz', kind: 'datetime' },
        { header: 'Letzter Einsatz', kind: 'datetime' },
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
        { header: 'Beginn', kind: 'time' },
        { header: 'Objekt' },
        { header: 'Maßnahme' },
        { header: 'Durchgeführt von' },
        { header: 'Storniert am', kind: 'datetime' },
        { header: 'Storno-Grund' },
        { header: 'Prüfcode' },
      ],
      rows: canceled.map((op) => [
        op.started_at,
        op.started_at,
        props.get(op.property_id)?.name ?? gone,
        ACTION_LABELS[op.action] ?? op.action,
        op.performer_name,
        op.canceled_at,
        op.cancel_reason,
        proofCode(op.entry_hash),
      ]),
    });
  }
  sheets.push(
    infoSheet('WinterDex · Einsatzliste', [
      ['Betrieb', input.org.name],
      ['Objekt', input.propertyId ? (props.get(input.propertyId)?.name ?? gone) : 'Alle Objekte'],
      ['Zeitraum', periodLabel(input.period)],
      ['Erstellt', created()],
      ['Einsätze', { v: valid.length, kind: 'int' }],
      ['Stunden gesamt', { v: totalHours, kind: 'dec2' }],
      ['Storniert', canceled.length ? `${canceled.length} (eigenes Blatt „Storniert“, nicht in den Summen)` : 'keine'],
      ['', null],
      ['Hinweis', EXPORT_NOTE],
      ['Zeiten', TIME_NOTE],
      ['Wetter', WEATHER_SOURCE],
      ...wetterInfo(input.wetter, valid),
    ]),
  );
  return sheets;
}

// ---------------------------------------------------------------------------- Strecken-Fahrten

export interface RunExportInput {
  org: Org;
  /** alle Fahrten im Zeitraum (inkl. Stornos), beliebige Reihenfolge */
  runs: RunMeta[];
  period: ExportPeriod;
  /** Beschreibung des Filters, z. B. „Alle Fahrten“ oder der Streckenname */
  filterLabel: string;
  /** Wetterverlauf je Fahrt (wetter_beleg) — mit Daten zwei Spalten mehr */
  wetter?: Map<string, WetterInfo> | null;
}

const FREE_RUN = 'Freie Fahrt (ohne Vorlage)';
const km = (m: number | null | undefined) => (m == null || !Number.isFinite(m) ? null : Math.round(m / 10) / 100);

function runFlags(r: RunMeta): string | null {
  const f: string[] = [];
  if (r.gps_mocked) f.push('Fake-GPS gemeldet');
  if (r.gaps?.length) f.push(`${r.gaps.length}× Aufzeichnung unterbrochen`);
  if (r.nachgetragen) f.push('nachgemeldet ohne Fahrtpunkte');
  return f.length ? f.join(', ') : null;
}

export function runSheets(input: RunExportInput): XlsxSheet[] {
  const runs = [...input.runs].sort(byStart);
  const valid = runs.filter((r) => !r.canceled);
  const canceled = runs.filter((r) => r.canceled);
  const routeName = (r: RunMeta) => r.route_name ?? FREE_RUN;
  const mitWetter = hatWetter(input.wetter, valid);

  const rows = valid.map((r) => [
    r.started_at,
    r.started_at,
    endCell(r.started_at, r.ended_at),
    hoursBetween(r.started_at, r.ended_at),
    routeName(r),
    km(r.track_length_m),
    r.coverage_pct,
    r.missed_m == null ? null : Math.round(r.missed_m),
    ACTION_LABELS[r.action] ?? r.action,
    r.grit_material,
    r.grit_amount,
    r.performer_name,
    r.weather ? weatherLabel(r.weather) : null,
    runFlags(r),
    r.notes,
    proofCode(r.entry_hash),
    ...(mitWetter ? excelWetter(input.wetter?.get(r.id), 'run') : []),
  ]);

  interface Sum {
    name: string;
    count: number;
    km: number;
    hours: number;
    cov: number[];
    under95: number;
    first: string | null;
    last: string | null;
    canceled: number;
  }
  const sums = new Map<string, Sum>();
  const keyOf = (r: RunMeta) => r.route_id ?? `name:${routeName(r)}`;
  const sumOf = (r: RunMeta) => {
    const k = keyOf(r);
    let s = sums.get(k);
    if (!s) {
      s = { name: routeName(r), count: 0, km: 0, hours: 0, cov: [], under95: 0, first: null, last: null, canceled: 0 };
      sums.set(k, s);
    }
    return s;
  };
  for (const r of valid) {
    const s = sumOf(r);
    s.count++;
    s.km = round2(s.km + (km(r.track_length_m) ?? 0));
    s.hours = round2(s.hours + (hoursBetween(r.started_at, r.ended_at) ?? 0));
    if (r.coverage_pct != null) {
      s.cov.push(r.coverage_pct);
      if (r.coverage_pct < 95) s.under95++;
    }
    s.first ??= r.started_at;
    s.last = r.started_at;
  }
  for (const r of canceled) sumOf(r).canceled++;
  const sumRows = [...sums.values()]
    .sort((a, b) => Number(a.name === FREE_RUN) - Number(b.name === FREE_RUN) || cmpText(a.name, b.name))
    .map((s) => [
      s.name,
      s.count,
      s.km,
      s.hours,
      s.cov.length ? Math.round((s.cov.reduce((a, c) => a + c, 0) / s.cov.length) * 10) / 10 : null,
      s.cov.length ? s.under95 : null,
      s.first,
      s.last,
      s.canceled,
    ]);

  const sheets: XlsxSheet[] = [
    {
      name: 'Fahrten',
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Beginn', kind: 'time' },
        { header: 'Ende', kind: 'time' },
        { header: 'Dauer (Std.)', kind: 'dec2' },
        { header: 'Strecke' },
        { header: 'Gefahren (km)', kind: 'dec2' },
        { header: 'Abdeckung (%)', kind: 'dec1' },
        { header: 'Nicht befahren (m)', kind: 'int' },
        { header: 'Maßnahme' },
        { header: 'Streumittel' },
        { header: 'Streumenge' },
        { header: 'Durchgeführt von' },
        { header: 'Wetter (archiviert)' },
        { header: 'Auffälligkeiten' },
        { header: 'Notiz' },
        { header: 'Prüfcode' },
        ...WETTER_SPALTEN(mitWetter),
      ],
      rows,
    },
    {
      name: 'Je Strecke',
      columns: [
        { header: 'Strecke' },
        { header: 'Fahrten', kind: 'int' },
        { header: 'Kilometer', kind: 'dec2' },
        { header: 'Stunden', kind: 'dec2' },
        { header: 'Ø Abdeckung (%)', kind: 'dec1' },
        { header: 'Unter 95 % abgedeckt', kind: 'int' },
        { header: 'Erste Fahrt', kind: 'datetime' },
        { header: 'Letzte Fahrt', kind: 'datetime' },
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
        { header: 'Beginn', kind: 'time' },
        { header: 'Strecke' },
        { header: 'Durchgeführt von' },
        { header: 'Storniert am', kind: 'datetime' },
        { header: 'Storno-Grund' },
        { header: 'Prüfcode' },
      ],
      rows: canceled.map((r) => [r.started_at, r.started_at, routeName(r), r.performer_name, r.canceled_at, r.cancel_reason, proofCode(r.entry_hash)]),
    });
  }
  const totalKm = round2(valid.reduce((a, r) => a + (km(r.track_length_m) ?? 0), 0));
  const totalHours = round2(valid.reduce((a, r) => a + (hoursBetween(r.started_at, r.ended_at) ?? 0), 0));
  sheets.push(
    infoSheet('WinterDex · Fahrtenliste (Strecken)', [
      ['Betrieb', input.org.name],
      ['Auswahl', input.filterLabel],
      ['Zeitraum', periodLabel(input.period)],
      ['Erstellt', created()],
      ['Fahrten', { v: valid.length, kind: 'int' }],
      ['Kilometer gesamt', { v: totalKm, kind: 'dec2' }],
      ['Stunden gesamt', { v: totalHours, kind: 'dec2' }],
      ['Storniert', canceled.length ? `${canceled.length} (eigenes Blatt „Storniert“, nicht in den Summen)` : 'keine'],
      ['', null],
      ['Hinweis', EXPORT_NOTE],
      ['Zeiten', TIME_NOTE],
      ['Abdeckung', 'Vom Server beim Eingang berechnet, nur bei Fahrten auf einer Strecke mit Vorlage.'],
      ['Wetter', WEATHER_SOURCE],
      ...wetterInfo(input.wetter, valid),
    ]),
  );
  return sheets;
}

// ---------------------------------------------------------------------------- Objekte

/**
 * Objektliste — Spalten so benannt, dass „Objekte importieren“ sie wieder erkennt.
 * Beim erneuten Import werden vorhandene Objekte (gleicher Name + Adresse) übersprungen, nur neue Zeilen angelegt.
 */
export function propertySheets(org: Org, properties: Property[]): XlsxSheet[] {
  const list = [...properties].sort((a, b) => Number(b.active) - Number(a.active) || cmpText(a.name, b.name));
  return [
    {
      name: 'Objekte',
      columns: [
        { header: 'Name' },
        { header: 'Adresse' },
        { header: 'Auftraggeber' },
        { header: 'Kontakt' },
        { header: 'Flächen' },
        { header: 'Notizen' },
        { header: 'Pflichtzeiten Mo–Fr' },
        { header: 'Pflichtzeiten Sa' },
        { header: 'Pflichtzeiten So/Feiertag' },
        { header: 'Status' },
        { header: 'Breitengrad', width: 12 },
        { header: 'Längengrad', width: 12 },
        { header: 'Angelegt am', kind: 'date' },
      ],
      rows: list.map((p) => [
        p.name,
        p.address,
        p.customer_name,
        p.customer_contact,
        p.areas,
        p.notes,
        p.duty_times?.mo_fr ?? null,
        p.duty_times?.sa ?? null,
        p.duty_times?.so ?? null,
        p.active ? 'aktiv' : 'pausiert',
        // Koordinaten als Text mit Punkt (6 Stellen) — als Zahl würde das Format sie auf 2 Stellen kürzen
        p.lat == null ? null : p.lat.toFixed(6),
        p.lng == null ? null : p.lng.toFixed(6),
        p.created_at,
      ]),
    },
    infoSheet('WinterDex · Objektliste', [
      ['Betrieb', org.name],
      ['Objekte', `${list.length} (davon ${list.filter((p) => p.active).length} aktiv)`],
      ['Erstellt', created()],
      ['', null],
      [
        'Wieder einlesen',
        'Die Liste lässt sich unter „Objekte importieren“ wieder einlesen: neue Zeilen werden angelegt, vorhandene Objekte (gleicher Name und gleiche Adresse) übersprungen. Änderungen an vorhandenen Objekten bitte direkt im Objekt — ein geänderter Name oder eine geänderte Adresse würde sonst ein ZWEITES Objekt anlegen.',
      ],
    ]),
  ];
}
