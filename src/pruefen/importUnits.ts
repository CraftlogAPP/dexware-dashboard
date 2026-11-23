// Prüf-Apps — Geräte (Leitern, Teile …) aus einer Excel-/CSV-Liste übernehmen. Gegenstück zum Prüfbuch-Export
// (lib/pruefExport.ts): dessen Spalten werden wieder erkannt. Reine Logik ohne React; Oberfläche components/ImportWizard.tsx,
// Lesen der Liste lib/tableImport.ts. Je App nur ein Adapter (src/<app>/importUnits.ts) mit den Stammdaten-Feldern.
//
// Regeln (wie der WinterDex-Import, angepasst auf Geräte):
//  - Pflicht je Zeile ist die Bezeichnung. Zeilen mit „ausgesondert: ja“ werden nicht übernommen.
//  - Standort-Spalte: Name gegen die vorhandenen Standorte (Vergleichsform cmpKey). Unbekannte Namen werden als neue
//    Standorte mit angelegt (Adresse aus „Standort-Adresse“). Ohne Standort-Spalte — oder bei leerer Zelle — gilt der
//    gewählte Standort aus der Liste über der Vorschau.
//  - Gleiche Bezeichnung am selben Standort = „schon vorhanden“ (abgewählt); haben beide eine Seriennummer, entscheidet
//    sie. Doppelte Zeilen in der Liste: nur die erste ist angehakt.
//  - „Letzte Prüfung“ legt KEINE Prüfung an (Prüfungen sind Nachweise mit GPS-Stempel und Prüfcode und entstehen nur in
//    der App bzw. „Vor Ort“) — sie kommt als Vermerk in die Notizen. Neue Geräte stehen auf „noch nie geprüft“.
//  - Gratis-Grenze wie beim Anlegen von Hand (pruefen/pro.ts → unitGate): höchstens so viele, wie ohne Pro noch gehen.
//  - Geschrieben wird EXAKT wie das Formular (Zeilen-Funktionen der api.ts der App), mit festen ids, Standorte zuerst.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Org } from '../lib/orgApi';
import {
  cap,
  cellOf,
  cmpKey,
  countStatus,
  dataRows,
  headerKey,
  insertInChunks,
  oneLine,
  parseDay,
  yesNo,
  type ImportAdapter,
  type ImportField,
  type ImportPlan,
  type ImportPlanRow,
  type ImportResult,
  type InsertFailure,
  type Mapping,
  type Table,
} from '../lib/tableImport';
import { downloadXlsx, type XlsxSheet } from '../lib/xlsx';
import { siteFkOf, wordsOf, type PruefConfig } from './config';
import { fetchOrgPro, gateText, unitGate } from './pro';

/** Felder, die jeder Geräte-Import hat (Schlüssel in der Zuordnung) */
export const BASE = { name: 'name', site: 'site', siteAddress: 'siteAddress', notes: 'notes', last: 'lastInspection', retired: 'retired' } as const;

/** Was der Import von einem Standort braucht (die Site-Typen der Apps passen so, wie sie sind) */
export interface ImportSite {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}

/** Je App: Felder, Auswahl-Werte, Beispielzeilen (src/<app>/importUnits.ts). */
export interface UnitImportSpec<U, I> {
  cfg: PruefConfig;
  /** wie im Prüfbuch-Export: Kurzname der Fälligkeits-Prüfung und Spalte „außer Betrieb“ (Rundweg Export → Import) */
  dueName: string;
  retiredHeader: string;
  /** Wortlaut des Namensfelds wie im Formular, z. B. „Bezeichnung“ */
  nameLabel: string;
  /** weitere Überschriften für die Bezeichnung (headerKey-Form) */
  nameHeaders?: string[];
  /** Stammdaten-Felder der App — Überschriften des Formulars und des Prüfbuch-Exports */
  fields: ImportField[];
  /** Feld mit der Serien-/Inventarnummer (Dubletten); ohne: nur die Bezeichnung */
  serialKey?: string;
  /** Serien-/Inventarnummer einer vorhandenen Einheit */
  serialOf?(unit: U): string | null;
  /** Zeile → Stammdaten der App (ohne Standort, Notizen, außer Betrieb) + Hinweise für die Vorschau */
  build(get: (key: string) => string, headerOf: (key: string) => string): { input: I; hints: string[] };
  /** Unterzeile in der Vorschau, z. B. „Stehleiter · Aluminium · Zarges“ */
  describe(input: I): string;
  /** Beispielzeilen der Vorlage (Feld-Schlüssel → Wert) */
  example: Record<string, string>[];
}

