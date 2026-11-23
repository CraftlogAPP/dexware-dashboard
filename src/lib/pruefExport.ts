// Prüf-Apps — Excel-Listen im Dashboard. EIN Baustein für LeiterDex, FeuerDex, ToreDex, GurtDex, HebeDex (Prüfung je
// Einheit) und GerüstDex, RegalDex, SpielDex (Prüfung je Ort). Reine Logik ohne React — die Datei baut lib/xlsx.ts.
//
// Zwei Listen je App:
//   1. Prüfbuch-Übersicht (Knopf auf der Standort-Liste): der ganze Bestand mit Stammdaten, letzter gültiger Prüfung,
//      „fällig am“ + Fälligkeit, offenen Mängeln (Anzahl, höchste Einstufung, gesperrt) — dazu „Offene Mängel“ und „Info“.
//      Im Orts-Modus hängt die Prüfung am ganzen Ort: erst je Ort, dann der Bestand mit der Fälligkeit seines Orts.
//   2. Prüfungen im Zeitraum (Knopf in der Filterzeile der Prüfungen): nur gültige, chronologisch; „Je Standort“
//      (Summen), „Storniert“ (nur wenn es Stornos gibt, mit Grund) und „Info“.
//
// Was je App verschieden ist, kommt aus zwei Quellen (nichts doppelt gepflegt):
//   - der „Vor Ort“-Konfiguration der App (src/<app>/vorOrt.ts): Spaltennamen der Tabellen, Wörter (Leiter, Baustelle,
//     Kontrolle, Schaden …), Fälligkeits-Art, Frist des Betriebs, Ampel-Stufen;
//   - dem Adapter src/<app>/exportLists.ts: Stammdaten-Spalten, Ergebnis wie in der Prüfungs-Liste, Zusatz-Spalten.
// Fälligkeit EXAKT wie „Vor Ort“ und die Apps (src/pruefen/due.ts): jüngste gültige Prüfung der Fälligkeits-Art + Frist
// des Betriebs, in lokalen Kalendertagen; „bald fällig“ ab 30 Tagen Rest (GerüstDex 14). Stornos zählen nie.
// Zweck: Übersicht zum Auswerten und Vorlegen (Behörde, BG/AUVA, Auftraggeber, Audit) — KEIN Nachweis: eine Excel-Datei
// lässt sich ändern, rechtssicher bleibt das Prüfprotokoll (PDF) aus der App.

import { downloadXlsx, ExportNotice, type XlsxCell, type XlsxColumn, type XlsxSheet, type XlsxValue } from './xlsx';
import { fmtDateTime, toInputDate, todayLocalISO } from './format';
import type { Org } from './orgApi';
import { isSiteMode, siteFkOf, wordsOf, type PruefConfig } from '../pruefen/config';
import { DUE_SOON_DAYS, dueInfo, lastDueByUnit, type DueInfo, type InspMeta } from '../pruefen/due';

export const EXPORT_TZ = 'Europe/Berlin';

export type Cell = XlsxValue | XlsxCell;

export interface ExportPeriod {
  /** yyyy-mm-dd aus dem Filter (lokale Kalendertage) */
  from: string;
  to: string;
}

/** Zeitraum aus den Filterfeldern prüfen (yyyy-mm-dd, lokale Kalendertage). */
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

/** Hinweis im Info-Blatt jeder Liste. */
export function exportNote(appName: string): string {
  return `Arbeitsliste zum Auswerten — kein Nachweis. Eine Excel-Datei lässt sich ändern; rechtssicherer Nachweis ist das Prüfprotokoll (PDF) aus ${appName}.`;
}

const TIME_NOTE = 'Alle Daten und Zeiten in Ortszeit (Mitteleuropa).';

// ---------------------------------------------------------------------------- Zeilen der Apps

/**
 * Was der Baustein von den Zeilen der App braucht — die Typen aus src/<app>/types.ts passen so, wie sie sind.
 * Die Fremdschlüssel (site_id / warehouse_id / playground_id, ladder_id …) und die Spalten „gesperrt“ / „außer Betrieb“
 * liest er unter den Namen aus der Vor-Ort-Konfiguration (cfg.cols).
 */
export interface RawSite {
  id: string;
  name: string;
  address: string | null;
  operator_name: string | null;
  notes: string | null;
  active: boolean;
}
export interface RawUnit {
  id: string;
  name: string;
  notes: string | null;
}
export interface RawInspection {
  id: string;
  type: string;
  started_at: string;
  canceled: boolean;
  canceled_at: string | null;
  cancel_reason: string | null;
  notes: string | null;
  inspector_name: string | null;
  /** Prüfcode (SHA-256) — nur wenn die Datenbank ihn kennt (lib/gpsProof.ts → withGpsProof) */
  entry_hash?: string | null;
}
export interface RawDefect {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  created_at: string;
  reporter_name: string | null;
}

