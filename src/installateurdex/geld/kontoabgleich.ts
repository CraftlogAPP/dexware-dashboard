// Kontoauszug abgleichen: Zahlungseingänge aus camt.053/camt.054 (XML) oder Bank-CSV lesen und offenen Rechnungen
// zuordnen. Reine Logik ohne React/Netz — läuft nur im Browser, die Datei verlässt den Rechner nie.
//
// Erkennung CSV: Trennzeichen ; , oder Tab, Anführungszeichen, deutsches Zahlenformat (1.234,56 / -50,00 / 50,00-),
// Datum TT.MM.JJJJ (auch JJJJ-MM-TT), Spalten über die Kopfzeile (George/Erste, Raiffeisen, Bank Austria,
// Sparkasse CSV-CAMT, Volksbank inkl. Soll/Haben-Spalte). Ohne Kopfzeile (Raiffeisen ELBA) nach Inhalt.
// Zuordnung: 1. Rechnungsnummer im Verwendungszweck (auch „RE 2026 0013“, „RE20260013“, „2026-13“),
// 2. Betrag + Kundenname, 3. nur Betrag oder nur Name (unsicher). Offen = Rest nach Abzug der Abschläge
// (wie openCents). Teilzahlungen und Überzahlungen werden gemeldet, nie automatisch als bezahlt übernommen.
import { euro, totals, type InvoiceDraft } from './invoice';

export interface BankTx {
  /** stabiler Schlüssel je Buchung (gleiche Buchung → gleicher Schlüssel) */
  key: string;
  /** Buchungsdatum JJJJ-MM-TT */
  date: string;
  valueDate?: string;
  /** Cent, positiv = Gutschrift */
  amountCents: number;
  currency: string;
  /** Auftraggeber / Zahlungspflichtiger */
  name: string;
  iban?: string;
  /** Verwendungszweck (bereinigt, gekürzt) */
  text: string;
  /** Zahlungs-/Kundenreferenz, End-to-End-ID */
  ref?: string;
}

export interface StatementResult {
  format: 'camt.053' | 'camt.054' | 'csv';
  /** erkannte Bank bzw. Spaltenart (nur Anzeige) */
  layout: string;
  /** nur Gutschriften */
  credits: BankTx[];
  debits: number;
  /** übersprungen: vorgemerkt, storniert, unlesbar, Fußzeilen */
  skipped: number;
  warnings: string[];
}

export type Confidence = 'sicher' | 'wahrscheinlich' | 'unsicher';
export type MatchKind = 'full' | 'partial' | 'over' | 'paidAlready' | 'duplicate' | 'none';

/** Rechnung, wie die Liste sie liefert (StoredInvoice-Ausschnitt) */
export interface InvoiceRef {
  id: string;
  kind: string;
  status: string;
  number?: string;
  paidAt?: string;
  grossCents: number;
  data: InvoiceDraft;
}

export interface Suggestion {
  tx: BankTx;
  invoice?: InvoiceRef;
  /** offener Betrag der Rechnung (Rest) */
  openCents?: number;
  confidence?: Confidence;
  kind: MatchKind;
  /** Gründe in Worten („Rechnungsnummer im Verwendungszweck“ …) */
  reasons: string[];
  hint?: string;
  /** darf bei „Alle sicheren übernehmen“ mit */
  autoOk: boolean;
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT = 500;

// ---------------------------------------------------------------------------------------------------------------
// Text, Zahlen, Datum
// ---------------------------------------------------------------------------------------------------------------

/** Bytes → Text: UTF-8 (mit/ohne BOM), sonst Windows-1252 (viele österreichische/deutsche Bank-Exporte). */
export function decodeStatement(bytes: Uint8Array): string {
  let s: string;
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    s = new TextDecoder('windows-1252').decode(bytes);
  }
  return s.replace(/^﻿/, '');
}

