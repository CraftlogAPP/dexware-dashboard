// Prüf-Apps — Geräte (Leitern, Teile …) bzw. Orte (Baustellen, Lager, Spielplätze) aus einer Excel-/CSV-Liste
// übernehmen. Gegenstück zum Prüfbuch-Export (lib/pruefExport.ts): dessen Spalten werden wieder erkannt. Reine Logik
// ohne React; Oberfläche components/ImportWizard.tsx, Lesen der Liste lib/tableImport.ts. Je App nur ein Adapter
// (src/<app>/importUnits.ts) mit den Stammdaten-Feldern.
//
// Einheiten-Modus (LeiterDex, FeuerDex, ToreDex, GurtDex, HebeDex) — eine Zeile = ein Gerät:
//  - Pflicht je Zeile ist die Bezeichnung. Zeilen mit „ausgesondert: ja“ werden nicht übernommen.
//  - Standort-Spalte: Name gegen die vorhandenen Standorte (Vergleichsform cmpKey). Unbekannte Namen werden als neue
//    Standorte mit angelegt (Adresse aus „Standort-Adresse“). Ohne Standort-Spalte — oder bei leerer Zelle — gilt der
//    gewählte Standort aus der Liste über der Vorschau.
//  - Gleiche Bezeichnung am selben Standort = „schon vorhanden“ (abgewählt); haben beide eine Seriennummer, entscheidet
//    sie. Doppelte Zeilen in der Liste: nur die erste ist angehakt.
//  - „Letzte Prüfung“ legt KEINE Prüfung an (Prüfungen sind Nachweise mit GPS-Stempel und Prüfcode und entstehen nur in
//    der App bzw. „Vor Ort“) — sie kommt als Vermerk in die Notizen. Neue Geräte stehen auf „noch nie geprüft“.
//  - Gratis-Grenze wie beim Anlegen von Hand (pruefen/pro.ts → unitGate): höchstens so viele, wie ohne Pro noch gehen.
// Orts-Modus (GerüstDex, RegalDex, SpielDex) — geprüft wird der ganze Ort, deshalb importiert man ORTE und auf Wunsch
// ihre Einheiten: eine Zeile mit Ort (+ Adresse, Betreiber, Status) und ohne Einheit legt nur den Ort an, eine Zeile mit
// Einheit (Gerüst, Regalzeile, Spielgerät) die Einheit an ihrem Ort (und den Ort, falls neu). So passen beide Blätter
// des Prüfbuchs (je Ort / Bestand). „Letzte Kontrolle“ kommt in die Notizen des NEUEN Orts. Die Gratis-Grenze gilt hier
// für aktive Orte (siteGate): neue aktive Orte zählen mit, pausierte nicht; Einheiten an nicht erlaubten Orten entfallen.
// Ist die Grenze beim Import schon erreicht, kommt wie beim Anlegen von Hand (Knopf gesperrt) gar kein neuer Ort dazu,
// auch kein pausierter — Einheiten an vorhandenen Orten gehen weiter.
// Geschrieben wird EXAKT wie die Formulare (Zeilen-Funktionen der api.ts der App), mit festen ids, Orte zuerst.

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
import { isSiteMode, siteFkOf, wordsOf, type PruefConfig } from './config';
import { fetchOrgPro, gateText, siteGate, siteGateText, unitGate } from './pro';

/** Felder, die jeder Import hat (Schlüssel in der Zuordnung); Betreiber/Kontakt/Status nur im Orts-Modus */
export const BASE = {
  name: 'name',
  site: 'site',
  siteAddress: 'siteAddress',
  siteOperator: 'siteOperator',
  siteContact: 'siteContact',
  siteStatus: 'siteStatus',
  notes: 'notes',
  last: 'lastInspection',
  retired: 'retired',
} as const;

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
  /** Orts-Modus: Wortlaut der Betreiber-Felder wie im Formular des Orts (Standard „Betreiber“ / „Betreiber-Kontakt“) */
  siteLabels?: { operator: string; contact: string };
  /** Geschlecht des Orts-Worts für die Sätze (der Standort, die Baustelle, das Objekt); Standard männlich */
  siteGenus?: Genus;
  /** weitere Überschriften für den Ort (headerKey-Form), z. B. „Bauvorhaben“ */
  siteHeaders?: string[];
  /** Name des Excel-Exports der App (Standard „Prüfbuch“, SpielDex „Kontrollbuch“) */
  bookName?: string;
}

/** Geschlecht eines Worts — die Sätze der Oberfläche („In welche Baustelle?“, „das erste neue Lager“) richten sich danach. */
export type Genus = 'm' | 'f' | 'n';