/** Spalten und Wörter einer App (Adapter in src/<app>/exportLists.ts). */
export interface PruefExportSpec<U extends RawUnit, I extends RawInspection> {
  cfg: PruefConfig;
  /** Prüfarten mit voller Bezeichnung wie in den Dashboard-Tabellen (types.ts → INSPECTION_LABELS) */
  kindLabels: Record<string, string>;
  /** Fälligkeits-Art kurz für Spaltenköpfe: „<dueName> fällig am“, z. B. „Regelmäßige Prüfung“ */
  dueName: string;
  /** Name der Übersicht für Titel und Datei: „Prüfbuch“ (SpielDex: „Kontrollbuch“) */
  bookName: string;
  /** Ja/Nein-Spalte „außer Betrieb“ wie im Formular der App: „Ausgesondert“, „Stillgelegt“, „Abgebaut“ */
  retiredHeader: string;
  /** Stammdaten-Spalten hinter der Bezeichnung — und ihre Werte je Einheit (leer = null, nie „—“) */
  unitColumns: XlsxColumn[];
  unitCells: (u: U) => Cell[];
  /** Ergebnis der Checkliste wie in der Prüfungs-Liste + Zahl der Punkte mit „Mangel“ */
  result: (i: I, unit: U | undefined) => { summary: string; defects: number };
  /** Optional: weitere Spalten je Einheit im Prüfbuch, hinter der Fälligkeit (HebeDex: Rissprüfung, GurtDex: Ablegereife) */
  unitExtra?: {
    columns: XlsxColumn[];
    /** `lastOf(art)` = jüngste gültige Prüfung dieser Art an der Einheit (ISO) */
    cells: (u: U, ctx: { retired: boolean; lastOf: (kind: string) => string | undefined }) => Cell[];
  };
  /** Optional: weitere Spalten der Prüfung hinter dem Ergebnis (HebeDex: Messwerte des Ablegereife-Rechners) */
  inspectionExtra?: { columns: XlsxColumn[]; cells: (i: I, unit: U | undefined) => Cell[] };
  /**
   * Optional, nur Einheiten-Modus: Fälligkeit mit dem eigenen Helfer der App statt der Vor-Ort-Regel
   * (HebeDex: expertDue aus types.ts — dieselbe Rechnung wie Übersicht und Standort-Seite der App im Dashboard).
   */
  unitDue?: (u: U, ctx: { org: Org; lastOf: (kind: string) => string | undefined }) => DueInfo;
  /** Optional: Beschreibung der Frist im Info-Blatt, wenn sie sich nicht in Tagen ausdrückt (HebeDex Österreich) */
  dueRuleText?: (org: Org) => string;
  /** Optional: weitere Zeilen zu Fristen im Info-Blatt (HebeDex: Rissprüfung) */
  extraRules?: [string, string][];
}

export interface PruefbuchInput<U, I, D> {
  org: Org;
  sites: RawSite[];
  /** alle Einheiten (auch außer Betrieb genommene) */
  units: U[];
  /** mindestens die jüngste Prüfung je Einheit (Orts-Modus: je Ort) und Art — Stornos werden übergangen */
  inspections: I[];
  /** alle offenen Mängel */
  openDefects: D[];
}

export interface InspectionListInput<U, I> {
  org: Org;
  sites: RawSite[];
  /** alle Einheiten (für die Namen; im Orts-Modus ohne Bedeutung) */
  units: U[];
  /** alle Prüfungen im Zeitraum (inkl. Stornos), beliebige Reihenfolge */
  inspections: I[];
  period: ExportPeriod;
  /** gewählter Standort bzw. gewählte Prüfart (null = alle) */
  siteId: string | null;
  type: string | null;
}

// ---------------------------------------------------------------------------- Helfer

const field = (row: object, col: string): unknown => (row as Record<string, unknown>)[col];
const idOf = (row: object, col: string): string | null => {
  const v = field(row, col);
  return typeof v === 'string' && v ? v : null;
};
const yesNo = (b: boolean) => (b ? 'ja' : 'nein');
const cmpText = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true });
const ms = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};
const cmpId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byStart = <T extends { started_at: string; id: string }>(a: T, b: T) => ms(a.started_at) - ms(b.started_at) || cmpId(a.id, b.id);
const proofCode = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : null);
const created = () => fmtDateTime(new Date().toISOString());
const int = (v: number): XlsxCell => ({ v, kind: 'int' });

/** Zahl der Checklisten-Punkte mit „Mangel“ — über die Punkte, die auch die Kurzfassung der Liste nennt. */
export function countDefects(checklist: Record<string, string> | null | undefined, points?: readonly { id: string }[]): number {
  const list = checklist ?? {};
  return points ? points.filter((p) => list[p.id] === 'defect').length : Object.values(list).filter((v) => v === 'defect').length;
}

/** Fälligkeit als Wort: überfällig / heute fällig / bald fällig / in Ordnung / noch nie geprüft. */
export function dueStatusText(info: Pick<DueInfo, 'state' | 'daysLeft'>, inspectionWord = 'Prüfung'): string {
  if (info.state === 'never') return inspectionWord === 'Prüfung' ? 'noch nie geprüft' : `noch keine ${inspectionWord}`;
  if (info.state === 'overdue') return info.daysLeft === 0 ? 'heute fällig' : 'überfällig';
  return info.state === 'soon' ? 'bald fällig' : 'in Ordnung';
}