/** Steuerzeichen raus, Leerraum zusammenfassen, kürzen */
export function cleanText(v: unknown, max = MAX_TEXT): string {
  // eslint-disable-next-line no-control-regex -- Steuerzeichen aus Bankdaten gezielt entfernen
  return String(v ?? '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Betrag → Cent. „1.234,56“, „-1.234,56“, „+50,00“, „50,00-“, „1234.56“, „1,234.56“, „€ 12,00“, „12,00 EUR“.
 * null = keine Zahl.
 */
export function parseAmountCents(raw: string): number | null {
  let s = String(raw ?? '').replace(/[\s ']/g, '').replace(/EUR|€/gi, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    neg = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^[0-9.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart: string;
  let frac = '';
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = Math.max(lastComma, lastDot);
    intPart = s.slice(0, dec).replace(/[.,]/g, '');
    frac = s.slice(dec + 1);
  } else if (lastComma >= 0) {
    // deutsches Format: Komma = Dezimaltrenner (mehrere Kommas → Tausender)
    if (s.indexOf(',') !== lastComma) {
      intPart = s.replace(/,/g, '');
    } else {
      intPart = s.slice(0, lastComma);
      frac = s.slice(lastComma + 1);
    }
  } else if (lastDot >= 0) {
    // nur Punkte: „1.234“ / „1.234.567“ = Tausender, „12.5“ / „12.50“ = Dezimal
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) intPart = s.replace(/\./g, '');
    else if (s.indexOf('.') === lastDot) {
      intPart = s.slice(0, lastDot);
      frac = s.slice(lastDot + 1);
    } else return null;
  } else intPart = s;
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || frac.length > 3) return null;
  const f = (frac + '000').slice(0, 3);
  let cents = Number(intPart || '0') * 100 + Number(f.slice(0, 2));
  if (Number(f[2]) >= 5) cents += 1; // kaufmännisch runden (3. Nachkommastelle)
  if (!Number.isFinite(cents) || cents > 1e13) return null;
  return neg ? -cents : cents;
}

/** Datum → JJJJ-MM-TT: TT.MM.JJJJ, TT.MM.JJ, TT/MM/JJJJ, JJJJ-MM-TT(Thh:mm…). '' = kein Datum. */
export function parseDate(raw: string): string {
  const s = String(raw ?? '').trim();
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})\b/))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (y < 100) y += 2000;
  } else if ((r = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return '';
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------------------------------------------------------
// camt.053 / camt.054 (ISO 20022) — schlanker Leser ohne DOM (läuft auch im Test unter node)
// ---------------------------------------------------------------------------------------------------------------
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
      if (e[0] !== '#') return ENT[e.toLowerCase()] ?? '';
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    });
const reCache = new Map<string, RegExp>();
const tagRe = (name: string) => {
  let r = reCache.get(name);
  if (!r) {
    r = new RegExp(`<(?:[\\w.-]+:)?${name}(\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, 'g');
    reCache.set(name, r);
  }
  r.lastIndex = 0;
  return r;
};
/** alle Inhalte eines Elements (kein Verschachteln gleichnamiger Elemente nötig) */
function allOf(block: string, name: string): { attrs: string; body: string }[] {
  const re = tagRe(name);
  const out: { attrs: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.push({ attrs: m[1] ?? '', body: m[2] });
  return out;
}
/** erstes Element entlang eines Pfads, z. B. ['BookgDt', 'Dt'] */
function firstOf(block: string | undefined, path: string[]): { attrs: string; body: string } | undefined {
  let cur: { attrs: string; body: string } | undefined = block == null ? undefined : { attrs: '', body: block };
  for (const p of path) {
    if (!cur) return undefined;
    cur = allOf(cur.body, p)[0];
  }
  return cur;
}
const textOf = (block: string | undefined, path: string[]) => {
  const f = firstOf(block, path);
  return f ? cleanText(unxml(f.body.replace(/<[^>]+>/g, ' '))) : '';
};
function amtOf(block: string | undefined, path: string[]): { cents: number | null; ccy: string } {
  const f = firstOf(block, path);
  if (!f) return { cents: null, ccy: '' };
  const ccy = (f.attrs.match(/Ccy\s*=\s*"([A-Za-z]{3})"/) ?? [])[1] ?? '';
  return { cents: parseAmountCents(unxml(f.body).trim()), ccy: ccy.toUpperCase() };
}
const dateOf = (block: string | undefined, name: string) => parseDate(textOf(block, [name, 'Dt']) || textOf(block, [name, 'DtTm']));

function parseCamt(xml: string): StatementResult {
  const isNtf = /<(?:[\w.-]+:)?BkToCstmrDbtCdtNtfctn\b/.test(xml);
  const res: StatementResult = { format: isNtf ? 'camt.054' : 'camt.053', layout: isNtf ? 'camt.054 (Buchungsmitteilung)' : 'camt.053 (Kontoauszug)', credits: [], debits: 0, skipped: 0, warnings: [] };
  for (const e of allOf(xml, 'Ntry')) {
    const n = e.body;
    const sts = (textOf(n, ['Sts', 'Cd']) || textOf(n, ['Sts'])).toUpperCase();
    if (sts && sts !== 'BOOK') {
      res.skipped++; // vorgemerkt (PDNG) / Info
      continue;
    }
    if (/^true$/i.test(textOf(n, ['RvslInd']))) {
      res.skipped++; // Storno-Buchung der Bank
      continue;
    }
    const dir = textOf(n, ['CdtDbtInd']).toUpperCase();
    const amt = amtOf(n, ['Amt']);
    const date = dateOf(n, 'BookgDt') || dateOf(n, 'ValDt');
    if (amt.cents == null || !date) {
      res.skipped++;
      continue;
    }
    if (dir !== 'CRDT') {
      res.debits++;
      continue;
    }
    const valueDate = dateOf(n, 'ValDt') || undefined;
    const entryRef = textOf(n, ['AcctSvcrRef']) || textOf(n, ['NtryRef']);
    const addtl = textOf(n, ['AddtlNtryInf']);
    const txs = allOf(n, 'TxDtls').map((x) => x.body);
    const mk = (tx: string | undefined, cents: number, ccy: string, i: number): BankTx => {
      const name = textOf(tx, ['RltdPties', 'Dbtr', 'Nm']) || textOf(tx, ['RltdPties', 'Dbtr', 'Pty', 'Nm']) || textOf(tx, ['RltdPties', 'UltmtDbtr', 'Nm']);
      const iban = textOf(tx, ['RltdPties', 'DbtrAcct', 'Id', 'IBAN']).replace(/\s+/g, '') || undefined;
      const ustrd = tx ? allOf(tx, 'Ustrd').map((u) => cleanText(unxml(u.body))) : [];
      const strd = textOf(tx, ['RmtInf', 'Strd', 'CdtrRefInf', 'Ref']);
      const e2e = textOf(tx, ['Refs', 'EndToEndId']);
      const text = cleanText([...ustrd, strd, ustrd.length || strd ? '' : addtl].filter(Boolean).join(' '));
      const ref = cleanText([strd, e2e && e2e !== 'NOTPROVIDED' ? e2e : ''].filter(Boolean).join(' '), 140) || undefined;
      const acct = textOf(tx, ['Refs', 'AcctSvcrRef']) || (entryRef ? `${entryRef}${txs.length > 1 ? `/${i}` : ''}` : '');
      return {
        key: acct ? `ref:${acct}` : `${date}|${cents}|${fold(name).slice(0, 40)}|${fold(text).slice(0, 80)}`,
        date,
        valueDate,
        amountCents: cents,
        currency: ccy || amt.ccy || 'EUR',
        name: cleanText(name, 140),
        iban,
        text: text || cleanText(addtl),
        ref,
      };
    };
    // Sammelbuchung: mehrere Einzelzahlungen, deren Summe der Buchung entspricht → einzeln zuordnen
    if (txs.length > 1) {
      const parts = txs.map((tx) => ({ tx, a: amtOf(tx, ['AmtDtls', 'TxAmt', 'Amt']).cents != null ? amtOf(tx, ['AmtDtls', 'TxAmt', 'Amt']) : amtOf(tx, ['Amt']) }));
      const sum = parts.reduce((s, p) => s + (p.a.cents ?? NaN), 0);
      if (sum === amt.cents && parts.every((p) => (p.a.cents ?? 0) > 0)) {
        parts.forEach((p, i) => res.credits.push(mk(p.tx, p.a.cents!, p.a.ccy, i)));
        continue;
      }
    }
    res.credits.push(mk(txs[0], amt.cents, amt.ccy, 0));
  }
  if (!res.credits.length && !res.debits) res.warnings.push('In der XML-Datei wurden keine Buchungen (Ntry) gefunden.');
  return res;
}

// ---------------------------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------------------------
/** CSV → Zeilen (Anführungszeichen, "" als Escape, Zeilenumbrüche in Feldern). Linear, auch für 10.000+ Zeilen. */
export function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field.trim() === '') {
      quoted = true;
      field = '';
      i++;
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r' || c === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0].trim() !== '') rows.push(row);
      row = [];
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0].trim() !== '') rows.push(row);
  }
  return rows;
}

/** Trennzeichen aus den ersten Zeilen (außerhalb von Anführungszeichen gezählt) */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 20000).split(/\r?\n/).slice(0, 30);
  let best = ';';
  let bestScore = -1;
  for (const d of [';', '\t', ',', '|']) {
    let score = 0;
    const counts: number[] = [];
    for (const line of sample) {
      let q = false;
      let c = 0;
      for (const ch of line) {
        if (ch === '"') q = !q;
        else if (ch === d && !q) c++;
      }
      if (c) counts.push(c);
    }
    if (!counts.length) continue;
    // häufigste Anzahl je Zeile × Zahl der Zeilen mit genau dieser Anzahl → gleichmäßige Spalten gewinnen
    const freq = new Map<number, number>();
    counts.forEach((c) => freq.set(c, (freq.get(c) ?? 0) + 1));
    for (const [c, f] of freq) score = Math.max(score, c * f);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

type Field = 'date' | 'valueDate' | 'amount' | 'currency' | 'name' | 'iban' | 'ref' | 'sh' | 'text';
const HEAD: { field: Field; exact: string[]; starts?: string[]; contains?: string[] }[] = [
  { field: 'date', exact: ['buchungsdatum', 'buchungstag', 'buchungsdat', 'datum', 'bookingdate', 'date', 'buchung'] },
  { field: 'valueDate', exact: ['valutadatum', 'valuta', 'wertstellung', 'wertstellungsdatum', 'valuedate'] },
  { field: 'amount', exact: ['betrag', 'betrageur', 'betragineur', 'betrageuro', 'umsatz', 'umsatzineur', 'amount', 'betragwaehrung'], starts: ['betrag'] },
  { field: 'currency', exact: ['waehrung', 'wahrung', 'whrg', 'currency', 'waehrungscode'] },
  {
    field: 'name',
    exact: [
      'partnername', 'empfaengerauftraggeber', 'auftraggeberempfaenger', 'auftraggeberzahlungsempfaenger', 'zahlungsempfaengerauftraggeber', 'beguenstigterzahlungspflichtiger',
      'namezahlungsbeteiligter', 'zahlungsbeteiligter', 'auftraggeber', 'auftraggebername', 'zahlungspflichtiger', 'empfaenger', 'gegenpartei', 'partner', 'name',
    ],
    // weitere Schreibweisen („Auftraggeber/Begünstigter“ …) — nie die eigenen Kontodaten
    contains: ['auftraggeber', 'zahlungsempfaenger', 'zahlungsbeteiligter', 'beguenstigter', 'zahlungspflichtiger'],
  },
  { field: 'iban', exact: ['partneriban', 'ibanzahlungsbeteiligter', 'kontonummeriban', 'gegenkontoiban', 'auftraggeberiban', 'iban'] },
  { field: 'ref', exact: ['kundenreferenzendtoend', 'endtoendreferenz', 'endtoendid', 'buchungsreferenz', 'zahlungsreferenz', 'referenz'] },
  { field: 'sh', exact: ['sollhaben', 'sh', 'habensoll'] },
];
const TEXT_COLS = ['verwendungszweck', 'zahlungsreferenz', 'buchungsinfo', 'buchungsinformation', 'buchungstext', 'umsatztext', 'notiz', 'info', 'beschreibung', 'text', 'bemerkung', 'zweck'];
const normHead = (h: string) => fold(cleanText(h)).replace(/[^a-z0-9]/g, '');

function mapHeader(cells: string[]): Partial<Record<Exclude<Field, 'text'>, number>> & { text: number[] } {
  const norm = cells.map(normHead);
  const used = new Set<number>();
  const map: Partial<Record<Exclude<Field, 'text'>, number>> & { text: number[] } = { text: [] };
  for (const h of HEAD) {
    const f = h.field as Exclude<Field, 'text'>;
    let idx = -1;
    for (const e of h.exact) {
      idx = norm.findIndex((x, i) => !used.has(i) && x === e && !x.includes('auftragskonto'));
      if (idx >= 0) break;
    }
    if (idx < 0 && h.starts) idx = norm.findIndex((x, i) => !used.has(i) && h.starts!.some((p) => x.startsWith(p)) && !/ursprung|saldo|lastschrift/.test(x));
    if (idx < 0 && h.contains) idx = norm.findIndex((x, i) => !used.has(i) && h.contains!.some((p) => x.includes(p)) && !/konto|iban|bic|swift|blz|bankleitzahl|id$/.test(x));
    if (idx >= 0) {
      map[f] = idx;
      used.add(idx);
    }
  }
  // Textspalten (Verwendungszweck zuerst); Referenzspalte zählt auch als Text für die Nummernsuche
  for (const t of TEXT_COLS) {
    norm.forEach((x, i) => {
      if (x === t && !map.text.includes(i) && i !== map.date && i !== map.amount) map.text.push(i);
    });
  }
  return map;
}

/** Bank aus der Kopfzeile erraten (nur Anzeige) */
function layoutName(norm: string[]): string {
  const has = (x: string) => norm.includes(x);
  if (has('partnername') && (has('buchungsinfo') || has('partneriban'))) return 'George (Erste Bank / Sparkasse AT)';
  if (has('beguenstigterzahlungspflichtiger')) return 'Sparkasse (CSV-CAMT)';
  if (has('namezahlungsbeteiligter')) return 'Volksbank / Raiffeisen DE';
  if (has('empfaengerauftraggeber') || has('auftraggeberempfaenger')) return 'Bank Austria / Online-Banking';
  if (has('sollhaben')) return 'Volksbank (Soll/Haben)';
  return 'CSV mit Kopfzeile';
}

function parseCsvStatement(text: string): StatementResult {
  const delim = detectDelimiter(text);
  const rows = parseCsv(text, delim);
  const res: StatementResult = { format: 'csv', layout: '', credits: [], debits: 0, skipped: 0, warnings: [] };
  // Kopfzeile: erste der ersten 30 Zeilen mit Datum- UND Betragsspalte (manche Banken haben Vorspann-Zeilen)
  let headerAt = -1;
  let map: ReturnType<typeof mapHeader> | null = null;
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const m = mapHeader(rows[i]);
    if (m.date != null && m.amount != null) {
      headerAt = i;
      map = m;
      res.layout = layoutName(rows[i].map(normHead));
      break;
    }
  }
  if (!map) {
    // Ohne Kopfzeile (z. B. Raiffeisen ELBA: Buchungsdatum;Buchungstext;Valutadatum;Betrag;Währung;Zeitstempel)
    const body = rows.slice(0, 200);
    const width = Math.max(0, ...body.map((r) => r.length));
    const share = (col: number, ok: (v: string) => boolean) => {
      const vals = body.map((r) => r[col] ?? '').filter((v) => v.trim() !== '');
      return vals.length ? vals.filter(ok).length / vals.length : 0;
    };
    const dateCols: number[] = [];
    let amount = -1;
    let currency = -1;
    for (let c = 0; c < width; c++) {
      if (share(c, (v) => !!parseDate(v)) >= 0.8) dateCols.push(c);
      else if (amount < 0 && share(c, (v) => /[,.]\d{2}-?$/.test(v.trim()) && parseAmountCents(v) != null) >= 0.8) amount = c;
      else if (currency < 0 && share(c, (v) => /^[A-Z]{3}$/.test(v.trim())) >= 0.8) currency = c;
    }
    if (!dateCols.length || amount < 0) {
      res.warnings.push('Die Spalten für Datum und Betrag wurden nicht erkannt. Bitte den Umsatz-Export als CSV oder camt.053 (XML) aus dem Online-Banking verwenden.');
      return res;
    }
    let textCol = -1;
    let bestLen = 0;
    for (let c = 0; c < width; c++) {
      if (dateCols.includes(c) || c === amount || c === currency) continue;
      const avg = body.reduce((s, r) => s + (r[c] ?? '').length, 0) / Math.max(1, body.length);
      if (avg > bestLen) {
        bestLen = avg;
        textCol = c;
      }
    }
    map = { date: dateCols[0], valueDate: dateCols[1], amount, currency: currency >= 0 ? currency : undefined, text: textCol >= 0 ? [textCol] : [] };
    res.layout = 'CSV ohne Kopfzeile (z. B. Raiffeisen ELBA)';
  }
  const m = map;
  const seen = new Map<string, number>();
  for (let i = headerAt + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[m.date!] ?? '');
    let cents = parseAmountCents(r[m.amount!] ?? '');
    if (!date || cents == null) {
      res.skipped++; // Fuß-/Saldozeilen, Leerzeilen
      continue;
    }
    if (m.sh != null) {
      const sh = (r[m.sh] ?? '').trim().toUpperCase();
      if (sh === 'S' || sh === 'SOLL') cents = -Math.abs(cents);
      else if (sh === 'H' || sh === 'HABEN') cents = Math.abs(cents);
    }
    if (cents <= 0) {
      if (cents < 0) res.debits++;
      else res.skipped++;
      continue;
    }
    const name = cleanText(m.name != null ? r[m.name] : '', 140);
    const text = cleanText(m.text.map((c) => r[c] ?? '').filter((x) => x.trim()).join(' '));
    const ref = cleanText(m.ref != null ? r[m.ref] : '', 140) || undefined;
    const base = `${date}|${cents}|${fold(name).slice(0, 40)}|${fold(text).slice(0, 80)}|${ref ?? ''}`;
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);
    res.credits.push({
      key: nth > 1 ? `${base}#${nth}` : base,
      date,
      valueDate: m.valueDate != null ? parseDate(r[m.valueDate] ?? '') || undefined : undefined,
      amountCents: cents,
      currency: (m.currency != null ? cleanText(r[m.currency], 3).toUpperCase() : '') || 'EUR',
      name,
      iban: m.iban != null ? cleanText(r[m.iban], 40).replace(/\s+/g, '') || undefined : undefined,
      text,
      ref,
    });
  }
  return res;
}