const GRAMMAR = {
  m: { der: 'der', den: 'den', kein: 'kein', keinen: 'keinen', einen: 'einen', welchen: 'welchen', ihren: 'ihren', gewaehlt: 'den gewählten', neu: 'neuer', erste: 'der erste neue', sein: 'seinen', demselben: 'demselben', amSelben: 'am selben' },
  f: { der: 'die', den: 'die', kein: 'keine', keinen: 'keine', einen: 'eine', welchen: 'welche', ihren: 'ihre', gewaehlt: 'die gewählte', neu: 'neue', erste: 'die erste neue', sein: 'ihren', demselben: 'derselben', amSelben: 'an derselben' },
  n: { der: 'das', den: 'das', kein: 'kein', keinen: 'kein', einen: 'eins', welchen: 'welches', ihren: 'ihr', gewaehlt: 'das gewählte', neu: 'neues', erste: 'das erste neue', sein: 'seinen', demselben: 'demselben', amSelben: 'am selben' },
} as const;

/** Artikel/Endungen zum Orts-Wort der App */
export const siteGrammar = (spec: { siteGenus?: Genus }) => GRAMMAR[spec.siteGenus ?? 'm'];
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Dativ Mehrzahl: „mit ihren Gerüsten“, aber „mit ihren Regalzeilen“ */
const dativePlural = (w: string) => (/[ns]$/.test(w) ? w : `${w}n`);

/** Angaben zu einem neuen Ort aus der Liste (Orts-Modus; im Einheiten-Modus leer und aktiv) */
export interface NewSiteExtra {
  operator: string | null;
  contact: string | null;
  notes: string | null;
  active: boolean;
}