/** „alle 12 Monate“ / „alle 2 Jahre“ / „alle 30 Tage“ — volle Jahre laufen wie in due.ts über den Kalender. */
function every(days: number): string {
  if (days > 0 && days % 365 === 0) return days === 365 ? 'alle 12 Monate' : `alle ${days / 365} Jahre`;
  return `alle ${days} Tage`;
}

function infoSheet(title: string, lines: [string, Cell][]): XlsxSheet {
  return {
    name: 'Info',
    table: false,
    landscape: false,
    columns: [{ header: '', width: 26 }, { header: '', width: 90 }],
    rows: [[{ v: title, bold: true }], [], ...lines.map(([k, v]) => (k ? [{ v: k, bold: true }, v] : []))],
  };
}

/** Gemeinsames je App: Wörter, Spaltennamen, Frist des Betriebs, Ampel-Rang. */
function setup<U extends RawUnit, I extends RawInspection>(spec: PruefExportSpec<U, I>, org: Org) {
  const { cfg } = spec;
  const W = wordsOf(cfg);
  const orgRow = org as unknown as Record<string, unknown>;
  const intervalDays = cfg.dueIntervalDays(orgRow);
  const custom = cfg.dueDate;
  const dueDate = custom ? (last: Date) => custom(last, orgRow) : undefined;
  const soonDays = cfg.dueSoonDays ?? DUE_SOON_DAYS;
  const rank = (severity: string) => cfg.severities.findIndex((s) => s.id === severity);
  const sevShort = (severity: string) => cfg.severities.find((s) => s.id === severity)?.short ?? severity;
  const sevLabel = (severity: string) => cfg.severities.find((s) => s.id === severity)?.label ?? severity;
  const kindLabel = (type: string) => spec.kindLabels[type] ?? cfg.kinds.find((k) => k.id === type)?.label ?? type;
  const ruleLines: [string, string][] = [
    [
      'Frist',
      `${spec.dueRuleText ? spec.dueRuleText(org) : `${kindLabel(cfg.dueKind)} ${every(intervalDays)} ab der letzten gültigen ${W.insp.one} dieser Art`}; „bald fällig“ = in den nächsten ${soonDays} Tagen. Stornierte ${W.insp.many} zählen nicht.`,
    ],
  ];
  if (isSiteMode(cfg) && cfg.extraDue) {
    const x = cfg.extraDue;
    ruleLines.push([
      'Zweite Frist',
      `${x.label} alle ${x.intervalDays} Tage (es zählen: ${x.kinds.map(kindLabel).join(' und ')}); „bald fällig“ = in den nächsten ${x.soonDays} Tagen.`,
    ]);
  }
  ruleLines.push(...(spec.extraRules ?? []));
  return {
    cfg,
    W,
    S: cfg.labels.site,
    U: cfg.labels.unit,
    siteMode: isSiteMode(cfg),
    siteFk: siteFkOf(cfg),
    unitFk: cfg.cols.unitFk,
    due: (lastAt: string | undefined) => dueInfo(lastAt, intervalDays, soonDays, dueDate),
    rank,
    sevShort,
    sevLabel,
    kindLabel,
    ruleLines,
    goneSite: `(${cfg.labels.site.one} nicht mehr vorhanden)`,
    goneUnit: `(${cfg.labels.unit.one} nicht mehr vorhanden)`,
  };
}

/** Schmale Prüf-Daten wie „Vor Ort“ (InspMeta) — Schlüssel = Einheit bzw. im Orts-Modus der Ort. */
function metaOf(list: RawInspection[], keyCol: string): InspMeta[] {
  const out: InspMeta[] = [];
  for (const i of list) {
    const unitId = idOf(i, keyCol);
    if (unitId) out.push({ unitId, type: i.type, startedAt: i.started_at, canceled: i.canceled === true });
  }
  return out;
}

/** Jüngste gültige Prüfung (beliebige Art) je Schlüssel, ganze Zeile. */
function latestValid<I extends RawInspection>(list: I[], keyCol: string): Map<string, I> {
  const map = new Map<string, I>();
  for (const i of list) {
    if (i.canceled) continue;
    const key = idOf(i, keyCol);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || byStart(prev, i) < 0) map.set(key, i);
  }
  return map;
}

interface OpenStat {
  count: number;
  /** höchste Einstufung (id) und ihr Rang = Index in cfg.severities (-1 = unbekannte Stufe) */
  top: string | null;
  topRank: number;
  blocked: boolean;
}

function openStats(defects: RawDefect[], keyCol: string, blockedCol: string, rank: (s: string) => number): Map<string, OpenStat> {
  const map = new Map<string, OpenStat>();
  for (const d of defects) {
    const key = idOf(d, keyCol);
    if (!key) continue;
    const s = map.get(key) ?? { count: 0, top: null, topRank: -2, blocked: false };
    s.count++;
    if (rank(d.severity) > s.topRank) {
      s.topRank = rank(d.severity);
      s.top = d.severity;
    }
    if (field(d, blockedCol) === true) s.blocked = true;
    map.set(key, s);
  }
  return map;
}

/** Orte: aktive zuerst, dann nach Name. */
function cmpSites(a: RawSite | undefined, b: RawSite | undefined): number {
  if (!a || !b) return Number(!a) - Number(!b);
  return Number(b.active) - Number(a.active) || cmpText(a.name, b.name) || cmpId(a.id, b.id);
}

