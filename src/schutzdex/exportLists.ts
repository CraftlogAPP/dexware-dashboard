// SchutzDex — Unterweisungen als Excel-Liste (Dashboard). Reine Logik ohne React.
//
// Zweck: AUSWERTEN (wer ist unterwiesen, wer muss was bis wann, Historie). Kein Nachweis — eine Excel-Datei lässt sich
// ändern; rechtssicher bleiben die unterschriebenen Nachweise in SchutzDex (Unterschrift, Prüfcode).
// Fälligkeit 1:1 wie die App und die Handy-Ansicht „Vor Ort“ (vorOrt/due.ts, gegen die App getestet): jede Unterweisung
// des Betriebs gilt für jeden AKTIVEN Mitarbeiter, gültig 1 Jahr ab dem letzten BESTANDENEN Nachweis.
// Zuweisungen (gibt es nur im Dashboard) stehen mit der Logik der Seite „Zuweisungen“ (labels.ts → isOverdue) in einem
// eigenen Blatt — nur wenn es welche gibt.
// Aufbau: „Übersicht“ (Matrix Mitarbeiter × Unterweisung), „Zu unterweisen“ (wer muss was bis wann), „Nachweise“,
// ggf. „Zuweisungen“, „Info“.

import { ExportNotice, type XlsxCell, type XlsxSheet, type XlsxValue } from '../lib/xlsx';
import { fmtDateTime, toInputDate } from '../lib/format';
import type { Org } from '../lib/orgApi';
import { isOverdue } from './labels';
import { DUE_SOON_DAYS, dueInfo, fmtDate as fmtDay, lastPassedByPair, memberStatus, memberStatusLabel, type DueInfo } from './vorOrt/due';
import { ASSIGNMENT_STATUS_LABELS, type Assignment, type Briefing, type CompletionExportRow, type Member } from './types';

export const EXPORT_TZ = 'Europe/Berlin';

export const EXPORT_NOTE =
  'Arbeitsliste zum Auswerten — kein Nachweis. Eine Excel-Datei lässt sich ändern; rechtssicherer Nachweis sind die unterschriebenen Nachweise in SchutzDex.';

const DUE_NOTE =
  'Wie in der App: Jede Unterweisung gilt für jeden aktiven Mitarbeiter, gültig 1 Jahr ab dem letzten BESTANDENEN Nachweis ' +
  '(gleicher Kalendertag, 29.02. → 28.02.); ein nicht bestandener Verständnis-Check erneuert die Frist nicht. ' +
  `Am Fälligkeitstag gilt sie als fällig („heute fällig“), „bald fällig“ = in höchstens ${DUE_SOON_DAYS} Tagen. ` +
  'Tage bis fällig: negativ = überfällig. Inaktive Mitarbeiter stehen nur im Blatt „Nachweise“.';

export interface BriefingExportInput {
  org: Org;
  members: Member[];
  briefings: Briefing[];
  /** alle Nachweise (ohne Unterschrift), beliebige Reihenfolge */
  completions: CompletionExportRow[];
  /** alle Zuweisungen aus dem Dashboard (oft keine) */
  assignments: Assignment[];
  /** Stichtag der Fälligkeit (Standard: jetzt) — für Tests */
  now?: Date;
}

const WIEDERHOLUNG: Record<string, string> = { jaehrlich: 'Jährlich', halbjaehrlich: 'Halbjährlich', einmalig: 'Einmalig' };

const cmpText = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true });
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Schlüssel wie lastPassedByPair (vorOrt/due.ts, auch stand.ts). */
const pair = (memberId: string, briefingId: string) => `${memberId}|${briefingId}`;
const day = (d: Date | null): string | null => (d ? toInputDate(d) : null);
/** Tage bis fällig — -0 als 0 schreiben. */
const days = (info: DueInfo): number | null => (info.daysLeft == null ? null : info.daysLeft || 0);
const proofCode = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : null);

