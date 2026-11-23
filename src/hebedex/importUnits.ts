// HebeDex — Anschlag-, Lastaufnahme- und Zurrmittel aus einer Excel-/CSV-Liste übernehmen (Adapter). Ablauf, Regeln und
// Oberfläche: pruefen/importUnits.ts + components/ImportWizard.tsx. Hier nur die HebeDex-Felder (wie Formular und
// Prüfbuch-Export) und das Schreiben über api.ts (siteRow/itemRow = dieselben Zeilen wie beim Anlegen von Hand).
// Wie das Formular: Nenndicke nur bei Ketten und Drahtseilen, Seilart nur bei Drahtseilen, Tragfähigkeit „2 t“/„750 kg“.

import { cap, headerKey, oneLine, pickOption, type ImportField } from '../lib/tableImport';
import type { UnitImportDef, UnitImportSpec } from '../pruefen/importUnits';
import { fetchItems, fetchSites, insertItems, insertSites, itemRow, siteRow, type ItemInput } from './api';
import { HEBEDEX_EXPORT } from './exportLists';
import { HEBEDEX_VOR_ORT } from './vorOrt';
import { ITEM_KINDS, ROPE_KIND_LABELS, WLL_COLORS, fmtWll, kindInfo, parseWll, type ItemKind, type LiftingItem, type Site } from './types';

/** Stammdaten eines Teils ohne Standort, Notizen und Aussonderung */
export type ItemData = Omit<ItemInput, 'site_id' | 'notes' | 'retired' | 'retire_reason'>;

const KIND_DEFAULT: ItemKind = 'other';

/** Andere Schreibweisen der Teil-Typen — „Zurrkette“ vor „Kette“, „Kettenzug“ vor „Kette“ (längere Wörter gewinnen) */
const KIND_SYNONYMS: Record<string, string[]> = {
  chain: ['kette', 'ketten', 'anschlagkette', 'kettengehaenge', 'rundstahlkette', 'gk8', 'gk10', 'chain'],
  webbing_sling: ['hebeband', 'hebebaender', 'bandschlinge', 'flachband', 'flachschlinge', 'webbingsling'],
  round_sling: ['rundschlinge', 'rundschlingen', 'roundsling'],
  wire_rope: ['drahtseil', 'stahlseil', 'seil', 'seilgehaenge', 'drahtseilgehaenge', 'anschlagseil'],
  shackle: ['schaekel', 'schakel', 'shackle'],
  hook: ['haken', 'lasthaken', 'wirbel', 'wirbelhaken', 'sicherheitshaken', 'hook'],
  beam: ['traverse', 'lastaufnahmemittel', 'hebebalken', 'spreader', 'lastaufnahme'],
  clamp: ['klemme', 'hebeklemme', 'blechklemme', 'blechhebeklemme', 'clamp'],
  hoist: ['kettenzug', 'flaschenzug', 'hebezeug', 'seilzug', 'hubzug', 'mehrzweckzug', 'kettenflaschenzug', 'hoist'],
  lashing_strap: ['zurrgurt', 'spanngurt', 'ratschengurt', 'zurrgurte', 'spanngurte', 'lashing'],
  lashing_chain: ['zurrkette', 'zurrketten', 'spannkette'],
  other: ['sonstiges', 'sonstige', 'andere'],
};

const COLOR_SYNONYMS: Record<string, string[]> = {
  violett: ['lila', 'purple', 'violet'],
  grün: ['gruen', 'green'],
  gelb: ['yellow'],
  grau: ['gray', 'grey'],
  rot: ['red'],
  braun: ['brown'],
  blau: ['blue'],
  orange: [],
};

const ROPE_SYNONYMS: Record<string, string[]> = {
  strand: ['litze', 'litzen', 'litzenseil', 'strand'],
  cable: ['kabelschlag', 'kabelschlagseil', 'kabel', 'cable'],
};

const KIND_OPTIONS = ITEM_KINDS.map((k) => ({ value: k.id, label: k.label }));
const COLOR_OPTIONS = WLL_COLORS.map((c) => ({ value: c, label: c }));
const ROPE_OPTIONS = (['strand', 'cable'] as const).map((id) => ({ value: id, label: ROPE_KIND_LABELS[id] }));

