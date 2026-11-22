// WinterDex — Objekte aus einer Excel- oder CSV-Liste übernehmen (Dashboard, nur Inhaber). Reine Logik ohne React:
//   Datei (.xlsx/.csv) oder eingefügte Tabelle → Zeilen → Spalten erkennen → Plan (was angelegt wird, was nicht, warum).
// Regeln:
//  - Pflicht je Zeile ist die Adresse (Straße bzw. komplette Adresse); ohne sie wird die Zeile übersprungen.
//  - Fehlt der Name, heißt das Objekt wie die Straße mit Hausnummer.
//  - Gleicher Name + gleiche Adresse wie ein vorhandenes Objekt = „schon vorhanden“ (abgewählt) — ein zweiter Import
//    derselben Liste legt nichts doppelt an. Doppelte Zeilen in der Liste: nur die erste ist ausgewählt.
//  - Leere Pflichtzeiten bekommen die Vorgabe des gewählten Landes (wie die App beim neuen Objekt).
//  - Gratis: höchstens 2 aktive Objekte (wie die App). Der Server prüft das nicht — deshalb hält der Import es selbst ein.
// .xlsx wird ohne Zusatz-Bibliothek gelesen (ZIP + XML des ersten Tabellenblatts), .csv mit dem Leser des InstallateurDex-Imports.

import { decodeCsv, norm, parseCsv } from '../installateurdex/importer';
import { toCsv } from '../installateurdex/csv';
import type { PropertyInput } from './api';
import { FREE_PROPERTIES } from './pro';
import { DUTY_DEFAULTS, type Land, type Property } from './types';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 2000;
/** Spalten rechts davon werden nicht gelesen (verirrte Zellen weit rechts sprengen sonst die Vorschau) */
const MAX_COLS = 60;
/** entpackte XML-Datei höchstens so groß (Schutz vor „ZIP-Bomben“) */
const MAX_XML_BYTES = 80 * 1024 * 1024;

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
  // „Excel 2003 XML“ oder als .xls gespeicherte Web-Seiten sind keine CSV
  if (/^\s*</.test(text.replace(/^﻿/, ''))) throw new Error(UNREADABLE);
  const { rows } = parseCsv(text);
  const clean = rows.map(cleanRow);
  return checkTable({ rows: clean, lines: clean.map((_, i) => i + 1), kind: 'csv', ansi: encoding === 'windows-1252' });
}

/**
 * Aus Excel kopierte Zellen (Strg+C → Strg+V): Excel trennt mit Tabulator, Zellen mit Zeilenumbruch stehen in
 * Anführungszeichen. Ohne Tabulator wird der Text wie eine CSV-Datei gelesen.
 * Eigener Leser statt der Trennzeichen-Erkennung des CSV-Imports: die zählt nur in der ersten Zeile und hielte
 * „Hauptplatz 1, 8200 Gleisdorf<Tab>…“ für eine Komma-Liste.
 */
export function tableFromPaste(text: string): Table {
  const src = text.replace(/^﻿/, '');
  let rows: string[][];
  let lines: number[];
  if (src.includes('\t')) {
    const all = parseTabbed(src).map(cleanRow);
    lines = [];
    rows = [];
    all.forEach((r, i) => {
      if (r.some((c) => c !== '')) {
        rows.push(r);
        lines.push(i + 1);
      }
    });
  } else {
    rows = parseCsv(src).rows.map(cleanRow);
    lines = rows.map((_, i) => i + 1);
  }
  return checkTable({ rows, lines, kind: 'paste' });
}

