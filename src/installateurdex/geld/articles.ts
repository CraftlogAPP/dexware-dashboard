// wie App mobile/src/lib/articles.ts — wortgleich übernommen (nur Importe angepasst). Änderungen IMMER in beiden Repos.
// Material & Preise (ROADMAP Phase 5b, A4): Artikel aus Großhändler-Dateien (Datanorm 4.0 oder CSV) lesen,
// Verkaufspreis nach eigener Regel berechnen, Artikel suchen und als Rechnungsposition übernehmen.
// Rein (ohne RN, ohne Netz) — getestet in scripts/test-articles.js.
import type { InvoiceLine } from './invoice';

/** Ein Artikel: eigener Stammartikel (supplier leer) oder aus einem Großhändler-Katalog. */
export interface Article {
  id?: string;
  supplier?: string; // Großhändler, leer = eigener Artikel
  no?: string; // Artikelnummer
  name: string;
  unit: string; // Stk, m, kg …
  /** Preis je Einheit in Cent (netto). Bei priceKind 'list' der Listenpreis, bei 'net' der Einkaufspreis. */
  priceCents: number;
  priceKind: 'list' | 'net' | 'sale'; // sale = eigener Verkaufspreis, wird 1:1 übernommen
  group?: string; // Warengruppe
  discountGroup?: string; // Rabattgruppe (Datanorm)
  ean?: string;
}

/** Verkaufspreis-Regel aus den Rechnungsdaten. */
export interface PricingRule {
  /** list = zum Listenpreis verkaufen; markup = Einkauf + Aufschlag */
  mode: 'list' | 'markup';
  /** Rabatt des Großhändlers auf den Listenpreis in % (ergibt den Einkaufspreis) */
  discountPercent: number;
  /** Aufschlag auf den Einkaufspreis in % */
  markupPercent: number;
}

export const DEFAULT_PRICING: PricingRule = { mode: 'list', discountPercent: 0, markupPercent: 20 };

export const MAX_IMPORT = 300_000;

const clampPct = (n: number, max: number) => (Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0);

/** Einkaufspreis je Einheit (Cent) */
export function costCents(a: Pick<Article, 'priceCents' | 'priceKind'>, rule: PricingRule = DEFAULT_PRICING): number {
  if (a.priceKind === 'list') return Math.round(a.priceCents * (1 - clampPct(rule.discountPercent, 95) / 100));
  return Math.round(a.priceCents);
}

/** Verkaufspreis je Einheit (Cent, netto) nach Regel */
export function saleCents(a: Pick<Article, 'priceCents' | 'priceKind'>, rule: PricingRule = DEFAULT_PRICING): number {
  if (a.priceKind === 'sale') return Math.round(a.priceCents);
  if (rule.mode === 'list' && a.priceKind === 'list') return Math.round(a.priceCents);
  return Math.round(costCents(a, rule) * (1 + clampPct(rule.markupPercent, 500) / 100));
}

/** Als Rechnungsposition übernehmen */
export function toInvoiceLine(a: Article, rule: PricingRule, vatRate: number, qty = 1): InvoiceLine {
  const text = [a.name.trim(), a.no ? `(Art.-Nr. ${a.no})` : ''].filter(Boolean).join(' ').slice(0, 200);
  return { kind: 'material', text, qty, unit: a.unit || 'Stk', unitPriceCents: saleCents(a, rule), vatRate };
}

// ---------------------------------------------------------------------------
// Zeichensatz: Datanorm-Dateien sind oft im DOS-Zeichensatz (CP850/437), CSV aus Excel in Windows-1252, neuere in UTF-8.
// ---------------------------------------------------------------------------