/** Kontoauszug lesen: camt.053/054 (XML) oder CSV. Wirft nie — Probleme stehen in warnings. */
export function parseStatement(text: string): StatementResult {
  const head = text.slice(0, 4000);
  if (/^\s*<(\?xml|[\w.-]*:?Document)\b/i.test(head) || /<(?:[\w.-]+:)?BkToCstmr(Stmt|DbtCdtNtfctn)\b/.test(head)) {
    if (/<(?:[\w.-]+:)?BkToCstmr(Stmt|DbtCdtNtfctn)\b/.test(text)) return parseCamt(text);
    return { format: 'camt.053', layout: 'XML', credits: [], debits: 0, skipped: 0, warnings: ['Diese XML-Datei ist kein Kontoauszug im Format camt.053 oder camt.054.'] };
  }
  return parseCsvStatement(text);
}

// ---------------------------------------------------------------------------------------------------------------
// Zuordnung
// ---------------------------------------------------------------------------------------------------------------
/** offener Betrag wie api.ts openCents (Schlussrechnung: Rest nach Abzug) */
export const openOf = (x: InvoiceRef) => (x.kind === 'invoice' ? Math.max(0, totals(x.data).dueCents) : x.grossCents);

const STOP = new Set(['gmbh', 'mbh', 'kg', 'og', 'ag', 'eu', 'ev', 'gbr', 'ohg', 'co', 'und', 'the', 'familie', 'fam', 'herr', 'frau', 'herrn', 'dr', 'ing', 'mag', 'dipl', 'di', 'prof', 'bsc', 'msc', 'hausverwaltung', 'verwaltung', 'firma']);
export function nameTokens(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

interface Prepared {
  inv: InvoiceRef;
  open: number;
  prefix: string;
  tokens: string[];
}

/** Rechnungsnummer „RE-2026-0013“ → Schlüssel „2026-13“ + Präfix „RE“ */
function numberKey(no: string): { key: string; prefix: string } | null {
  const m = no.trim().toUpperCase().match(/^([A-Z0-9]*?)[-_/ ]?(20\d{2})[-_/ ]?0*(\d{1,6})$/);
  return m ? { key: `${m[2]}-${Number(m[3])}`, prefix: m[1] } : null;
}

const fmtDay = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const RANK: Record<Confidence, number> = { sicher: 3, wahrscheinlich: 2, unsicher: 1 };

/**
 * Buchungen offenen Rechnungen zuordnen. `invoices`: offene UND kürzlich bezahlte Rechnungen (bezahlte nur, um
 * „schon bezahlt“ zu melden statt falsch zuzuordnen). Je Buchung höchstens eine Rechnung, je Rechnung höchstens eine
 * „vollständige“ Zuordnung — weitere Treffer werden als Hinweis gezeigt, nie automatisch übernommen.
 */
export function matchStatement(credits: BankTx[], invoices: InvoiceRef[]): Suggestion[] {
  const prepared: Prepared[] = [];
  const byKey = new Map<string, Prepared[]>();
  const byAmount = new Map<number, Prepared[]>();
  const odd: Prepared[] = []; // Nummern in ungewohnter Form → Textsuche
  for (const inv of invoices) {
    if (inv.kind !== 'invoice' || !inv.number || !(inv.status === 'issued' || inv.status === 'paid')) continue;
    const nk = numberKey(inv.number);
    const p: Prepared = { inv, open: inv.status === 'issued' ? openOf(inv) : 0, prefix: nk?.prefix ?? '', tokens: nameTokens(inv.data?.recipient?.name ?? '') };
    prepared.push(p);
    if (nk) byKey.set(nk.key, [...(byKey.get(nk.key) ?? []), p]);
    else odd.push(p);
    if (inv.status === 'issued' && p.open > 0) byAmount.set(p.open, [...(byAmount.get(p.open) ?? []), p]);
  }
  const keyRe = /(?<![0-9])(20\d{2})[\s\-_/.]{0,3}(\d{1,6})(?![0-9])/g;
  const seenKeys = new Set<string>();
  const out: Suggestion[] = credits.map((tx) => {
    if (seenKeys.has(tx.key)) {
      return { tx, kind: 'duplicate', reasons: [], hint: 'Diese Buchung steht mehrmals in der Datei — sie wird nur einmal berücksichtigt.', autoOk: false };
    }
    seenKeys.add(tx.key);
    if (tx.currency && tx.currency !== 'EUR') {
      return { tx, kind: 'none', reasons: [], hint: `Fremdwährung (${tx.currency}) — bitte selbst prüfen.`, autoOk: false };
    }
    const hay = `${tx.text} ${tx.ref ?? ''}`.toUpperCase();
    const hits = new Map<Prepared, boolean>(); // Rechnung → mit Präfix (stark)
    keyRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = keyRe.exec(hay))) {
      const list = byKey.get(`${m[1]}-${Number(m[2])}`);
      if (!list) continue;
      const before = hay.slice(Math.max(0, m.index - 12), m.index).replace(/[\s\-_/.:#]+$/, '');
      for (const p of list) hits.set(p, hits.get(p) || (!!p.prefix && before.endsWith(p.prefix)));
    }
    if (odd.length) {
      const flat = hay.replace(/[^A-Z0-9]/g, '');
      for (const p of odd) if (flat.includes(p.inv.number!.toUpperCase().replace(/[^A-Z0-9]/g, ''))) hits.set(p, true);
    }
    const txTokens = new Set(nameTokens(`${tx.name} ${tx.text}`));
    const nameHit = (p: Prepared) => p.tokens.some((t) => txTokens.has(t));

    let pick: Prepared | undefined;
    let how: 'strong' | 'weak' | 'amountName' | 'amount' | 'name' = 'amount';
    const reasons: string[] = [];
    if (hits.size) {
      const cands = [...hits.keys()].sort(
        (a, b) =>
          Number(hits.get(b)) - Number(hits.get(a)) ||
          Number(b.inv.status === 'issued') - Number(a.inv.status === 'issued') ||
          Number(b.open === tx.amountCents) - Number(a.open === tx.amountCents) ||
          Number(nameHit(b)) - Number(nameHit(a)),
      );
      pick = cands[0];
      how = hits.get(pick) ? 'strong' : 'weak';
      // schwache Treffer (Nummer ohne Präfix, z. B. ein Datum „2026-11“) zählen nur mit passendem Betrag oder Namen
      if (how === 'weak' && pick.open !== tx.amountCents && !nameHit(pick)) pick = undefined;
    }
    if (!pick) {
      const same = byAmount.get(tx.amountCents) ?? [];
      const named = same.filter(nameHit);
      if (named.length === 1) {
        pick = named[0];
        how = 'amountName';
      } else if (same.length === 1) {
        pick = same[0];
        how = 'amount';
      } else if (same.length > 1) {
        return { tx, kind: 'none', reasons: [], hint: `${same.length} offene Rechnungen über ${euro(tx.amountCents)} — bitte selbst zuordnen.`, autoOk: false };
      } else {
        const byName = prepared.filter((p) => p.inv.status === 'issued' && p.open > 0 && nameHit(p));
        if (byName.length === 1) {
          pick = byName[0];
          how = 'name';
        }
      }
    }
    if (!pick) return { tx, kind: 'none', reasons: [], autoOk: false };

    const inv = pick.inv;
    if (how === 'strong') reasons.push('Rechnungsnummer im Verwendungszweck');
    if (how === 'weak') reasons.push('Nummer im Verwendungszweck (ohne Präfix)');
    if (inv.status === 'paid') {
      return {
        tx, invoice: inv, openCents: 0, confidence: how === 'strong' ? 'sicher' : 'unsicher', kind: 'paidAlready', reasons,
        hint: `Rechnung ${inv.number} ist schon als bezahlt markiert${inv.paidAt ? ` (${fmtDay(inv.paidAt)})` : ''} — nichts zu tun. Zahlt der Kunde doppelt, bitte selbst klären.`,
        autoOk: false,
      };
    }
    const open = pick.open;
    const diff = tx.amountCents - open;
    if (diff === 0) reasons.push('Betrag stimmt');
    if (nameHit(pick)) reasons.push('Name passt');
    const kind: MatchKind = diff === 0 ? 'full' : diff < 0 ? 'partial' : 'over';
    let confidence: Confidence;
    if (how === 'strong') confidence = kind === 'full' ? 'sicher' : 'wahrscheinlich';
    else if (how === 'weak') confidence = kind === 'full' && nameHit(pick) ? 'sicher' : kind === 'full' ? 'wahrscheinlich' : 'unsicher';
    else if (how === 'amountName') confidence = 'wahrscheinlich';
    else confidence = 'unsicher';
    const hint =
      kind === 'partial'
        ? `Teilzahlung: ${euro(tx.amountCents)} von ${euro(open)} — es bleiben ${euro(-diff)} offen. Wird nicht automatisch als bezahlt markiert.`
        : kind === 'over'
          ? `Mehr bezahlt als offen: ${euro(diff)} zu viel. Wird nicht automatisch als bezahlt markiert.`
          : undefined;
    return { tx, invoice: inv, openCents: open, confidence, kind, reasons, hint, autoOk: confidence === 'sicher' && kind === 'full' };
  });

  // Je Rechnung nur EINE vollständige Zuordnung; mehrere Teilzahlungen, die zusammen genau aufgehen, als Hinweis
  const groups = new Map<string, Suggestion[]>();
  for (const s of out) if (s.invoice && s.invoice.status === 'issued') groups.set(s.invoice.id, [...(groups.get(s.invoice.id) ?? []), s]);
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const full = list.filter((s) => s.kind === 'full').sort((a, b) => RANK[b.confidence!] - RANK[a.confidence!] || a.tx.date.localeCompare(b.tx.date));
    const keep = full[0];
    for (const s of list) {
      if (s === keep) continue;
      if (keep) {
        s.autoOk = false;
        s.confidence = 'unsicher';
        s.hint = `Rechnung ${s.invoice!.number} passt besser zur Buchung vom ${fmtDay(keep.tx.date)} über ${euro(keep.tx.amountCents)}. ${s.hint ?? ''}`.trim();
      }
    }
    const partials = list.filter((s) => s.kind === 'partial');
    if (!keep && partials.length >= 2) {
      const sum = partials.reduce((a, s) => a + s.tx.amountCents, 0);
      if (sum === partials[0].openCents) {
        for (const s of partials) s.hint = `Teilzahlung — zusammen mit ${partials.length - 1 === 1 ? 'einer weiteren Buchung' : `${partials.length - 1} weiteren Buchungen`} ist der volle Betrag ${euro(sum)} bezahlt. Du kannst die Rechnung jetzt als bezahlt markieren.`;
      }
    }
  }
  return out;
}