function parseTabbed(src: string): string[][] {
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
    else if (ch === '\t') {
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

async function unzip(b: Uint8Array<ArrayBuffer>, e: ZipEntry): Promise<Uint8Array> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (e.flags & 1) throw new Error('Die Datei ist mit einem Passwort geschützt. Bitte ohne Passwort speichern — oder die Tabelle kopieren und unten einfügen.');
  if (e.offset + 30 > b.length || dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error(UNREADABLE);
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const data = b.subarray(start, start + e.compSize);
  if (e.method === 0) return data;
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
      if (total > MAX_XML_BYTES) {
        void reader.cancel();
        throw new Error('Die Excel-Datei ist zu groß — bitte die Liste aufteilen.');
      }
      parts.push(value);
    }
  } catch (err) {
    if (err instanceof Error && /zu groß/.test(err.message)) throw err;
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
  const load = async (path: string): Promise<Document | null> => {
    const e = zip.get(path.toLowerCase());
    return e ? parseXml(await unzip(buf, e)) : null;
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

// ---------------------------------------------------------------------------
// Felder + Spalten erkennen
// ---------------------------------------------------------------------------
export type FieldKey =
  | 'name'
  | 'address'
  | 'street'
  | 'houseNo'
  | 'zip'
  | 'city'
  | 'customer'
  | 'contact'
  | 'phone'
  | 'email'
  | 'areas'
  | 'notes'
  | 'dutyAll'
  | 'dutyMoFr'
  | 'dutySa'
  | 'dutySo';

export interface FieldDef {
  key: FieldKey;
  label: string;
  hint?: string;
  /** Überschriften (klein, ohne Umlaute/Sonderzeichen), die genau passen */
  exact: string[];
  /** Überschriften, die so beginnen (z. B. „Fläche (m²)“) */
  prefix?: string[];
}

export const FIELDS: FieldDef[] = [
  {
    key: 'name',
    label: 'Name des Objekts',
    hint: 'leer: Straße und Hausnummer',
    exact: ['name', 'objekt', 'objektname', 'objektbezeichnung', 'bezeichnung', 'liegenschaft', 'liegenschaftsname', 'gebaeude', 'objektbez'],
    prefix: ['objektbezeichnung', 'liegenschaftsbezeichnung'],
  },
  {
    key: 'address',
    label: 'Adresse (komplett)',
    hint: 'z. B. „Hauptplatz 1, 8200 Gleisdorf“',
    exact: ['adresse', 'anschrift', 'objektadresse', 'liegenschaftsadresse', 'standort', 'postanschrift', 'vollstaendigeadresse'],
    prefix: ['adresse', 'anschrift'],
  },
  {
    key: 'street',
    label: 'Straße',
    exact: ['strasse', 'str', 'strassenname', 'strassehausnummer', 'strasseundhausnummer', 'strassenr', 'strassehnr', 'gasse', 'strassegasse'],
    prefix: ['strasse'],
  },
  { key: 'houseNo', label: 'Hausnummer', exact: ['hausnummer', 'hausnr', 'hnr', 'hsnr'], prefix: ['hausn'] },
  { key: 'zip', label: 'PLZ', exact: ['plz', 'postleitzahl', 'postlz'] },
  { key: 'city', label: 'Ort', exact: ['ort', 'stadt', 'gemeinde', 'wohnort', 'ortschaft', 'plzort', 'ortsname', 'stadtgemeinde'] },
  {
    key: 'customer',
    label: 'Auftraggeber',
    exact: ['auftraggeber', 'auftraggeberin', 'kunde', 'kundin', 'kundenname', 'kunden', 'eigentuemer', 'eigentuemerin', 'besitzer', 'hausverwaltung', 'verwaltung', 'hausverwalter', 'vermieter'],
    prefix: ['auftraggeber', 'eigentuemer', 'hausverwaltung', 'kundenname'],
  },
  {
    key: 'contact',
    label: 'Kontakt',
    hint: 'z. B. Ansprechpartner — Telefon und E-Mail kommen dazu',
    exact: ['kontakt', 'ansprechpartner', 'ansprechpartnerin', 'ansprechperson', 'kontaktperson', 'auftraggeberkontakt', 'kontaktdaten'],
    prefix: ['ansprechp', 'kontakt'],
  },
  {
    key: 'phone',
    label: 'Telefon',
    exact: ['telefon', 'tel', 'telefonnummer', 'telnr', 'telefonnr', 'handy', 'mobil', 'mobilnummer', 'handynummer', 'phone'],
    prefix: ['telefon'],
  },
  { key: 'email', label: 'E-Mail', exact: ['email', 'mail', 'emailadresse', 'mailadresse'], prefix: ['email'] },
  {
    key: 'areas',
    label: 'Flächen',
    hint: 'z. B. Gehweg, Parkplatz, Zufahrt',
    exact: ['flaeche', 'flaechen', 'bereich', 'bereiche', 'raeumflaeche', 'raeumflaechen', 'streuflaeche', 'streuflaechen', 'flaechenbeschreibung', 'leistungsumfang', 'umfang', 'leistung', 'leistungen'],
    prefix: ['flaeche', 'bereich', 'raeumflaeche', 'streuflaeche'],
  },
  {
    key: 'notes',
    label: 'Notizen',
    exact: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'hinweis', 'hinweise', 'anmerkung', 'anmerkungen', 'info', 'infos', 'kommentar', 'beschreibung', 'sonstiges'],
    prefix: ['bemerkung', 'notiz', 'hinweis', 'anmerkung'],
  },
  {
    key: 'dutyAll',
    label: 'Pflichtzeiten (alle Tage)',
    hint: 'gilt für jeden Tag ohne eigene Spalte',
    exact: ['pflichtzeit', 'pflichtzeiten', 'raeumzeit', 'raeumzeiten', 'streuzeit', 'streuzeiten', 'raeumpflicht', 'zeiten', 'einsatzzeiten'],
  },
  { key: 'dutyMoFr', label: 'Pflichtzeiten Mo–Fr', exact: ['mofr', 'montagbisfreitag', 'montagfreitag', 'werktag', 'werktags', 'werktage'] },
  { key: 'dutySa', label: 'Pflichtzeiten Samstag', exact: ['sa', 'samstag', 'samstags'] },
  {
    key: 'dutySo',
    label: 'Pflichtzeiten Sonn-/Feiertag',
    exact: ['so', 'sonntag', 'sonntags', 'feiertag', 'feiertage', 'sofeiertag', 'sonnundfeiertag', 'sonnundfeiertage', 'sonnfeiertag'],
  },
];

export type Mapping = Partial<Record<FieldKey, number>>;

const headerKey = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');

/** „Pflichtzeiten Mo–Fr“, „Räumzeit Sa“, „So/Feiertag“ … */
function dutyField(k: string): FieldKey | null {
  if (k.includes('mofr') || k.includes('werktag') || k.includes('montagbis') || k.includes('montagfreitag')) return 'dutyMoFr';
  if (k.includes('samstag') || (k.includes('zeit') && k.endsWith('sa'))) return 'dutySa';
  if (k.includes('sonntag') || k.includes('feiertag') || (k.includes('zeit') && k.endsWith('so'))) return 'dutySo';
  return null;
}

/** Spalten anhand der Überschriften zuordnen (jede Spalte höchstens einmal). */
export function guessMapping(header: string[]): Mapping {
  const keys = header.map(headerKey);
  const used = new Set<number>();
  const m: Mapping = {};
  const take = (f: FieldKey, i: number) => {
    m[f] = i;
    used.add(i);
  };
  for (const f of FIELDS) {
    const i = keys.findIndex((k, j) => !used.has(j) && f.exact.includes(k));
    if (i >= 0) take(f.key, i);
  }
  keys.forEach((k, i) => {
    const d = used.has(i) ? null : dutyField(k);
    if (d && m[d] === undefined) take(d, i);
  });
  for (const f of FIELDS) {
    if (m[f.key] !== undefined || !f.prefix) continue;
    const i = keys.findIndex((k, j) => !used.has(j) && f.prefix!.some((p) => k.startsWith(p)));
    if (i >= 0) take(f.key, i);
  }
  // „Nr.“ ist nur rechts neben der Straße eine Hausnummer — ganz vorne ist es meist eine laufende Nummer
  if (m.houseNo === undefined && m.street !== undefined && m.address === undefined) {
    const i = keys.findIndex((k, j) => !used.has(j) && j > m.street! && ['nr', 'nummer'].includes(k));
    if (i >= 0) take('houseNo', i);
  }
  return m;
}

/** Erkennt eine Überschriften-Zeile: mindestens zwei bekannte Spalten oder eine und keine Ziffern. */
export function looksLikeHeader(first: string[]): boolean {
  const n = Object.keys(guessMapping(first)).length;
  return n >= 2 || (n === 1 && !first.some((c) => /\d/.test(c)));
}

/** Ohne Überschriften: Spalten am Inhalt erkennen (PLZ, Straße mit Nummer, komplette Adresse, Ort). */
export function guessMappingFromData(rows: string[][]): Mapping {
  const sample = rows.slice(0, 50);
  const cols = Math.max(0, ...sample.map((r) => r.length));
  const share = (i: number, re: RegExp) => {
    const vals = sample.map((r) => r[i] ?? '').filter(Boolean);
    return vals.length ? vals.filter((v) => re.test(v)).length / vals.length : 0;
  };
  const m: Mapping = {};
  const used = new Set<number>();
  const pick = (f: FieldKey, re: RegExp, from = 0) => {
    for (let i = from; i < cols; i++) {
      if (!used.has(i) && share(i, re) >= 0.6) {
        m[f] = i;
        used.add(i);
        return;
      }
    }
  };
  pick('address', /\d+\s*[a-z]?\s*,\s*(?:[A-Z]{1,2}-)?\d{4,5}\s+\p{L}/iu);
  pick('zip', /^(?:[A-Z]{1,2}-)?\d{4,5}$/i);
  if (m.address === undefined) pick('street', /^\D{3,}\s\d+\s*[a-z]?(?:\s*[-/]\s*\d+\s*[a-z]?)*$/iu);
  if (m.address === undefined && m.street === undefined) pick('street', /^\D{3,}$/u);
  if (m.street !== undefined) pick('houseNo', /^\d{1,3}\s*[a-z]?(?:\s*[-/]\s*\d+\s*[a-z]?)*$/i, m.street + 1);
  if (m.zip !== undefined) pick('city', /^\p{L}[\p{L} .'-]+$/u, m.zip + 1);
  // erste übrige Text-Spalte links der Adresse = Name
  const addrCol = m.address ?? m.street;
  for (let i = 0; i < (addrCol ?? cols); i++) {
    if (!used.has(i) && share(i, /\p{L}/u) >= 0.6) {
      m.name = i;
      break;
    }
  }
  return m;
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
// Werte
// ---------------------------------------------------------------------------
/** Für Vergleiche: klein, Umlaute ausgeschrieben, „Straße“ = „Str.“, nur Buchstaben/Ziffern durch Leerzeichen getrennt. */
export function cmpKey(s: string): string {
  return norm(s)
    .replace(/strasse/g, 'str')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** „6–22 Uhr“, „06:00 - 22:00“, „7.00-20.00“ → „06:00-22:00“ (Format der App); sonst der Text wie er ist. */
export function normDuty(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const m = /^(?:von\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|uhr)?\s*(?:-|–|—|bis)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|uhr)?$/i.exec(s);
  if (!m) return s.slice(0, 40);
  const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2] ?? 0), Number(m[3]), Number(m[4] ?? 0)];
  if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) return s.slice(0, 40);
  return `${pad2(h1)}:${pad2(m1)}-${pad2(h2)}:${pad2(m2)}`;
}

const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s);
const orNull = (s: string) => (s ? s : null);