/** Felder in der Reihenfolge des Formulars — Überschriften wie Formular und Prüfbuch-Export */
const FIELDS: ImportField[] = [
  { key: 'kind', label: 'Typ', exact: ['typ', 'teiletyp', 'art', 'teilart', 'bauart', 'kategorie', 'anschlagmittel', 'mittel'], prefix: ['typ', 'teiletyp'] },
  {
    key: 'wll',
    label: 'Tragfähigkeit WLL / Zurrkraft LC (kg)',
    hint: 'z. B. „2 t“ oder „750 kg“',
    exact: ['tragfaehigkeitwllzurrkraftlckg', 'tragfaehigkeitwllbzwzurrkraftlc', 'tragfaehigkeit', 'tragfaehigkeitwll', 'wll', 'tragkraft', 'zurrkraft', 'lc', 'tragfaehigkeitkg', 'tragfaehigkeitt', 'nutzlast'],
    prefix: ['tragfaehigkeit', 'tragkraft', 'wll', 'zurrkraft'],
  },
  { key: 'length_m', label: 'Nutzlänge (m)', exact: ['nutzlaengem', 'nutzlaenge', 'laenge', 'laengem'], prefix: ['nutzlaenge', 'laenge'] },
  {
    key: 'nominal_mm',
    label: 'Nenndicke / Seildurchmesser (mm)',
    hint: 'nur Ketten und Drahtseile',
    exact: ['nenndickeseildurchmessermm', 'nenndicke', 'nenndickemm', 'seildurchmesser', 'seildurchmessermm', 'durchmesser', 'nenndurchmesser', 'kettendicke'],
    prefix: ['nenndicke', 'seildurchmesser', 'nenndurchmesser'],
  },
  { key: 'rope_kind', label: 'Drahtseil-Bauart', hint: 'nur Drahtseile', exact: ['drahtseilbauart', 'seilart', 'seilbauart', 'seiltyp'], prefix: ['drahtseilbauart', 'seilart'] },
  { key: 'color', label: 'Farbe', exact: ['farbe', 'farbcode', 'farbeen1492'], prefix: ['farbe'] },
  { key: 'manufacturer', label: 'Hersteller', exact: ['hersteller', 'marke', 'fabrikat', 'firma'], prefix: ['hersteller', 'fabrikat'] },
  {
    key: 'serial_no',
    label: 'Etikett- / Seriennummer',
    exact: ['etikettseriennummer', 'seriennummer', 'seriennr', 'snr', 'etikettnummer', 'inventarnummer', 'inventarnr', 'identnummer', 'kennnummer'],
    prefix: ['seriennummer', 'etikett', 'inventar'],
  },
  { key: 'build_year', label: 'Herstelljahr', exact: ['herstelljahr', 'baujahr', 'herstellungsjahr', 'jahr'], prefix: ['herstell', 'baujahr'] },
];

const text = (s: string, n: number) => {
  const v = cap(oneLine(s), n);
  return v ? v : null;
};

/** Tragfähigkeit wie das Formular (parseWll: „2 t“, „750 kg“, Zahl ≤ 100 = Tonnen) — steht „kg“ bzw. „(t)“ im Spaltenkopf, gilt diese Einheit für reine Zahlen. */
export function wllFromCell(raw: string, header: string): number | null | undefined {
  const t = oneLine(raw);
  if (!t) return null;
  if (/^\d+(?:[.,]\d+)?$/.test(t)) {
    const n = parseFloat(t.replace(',', '.'));
    if (/kg/.test(headerKey(header)) && n > 0) return Math.round(n);
    if (/\(\s*t\s*\)/i.test(header) && n > 0) return Math.round(n * 1000);
  }
  return parseWll(t);
}