type Tally = { overdue: number; today: number; never: number; soon: number; ok: number };
const tally = (): Tally => ({ overdue: 0, today: 0, never: 0, soon: 0, ok: 0 });
/** Zählen wie die Spalte „Fälligkeit“: „heute fällig“ getrennt von „überfällig“. */
const count = (t: Tally, info: DueInfo) => {
  t[info.state === 'overdue' && info.daysLeft === 0 ? 'today' : info.state]++;
};
function tallyLine(t: Tally, W: ReturnType<typeof wordsOf>, of: string): string {
  const today = t.today ? ` · ${t.today} heute fällig` : '';
  return `${t.overdue} überfällig${today} · ${t.never} ${dueStatusText({ state: 'never', daysLeft: null }, W.insp.one)} · ${t.soon} bald fällig · ${t.ok} in Ordnung (${of})`;
}

// ---------------------------------------------------------------------------- Prüfbuch-Übersicht

/** Prüfbuch-Übersicht: Bestand mit Fälligkeit (Orts-Modus: erst je Ort), offene Mängel, Info. */
export function buildPruefbuch<U extends RawUnit, I extends RawInspection, D extends RawDefect>(
  spec: PruefExportSpec<U, I>,
  input: PruefbuchInput<U, I, D>,
): XlsxSheet[] {
  const c = setup(spec, input.org);
  if (c.siteMode ? input.sites.length === 0 : input.units.length === 0) {
    throw new ExportNotice(c.siteMode ? `Noch keine ${c.S.many} angelegt.` : `Noch keine ${c.U.many} erfasst.`);
  }
  return c.siteMode ? siteBook(spec, input, c) : unitBook(spec, input, c);
}

type Setup = ReturnType<typeof setup>;

function unitBook<U extends RawUnit, I extends RawInspection, D extends RawDefect>(
  spec: PruefExportSpec<U, I>,
  input: PruefbuchInput<U, I, D>,
  c: Setup,
): XlsxSheet[] {
  const { cfg, W, S, U } = c;
  const sites = new Map(input.sites.map((s) => [s.id, s]));
  const meta = metaOf(input.inspections, c.unitFk);
  const lastDue = lastDueByUnit(meta, cfg.dueKind);
  const lastAny = latestValid(input.inspections, c.unitFk);
  const byKind = new Map<string, Map<string, string>>();
  const lastOf = (unitId: string) => (kind: string) => {
    let m = byKind.get(kind);
    if (!m) byKind.set(kind, (m = lastDueByUnit(meta, kind)));
    return m.get(unitId);
  };
  const open = openStats(input.openDefects, c.unitFk, cfg.cols.blocked, c.rank);
  const retiredOf = (u: U) => field(u, cfg.cols.retired) === true;
  const siteOf = (u: U) => sites.get(idOf(u, c.siteFk) ?? '');

  const units = [...input.units].sort(
    (a, b) => cmpSites(siteOf(a), siteOf(b)) || Number(retiredOf(a)) - Number(retiredOf(b)) || cmpText(a.name, b.name) || cmpId(a.id, b.id),
  );
  const t = tally();
  let relevant = 0;
  let blockedCount = 0;
  const rows = units.map((u) => {
    const site = siteOf(u);
    const retired = retiredOf(u);
    // Wie die Übersicht und „Vor Ort“: Fälligkeit nur für Einheiten in Betrieb an aktiven Standorten
    const counts = !retired && site?.active !== false;
    const last = lastAny.get(u.id);
    const res = last ? spec.result(last, u) : null;
    const info = spec.unitDue ? spec.unitDue(u, { org: input.org, lastOf: lastOf(u.id) }) : c.due(lastDue.get(u.id));
    const st = open.get(u.id);
    if (counts) {
      relevant++;
      count(t, info);
    }
    if (st?.blocked && !retired) blockedCount++;
    const status = retired
      ? `entfällt (${spec.retiredHeader.toLowerCase()})`
      : counts
        ? dueStatusText(info, W.insp.one)
        : `entfällt (${S.one} pausiert)`;
    return [
      site?.name ?? c.goneSite,
      u.name,
      ...spec.unitCells(u),
      yesNo(retired),
      last?.started_at ?? null,
      last ? c.kindLabel(last.type) : null,
      res?.summary ?? null,
      res?.defects ?? null,
      last?.inspector_name ?? null,
      lastDue.get(u.id) ?? null,
      counts && info.dueAt ? toInputDate(info.dueAt) : null,
      status,
      counts ? info.daysLeft : null,
      ...(spec.unitExtra ? spec.unitExtra.cells(u, { retired, lastOf: lastOf(u.id) }) : []),
      st?.count ?? 0,
      st?.top ? c.sevShort(st.top) : null,
      yesNo(!!st?.blocked),
      u.notes,
    ];
  });

  const unitsById = new Map(input.units.map((u) => [u.id, u]));
  const active = input.sites.filter((s) => s.active).length;
  const retiredCount = input.units.filter(retiredOf).length;
  return [
    {
      name: spec.bookName,
      columns: [
        { header: S.one },
        { header: U.full },
        ...spec.unitColumns,
        { header: spec.retiredHeader },
        { header: `Letzte ${W.insp.one}`, kind: 'date' },
        { header: W.insp.kind },
        { header: 'Ergebnis' },
        { header: `${W.defect.many} lt. Checkliste`, kind: 'int' },
        { header: W.by },
        { header: `Letzte ${spec.dueName}`, kind: 'date' },
        { header: `${spec.dueName} fällig am`, kind: 'date' },
        { header: 'Fälligkeit' },
        { header: 'Tage bis fällig', kind: 'int' },
        ...(spec.unitExtra?.columns ?? []),
        { header: `Offene ${W.defect.many}`, kind: 'int' },
        { header: 'Höchste Einstufung' },
        { header: 'Gesperrt' },
        { header: 'Notizen' },
      ],
      rows,
    },
    defectSheet(input, c, unitsById),
    infoSheet(`${cfg.appName} · ${spec.bookName}-Übersicht`, [
      ['Betrieb', input.org.name],
      ['Erstellt', created()],
      [S.many, `${input.sites.length} (davon ${active} aktiv)`],
      [U.many, `${input.units.length} (davon ${input.units.length - retiredCount} in Betrieb, ${retiredCount} ${spec.retiredHeader.toLowerCase()})`],
      ['Fälligkeit heute', tallyLine(t, W, `gezählt: ${relevant} ${relevant === 1 ? U.one : U.many} in Betrieb, ohne pausierte ${S.many}`)],
      ['Gesperrt (offener Sperr-Vermerk)', int(blockedCount)],
      [`Offene ${W.defect.many}`, openLine(input.openDefects, c)],
      ['', null],
      ...c.ruleLines,
      ['', null],
      ['Hinweis', exportNote(cfg.appName)],
      ['Zeiten', TIME_NOTE],
    ]),
  ];
}

