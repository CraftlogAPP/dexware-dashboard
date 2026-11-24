// ObjektDex — Einsätze als Excel-Liste zum Abrechnen (Dashboard, Seite „Einsätze“). Reine Logik ohne React.
// Aufbau wie die WinterDex-Listen (winterdex/exportLists.ts):
//   1. „Einsätze“: gültige Einsätze chronologisch (Stornos stehen NICHT darin — Spalten lassen sich direkt summieren)
//   2. „Je Objekt“: Summen je Objekt (Rechnungsgrundlage), ohne Objekt-Filter auch aktive Objekte ohne Einsatz
//   3. „Je Leistung“: wie oft jede Leistung je Objekt erledigt wurde (Abrechnung nach Leistungsverzeichnis)
//   4. „Storniert“ mit Grund (nur wenn es Stornos gibt) — append-only bleibt nachvollziehbar
//   5. „Info“: Betrieb, Filter, Zeitraum, Stand, Hinweis „kein Nachweis“
// Keine Fotos, keine Koordinaten in der Datei (nur „Fotos: ja (2)“ und ob ein GPS-Stempel da ist).

import { excelSerial, type XlsxCell, type XlsxSheet, type XlsxValue } from '../lib/xlsx';
import { fmtDateTime } from '../lib/format';
import { formatDay, type Day } from './turnus';
import type { OdOperation, OdProperty } from './types';

export const EXPORT_TZ = 'Europe/Berlin';

export const EXPORT_NOTE =
  'Arbeitsliste zum Abrechnen und Auswerten — kein Nachweis. Eine Excel-Datei lässt sich ändern; als Nachweis dient das Nachweis-PDF aus ObjektDex (Soll/Ist, GPS-Stempel, Prüfcode).';
const TIME_NOTE =
  'Alle Zeiten in Ortszeit (Mitteleuropa). Dauer = Ende − Beginn in Stunden, auf 2 Stellen gerundet; Einsätze ohne Ende zählen ohne Stunden.';
const KONTROLLE = 'Kontrolle vor Ort';
const GONE = '(Objekt nicht mehr vorhanden)';

export interface EinsatzExportInput {
  orgName: string;
  properties: Pick<OdProperty, 'id' | 'name' | 'address' | 'customer_name' | 'active'>[];
  /** alle Einsätze im Zeitraum (inkl. Stornos), beliebige Reihenfolge — schon nach Person gefiltert */
  ops: OdOperation[];
  from: Day;
  to: Day;
  /** gewähltes Objekt (null = alle) */
  propertyId: string | null;
  /** Personen-Filter der Seite ('' = alle) */
  person: string;
}

/** Stunden zwischen zwei Zeitpunkten, 2 Stellen; ohne Ende oder Ende vor Beginn = leer. */
export function stunden(start: string, end: string | null | undefined): number | null {
  if (!end) return null;
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 36e5) * 100) / 100;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const cmpText = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true });
const byStart = (a: OdOperation, b: OdOperation) => (a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const proofCode = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : null);

/** Ende als Uhrzeit — an einem anderen Kalendertag mit Datum */
function endCell(start: string, end: string | null): XlsxValue | XlsxCell {
  if (!end) return null;
  return excelSerial(start, EXPORT_TZ, true) === excelSerial(end, EXPORT_TZ, true) ? end : { v: end, kind: 'datetime' };
}

export function leistungenText(o: Pick<OdOperation, 'services'>): string {
  const names = (o.services ?? []).map((s) => s.name).filter(Boolean);
  return names.length ? names.join(', ') : KONTROLLE;
}

export function fotosText(n: number | null | undefined): string {
  return n && n > 0 ? `ja (${n})` : 'nein';
}

export function gpsText(o: Pick<OdOperation, 'lat' | 'lng' | 'gps_accuracy_m' | 'gps_mocked'>): string {
  if (o.gps_mocked) return 'Fake-GPS gemeldet';
  if (o.lat == null || o.lng == null) return 'nein';
  return o.gps_accuracy_m != null ? `ja (±${Math.round(o.gps_accuracy_m)} m)` : 'ja';
}

export function periodLabel(from: Day, to: Day): string {
  return `${formatDay(from)} – ${formatDay(to)}`;
}

