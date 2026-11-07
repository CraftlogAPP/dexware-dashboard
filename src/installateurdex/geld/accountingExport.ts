// wie App mobile/src/lib/accountingExport.ts — wortgleich übernommen (nur Importe angepasst). Änderungen IMMER in beiden Repos.
// Buchungsexport für die Steuerberatung: DATEV-Format „Buchungsstapel“ (EXTF, Deutschland) und BMD-NTCS-Buchungsimport
// (BuErf, Österreich). Eine Buchung je Beleg und Steuersatz: Debitor an Erlöskonto, Bruttobetrag. Rein (ohne RN) —
// getestet in scripts/test-invoice-export.js.
//
// Quellen (abgerufen 06.11.2026):
// - DATEV-Formatbeschreibung (Header 700, Buchungsstapel Formatversion 13, 125 Spalten, Feld-Regex, Zeichensatz):
//   https://developer.datev.de/mediator/strapi/file-formats/edabeecu20kg6dhcbgxyews5
//   Musterdaten: https://developer.datev.de/assets/Musterdaten_DATEV_Format_0_7f9322b9cc.zip
// - DATEV SKR03/SKR04 „gültig für 2026“ (AM-Konten 8400/8300/8100/8337/8192 bzw. 4400/4300/4100/4337/4184,
//   Debitoren 10000–69999; 8195/4185 sind 2026 reserviert):
//   https://www.datev.de/content/dam/markenassets/themen-und-produktgruppen/zielgruppen/mandant/unternehmer/branche/bau/11174%20SKR03%20BilrUg.pdf
//   https://www.datev.de/content/dam/markenassets/themen-und-produktgruppen/zielgruppen/mandant/unternehmer/branche/bau/11175%20SKR04%20BilrUg.pdf
// - DATEV Dok.-Nr. 1003221 (Kopie Stand 2020; OP-Ausgleich nur bei gleichem Belegfeld 1):
//   https://handbuch.faktura-xp.de/download/ASCII-Dateibeschreibung_2020.pdf
// - BMD-Hilfe 17.26 „BuErf Import“ (NTCS-Feldnamen, Vorzeichen, Steuercodes 1/16/27, gustokz):
//   http://web.archive.org/web/20171105035837/http://www.bmd.at:80/Portaldata/1/Resources/help/17.26/OES/Documents/1109441501000002470.html
// - dvo-Handbuch BuErf-Import (Beispielzeile, belegnr nur Ziffern):
//   https://dvo.at/PDF/ReleaseNotes/Handbuch_BuErf_Import_Fibu_(BMD_BuErf-Modul)_05102021.pdf
// - Vergleich mit Open-Source-Exportern: github.com/ledermann/datev, OCA/l10n-germany datev_export_dtvf,
//   funkring/fdoo at_bmd, heliumv FibuExportFormatterBMD.
//
// Belegt: DATEV-Kopf/Spalten/Feldformate, SKR-Automatikkonten, BMD-Feldnamen/Vorzeichen/Steuercodes.
// NICHT öffentlich festgelegt (darum in den Rechnungsdaten änderbar): Berater-/Mandantennummer, Kontenrahmen,
// Debitorenkonto, alle österreichischen Erlöskonten (es gibt keinen verbindlichen BMD-Musterkontenplan).
import { totals } from './invoice';
import type { InvoiceProfile } from './invoice';
import type { ExportRow } from './invoiceExport';

type Land = InvoiceProfile['land'];
export type BookFormat = 'datev' | 'bmd' | 'list';
export type Kontenrahmen = 'SKR03' | 'SKR04';

/** Im Rechnungsprofil gespeichert (org.invoice_profile.accounting) — nur eingetragene Werte, Rest = Standard. */
export interface AccountingSettings {
  /** DATEV Beraternummer 1001–9999999 */
  beraterNr?: string;
  /** DATEV Mandantennummer 1–99999 */
  mandantNr?: string;
  kontenrahmen?: Kontenrahmen;
  /** DATEV Sachkontenlänge 4–8 (Standard 4) */
  sachkontenlaenge?: number;
  /** Kundenkonto (Sammeldebitor bzw. Personenkonto) */
  debitor?: string;
  /** Erlöskonten: Schlüssel = Steuersatz ('19', '7', '20', '13', '10', '0') oder 'rc' (Reverse Charge) / 'klein' */
  erloese?: Record<string, string>;
}

