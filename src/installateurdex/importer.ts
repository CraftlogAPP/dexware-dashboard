// CSV-Import von Kunden/Objekten + Anlagen (kostenlos, nur Inhaber). Reine Logik ohne React:
// Datei lesen → Spalten erkennen → Anlagentypen zuordnen → Zeilen prüfen → Plan (was neu angelegt wird).
// Regeln:
//  - Objekte mit gleichem Kunden + gleicher Adresse werden zusammengefasst (auch mit bestehenden Objekten).
//  - Anlagen, die es schon gibt (gleiche Seriennummer im Betrieb oder gleiche Nummer am Objekt), werden
//    übersprungen — ein zweiter Import derselben Datei legt nichts doppelt an.
//  - Fehlerhafte Zeilen werden nicht importiert, aber einzeln mit Grund angezeigt.
//  - Gratis-Tarif: höchstens 3 Anlagen insgesamt (wie gateItem in der App) — Hinweis statt Abschneiden.

import { toCsv } from './csv';
import type { NewAsset, NewSite } from './data';
import { ITEM_KINDS, kindInfo, kindPrefix, validCustomerEmail, type Asset, type ItemKind, type Site } from './types';

// ---------------------------------------------------------------------------
// Datei lesen
// ---------------------------------------------------------------------------
/** UTF-8 (mit/ohne BOM); ist die Datei kein gültiges UTF-8 (Excel „CSV (Trennzeichen-getrennt)"), Windows-1252. */
export function decodeCsv(buf: ArrayBuffer): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'windows-1252' };
  }
}

/** Trennzeichen aus der ersten Zeile (außerhalb von Anführungszeichen): ; , oder Tab. */
function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in counts) counts[ch] += 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ';';
}

/** CSV nach RFC 4180 (Anführungszeichen, "" im Feld, Zeilenumbrüche im Feld). Leere Zeilen fallen weg. */
export function parseCsv(text: string): { delimiter: string; rows: string[][] } {
  const src = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(src);
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
  return { delimiter, rows: rows.map((r) => r.map(cleanCell)).filter((r) => r.some((c) => c !== '')) };
}

/** Trimmen; ein von Excel bzw. unserem Export vorangestelltes ' vor = + - @ entfernen. */
function cleanCell(c: string): string {
  const t = c.trim();
  return /^'[=+\-@]/.test(t) ? t.slice(1) : t;
}

// ---------------------------------------------------------------------------
// Felder + automatische Spalten-Erkennung
// ---------------------------------------------------------------------------
export type FieldKey =
  | 'customer'
  | 'site'
  | 'street'
  | 'zip'
  | 'city'
  | 'phone'
  | 'email'
  | 'assetNo'
  | 'kind'
  | 'manufacturer'
  | 'model'
  | 'serial'
  | 'buildYear'
  | 'installDate'
  | 'interval'
  | 'contract';

export interface FieldDef {
  key: FieldKey;
  label: string;
  hint?: string;
  group: 'site' | 'asset';
  synonyms: string[];
}