function siteBook<U extends RawUnit, I extends RawInspection, D extends RawDefect>(
  spec: PruefExportSpec<U, I>,
  input: PruefbuchInput<U, I, D>,
  c: Setup,
): XlsxSheet[] {
  const { cfg, W, S, U } = c;
  const sites = new Map(input.sites.map((s) => [s.id, s]));
  const meta = metaOf(input.inspections, c.siteFk);
  const lastDue = lastDueByUnit(meta, cfg.dueKind);
  const lastAny = latestValid(input.inspections, c.siteFk);
  const x = cfg.extraDue;
  const lastExtra = x ? lastDueByUnit(meta, x.kinds) : null;
  // Ein Ort mit offenem Sperr-Mangel (mit oder ohne Einheit) gilt als gesperrt — wie „Vor Ort“ (Orte.tsx → ortsStand)
  const siteOpen = openStats(input.openDefects, c.siteFk, cfg.cols.blocked, c.rank);
  const unitOpen = openStats(input.openDefects, c.unitFk, cfg.cols.blocked, c.rank);
  const retiredOf = (u: U) => field(u, cfg.cols.retired) === true;
  const inUse = new Map<string, number>();
  for (const u of input.units) {
    const sid = idOf(u, c.siteFk);
    if (sid && !retiredOf(u)) inUse.set(sid, (inUse.get(sid) ?? 0) + 1);
  }

  const list = [...input.sites].sort(cmpSites);
  const stand = new Map<string, { info: DueInfo; text: string; counts: boolean }>();
  const t = tally();
  let blockedSites = 0;
  const siteRows = list.map((s) => {
    const last = lastAny.get(s.id);
    const res = last ? spec.result(last, undefined) : null;
    const info = c.due(lastDue.get(s.id));
    const extra = x && lastExtra ? dueInfo(lastExtra.get(s.id), x.intervalDays, x.soonDays) : null;
    const st = siteOpen.get(s.id);
    const counts = s.active;
    if (counts) count(t, info);
    if (counts && st?.blocked) blockedSites++;
    const text = counts ? dueStatusText(info, W.insp.one) : 'entfällt (pausiert)';
    stand.set(s.id, { info, text, counts });
    return [
      s.name,
      s.address || null,
      s.operator_name,
      s.active ? 'aktiv' : 'pausiert',
      inUse.get(s.id) ?? 0,
      last?.started_at ?? null,
      last ? c.kindLabel(last.type) : null,
      res?.summary ?? null,
      res?.defects ?? null,
      last?.inspector_name ?? null,
      lastDue.get(s.id) ?? null,
      counts && info.dueAt ? toInputDate(info.dueAt) : null,
      text,
      counts ? info.daysLeft : null,
      ...(x && extra
        ? [counts && extra.dueAt ? toInputDate(extra.dueAt) : null, counts ? dueStatusText(extra, W.insp.one) : 'entfällt (pausiert)']
        : []),
      st?.count ?? 0,
      st?.top ? c.sevShort(st.top) : null,
      yesNo(!!st?.blocked),
      s.notes,
    ];
  });

  const siteOf = (u: U) => sites.get(idOf(u, c.siteFk) ?? '');
  const units = [...input.units].sort(
    (a, b) => cmpSites(siteOf(a), siteOf(b)) || Number(retiredOf(a)) - Number(retiredOf(b)) || cmpText(a.name, b.name) || cmpId(a.id, b.id),
  );
  const unitRows = units.map((u) => {
    const site = siteOf(u);
    const retired = retiredOf(u);
    const own = unitOpen.get(u.id);
    const at = site ? stand.get(site.id) : undefined;
    return [
      site?.name ?? c.goneSite,
      u.name,
      ...spec.unitCells(u),
      yesNo(retired),
      own?.count ?? 0,
      own?.top ? c.sevShort(own.top) : null,
      yesNo(!!own?.blocked),
      !retired && at?.counts && at.info.dueAt ? toInputDate(at.info.dueAt) : null,
      retired ? `entfällt (${spec.retiredHeader.toLowerCase()})` : (at?.text ?? null),
      u.notes,
    ];
  });

  const unitsById = new Map(input.units.map((u) => [u.id, u]));
  const active = input.sites.filter((s) => s.active).length;
  const retiredCount = input.units.filter(retiredOf).length;
  return [
    {
      name: spec.bookName,
      columns: [
        { header: S.one },
        { header: 'Adresse' },
        { header: 'Betreiber / Auftraggeber' },
        { header: 'Status' },
        { header: `${U.many} in Betrieb`, kind: 'int' },
        { header: `Letzte ${W.insp.one}`, kind: 'date' },
        { header: W.insp.kind },
        { header: 'Ergebnis' },
        { header: `${W.defect.many} lt. Checkliste`, kind: 'int' },
        { header: W.by },
        { header: `Letzte ${spec.dueName}`, kind: 'date' },
        { header: `${spec.dueName} fällig am`, kind: 'date' },
        { header: 'Fälligkeit' },
        { header: 'Tage bis fällig', kind: 'int' },
        ...(x ? [{ header: `${x.label} fällig am`, kind: 'date' as const }, { header: x.label }] : []),
        { header: `Offene ${W.defect.many}`, kind: 'int' },
        { header: 'Höchste Einstufung' },
        { header: 'Gesperrt' },
        { header: 'Notizen' },
      ],
      rows: siteRows,
    },
    {
      name: U.many,
      columns: [
        { header: S.one },
        { header: U.one },
        ...spec.unitColumns,
        { header: spec.retiredHeader },
        { header: `Offene ${W.defect.many}`, kind: 'int' },
        { header: 'Höchste Einstufung' },
        { header: 'Gesperrt' },
        { header: `${spec.dueName} fällig am (${S.one})`, kind: 'date' },
        { header: `Fälligkeit (${S.one})` },
        { header: 'Notizen' },
      ],
      rows: unitRows,
    },
    defectSheet(input, c, unitsById),
    infoSheet(`${cfg.appName} · ${spec.bookName}-Übersicht`, [
      ['Betrieb', input.org.name],
      ['Erstellt', created()],
      [S.many, `${input.sites.length} (davon ${active} aktiv)`],
      [U.many, `${input.units.length} (davon ${input.units.length - retiredCount} in Betrieb, ${retiredCount} ${spec.retiredHeader.toLowerCase()})`],
      ['Fälligkeit heute', tallyLine(t, W, `gezählt: ${active} ${activeWord(cfg, active)}`)],
      ['Gesperrt (offener Sperr-Vermerk)', int(blockedSites)],
      [`Offene ${W.defect.many}`, openLine(input.openDefects, c)],
      ['', null],
      [
        `${W.insp.one} gilt`,
        `je ${S.one} (nicht je ${U.one}): Fälligkeit und Sperre stehen im Blatt „${spec.bookName}“, das Blatt „${U.many}“ zeigt den Bestand mit der Fälligkeit des jeweiligen Orts.`,
      ],
      ...c.ruleLines,
      ['', null],
      ['Hinweis', exportNote(cfg.appName)],
      ['Zeiten', TIME_NOTE],
    ]),
  ];
}