/** Je App: Lesen und Schreiben über die api.ts der App — Zeilen GENAU wie beim Anlegen von Hand. */
export interface UnitImportApi<U, S, R, I> {
  fetchSites(sb: SupabaseClient): Promise<S[]>;
  fetchUnits(sb: SupabaseClient): Promise<U[]>;
  /** neuer Standort wie das Formular „Standort anlegen“ (aktiv, ohne Betreiber/Notizen) */
  siteRow(orgId: string, name: string, address: string): S;
  /** neue Einheit wie das Formular (in Betrieb) */
  unitRow(orgId: string, input: I, siteId: string, notes: string | null): R;
  insertSites(sb: SupabaseClient, rows: S[]): Promise<void>;
  insertUnits(sb: SupabaseClient, rows: R[]): Promise<void>;
}

export interface UnitImportDef<U, S, R, I> {
  spec: UnitImportSpec<U, I>;
  api: UnitImportApi<U, S, R, I>;
}

// ---------------------------------------------------------------------------- Felder

const withLabel = (f: ImportField): ImportField => (f.exact.includes(headerKey(f.label)) ? f : { ...f, exact: [...f.exact, headerKey(f.label)] });

/** Alle Felder in der Reihenfolge der Zuordnung: Bezeichnung, Standort, Stammdaten, Notizen, letzte Prüfung, außer Betrieb. */
export function unitFields<U, I>(spec: UnitImportSpec<U, I>): ImportField[] {
  const { cfg } = spec;
  const S = cfg.labels.site;
  const U = cfg.labels.unit;
  const W = wordsOf(cfg);
  const k = headerKey;
  return [
    withLabel({
      key: BASE.name,
      label: spec.nameLabel,
      hint: 'Pflicht',
      exact: [...new Set([k(U.full), k(U.one), k(U.many), ...(spec.nameHeaders ?? []), 'bezeichnung', 'name', 'geraet', 'geraetename', 'geraetebezeichnung', 'kennung'])],
      prefix: ['bezeichnung'],
    }),
    withLabel({
      key: BASE.site,
      label: S.one,
      hint: `unbekannte ${S.many} werden mit angelegt`,
      exact: [...new Set([k(S.one), k(S.many), `${k(S.one)}name`, 'standort', 'standortname', 'einsatzort', 'aufstellort', 'betriebsstaette', 'filiale', 'lagerort'])],
      prefix: [k(S.one), 'standort'],
      notIf: /adresse|anschrift|strasse|plz/,
    }),
    withLabel({
      key: BASE.siteAddress,
      label: `${S.one}-Adresse`,
      hint: `nur für neue ${S.many}`,
      exact: [...new Set([`${k(S.one)}adresse`, 'standortadresse', 'adresse', 'anschrift', `adressedes${k(S.one)}s`])],
      prefix: [`${k(S.one)}adresse`, 'adresse', 'anschrift'],
    }),
    ...spec.fields.map(withLabel),
    withLabel({
      key: BASE.notes,
      label: 'Notizen',
      exact: ['notizen', 'notiz', 'bemerkung', 'bemerkungen', 'hinweis', 'hinweise', 'anmerkung', 'anmerkungen', 'kommentar', 'sonstiges', 'info'],
      prefix: ['bemerkung', 'notiz', 'hinweis', 'anmerkung'],
    }),
    withLabel({
      key: BASE.last,
      label: `Letzte ${W.insp.one}`,
      hint: 'kommt als Vermerk in die Notizen',
      // die Fälligkeits-Prüfung zuerst (im Prüfbuch stehen beide Spalten)
      exact: [...new Set([`letzte${k(spec.dueName)}`, `letzte${k(W.insp.one)}`, 'letztepruefung', 'zuletztgeprueft', 'geprueftam', 'pruefdatum', 'letztespruefdatum', 'datumletztepruefung', 'letztepruefungam'])],
      prefix: [`letzte${k(W.insp.one)}`, 'letztepruefung'],
    }),
    withLabel({
      key: BASE.retired,
      label: spec.retiredHeader,
      hint: '„ja“ = wird nicht übernommen',
      exact: [...new Set([k(spec.retiredHeader), 'ausgesondert', 'ausserbetrieb', 'stillgelegt', 'abgebaut'])],
    }),
  ];
}