export const FIELDS: FieldDef[] = [
  { key: 'customer', label: 'Kunde', group: 'site', synonyms: ['kunde', 'kundenname', 'name', 'auftraggeber', 'eigentuemer', 'besitzer', 'kundename'] },
  { key: 'site', label: 'Objekt', hint: 'z. B. „EFH Huber" — leer: Adresse bzw. Kunde', group: 'site', synonyms: ['objekt', 'objektname', 'objektbezeichnung', 'gebaeude', 'standort', 'liegenschaft'] },
  { key: 'street', label: 'Adresse / Straße', group: 'site', synonyms: ['adresse', 'anschrift', 'strasse', 'strassehausnummer', 'strassenr', 'str'] },
  { key: 'zip', label: 'PLZ', hint: 'optional, wird an die Adresse angehängt', group: 'site', synonyms: ['plz', 'postleitzahl'] },
  { key: 'city', label: 'Ort', hint: 'optional, wird an die Adresse angehängt', group: 'site', synonyms: ['ort', 'stadt', 'gemeinde', 'wohnort'] },
  { key: 'phone', label: 'Telefon', group: 'site', synonyms: ['telefon', 'tel', 'telefonnummer', 'handy', 'mobil', 'mobilnummer', 'phone', 'telnr'] },
  { key: 'email', label: 'E-Mail', hint: 'für Erinnerungsmails — die Zustimmung des Kunden holst du in der App ein', group: 'site', synonyms: ['email', 'mail', 'emailadresse', 'mailadresse'] },
  { key: 'assetNo', label: 'Anlagen-Nr.', hint: 'leer: automatisch wie in der App (z. B. WP-001)', group: 'asset', synonyms: ['anlagennr', 'anlagennummer', 'anlage', 'nr', 'nummer', 'bezeichnung', 'geraet', 'geraetenr'] },
  { key: 'kind', label: 'Typ', hint: 'Freitext wie „Wärmepumpe" oder „Therme" — Zuordnung im nächsten Schritt', group: 'asset', synonyms: ['typ', 'anlagentyp', 'art', 'anlagenart', 'geraeteart', 'geraetetyp', 'kategorie'] },
  { key: 'manufacturer', label: 'Hersteller', group: 'asset', synonyms: ['hersteller', 'marke', 'fabrikat'] },
  { key: 'model', label: 'Modell', group: 'asset', synonyms: ['modell', 'typenbezeichnung', 'modellbezeichnung', 'geraetemodell'] },
  { key: 'serial', label: 'Seriennr.', group: 'asset', synonyms: ['seriennr', 'seriennummer', 'sn', 'fabriknummer', 'serial', 'serialnumber', 'fabriknr'] },
  { key: 'buildYear', label: 'Baujahr', group: 'asset', synonyms: ['baujahr', 'bj'] },
  { key: 'installDate', label: 'In Betrieb seit', hint: 'TT.MM.JJJJ', group: 'asset', synonyms: ['inbetriebseit', 'inbetriebnahme', 'inbetriebnahmedatum', 'ibn', 'installiert', 'einbaudatum', 'montagedatum', 'einbau'] },
  { key: 'interval', label: 'Intervall (Monate)', hint: 'leer: Standard des Anlagentyps', group: 'asset', synonyms: ['intervall', 'intervallmonate', 'wartungsintervall', 'monate', 'wartungsintervallmonate'] },
  { key: 'contract', label: 'Vertrag', hint: 'ja/nein oder Vertragspreis in €', group: 'asset', synonyms: ['vertrag', 'wartungsvertrag', 'wv', 'vertragspreis'] },
];

export type Mapping = Partial<Record<FieldKey, number>>;