/** Reihenfolge für die Anzeige: Zuordnungen zuerst (sicher → unsicher), dann der Rest; je Gruppe neueste zuerst */
export function sortSuggestions(list: Suggestion[]): Suggestion[] {
  const rank = (s: Suggestion) => (s.invoice && s.kind !== 'paidAlready' ? RANK[s.confidence ?? 'unsicher'] + 10 : s.kind === 'paidAlready' ? 5 : 0);
  return [...list].sort((a, b) => rank(b) - rank(a) || b.tx.date.localeCompare(a.tx.date));
}

// ---------------------------------------------------------------------------------------------------------------
// Ergebnisliste als CSV (für die eigene Ablage) — Formelschutz wie invoiceExport.ts
// ---------------------------------------------------------------------------------------------------------------
const q = (s: unknown) => {
  let t = String(s ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};
const num = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function resultCsv(list: Suggestion[], done: Record<string, 'ok' | string | undefined> = {}): string {
  const head = ['Buchungsdatum', 'Betrag', 'Auftraggeber', 'Verwendungszweck', 'Rechnung', 'Offen', 'Sicherheit', 'Hinweis', 'Übernommen'].join(';');
  const rows = list.map((s) =>
    [
      fmtDay(s.tx.date), num(s.tx.amountCents), q(s.tx.name), q(s.tx.text), q(s.invoice?.number ?? ''), s.openCents != null ? num(s.openCents) : '',
      q(s.confidence ?? ''), q(s.hint ?? ''), q(done[s.tx.key] === 'ok' ? 'ja' : done[s.tx.key] ? `Fehler: ${done[s.tx.key]}` : ''),
    ].join(';'),
  );
  return [head, ...rows].join('\r\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Beispiel-Kontoauszug (nur Beispieldaten ?demo) — passt zu den offenen Beispielrechnungen
// ---------------------------------------------------------------------------------------------------------------
export function sampleStatementCsv(invoices: InvoiceRef[], today: string): string {
  const open = invoices.filter((x) => x.kind === 'invoice' && x.status === 'issued' && !!x.number).sort((a, b) => (a.number ?? '').localeCompare(b.number ?? ''));
  const paid = invoices.find((x) => x.kind === 'invoice' && x.status === 'paid' && !!x.number);
  const de = (iso: string) => iso.split('-').reverse().join('.');
  const day = (n: number) => {
    const [y, m, d] = today.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d - n));
    return de(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`);
  };
  const spaced = (no: string) => no.replace(/-/g, ' ');
  const lines = ['"Buchungsdatum";"Valutadatum";"Partnername";"Partner IBAN";"Betrag";"Währung";"Buchungs-Info";"Zahlungsreferenz"'];
  const row = (d: string, name: string, iban: string, cents: number, info: string, ref = '') =>
    lines.push([d, d, name, iban, num(cents), 'EUR', info, ref].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
  if (open[0]) row(day(2), open[0].data.recipient.name, 'AT021100000012345678', openOf(open[0]), `Rechnung ${spaced(open[0].number!)} danke`);
  if (open[1]) row(day(1), open[1].data.recipient.name, 'AT483200000012345864', Math.round(openOf(open[1]) / 2), `Teilzahlung ${open[1].number!.replace(/-/g, '')} – Rest folgt`);
  row(day(1), 'Großhandel Müller & Söhne', 'AT611904300234573201', -8990, 'Rechnung 4711 Kupferrohr');
  row(day(3), 'Bank', '', 12, 'Habenzinsen');
  if (paid) row(day(4), paid.data.recipient.name, 'AT131490022010010999', openOf({ ...paid, status: 'issued' }), `${paid.number} Wartung Wärmepumpe`);
  row(day(5), 'Jürgen Österreicher', 'AT026000000001349870', 15000, 'Anzahlung Badsanierung');
  return lines.join('\r\n');
}