export interface ResolvedAccounting {
  beraterNr: string;
  mandantNr: string;
  kontenrahmen: Kontenrahmen;
  sachkontenlaenge: number;
  debitor: string;
  erloese: Record<string, string>;
}

const SKR: Record<Kontenrahmen, Record<string, string>> = {
  SKR03: { '19': '8400', '7': '8300', '0': '8100', rc: '8337', klein: '8192' },
  SKR04: { '19': '4400', '7': '4300', '0': '4100', rc: '4337', klein: '4184' },
};
// Österreich: Klasse 4 = Erlöse (Einheitskontenrahmen), Einzelkonten sind Annahme → mit dem Steuerberater abstimmen
const AT_ERLOESE: Record<string, string> = { '20': '4000', '13': '4020', '10': '4010', '0': '4050', rc: '4060', klein: '4070' };

export function revenueKeys(land: Land): string[] {
  if (land === 'DE') return ['19', '7', '0', 'rc', 'klein'];
  if (land === 'AT') return ['20', '13', '10', '0', 'rc', 'klein'];
  return [];
}

export function revenueLabel(land: Land, key: string): string {
  if (key === 'rc') return land === 'DE' ? 'Erlöse § 13b UStG (Reverse Charge Bau)' : 'Erlöse § 19 Abs. 1a UStG (Bauleistungen)';
  if (key === 'klein') return land === 'DE' ? 'Erlöse Kleinunternehmer (§ 19 UStG)' : 'Erlöse Kleinunternehmer (§ 6 Abs. 1 Z 27)';
  if (key === '0') return 'Erlöse steuerfrei / 0 %';
  return `Erlöse ${key} %`;
}

const digits = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '').slice(0, max) : '');

/** Gespeicherte Werte säubern: nur Ziffern, leere Felder weg (dann gilt der Standard). */
export function cleanAccounting(s: AccountingSettings | undefined): AccountingSettings | undefined {
  if (!s || typeof s !== 'object') return undefined;
  const out: AccountingSettings = {};
  const b = digits(s.beraterNr, 7);
  const m = digits(s.mandantNr, 5);
  const d = digits(s.debitor, 9);
  if (b) out.beraterNr = b;
  if (m) out.mandantNr = m;
  if (d) out.debitor = d;
  if (s.kontenrahmen === 'SKR03' || s.kontenrahmen === 'SKR04') out.kontenrahmen = s.kontenrahmen;
  const len = Number(s.sachkontenlaenge);
  if (Number.isInteger(len) && len >= 4 && len <= 8) out.sachkontenlaenge = len;
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.erloese && typeof s.erloese === 'object' ? s.erloese : {})) {
    const x = digits(v, 9);
    if (x && /^(\d{1,2}|rc|klein)$/.test(k)) e[k] = x;
  }
  if (Object.keys(e).length) out.erloese = e;
  return Object.keys(out).length ? out : undefined;
}

/** Standardwerte + eigene Eingaben (alte Profile ohne `accounting` bekommen nur Standardwerte). */
export function resolveAccounting(land: Land, s?: AccountingSettings): ResolvedAccounting {
  const c = cleanAccounting(s) ?? {};
  const kontenrahmen = c.kontenrahmen ?? 'SKR03';
  const sachkontenlaenge = c.sachkontenlaenge ?? 4;
  const base = land === 'DE' ? SKR[kontenrahmen] : land === 'AT' ? AT_ERLOESE : {};
  // DATEV: Personenkonten haben eine Stelle mehr als Sachkonten (Sammeldebitor 10000 bei Länge 4)
  const debitor = c.debitor ?? (land === 'AT' ? '200000' : `1${'0'.repeat(sachkontenlaenge)}`);
  return { beraterNr: c.beraterNr ?? '', mandantNr: c.mandantNr ?? '', kontenrahmen, sachkontenlaenge, debitor, erloese: { ...base, ...(c.erloese ?? {}) } };
}

export function bookFormats(land: Land): BookFormat[] {
  return land === 'DE' ? ['datev', 'list'] : land === 'AT' ? ['bmd', 'list'] : ['list'];
}
export const defaultBookFormat = (land: Land): BookFormat => bookFormats(land)[0];