/** „aktive Baustellen“ / „aktives Lager“ / „aktiver Spielplatz“ — Wortwahl der Gratis-Grenze der App. */
function activeWord(cfg: PruefConfig, n: number): string {
  const w = cfg.labels.freeSites;
  if (w) return n === 1 ? w.one : w.many;
  return `${n === 1 ? cfg.labels.site.one : cfg.labels.site.many} (aktiv)`;
}

/** „5 (davon 2× Rot)“ — die höchste Stufe der App zählt extra. */
function openLine(defects: RawDefect[], c: Setup): string {
  const top = c.cfg.severities[c.cfg.severities.length - 1];
  const n = top ? defects.filter((d) => d.severity === top.id).length : 0;
  return `${defects.length}${n ? ` (davon ${n}× ${top.short})` : ''}`;
}

/** Offene Mängel: schwerste zuerst, darin die ältesten zuerst. */
function defectSheet(input: { openDefects: RawDefect[]; sites: RawSite[] }, c: Setup, unitsById: Map<string, RawUnit>): XlsxSheet {
  const { cfg, W, S, U } = c;
  const sites = new Map(input.sites.map((s) => [s.id, s]));
  const general = cfg.labels.general ?? `${S.one} allgemein`;
  const rows = [...input.openDefects]
    .sort((a, b) => c.rank(b.severity) - c.rank(a.severity) || ms(a.created_at) - ms(b.created_at) || cmpId(a.id, b.id))
    .map((d) => {
      const unitId = idOf(d, c.unitFk);
      return [
        d.created_at,
        sites.get(idOf(d, c.siteFk) ?? '')?.name ?? c.goneSite,
        unitId ? (unitsById.get(unitId)?.name ?? c.goneUnit) : general,
        d.title,
        d.description,
        c.sevLabel(d.severity),
        yesNo(field(d, cfg.cols.blocked) === true),
        d.reporter_name,
      ];
    });
  return {
    name: `Offene ${W.defect.many}`,
    columns: [
      { header: 'Gemeldet am', kind: 'datetime' },
      { header: S.one },
      { header: c.siteMode ? U.one : U.full },
      { header: W.defect.one },
      { header: 'Beschreibung' },
      { header: 'Einstufung' },
      { header: 'Gesperrt' },
      { header: 'Gemeldet von' },
    ],
    rows,
    landscape: true,
  };
}