/** Zelle der Matrix — Zustand aus dueInfo (wie „Stand je Unterweisung“ in Vor Ort), kurz formuliert. */
function matrixCell(info: DueInfo, lastAt: string | undefined): XlsxCell {
  if (info.state === 'never' || !lastAt || !info.dueAt) return { v: 'offen — noch nicht unterwiesen' };
  const done = fmtDay(new Date(lastAt));
  const due = fmtDay(info.dueAt);
  if (info.state === 'overdue') {
    return { v: info.daysLeft === 0 ? `heute fällig (erledigt ${done})` : `überfällig seit ${due} (erledigt ${done})`, bold: true };
  }
  if (info.state === 'soon') return { v: `bald fällig ${due} (erledigt ${done})` };
  return { v: `erledigt ${done}, fällig ${due}` };
}

function standLabel(info: DueInfo): string {
  if (info.state === 'never') return 'noch nicht unterwiesen';
  if (info.state === 'overdue') return info.daysLeft === 0 ? 'heute fällig' : 'überfällig';
  return info.state === 'soon' ? 'bald fällig' : 'aktuell';
}

/** Status wie AssignmentBadge auf der Seite „Zuweisungen“. */
function assignmentStatus(a: Assignment): string {
  if (a.status === 'erledigt') return ASSIGNMENT_STATUS_LABELS.erledigt;
  return isOverdue(a) ? ASSIGNMENT_STATUS_LABELS.ueberfaellig : ASSIGNMENT_STATUS_LABELS.offen;
}

