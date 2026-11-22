// Echte Excel-Dateien (.xlsx) ohne Bibliothek — Baustein für alle App-Bereiche des Dashboards.
//
// Warum .xlsx statt CSV: Datum, Uhrzeit und Zahlen kommen als echte Excel-Werte an (Filter nach Monat, Summen,
// Ende − Beginn rechnen), Umlaute stimmen immer, Kopfzeile ist fixiert und gefiltert, Druck quer auf Seitenbreite.
// Texte stehen als Inline-Text in der Datei — Excel führt sie NIE als Formel aus (kein „=…“-Risiko wie bei CSV).
//
// Bewusst ohne Imports (reine Logik): lässt sich in jedem Bereich und in Node-Tests direkt verwenden.
// Zeitpunkte (ISO mit Uhrzeit) werden in der Zeitzone des Betriebs (Standard Europe/Berlin = auch Wien/Zürich)
// als Wanduhrzeit geschrieben; reine Kalendertage ('yyyy-mm-dd') ohne Zeitzone.

/** num = Zahl ohne feste Nachkommastellen (Excel „Standard“, z. B. Messwerte 0,035) */
export type XlsxKind = 'text' | 'int' | 'num' | 'dec1' | 'dec2' | 'date' | 'time' | 'datetime';
export type XlsxValue = string | number | null | undefined;

/** Zelle mit eigenem Format (z. B. Ende an einem anderen Tag → Datum + Uhrzeit) oder fett. */
export interface XlsxCell {
  v: XlsxValue;
  kind?: XlsxKind;
  bold?: boolean;
}

export interface XlsxColumn {
  header: string;
  /** Standard: text. date/time/datetime erwarten ISO-Zeitpunkt oder 'yyyy-mm-dd', Zahlen-Arten eine Zahl. */
  kind?: XlsxKind;
  /** Breite in Zeichen; ohne Angabe nach Inhalt (8–60). */
  width?: number;
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: (XlsxValue | XlsxCell)[][];
  /** Tabelle: Kopfzeile fett + fixiert + Filter + beim Druck wiederholt. Standard true; false = freies Blatt (z. B. „Info“). */
  table?: boolean;
  /** Druck quer (Standard bei mehr als 6 Spalten). */
  landscape?: boolean;
}

export interface XlsxOptions {
  title?: string;
  /** Erscheint in den Datei-Eigenschaften (z. B. „Dexware WinterDex“). */
  creator?: string;
  timeZone?: string;
  /** nur für Tests */
  now?: Date;
}

/** Hinweis statt Fehler beim Export (z. B. „gehört zu Pro“, „Zeitraum wählen“) — der Excel-Knopf zeigt ihn blau. */
export class ExportNotice extends Error {
  /** optional ein Link unter dem Hinweis (z. B. „E-Mail schreiben“) */
  link?: { href: string; label: string };
  constructor(message: string, link?: { href: string; label: string }) {
    super(message);
    this.link = link;
  }
}

export const XLSX_MIME ='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---------------------------------------------------------------------------- Zellen

const MAX_CELL = 32767; // Excel-Grenze je Zelle

/** Für XML unzulässige Zeichen raus (sonst meldet Excel „Problem mit dem Inhalt“), _xHHHH_ wörtlich halten. */
export function xmlText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex -- genau diese Steuerzeichen sind in XML verboten
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Excel liest „_x0041_“ in Texten als Zeichen-Code — das Unterstrich-Muster selbst maskieren
    .replace(/_(x[0-9A-Fa-f]{4})_/g, '_x005F_$1_');
}

