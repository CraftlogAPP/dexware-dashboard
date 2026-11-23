// Listen einlesen (Dashboard): Excel (.xlsx, ohne Bibliothek), CSV oder aus Excel kopierte Zellen → Tabelle →
// Überschriften finden → Spalten den Feldern zuordnen → Zeilen-Plan. EIN Baustein für alle Importe — WinterDex-Objekte
// (winterdex/importObjects.ts) und die Geräte der Prüf-Apps (pruefen/importUnits.ts, Oberfläche components/ImportWizard.tsx).
// Reine Logik ohne React. Der Leser (Tabelle aus Datei/Einfügen) stammt unverändert aus dem WinterDex-Import.

import { decodeCsv, norm, parseCsv } from '../installateurdex/importer';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 2000;
/** Spalten rechts davon werden nicht gelesen (verirrte Zellen weit rechts sprengen sonst die Vorschau) */
const MAX_COLS = 60;
/**
 * Alle entpackten XML-Teile zusammen höchstens so groß (Schutz vor „ZIP-Bomben“, der Browser-Tab soll nicht abstürzen).
 * Eine Liste mit 2.000 Zeilen hat meist 1–3 MB XML.
 */
const MAX_XML_BYTES = 40 * 1024 * 1024;
const TOO_BIG_XLSX = 'Die Excel-Datei ist zu groß — bitte die Liste aufteilen.';

// ---------------------------------------------------------------------------
// Liste lesen
// ---------------------------------------------------------------------------
export interface Table {
  /** Zeilen ohne ganz leere, Zellen getrimmt */
  rows: string[][];
  /** Zeilennummer je Zeile (Excel: wie im Tabellenblatt; CSV/Einfügen: Zeile im Text) */
  lines: number[];
  kind: 'xlsx' | 'csv' | 'paste';
  /** CSV wurde im Windows-Zeichensatz gelesen — Umlaute in der Vorschau prüfen */
  ansi?: boolean;
  /** Excel: Name des gelesenen Tabellenblatts und ob es weitere gibt */
  sheet?: string;
  moreSheets?: boolean;
}

const OLD_XLS =
  'Das ist das alte Excel-Format (.xls). Bitte die Datei in Excel mit „Speichern unter“ als .xlsx oder als CSV speichern — oder die Tabelle kopieren und unten einfügen.';
const UNREADABLE =
  'Die Datei lässt sich nicht lesen. Bitte in Excel als .xlsx oder CSV speichern — oder die Tabelle kopieren und unten einfügen.';
const NO_DATA = 'In der Liste stehen keine Daten.';
const TOO_MANY = `Die Liste hat mehr als ${MAX_ROWS.toLocaleString('de-DE')} Zeilen — bitte in mehrere Dateien aufteilen.`;

