// ObjektDex — Objekte aus einer Excel-/CSV-Liste übernehmen (Dashboard, nur Inhaber). Reine Logik ohne React; Oberfläche
// components/ImportWizard.tsx, Lesen der Liste lib/tableImport.ts.
//
// Muster und Zeilen-Plan wie der WinterDex-Import (winterdex/importObjects.ts → buildPlan): Adresse ist Pflicht (komplett oder
// Straße/Hausnummer/PLZ/Ort), fehlt der Name, heißt das Objekt wie Straße + Hausnummer; gleicher Name + gleiche Adresse wie
// ein vorhandenes Objekt = „schon vorhanden“, doppelte Zeilen nur einmal angehakt. Damit passt die Objektliste aus WinterDex
// (Excel, Blatt „Objekte“) direkt — ihre Spalten Flächen und Breiten-/Längengrad werden mitgenommen.
// Unterschiede zu WinterDex (Plan 5.6): Flächen kommen in die Notiz („Flächen: …“), Pflichtzeiten entfallen, dazu
// „Ansprechpartner vor Ort“ und Koordinaten. Angelegt wird immer aktiv (eine Saison-Pause aus WinterDex gilt hier nicht).
// Gratis-Grenze wie die App (2 aktive Objekte; der Server prüft sie nicht), Pro-Auskunft unklar = Gratis-Grenze.
// Geschrieben wird mit festen ids in Paketen (insertInChunks, 23505 bei einer Zeile = angelegt).

import { sameAddress, buildPlan, FIELDS as WD_FIELDS, type Mapping as WdMapping } from '../winterdex/importObjects';
import {
  cap,
  cellOf,
  cmpKey,
  countStatus,
  dataRows,
  insertInChunks,
  oneLine,
  type ImportAdapter,
  type ImportField,
  type ImportPlan,
  type ImportPlanRow,
  type ImportStatus,
  type Mapping,
  type Table,
} from '../lib/tableImport';
import { downloadXlsx, type XlsxSheet } from '../lib/xlsx';
import type { OdData } from './data';
import type { OdProperty } from './types';
import { GRATIS_OBJEKTE, gratisRahmen, koordinaten, notizMitFlaechen, type OdObjektNeu } from './uebernahme';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
const STRIP = /^[^:]+ konnten nicht angelegt werden: /;

/** Eine Zeile für ObjektDex.property (ohne id/org_id) */
export type OdImportZeile = Omit<OdObjektNeu, 'id'>;

// ---------------------------------------------------------------------------- Felder

const WD_KEYS = ['name', 'address', 'street', 'houseNo', 'zip', 'city', 'customer', 'contact', 'phone', 'email', 'areas', 'notes'] as const;

/** Felder wie der WinterDex-Import (ohne Pflichtzeiten) plus Ansprechpartner vor Ort und Koordinaten */
export const OD_FIELDS: ImportField[] = [
  ...WD_KEYS.map((k): ImportField => {
    const f = WD_FIELDS.find((x) => x.key === k)!;
    if (k === 'contact') return { ...f, label: 'Kontakt (Auftraggeber)', hint: 'Telefon und E-Mail kommen dazu' };
    if (k === 'areas') return { ...f, hint: 'kommt in die Notiz („Flächen: …“)' };
    return f;
  }),
  {
    key: 'contactPerson',
    label: 'Ansprechpartner vor Ort',
    hint: 'z. B. Hausmeister, Beirat',
    exact: ['ansprechpartnervorort', 'kontaktvorort', 'vorort', 'ansprechpersonvorort', 'ansprechpartnerimobjekt', 'hausmeister', 'hauswart'],
    prefix: ['ansprechpartnervorort', 'kontaktvorort', 'ansprechpersonvorort'],
  },
  { key: 'lat', label: 'Breitengrad', hint: 'mit Längengrad: Lage auf der Karte', exact: ['breitengrad', 'lat', 'latitude', 'geobreite'] },
  { key: 'lng', label: 'Längengrad', exact: ['laengengrad', 'lng', 'lon', 'long', 'longitude', 'geolaenge'] },
];

/** Zahl aus einer Zelle („47,0707“ oder „47.0707“) — sonst null */
function zahl(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  return Number(s);
}

// ---------------------------------------------------------------------------- Plan