/** Je App: Lesen und Schreiben über die api.ts der App — Zeilen GENAU wie beim Anlegen von Hand. */
export interface UnitImportApi<U, S, R, I> {
  fetchSites(sb: SupabaseClient): Promise<S[]>;
  fetchUnits(sb: SupabaseClient): Promise<U[]>;
  /** neuer Standort wie das Formular „Standort anlegen“ (ohne `extra`: aktiv, ohne Betreiber/Notizen) */
  siteRow(orgId: string, name: string, address: string, extra?: NewSiteExtra): S;
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

/**
 * Alle Felder in der Reihenfolge der Zuordnung. Einheiten-Modus: Bezeichnung, Standort, Stammdaten, Notizen, letzte
 * Prüfung, außer Betrieb. Orts-Modus: Ort mit Adresse/Betreiber/Status, dann die (freiwillige) Einheit.
 */
export function unitFields<U, I>(spec: UnitImportSpec<U, I>): ImportField[] {
  const { cfg } = spec;
  const S = cfg.labels.site;
  const U = cfg.labels.unit;
  const W = wordsOf(cfg);
  const k = headerKey;
  const siteMode = isSiteMode(cfg);
  const L = spec.siteLabels ?? { operator: 'Betreiber', contact: 'Betreiber-Kontakt' };
  const G = siteGrammar(spec);
  const name = withLabel({
    key: BASE.name,
    label: siteMode ? U.one : spec.nameLabel,
    hint: siteMode ? `leer = nur ${G.der} ${S.one}` : 'Pflicht',
    // im Orts-Modus ist ein schlichtes „Name“ eher der Ort (unten bei site, unsicher)
    exact: [
      ...new Set([
        k(U.full),
        k(U.one),
        k(U.many),
        ...(siteMode ? [`${k(U.one)}name`, `${k(U.one)}bezeichnung`] : []),
        ...(spec.nameHeaders ?? []),
        ...(siteMode ? [] : ['bezeichnung', 'name']),
        'geraet',
        'geraetename',
        'geraetebezeichnung',
        'kennung',
      ]),
    ],
    prefix: siteMode ? [k(U.one)] : ['bezeichnung'],
    // im Orts-Blatt des Prüfbuchs steht „Gerüste in Betrieb“ (Anzahl) — das ist keine Bezeichnung
    notIf: siteMode ? /adresse|anschrift|inbetrieb|anzahl|faellig|offene/ : /adresse|anschrift/,
  });
  const site = withLabel({
    key: BASE.site,
    label: S.one,
    hint: siteMode ? 'Pflicht, sonst unten wählen' : `unbekannte ${S.many} werden mit angelegt`,
    exact: [
      ...new Set([k(S.one), k(S.many), `${k(S.one)}name`, `${k(S.one)}bezeichnung`, ...(spec.siteHeaders ?? []), 'standort', 'standortname', 'einsatzort', 'aufstellort', 'betriebsstaette', 'filiale', 'lagerort']),
    ],
    prefix: [k(S.one), 'standort'],
    weak: siteMode ? ['name', 'bezeichnung', 'objekt', 'objektname'] : undefined,
    notIf: /adresse|anschrift|strasse|plz/,
  });
  const address = withLabel({
    key: BASE.siteAddress,
    label: siteMode ? 'Adresse' : `${S.one}-Adresse`,
    hint: `nur für neue ${S.many}`,
    exact: [...new Set([`${k(S.one)}adresse`, 'standortadresse', 'adresse', 'anschrift', `adressedes${k(S.one)}s`])],
    prefix: [`${k(S.one)}adresse`, 'adresse', 'anschrift'],
    notIf: /betreiber|auftraggeber|kunde|rechnung|kontakt/,
  });
  const notes = withLabel({
    key: BASE.notes,
    label: 'Notizen',
    hint: siteMode ? `bei Zeilen ohne ${U.one}: für ${G.den} ${S.one}` : undefined,
    exact: ['notizen', 'notiz', 'bemerkung', 'bemerkungen', 'hinweis', 'hinweise', 'anmerkung', 'anmerkungen', 'kommentar', 'sonstiges', 'info'],
    prefix: ['bemerkung', 'notiz', 'hinweis', 'anmerkung'],
  });
  const last = withLabel({
    key: BASE.last,
    label: `Letzte ${W.insp.one}`,
    hint: siteMode ? `kommt als Vermerk in die Notizen — nur bei neuen ${S.many}` : 'kommt als Vermerk in die Notizen',
    // die Fälligkeits-Prüfung zuerst (im Prüfbuch stehen beide Spalten)
    exact: [...new Set([`letzte${k(spec.dueName)}`, `letzte${k(W.insp.one)}`, 'letztepruefung', 'zuletztgeprueft', 'zuletztkontrolliert', 'geprueftam', 'pruefdatum', 'letztespruefdatum', 'datumletztepruefung', 'letztepruefungam'])],
    prefix: [`letzte${k(W.insp.one)}`, 'letztepruefung'],
  });
  const retired = withLabel({
    key: BASE.retired,
    label: spec.retiredHeader,
    hint: '„ja“ = wird nicht übernommen',
    exact: [...new Set([k(spec.retiredHeader), 'ausgesondert', 'ausserbetrieb', 'stillgelegt', 'abgebaut'])],
  });
  if (!siteMode) return [name, site, address, ...spec.fields.map(withLabel), notes, last, retired];
  return [
    site,
    address,
    withLabel({
      key: BASE.siteOperator,
      label: L.operator,
      exact: [...new Set([k(L.operator), 'betreiber', 'auftraggeber', 'bauherr', 'betreiberauftraggeber', 'auftraggeberbauherr', 'kunde', 'eigentuemer', 'traeger'])],
      prefix: ['betreiber', 'auftraggeber', 'bauherr'],
      notIf: /kontakt|telefon|mail|adresse/,
    }),
    withLabel({
      key: BASE.siteContact,
      label: L.contact,
      exact: [...new Set([k(L.contact), 'betreiberkontakt', 'auftraggeberkontakt', 'kontakt', 'ansprechpartner', 'ansprechperson', 'kontaktperson', 'telefon'])],
      prefix: ['ansprechp', 'kontakt'],
    }),
    withLabel({ key: BASE.siteStatus, label: 'Status', hint: '„pausiert“ = nicht aktiv', exact: ['status', 'aktiv', `${k(S.one)}status`] }),
    name,
    ...spec.fields.map(withLabel),
    notes,
    last,
    retired,
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
  /** Orts-Modus: Zeile ohne Einheit — legt nur den (neuen) Ort an */
  onlySite?: boolean;
}

export interface NewSite {
  key: string;
  name: string;
  address: string;
  /** Orts-Modus (sonst leer/aktiv) */
  operator?: string | null;
  contact?: string | null;
  notes?: string | null;
  active?: boolean;
}

export interface UnitPlan<I> extends ImportPlan<UnitPayload<I>> {
  newSites: Map<string, NewSite>;
}

const field = (row: object, col: string): unknown => (row as Record<string, unknown>)[col];
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const orNull = (s: string) => (s ? s : null);

/** Baujahr/Aufstelljahr wie im Formular („2018“): ein Datum aus Excel („01.06.2018“) wird zum Jahr, anderes bleibt wörtlich. */
export function yearOf(raw: string): string | null {
  const t = oneLine(raw);
  if (!t) return null;
  const day = parseDay(t);
  return day ? day.slice(6) : cap(t, 10);
}

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

/** „pausiert“, „inaktiv“, „abgeschlossen“, „nein“ … = nicht aktiv; sonst aktiv (null = unklar → aktiv mit Hinweis) */
function siteActive(raw: string): boolean | null {
  const k = headerKey(raw);
  if (!k || ['aktiv', 'ja', 'j', 'x', '1', 'true', 'inbetrieb', 'offen', 'laufend'].includes(k)) return true;
  if (['pausiert', 'inaktiv', 'nichtaktiv', 'abgeschlossen', 'stillgelegt', 'beendet', 'nein', 'n', '0', 'false', 'abgebaut', 'geschlossen', 'ruhend'].includes(k)) return false;
  return null;
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
  const U = cfg.labels.unit;
  const W = wordsOf(cfg);
  const G = siteGrammar(spec);
  const siteMode = isSiteMode(cfg);
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
  const siteRowsSeen = new Map<string, number>();
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
    const siteText = cap(oneLine(get(BASE.site)), 120);
    if (!name && !siteMode) return skip(`${spec.nameLabel} fehlt`);
    if (!name && !siteText) return skip(`${S.one} fehlt`);
    if (name && yesNo(get(BASE.retired)) === true) return skip(`${spec.retiredHeader.toLowerCase()} — wird nicht übernommen`);

    // Standort: vorhandener, neuer oder der gewählte für Zeilen ohne Standort
    let siteId: string | null = null;
    let newKey: string | null = null;
    let siteName = '';
    const lastRaw = oneLine(get(BASE.last));
    const last = lastRaw ? (parseDay(lastRaw) ?? cap(lastRaw, 40)) : '';
    const lastNote = last ? `Letzte ${W.insp.one} lt. Import-Liste: ${last}` : '';
    if (siteText) {
      const found = byKey.get(cmpKey(siteText));
      if (found) {
        siteId = found.id;
        siteName = found.name;
        if (!found.active) row.hints.push(`${S.one} „${found.name}“ ist pausiert`);
      } else {
        newKey = cmpKey(siteText);
        siteName = siteText;
        // Angaben zum neuen Ort: aus allen Zeilen dieses Orts, die erste ausgefüllte zählt
        const ns = newSites.get(newKey) ?? { key: newKey, name: siteText, address: '' };
        const fill = <K extends keyof NewSite>(k: K, v: NewSite[K]) => {
          if (v !== '' && v !== null && v !== undefined && (ns[k] === undefined || ns[k] === null || ns[k] === '')) ns[k] = v;
        };
        fill('address', cap(oneLine(get(BASE.siteAddress)), 240));
        if (siteMode) {
          fill('operator', orNull(cap(oneLine(get(BASE.siteOperator)), 160)));
          fill('contact', orNull(cap(oneLine(get(BASE.siteContact)), 200)));
          const st = get(BASE.siteStatus);
          const active = siteActive(st);
          if (st && ns.active === undefined) ns.active = active ?? true;
          if (active === null) row.hints.push(`Status „${oneLine(st)}“ unklar → aktiv`);
          // Notizen der Zeile ohne Einheit und die letzte Kontrolle gehören zum Ort
          const siteNotes = [name ? '' : cap(get(BASE.notes), 2000), lastNote].filter(Boolean).join('\n');
          if (siteNotes) ns.notes = ns.notes ? `${ns.notes}\n${siteNotes}` : siteNotes;
        }
        newSites.set(newKey, ns);
      }
    } else if (target) {
      siteId = target.id;
      siteName = target.name;
    } else {
      return skip(siteColumn ? `${S.one} fehlt` : `${G.kein} ${S.one} gewählt`);
    }
    row.cells = [newKey ? `${siteName} (neu)` : siteName];
    if (siteMode && lastNote) {
      row.hints.push(newKey ? `${lastNote} — als Vermerk in die Notizen (${S.one} neu)` : `${lastNote} — nicht übernommen (${S.one} gibt es schon)`);
    }

    // Orts-Modus, Zeile ohne Einheit: nur der Ort
    if (!name) {
      row.title = siteName;
      const ns = newKey ? newSites.get(newKey) : undefined;
      row.sub = [`${S.one}, ohne ${U.one}`, ns?.address, ns?.operator].filter(Boolean).join(' · ');
      row.payload = { input: spec.build(() => '', headerOf).input, notes: null, siteId, newSite: newKey, onlySite: true };
      if (!newKey) {
        row.status = 'exists';
        row.reason = 'schon vorhanden';
      } else if (siteRowsSeen.has(newKey)) {
        row.status = 'dup';
        row.reason = `doppelt in der Liste (wie Zeile ${siteRowsSeen.get(newKey)})`;
      } else siteRowsSeen.set(newKey, line);
      if (newKey && newSites.get(newKey)?.active === false) row.hints.push('wird pausiert angelegt');
      return row;
    }

    const built = spec.build(get, headerOf);
    row.hints.push(...built.hints);
    row.sub = spec.describe(built.input);

    // Notizen (+ im Einheiten-Modus der Vermerk zur letzten Prüfung) — keine Prüfung anlegen
    if (!siteMode && lastNote) row.hints.push(`${lastNote} — als Vermerk in den Notizen`);
    const notes = cap([cap(get(BASE.notes), 2000), siteMode ? '' : lastNote].filter(Boolean).join('\n'), 2100);
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

  // Hinweis „Adresse fehlt“ beim neuen Ort (das Formular verlangt sie) — an der ersten Zeile des Orts
  for (const ns of newSites.values()) {
    if (ns.address) continue;
    const first = rows.find((r) => r.payload?.newSite === ns.key);
    first?.hints.push(`${S.one} „${ns.name}“ ohne Adresse — bitte danach im Dashboard ergänzen`);
  }
  // Satz zur Zusammenfassung: neue Standorte, die eine neue Zeile braucht
  const used = new Set(rows.filter((r) => r.status === 'ok' && r.payload?.newSite).map((r) => r.payload!.newSite!));
  const notes: string[] = [];
  if (used.size) {
    const names = [...used].map((k) => `„${newSites.get(k)!.name}“`);
    notes.push(
      `${used.size === 1 ? `${upper(G.der)} ${S.one}` : `${used.size} ${S.many}`} ${names.slice(0, 5).join(', ')}${names.length > 5 ? ' …' : ''} ${used.size === 1 ? 'ist neu und wird' : 'sind neu und werden'} mit angelegt.`,
    );
  }
  if (siteMode) {
    const units = rows.filter((r) => r.status === 'ok' && r.payload && !r.payload.onlySite).length;
    if (units) notes.push(`Neu: ${used.size} ${used.size === 1 ? S.one : S.many} und ${units} ${units === 1 ? U.one : U.many}.`);
  }
  return { rows, count: countStatus(rows), notes, newSites };
}

/** Wie viele Einheiten der Import anlegen darf: mit Pro (oder ohne Grenze) unbegrenzt, sonst bis zur Gratis-Grenze. */
export function unitAllowance(cfg: PruefConfig, pro: boolean, count: number): number | null {
  if (pro || cfg.freeUnits === undefined) return null;
  return Math.max(0, cfg.freeUnits - count);
}

/** Wie viele neue AKTIVE Orte der Import anlegen darf (Orts-Apps: 1 aktiver Ort gratis; pausierte zählen nicht). */
export function siteAllowance(cfg: PruefConfig, pro: boolean, activeCount: number): number | null {
  if (pro || cfg.freeSites === undefined) return null;
  return Math.max(0, cfg.freeSites - activeCount);
}

export interface FinalUnit<I> {
  row: ImportPlanRow<UnitPayload<I>>;
  siteId: string | null;
  newSite: string | null;
}

/**
 * Was beim Klick wirklich angelegt wird — gegen die frisch geladenen Standorte/Einheiten und die frische Pro-Auskunft:
 * angehakte Zeilen in Listen-Reihenfolge, ohne inzwischen Vorhandenes (anderer Tab, zweiter Klick), höchstens bis zur
 * Gratis-Grenze; neue Standorte, die es inzwischen gibt, werden benutzt statt doppelt angelegt. `siteAllow` begrenzt
 * die neuen aktiven Orte (Orts-Apps) — Zeilen an Orten darüber hinaus entfallen; bei 0 (Grenze erreicht) entfallen wie
 * beim Anlegen von Hand alle neuen Orte, auch pausierte. Im Ergebnis stehen auch die Zeilen
 * „nur der Ort“ (row.payload.onlySite) — für sie wird keine Einheit angelegt.
 */
export function finalizeUnits<U extends { id: string; name: string }, I>(
  spec: UnitImportSpec<U, I>,
  plan: UnitPlan<I>,
  selected: ReadonlySet<number>,
  fresh: { sites: readonly ImportSite[]; units: readonly U[] },
  allowance: number | null,
  siteAllow: number | null = null,
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
    // „nur der Ort“: gibt es ihn inzwischen, ist nichts mehr zu tun
    if (p.onlySite) {
      if (!newSite) {
        if (row.status !== 'exists') already++;
        continue;
      }
      wanted.push({ row, siteId, newSite });
      continue;
    }
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
  // Gratis-Grenze der Orte: neue aktive Orte in Reihenfolge des ersten Auftretens; ist sie schon erreicht, sperrt sie
  // wie der Knopf „… anlegen“ jeden neuen Ort (auch pausierte)
  let kept = wanted;
  if (siteAllow === 0) kept = wanted.filter((u) => !u.newSite);
  else if (siteAllow !== null) {
    const allowed = new Set<string>();
    let n = 0;
    for (const u of wanted) {
      const key = u.newSite;
      if (!key || allowed.has(key) || plan.newSites.get(key)?.active === false) continue;
      if (n < siteAllow) {
        allowed.add(key);
        n++;
      }
    }
    kept = wanted.filter((u) => !u.newSite || allowed.has(u.newSite) || plan.newSites.get(u.newSite)?.active === false);
  }
  // Gratis-Grenze der Einheiten (Einheiten-Apps) — Zeilen „nur der Ort“ zählen nicht
  let unitsLeft = allowance;
  const units = kept.filter((u) => {
    if (u.row.payload!.onlySite || unitsLeft === null) return true;
    if (unitsLeft <= 0) return false;
    unitsLeft--;
    return true;
  });
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
  const siteMode = isSiteMode(cfg);
  const G = siteGrammar(spec);
  const book = spec.bookName ?? 'Prüfbuch';
  const inactive = cfg.labels.freeSites?.inactive ?? 'pausierte';
  const fields = unitFields(spec).filter((f) => f.key !== BASE.retired && f.key !== BASE.siteStatus);
  const order = siteMode
    ? [BASE.site, BASE.siteAddress, BASE.siteOperator, BASE.name, ...spec.fields.map((f) => f.key), BASE.notes, BASE.last]
    : [BASE.site, BASE.siteAddress, BASE.name, ...spec.fields.map((f) => f.key), BASE.notes, BASE.last];
  const cols = order.map((k) => fields.find((f) => f.key === k)!).filter(Boolean);
  const what = siteMode ? S.many : U.many;
  const info: [string, string][] = siteMode
    ? [
        ['So geht es', `Je ${S.one} eine Zeile — und auf Wunsch darunter je ${U.one} eine Zeile mit ${G.demselben} ${S.one}. Die Beispielzeilen überschreiben. Danach im Dashboard unter „${S.many}“ → „${S.many} importieren“ die Datei wählen.`],
        ['Pflicht', `nur „${S.one}“. Ist „${U.one}“ leer, wird nur ${G.der} ${S.one} angelegt.`],
        [S.one, `Name wie im Dashboard. Unbekannte ${S.many} werden angelegt — mit Adresse und ${spec.siteLabels?.operator ?? 'Betreiber'} aus derselben Zeile. Vorhandene bleiben, wie sie sind.`],
        ['Gratis-Grenze', `Im Gratis-Paket ${cfg.freeSites === 1 ? `ist 1 ${cfg.labels.freeSites?.one ?? `${S.one} (aktiv)`}` : `sind ${cfg.freeSites} ${cfg.labels.freeSites?.many ?? `${S.many} (aktiv)`}`} möglich — neue aktive ${S.many} zählen mit, ${inactive} nicht. Ist die Grenze schon erreicht, legt der Import wie beim Anlegen von Hand keine neuen ${S.many} an (auch keine ${inactive}n); ${U.many} an vorhandenen ${dativePlural(S.many)} gehen weiter.`],
        ['Auswahlfelder', 'Werte wie im Formular. Andere Schreibweisen werden erkannt, was nicht passt, zeigt die Vorschau mit Hinweis.'],
        [`Letzte ${W.insp.one}`, `Es wird keine ${W.insp.one} angelegt — ${W.insp.many} sind Nachweise mit GPS-Stempel und Prüfcode und entstehen nur in der App. Das Datum kommt als Vermerk in die Notizen neuer ${S.many}; sie stehen bis zur ersten ${W.insp.one} auf „noch nie geprüft“.`],
        ['Wieder einlesen', `Auch das ${book} (Excel) lässt sich einlesen: Blatt „${book}“ für die ${S.many}, Blatt „${U.many}“ für den Bestand — das Blatt wählst du beim Import. Was es schon gibt, wird erkannt und nicht doppelt angelegt.`],
      ]
    : [
        ['So geht es', `Je ${U.one} eine Zeile, die Beispielzeilen überschreiben. Danach im Dashboard unter „${S.many}“ → „${U.many} importieren“ die Datei wählen.`],
        ['Pflicht', `nur „${U.full}“ (die Bezeichnung). Alle anderen Spalten dürfen leer bleiben oder fehlen.`],
        [S.one, `Name wie im Dashboard. Unbekannte ${S.many} werden mit angelegt — die Adresse dazu aus „${S.one}-Adresse“. Ohne ${S.one} wählst du beim Import ${G.einen} aus der Liste.`],
        ['Auswahlfelder', 'Werte wie im Formular. Andere Schreibweisen werden erkannt, was nicht passt, zeigt die Vorschau mit Hinweis.'],
        [`Letzte ${W.insp.one}`, `Es wird keine ${W.insp.one} angelegt — ${W.insp.many} sind Nachweise mit GPS-Stempel und Prüfcode und entstehen nur in der App. Das Datum kommt als Vermerk in die Notizen; die ${U.many} stehen bis zur ersten ${W.insp.one} auf „noch nie geprüft“.`],
        ['Wieder einlesen', `Auch das ${book} (Excel) lässt sich einlesen. Was es schon gibt (gleiche Bezeichnung ${G.amSelben} ${S.one}), wird erkannt und nicht doppelt angelegt.`],
      ];
  return [
    {
      name: what,
      columns: cols.map((f) => ({ header: f.key === BASE.name && !siteMode ? U.full : f.label })),
      rows: spec.example.map((r) => cols.map((f) => r[f.key] || null)),
    },
    {
      name: 'Info',
      table: false,
      landscape: false,
      columns: [{ header: '', width: 26 }, { header: '', width: 90 }],
      rows: [[{ v: `${cfg.appName} · Vorlage für den Import`, bold: true }], [], ...info.map(([k, v]) => [{ v: k, bold: true }, v])],
    },
  ];
}

// ---------------------------------------------------------------------------- Laden, Adapter für den Wizard

export interface UnitImportData<U> {
  sites: ImportSite[];
  units: U[];
  /** Einheiten im Bestand laut Server (Gratis-Grenze der Einheiten-Apps) */
  count: number;
  pro: boolean;
  allowance: number | null;
  /** aktive Orte laut Server und wie viele neue aktive noch gehen (Orts-Apps; sonst null) */
  activeSites?: number;
  siteAllowance?: number | null;
}

export async function loadUnitImport<U, S extends ImportSite, R, I>(def: UnitImportDef<U, S, R, I>, sb: SupabaseClient): Promise<UnitImportData<U>> {
  const { cfg } = def.spec;
  const [sites, units, gate, sGate, pro] = await Promise.all([
    def.api.fetchSites(sb),
    def.api.fetchUnits(sb),
    unitGate(sb, cfg),
    siteGate(sb, cfg),
    fetchOrgPro(sb, true),
  ]);
  return {
    sites,
    units,
    count: gate.count,
    pro,
    allowance: unitAllowance(cfg, pro, gate.count),
    activeSites: sGate.count,
    siteAllowance: siteAllowance(cfg, pro, sGate.count),
  };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;

/** Wörter im Wizard: Geräte (Einheiten-Modus) bzw. „Einträge“ (Orts-Modus: Orte und Einheiten gemischt) */
export function importNoun(cfg: PruefConfig): { one: string; many: string } {
  return isSiteMode(cfg) ? { one: 'Eintrag', many: 'Einträge' } : { one: cfg.labels.unit.one, many: cfg.labels.unit.many };
}

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
  const siteMode = isSiteMode(cfg);
  const fields = unitFields(spec);
  const sorted = [...data.sites].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de', { numeric: true }));
  const noun = importNoun(cfg);
  const G = siteGrammar(spec);
  const freeSitesWord = cfg.labels.freeSites ?? { one: `${S.one} (aktiv)`, many: `${S.many} (aktiv)`, inactive: 'pausierte' };
  return {
    noun,
    fields,
    required: siteMode ? [] : [BASE.name],
    fallbackMapping: { [siteMode ? BASE.site : BASE.name]: 0 },
    columns: [S.one],
    notice: siteMode
      ? `${W.insp.many} werden nicht übernommen: Eine ${W.insp.one} ist ein Nachweis mit Uhrzeit, GPS-Stempel und Prüfcode und entsteht nur in der App oder unter „Vor Ort“. Neue ${S.many} stehen deshalb bis zur ersten ${W.insp.one} auf „noch nie geprüft“; eine letzte ${W.insp.one} aus der Liste kommt als Vermerk in ihre Notizen. Zeilen ohne ${U.one} legen nur ${G.den} ${S.one} an.`
      : `${W.insp.many} werden nicht übernommen: Eine ${W.insp.one} ist ein Nachweis mit Uhrzeit, GPS-Stempel und Prüfcode und entsteht nur in der App oder unter „Vor Ort“. Die neuen ${U.many} stehen deshalb bis zur ersten ${W.insp.one} auf „noch nie geprüft“. Steht in der Liste eine letzte ${W.insp.one}, kommt sie als Vermerk in die Notizen.`,
    choice: (mapping) => {
      const hasCol = mapping[BASE.site] !== undefined;
      const options = sorted.map((s) => ({ value: s.id, label: s.active ? s.name : `${s.name} (pausiert)` }));
      return {
        label: hasCol ? `${S.one} für Zeilen ohne ${S.one}` : `In ${G.welchen} ${S.one}?`,
        hint: hasCol
          ? siteMode
            ? `Unbekannte ${S.many} werden angelegt, vorhandene bleiben, wie sie sind.`
            : `Zeilen mit ${S.one} kommen an ${G.ihren} ${S.one}; unbekannte ${S.many} werden mit angelegt.`
          : options.length
            ? `Die Liste hat keine Spalte „${S.one}“ — alle ${U.many} kommen an ${G.gewaehlt} ${S.one}.`
            : `Es gibt noch ${G.keinen} ${S.one}. Bitte zuerst ${G.einen} anlegen — oder in der Liste eine Spalte „${S.one}“ ergänzen.`,
        options: [{ value: '', label: hasCol ? '— Zeile nicht übernehmen —' : `— ${S.one} wählen —` }, ...options],
        value: !hasCol && options.length === 1 ? options[0].value : '',
      };
    },
    plan: ({ table, hasHeader, mapping, choice }) =>
      planUnits(spec, { table, hasHeader, mapping, target: choice, sites: data.sites, units: data.units }),
    allowance: siteMode ? null : data.allowance,
    limitText: (allowance) =>
      `${
        allowance === 0
          ? `Dein Betrieb hat die Gratis-Grenze schon erreicht (${plural(data.count, U.one, U.many)}) — angelegt wird jetzt nichts.`
          : `Angelegt ${allowance === 1 ? 'wird' : 'werden'} jetzt nur ${allowance === 1 ? 'die erste' : `die ersten ${allowance}`} der Auswahl.`
      } ${gateText(cfg)}`,
    // Orts-Apps: die Grenze gilt für neue aktive Orte, nicht für Zeilen — Einheiten-Apps: allowance/limitText
    limitFor: !siteMode
      ? undefined
      : (plan, selected) => {
          const fin = finalizeUnits(spec, plan as UnitPlan<I>, selected, data, data.allowance, data.siteAllowance ?? null);
          const count = fin.units.length;
          if (!fin.overLimit) return { count, text: null };
          const sa = data.siteAllowance ?? 0;
          return {
            count,
            text: `${
              sa === 0
                ? `Dein Betrieb hat schon ${plural(data.activeSites ?? 0, freeSitesWord.one, freeSitesWord.many)} — wie beim Anlegen von Hand kommen jetzt keine neuen ${S.many} dazu, auch keine ${freeSitesWord.inactive}n, und damit auch nicht ihre ${U.many}.${
                    fin.units.some((u) => !u.row.payload!.onlySite && !u.newSite) ? ` ${U.many} an vorhandenen ${dativePlural(S.many)} werden angelegt.` : ''
                  }`
                : `Angelegt ${sa === 1 ? 'wird' : 'werden'} jetzt nur ${sa === 1 ? `${G.erste} ${S.one}` : `die ersten ${sa} neuen ${S.many}`} mit ${sa === 1 ? G.sein : 'ihren'} ${dativePlural(U.many)}.`
            } ${plural(fin.overLimit, noun.one, noun.many)} ${fin.overLimit === 1 ? 'entfällt' : 'entfallen'}. ${siteGateText(cfg)}`,
          };
        },
    template: () =>
      downloadXlsx(`${cfg.appName}_${siteMode ? S.many : U.many}_Vorlage`, templateSheets(spec), {
        title: `${cfg.appName} Vorlage ${siteMode ? S.many : U.many}`,
        creator: `Dexware ${cfg.appName}`,
      }),
    async write(plan, selected, _choice, progress) {
      progress({ label: `${siteMode ? S.many : U.many} werden geprüft …`, done: 0, total: 0 });
      const fresh = await loadUnitImport(def, sb);
      const fin = finalizeUnits(spec, plan as UnitPlan<I>, selected, fresh, fresh.allowance, fresh.siteAllowance ?? null);
      const failed: InsertFailure[] = [];
      const strip = /^[^:]+ konnten nicht angelegt werden: /;

      // 1. neue Standorte (Orts-Modus: mit Betreiber, Notizen, Status aus der Liste)
      const siteItems = fin.newSites.map((ns) => ({
        ns,
        row: siteMode
          ? api.siteRow(org.id, ns.name, ns.address, { operator: ns.operator ?? null, contact: ns.contact ?? null, notes: ns.notes ?? null, active: ns.active ?? true })
          : api.siteRow(org.id, ns.name, ns.address),
      }));
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

      // 2. Einheiten (an Standorten, die es gibt bzw. eben angelegt wurden); Zeilen „nur der Ort“ sind damit erledigt
      const unitItems: { u: FinalUnit<I>; row: R }[] = [];
      let sitesOnly = 0;
      for (const u of fin.units) {
        const siteId = u.siteId ?? (u.newSite ? siteIds.get(u.newSite) : undefined);
        if (u.row.payload!.onlySite) {
          if (siteId) sitesOnly++;
          continue;
        }
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
      if (siteIds.size) notes.push(`${plural(siteIds.size, `${G.neu} ${S.one}`, `neue ${S.many}`)} angelegt.`);
      if (siteMode && res.ok.length) notes.push(`${plural(res.ok.length, U.one, U.many)} angelegt.`);
      if (fin.already) notes.push(`${plural(fin.already, `${noun.one} war`, `${noun.many} waren`)} inzwischen schon vorhanden und ${fin.already === 1 ? 'wurde' : 'wurden'} nicht noch einmal angelegt.`);
      if (fin.overLimit) notes.push(`${plural(fin.overLimit, noun.one, noun.many)} nicht angelegt — Gratis-Grenze erreicht.`);
      if (siteMode ? siteIds.size : res.ok.length) {
        notes.push(`Die neuen ${siteMode ? S.many : U.many} stehen bis zur ersten ${W.insp.one} in der App auf „noch nie geprüft“.`);
      }
      const result: ImportResult = { created: res.ok.length + sitesOnly, failed, notes };
      return result;
    },
  };
}