// ---------------------------------------------------------------------------- Plan

export interface UnitPayload<I> {
  input: I;
  notes: string | null;
  /** vorhandener Standort … */
  siteId: string | null;
  /** … oder neuer (Schlüssel in plan.newSites) */
  newSite: string | null;
}

export interface NewSite {
  key: string;
  name: string;
  address: string;
}

export interface UnitPlan<I> extends ImportPlan<UnitPayload<I>> {
  newSites: Map<string, NewSite>;
}

const field = (row: object, col: string): unknown => (row as Record<string, unknown>)[col];
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Vergleichsform einer Einheit: Seriennummer (wenn beide eine haben) sonst Bezeichnung — je Standort. */
function sameUnit(a: { name: string; serial: string }, b: { name: string; serial: string }): boolean {
  return a.serial && b.serial ? a.serial === b.serial : a.name === b.name;
}

interface Known {
  name: string;
  serial: string;
}

function knownUnits<U extends { id: string; name: string }, I>(spec: UnitImportSpec<U, I>, units: readonly U[]): Map<string, Known[]> {
  const siteFk = siteFkOf(spec.cfg);
  const out = new Map<string, Known[]>();
  for (const u of units) {
    const siteId = str(field(u, siteFk));
    const k: Known = { name: cmpKey(u.name), serial: cmpKey(spec.serialOf?.(u) ?? '') };
    out.set(siteId, [...(out.get(siteId) ?? []), k]);
  }
  return out;
}

export interface UnitPlanArgs<U> {
  table: Pick<Table, 'rows' | 'lines'>;
  hasHeader: boolean;
  mapping: Mapping;
  /** Standort für Zeilen ohne Standort (id) — '' = keiner */
  target: string;
  sites: readonly ImportSite[];
  /** alle Einheiten des Betriebs (auch außer Betrieb genommene) */
  units: readonly U[];
}