/** Für Vergleiche: klein, Umlaute ausgeschrieben, ß → ss. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .trim();
}

const headerKey = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');

/** Spalten anhand der Überschriften zuordnen (jede Spalte höchstens einmal). */
export function guessMapping(header: string[]): Mapping {
  const keys = header.map(headerKey);
  const used = new Set<number>();
  const m: Mapping = {};
  for (const f of FIELDS) {
    const idx = keys.findIndex((k, i) => !used.has(i) && f.synonyms.includes(k));
    if (idx >= 0) {
      m[f.key] = idx;
      used.add(idx);
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
// Anlagentyp aus Freitext
// ---------------------------------------------------------------------------
// Erst die eindeutigen Begriffe; nur wenn keiner passt, die allgemeinen (Wärmepumpe, Klima, Therme …).
// Passen mehrere Typen, wird nachgefragt.
const KIND_RULES: { words: string[]; kinds: ItemKind[]; generic?: boolean }[] = [
  { words: ['sole', 'erdwaerme', 'tiefenbohrung', 'flaechenkollektor', 'grundwasser', 'wasser/wasser', 'geotherm'], kinds: ['hp_brine'] },
  { words: ['luft/wasser', 'luft-wasser', 'luftwasser', 'luftwaerme', 'lwwp', 'lwp'], kinds: ['hp_air'] },
  { words: ['brauchwasser'], kinds: ['hp_air', 'dhw_tank'] },
  { words: ['multisplit', 'multi-split', 'multi split', 'vrf', 'vrv'], kinds: ['ac_multi'] },
  { words: ['gas'], kinds: ['gas'] },
  { words: ['oel', 'heizoel'], kinds: ['oil'] },
  { words: ['pellet', 'holz', 'hackgut', 'hackschnitzel', 'biomasse'], kinds: ['pellet'] },
  { words: ['fernwaerme', 'nahwaerme', 'uebergabestation'], kinds: ['district'] },
  { words: ['speicher', 'boiler', 'warmwasser', 'trinkwasser'], kinds: ['dhw_tank'] },
  { words: ['puffer'], kinds: ['dhw_tank', 'other'] },
  { words: ['solar', 'kollektor'], kinds: ['solar'] },
  { words: ['lueftung', 'kwl', 'wohnraumlueftung', 'komfortlueftung'], kinds: ['ventilation'] },
  { words: ['enthaert', 'entkalk', 'weichwasser', 'wasseraufbereitung'], kinds: ['softener'] },
  { words: ['filter', 'rueckspuel'], kinds: ['filter'] },
  { words: ['druckerhoehung', 'hauswasserwerk'], kinds: ['booster'] },
  { words: ['hebeanlage', 'abwasserhebe', 'faekalien', 'pumpensumpf'], kinds: ['lifting'] },
  { words: ['sonstig', 'andere'], kinds: ['other'] },
  // allgemein
  { words: ['waermepumpe', 'wp'], kinds: ['hp_air'], generic: true },
  { words: ['klima', 'split'], kinds: ['ac_split'], generic: true },
  { words: ['therme', 'brennwert'], kinds: ['gas'], generic: true },
  { words: ['kessel', 'heizung', 'heizkessel'], kinds: ['gas', 'oil', 'pellet'], generic: true },
];

function hasWord(text: string, w: string): boolean {
  // Kurze Kürzel (wp, kwl, vrf …) nur als eigenes Wort, längere Begriffe auch innerhalb von Wörtern.
  if (w.length <= 3) return new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(text);
  return text.includes(w);
}

export interface KindGuess {
  kind?: ItemKind;
  candidates: ItemKind[];
}

export function guessKind(raw: string): KindGuess {
  const t = norm(raw);
  if (!t) return { candidates: [] };
  // genau ein Typ-Kürzel oder eine Typ-Bezeichnung aus der App
  const exact = ITEM_KINDS.find((k) => k.id === t || norm(k.label) === t);
  if (exact) return { kind: exact.id, candidates: [exact.id] };
  const collect = (generic: boolean) => {
    const set = new Set<ItemKind>();
    for (const r of KIND_RULES) if (!!r.generic === generic && r.words.some((w) => hasWord(t, w))) r.kinds.forEach((k) => set.add(k));
    return [...set];
  };
  let candidates = collect(false);
  if (!candidates.length) candidates = collect(true);
  return candidates.length === 1 ? { kind: candidates[0], candidates } : { candidates };
}

/** Schlüssel für die Typ-Zuordnung (leere Zellen gemeinsam). */
export const EMPTY_KIND = '(leer)';
export const kindKey = (raw: string) => (raw.trim() ? raw.trim() : EMPTY_KIND);

// ---------------------------------------------------------------------------
// Werte prüfen
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** TT.MM.JJJJ · T.M.JJ · JJJJ-MM-TT · MM/JJJJ · JJJJ · Excel-Seriennummer → yyyy-mm-dd. */
export function parseDate(raw: string, now = new Date()): { value: string | null; error?: string; note?: string } {
  const s = raw.trim();
  if (!s) return { value: null };
  let iso: string | null = null;
  let note: string | undefined;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s))) {
    let y = Number(m[3]);
    if (m[3].length === 2) y += y <= now.getFullYear() % 100 ? 2000 : 1900;
    iso = validDate(y, Number(m[2]), Number(m[1]));
  } else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(s))) {
    iso = validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  } else if ((m = /^(\d{1,2})[./](\d{4})$/.exec(s))) {
    iso = validDate(Number(m[2]), Number(m[1]), 1);
    note = 'nur Monat angegeben — der 1. wird angenommen';
  } else if ((m = /^(\d{4})$/.exec(s))) {
    iso = validDate(Number(m[1]), 1, 1);
    note = 'nur Jahr angegeben — der 1.1. wird angenommen';
  } else if ((m = /^(\d{5})$/.exec(s)) && Number(m[1]) > 20000 && Number(m[1]) < 80000) {
    // Excel-Seriennummer (Tage seit 30.12.1899)
    const d = new Date(Date.UTC(1899, 11, 30) + Number(m[1]) * 86_400_000);
    iso = validDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (!iso) return { value: null, error: `Datum „${s}" nicht erkannt (bitte TT.MM.JJJJ)` };
  const y = Number(iso.slice(0, 4));
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (y < 1950) return { value: null, error: `Datum „${s}" liegt zu weit zurück` };
  if (iso > today) return { value: null, error: `Datum „${s}" liegt in der Zukunft` };
  return { value: iso, note };
}

