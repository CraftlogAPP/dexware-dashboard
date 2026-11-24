// WinterDex — Objekte aus einer Excel- oder CSV-Liste übernehmen (Dashboard, nur Inhaber). Reine Logik ohne React:
//   Datei (.xlsx/.csv) oder eingefügte Tabelle → Zeilen → Spalten erkennen → Plan (was angelegt wird, was nicht, warum).
// Regeln:
//  - Pflicht je Zeile ist die Adresse (Straße bzw. komplette Adresse); ohne sie wird die Zeile übersprungen.
//  - Fehlt der Name, heißt das Objekt wie die Straße mit Hausnummer.
//  - Gleicher Name + gleiche Adresse wie ein vorhandenes Objekt = „schon vorhanden“ (abgewählt) — ein zweiter Import
//    derselben Liste legt nichts doppelt an. Doppelte Zeilen in der Liste: nur die erste ist ausgewählt.
//  - Leere Pflichtzeiten bekommen die Vorgabe des gewählten Landes (wie die App beim neuen Objekt).
//  - Gratis: höchstens 2 aktive Objekte (wie die App). Der Server prüft das nicht — deshalb hält der Import es selbst ein.
// .xlsx wird ohne Zusatz-Bibliothek gelesen (ZIP + XML des ersten Tabellenblatts), .csv mit dem Leser des InstallateurDex-Imports —
// beides im gemeinsamen Baustein lib/tableImport.ts (auch für den Geräte-Import der Prüf-Apps).

import { norm } from '../installateurdex/importer';
import { toCsv } from '../installateurdex/csv';
import type { PropertyInput } from './api';
import { FREE_PROPERTIES } from './pro';
import { DUTY_DEFAULTS, type Land, type Property } from './types';

// Liste lesen (Datei / Einfügen → Tabelle) — gemeinsamer Baustein, unverändert aus diesem Import dorthin verschoben
import { cmpKey, dataRows, type Table } from '../lib/tableImport';
export {
  MAX_BYTES,
  MAX_ROWS,
  cmpKey,
  colIndex,
  colLetter,
  dataRows,
  readImportFile,
  readXlsx,
  readZipDirectory,
  tableFromBytes,
  tableFromPaste,
  type Table,
} from '../lib/tableImport';