// ---------------------------------------------------------------------------- Prüfungen im Zeitraum

/** Prüfungen im Zeitraum: gültige chronologisch, Summen je Standort, Stornos getrennt, Info. */
export function buildInspectionList<U extends RawUnit, I extends RawInspection>(
  spec: PruefExportSpec<U, I>,
  input: InspectionListInput<U, I>,
): XlsxSheet[] {
  const c = setup(spec, input.org);
  const { cfg, W, S, U } = c;
  if (input.inspections.length === 0) {
    throw new ExportNotice(`Im gewählten Zeitraum gibt es keine ${W.insp.many}${input.siteId || input.type ? ' für diese Auswahl' : ''}.`);
  }
  const sites = new Map(input.sites.map((s) => [s.id, s]));
  const unitsById = new Map(input.units.map((u) => [u.id, u]));
  const siteName = (i: RawInspection) => sites.get(idOf(i, c.siteFk) ?? '')?.name ?? c.goneSite;
  const unitOf = (i: I) => (c.siteMode ? undefined : unitsById.get(idOf(i, c.unitFk) ?? ''));
  const unitCell = (i: I) => (c.siteMode ? [] : [unitOf(i)?.name ?? c.goneUnit]);

  const all = [...input.inspections].sort(byStart);
  const valid = all.filter((i) => !i.canceled);
  const canceled = all.filter((i) => i.canceled);
  const results = new Map(valid.map((i) => [i.id, spec.result(i, unitOf(i))]));

  const rows = valid.map((i) => {
    const r = results.get(i.id)!;
    return [
      i.started_at,
      i.started_at,
      siteName(i),
      ...unitCell(i),
      c.kindLabel(i.type),
      r.summary,
      r.defects,
      ...(spec.inspectionExtra ? spec.inspectionExtra.cells(i, unitOf(i)) : []),
      i.inspector_name,
      i.notes,
      proofCode(i.entry_hash),
    ];
  });

  // Je Standort: ohne Standort-Filter auch aktive Standorte ohne Prüfung (Kontrolle „wo wurde nicht geprüft“)
  const kinds = input.type ? [] : Object.keys(spec.kindLabels);
  interface Sum {
    id: string;
    count: number;
    withDefects: number;
    byKind: Map<string, number>;
    units: Set<string>;
    first: string | null;
    last: string | null;
    canceled: number;
  }
  const sums = new Map<string, Sum>();
  const sumOf = (id: string) => {
    let s = sums.get(id);
    if (!s) sums.set(id, (s = { id, count: 0, withDefects: 0, byKind: new Map(), units: new Set(), first: null, last: null, canceled: 0 }));
    return s;
  };
  if (!input.siteId) {
    for (const s of input.sites) if (s.active) sumOf(s.id);
  } else if (sites.has(input.siteId)) {
    sumOf(input.siteId);
  }
  for (const i of valid) {
    const s = sumOf(idOf(i, c.siteFk) ?? '');
    s.count++;
    if ((results.get(i.id)?.defects ?? 0) > 0) s.withDefects++;
    s.byKind.set(i.type, (s.byKind.get(i.type) ?? 0) + 1);
    const unitId = idOf(i, c.unitFk);
    if (!c.siteMode && unitId) s.units.add(unitId);
    s.first ??= i.started_at;
    s.last = i.started_at;
  }
  for (const i of canceled) sumOf(idOf(i, c.siteFk) ?? '').canceled++;
  const inUse = new Map<string, number>();
  for (const u of input.units) {
    const sid = idOf(u, c.siteFk);
    if (sid && field(u, cfg.cols.retired) !== true) inUse.set(sid, (inUse.get(sid) ?? 0) + 1);
  }
  const sumRows = [...sums.values()]
    .sort((a, b) => cmpSites(sites.get(a.id), sites.get(b.id)))
    .map((s) => [
      sites.get(s.id)?.name ?? c.goneSite,
      sites.get(s.id)?.address || null,
      s.count,
      s.withDefects,
      ...kinds.map((k) => s.byKind.get(k) ?? 0),
      ...(c.siteMode ? [] : [s.units.size, inUse.get(s.id) ?? 0]),
      s.first,
      s.last,
      s.canceled,
    ]);

  const sheets: XlsxSheet[] = [
    {
      name: W.insp.many,
      columns: [
        { header: 'Datum', kind: 'date' },
        { header: 'Uhrzeit', kind: 'time' },
        { header: S.one },
        ...(c.siteMode ? [] : [{ header: U.full }]),
        { header: W.insp.kind },
        { header: 'Ergebnis' },
        { header: `${W.defect.many} lt. Checkliste`, kind: 'int' },
        ...(spec.inspectionExtra?.columns ?? []),
        { header: W.by },
        { header: 'Notiz' },
        { header: 'Prüfcode' },
      ],
      rows,
    },
    {
      name: `Je ${S.one}`,
      columns: [
        { header: S.one },
        { header: 'Adresse' },
        { header: W.insp.many, kind: 'int' },
        { header: `davon mit ${W.defect.manyDative}`, kind: 'int' },
        ...kinds.map((k) => ({ header: c.kindLabel(k), kind: 'int' as const })),
        ...(c.siteMode
          ? []
          : [
              { header: `${U.many} geprüft`, kind: 'int' as const },
              { header: `${U.many} in Betrieb (heute)`, kind: 'int' as const },
            ]),
        { header: `Erste ${W.insp.one}`, kind: 'datetime' },
        { header: `Letzte ${W.insp.one}`, kind: 'datetime' },
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
        { header: 'Uhrzeit', kind: 'time' },
        { header: S.one },
        ...(c.siteMode ? [] : [{ header: U.full }]),
        { header: W.insp.kind },
        { header: W.by },
        { header: 'Storniert am', kind: 'datetime' },
        { header: 'Storno-Grund' },
        { header: 'Prüfcode' },
      ],
      rows: canceled.map((i) => [
        i.started_at,
        i.started_at,
        siteName(i),
        ...unitCell(i),
        c.kindLabel(i.type),
        i.inspector_name,
        i.canceled_at,
        i.cancel_reason,
        proofCode(i.entry_hash),
      ]),
    });
  }
  const withDefects = valid.filter((i) => (results.get(i.id)?.defects ?? 0) > 0).length;
  sheets.push(
    infoSheet(`${cfg.appName} · ${W.insp.many} im Zeitraum`, [
      ['Betrieb', input.org.name],
      [S.one, input.siteId ? (sites.get(input.siteId)?.name ?? c.goneSite) : `Alle ${S.many}`],
      [W.insp.kind, input.type ? c.kindLabel(input.type) : `Alle ${W.insp.kind}en`],
      ['Zeitraum', periodLabel(input.period)],
      ['Erstellt', created()],
      [W.insp.many, int(valid.length)],
      [`davon mit ${W.defect.manyDative}`, int(withDefects)],
      ['Storniert', canceled.length ? `${canceled.length} (eigenes Blatt „Storniert“, nicht in den Summen)` : 'keine'],
      ['', null],
      ['Ergebnis', `wie in der Liste „${W.insp.many}“: Punkte der Checkliste mit „${W.results.defect}“. Die erfassten ${W.defect.many} mit Einstufung stehen im Dashboard unter „${W.defect.many}“.`],
      ['Hinweis', exportNote(cfg.appName)],
      ['Zeiten', TIME_NOTE],
    ]),
  );
  return sheets;
}