const CP850: Record<number, string> = {
  0x80: 'Ç', 0x81: 'ü', 0x82: 'é', 0x83: 'â', 0x84: 'ä', 0x85: 'à', 0x86: 'å', 0x87: 'ç', 0x88: 'ê', 0x89: 'ë', 0x8a: 'è', 0x8b: 'ï',
  0x8c: 'î', 0x8d: 'ì', 0x8e: 'Ä', 0x8f: 'Å', 0x90: 'É', 0x91: 'æ', 0x92: 'Æ', 0x93: 'ô', 0x94: 'ö', 0x95: 'ò', 0x96: 'û', 0x97: 'ù',
  0x98: 'ÿ', 0x99: 'Ö', 0x9a: 'Ü', 0x9b: 'ø', 0x9c: '£', 0x9d: 'Ø', 0x9e: '×', 0xa0: 'á', 0xa1: 'í', 0xa2: 'ó', 0xa3: 'ú', 0xa4: 'ñ',
  0xa5: 'Ñ', 0xa6: 'ª', 0xa7: 'º', 0xab: '½', 0xac: '¼', 0xd5: '€', 0xe1: 'ß', 0xe6: 'µ', 0xf8: '°', 0xfd: '²', 0xfc: '³',
};
const W1252: Record<number, string> = { 0x80: '€', 0x84: '„', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—', 0x99: '™' };

const CHUNK = 16384;

/** Strenges UTF-8 (null, sobald eine ungültige Folge auftaucht), blockweise für große Dateien. */
function decodeUtf8(b: Uint8Array): string | null {
  const parts: string[] = [];
  let cps: number[] = [];
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    let cp: number, n: number;
    if (c < 0x80) { cp = c; n = 0; }
    else if (c >= 0xc2 && c < 0xe0) { cp = c & 0x1f; n = 1; }
    else if (c >= 0xe0 && c < 0xf0) { cp = c & 0x0f; n = 2; }
    else if (c >= 0xf0 && c < 0xf5) { cp = c & 0x07; n = 3; }
    else return null;
    for (let k = 1; k <= n; k++) {
      const cc = b[i + k];
      if (cc === undefined || (cc & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (cc & 0x3f);
    }
    cps.push(cp);
    if (cps.length >= CHUNK) { parts.push(String.fromCodePoint(...cps)); cps = []; }
    i += n + 1;
  }
  if (cps.length) parts.push(String.fromCodePoint(...cps));
  return parts.join('');
}

/** Bytes einer Großhändler-Datei → Text (UTF-8, sonst DOS-850 oder Windows-1252 nach Umlaut-Häufigkeit). */
export function decodeBytes(b: Uint8Array): string {
  const body = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b;
  let high = false;
  for (let i = 0; i < body.length; i++) if (body[i] >= 0x80) { high = true; break; }
  if (high) {
    const u = decodeUtf8(body);
    if (u !== null) return u;
  }
  let dos = 0, win = 0;
  if (high) for (let i = 0; i < body.length; i++) {
    const x = body[i];
    if (x === 0x81 || x === 0x84 || x === 0x8e || x === 0x94 || x === 0x99 || x === 0x9a || x === 0xe1) dos++;
    else if (x === 0xe4 || x === 0xf6 || x === 0xfc || x === 0xc4 || x === 0xd6 || x === 0xdc || x === 0xdf) win++;
  }
  const map = dos > win ? CP850 : W1252;
  const latin = dos <= win; // Windows-1252: 0xA0–0xFF wie Latin-1
  const parts: string[] = [];
  for (let i = 0; i < body.length; i += CHUNK) {
    const slice = body.subarray(i, i + CHUNK);
    let s = '';
    if (!high) s = String.fromCharCode(...slice);
    else {
      const chars: string[] = new Array(slice.length);
      for (let k = 0; k < slice.length; k++) {
        const x = slice[k];
        chars[k] = x < 0x80 ? String.fromCharCode(x) : map[x] ?? (latin && x >= 0xa0 ? String.fromCharCode(x) : '?');
      }
      s = chars.join('');
    }
    parts.push(s);
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Datanorm 4.0: A-Satz = Artikel, B-Satz = Zusatzdaten (u. a. EAN). Felder mit Semikolon getrennt.
// A;Kennz;ArtNr;TextKz;Kurztext1;Kurztext2;PreisKz(1=Listen-/Bruttopreis, 2=Nettopreis);PE(0=1,1=10,2=100,3=1000);ME;Preis in Cent;Rabattgruppe;Warengruppe;…
// ---------------------------------------------------------------------------

export interface ParseResult {
  format: 'datanorm' | 'csv' | 'unknown';
  articles: Article[];
  skipped: number;
  /** gekürzt auf MAX_IMPORT */
  truncated: boolean;
  /** Spaltenzuordnung (CSV), zur Anzeige */
  columns?: Partial<Record<'no' | 'name' | 'unit' | 'price' | 'ean' | 'group', string>>;
  /** Hinweis, falls die Datei nicht passt */
  error?: string;
}

const PE: Record<string, number> = { '0': 1, '1': 10, '2': 100, '3': 1000 };

export function detectFormat(text: string): 'datanorm' | 'csv' | 'unknown' {
  const lines = text.split(/\r?\n/, 400).filter((l) => l.trim());
  if (!lines.length) return 'unknown';
  const dn = lines.filter((l) => /^[AB];[NALX];/.test(l)).length;
  if (dn >= Math.max(1, lines.length * 0.3)) return 'datanorm';
  if (/[;\t,]/.test(lines[0])) return 'csv';
  return 'unknown';
}

export function parseDatanorm(text: string, supplier = ''): ParseResult {
  const byNo = new Map<string, Article>();
  const eans = new Map<string, string>();
  let skipped = 0;
  let truncated = false;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw) continue;
    const f = raw.split(';');
    if (f[0] === 'A') {
      const no = (f[2] ?? '').trim();
      if (f[1] === 'L') { byNo.delete(no); continue; }
      const name = [f[4], f[5]].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');
      const price = parseInt((f[9] ?? '').trim(), 10);
      if (!no || !name || !Number.isFinite(price)) { skipped++; continue; }
      if (byNo.size >= MAX_IMPORT && !byNo.has(no)) { truncated = true; continue; }
      byNo.set(no, {
        supplier, no, name: name.slice(0, 200), unit: (f[8] ?? '').trim().slice(0, 12) || 'Stk',
        priceCents: Math.round(price / (PE[(f[7] ?? '').trim()] ?? 1)),
        priceKind: (f[6] ?? '').trim() === '2' ? 'net' : 'list',
        discountGroup: (f[10] ?? '').trim() || undefined, group: (f[11] ?? '').trim() || undefined,
      });
    } else if (f[0] === 'B') {
      const no = (f[2] ?? '').trim();
      const ean = f.slice(3).map((x) => x.trim()).find((x) => /^\d{13}$|^\d{8}$/.test(x));
      if (no && ean) eans.set(no, ean);
    }
  }
  for (const [no, ean] of eans) { const a = byNo.get(no); if (a) a.ean = ean; }
  const articles = [...byNo.values()];
  return { format: 'datanorm', articles, skipped, truncated, error: articles.length ? undefined : 'Keine Artikel (A-Sätze) gefunden.' };
}

// ---------------------------------------------------------------------------
// CSV: Kopfzeile wird erkannt (Artikelnummer, Bezeichnung, Einheit, Preis, EAN, Warengruppe), Trenner ; , oder Tab.
// ---------------------------------------------------------------------------

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** „1.234,56“, „1234,56“, „1,234.56“, „12.5“, „€ 12,50“ → Cent */
export function parseMoney(s: string): number | null {
  let t = (s ?? '').replace(/[€\s]|EUR/gi, '');
  if (!t) return null;
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot) t = t.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma >= 0) t = t.replace(/,/g, '');
  else if (lastComma < 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const v = Math.round(parseFloat(t) * 100);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

const HEAD: { key: 'no' | 'name' | 'unit' | 'sale' | 'list' | 'net' | 'ean' | 'group'; re: RegExp }[] = [
  { key: 'ean', re: /^(ean|gtin|ean-?code|barcode)/ },
  { key: 'no', re: /art.*n(r|o|ummer)|^artikel$|^nr\.?$|^sku$|bestell.?n|^artnr|^material.?nr|^item/ },
  { key: 'name', re: /bezeichnung|beschreibung|kurztext|^text|^name|^artikelbez|^description/ },
  { key: 'unit', re: /einheit|^me$|^unit|^vpe$/ },
  { key: 'sale', re: /^vk|verkauf|sale/ },
  { key: 'list', re: /listen|brutto|^upe|^preis$|^price$|^einzelpreis/ },
  { key: 'net', re: /^ek|einkauf|netto/ },
  { key: 'group', re: /warengr|^gruppe|kategorie|^category/ },
];

export function parseCsv(text: string, supplier = ''): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { format: 'csv', articles: [], skipped: 0, truncated: false, error: 'Die Datei hat keine Datenzeilen.' };
  const sep = [';', '\t', ','].map((s) => [s, splitCsvLine(lines[0], s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const head = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase().replace(/^﻿/, ''));
  const col: Partial<Record<(typeof HEAD)[number]['key'], number>> = {};
  head.forEach((h, i) => {
    for (const { key, re } of HEAD) if (col[key] === undefined && re.test(h)) { col[key] = i; break; }
  });
  const priceKey = col.sale !== undefined ? 'sale' : col.list !== undefined ? 'list' : col.net !== undefined ? 'net' : null;
  if (col.name === undefined || priceKey === null) {
    return { format: 'csv', articles: [], skipped: 0, truncated: false, error: 'Spalten nicht erkannt. Die erste Zeile braucht mindestens „Bezeichnung“ und „Preis“ (gern auch „Artikelnummer“, „Einheit“, „EAN“).' };
  }
  const articles: Article[] = [];
  let skipped = 0, truncated = false;
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line, sep);
    const name = (f[col.name] ?? '').slice(0, 200);
    const price = parseMoney(f[col[priceKey]!] ?? '');
    if (!name || price === null) { skipped++; continue; }
    if (articles.length >= MAX_IMPORT) { truncated = true; break; }
    articles.push({
      supplier, name, priceCents: price, priceKind: priceKey,
      no: col.no !== undefined ? (f[col.no] || undefined) : undefined,
      unit: (col.unit !== undefined ? f[col.unit] : '')?.slice(0, 12) || 'Stk',
      ean: col.ean !== undefined && /^\d{8,14}$/.test(f[col.ean] ?? '') ? f[col.ean] : undefined,
      group: col.group !== undefined ? (f[col.group] || undefined) : undefined,
    });
  }
  const label = (i?: number) => (i === undefined ? undefined : splitCsvLine(lines[0], sep)[i]);
  return {
    format: 'csv', articles, skipped, truncated,
    columns: { no: label(col.no), name: label(col.name), unit: label(col.unit), price: label(col[priceKey]), ean: label(col.ean), group: label(col.group) },
    error: articles.length ? undefined : 'Keine gültigen Zeilen (Bezeichnung + Preis) gefunden.',
  };
}

export function parseArticles(text: string, supplier = ''): ParseResult {
  const f = detectFormat(text);
  if (f === 'datanorm') return parseDatanorm(text, supplier);
  if (f === 'csv') return parseCsv(text, supplier);
  return { format: 'unknown', articles: [], skipped: 0, truncated: false, error: 'Unbekanntes Format. Unterstützt: Datanorm 4.0 und CSV (Excel „Speichern unter → CSV“).' };
}

// ---------------------------------------------------------------------------
// Suche (lokal, für eigene und zuletzt verwendete Artikel; der Großhändler-Katalog wird am Server gesucht)
// ---------------------------------------------------------------------------

/** Kleinschreibung, Umlaute vereinheitlicht (ä → ae), Satzzeichen weg */
export function norm(s: string): string {
  return (s ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9,.\s/-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Alle Suchwörter müssen vorkommen; Artikelnummer/EAN exakt zuerst, dann Name beginnt mit, dann kürzere Namen. */
export function searchArticles<T extends Article>(list: T[], query: string, limit = 30): T[] {
  const q = norm(query);
  if (!q) return list.slice(0, limit);
  const words = q.split(' ');
  const scored: { a: T; s: number }[] = [];
  for (const a of list) {
    const name = norm(a.name);
    const hay = `${name} ${norm(a.no ?? '')} ${a.ean ?? ''} ${norm(a.group ?? '')}`;
    if (!words.every((w) => hay.includes(w))) continue;
    let s = 0;
    if ((a.no && norm(a.no) === q) || a.ean === q) s -= 1000;
    if (name.startsWith(words[0])) s -= 100;
    s += name.length / 10;
    scored.push({ a, s });
  }
  return scored.sort((x, y) => x.s - y.s).slice(0, limit).map((x) => x.a);
}

/** Für die Server-Suche: Suchwörter als ilike-Muster (Sonderzeichen entschärft) */
export function ilikeTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean).slice(0, 5).map((w) => `%${w.replace(/[%_\\]/g, (c) => '\\' + c)}%`);
}

/** Artikelnummer aus einem Positionstext „… (Art.-Nr. 12345)“ */
export function articleNoOf(text: string): string | undefined {
  return text.match(/\(Art\.-Nr\.\s*([^)]+)\)\s*$/)?.[1]?.trim() || undefined;
}

/** Passender Artikel für eine Material-Zeile: gleiche Artikelnummer, sonst gleicher Name (Umlaute/Groß egal). */
export function matchArticle<T extends Article>(text: string, candidates: T[]): T | undefined {
  const no = articleNoOf(text);
  if (no) {
    const byNo = candidates.find((a) => a.no === no);
    if (byNo) return byNo;
  }
  const bare = norm(text.replace(/\(Art\.-Nr\.[^)]*\)\s*$/, ''));
  return bare ? candidates.find((a) => norm(a.name) === bare) : undefined;
}