/** PLZ einer Zeile (aus der PLZ-Spalte oder der Adresse), mit Länderkürzel falls angegeben. */
function zipOf(zipCell: string, address: string): { digits: string; land?: Land } | null {
  const pre = /^(D|A|CH)\s*-\s*/i.exec(zipCell);
  if (zipCell) {
    const digits = zipCell.replace(/\D/g, '');
    if (/^\d{4,5}$/.test(digits)) return { digits, land: pre ? landOf(pre[1]) : undefined };
  }
  const m = /(?:^|[\s,])(?:(D|A|CH)\s*-\s*)?(\d{4,5})\s+\p{L}/iu.exec(address);
  return m ? { digits: m[2], land: m[1] ? landOf(m[1]) : undefined } : null;
}
const landOf = (c: string): Land => (c.toUpperCase() === 'D' ? 'DE' : c.toUpperCase() === 'A' ? 'AT' : 'CH');

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------
export type RowStatus = 'ok' | 'missing' | 'exists' | 'dup';

export interface PlanRow {
  /** Index unter den Daten-Zeilen (für die Auswahl) */
  i: number;
  /** Zeile in der Datei */
  line: number;
  status: RowStatus;
  /** Grund in Worten (leer bei ok) */
  reason: string;
  name: string;
  address: string;
  customer: string;
  /** null = Zeile kann nicht angelegt werden */
  input: PropertyInput | null;
  /** mindestens ein Tag mit der Vorgabe des Landes gefüllt */
  dutyDefault: boolean;
  nameFromAddress: boolean;
}