/** „12" · „12 Monate" · „1 Jahr" · „2 Jahre" · „jährlich" · „halbjährlich" → Monate (1–120). */
export function parseInterval(raw: string): { value: number | null; error?: string } {
  const s = norm(raw).replace(/\s+/g, ' ');
  if (!s) return { value: null };
  let months: number | undefined;
  if (s === 'jaehrlich' || s === 'einmal im jahr') months = 12;
  else if (s === 'halbjaehrlich') months = 6;
  else if (s === 'vierteljaehrlich' || s === 'quartalsweise') months = 3;
  else if (s === 'monatlich') months = 1;
  else {
    const m = /^(?:alle )?(\d{1,3})(?:[.,]0+)? ?(m|mon|monat|monate|j|jahr|jahre)?$/.exec(s);
    if (m) months = m[2] && m[2].startsWith('j') ? Number(m[1]) * 12 : Number(m[1]);
  }
  if (months === undefined || !Number.isInteger(months) || months < 1 || months > 120) {
    return { value: null, error: `Intervall „${raw.trim()}" nicht erkannt (Monate, 1–120)` };
  }
  return { value: months };
}

/** „ja/nein/x/1/0" oder ein Preis („190", „189,50 €") → Vertrag + Vertragspreis. */
export function parseContract(raw: string): { contract: boolean; price: number | null; error?: string } {
  const s = norm(raw);
  if (!s || ['nein', 'n', '0', 'false', 'falsch', 'no', '-', 'kein', 'ohne'].includes(s)) return { contract: false, price: null };
  if (['ja', 'j', 'x', '1', 'true', 'wahr', 'yes', 'vertrag', 'wv', 'wartungsvertrag'].includes(s)) return { contract: true, price: null };
  let p = s.replace(/€|eur|euro/g, '').replace(/\s/g, '');
  if (p.includes(',')) p = p.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(p)) p = p.replace(/\./g, '');
  if (/^\d+(\.\d{1,2})?$/.test(p)) {
    const n = Math.round(Number(p) * 100) / 100;
    if (n >= 0 && n < 100000) return { contract: true, price: n };
  }
  return { contract: false, price: null, error: `Vertrag „${raw.trim()}" nicht erkannt (ja/nein oder Preis)` };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------
export interface PlanRow {
  /** Zeilennummer in der Datei (1 = erste Zeile) */
  line: number;
  status: 'ok' | 'error' | 'skip';
  errors: string[];
  notes: string[];
  customer: string;
  siteName: string;
  address: string;
  siteNew: boolean;
  asset: { name: string; kind: ItemKind; maker: string } | null;
  /** new = wird angelegt · exists = gibt es schon · none = Zeile ohne Anlage */
  assetAction: 'new' | 'exists' | 'none';
}

export interface Plan {
  rows: PlanRow[];
  newSites: NewSite[];
  newAssets: NewAsset[];
  reusedSites: number;
  skippedAssets: number;
  errorRows: number;
  /** Gratis-Grenze überschritten (nur wenn Anlagen importiert werden sollen) */
  overLimit: { existing: number; adding: number; limit: number } | null;
}

export interface PlanInput {
  rows: string[][];
  hasHeader: boolean;
  mapping: Mapping;
  kindMap: Record<string, ItemKind | ''>;
  orgId: string;
  existingSites: Site[];
  existingAssets: Asset[];
  /** null = Pro (unbegrenzt), sonst Höchstzahl aktiver Anlagen (Gratis: 3) */
  assetLimit: number | null;
  /** nur Kunden/Objekte, keine Anlagen */
  sitesOnly: boolean;
  newId?: () => string;
}

const siteKey = (customer: string, address: string, name: string) =>
  `${norm(customer).replace(/\s+/g, ' ')}|${norm(address || name).replace(/[\s,]+/g, ' ')}`;