export async function readImportFile(file: Blob & { name: string }): Promise<Table> {
  if (file.size > MAX_BYTES) throw new Error('Die Datei ist größer als 5 MB — bitte die Liste aufteilen.');
  return tableFromBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

export async function tableFromBytes(buf: Uint8Array<ArrayBuffer>, fileName: string): Promise<Table> {
  if (buf.byteLength > MAX_BYTES) throw new Error('Die Datei ist größer als 5 MB — bitte die Liste aufteilen.');
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? '').toLowerCase();
  const sig = (...b: number[]) => b.every((v, i) => buf[i] === v);
  if (sig(0x50, 0x4b, 0x03, 0x04)) {
    if (ext === 'ods') throw new Error('Das ist eine OpenOffice-/LibreOffice-Tabelle (.ods). ' + UNREADABLE);
    return checkTable(await readXlsx(buf));
  }
  if (sig(0xd0, 0xcf, 0x11, 0xe0)) throw new Error(OLD_XLS);
  if (['xls', 'xlsb', 'ods', 'numbers', 'pdf', 'doc', 'docx'].includes(ext)) throw new Error(ext === 'xls' ? OLD_XLS : UNREADABLE);
  const { text, encoding } = decodeCsv(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  if (text.includes('\u0000')) throw new Error(UNREADABLE);
  let src = text.replace(/^﻿/, '');
  // „Excel 2003 XML“ oder als .xls gespeicherte Web-Seiten sind keine CSV
  if (/^\s*</.test(src)) throw new Error(UNREADABLE);
  // „sep=;“ in der ersten Zeile (Excel-Hinweis aufs Trennzeichen) — Excel zeigt die Zeile nicht an
  const sep = /^sep=(.)[ \t]*(?:\r\n|\n|\r|$)/i.exec(src);
  if (sep) src = src.slice(sep[0].length);
  // Trennzeichen wie der CSV-Import erkennen; Zeilen selbst zählen, damit „Zeile 4“ auch in Excel Zeile 4 ist
  // (der CSV-Import lässt leere Zeilen weg und zählt dann falsch)
  const delimiter = sep ? sep[1] : parseCsv(src).delimiter;
  const records = parseDelimited(src, delimiter).map((r) => r.map(unprotect));
  return checkTable({ ...numbered(records), kind: 'csv', ansi: encoding === 'windows-1252' });
}

/** Ein von Excel bzw. dem Export vorangestelltes ' vor = + - @ entfernen (wie der CSV-Import). */
const unprotect = (c: string) => (/^\s*'[=+\-@]/.test(c) ? c.trim().slice(1) : c);

/** Zellen säubern, leere Zeilen weglassen, Zeilennummer = Datensatz im Text (wie die Zeile in Excel). */
function numbered(records: string[][]): { rows: string[][]; lines: number[] } {
  const rows: string[][] = [];
  const lines: number[] = [];
  records.forEach((r, i) => {
    const c = cleanRow(r);
    if (c.some((x) => x !== '')) {
      rows.push(c);
      lines.push(i + 1);
    }
  });
  return { rows, lines };
}

/**
 * Aus Excel kopierte Zellen (Strg+C → Strg+V): Excel trennt mit Tabulator, Zellen mit Zeilenumbruch stehen in
 * Anführungszeichen. Ohne Tabulator: mit „;“ in der ersten Zeile wie eine CSV-Datei, sonst ist jede Zeile EINE Zelle
 * (eine kopierte Spalte „Hauptplatz 1, 8200 Gleisdorf“ darf nicht am Komma zerfallen).
 * Eigener Leser statt der Trennzeichen-Erkennung des CSV-Imports: die zählt nur in der ersten Zeile und hielte
 * „Hauptplatz 1, 8200 Gleisdorf<Tab>…“ für eine Komma-Liste.
 */
export function tableFromPaste(text: string): Table {
  if (text.length > MAX_BYTES) throw new Error('Der eingefügte Text ist zu lang — bitte die Liste aufteilen.');
  const src = text.replace(/^﻿/, '');
  const firstLine = /^[^\r\n]*/.exec(src)?.[0] ?? '';
  const delimiter = !src.includes('\t') && firstLine.includes(';') ? ';' : '\t';
  return checkTable({ ...numbered(parseDelimited(src, delimiter)), kind: 'paste' });
}

/** Text mit Trennzeichen nach RFC 4180 (Anführungszeichen, "" im Feld, Zeilenumbruch im Feld) — alle Zeilen, auch leere. */
function parseDelimited(src: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Zellen trimmen, geschützte Leerzeichen normal, höchstens MAX_COLS Spalten, leere Spalten am Ende weg. */
function cleanRow(r: string[]): string[] {
  const out = r.slice(0, MAX_COLS).map((c) => (c ?? '').replace(/[   ]/g, ' ').trim());
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

function checkTable(t: Table): Table {
  const keep = t.rows.map((r, i) => [r, t.lines[i]] as const).filter(([r]) => r.some((c) => c !== ''));
  if (!keep.length) throw new Error(NO_DATA);
  if (keep.length > MAX_ROWS + 1) throw new Error(TOO_MANY);
  return { ...t, rows: keep.map(([r]) => r), lines: keep.map(([, l]) => l) };
}

// ---------------------------------------------------------------------------
// .xlsx ohne Bibliothek: ZIP (Methode 0 = gespeichert, 8 = deflate) + XML über DOMParser
// ---------------------------------------------------------------------------
interface ZipEntry {
  flags: number;
  method: number;
  compSize: number;
  offset: number;
}

/** Inhaltsverzeichnis am Ende der ZIP-Datei lesen. Namen klein (OOXML-Teilnamen sind nicht groß/klein-sensitiv). */
export function readZipDirectory(b: Uint8Array): Map<string, ZipEntry> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(UNREADABLE);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error(UNREADABLE);
    const nameLen = dv.getUint16(p + 28, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/').replace(/^\//, '').toLowerCase();
    out.set(name, {
      flags: dv.getUint16(p + 8, true),
      method: dv.getUint16(p + 10, true),
      compSize: dv.getUint32(p + 20, true),
      offset: dv.getUint32(p + 42, true),
    });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return out;
}

/** Wie viel noch entpackt werden darf (gilt für alle Teile einer Datei zusammen). */
interface Budget {
  left: number;
}

async function unzip(b: Uint8Array<ArrayBuffer>, e: ZipEntry, budget: Budget): Promise<Uint8Array> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (e.flags & 1) throw new Error('Die Datei ist mit einem Passwort geschützt. Bitte ohne Passwort speichern — oder die Tabelle kopieren und unten einfügen.');
  if (e.offset + 30 > b.length || dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error(UNREADABLE);
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const data = b.subarray(start, start + e.compSize);
  if (e.method === 0) {
    budget.left -= data.byteLength;
    if (budget.left < 0) throw new Error(TOO_BIG_XLSX);
    return data;
  }
  if (e.method !== 8) throw new Error(UNREADABLE);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Dieser Browser kann Excel-Dateien nicht öffnen. Bitte die Liste als CSV speichern — oder die Tabelle kopieren und unten einfügen.');
  }
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      budget.left -= value.byteLength;
      if (budget.left < 0) {
        void reader.cancel();
        throw new Error(TOO_BIG_XLSX);
      }
      parts.push(value);
    }
  } catch (err) {
    if (err instanceof Error && err.message === TOO_BIG_XLSX) throw err;
    throw new Error(UNREADABLE);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

function parseXml(bytes: Uint8Array): Document {
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
  if (doc.getElementsByTagNameNS('*', 'parsererror').length) throw new Error(UNREADABLE);
  return doc;
}

/** Alle Elemente mit diesem Namen (ohne Rücksicht auf Namensraum-Präfixe wie x:row) */
const all = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name));
const kids = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name);