export interface Plan {
  rows: PlanRow[];
  count: Record<RowStatus, number>;
}

export interface PlanInput {
  table: Pick<Table, 'rows' | 'lines'>;
  hasHeader: boolean;
  mapping: Mapping;
  land: Land;
  /** alle Objekte des Betriebs (auch pausierte) */
  existing: Pick<Property, 'name' | 'address'>[];
}

/** Gleiches Objekt? Gleicher Name und gleiche Adresse — eine darf länger sein („Hauptplatz 1“ = „Hauptplatz 1, 8200 Gleisdorf“). */
function sameAddress(a: string, b: string): boolean {
  return a === b || a.startsWith(b + ' ') || b.startsWith(a + ' ');
}

export function dataRows(table: Pick<Table, 'rows' | 'lines'>, hasHeader: boolean): { cells: string[]; line: number }[] {
  return table.rows.slice(hasHeader ? 1 : 0).map((cells, j) => ({ cells, line: table.lines[j + (hasHeader ? 1 : 0)] ?? j + 1 }));
}

export function buildPlan(input: PlanInput): Plan {
  const { mapping: m, land } = input;
  const byName = new Map<string, string[]>();
  for (const p of input.existing) {
    const k = cmpKey(p.name);
    byName.set(k, [...(byName.get(k) ?? []), cmpKey(p.address)]);
  }
  const inFile = new Map<string, number>();
  const count: Record<RowStatus, number> = { ok: 0, missing: 0, exists: 0, dup: 0 };
  const defaults = DUTY_DEFAULTS[land];

  const rows = dataRows(input.table, input.hasHeader).map(({ cells, line }, i): PlanRow => {
    const get = (f: FieldKey) => {
      const c = m[f];
      return c === undefined ? '' : (cells[c] ?? '').trim();
    };
    // Hausnummer allein ist keine Adresse
    const street = get('street') ? oneLine([get('street'), get('houseNo')].filter(Boolean).join(' ')) : '';
    const base = get('address').replace(/\s*[\r\n]+\s*/g, ', ').replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim() || street;
    const zip = oneLine(get('zip'));
    const city = oneLine(get('city'));
    const zipCity = zip && city.startsWith(zip) ? city : [zip, city].filter(Boolean).join(' ');
    const words = ` ${cmpKey(base)} `;
    const known = (part: string) => !!part && words.includes(` ${cmpKey(part)} `);
    const extra = zipCity && !known(zip) && !known(city) ? zipCity : '';
    const address = cap([base, extra].filter(Boolean).join(', '), 240);

    const ownName = oneLine(get('name'));
    const name = cap(ownName || oneLine(base.split(',')[0] ?? ''), 120);
    const customer = cap(oneLine(get('customer')), 160);
    const contact = cap(
      [...new Set([get('contact'), get('phone'), get('email')].map(oneLine).filter(Boolean))].join(' · '),
      200,
    );
    const allDays = normDuty(oneLine(get('dutyAll')));
    let dutyDefault = false;
    const day = (f: FieldKey, k: keyof typeof defaults) => {
      const v = normDuty(oneLine(get(f))) || allDays;
      if (v) return v;
      dutyDefault = true;
      return defaults[k];
    };
    const duty_times = { mo_fr: day('dutyMoFr', 'mo_fr'), sa: day('dutySa', 'sa'), so: day('dutySo', 'so') };

    const row: PlanRow = {
      i,
      line,
      status: 'ok',
      reason: '',
      name,
      address,
      customer,
      input: null,
      dutyDefault,
      nameFromAddress: !ownName,
    };
    if (!base) {
      row.status = 'missing';
      row.reason = zipCity ? 'Straße fehlt' : 'Adresse fehlt';
      count.missing++;
      return row;
    }
    row.input = {
      name,
      address,
      customer_name: orNull(customer),
      customer_contact: orNull(contact),
      areas: orNull(cap(oneLine(get('areas')), 300)),
      duty_times,
      notes: orNull(cap(get('notes'), 2000)),
      active: true,
    };
    const nk = cmpKey(name);
    const ak = cmpKey(address);
    const key = `${nk}|${ak}`;
    if ((byName.get(nk) ?? []).some((a) => sameAddress(a, ak))) {
      row.status = 'exists';
      row.reason = 'schon vorhanden';
    } else if (inFile.has(key)) {
      row.status = 'dup';
      row.reason = `doppelt in der Liste (wie Zeile ${inFile.get(key)})`;
    } else {
      inFile.set(key, line);
    }
    count[row.status]++;
    return row;
  });
  return { rows, count };
}