export function buildPlan(input: PlanInput): Plan {
  const newId = input.newId ?? (() => crypto.randomUUID());
  const data = input.hasHeader ? input.rows.slice(1) : input.rows;
  const offset = input.hasHeader ? 2 : 1;
  const get = (row: string[], f: FieldKey) => {
    const i = input.mapping[f];
    return i === undefined ? '' : (row[i] ?? '').trim();
  };

  // Bestehende Objekte (ohne Beispieldaten) nach Kunde+Adresse
  const sitesByKey = new Map<string, { id: string; isNew: boolean }>();
  for (const s of input.existingSites) {
    if (s.is_demo) continue;
    sitesByKey.set(siteKey(s.operator_name ?? '', s.address, s.name), { id: s.id, isNew: false });
  }
  const serialsInOrg = new Set(input.existingAssets.filter((a) => a.serial_no).map((a) => norm(a.serial_no!)));
  const namesBySite = new Map<string, Set<string>>();
  // Zeilen ohne Nummer und Seriennummer erkennt der zweite Import an Objekt + Typ + Hersteller + Modell +
  // Baujahr. Jede bestehende Anlage zählt nur einmal (zwei gleiche Klimageräte bleiben zwei).
  const sig = (siteId: string, kind: string, maker: string, model: string, by: string) =>
    [siteId, kind, norm(maker), norm(model), by.trim()].join('|');
  const sigLeft = new Map<string, number>();
  for (const a of input.existingAssets) {
    if (!namesBySite.has(a.site_id)) namesBySite.set(a.site_id, new Set());
    namesBySite.get(a.site_id)!.add(norm(a.name));
    const k = sig(a.site_id, a.kind, a.manufacturer ?? '', a.model ?? '', a.build_year ?? '');
    sigLeft.set(k, (sigLeft.get(k) ?? 0) + 1);
  }

  const newSites: NewSite[] = [];
  const newAssets: NewAsset[] = [];
  const out: PlanRow[] = [];
  const fileSerials = new Map<string, number>();
  const fileNames = new Map<string, number>();
  let reusedSites = 0;
  const reusedSet = new Set<string>();
  let skippedAssets = 0;

  data.forEach((row, idx) => {
    const line = idx + offset;
    const errors: string[] = [];
    const notes: string[] = [];
    const customer = get(row, 'customer').slice(0, 160);
    const street = get(row, 'street');
    const zipCity = [get(row, 'zip'), get(row, 'city')].filter(Boolean).join(' ');
    const address = [street, zipCity].filter(Boolean).join(', ').slice(0, 240);
    const siteName = (get(row, 'site') || street || customer || zipCity).slice(0, 160);
    const phone = get(row, 'phone').slice(0, 60);
    const email = get(row, 'email');

    if (!customer && !get(row, 'site') && !address) errors.push('Kein Kunde, kein Objekt und keine Adresse');
    if (email && !validCustomerEmail(email)) {
      errors.push(
        /[?&#<>"]/.test(email)
          ? `E-Mail „${email}" enthält ein unzulässiges Zeichen (? & # < > ")`
          : `E-Mail „${email}" sieht nicht richtig aus`,
      );
    }

    // Anlage?
    const assetCells = (['assetNo', 'kind', 'manufacturer', 'model', 'serial', 'buildYear', 'installDate', 'interval', 'contract'] as FieldKey[]).some(
      (f) => get(row, f) !== '',
    );
    const wantAsset = assetCells && !input.sitesOnly;
    let kind: ItemKind | '' = '';
    let installDate: string | null = null;
    let interval: number | null = null;
    let contract = { contract: false, price: null as number | null };
    let buildYear: string | null = null;
    const serial = get(row, 'serial').slice(0, 80);
    if (wantAsset) {
      const kText = get(row, 'kind');
      kind = input.kindMap[kindKey(kText)] ?? '';
      if (!kind) errors.push(`Anlagentyp „${kText || 'leer'}" noch nicht zugeordnet`);
      const by = get(row, 'buildYear').replace(/\.0+$/, '');
      if (by) {
        const n = Number(by);
        if (!/^\d{4}$/.test(by) || n < 1900 || n > new Date().getFullYear() + 1) errors.push(`Baujahr „${by}" ungültig`);
        else buildYear = by;
      }
      const d = parseDate(get(row, 'installDate'));
      if (d.error) errors.push(d.error);
      else {
        installDate = d.value;
        if (d.note) notes.push(`In Betrieb seit: ${d.note}`);
      }
      const iv = parseInterval(get(row, 'interval'));
      if (iv.error) errors.push(iv.error);
      else interval = iv.value;
      const c = parseContract(get(row, 'contract'));
      if (c.error) errors.push(c.error);
      else contract = c;
    }

    const key = siteKey(customer, address, siteName);
    const known = sitesByKey.get(key);
    const plan: PlanRow = {
      line,
      status: 'ok',
      errors,
      notes,
      customer,
      siteName,
      address,
      siteNew: !known || known.isNew,
      asset: null,
      assetAction: wantAsset ? 'new' : 'none',
    };

    if (errors.length) {
      plan.status = 'error';
      if (wantAsset) plan.asset = { name: get(row, 'assetNo') || '—', kind: kind || 'other', maker: get(row, 'manufacturer') };
      out.push(plan);
      return;
    }

    // Objekt: bestehendes/schon geplantes nutzen oder neu anlegen — angelegt wird es erst, wenn die
    // Zeile angenommen ist (commitSite), damit fehlerhafte Zeilen keine leeren Objekte hinterlassen.
    const siteId = known ? known.id : newId();
    const commitSite = () => {
      if (!known) {
        sitesByKey.set(key, { id: siteId, isNew: true });
        newSites.push({
          id: siteId,
          org_id: input.orgId,
          name: siteName,
          address,
          operator_name: customer || null,
          operator_contact: phone || email || null,
          customer_email: email || null,
        });
      } else if (!known.isNew && !reusedSet.has(siteId)) {
        reusedSet.add(siteId);
        reusedSites += 1;
      }
    };

    if (!wantAsset) {
      if (known && !known.isNew) {
        plan.status = 'skip';
        notes.push('Objekt gibt es schon');
      }
      commitSite();
      out.push(plan);
      return;
    }

    // Anlage: Dubletten erkennen, Nummer vergeben
    const k = kind as ItemKind;
    const names = namesBySite.get(siteId) ?? new Set<string>();
    namesBySite.set(siteId, names);
    let name = get(row, 'assetNo').slice(0, 60);
    const serialKey = serial ? norm(serial) : '';
    if (serialKey && fileSerials.has(serialKey)) {
      plan.status = 'error';
      errors.push(`Seriennummer doppelt in der Datei (auch Zeile ${fileSerials.get(serialKey)})`);
    } else if (name && fileNames.has(`${siteId}|${norm(name)}`)) {
      plan.status = 'error';
      errors.push(`Anlagen-Nr. „${name}" doppelt am selben Objekt (auch Zeile ${fileNames.get(`${siteId}|${norm(name)}`)})`);
    } else if ((serialKey && serialsInOrg.has(serialKey)) || (name && names.has(norm(name)))) {
      plan.status = 'skip';
      plan.assetAction = 'exists';
      notes.push(serialKey && serialsInOrg.has(serialKey) ? 'Anlage mit dieser Seriennummer gibt es schon' : 'Anlage mit dieser Nummer gibt es am Objekt schon');
      skippedAssets += 1;
    } else if (!name && !serialKey) {
      const s = sig(siteId, k, get(row, 'manufacturer'), get(row, 'model'), buildYear ?? '');
      const left = sigLeft.get(s) ?? 0;
      if (left > 0) {
        sigLeft.set(s, left - 1);
        plan.status = 'skip';
        plan.assetAction = 'exists';
        notes.push('Gleiche Anlage (Typ, Hersteller, Modell, Baujahr) gibt es am Objekt schon');
        skippedAssets += 1;
      }
    }
    if (plan.status === 'error') {
      plan.asset = { name: name || '—', kind: k, maker: get(row, 'manufacturer') };
      out.push(plan);
      return;
    }
    if (!name && plan.status !== 'skip') {
      // Nächste freie Nummer je Kurzzeichen am Objekt — wie nextNumber in der App
      const prefix = kindPrefix(k);
      const re = new RegExp(`^${prefix.toLowerCase()}-(\\d+)$`);
      let max = 0;
      for (const n of names) {
        const mm = re.exec(n);
        if (mm) max = Math.max(max, parseInt(mm[1], 10));
      }
      name = `${prefix}-${String(max + 1).padStart(3, '0')}`;
      notes.push(`Nummer automatisch: ${name}`);
    }
    plan.asset = { name: name || '—', kind: k, maker: [get(row, 'manufacturer'), get(row, 'model')].filter(Boolean).join(' ') };
    commitSite();
    if (plan.status === 'skip') {
      out.push(plan);
      return;
    }
    names.add(norm(name));
    if (serialKey) fileSerials.set(serialKey, line);
    fileNames.set(`${siteId}|${norm(name)}`, line);
    if (contract.contract && contract.price !== null) {
      notes.push(`Vertragspreis ${contract.price.toLocaleString('de-DE', { minimumFractionDigits: Number.isInteger(contract.price) ? 0 : 2 })} €`);
    }
    newAssets.push({
      id: newId(),
      org_id: input.orgId,
      site_id: siteId,
      name,
      kind: k,
      manufacturer: get(row, 'manufacturer').slice(0, 80) || null,
      model: get(row, 'model').slice(0, 80) || null,
      serial_no: serial || null,
      build_year: buildYear,
      install_date: installDate,
      interval_months: interval,
      contract: contract.contract,
      contract_price: contract.contract ? contract.price : null,
    });
    out.push(plan);
  });

  const existing = input.existingAssets.filter((a) => !a.retired && !a.is_demo).length;
  const overLimit =
    !input.sitesOnly && input.assetLimit !== null && newAssets.length > 0 && existing + newAssets.length > input.assetLimit
      ? { existing, adding: newAssets.length, limit: input.assetLimit }
      : null;

  return {
    rows: out,
    newSites,
    newAssets,
    reusedSites,
    skippedAssets,
    errorRows: out.filter((r) => r.status === 'error').length,
    overLimit,
  };
}

/** Typ-Texte der Datei mit Häufigkeit und Vorschlag (für die Zuordnungs-Tabelle). */
export function kindValues(rows: string[][], hasHeader: boolean, mapping: Mapping): { key: string; count: number; guess: KindGuess }[] {
  const i = mapping.kind;
  const data = hasHeader ? rows.slice(1) : rows;
  const counts = new Map<string, number>();
  const assetCols: FieldKey[] = ['assetNo', 'kind', 'manufacturer', 'model', 'serial', 'buildYear', 'installDate', 'interval', 'contract'];
  for (const r of data) {
    // nur Zeilen mit Anlage
    if (!assetCols.some((f) => mapping[f] !== undefined && (r[mapping[f]!] ?? '').trim() !== '')) continue;
    const k = kindKey(i === undefined ? '' : (r[i] ?? ''));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, guess: key === EMPTY_KIND ? { candidates: [] } : guessKind(key) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'de'));
}