export function planObjekte(args: { table: Pick<Table, 'rows' | 'lines'>; hasHeader: boolean; mapping: Mapping; existing: Pick<OdProperty, 'name' | 'address'>[] }): ImportPlan<OdImportZeile> {
  const wd = buildPlan({ table: args.table, hasHeader: args.hasHeader, mapping: args.mapping as WdMapping, land: 'DE', existing: args.existing });
  const daten = dataRows(args.table, args.hasHeader);
  const STATUS: Record<string, ImportStatus> = { ok: 'ok', missing: 'skip', exists: 'exists', dup: 'dup' };
  const mitKoordinaten = args.mapping.lat !== undefined && args.mapping.lng !== undefined;
  const rows = wd.rows.map((r): ImportPlanRow<OdImportZeile> => {
    const cells = daten[r.i]?.cells ?? [];
    const hints: string[] = [];
    let lat: number | null = null;
    let lng: number | null = null;
    if (mitKoordinaten) {
      const rawLat = cellOf(cells, args.mapping, 'lat');
      const rawLng = cellOf(cells, args.mapping, 'lng');
      if (rawLat || rawLng) {
        ({ lat, lng } = koordinaten(zahl(rawLat), zahl(rawLng)));
        if (lat === null) hints.push('Koordinaten unvollständig oder ungültig — ohne angelegt');
      }
    }
    const payload: OdImportZeile | null = r.input
      ? {
          name: r.input.name,
          address: r.input.address,
          lat,
          lng,
          customer_name: r.input.customer_name,
          customer_contact: r.input.customer_contact,
          contact_person: cap(oneLine(cellOf(cells, args.mapping, 'contactPerson')), 200) || null,
          notes: notizMitFlaechen(r.input.notes, r.input.areas),
        }
      : null;
    return {
      i: r.i,
      line: r.line,
      status: STATUS[r.status] ?? 'skip',
      reason: r.reason,
      title: r.name,
      sub: r.address,
      cells: [r.customer, lat !== null ? 'ja' : ''],
      hints,
      payload,
    };
  });
  const notes: string[] = [];
  const header = args.hasHeader ? (args.table.rows[0] ?? []) : [];
  if (header.some((h) => /pflichtzeit|mo.?fr|samstag|sonn/i.test(h))) notes.push('Pflichtzeiten (Winterdienst) werden nicht übernommen.');
  return { rows, count: countStatus(rows), notes };
}

// ---------------------------------------------------------------------------- Laden, Grenze, Anlegen

export interface ObjektImportDaten {
  existing: OdProperty[];
  /** Pro laut Server: true/false, null = unklar (dann gilt die Gratis-Grenze) */
  pro: boolean | null;
  /** aktive Objekte (Gratis-Grenze zählt nur aktive — wie die App) */
  aktiv: number;
  /** so viele dürfen neu dazu (null = unbegrenzt) */
  allowance: number | null;
}

export async function ladeObjektImport(data: OdData): Promise<ObjektImportDaten> {
  const [existing, pro] = await Promise.all([data.listProperties(), data.proStatus()]);
  const aktiv = existing.filter((p) => p.active).length;
  return { existing, pro, aktiv, allowance: gratisRahmen(pro, aktiv).objekte };
}

const PRO_TEXT = `Ohne ObjektDex Pro sind ${GRATIS_OBJEKTE} aktive Objekte möglich. Pro schließt du in der ObjektDex-App unter „Abo“ ab.`;

export function limitText(d: Pick<ObjektImportDaten, 'pro' | 'aktiv'>, allowance: number): string {
  const unklar = d.pro === null ? 'Ob dein Betrieb Pro hat, ließ sich gerade nicht prüfen — bis dahin gilt die Gratis-Grenze. ' : '';
  const satz =
    allowance === 0
      ? `Dein Betrieb hat die Gratis-Grenze schon erreicht (${plural(d.aktiv, 'aktives Objekt', 'aktive Objekte')}) — angelegt wird jetzt nichts.`
      : `Angelegt ${allowance === 1 ? 'wird' : 'werden'} jetzt nur ${allowance === 1 ? 'das erste' : `die ersten ${allowance}`} der Auswahl.`;
  return `${unklar}${satz} ${PRO_TEXT}`;
}

/** Gibt es das Objekt (gleicher Name + gleiche Adresse) inzwischen schon? */
export function schonDa(z: Pick<OdImportZeile, 'name' | 'address'>, frisch: readonly Pick<OdProperty, 'name' | 'address'>[]): boolean {
  const n = cmpKey(z.name);
  const a = cmpKey(z.address);
  return frisch.some((p) => cmpKey(p.name) === n && sameAddress(cmpKey(p.address), a));
}

/** Angehakte Zeilen in Listen-Reihenfolge, ohne inzwischen Vorhandenes (bewusst angehakte „schon vorhanden“ bleiben), bis zur Grenze. */
export function endAuswahl(
  plan: ImportPlan<OdImportZeile>,
  selected: ReadonlySet<number>,
  frisch: readonly Pick<OdProperty, 'name' | 'address'>[],
  allowance: number | null,
): { rows: ImportPlanRow<OdImportZeile>[]; already: number; overLimit: number } {
  let already = 0;
  const wanted: ImportPlanRow<OdImportZeile>[] = [];
  for (const r of plan.rows) {
    if (!r.payload || !selected.has(r.i)) continue;
    if (r.status !== 'exists' && schonDa(r.payload, frisch)) {
      already++;
      continue;
    }
    wanted.push(r);
  }
  const rows = allowance === null ? wanted : wanted.slice(0, allowance);
  return { rows, already, overLimit: wanted.length - rows.length };
}

