// Laufzettel — „Aufträge zum Abrechnen“ als Excel (Dashboard, Seite „Erledigt“). Reine Logik ohne React.
//
// Zweck: Rechnungen je Kunde schreiben und Stunden für die Lohnabrechnung übernehmen. Kein Nachweis — eine Excel-Datei
// lässt sich ändern; maßgeblich bleiben die Karten mit Verlauf in Laufzettel.
// Aufbau:
//   1. „Aufträge“: erledigte Aufträge chronologisch — Stunden lassen sich direkt summieren (Abgesagte stehen NICHT darin)
//   2. „Je Kunde“: Aufträge + Stunden (Rechnungsgrundlage)
//   3. „Zeiten“: je Monteur und Auftrag (wie die Seite „Zeiten“ und ihr PDF: gezählt beim zugewiesenen Monteur)
//   4. „Abgesagt“ (nur wenn mit angezeigt und vorhanden)
//   5. „Info“: Betrieb, Auswahl, Zeitraum, Stand, Summen, Hinweise
// Arbeitszeit: dieselbe Rechnung wie Zeiten-Seite/PDF (workSecondsNow, timesByWorker in logic.ts), je Auftrag auf
// 2 Stellen gerundet (roundHours = decimalHours), Summen aus den gerundeten Zeilen.
// Eigenständige Marke: im sichtbaren Inhalt nur „Laufzettel“.

import { excelSerial, ExportNotice, type XlsxCell, type XlsxSheet, type XlsxValue } from '../lib/xlsx';
import { fmtDateTime } from '../lib/format';
import { memberName, roundHours, timesByWorker, workDayIso, workSecondsNow } from './logic';
import { OUTCOME_LABEL, type ExportJob, type PinnMember } from './types';

export const EXPORT_TZ = 'Europe/Berlin';

export const EXPORT_NOTE =
  'Arbeitsliste zum Abrechnen und für die Lohnabrechnung — kein Nachweis. Eine Excel-Datei lässt sich ändern; maßgeblich sind die Aufträge mit Verlauf in Laufzettel.';

const WORK_NOTE =
  'Arbeitszeit = Summe der Strecken zwischen „Start“ und „Pause“/„Fertig“ in der Laufzettel-App, gezählt beim zugewiesenen Monteur (Helfer bekommen die Zeit nicht doppelt). Je Auftrag auf 2 Stellen gerundet, alle Summen aus den gerundeten Zeilen. Beginn und Fertig sind Zeitpunkte — Pausen dazwischen zählen nicht.';

export interface ExportPeriod {
  /** yyyy-mm-dd (lokale Kalendertage, beide inklusiv) */
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

const round2 = (n: number) => Math.round(n * 100) / 100;
const cmpText = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true });
const byFinished = (a: ExportJob, b: ExportJob) => {
  const x = a.finished_at ?? a.updated_at;
  const y = b.finished_at ?? b.updated_at;
  return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};
const sameDay = (a: string, b: string) => excelSerial(a, EXPORT_TZ, true) === excelSerial(b, EXPORT_TZ, true);

/** Beginn als Uhrzeit — an einem anderen Tag als die Fertigmeldung mit Datum (über Nacht/mehrere Tage). */
function startCell(start: string | null, finished: string | null): XlsxValue | XlsxCell {
  if (!start) return null;
  return !finished || sameDay(start, finished) ? start : { v: start, kind: 'datetime' };
}

function infoSheet(title: string, lines: [string, XlsxValue | XlsxCell][]): XlsxSheet {
  return {
    name: 'Info',
    table: false,
    landscape: false,
    columns: [{ header: '', width: 26 }, { header: '', width: 90 }],
    rows: [[{ v: title, bold: true }], [], ...lines.map(([k, v]) => (k ? [{ v: k, bold: true }, v] : []))],
  };
}

const NO_CUSTOMER = '(ohne Kunde)';