export function planUnits<U extends { id: string; name: string }, I>(spec: UnitImportSpec<U, I>, args: UnitPlanArgs<U>): UnitPlan<I> {
  const { cfg } = spec;
  const S = cfg.labels.site;
  const W = wordsOf(cfg);
  const header = args.hasHeader ? (args.table.rows[0] ?? []) : [];
  const headerOf = (key: string) => {
    const c = args.mapping[key];
    return c === undefined ? '' : (header[c] ?? '');
  };
  const byKey = new Map<string, ImportSite>();
  for (const s of args.sites) if (!byKey.has(cmpKey(s.name))) byKey.set(cmpKey(s.name), s);
  const target = args.sites.find((s) => s.id === args.target) ?? null;
  const known = knownUnits(spec, args.units);
  const inFile = new Map<string, { k: Known; line: number }[]>();
  const newSites = new Map<string, NewSite>();
  const siteColumn = args.mapping[BASE.site] !== undefined;

  const rows = dataRows(args.table, args.hasHeader).map(({ cells, line }, i): ImportPlanRow<UnitPayload<I>> => {
    const get = (key: string) => cellOf(cells, args.mapping, key);
    const name = cap(oneLine(get(BASE.name)), 120);
    const row: ImportPlanRow<UnitPayload<I>> = { i, line, status: 'ok', reason: '', title: name, sub: '', cells: [''], hints: [], payload: null };
    const skip = (reason: string) => {
      row.status = 'skip';
      row.reason = reason;
      return row;
    };
    if (!name) return skip(`${spec.nameLabel} fehlt`);
    if (yesNo(get(BASE.retired)) === true) return skip(`${spec.retiredHeader.toLowerCase()} — wird nicht übernommen`);

    // Standort: vorhandener, neuer oder der gewählte für Zeilen ohne Standort
    const siteText = cap(oneLine(get(BASE.site)), 120);
    let siteId: string | null = null;
    let newKey: string | null = null;
    let siteName = '';
    if (siteText) {
      const found = byKey.get(cmpKey(siteText));
      if (found) {
        siteId = found.id;
        siteName = found.name;
        if (!found.active) row.hints.push(`${S.one} „${found.name}“ ist pausiert`);
      } else {
        newKey = cmpKey(siteText);
        siteName = siteText;
        const address = cap(oneLine(get(BASE.siteAddress)), 240);
        const ns = newSites.get(newKey);
        if (!ns) newSites.set(newKey, { key: newKey, name: siteText, address });
        else if (!ns.address && address) ns.address = address;
      }
    } else if (target) {
      siteId = target.id;
      siteName = target.name;
    } else {
      return skip(siteColumn ? `${S.one} fehlt` : `kein ${S.one} gewählt`);
    }
    row.cells = [newKey ? `${siteName} (neu)` : siteName];

    const built = spec.build(get, headerOf);
    row.hints.push(...built.hints);
    row.sub = spec.describe(built.input);

    // Notizen + Vermerk zur letzten Prüfung (keine Prüfung anlegen)
    const lastRaw = oneLine(get(BASE.last));
    const last = lastRaw ? (parseDay(lastRaw) ?? cap(lastRaw, 40)) : '';
    const lastNote = last ? `Letzte ${W.insp.one} lt. Import-Liste: ${last}` : '';
    if (lastNote) row.hints.push(`${lastNote} — als Vermerk in den Notizen`);
    const notes = cap([cap(get(BASE.notes), 2000), lastNote].filter(Boolean).join('\n'), 2100);
    row.payload = { input: built.input, notes: notes || null, siteId, newSite: newKey };

    // schon vorhanden / doppelt in der Liste
    const me: Known = { name: cmpKey(name), serial: spec.serialKey ? cmpKey(get(spec.serialKey)) : '' };
    const place = siteId ?? `neu:${newKey}`;
    if (siteId && (known.get(siteId) ?? []).some((k) => sameUnit(k, me))) {
      row.status = 'exists';
      row.reason = 'schon vorhanden';
    } else {
      const twin = (inFile.get(place) ?? []).find((x) => sameUnit(x.k, me));
      if (twin) {
        row.status = 'dup';
        row.reason = `doppelt in der Liste (wie Zeile ${twin.line})`;
      } else inFile.set(place, [...(inFile.get(place) ?? []), { k: me, line }]);
    }
    return row;
  });

  // Satz zur Zusammenfassung: neue Standorte, die eine neue Zeile braucht
  const used = new Set(rows.filter((r) => r.status === 'ok' && r.payload?.newSite).map((r) => r.payload!.newSite!));
  const notes: string[] = [];
  if (used.size) {
    const names = [...used].map((k) => `„${newSites.get(k)!.name}“`);
    notes.push(
      `${used.size === 1 ? `Der ${S.one}` : `${used.size} ${S.many}`} ${names.slice(0, 5).join(', ')}${names.length > 5 ? ' …' : ''} ${used.size === 1 ? 'ist neu und wird' : 'sind neu und werden'} mit angelegt.`,
    );
  }
  return { rows, count: countStatus(rows), notes, newSites };
}

/** Wie viele Einheiten der Import anlegen darf: mit Pro (oder ohne Grenze) unbegrenzt, sonst bis zur Gratis-Grenze. */
export function unitAllowance(cfg: PruefConfig, pro: boolean, count: number): number | null {
  if (pro || cfg.freeUnits === undefined) return null;
  return Math.max(0, cfg.freeUnits - count);
}

export interface FinalUnit<I> {
  row: ImportPlanRow<UnitPayload<I>>;
  siteId: string | null;
  newSite: string | null;
}