export const BOOK_FORMAT_INFO: Record<BookFormat, { label: string; hint: string }> = {
  datev: {
    label: 'DATEV (Buchungsstapel)',
    hint: 'Diese Datei kann dein Steuerberater direkt in DATEV einlesen: eine Buchung je Rechnung und Steuersatz (Kunde an Erlöskonto), Stornos im Haben.',
  },
  bmd: {
    label: 'BMD',
    hint: 'Diese Datei kann dein Steuerberater direkt in BMD einlesen (Buchungsimport): eine Buchung je Rechnung und Steuersatz, Stornos mit umgekehrtem Vorzeichen.',
  },
  list: {
    label: 'Excel-Liste',
    hint: 'Rechnungsausgangsbuch als Tabelle (öffnet in Excel): eine Zeile je Beleg und Steuersatz, Stornos negativ.',
  },
};

/** Was vor dem DATEV-/BMD-Export noch eingetragen werden sollte (leer = alles da). */
export function missingAccountingSetup(format: BookFormat, p: { land: Land; accounting?: AccountingSettings }): string[] {
  const c = cleanAccounting(p.accounting) ?? {};
  if (format === 'datev') return [...(c.beraterNr ? [] : ['Beraternummer']), ...(c.mandantNr ? [] : ['Mandantennummer'])];
  if (format === 'bmd') return c.debitor ? [] : ['Kundenkonto (Debitor) aus BMD'];
  return [];
}

// ---------------------------------------------------------------------------------------------------------------
// Buchungen (gemeinsame Grundlage beider Formate)
// ---------------------------------------------------------------------------------------------------------------
export type BookRow = ExportRow & { dueAt?: string };

export interface Booking {
  /** Brutto in Cent, mit Vorzeichen (Storno / Abzug Abschläge negativ) */
  grossCents: number;
  vatCents: number;
  rate: number;
  key: string;
  account: string;
  /** Rechnungsdatum JJJJ-MM-TT */
  date: string;
  number: string;
  /** Bezug für den OP-Ausgleich: bei Storno die stornierte Rechnung, sonst die eigene Nummer */
  opNumber: string;
  credit: boolean;
  customer: string;
  uid: string;
  text: string;
  payDays?: number;
}

const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
const dayNum = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/**
 * Nur ausgestellte Rechnungen und Stornorechnungen mit Rechnungsdatum in [from, to) — wie das Rechnungsausgangsbuch.
 * Schlussrechnung mit bezahlten Abschlägen: zusätzlich eine Gegenbuchung über die Abschläge (die Abschlagsrechnungen
 * sind schon als Erlös gebucht), sonst wäre der Umsatz doppelt.
 */
export function buildBookings(rows: BookRow[], from: string, to: string, land: Land, acc: ResolvedAccounting): { bookings: Booking[]; warnings: string[] } {
  const warnings: string[] = [];
  const bookings: Booking[] = [];
  const list = rows
    .filter((r) => (r.kind === 'invoice' || r.kind === 'credit') && r.number && isYmd(r.issuedAt) && r.issuedAt.slice(0, 10) >= from && r.issuedAt.slice(0, 10) < to) // fehlermuster-ok: issued_at ist ein Datum (date), kein Zeitstempel
    .sort((a, b) => (a.issuedAt ?? '').localeCompare(b.issuedAt ?? '') || (a.number ?? '').localeCompare(b.number ?? ''));
  const unknown = new Set<number>();
  for (const r of list) {
    const credit = r.kind === 'credit';
    const sign = credit ? -1 : 1;
    const t = totals(r.data);
    const mode = r.data.vatMode;
    const keyOf = (rate: number) => (mode === 'reverseCharge' ? 'rc' : mode === 'kleinunternehmer' ? 'klein' : String(rate));
    const number = String(r.number);
    const cancels = r.data.cancels ?? '';
    const date = String(r.issuedAt).slice(0, 10);
    const customer = r.data.recipient.name ?? '';
    const payDays = !credit && isYmd(r.dueAt) ? Math.max(0, dayNum(r.dueAt) - dayNum(date)) : undefined;
    const accountFor = (key: string, rate: number) => {
      const a = acc.erloese[key];
      if (a) return a;
      unknown.add(rate);
      return acc.erloese[revenueKeys(land)[0]] ?? '';
    };
    const push = (grossCents: number, vatCents: number, rate: number, text: string) => {
      if (grossCents === 0) return; // DATEV lehnt 0,00 ab
      const key = keyOf(rate);
      bookings.push({
        grossCents, vatCents, rate: mode === 'normal' ? rate : 0, key, account: accountFor(key, rate), date, number,
        opNumber: credit && cancels ? cancels : number, credit, customer, uid: r.data.recipient.uid ?? '', text, payDays,
      });
    };
    for (const g of t.byRate) push(sign * (g.baseCents + g.vatCents), sign * g.vatCents, g.rate, credit ? `Storno ${number}` : number);
    // Schlussrechnung: Abschlagsrechnungen je Steuersatz genau mit ihrem Netto + USt zurückbuchen
    for (const g of t.deductedByRate) push(-sign * (g.netCents + g.vatCents), -sign * g.vatCents, g.rate, `Abzug Abschläge ${number}`);
    // frei eingetragene Zahlungen (ohne ausgewählte Abschlagsrechnung): USt aus dem Hauptsatz herausgerechnet
    if (t.manualPrepaidCents > 0 && t.byRate.length) {
      const main = [...t.byRate].sort((a, b) => b.baseCents - a.baseCents)[0];
      const rate = mode === 'normal' ? main.rate : 0;
      const vat = Math.round((t.manualPrepaidCents * rate) / (100 + rate));
      push(-sign * t.manualPrepaidCents, -sign * vat, main.rate, `Abzug Abschläge ${number}`);
    }
  }
  for (const rate of unknown) warnings.push(`Für ${rate} % USt ist kein Erlöskonto hinterlegt — gebucht auf das Konto für den Normalsatz. Bitte in den Rechnungsdaten unter „Buchhaltung“ ergänzen oder mit dem Steuerberater klären.`);
  return { bookings, warnings };
}