/** r:id eines Tabellenblatts (Namensraum der Beziehungen, auch „Strict“-Dateien) */
function relId(el: Element): string | null {
  for (const a of Array.from(el.attributes)) if (a.localName === 'id' && a.namespaceURI && /relationships/.test(a.namespaceURI)) return a.value;
  return el.getAttribute('r:id');
}

interface Rel {
  type: string;
  target: string;
}

function readRels(doc: Document | null, baseDir: string): Map<string, Rel> {
  const out = new Map<string, Rel>();
  if (!doc) return out;
  for (const r of all(doc, 'Relationship')) {
    const id = r.getAttribute('Id');
    const target = r.getAttribute('Target');
    if (!id || !target || r.getAttribute('TargetMode') === 'External') continue;
    out.set(id, { type: r.getAttribute('Type') ?? '', target: resolvePath(baseDir, target) });
  }
  return out;
}

function resolvePath(baseDir: string, target: string): string {
  const parts = (target.startsWith('/') ? target.slice(1) : baseDir + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/').toLowerCase();
}

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

/** Erstes sichtbares Tabellenblatt einer .xlsx-Datei als Zeilen. */
export async function readXlsx(buf: Uint8Array<ArrayBuffer>): Promise<Table> {
  const zip = readZipDirectory(buf);
  const budget: Budget = { left: MAX_XML_BYTES };
  const load = async (path: string): Promise<Document | null> => {
    const e = zip.get(path.toLowerCase());
    return e ? parseXml(await unzip(buf, e, budget)) : null;
  };
  const rootRels = readRels(await load('_rels/.rels'), '');
  const wbPath = [...rootRels.values()].find((r) => /\/officeDocument$/.test(r.type))?.target ?? 'xl/workbook.xml';
  const wb = await load(wbPath);
  if (!wb) {
    throw new Error(zip.has('content.xml') ? 'Das ist eine OpenOffice-/LibreOffice-Tabelle. ' + UNREADABLE : UNREADABLE);
  }
  const wbDir = dirOf(wbPath);
  const rels = readRels(await load(`${wbDir}_rels/${wbPath.slice(wbDir.length)}.rels`), wbDir);

  const sheets = all(wb, 'sheet')
    .map((s) => ({ el: s, rel: rels.get(relId(s) ?? '') }))
    .filter((s) => !s.rel || /\/worksheet$/.test(s.rel.type));
  const visible = sheets.filter((s) => !/hidden/i.test(s.el.getAttribute('state') ?? ''));
  const first = visible[0] ?? sheets[0];
  if (!first) throw new Error('In der Excel-Datei ist kein Tabellenblatt.');
  const sheetDoc = await load(first.rel?.target ?? `${wbDir}worksheets/sheet1.xml`);
  if (!sheetDoc) throw new Error(UNREADABLE);

  const relOf = (type: RegExp, fallback: string) => [...rels.values()].find((r) => type.test(r.type))?.target ?? fallback;
  const sstDoc = await load(relOf(/\/sharedStrings$/, `${wbDir}sharedstrings.xml`));
  const shared = sstDoc ? all(sstDoc, 'si').map(richText) : [];
  const stylesDoc = await load(relOf(/\/styles$/, `${wbDir}styles.xml`));
  const styles = stylesDoc ? readCellFormats(stylesDoc) : [];
  const pr = all(wb, 'workbookPr')[0];
  const date1904 = /^(1|true)$/.test(pr?.getAttribute('date1904') ?? '');

  const { rows, lines } = readSheet(sheetDoc, shared, styles, date1904);
  return {
    rows,
    lines,
    kind: 'xlsx',
    sheet: first.el.getAttribute('name') ?? undefined,
    moreSheets: visible.length > 1,
  };
}

/** Text eines <si>/<is>: direkt <t> oder Formatierungs-Abschnitte <r><t>…</t></r> (ohne Lautschrift <rPh>). */
function richText(el: Element): string {
  let s = '';
  for (const c of Array.from(el.children)) {
    if (c.localName === 't') s += c.textContent ?? '';
    else if (c.localName === 'r') for (const t of kids(c, 't')) s += t.textContent ?? '';
  }
  return s;
}

type DateKind = 'date' | 'time' | 'datetime' | null;
interface CellFmt {
  date: DateKind;
  /** Format „00000“ (PLZ mit führender Null wie 01067): auf so viele Stellen auffüllen */
  zeros: number;
}

/**
 * Je Zellformat (Attribut s): Datum/Uhrzeit (sonst stünde „45658“ statt „01.01.2025“ in der Vorschau) oder
 * Ziffernformat „00000“ (sonst würde aus der PLZ 01067 die 1067).
 */
function readCellFormats(doc: Document): CellFmt[] {
  const custom = new Map<number, string>();
  for (const f of all(doc, 'numFmt')) custom.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '');
  const xfs = all(doc, 'cellXfs')[0];
  if (!xfs) return [];
  return kids(xfs, 'xf').map((xf) => {
    const id = Number(xf.getAttribute('numFmtId') ?? 0);
    const code = custom.get(id);
    return { date: dateKind(id, code), zeros: /^0{2,10}$/.test(code ?? '') ? code!.length : 0 };
  });
}