export function objektImportAdapter(data: OdData, d: ObjektImportDaten): ImportAdapter<OdImportZeile> {
  return {
    noun: { one: 'Objekt', many: 'Objekte' },
    fields: OD_FIELDS,
    required: [],
    fallbackMapping: { name: 0, address: 1 },
    columns: ['Auftraggeber', 'Koordinaten'],
    notice:
      'Pflicht ist die Adresse. Flächen kommen in die Notiz („Flächen: …“). Alle Objekte werden aktiv angelegt — Objekte, die du im Sommer nicht betreust, einfach abwählen. Leistungen mit Turnus legst du danach unter „Leistungen für mehrere Objekte“ an.',
    plan: ({ table, hasHeader, mapping }) => planObjekte({ table, hasHeader, mapping, existing: d.existing }),
    allowance: d.allowance,
    limitText: (allowance) => limitText(d, allowance),
    template: () => downloadXlsx('ObjektDex_Objekte_Vorlage', vorlageSheets(), { title: 'ObjektDex Vorlage Objekte', creator: 'Dexware ObjektDex' }),
    async write(plan, selected, _choice, progress) {
      progress({ label: 'Objekte werden geprüft …', done: 0, total: 0 });
      const frisch = await ladeObjektImport(data);
      const fin = endAuswahl(plan, selected, frisch.existing, frisch.allowance);
      const items = fin.rows.map((r) => ({ r, row: { id: crypto.randomUUID(), ...r.payload! } }));
      const res = await insertInChunks(
        items,
        (part) => data.createProperties(part.map((x) => x.row)),
        (x) => ({ line: x.r.line, name: x.r.title }),
        { strip: STRIP, progress: (done) => progress({ label: 'Objekte werden angelegt …', done, total: items.length }) },
      );
      const notes: string[] = [];
      if (fin.already) notes.push(`${plural(fin.already, 'Objekt war', 'Objekte waren')} inzwischen schon vorhanden und ${fin.already === 1 ? 'wurde' : 'wurden'} nicht noch einmal angelegt.`);
      if (fin.overLimit) notes.push(`${plural(fin.overLimit, 'Objekt', 'Objekte')} nicht angelegt — Gratis-Grenze erreicht.`);
      return { created: res.ok.length, failed: res.failed, notes };
    },
  };
}

// ---------------------------------------------------------------------------- Vorlage

export const VORLAGE_SPALTEN = ['Name', 'Straße', 'Hausnummer', 'PLZ', 'Ort', 'Auftraggeber', 'Kontakt', 'Ansprechpartner vor Ort', 'Flächen', 'Notizen'];

export function vorlageSheets(): XlsxSheet[] {
  return [
    {
      name: 'Objekte',
      columns: VORLAGE_SPALTEN.map((header) => ({ header })),
      rows: [
        ['Wohnanlage Beispielgasse', 'Beispielgasse', '12', '8020', 'Graz', 'Hausverwaltung Muster GmbH', 'office@example.com', 'Herr Berger (Hausmeister)', 'Rasen 200 m², Hecke, Stiegenhaus', 'Schlüssel im Schaukasten'],
        ['Volksschule Musterdorf', 'Schulweg', '3', '8200', 'Musterdorf', 'Gemeinde Musterdorf', '0664 0000000', null, 'Pausenhof, Gehweg', null],
      ],
    },
    {
      name: 'Info',
      table: false,
      landscape: false,
      columns: [{ header: '', width: 26 }, { header: '', width: 90 }],
      rows: [
        [{ v: 'ObjektDex · Vorlage für den Objekt-Import', bold: true }],
        [],
        [{ v: 'So geht es', bold: true }, 'Je Objekt eine Zeile, die Beispielzeilen überschreiben. Danach im Dashboard unter „Objekte“ → „aus einer Excel-Liste“ die Datei wählen.'],
        [{ v: 'Pflicht', bold: true }, 'nur die Adresse (Straße und Hausnummer oder eine Spalte „Adresse“). Fehlt der Name, heißt das Objekt wie die Straße.'],
        [{ v: 'Aus WinterDex', bold: true }, 'Die Objektliste aus WinterDex (Excel, Blatt „Objekte“) passt direkt. Flächen kommen in die Notiz, Pflichtzeiten entfallen.'],
        [{ v: 'Vorhandenes', bold: true }, 'Objekte mit gleichem Namen und gleicher Adresse werden erkannt und nicht doppelt angelegt.'],
      ],
    },
  ];
}