function clip(s: string): string {
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL - 1)}…` : s;
}

/** Spaltenbuchstaben: 0 → A, 25 → Z, 26 → AA */
export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function wallClock(ms: number, timeZone: string): number[] {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    fmtCache.set(timeZone, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return [p.year, p.month, p.day, p.hour % 24, p.minute, p.second];
}

const EPOCH = Date.UTC(1899, 11, 30); // Excel-Tag 0 (1900er-System, gilt ab März 1900)

/**
 * Excel-Seriennummer: 'yyyy-mm-dd' = Kalendertag, ISO mit Uhrzeit = Wanduhrzeit in `timeZone`.
 * `dayOnly` schneidet die Uhrzeit ab (Spalte „Datum“ lässt sich dann in Excel nach Tag/Monat filtern).
 */
export function excelSerial(v: string, timeZone: string, dayOnly = false): number | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (day) return (Date.UTC(+day[1], +day[2] - 1, +day[3]) - EPOCH) / 864e5;
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  const [y, mo, d, h, mi, s] = wallClock(ms, timeZone);
  const serial = (Date.UTC(y, mo - 1, d, h, mi, s) - EPOCH) / 864e5;
  return dayOnly ? Math.floor(serial) : serial;
}

// Formate (Index = Position in cellXfs der styles.xml)
const S = { text: 0, num: 0, head: 1, int: 2, dec1: 3, dec2: 4, date: 5, time: 6, datetime: 7, bold: 8 } as const;

function cellXml(ref: string, raw: XlsxValue | XlsxCell, colKind: XlsxKind, timeZone: string): string {
  const c: XlsxCell = raw !== null && typeof raw === 'object' ? raw : { v: raw };
  const kind = c.kind ?? colKind;
  const v = c.v;
  if (v === null || v === undefined || v === '') return '';
  if (kind === 'date' || kind === 'time' || kind === 'datetime') {
    const serial = typeof v === 'string' ? excelSerial(v, timeZone, kind === 'date') : v;
    if (serial !== null && Number.isFinite(serial)) return `<c r="${ref}" s="${S[kind]}"><v>${+serial.toFixed(8)}</v></c>`;
  } else if (kind !== 'text' && typeof v === 'number') {
    if (Number.isFinite(v)) return `<c r="${ref}" s="${S[kind]}"><v>${v}</v></c>`;
    return '';
  }
  const text = clip(String(v));
  const s = c.bold ? ` s="${S.bold}"` : '';
  const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t${space}>${xmlText(text)}</t></is></c>`;
}

/** Breite nach Inhalt (Zeichen), Datum/Zeit fest. */
function autoWidth(col: XlsxColumn, i: number, rows: (XlsxValue | XlsxCell)[][]): number {
  if (col.width) return col.width;
  const fixed: Partial<Record<XlsxKind, number>> = { date: 11, time: 7, datetime: 16, int: 8, num: 9, dec1: 9, dec2: 10 };
  let w = Math.max(fixed[col.kind ?? 'text'] ?? 8, ...col.header.split(/\s+/).map((p) => p.length + 1), Math.min(col.header.length, 18) + 2);
  for (const r of rows.slice(0, 500)) {
    const raw = r[i];
    const v = raw !== null && typeof raw === 'object' ? raw.v : raw;
    if (typeof v === 'string' && (col.kind ?? 'text') === 'text') w = Math.max(w, Math.min(60, Math.max(...v.split('\n').map((l) => l.length)) + 2));
    if (raw !== null && typeof raw === 'object' && raw.kind === 'datetime') w = Math.max(w, 16);
  }
  return Math.min(60, w);
}

// ---------------------------------------------------------------------------- Blätter

/** Blattnamen: höchstens 31 Zeichen, ohne : \ / ? * [ ], eindeutig (Excel-Regeln). */
export function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n, i) => {
    const base = (n.replace(/[:\\/?*[\]]/g, ' ').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim() || `Blatt ${i + 1}`).slice(0, 31);
    let name = base;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base.slice(0, 31 - String(k).length - 1)} ${k}`;
    used.add(name.toLowerCase());
    return name;
  });
}

const quoteSheet = (n: string) => `'${n.replace(/'/g, "''")}'`;