// ---------------------------------------------------------------------------------------------------------------
// Zeichen & Zahlen
// ---------------------------------------------------------------------------------------------------------------
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** Text → Windows-1252 (ANSI), wie DATEV und BMD es erwarten. Nicht darstellbare Zeichen (z. B. Emoji) → „?“. */
export function encodeWin1252(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0x3f;
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else out.push(CP1252[c] ?? 0x3f);
  }
  return new Uint8Array(out);
}

/** Cent → „1234,56“ (Dezimalkomma, kein Tausenderpunkt) */
const amount = (cents: number) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)},${String(Math.abs(cents) % 100).padStart(2, '0')}`;
/** Textfeld: keine Steuerzeichen/Zeilenumbrüche, gekürzt, Formel-Schutz (= + - @ am Anfang → ' davor, wie invoiceExport) */
const safeText = (s: unknown, max: number) => {
  const noCtrl = Array.from(String(s ?? ''), (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('');
  let t = noCtrl.replace(/\s+/g, ' ').trim();
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return t.slice(0, max);
};
const quoted = (s: string) => `"${s.replace(/"/g, '""')}"`;
const pad2 = (n: number) => String(n).padStart(2, '0');
/** Lokale Zeit → JJJJMMTTHHMMSSmmm (DATEV „Erzeugt am“) */
const stamp = (d: Date) =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}${String(d.getMilliseconds()).padStart(3, '0')}`;
/** JJJJ-MM-TT minus 1 Kalendertag (reine Datumsrechnung, keine Zeitzone) */
const dayBefore = (ymd: string) => {
  const t = new Date((dayNum(ymd) - 1) * 86_400_000);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
};

// ---------------------------------------------------------------------------------------------------------------
// DATEV EXTF Buchungsstapel (Header 700, Kategorie 21, Formatversion 13)
// ---------------------------------------------------------------------------------------------------------------
const zi = (n: number) => Array.from({ length: 20 }, (_, i) => [`Zusatzinformation - Art ${i + 1}`, `Zusatzinformation- Inhalt ${i + 1}`]).flat().slice(0, n);
/** Alle 125 Spaltennamen in DATEV-Schreibweise (Formatversion 13, wörtlich aus Doku und Muster) */
export const DATEV_COLUMNS: string[] = [
  'Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz', 'Kurs', 'Basis-Umsatz', 'WKZ Basis-Umsatz', 'Konto',
  'Gegenkonto (ohne BU-Schlüssel)', 'BU-Schlüssel', 'Belegdatum', 'Belegfeld 1', 'Belegfeld 2', 'Skonto', 'Buchungstext',
  'Postensperre', 'Diverse Adressnummer', 'Geschäftspartnerbank', 'Sachverhalt', 'Zinssperre', 'Beleglink',
  ...Array.from({ length: 8 }, (_, i) => [`Beleginfo - Art ${i + 1}`, `Beleginfo - Inhalt ${i + 1}`]).flat(),
  'KOST1 - Kostenstelle', 'KOST2 - Kostenstelle', 'Kost-Menge', 'EU-Land u. UStID (Bestimmung)', 'EU-Steuersatz (Bestimmung)',
  'Abw. Versteuerungsart', 'Sachverhalt L+L', 'Funktionsergänzung L+L', 'BU 49 Hauptfunktionstyp', 'BU 49 Hauptfunktionsnummer',
  'BU 49 Funktionsergänzung', ...zi(40), 'Stück', 'Gewicht', 'Zahlweise', 'Forderungsart', 'Veranlagungsjahr',
  'Zugeordnete Fälligkeit', 'Skontotyp', 'Auftragsnummer', 'Buchungstyp', 'USt-Schlüssel (Anzahlungen)', 'EU-Land (Anzahlungen)',
  'Sachverhalt L+L (Anzahlungen)', 'EU-Steuersatz (Anzahlungen)', 'Erlöskonto (Anzahlungen)', 'Herkunft-Kz', 'Buchungs GUID',
  'KOST-Datum', 'SEPA-Mandatsreferenz', 'Skontosperre', 'Gesellschaftername', 'Beteiligtennummer', 'Identifikationsnummer',
  'Zeichnernummer', 'Postensperre bis', 'Bezeichnung SoBil-Sachverhalt', 'Kennzeichen SoBil-Buchung', 'Festschreibung',
  'Leistungsdatum', 'Datum Zuord. Steuerperiode', 'Fälligkeit', 'Generalumkehr (GU)', 'Steuersatz', 'Land', 'Abrechnungsreferenz',
  'BVV-Position', 'EU-Land u. UStID (Ursprung)', 'EU-Steuersatz (Ursprung)', 'Abw. Skontokonto',
];

/** Belegfeld 1: nur A–Z 0–9 $ & % * + - / (DATEV), höchstens 36 Zeichen */
const belegfeld = (s: string) => s.toUpperCase().replace(/[^A-Z0-9$&%*+\-/]/g, '').slice(0, 36);

export function datevCsv(bookings: Booking[], from: string, to: string, acc: ResolvedAccounting, opts: { now: Date; label: string }): string {
  const ymd = (s: string) => s.replace(/-/g, '').slice(0, 8);
  const last = dayBefore(to);
  // Wirtschaftsjahr = Kalenderjahr (übliche Handwerksbetriebe); das Jahr des Belegdatums nimmt DATEV aus WJ-Beginn
  const head = [
    '"EXTF"', '700', '21', '"Buchungsstapel"', '13', stamp(opts.now), '', '"RE"', '"InstallateurDex"', '""',
    acc.beraterNr, acc.mandantNr, `${from.slice(0, 4)}0101`, String(acc.sachkontenlaenge), ymd(from), ymd(last),
    quoted(safeText(`Ausgangsrechnungen ${opts.label}`, 30)), '""', '1', '0', '0', '"EUR"', '', '""', '', '',
    `"${acc.kontenrahmen.slice(3)}"`, '', '', '""', '""',
  ].join(';');
  const lines = [head, DATEV_COLUMNS.join(';')];
  for (const b of bookings) {
    const f: string[] = new Array(DATEV_COLUMNS.length).fill('');
    f[0] = amount(Math.abs(b.grossCents));
    f[1] = b.grossCents >= 0 ? '"S"' : '"H"'; // aus Sicht des Debitors: Rechnung Soll, Storno/Abzug Haben
    f[2] = '"EUR"';
    f[6] = acc.debitor;
    f[7] = b.account;
    f[8] = '""'; // Automatikkonten (AM) rechnen die USt selbst — kein BU-Schlüssel
    f[9] = `${b.date.slice(8, 10)}${b.date.slice(5, 7)}`;
    f[10] = quoted(belegfeld(b.opNumber));
    f[11] = '""';
    f[13] = quoted(safeText(`${b.text} ${b.customer}`.replace(/;/g, ','), 60)); // ; auch in "…" meiden (einfache Importer)
    f[113] = '0'; // Festschreibung: nein (Steuerberater schreibt selbst fest)
    lines.push(f.join(';'));
  }
  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------------------------------------------
// BMD NTCS Buchungsimport (BuErf, Satzart 0)
// ---------------------------------------------------------------------------------------------------------------
export const BMD_COLUMNS = ['satzart', 'konto', 'gkonto', 'belegnr', 'belegdatum', 'buchdatum', 'buchsymbol', 'buchcode', 'prozent', 'steuercode', 'betrag', 'steuer', 'extbelegnr', 'zziel', 'gustokz', 'gustoorgbeleg', 'text'];
/** NTCS-Steuercodes laut BMD-Hilfe: 1 Umsatzsteuer, 16 Kleinunternehmer § 6 Abs. 1 Z 27, 27 Bauleistungen § 19 Abs. 1a */
const BMD_STEUERCODE: Record<string, string> = { rc: '27', klein: '16' };
/** BMD-Felder sind nicht in Anführungszeichen: Strichpunkt darf im Text nicht vorkommen */
const bmdText = (s: unknown, max: number) => safeText(String(s ?? '').replace(/;/g, ','), max);
/** belegnr nur aus Ziffern (OP-Nummer), höchstens 20 Stellen — „RE-2026-0042“ → „20260042“ */
const bmdBelegnr = (s: string) => s.replace(/\D/g, '').slice(-20);

export function bmdCsv(bookings: Booking[], acc: ResolvedAccounting): string {
  const de = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
  const lines = [BMD_COLUMNS.join(';')];
  for (const b of bookings) {
    const code = BMD_STEUERCODE[b.key] ?? (b.rate > 0 ? '1' : '17');
    lines.push([
      '0', acc.debitor, b.account, bmdBelegnr(b.opNumber), de(b.date), de(b.date), 'AR', '1', String(b.rate), code,
      // Ausgangsrechnung: Betrag brutto positiv, Steuer negativ; Storno/Gutschrift: nur Vorzeichen gedreht (BMD-Hilfe 1.2.2)
      amount(b.grossCents), amount(-b.vatCents), bmdText(b.number, 20), b.payDays == null ? '' : String(b.payDays),
      b.credit ? '2' : '', b.credit ? bmdText(b.opNumber, 20) : '', bmdText(`${b.text} ${b.customer}`, 255),
    ].join(';'));
  }
  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------------------------------------------
// Einstieg für App und Portal
// ---------------------------------------------------------------------------------------------------------------
export interface AccountingExport {
  text: string;
  /** Windows-1252-Bytes zum Speichern/Herunterladen */
  bytes: Uint8Array;
  fileName: string;
  /** Anzahl Buchungszeilen */
  count: number;
  warnings: string[];
}

export function accountingExport(
  format: 'datev' | 'bmd',
  rows: BookRow[],
  from: string,
  to: string,
  profile: { land: Land; accounting?: AccountingSettings },
  opts: { now: Date; label: string }
): AccountingExport {
  const acc = resolveAccounting(profile.land, profile.accounting);
  const { bookings, warnings } = buildBookings(rows, from, to, profile.land, acc);
  const missing = missingAccountingSetup(format, profile);
  if (missing.length) {
    warnings.unshift(
      format === 'datev'
        ? `Es fehlen noch: ${missing.join(', ')}. Ohne diese Nummern lehnt DATEV die Datei ab — bitte beim Steuerberater erfragen und in den Rechnungsdaten unter „Buchhaltung“ eintragen.`
        : `Kundenkonto noch nicht abgestimmt — die Datei verwendet ${acc.debitor}. Gibt es das Konto in BMD nicht, lehnt BMD die Buchungen ab. Bitte mit dem Steuerberater abstimmen.`
    );
  }
  if (format === 'datev' && acc.debitor.length !== acc.sachkontenlaenge + 1) {
    warnings.push(`Das Kundenkonto ${acc.debitor} hat ${acc.debitor.length} Stellen — bei Sachkontenlänge ${acc.sachkontenlaenge} erwartet DATEV ${acc.sachkontenlaenge + 1}-stellige Personenkonten.`);
  }
  const text = format === 'datev' ? datevCsv(bookings, from, to, acc, opts) : bmdCsv(bookings, acc);
  const safeLabel = opts.label.replace(/[^A-Za-z0-9-]/g, '');
  return {
    text,
    bytes: encodeWin1252(text),
    fileName: format === 'datev' ? `EXTF_Buchungsstapel_${safeLabel}.csv` : `BMD_Buchungen_${safeLabel}.csv`,
    count: bookings.length,
    warnings,
  };
}