const pad2 = (n: number) => String(n).padStart(2, '0');

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
  /** unsichere Überschriften: nur, wenn es keine Straßen-Spalte gibt (sonst ist „Standort“ eher „Nordseite“) */
  weak?: string[];
  /** Überschriften mit diesen Wortteilen nie über prefix/weak (z. B. „Adresse Hausverwaltung“) */
  notIf?: RegExp;
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
    exact: ['adresse', 'anschrift', 'objektadresse', 'objektanschrift', 'liegenschaftsadresse', 'vollstaendigeadresse'],
    prefix: ['adresse', 'anschrift'],
    weak: ['standort', 'postanschrift'],
    notIf: /kunde|verwalt|eigentuemer|besitzer|vermieter|auftraggeber|rechnung|kontakt|ansprech|mail|firma/,
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
  // Präfixe: Straße/Hausnummer schlagen eine nur so ähnlich benannte Adress-Spalte („Adresse Hausverwaltung“ ist
  // die Anschrift des Auftraggebers, nicht die des Objekts) — die Adresse gewinnt sonst beim Zusammensetzen.
  const loose = (f: FieldDef, k: string) => !(f.notIf?.test(k) ?? false) && !(f.key === 'address' && m.street !== undefined);
  const addressLast = [...FIELDS.filter((f) => f.key !== 'address'), ...FIELDS.filter((f) => f.key === 'address')];
  for (const f of addressLast) {
    if (m[f.key] !== undefined || !f.prefix) continue;
    const i = keys.findIndex((k, j) => !used.has(j) && loose(f, k) && f.prefix!.some((p) => k.startsWith(p)));
    if (i >= 0) take(f.key, i);
  }
  for (const f of addressLast) {
    if (m[f.key] !== undefined || !f.weak) continue;
    const i = keys.findIndex((k, j) => !used.has(j) && loose(f, k) && f.weak!.includes(k));
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

/** So weit unten wird die Überschriften-Zeile noch gesucht (darüber stehen oft Titel wie „Objektliste 2025/26“). */
const HEADER_SCAN = 10;

/**
 * Zeile mit den Überschriften: unter den ersten Zeilen die mit den meisten erkannten Spalten (mindestens zwei);
 * sonst die erste Zeile, wenn sie wie eine Überschrift aussieht. -1 = keine Überschriften.
 */
export function findHeaderRow(rows: string[][]): number {
  let best = -1;
  let bestN = 1;
  rows.slice(0, HEADER_SCAN).forEach((r, i) => {
    const n = Object.keys(guessMapping(r)).length;
    if (n > bestN) {
      best = i;
      bestN = n;
    }
  });
  if (best >= 0) return best;
  return rows.length && looksLikeHeader(rows[0]) ? 0 : -1;
}

export interface Layout {
  /** Tabelle ab der Überschriften-Zeile (Titelzeilen darüber weggelassen) */
  table: Table;
  hasHeader: boolean;
  mapping: Mapping;
  /** weggelassene Zeilen über den Überschriften */
  skipped: number;
}

/** Überschriften finden, Titelzeilen darüber weglassen, Spalten zuordnen. */
export function detectLayout(t: Table): Layout {
  const h = findHeaderRow(t.rows);
  const skipped = Math.max(0, h);
  const table = skipped ? { ...t, rows: t.rows.slice(skipped), lines: t.lines.slice(skipped) } : t;
  const hasHeader = h >= 0;
  return { table, hasHeader, mapping: mappingFor(table, hasHeader), skipped };
}

/** Zuordnung für die Tabelle (Schalter „Erste Zeile enthält Überschriften“). */
export function mappingFor(table: Pick<Table, 'rows' | 'lines'>, hasHeader: boolean): Mapping {
  const m = hasHeader ? guessMapping(table.rows[0] ?? []) : guessMappingFromData(table.rows);
  // „Räumung an Sonn- und Feiertagen“ mit ja/nein ist keine Uhrzeit — nur Spalten mit Zeiten als Pflichtzeiten
  const data = dataRows(table, hasHeader).slice(0, 50);
  for (const f of ['dutyAll', 'dutyMoFr', 'dutySa', 'dutySo'] as const) {
    const c = m[f];
    if (c === undefined) continue;
    const vals = data.map((r) => (r.cells[c] ?? '').trim()).filter(Boolean);
    if (vals.length && vals.filter((v) => /\d/.test(v)).length / vals.length < 0.5) delete m[f];
  }
  return m;
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
  const HOUSE_NO = /^\d{1,3}\s*[a-z]?(?:\s*[-/]\s*\d+\s*[a-z]?)*$/i;
  const TEXT = /^\D{3,}$/u;
  pick('address', /\d+\s*[a-z]?\s*,\s*(?:[A-Z]{1,2}-)?\d{4,5}\s+\p{L}/iu);
  pick('zip', /^(?:[A-Z]{1,2}-)?\d{4,5}$/i);
  if (m.address === undefined) pick('street', /^\D{3,}\s\d+\s*[a-z]?(?:\s*[-/]\s*\d+\s*[a-z]?)*$/iu);
  if (m.street !== undefined) pick('houseNo', HOUSE_NO, m.street + 1);
  else if (m.address === undefined) {
    // Straße und Hausnummer getrennt: die Straße ist die Text-Spalte direkt links der Nummern-Spalte
    // (nicht einfach die erste Text-Spalte — das wäre meist der Name; eine laufende Nummer ganz vorne zählt nicht)
    for (let i = 1; i < cols; i++) {
      if (!used.has(i) && !used.has(i - 1) && share(i, HOUSE_NO) >= 0.6 && share(i - 1, TEXT) >= 0.6) {
        m.street = i - 1;
        m.houseNo = i;
        used.add(i - 1);
        used.add(i);
        break;
      }
    }
  }
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


// ---------------------------------------------------------------------------
// Werte
// ---------------------------------------------------------------------------

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

/**
 * Gleiches Objekt? Gleicher Name und gleiche Adresse (Vergleichsform aus cmpKey). Bei einer darf PLZ/Ort fehlen
 * („Hauptplatz 1“ = „Hauptplatz 1, 8200 Gleisdorf“) — eine andere Hausnummer („5/2“, „5-7“) ist aber ein anderes Objekt.
 */
export function sameAddress(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!long.startsWith(short + ' ')) return false;
  const rest = long.slice(short.length + 1);
  return /^(?:(?:a|d|ch) )?\d{4,5}(?: |$)/.test(rest) || /^[a-z]{3,}(?: [a-z]+)*$/.test(rest);
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
    // PLZ und Ort getrennt prüfen: in „Gnas 52“ steht der Ort schon, die PLZ fehlt aber → „Gnas 52, 8342 Gnas“
    const extra = zip && !known(zip) ? zipCity : city && !known(city) ? city : '';
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