// ---------------------------------------------------------------------------- Speichern

/** Datei speichern — Name ohne Endung (wird gesäubert). */
export function savePruefSheets(cfg: Pick<PruefConfig, 'appName'>, fileName: string, title: string, sheets: XlsxSheet[]): Promise<void> {
  return downloadXlsx(fileName, sheets, { title, creator: `Dexware ${cfg.appName}`, timeZone: EXPORT_TZ });
}

/** Prüfbuch-Übersicht bauen und speichern: „LeiterDex_Pruefbuch_2026-11-22.xlsx“. */
export function exportPruefbuch<U extends RawUnit, I extends RawInspection, D extends RawDefect>(
  spec: PruefExportSpec<U, I>,
  input: PruefbuchInput<U, I, D>,
): Promise<void> {
  const sheets = buildPruefbuch(spec, input);
  const app = spec.cfg.appName;
  return savePruefSheets(spec.cfg, `${app}_${spec.bookName}_${todayLocalISO()}`, `${app} ${spec.bookName}-Übersicht`, sheets);
}

/** Prüfungen im Zeitraum bauen und speichern: „LeiterDex_Pruefungen_2026-10-23_bis_2026-11-22.xlsx“ (mit Standort im Namen, wenn gewählt). */
export function exportInspectionList<U extends RawUnit, I extends RawInspection>(
  spec: PruefExportSpec<U, I>,
  input: InspectionListInput<U, I>,
): Promise<void> {
  const sheets = buildInspectionList(spec, input);
  const app = spec.cfg.appName;
  const words = wordsOf(spec.cfg);
  const one = input.siteId ? input.sites.find((s) => s.id === input.siteId)?.name : undefined;
  const p = input.period;
  return savePruefSheets(
    spec.cfg,
    `${app}_${words.insp.many}_${one ? `${one}_` : ''}${p.from}_bis_${p.to}`,
    `${app} ${words.insp.many} ${periodLabel(p)}`,
    sheets,
  );
}