/** Land für leere Pflichtzeiten: Mehrheit der PLZ (5-stellig = DE, 4-stellig = AT bzw. CH beim Schweizer Betrieb). */
export function guessLand(table: Pick<Table, 'rows' | 'lines'>, hasHeader: boolean, m: Mapping, fallback: Land): Land {
  const n: Record<Land, number> = { DE: 0, AT: 0, CH: 0 };
  for (const { cells } of dataRows(table, hasHeader)) {
    const at = (f: FieldKey) => (m[f] === undefined ? '' : (cells[m[f]!] ?? ''));
    const z = zipOf(at('zip').trim(), [at('address'), at('city')].join(' '));
    if (!z) continue;
    const l = z.land ?? (z.digits.length === 5 ? 'DE' : fallback === 'CH' ? 'CH' : 'AT');
    n[l]++;
  }
  const max = Math.max(n.DE, n.AT, n.CH);
  if (max === 0) return fallback;
  // Gleichstand: das Land des Betriebs, falls es dabei ist
  const top = (['DE', 'AT', 'CH'] as Land[]).filter((l) => n[l] === max);
  return top.includes(fallback) ? fallback : top[0];
}

/** Wie viele Objekte der Import anlegen darf: mit Pro unbegrenzt (null), gratis bis 2 aktive insgesamt. */
export function importAllowance(pro: boolean, activeCount: number): number | null {
  return pro ? null : Math.max(0, FREE_PROPERTIES - activeCount);
}