export const HEBEDEX_IMPORT_SPEC: UnitImportSpec<LiftingItem, ItemData> = {
  cfg: HEBEDEX_VOR_ORT,
  dueName: HEBEDEX_EXPORT.dueName,
  retiredHeader: HEBEDEX_EXPORT.retiredHeader,
  nameLabel: 'Nummer / Bezeichnung',
  nameHeaders: ['nummer', 'nummerbezeichnung', 'teilenummer', 'teilnummer'],
  fields: FIELDS,
  serialKey: 'serial_no',
  serialOf: (u) => u.serial_no,
  build(get, headerOf) {
    const hints: string[] = [];
    const k = pickOption(get('kind'), KIND_OPTIONS, KIND_SYNONYMS, KIND_DEFAULT);
    const kind = k.value as ItemKind;
    const other = kindInfo(KIND_DEFAULT).label;
    if (k.how === 'unknown') hints.push(`Typ „${oneLine(get('kind'))}“ unbekannt → ${other}`);
    if (k.how === 'empty') hints.push(`Typ fehlt → ${other}`);
    const info = kindInfo(kind);

    const wllRaw = get('wll');
    const wll = wllFromCell(wllRaw, headerOf('wll'));
    if (wll === undefined) hints.push(`Tragfähigkeit „${oneLine(wllRaw)}“ nicht erkannt — leer gelassen`);

    const nominalRaw = text(get('nominal_mm'), 20);
    if (nominalRaw && !info.sizeLabel) hints.push('Nenndicke nur bei Ketten und Drahtseilen — weggelassen');

    let rope: ItemData['rope_kind'] = null;
    if (kind === 'wire_rope') {
      const r = pickOption(get('rope_kind'), ROPE_OPTIONS, ROPE_SYNONYMS, 'strand');
      if (r.how === 'unknown') hints.push(`Seilart „${oneLine(get('rope_kind'))}“ unbekannt → ${ROPE_KIND_LABELS.strand}`);
      rope = r.value as 'strand' | 'cable';
    }

    let color: string | null = null;
    if (get('color')) {
      const c = pickOption(get('color'), COLOR_OPTIONS, COLOR_SYNONYMS, '');
      if (c.value) color = c.value;
      else hints.push(`Farbe „${oneLine(get('color'))}“ unbekannt — leer gelassen`);
    }

    return {
      input: {
        name: cap(oneLine(get('name')), 120),
        kind,
        wll_kg: wll ?? null,
        length_m: text(get('length_m'), 20),
        nominal_mm: info.sizeLabel ? nominalRaw : null,
        rope_kind: rope,
        manufacturer: text(get('manufacturer'), 120),
        serial_no: text(get('serial_no'), 80),
        build_year: text(get('build_year'), 10),
        color,
      },
      hints,
    };
  },
  describe: (e) => [kindInfo(e.kind).label, fmtWll(e.wll_kg), e.length_m ? `${e.length_m} m` : '', e.serial_no ? `Nr. ${e.serial_no}` : '']
    .filter(Boolean)
    .join(' · '),
  example: [
    { site: 'Lager Nord', siteAddress: 'Hafenstraße 3, 20457 Hamburg', name: 'K-001', kind: 'Rundstahlkette', wll: '2 t', length_m: '2', nominal_mm: '10', manufacturer: 'RUD', serial_no: '21-4711', build_year: '2021', lastInspection: '10.02.2026' },
    { site: 'Lager Nord', name: 'HB-012', kind: 'Hebeband', wll: '2000', length_m: '3', color: 'grün', manufacturer: 'Dolezych', serial_no: 'HB-77812', build_year: '2024' },
    { site: 'Montagewagen 2', name: 'ZG-03', kind: 'Zurrgurt', wll: '2500 kg', length_m: '8', manufacturer: 'SpanSet', notes: 'im Fahrzeug' },
  ],
};

export const HEBEDEX_IMPORT: UnitImportDef<LiftingItem, Site, LiftingItem, ItemData> = {
  spec: HEBEDEX_IMPORT_SPEC,
  api: {
    fetchSites,
    fetchUnits: (sb) => fetchItems(sb),
    siteRow: (orgId, name, address) =>
      siteRow(orgId, { name, address, operator_name: null, operator_contact: null, notes: null, active: true }),
    unitRow: (orgId, input, siteId, notes) =>
      itemRow(orgId, { ...input, site_id: siteId, notes, retired: false, retire_reason: null }),
    insertSites,
    insertUnits: insertItems,
  },
};