function sheetXml(sh: XlsxSheet, first: boolean, timeZone: string): string {
  const table = sh.table !== false;
  const nCols = Math.max(1, sh.columns.length, ...sh.rows.map((r) => r.length));
  const lastCol = colName(nCols - 1);
  const lastRow = (table ? 1 : 0) + sh.rows.length;
  const landscape = sh.landscape ?? sh.columns.length > 6;
  const rows: string[] = [];
  if (table) {
    const head = sh.columns.map((c, i) => `<c r="${colName(i)}1" s="${S.head}" t="inlineStr"><is><t>${xmlText(c.header)}</t></is></c>`).join('');
    rows.push(`<row r="1">${head}</row>`);
  }
  sh.rows.forEach((r, ri) => {
    const rn = ri + 1 + (table ? 1 : 0);
    const cells = r.map((v, ci) => cellXml(`${colName(ci)}${rn}`, v, sh.columns[ci]?.kind ?? 'text', timeZone)).join('');
    if (cells) rows.push(`<row r="${rn}">${cells}</row>`);
  });
  const cols = sh.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${autoWidth(c, i, sh.rows)}" customWidth="1"/>`).join('');
  const pane = table
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
    : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${lastCol}${Math.max(1, lastRow)}"/>` +
    `<sheetViews><sheetView${first ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows.join('')}</sheetData>` +
    (table && sh.columns.length ? `<autoFilter ref="A1:${colName(sh.columns.length - 1)}${Math.max(1, lastRow)}"/>` : '') +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    `<pageSetup paperSize="9" orientation="${landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
    '<headerFooter><oddFooter>&amp;L&amp;A&amp;RSeite &amp;P von &amp;N</oddFooter></headerFooter>' +
    '</worksheet>'
  );
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="4"><numFmt numFmtId="164" formatCode="0.0"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/>' +
  '<numFmt numFmtId="166" formatCode="hh:mm"/><numFmt numFmtId="167" formatCode="dd.mm.yyyy hh:mm"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE6EDF4"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FF8FA3B8"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="9">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/** Alle Teile der Excel-Datei (Pfad → XML). */
export function xlsxParts(sheets: XlsxSheet[], opts: XlsxOptions = {}): [string, string][] {
  if (!sheets.length) throw new Error('Keine Tabelle zum Exportieren.');
  const tz = opts.timeZone ?? 'Europe/Berlin';
  const names = sheetNames(sheets.map((s) => s.name));
  const now = (opts.now ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  const defined: string[] = [];
  sheets.forEach((sh, i) => {
    if (sh.table === false || !sh.columns.length) return;
    const q = quoteSheet(names[i]);
    defined.push(
      `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlText(`${q}!$A$1:$${colName(sh.columns.length - 1)}$${Math.max(1, sh.rows.length + 1)}`)}</definedName>`,
      `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xmlText(`${q}!$1:$1`)}</definedName>`,
    );
  });

  const parts: [string, string][] = [
    [
      '[Content_Types].xml',
      xml +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '</Types>',
    ],
    [
      '_rels/.rels',
      xml +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '</Relationships>',
    ],
    [
      'docProps/core.xml',
      xml +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        (opts.title ? `<dc:title>${xmlText(opts.title)}</dc:title>` : '') +
        `<dc:creator>${xmlText(opts.creator ?? 'Dexware')}</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
        '</cp:coreProperties>',
    ],
    [
      'xl/workbook.xml',
      xml +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView activeTab="0"/></bookViews>' +
        `<sheets>${names.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        (defined.length ? `<definedNames>${defined.join('')}</definedNames>` : '') +
        '</workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      xml +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ],
    ['xl/styles.xml', STYLES],
  ];
  sheets.forEach((sh, i) => parts.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh, i === 0, tz)]));
  return parts;
}

// ---------------------------------------------------------------------------- ZIP

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(b: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([b as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null; // ältere Browser: ungepackt speichern (Excel liest beides)
  }
}

/** ZIP-Archiv (gepackt, wo der Browser es kann — sonst gespeichert). */
export async function zip(files: [string, Uint8Array][], date = new Date()): Promise<Uint8Array<ArrayBuffer>> {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = enc.encode(name);
    const packed = await deflateRaw(data);
    const usePacked = !!packed && packed.length < data.length;
    const body = usePacked ? packed! : data;
    const crc = crc32(data);
    const head = new Uint8Array(30 + nameBytes.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0, true);
    h.setUint16(8, usePacked ? 8 : 0, true);
    h.setUint16(10, dosTime, true);
    h.setUint16(12, dosDate, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, nameBytes.length, true);
    h.setUint16(28, 0, true);
    head.set(nameBytes, 30);
    const dir = new Uint8Array(46 + nameBytes.length);
    const d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0, true);
    d.setUint16(10, usePacked ? 8 : 0, true);
    d.setUint16(12, dosTime, true);
    d.setUint16(14, dosDate, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, body.length, true);
    d.setUint32(24, data.length, true);
    d.setUint16(28, nameBytes.length, true);
    d.setUint32(42, offset, true);
    dir.set(nameBytes, 46);
    locals.push(head, body);
    central.push(dir);
    offset += head.length + body.length;
  }
  const dirSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, dirSize, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + dirSize + 22);
  let at = 0;
  for (const part of [...locals, ...central, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------- Öffentlich

/** Fertige .xlsx-Datei als Bytes. */
export async function buildXlsx(sheets: XlsxSheet[], opts: XlsxOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const enc = new TextEncoder();
  return zip(
    xlsxParts(sheets, opts).map(([p, x]) => [p, enc.encode(x)]),
    opts.now ?? new Date(),
  );
}

/** Dateiname ohne Zeichen, die Windows/Mail-Programme stören (Umlaute → ae/oe/ue/ss). */
export function safeFileName(s: string): string {
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120);
}

/** Datei im Browser speichern. */
export function downloadBytes(fileName: string, bytes: Uint8Array<ArrayBuffer>, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Excel-Datei erzeugen und herunterladen. `fileName` ohne Endung (wird gesäubert). */
export async function downloadXlsx(fileName: string, sheets: XlsxSheet[], opts: XlsxOptions = {}): Promise<void> {
  const bytes = await buildXlsx(sheets, opts);
  downloadBytes(`${safeFileName(fileName)}.xlsx`, bytes, XLSX_MIME);
}