/** Muster-CSV (Semikolon, UTF-8 mit BOM) — die Überschriften erkennt der Import von selbst. */
export function sampleCsv(): string {
  return toCsv(
    ['Kunde', 'Objekt', 'Straße', 'PLZ', 'Ort', 'Telefon', 'E-Mail', 'Anlagen-Nr.', 'Typ', 'Hersteller', 'Modell', 'Seriennr.', 'Baujahr', 'In Betrieb seit', 'Intervall (Monate)', 'Vertrag'],
    [
      ['Familie Muster', 'EFH Muster', 'Musterweg 1', '7000', 'Musterstadt', '0660 0000000', 'muster@example.com', 'WP-001', 'Luft/Wasser-Wärmepumpe', 'Musterwerk', 'AirHeat 9', 'MW-123', '2023', '15.04.2023', '12', 'ja'],
      ['Familie Muster', 'EFH Muster', 'Musterweg 1', '7000', 'Musterstadt', '', '', '', 'Warmwasserspeicher', 'Musterwerk', 'Speicher 300 l', '', '2015', '', '24', 'nein'],
      ['Hausverwaltung Beispiel', 'Wohnanlage Beispielgasse 5', 'Beispielgasse 5', '7100', 'Beispielort', '', 'verwaltung@example.com', 'GT-001', 'Gastherme', 'Musterwerk', 'Condens 35', 'MW-C35-1', '2016', '01.10.2016', '12', '190'],
    ],
  );
}

/** Lesbare Typ-Liste für Auswahlfelder. */
export const KIND_OPTIONS = ITEM_KINDS.map((k) => ({ value: k.id, label: `${k.emoji} ${k.label}` }));
export const kindLabel = (k: ItemKind) => `${kindInfo(k).emoji} ${kindInfo(k).label}`;