/**
 * Was beim Klick auf „Anlegen“ wirklich angelegt wird — gegen die frisch geladene Objektliste und die frische
 * Pro-Auskunft: angehakte Zeilen in Listen-Reihenfolge, ohne inzwischen Vorhandenes (anderer Tab, zweiter Klick),
 * höchstens bis zur Gratis-Grenze.
 */
export function finalRows(
  plan: Plan,
  selected: ReadonlySet<number>,
  fresh: Pick<Property, 'name' | 'address' | 'active'>[],
  pro: boolean,
): { rows: PlanRow[]; already: number; overLimit: number } {
  const picked = plan.rows.filter((r) => r.input && selected.has(r.i));
  const already = alreadyThere(picked, fresh);
  const wanted = picked.filter((r) => !already.has(r.i));
  const allow = importAllowance(pro, fresh.filter((p) => p.active).length);
  const rows = allow === null ? wanted : wanted.slice(0, allow);
  return { rows, already: already.size, overLimit: wanted.length - rows.length };
}

/** Zeilen, die es in der frisch geladenen Objektliste inzwischen schon gibt (bewusst angehakte „schon vorhanden“ zählen nicht). */
function alreadyThere(rows: PlanRow[], existing: Pick<Property, 'name' | 'address'>[]): Set<number> {
  const byName = new Map<string, string[]>();
  for (const p of existing) {
    const k = cmpKey(p.name);
    byName.set(k, [...(byName.get(k) ?? []), cmpKey(p.address)]);
  }
  const out = new Set<number>();
  for (const r of rows) {
    if (!r.input || r.status === 'exists') continue; // bewusst angehakt: dann anlegen
    if ((byName.get(cmpKey(r.name)) ?? []).some((a) => sameAddress(a, cmpKey(r.address)))) out.add(r.i);
  }
  return out;
}

/** Vorlage zum Ausfüllen (Semikolon, UTF-8 mit BOM — öffnet in Excel direkt richtig). */
export const TEMPLATE_HEADER = [
  'Name',
  'Straße',
  'Hausnummer',
  'PLZ',
  'Ort',
  'Auftraggeber',
  'Kontakt',
  'Flächen',
  'Notizen',
  'Pflichtzeiten Mo–Fr',
  'Pflichtzeiten Sa',
  'Pflichtzeiten So/Feiertag',
];

export function templateCsv(): string {
  return toCsv(TEMPLATE_HEADER, [
    ['Wohnanlage Beispielgasse', 'Beispielgasse', '12', '8020', 'Graz', 'Hausverwaltung Muster GmbH', 'office@example.com', 'Gehsteig, Zufahrt, Stiegen', 'Schlüssel im Schaukasten', '06:00-22:00', '06:00-22:00', '06:00-22:00'],
    ['Volksschule Musterdorf', 'Schulweg', '3', '8200', 'Musterdorf', 'Gemeinde Musterdorf', '0664 0000000', 'Gehweg vor dem Eingang, Parkplatz', '', '', '', ''],
  ]);
}