export interface JobExportInput {
  orgName: string;
  /** alle Mitglieder (auch ausgeschiedene — für Namen) */
  members: PinnMember[];
  /** erledigte (und ggf. abgesagte) Aufträge im Zeitraum, schon wie die Seite gefiltert (Rolle, Monteur, Kunde, Suche) */
  jobs: ExportJob[];
  /** Karten mit nachträglicher Zeit-Korrektur (job_event time_fix) */
  fixedIds: Set<string>;
  period: ExportPeriod;
  /** Abgesagte mitgeladen („Abgesagte zeigen“) */
  withCanceled: boolean;
  /** Auswahl der Seite für das Info-Blatt, z. B. [['Monteur', 'Alle'], ['Kunde', 'Müller']] */
  selection: [string, string][];
  /** nur für Tests */
  now?: Date;
}

export function jobSheets(input: JobExportInput): XlsxSheet[] {
  const jobs = [...input.jobs].sort(byFinished);
  const done = jobs.filter((j) => j.status === 'done');
  const canceled = jobs.filter((j) => j.status === 'canceled');
  if (done.length === 0 && canceled.length === 0) throw new ExportNotice('Im gewählten Zeitraum ist nichts erledigt.');

  const nowMs = (input.now ?? new Date()).getTime();
  const byId = new Map(input.members.map((m) => [m.user_id, m]));
  const name = (uid: string | null) => (uid ? memberName(byId.get(uid)) : 'Nicht zugewiesen');
  const helpers = (j: ExportJob) => (j.helper_ids ?? []).map((h) => memberName(byId.get(h))).join(', ') || null;
  // erledigte Karten: workSecondsNow = work_seconds (dieselbe Rechnung wie Zeiten-Seite und PDF)
  const hours = (j: ExportJob) => roundHours(workSecondsNow(j, null, nowMs));
  const result = (j: ExportJob) => OUTCOME_LABEL[j.outcome ?? 'ok'] ?? j.outcome;
  const fixed = (j: ExportJob) => (input.fixedIds.has(j.id) ? 'ja' : null);
  const customerOf = (j: ExportJob) => j.customer_name?.trim() || null;

  const rows = done.map((j) => [
    j.finished_at,
    j.finished_at,
    customerOf(j),
    j.address,
    j.title,
    name(j.assignee_id),
    helpers(j),
    hours(j),
    result(j),
    fixed(j),
    j.note,
    j.done_note,
  ]);

  // Je Kunde (nach Kundenname wie der Kunden-Filter der Seite; ohne Kunde zuletzt)
  interface Sum {
    name: string | null;
    count: number;
    hours: number;
    flagged: number;
    first: string | null;
    last: string | null;
  }
  const sums = new Map<string, Sum>();
  for (const j of done) {
    const c = customerOf(j);
    const key = c?.toLocaleLowerCase('de') ?? '';
    let s = sums.get(key);
    if (!s) {
      s = { name: c, count: 0, hours: 0, flagged: 0, first: null, last: null };
      sums.set(key, s);
    }
    s.count++;
    s.hours = round2(s.hours + hours(j));
    if (j.outcome && j.outcome !== 'ok') s.flagged++;
    s.first ??= j.finished_at;
    s.last = j.finished_at;
  }
  const sumRows = [...sums.values()]
    .sort((a, b) => Number(!a.name) - Number(!b.name) || cmpText(a.name ?? '', b.name ?? ''))
    .map((s) => [s.name ?? NO_CUSTOMER, s.count, s.hours, s.flagged, s.first, s.last]);

  // Zeiten je Monteur — Gruppierung und Reihenfolge wie Seite „Zeiten“ / PDF (timesByWorker)
  const workers = timesByWorker(done, input.members, input.fixedIds, {}, nowMs);
  const timeRows = workers.flatMap((w) =>
    w.jobs.map((j) => [workDayIso(j), w.name, startCell(j.started_at, j.finished_at), j.finished_at, hours(j), j.title, customerOf(j), fixed(j)]),
  );
  const workerTotals = workers.map((w) => ({ name: w.name, count: w.jobs.length, hours: round2(w.jobs.reduce((a, j) => a + hours(j), 0)) }));
  const totalHours = round2(done.reduce((a, j) => a + hours(j), 0));

  const sheets: XlsxSheet[] = [
    {
      name: 'Aufträge',
      columns: [
        { header: 'Erledigt am', kind: 'date' },
        { header: 'Fertig', kind: 'time' },
        { header: 'Kunde' },
        { header: 'Adresse' },
        { header: 'Auftrag' },
        { header: 'Monteur' },
        { header: 'Helfer' },
        { header: 'Arbeitszeit (Std.)', kind: 'dec2' },
        { header: 'Ergebnis' },
        { header: 'Zeit korrigiert' },
        { header: 'Was ist zu tun' },
        { header: 'Notiz vom Monteur' },
      ],
      rows,
    },
    {
      name: 'Je Kunde',
      columns: [
        { header: 'Kunde' },
        { header: 'Aufträge', kind: 'int' },
        { header: 'Stunden', kind: 'dec2' },
        { header: 'Mit Vermerk (nicht angetroffen, Folgetermin, Problem)', kind: 'int', width: 22 },
        { header: 'Erster Auftrag', kind: 'date' },
        { header: 'Letzter Auftrag', kind: 'date' },
      ],
      rows: sumRows,
    },
    {
      name: 'Zeiten',
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Monteur' },
        { header: 'Beginn', kind: 'time' },
        { header: 'Ende', kind: 'time' },
        { header: 'Stunden', kind: 'dec2' },
        { header: 'Auftrag' },
        { header: 'Kunde' },
        { header: 'Zeit korrigiert' },
      ],
      rows: timeRows,
    },
  ];
  if (canceled.length) {
    sheets.push({
      name: 'Abgesagt',
      columns: [
        { header: 'Abgesagt am', kind: 'datetime' },
        { header: 'Kunde' },
        { header: 'Adresse' },
        { header: 'Auftrag' },
        { header: 'Monteur' },
        { header: 'Erfasste Zeit (Std.)', kind: 'dec2' },
        { header: 'Was ist zu tun' },
      ],
      rows: canceled.map((j) => [
        j.updated_at,
        customerOf(j),
        j.address,
        j.title,
        name(j.assignee_id),
        j.work_seconds > 0 ? hours(j) : null,
        j.note,
      ]),
    });
  }

  sheets.push(
    infoSheet('Laufzettel · Aufträge zum Abrechnen', [
      ['Betrieb', input.orgName],
      ...input.selection,
      ['Zeitraum', periodLabel(input.period)],
      ['Erstellt', fmtDateTime(new Date(nowMs).toISOString())],
      ['Aufträge erledigt', { v: done.length, kind: 'int' }],
      ['Stunden gesamt', { v: totalHours, kind: 'dec2' }],
      [
        'Abgesagt',
        !input.withCanceled
          ? 'nicht dabei (auf der Seite „Abgesagte zeigen“ wählen)'
          : canceled.length
            ? `${canceled.length} (eigenes Blatt „Abgesagt“, nicht in den Summen)`
            : 'keine',
      ],
      ['', null],
      ['Stunden je Monteur', null],
      ...workerTotals.map((w): [string, XlsxCell] => [`${w.name} (${w.count} ${w.count === 1 ? 'Auftrag' : 'Aufträge'})`, { v: w.hours, kind: 'dec2' }]),
      ['', null],
      ['Hinweis', EXPORT_NOTE],
      ['Arbeitszeit', WORK_NOTE],
      ['Tage und Zeiten', 'Alle Zeiten in Ortszeit (Mitteleuropa). Tag = Tag der Fertigmeldung; begann ein Auftrag an einem früheren Tag, steht beim Beginn das Datum dabei.'],
      ['Nur erledigte', 'Laufende oder pausierte Aufträge zählen erst mit der Fertigmeldung — den aktuellen Stand je Monteur zeigt die Seite „Zeiten“.'],
      ['Zeit korrigiert', '„ja“ = vom Chef nachträglich geändert (Vermerk im Verlauf der Karte).'],
      ['Arbeitszeitgesetz', 'Keine Arbeitszeitaufzeichnung im Sinne von § 16 Abs. 2 ArbZG bzw. § 26 AZG (Pausen, Fahrten außerhalb von Aufträgen fehlen).'],
    ]),
  );
  return sheets;
}