export function einsatzSheets(input: EinsatzExportInput): XlsxSheet[] {
  const props = new Map(input.properties.map((p) => [p.id, p]));
  const ops = [...input.ops].sort(byStart);
  const valid = ops.filter((o) => !o.canceled);
  const canceled = ops.filter((o) => o.canceled);

  const rows = valid.map((o) => {
    const p = props.get(o.property_id);
    return [
      o.started_at,
      o.started_at,
      endCell(o.started_at, o.ended_at),
      stunden(o.started_at, o.ended_at),
      p?.name ?? GONE,
      p?.address || null,
      p?.customer_name ?? null,
      leistungenText(o),
      o.performer_name,
      fotosText(o.photo_count),
      gpsText(o),
      o.notes,
      proofCode(o.entry_hash),
    ];
  });

  interface Sum {
    id: string;
    count: number;
    hours: number;
    noEnd: number;
    photos: number;
    first: string | null;
    last: string | null;
    canceled: number;
  }
  const sums = new Map<string, Sum>();
  const sumOf = (id: string) => {
    let s = sums.get(id);
    if (!s) {
      s = { id, count: 0, hours: 0, noEnd: 0, photos: 0, first: null, last: null, canceled: 0 };
      sums.set(id, s);
    }
    return s;
  };
  if (!input.propertyId) {
    for (const p of input.properties) if (p.active) sumOf(p.id);
  } else if (props.has(input.propertyId)) sumOf(input.propertyId);
  // je Objekt + Leistung: wie oft erledigt
  const perService = new Map<string, { pid: string; name: string; count: number; last: string }>();
  for (const o of valid) {
    const s = sumOf(o.property_id);
    s.count++;
    const h = stunden(o.started_at, o.ended_at);
    if (h === null) s.noEnd++;
    else s.hours = round2(s.hours + h);
    if (o.photo_count > 0) s.photos++;
    s.first ??= o.started_at;
    s.last = o.started_at;
    const names = (o.services ?? []).map((x) => x.name).filter(Boolean);
    for (const name of names.length ? [...new Set(names)] : [KONTROLLE]) {
      const k = `${o.property_id}|${name}`;
      const e = perService.get(k) ?? { pid: o.property_id, name, count: 0, last: o.started_at };
      e.count++;
      e.last = o.started_at;
      perService.set(k, e);
    }
  }
  for (const o of canceled) sumOf(o.property_id).canceled++;
  const pName = (id: string) => props.get(id)?.name ?? GONE;
  const byCustomer = (a: string, b: string) => {
    const pa = props.get(a);
    const pb = props.get(b);
    return (
      Number(!pa?.customer_name) - Number(!pb?.customer_name) ||
      cmpText(pa?.customer_name ?? '', pb?.customer_name ?? '') ||
      cmpText(pName(a), pName(b))
    );
  };
  const sumRows = [...sums.values()]
    .sort((a, b) => byCustomer(a.id, b.id))
    .map((s) => {
      const p = props.get(s.id);
      return [pName(s.id), p?.address || null, p?.customer_name ?? null, s.count, s.hours, s.noEnd, s.photos, s.first, s.last, s.canceled];
    });
  const serviceRows = [...perService.values()]
    .sort((a, b) => byCustomer(a.pid, b.pid) || cmpText(a.name, b.name))
    .map((e) => [pName(e.pid), props.get(e.pid)?.customer_name ?? null, e.name, e.count, e.last]);

  const totalHours = round2(valid.reduce((a, o) => a + (stunden(o.started_at, o.ended_at) ?? 0), 0));
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
        { header: 'Leistungen' },
        { header: 'Durchgeführt von' },
        { header: 'Fotos' },
        { header: 'GPS-Stempel' },
        { header: 'Notiz' },
        { header: 'Prüfcode' },
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
        { header: 'Stunden', kind: 'dec2' },
        { header: 'Ohne Ende (ohne Stunden)', kind: 'int' },
        { header: 'Mit Fotos', kind: 'int' },
        { header: 'Erster Einsatz', kind: 'datetime' },
        { header: 'Letzter Einsatz', kind: 'datetime' },
        { header: 'Storniert', kind: 'int' },
      ],
      rows: sumRows,
    },
    {
      name: 'Je Leistung',
      columns: [{ header: 'Objekt' }, { header: 'Auftraggeber' }, { header: 'Leistung' }, { header: 'Erledigt (Einsätze)', kind: 'int' }, { header: 'Zuletzt', kind: 'datetime' }],
      rows: serviceRows,
    },
  ];
  if (canceled.length) {
    sheets.push({
      name: 'Storniert',
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Beginn', kind: 'time' },
        { header: 'Objekt' },
        { header: 'Leistungen' },
        { header: 'Durchgeführt von' },
        { header: 'Storniert am', kind: 'datetime' },
        { header: 'Storno-Grund' },
        { header: 'Prüfcode' },
      ],
      rows: canceled.map((o) => [o.started_at, o.started_at, pName(o.property_id), leistungenText(o), o.performer_name, o.canceled_at, o.cancel_reason, proofCode(o.entry_hash)]),
    });
  }
  const info: [string, XlsxValue | XlsxCell][] = [
    ['Betrieb', input.orgName],
    ['Objekt', input.propertyId ? pName(input.propertyId) : 'Alle Objekte'],
    ...(input.person.trim() ? ([['Person', `nur „${input.person.trim()}“`]] as [string, XlsxValue][]) : []),
    ['Zeitraum', periodLabel(input.from, input.to)],
    ['Erstellt', fmtDateTime(new Date().toISOString())],
    ['Einsätze', { v: valid.length, kind: 'int' }],
    ['Stunden gesamt', { v: totalHours, kind: 'dec2' }],
    ['Storniert', canceled.length ? `${canceled.length} (eigenes Blatt „Storniert“, nicht in den Summen)` : 'keine'],
    ['', null],
    ['Hinweis', EXPORT_NOTE],
    ['Zeiten', TIME_NOTE],
    ['Je Leistung', 'Ein Einsatz mit mehreren Leistungen zählt bei jeder Leistung einmal. Einsätze ohne Leistung stehen als „Kontrolle vor Ort“.'],
  ];
  sheets.push({
    name: 'Info',
    table: false,
    landscape: false,
    columns: [{ header: '', width: 24 }, { header: '', width: 90 }],
    rows: [[{ v: 'ObjektDex · Einsatzliste', bold: true }], [], ...info.map(([k, v]) => (k ? [{ v: k, bold: true }, v] : []))],
  });
  return sheets;
}

/** Dateiname ohne Endung, z. B. „ObjektDex_Einsaetze_2027-04-01_bis_2027-04-30“ */
export const einsatzDateiname = (from: Day, to: Day) => `ObjektDex_Einsaetze_${from}_bis_${to}`;