/**
 * Was beim Klick wirklich angelegt wird — gegen die frisch geladenen Standorte/Einheiten und die frische Pro-Auskunft:
 * angehakte Zeilen in Listen-Reihenfolge, ohne inzwischen Vorhandenes (anderer Tab, zweiter Klick), höchstens bis zur
 * Gratis-Grenze; neue Standorte, die es inzwischen gibt, werden benutzt statt doppelt angelegt.
 */
export function finalizeUnits<U extends { id: string; name: string }, I>(
  spec: UnitImportSpec<U, I>,
  plan: UnitPlan<I>,
  selected: ReadonlySet<number>,
  fresh: { sites: readonly ImportSite[]; units: readonly U[] },
  allowance: number | null,
): { units: FinalUnit<I>[]; newSites: NewSite[]; already: number; overLimit: number } {
  const byKey = new Map(fresh.sites.map((s) => [cmpKey(s.name), s.id] as const));
  const known = knownUnits(spec, fresh.units);
  const picked = plan.rows.filter((r) => r.payload && selected.has(r.i));
  let already = 0;
  const wanted: FinalUnit<I>[] = [];
  for (const row of picked) {
    const p = row.payload!;
    const siteId = p.siteId ?? (p.newSite ? (byKey.get(p.newSite) ?? null) : null);
    const newSite = siteId ? null : p.newSite;
    // bewusst angehakte „schon vorhanden“ werden angelegt; sonst Vorhandenes überspringen
    if (row.status !== 'exists' && siteId) {
      const me = { name: cmpKey(row.title), serial: spec.serialKey ? cmpKey(serialOfPayload(spec, p)) : '' };
      if ((known.get(siteId) ?? []).some((k) => sameUnit(k, me))) {
        already++;
        continue;
      }
    }
    wanted.push({ row, siteId, newSite });
  }
  const units = allowance === null ? wanted : wanted.slice(0, allowance);
  const keys = new Set(units.filter((u) => u.newSite).map((u) => u.newSite!));
  return { units, newSites: [...keys].map((k) => plan.newSites.get(k)!).filter(Boolean), already, overLimit: wanted.length - units.length };
}

/** Seriennummer aus den Stammdaten der Zeile (für die Prüfung gegen frisch geladene Einheiten). */
function serialOfPayload<U, I>(spec: UnitImportSpec<U, I>, p: UnitPayload<I>): string {
  return spec.serialKey ? str(field(p.input as object, spec.serialKey)) : '';
}

// ---------------------------------------------------------------------------- Vorlage

/** Vorlage als echte .xlsx: Spalten wie Zuordnung (= Prüfbuch), Beispielzeilen, Blatt „Info“ mit Erklärung. */
export function templateSheets<U, I>(spec: UnitImportSpec<U, I>): XlsxSheet[] {
  const { cfg } = spec;
  const S = cfg.labels.site;
  const U = cfg.labels.unit;
  const W = wordsOf(cfg);
  const fields = unitFields(spec).filter((f) => f.key !== BASE.retired);
  const order = [BASE.site, BASE.siteAddress, BASE.name, ...spec.fields.map((f) => f.key), BASE.notes, BASE.last];
  const cols = order.map((k) => fields.find((f) => f.key === k)!).filter(Boolean);
  return [
    {
      name: U.many,
      columns: cols.map((f) => ({ header: f.key === BASE.name ? U.full : f.label })),
      rows: spec.example.map((r) => cols.map((f) => r[f.key] || null)),
    },
    {
      name: 'Info',
      table: false,
      landscape: false,
      columns: [{ header: '', width: 26 }, { header: '', width: 90 }],
      rows: [
        [{ v: `${cfg.appName} · Vorlage für den Import`, bold: true }],
        [],
        [{ v: 'So geht es', bold: true }, `Je ${U.one} eine Zeile, die Beispielzeilen überschreiben. Danach im Dashboard unter „${S.many}“ → „${U.many} importieren“ die Datei wählen.`],
        [{ v: 'Pflicht', bold: true }, `nur „${U.full}“ (die Bezeichnung). Alle anderen Spalten dürfen leer bleiben oder fehlen.`],
        [{ v: S.one, bold: true }, `Name wie im Dashboard. Unbekannte ${S.many} werden mit angelegt — die Adresse dazu aus „${S.one}-Adresse“. Ohne ${S.one} wählst du beim Import einen aus der Liste.`],
        [{ v: 'Auswahlfelder', bold: true }, 'Werte wie im Formular. Andere Schreibweisen werden erkannt, was nicht passt, zeigt die Vorschau mit Hinweis.'],
        [{ v: `Letzte ${W.insp.one}`, bold: true }, `Es wird keine ${W.insp.one} angelegt — ${W.insp.many} sind Nachweise mit GPS-Stempel und Prüfcode und entstehen nur in der App. Das Datum kommt als Vermerk in die Notizen; die ${U.many} stehen bis zur ersten ${W.insp.one} auf „noch nie geprüft“.`],
        [{ v: 'Wieder einlesen', bold: true }, `Auch das Prüfbuch (Excel) lässt sich einlesen. Was es schon gibt (gleiche Bezeichnung am selben ${S.one}), wird erkannt und nicht doppelt angelegt.`],
      ],
    },
  ];
}