function dateKind(id: number, code: string | undefined): DateKind {
  if ((id >= 14 && id <= 17) || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return 'date';
  if ((id >= 18 && id <= 21) || (id >= 45 && id <= 47)) return 'time';
  if (id === 22) return 'datetime';
  if (!code) return null;
  const c = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[(?![hms]+\])[^\]]*\]/gi, '');
  const time = /[hs]/i.test(c);
  const date = /[dy]/i.test(c) || (/m/i.test(c) && !time);
  return date && time ? 'datetime' : date ? 'date' : time ? 'time' : null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function excelDate(serial: number, kind: Exclude<DateKind, null>, date1904: boolean): string {
  const ms = Math.round((serial + (date1904 ? 1462 : 0)) * 86_400_000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  const date = `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  return kind === 'date' ? date : kind === 'time' ? time : `${date} ${time}`;
}

/** Zahl aus der Datei als Text: 1010 bleibt „1010“ (PLZ), Kommazahlen mit Komma. */
function numberText(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (Number.isInteger(n)) return Math.abs(n) < 1e21 ? n.toFixed(0) : String(n);
  return String(Number(n.toPrecision(15))).replace('.', ',');
}

/** Spaltenbuchstaben der Zellreferenz → Index (C5 → 2, AA1 → 26); -1 ohne Buchstaben. */
export function colIndex(ref: string): number {
  const m = /^([A-Z]+)/i.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readSheet(doc: Document, shared: string[], styles: CellFmt[], date1904: boolean): { rows: string[][]; lines: number[] } {
  const data = all(doc, 'sheetData')[0];
  const found: { line: number; cells: string[] }[] = [];
  if (!data) return { rows: [], lines: [] };
  let rowIdx = 0;
  for (const rowEl of kids(data, 'row')) {
    const r = Number(rowEl.getAttribute('r'));
    rowIdx = Number.isInteger(r) && r > 0 ? r : rowIdx + 1;
    const cells: string[] = [];
    let col = -1;
    for (const c of kids(rowEl, 'c')) {
      const ref = c.getAttribute('r');
      const ci = ref ? colIndex(ref) : -1;
      col = ci >= 0 ? ci : col + 1;
      if (col >= MAX_COLS) continue;
      const v = cellText(c, shared, styles, date1904);
      if (v !== '') cells[col] = v;
    }
    const row = cleanRow(Array.from(cells, (x) => x ?? ''));
    if (!row.length) continue;
    found.push({ line: rowIdx, cells: row });
    if (found.length > MAX_ROWS + 1) throw new Error(TOO_MANY);
  }
  found.sort((a, b) => a.line - b.line);
  return { rows: found.map((f) => f.cells), lines: found.map((f) => f.line) };
}

function cellText(c: Element, shared: string[], styles: CellFmt[], date1904: boolean): string {
  const t = c.getAttribute('t') ?? 'n';
  if (t === 'inlineStr') {
    const is = kids(c, 'is')[0];
    return is ? richText(is) : '';
  }
  const v = kids(c, 'v')[0]?.textContent ?? '';
  if (v === '') return '';
  switch (t) {
    case 's':
      return shared[Number(v)] ?? '';
    case 'str':
      return v;
    case 'b':
      return v === '1' ? 'ja' : 'nein';
    case 'e':
      return ''; // #NV, #BEZUG! … — keine Daten
    case 'd': {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
      return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
    }
    default: {
      const fmt = styles[Number(c.getAttribute('s') ?? 0)];
      const n = Number(v);
      if (fmt?.date && Number.isFinite(n)) return excelDate(n, fmt.date, date1904);
      const text = numberText(v);
      return fmt?.zeros && /^\d+$/.test(text) ? text.padStart(fmt.zeros, '0') : text;
    }
  }
}

/** Spaltenbuchstabe wie in Excel: 0 → A, 26 → AA. */
export function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Vergleichen
// ---------------------------------------------------------------------------
/** Für Vergleiche: klein, Umlaute ausgeschrieben, „Straße“ = „Str.“, nur Buchstaben/Ziffern durch Leerzeichen getrennt. */
export function cmpKey(s: string): string {
  return norm(s)
    .replace(/strasse/g, 'str')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function dataRows(table: Pick<Table, 'rows' | 'lines'>, hasHeader: boolean): { cells: string[]; line: number }[] {
  return table.rows.slice(hasHeader ? 1 : 0).map((cells, j) => ({ cells, line: table.lines[j + (hasHeader ? 1 : 0)] ?? j + 1 }));
}

// ---------------------------------------------------------------------------
// Felder + Spalten erkennen (allgemein; WinterDex hat dazu eigene Sonderregeln in importObjects.ts)
// ---------------------------------------------------------------------------
export interface ImportField {
  key: string;
  label: string;
  hint?: string;
  /** Überschriften (klein, ohne Umlaute/Sonderzeichen — headerKey), die genau passen; frühere Einträge haben Vorrang */
  exact: string[];
  /** Überschriften, die so beginnen (z. B. „Hersteller (lt. Typenschild)“) */
  prefix?: string[];
  /** unsichere Überschriften: erst, wenn sonst nichts passt */
  weak?: string[];
  /** Überschriften mit diesen Wortteilen nie über prefix/weak */
  notIf?: RegExp;
}

export type Mapping = Partial<Record<string, number>>;

/** Überschrift als Schlüssel: „Länge / Arbeitshöhe (m)“ → „laengearbeitshoehem“ */
export const headerKey = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');

/**
 * Spalten anhand der Überschriften zuordnen (jede Spalte höchstens einmal): zuerst genaue Treffer (in der Reihenfolge
 * der Felder und ihrer Überschriften — „Letzte Regelmäßige Prüfung“ vor „Letzte Prüfung“), dann Anfänge, dann unsichere.
 */
export function guessFieldMapping(fields: readonly ImportField[], header: string[]): Mapping {
  const keys = header.map(headerKey);
  const used = new Set<number>();
  const m: Mapping = {};
  const take = (f: ImportField, i: number) => {
    m[f.key] = i;
    used.add(i);
  };
  for (const f of fields) {
    for (const e of f.exact) {
      const i = keys.findIndex((k, j) => !used.has(j) && k === e);
      if (i >= 0) {
        take(f, i);
        break;
      }
    }
  }
  const loose = (f: ImportField, k: string) => !(f.notIf?.test(k) ?? false);
  for (const f of fields) {
    if (m[f.key] !== undefined || !f.prefix) continue;
    const i = keys.findIndex((k, j) => !used.has(j) && loose(f, k) && f.prefix!.some((p) => k.startsWith(p)));
    if (i >= 0) take(f, i);
  }
  for (const f of fields) {
    if (m[f.key] !== undefined || !f.weak) continue;
    const i = keys.findIndex((k, j) => !used.has(j) && loose(f, k) && f.weak!.includes(k));
    if (i >= 0) take(f, i);
  }
  return m;
}

/** So weit unten wird die Überschriften-Zeile noch gesucht (darüber stehen oft Titel wie „Inventarliste 2026“). */
const HEADER_SCAN = 10;

/**
 * Zeile mit den Überschriften: unter den ersten Zeilen die mit den meisten erkannten Spalten (mindestens zwei);
 * sonst die erste Zeile, wenn eine Spalte erkannt wird und sie keine Ziffern enthält. -1 = keine Überschriften.
 */
export function findFieldHeaderRow(fields: readonly ImportField[], rows: string[][]): number {
  let best = -1;
  let bestN = 1;
  rows.slice(0, HEADER_SCAN).forEach((r, i) => {
    const n = Object.keys(guessFieldMapping(fields, r)).length;
    if (n > bestN) {
      best = i;
      bestN = n;
    }
  });
  if (best >= 0) return best;
  const first = rows[0];
  return first && Object.keys(guessFieldMapping(fields, first)).length === 1 && !first.some((c) => /\d/.test(c)) ? 0 : -1;
}

export interface FieldLayout {
  /** Tabelle ab der Überschriften-Zeile (Titelzeilen darüber weggelassen) */
  table: Table;
  hasHeader: boolean;
  mapping: Mapping;
  /** weggelassene Zeilen über den Überschriften */
  skipped: number;
}

/**
 * Überschriften finden, Titelzeilen darüber weglassen, Spalten zuordnen. Ohne Überschriften wird nichts geraten —
 * die Spalten ordnet man dann selbst zu (`fallback` schlägt z. B. die erste Spalte als Bezeichnung vor).
 */
export function detectFieldLayout(fields: readonly ImportField[], t: Table, fallback: Mapping = {}): FieldLayout {
  const h = findFieldHeaderRow(fields, t.rows);
  const skipped = Math.max(0, h);
  const table = skipped ? { ...t, rows: t.rows.slice(skipped), lines: t.lines.slice(skipped) } : t;
  const hasHeader = h >= 0;
  return { table, hasHeader, mapping: hasHeader ? guessFieldMapping(fields, table.rows[0] ?? []) : { ...fallback }, skipped };
}

/** Zelle eines Feldes in einer Zeile (getrimmt, leer = '') */
export function cellOf(cells: string[], mapping: Mapping, key: string): string {
  const c = mapping[key];
  return c === undefined ? '' : (cells[c] ?? '').trim();
}

// ---------------------------------------------------------------------------
// Werte
// ---------------------------------------------------------------------------
/** Zeilenumbrüche und doppelte Leerzeichen weg */
export const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
/** höchstens n Zeichen */
export const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s);

/** „ja“/„x“/„1“ → true, „nein“/„0“/leer → false, sonst null (unklar). */
export function yesNo(raw: string): boolean | null {
  const k = headerKey(raw);
  if (!k || ['nein', 'n', 'no', '0', 'false', 'falsch', 'inbetrieb', 'aktiv'].includes(k)) return false;
  if (['ja', 'j', 'x', 'yes', 'y', '1', 'true', 'wahr', 'ausgesondert', 'stillgelegt', 'abgebaut', 'ausserbetrieb'].includes(k)) return true;
  return null;
}

/**
 * Kalendertag aus einer Zelle: „05.03.2026“, „5.3.26“, „2026-03-05“, „05.03.2026 14:30“ (so liefert der Excel-Leser
 * Datumszellen). Ergebnis „TT.MM.JJJJ“, null = kein Datum.
 */
export function parseDay(raw: string): string | null {
  const s = raw.trim();
  let d: number;
  let m: number;
  let y: number;
  let r = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[ ,T]+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (r) {
    d = +r[1];
    m = +r[2];
    y = +r[3] < 100 ? 2000 + +r[3] : +r[3];
  } else if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(s))) {
    y = +r[1];
    m = +r[2];
    d = +r[3];
  } else return null;
  const t = new Date(y, m - 1, d);
  if (t.getFullYear() !== y || t.getMonth() !== m - 1 || t.getDate() !== d || y < 1950 || y > 2100) return null;
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

export interface OptionPick {
  /** erlaubter Wert */
  value: string;
  /** wie erkannt: genau, über ein Synonym, im Text enthalten, leer (Vorgabe) oder unbekannt (Vorgabe) */
  how: 'exact' | 'synonym' | 'contains' | 'empty' | 'unknown';
}

/**
 * Auswahlfeld (Bauart, Material, Typ …) auf einen erlaubten Wert abbilden: genauer Treffer, Synonym, dann ein
 * Wert/Synonym im Text („Alu-Stehleiter 3×8“ → Stehleiter) — längere Wörter zuerst („Zurrkette“ vor „Kette“).
 * Sonst `fallback` (die Vorschau zeigt dann einen Hinweis).
 */
export function pickOption(
  raw: string,
  options: readonly { value: string; label: string }[],
  synonyms: Readonly<Record<string, readonly string[]>>,
  fallback: string,
): OptionPick {
  const k = headerKey(raw);
  if (!k) return { value: fallback, how: 'empty' };
  for (const o of options) if (headerKey(o.value) === k || headerKey(o.label) === k) return { value: o.value, how: 'exact' };
  const words: { w: string; value: string }[] = [];
  for (const o of options) {
    words.push({ w: headerKey(o.label), value: o.value });
    for (const s of synonyms[o.value] ?? []) words.push({ w: headerKey(s), value: o.value });
  }
  for (const { w, value } of words) if (w === k) return { value, how: 'synonym' };
  const long = words.filter((x) => x.w.length >= 3).sort((a, b) => b.w.length - a.w.length);
  for (const { w, value } of long) if (k.includes(w)) return { value, how: 'contains' };
  return { value: fallback, how: 'unknown' };
}

// ---------------------------------------------------------------------------
// Plan und Anlegen
// ---------------------------------------------------------------------------
/** neu / übersprungen (Pflichtangabe fehlt …) / schon vorhanden / doppelt in der Liste */
export type ImportStatus = 'ok' | 'skip' | 'exists' | 'dup';

export interface ImportPlanRow<P> {
  /** Index unter den Daten-Zeilen (für die Auswahl) */
  i: number;
  /** Zeile in der Datei */
  line: number;
  status: ImportStatus;
  /** Grund in Worten (leer bei „neu“) */
  reason: string;
  /** Vorschau: Titel, Unterzeile und weitere Spalten (passend zu den Spalten des Adapters) */
  title: string;
  sub: string;
  cells: string[];
  /** Hinweise in der Vorschau, z. B. „Bauart „Klappleiter“ unbekannt → Sonstige“ */
  hints: string[];
  /** null = Zeile kann nicht angelegt werden */
  payload: P | null;
}

export interface ImportPlan<P> {
  rows: ImportPlanRow<P>[];
  count: Record<ImportStatus, number>;
  /** weitere Sätze für die Zusammenfassung, z. B. „2 neue Standorte werden mit angelegt.“ */
  notes: string[];
}

export function countStatus(rows: readonly { status: ImportStatus }[]): Record<ImportStatus, number> {
  const count: Record<ImportStatus, number> = { ok: 0, skip: 0, exists: 0, dup: 0 };
  for (const r of rows) count[r.status]++;
  return count;
}

export interface InsertFailure {
  line: number;
  name: string;
  reason: string;
}

/** Fehler, bei denen jede weitere Zeile genauso scheitert — dann nicht Zeile für Zeile weiterprobieren (wie WinterDex) */
const FATAL = /keine Verbindung|fehlt dir die Berechtigung|Anmeldung ist abgelaufen/;

/**
 * In Paketen anlegen (wie der WinterDex-Import): schlägt ein Paket fehl, einzeln wiederholen und die fehlerhaften
 * Zeilen benennen. Die Zeilen tragen feste ids — `insert` muss bei EINER Zeile „gibt es schon“ (23505, Antwort beim
 * ersten Versuch verloren) als Erfolg werten. Bei kein Netz / keine Berechtigung / Anmeldung abgelaufen bricht es ab.
 */
export async function insertInChunks<T>(
  items: readonly T[],
  insert: (part: T[]) => Promise<void>,
  describe: (item: T) => { line: number; name: string },
  opts: { chunk?: number; progress?: (done: number) => void; strip?: RegExp } = {},
): Promise<{ ok: T[]; failed: InsertFailure[] }> {
  const chunk = opts.chunk ?? 50;
  const why = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return opts.strip ? msg.replace(opts.strip, '') : msg;
  };
  const ok: T[] = [];
  const failed: InsertFailure[] = [];
  let fatal = '';
  for (let k = 0; k < items.length; k += chunk) {
    opts.progress?.(k);
    const part = items.slice(k, k + chunk);
    if (!fatal) {
      try {
        await insert(part);
        ok.push(...part);
        continue;
      } catch (e) {
        if (FATAL.test(why(e))) fatal = why(e);
      }
    }
    for (const it of part) {
      if (fatal) {
        failed.push({ ...describe(it), reason: fatal });
        continue;
      }
      try {
        await insert([it]);
        ok.push(it);
      } catch (e) {
        const reason = why(e);
        if (FATAL.test(reason)) fatal = reason;
        failed.push({ ...describe(it), reason });
      }
    }
  }
  opts.progress?.(items.length);
  return { ok, failed };
}

// ---------------------------------------------------------------------------
// Adapter für die Oberfläche (components/ImportWizard.tsx) — je App einer, z. B. pruefen/importUnits.ts
// ---------------------------------------------------------------------------
/** Auswahl über der Vorschau, z. B. „In welchen Standort?“ */
export interface ImportChoice {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  /** Vorgabe */
  value: string;
}

export interface ImportProgress {
  label: string;
  done: number;
  /** 0 = ohne Balken (z. B. „wird geprüft …“) */
  total: number;
}

export interface ImportResult {
  created: number;
  failed: InsertFailure[];
  /** weitere Sätze, z. B. „2 neue Standorte angelegt.“ */
  notes: string[];
}

export interface ImportAdapter<P> {
  /** „Leiter“ / „Leitern“ — für Knöpfe und Sätze */
  noun: { one: string; many: string };
  /** Felder zum Zuordnen (Reihenfolge = Anzeige) */
  fields: readonly ImportField[];
  /** ohne diese Felder geht nichts (Hinweis „bitte zuordnen“) */
  required: readonly string[];
  /** Vorschlag, wenn die Liste keine Überschriften hat */
  fallbackMapping?: Mapping;
  /** weitere Spalten der Vorschau zwischen Titel und Status */
  columns: readonly string[];
  /** Erklärung über der Vorschau */
  notice?: string;
  /** Auswahl über der Vorschau abhängig von der Zuordnung — null = keine */
  choice?(mapping: Mapping): ImportChoice | null;
  plan(args: { table: Table; hasHeader: boolean; mapping: Mapping; choice: string }): ImportPlan<P>;
  /** höchstens so viele neue Einträge (null = unbegrenzt) */
  allowance: number | null;
  /** Satz, wenn die Grenze greift */
  limitText(allowance: number): string;
  /** frisch prüfen und anlegen (angehakte Zeilen) */
  write(plan: ImportPlan<P>, selected: ReadonlySet<number>, choice: string, progress: (p: ImportProgress) => void): Promise<ImportResult>;
  /** Vorlage herunterladen */
  template(): Promise<void>;
}