/** Spaltenköpfe der Matrix: Titel, doppelte Titel mit „(2)“ unterscheidbar. */
function briefingHeaders(list: Briefing[]): string[] {
  const seen = new Map<string, number>();
  return list.map((b) => {
    const t = b.titel.trim() || 'Ohne Titel';
    const n = (seen.get(t.toLowerCase()) ?? 0) + 1;
    seen.set(t.toLowerCase(), n);
    return n > 1 ? `${t} (${n})` : t;
  });
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

/** Alle Blätter der Datei „Unterweisungen“. Nichts auszuwerten → ExportNotice (blauer Hinweis am Knopf). */
export function briefingSheets(input: BriefingExportInput): XlsxSheet[] {
  const now = input.now ?? new Date();
  const active = input.members.filter((m) => m.aktiv).sort((a, b) => cmpText(a.name, b.name) || cmpStr(a.id, b.id));
  const briefings = [...input.briefings].sort((a, b) => cmpText(a.titel, b.titel) || cmpStr(a.created_at, b.created_at) || cmpStr(a.id, b.id));
  if (input.completions.length === 0 && input.assignments.length === 0) {
    if (briefings.length === 0) {
      throw new ExportNotice('Noch keine Unterweisungen und keine Nachweise — erstelle die erste Unterweisung in der SchutzDex-App.');
    }
    if (active.length === 0) throw new ExportNotice('Noch keine aktiven Mitarbeiter und keine Nachweise — die Excel-Liste wäre leer.');
  }

  const memberById = new Map(input.members.map((m) => [m.id, m]));
  const briefingById = new Map(input.briefings.map((b) => [b.id, b]));
  const lastPassed = lastPassedByPair(input.completions);
  const briefingIds = briefings.map((b) => b.id);

  // ---------------------------------------------------------------- Übersicht + Zu unterweisen
  const count = { overdue: 0, today: 0, never: 0, soon: 0, ok: 0, allCurrent: 0 };
  interface Todo {
    m: Member;
    b: Briefing;
    info: DueInfo;
    lastAt: string | undefined;
    rank: number;
  }
  const todo: Todo[] = [];
  const matrixRows = active.map((m) => {
    const st = memberStatus(m.id, briefingIds, lastPassed, now);
    if (st.state === 'ok' || st.state === 'soon') count.allCurrent++;
    const cells = st.items.map(({ briefingId, info }, i) => {
      const lastAt = lastPassed.get(pair(m.id, briefingId));
      if (info.state === 'overdue') count[info.daysLeft === 0 ? 'today' : 'overdue']++;
      else count[info.state]++;
      if (info.state !== 'ok') todo.push({ m, b: briefings[i], info, lastAt, rank: info.state === 'overdue' ? 0 : info.state === 'never' ? 1 : 2 });
      return matrixCell(info, lastAt);
    });
    return [m.name, m.taetigkeit, { v: memberStatusLabel(st), bold: st.state === 'expired' }, ...cells];
  });

  // dringend zuerst: überfällig (ältestes zuerst), noch nie unterwiesen, bald fällig (nächstes zuerst)
  todo.sort(
    (x, y) =>
      x.rank - y.rank ||
      (x.info.dueAt?.getTime() ?? 0) - (y.info.dueAt?.getTime() ?? 0) ||
      cmpText(x.m.name, y.m.name) ||
      cmpText(x.b.titel, y.b.titel),
  );
  const todoRows = todo.map(({ m, b, info, lastAt }) => [
    m.name,
    m.taetigkeit,
    b.titel,
    { v: standLabel(info), bold: info.state === 'overdue' },
    day(info.dueAt),
    days(info),
    lastAt ?? null,
  ]);

  // ---------------------------------------------------------------- Nachweise (neueste zuerst, wie die Seite)
  const completions = [...input.completions].sort((a, b) => cmpStr(b.abgeschlossen_am, a.abgeschlossen_am) || cmpStr(b.id, a.id));
  const memberName = (c: CompletionExportRow) => {
    const m = c.member_id ? memberById.get(c.member_id) : undefined;
    if (m) return m.name;
    return c.signed_name ? `${c.signed_name} (Mitarbeiter gelöscht)` : '(Mitarbeiter gelöscht)';
  };
  const briefingName = (c: CompletionExportRow) => {
    const b = c.briefing_id ? briefingById.get(c.briefing_id) : undefined;
    if (b) return b.titel;
    return c.briefing_titel ? `${c.briefing_titel} (Unterweisung gelöscht)` : '(Unterweisung gelöscht)';
  };
  const failed = completions.filter((c) => !c.check_passed).length;
  const completionRows = completions.map((c) => [
    c.abgeschlossen_am,
    c.abgeschlossen_am,
    memberName(c),
    briefingName(c),
    c.briefing_version,
    c.check_passed ? 'bestanden' : 'nicht bestanden',
    c.check_score,
    // eine durchgefallene Unterweisung erneuert die Frist nicht (lastPassedByPair) → kein „gültig bis“
    c.check_passed ? day(dueInfo(c.abgeschlossen_am, now).dueAt) : null,
    c.signed_name,
    c.unterwiesen_von ?? null,
    c.device_info,
    proofCode(c.entry_hash),
  ]);

  const sheets: XlsxSheet[] = [
    {
      name: 'Übersicht',
      columns: [
        { header: 'Mitarbeiter' },
        { header: 'Tätigkeit' },
        { header: 'Gesamtstand' },
        ...briefingHeaders(briefings).map((header) => ({ header })),
      ],
      rows: matrixRows,
      landscape: true,
    },
    {
      name: 'Zu unterweisen',
      columns: [
        { header: 'Mitarbeiter' },
        { header: 'Tätigkeit' },
        { header: 'Unterweisung' },
        { header: 'Stand' },
        { header: 'Fällig am', kind: 'date' },
        { header: 'Tage bis fällig', kind: 'int' },
        { header: 'Zuletzt bestanden', kind: 'date' },
      ],
      rows: todoRows,
    },
    {
      name: 'Nachweise',
      columns: [
        { header: 'Erledigt am', kind: 'date' },
        { header: 'Uhrzeit', kind: 'time' },
        { header: 'Mitarbeiter' },
        { header: 'Unterweisung' },
        { header: 'Version', kind: 'int' },
        { header: 'Verständnis-Check' },
        { header: 'Richtig (%)', kind: 'int' },
        { header: 'Gültig bis / fällig am', kind: 'date' },
        { header: 'Unterschrieben als' },
        { header: 'Unterwiesen von' },
        { header: 'Gerät' },
        { header: 'Prüfcode' },
      ],
      rows: completionRows,
    },
  ];

  let asgSummary = 'keine';
  if (input.assignments.length) {
    const asg = [...input.assignments].sort(
      (a, b) =>
        // wie die Seite: nach Fälligkeit, ohne Datum zuletzt
        Number(!a.faellig_am) - Number(!b.faellig_am) ||
        cmpStr(a.faellig_am ?? '', b.faellig_am ?? '') ||
        cmpText(memberById.get(a.member_id)?.name ?? '', memberById.get(b.member_id)?.name ?? '') ||
        cmpStr(a.id, b.id),
    );
    const open = asg.filter((a) => a.status !== 'erledigt');
    const overdue = open.filter(isOverdue).length;
    asgSummary = `${asg.length} (${open.length} offen, davon ${overdue} überfällig) — eigenes Blatt „Zuweisungen“`;
    sheets.push({
      name: 'Zuweisungen',
      columns: [
        { header: 'Mitarbeiter' },
        { header: 'Unterweisung' },
        { header: 'Fällig am', kind: 'date' },
        { header: 'Wiederholung' },
        { header: 'Status' },
        { header: 'Zuletzt bestanden', kind: 'date' },
      ],
      rows: asg.map((a) => {
        const status = assignmentStatus(a);
        return [
          memberById.get(a.member_id)?.name ?? '(Mitarbeiter gelöscht)',
          briefingById.get(a.briefing_id)?.titel ?? '(Unterweisung gelöscht)',
          a.faellig_am ? a.faellig_am.slice(0, 10) : null,
          WIEDERHOLUNG[a.wiederholung] ?? a.wiederholung,
          { v: status, bold: status === ASSIGNMENT_STATUS_LABELS.ueberfaellig },
          lastPassed.get(pair(a.member_id, a.briefing_id)) ?? null,
        ];
      }),
    });
  }

  const int = (n: number, bold = false): XlsxCell => ({ v: n, kind: 'int', bold });
  const inactive = input.members.length - active.length;
  sheets.push(
    infoSheet('SchutzDex · Unterweisungen', [
      ['Betrieb', input.org.name],
      ['Auswahl', 'Alle Unterweisungen × alle aktiven Mitarbeiter, Nachweise komplett (der Mitarbeiter-Filter der Seite gilt nicht)'],
      ['Erstellt', fmtDateTime(now.toISOString())],
      ['Aktive Mitarbeiter', inactive ? `${active.length} (dazu ${inactive} inaktiv)` : int(active.length)],
      ['Unterweisungen', int(briefings.length)],
      ['Alles aktuell', `${count.allCurrent} von ${active.length} aktiven Mitarbeitern`],
      ['Überfällig', int(count.overdue, count.overdue > 0)],
      ['Heute fällig', int(count.today, count.today > 0)],
      ['Noch nicht unterwiesen', int(count.never)],
      ['Bald fällig', int(count.soon)],
      ['Nachweise', failed ? `${completions.length} (davon ${failed} Check nicht bestanden)` : int(completions.length)],
      ['Zuweisungen', asgSummary],
      ['', null],
      ['Hinweis', EXPORT_NOTE],
      ['Fristen', DUE_NOTE],
      ['Zählung', 'Überfällig, heute fällig, noch nicht unterwiesen und bald fällig zählen Paare Mitarbeiter × Unterweisung (Blatt „Zu unterweisen“).'],
      ...(input.assignments.length
        ? ([['Status Zuweisungen', 'Status wie auf der Seite „Zuweisungen“: offen mit überschrittenem Fälligkeitsdatum = überfällig. Zuweisungen legt nur das Dashboard an — die Fälligkeit in der Übersicht folgt der App.']] as [string, string][])
        : []),
      ['Unterschriften', 'Unterschriften sind nicht Teil der Liste — sie liegen prüffest in SchutzDex.'],
    ]),
  );
  return sheets;
}