// ---------------------------------------------------------------------------- Laden, Adapter für den Wizard

export interface UnitImportData<U> {
  sites: ImportSite[];
  units: U[];
  /** Einheiten im Bestand laut Server (Gratis-Grenze) */
  count: number;
  pro: boolean;
  allowance: number | null;
}

export async function loadUnitImport<U, S extends ImportSite, R, I>(def: UnitImportDef<U, S, R, I>, sb: SupabaseClient): Promise<UnitImportData<U>> {
  const { cfg } = def.spec;
  const [sites, units, gate, pro] = await Promise.all([def.api.fetchSites(sb), def.api.fetchUnits(sb), unitGate(sb, cfg), fetchOrgPro(sb, true)]);
  return { sites, units, count: gate.count, pro, allowance: unitAllowance(cfg, pro, gate.count) };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;

/** Adapter für components/ImportWizard.tsx — Laden/Schreiben über die api.ts der App. */
export function unitImportAdapter<U extends { id: string; name: string }, S extends ImportSite, R extends { id: string }, I>(
  def: UnitImportDef<U, S, R, I>,
  sb: SupabaseClient,
  org: Org,
  data: UnitImportData<U>,
): ImportAdapter<UnitPayload<I>> {
  const { spec, api } = def;
  const { cfg } = spec;
  const S = cfg.labels.site;
  const U = cfg.labels.unit;
  const W = wordsOf(cfg);
  const fields = unitFields(spec);
  const sorted = [...data.sites].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de', { numeric: true }));
  return {
    noun: { one: U.one, many: U.many },
    fields,
    required: [BASE.name],
    fallbackMapping: { [BASE.name]: 0 },
    columns: [S.one],
    notice: `${W.insp.many} werden nicht übernommen: Eine ${W.insp.one} ist ein Nachweis mit Uhrzeit, GPS-Stempel und Prüfcode und entsteht nur in der App oder unter „Vor Ort“. Die neuen ${U.many} stehen deshalb bis zur ersten ${W.insp.one} auf „noch nie geprüft“. Steht in der Liste eine letzte ${W.insp.one}, kommt sie als Vermerk in die Notizen.`,
    choice: (mapping) => {
      const hasCol = mapping[BASE.site] !== undefined;
      const options = sorted.map((s) => ({ value: s.id, label: s.active ? s.name : `${s.name} (pausiert)` }));
      return {
        label: hasCol ? `${S.one} für Zeilen ohne ${S.one}` : `In welchen ${S.one}?`,
        hint: hasCol
          ? `Zeilen mit ${S.one} kommen an ihren ${S.one}; unbekannte ${S.many} werden mit angelegt.`
          : options.length
            ? `Die Liste hat keine Spalte „${S.one}“ — alle ${U.many} kommen an den gewählten ${S.one}.`
            : `Es gibt noch keinen ${S.one}. Bitte zuerst einen anlegen — oder in der Liste eine Spalte „${S.one}“ ergänzen.`,
        options: [{ value: '', label: hasCol ? '— Zeile nicht übernehmen —' : `— ${S.one} wählen —` }, ...options],
        value: !hasCol && options.length === 1 ? options[0].value : '',
      };
    },
    plan: ({ table, hasHeader, mapping, choice }) =>
      planUnits(spec, { table, hasHeader, mapping, target: choice, sites: data.sites, units: data.units }),
    allowance: data.allowance,
    limitText: (allowance) =>
      `${
        allowance === 0
          ? `Dein Betrieb hat die Gratis-Grenze schon erreicht (${plural(data.count, U.one, U.many)}) — angelegt wird jetzt nichts.`
          : `Angelegt ${allowance === 1 ? 'wird' : 'werden'} jetzt nur ${allowance === 1 ? 'die erste' : `die ersten ${allowance}`} der Auswahl.`
      } ${gateText(cfg)}`,
    template: () => downloadXlsx(`${cfg.appName}_${U.many}_Vorlage`, templateSheets(spec), { title: `${cfg.appName} Vorlage ${U.many}`, creator: `Dexware ${cfg.appName}` }),
    async write(plan, selected, _choice, progress) {
      progress({ label: `${U.many} werden geprüft …`, done: 0, total: 0 });
      const fresh = await loadUnitImport(def, sb);
      const fin = finalizeUnits(spec, plan as UnitPlan<I>, selected, fresh, fresh.allowance);
      const failed: InsertFailure[] = [];
      const strip = /^[^:]+ konnten nicht angelegt werden: /;

      // 1. neue Standorte
      const siteItems = fin.newSites.map((ns) => ({ ns, row: api.siteRow(org.id, ns.name, ns.address) }));
      const siteIds = new Map<string, string>();
      if (siteItems.length) {
        const res = await insertInChunks(
          siteItems,
          (part) => api.insertSites(sb, part.map((x) => x.row)),
          (x) => ({ line: 0, name: x.ns.name, reason: '' }),
          { strip, progress: (done) => progress({ label: `${S.many} werden angelegt …`, done, total: siteItems.length }) },
        );
        for (const x of res.ok) siteIds.set(x.ns.key, x.row.id);
        for (const f of res.failed) failed.push({ line: 0, name: `${S.one} „${f.name}“`, reason: f.reason });
      }

      // 2. Einheiten (an Standorten, die es gibt bzw. eben angelegt wurden)
      const unitItems: { u: FinalUnit<I>; row: R }[] = [];
      for (const u of fin.units) {
        const siteId = u.siteId ?? (u.newSite ? siteIds.get(u.newSite) : undefined);
        if (!siteId) {
          failed.push({ line: u.row.line, name: u.row.title, reason: `${S.one} konnte nicht angelegt werden` });
          continue;
        }
        unitItems.push({ u, row: api.unitRow(org.id, u.row.payload!.input, siteId, u.row.payload!.notes) });
      }
      const res = await insertInChunks(
        unitItems,
        (part) => api.insertUnits(sb, part.map((x) => x.row)),
        (x) => ({ line: x.u.row.line, name: x.u.row.title }),
        { strip, progress: (done) => progress({ label: `${U.many} werden angelegt …`, done, total: unitItems.length }) },
      );
      failed.push(...res.failed);
      const notes: string[] = [];
      if (siteIds.size) notes.push(`${plural(siteIds.size, `neuer ${S.one}`, `neue ${S.many}`)} angelegt.`);
      if (fin.already) notes.push(`${plural(fin.already, `${U.one} war`, `${U.many} waren`)} inzwischen schon vorhanden und ${fin.already === 1 ? 'wurde' : 'wurden'} nicht noch einmal angelegt.`);
      if (fin.overLimit) notes.push(`${plural(fin.overLimit, U.one, U.many)} nicht angelegt — Gratis-Grenze erreicht.`);
      if (res.ok.length) notes.push(`Die neuen ${U.many} stehen bis zur ersten ${W.insp.one} in der App auf „noch nie geprüft“.`);
      const result: ImportResult = { created: res.ok.length, failed, notes };
      return result;
    },
  };
}
