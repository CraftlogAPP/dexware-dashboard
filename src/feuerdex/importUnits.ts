// FeuerDex — Feuerlöscher aus einer Excel-/CSV-Liste übernehmen (Adapter). Ablauf, Regeln und Oberfläche:
// pruefen/importUnits.ts + components/ImportWizard.tsx. Hier nur die FeuerDex-Felder (wie Formular und Prüfbuch-Export)
// und das Schreiben über api.ts (siteRow/extinguisherRow = dieselben Zeilen wie beim Anlegen von Hand).
// Löschmittel, Bauart und Füllmenge stehen in Wartungslisten oft in einer Zelle („PG 6“, „CO2 5 kg“, „Schaum 6 l“) —
// das wird auseinandergenommen.

import { cap, oneLine, pickOption, type ImportField, type OptionPick } from '../lib/tableImport';
import type { UnitImportDef, UnitImportSpec } from '../pruefen/importUnits';
import { extinguisherRow, fetchExtinguishers, fetchSites, insertExtinguishers, insertSites, siteRow, type ExtinguisherInput } from './api';
import { FEUERDEX_EXPORT } from './exportLists';
import { FEUERDEX_VOR_ORT } from './vorOrt';
import { EXTINGUISHER_BUILD_TYPES, EXTINGUISHER_CATEGORIES, type Extinguisher, type Site } from './types';

/** Stammdaten eines Löschers ohne Standort, Notizen und „ausgesondert“ */
export type ExtinguisherData = Omit<ExtinguisherInput, 'site_id' | 'notes' | 'retired'>;

const CATEGORY_DEFAULT = 'Sonstige';
const BUILD_DEFAULT = 'Unbekannt';
const PULVER = 'Pulver (ABC)';
const CO2 = 'CO₂ (Kohlendioxid)';
const DAUERDRUCK = 'Dauerdrucklöscher';

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  'Pulver (ABC)': ['abc', 'abcpulver', 'pulverabc', 'pulver', 'pulverloescher', 'abcloescher', 'glutbrandpulver', 'abcpulverloescher', 'pulverloescherabc'],
  'Pulver (BC)': ['bc', 'bcpulver', 'pulverbc', 'bcpulverloescher'],
  'Metallbrand-Pulver (D)': ['metallbrand', 'metallbrandpulver', 'metallbrandloescher', 'brandklassed'],
  Schaum: ['schaum', 'schaumloescher', 'afff', 'nassschaum'],
  Wasser: ['wasser', 'wasserloescher', 'wassernebel', 'wassernebelloescher'],
  'CO₂ (Kohlendioxid)': ['co2', 'kohlendioxid', 'kohlensaeure', 'co2loescher', 'kohlendioxidloescher', 'kohlensaeureloescher'],
  'Fettbrand (F)': ['fettbrand', 'fettbrandloescher', 'fettloescher', 'brandklassef', 'kuechenloescher'],
};

const BUILD_SYNONYMS: Record<string, string[]> = {
  Aufladelöscher: ['auflade', 'aufladeloescher', 'aufladbar', 'patrone', 'treibgas', 'treibgaspatrone', 'aufladeprinzip'],
  Dauerdrucklöscher: ['dauerdruck', 'dauerdruckloescher', 'dd', 'staendigunterdruck', 'dauerdruckprinzip'],
};

/**
 * Kurzzeichen der Hersteller (Typenschild/Wartungsliste): P/PG/PD 6 = Pulver, S/SD 9 = Schaum, W/WD = Wasser,
 * K/KS 5 = CO₂, F/FD = Fettbrand; ein „D“ im Kürzel heißt Dauerdruck (CO₂-Löscher sind immer Dauerdruck).
 */
function shortCode(raw: string): { category: string; dauerdruck: boolean } | null {
  const m = /^\s*(PG|PD|PDE|PU|P|SD|SDE|S|WD|WDE|W|KS|KD|K|FD|FX|F)\s*-?\s*\d/i.exec(raw);
  if (!m) return null;
  const c = m[1].toUpperCase();
  const category = c.startsWith('P') ? PULVER : c.startsWith('S') ? 'Schaum' : c.startsWith('W') ? 'Wasser' : c.startsWith('K') ? CO2 : 'Fettbrand (F)';
  return { category, dauerdruck: c.startsWith('K') || /^.D/.test(c) };
}

/** Füllmenge als Zahl wie im Formular („6“, „6,5“) — aus „6 kg“, „6 l“ oder aus der Löschmittel-Zelle („PG 6“, „CO2 5 kg“). */
export function fillingOf(raw: string): string | null {
  const s = raw.replace(/co\s*2|co₂/gi, ' ').replace(/\([^)]*\)/g, ' ');
  const m = /(\d+(?:[.,]\d+)?)\s*(?:kg|l|ltr|liter)?\b/i.exec(s);
  return m ? m[1] : null;
}

const options = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));
const text = (s: string, n: number) => {
  const v = cap(oneLine(s), n);
  return v ? v : null;
};

/** Felder in der Reihenfolge des Formulars — Überschriften wie Formular und Prüfbuch-Export */
const FIELDS: ImportField[] = [
  { key: 'category', label: 'Löschmittel', exact: ['loeschmittel', 'loeschmittelart', 'art', 'typ', 'loeschertyp', 'loescherart', 'kategorie', 'brandklasse'], prefix: ['loeschmittel', 'loescherart', 'loeschertyp'] },
  { key: 'build_type', label: 'Bauart', exact: ['bauart', 'bauform', 'prinzip', 'funktionsprinzip', 'druckart'], prefix: ['bauart', 'funktionsprinzip'] },
  { key: 'manufacturer', label: 'Hersteller', exact: ['hersteller', 'marke', 'fabrikat', 'firma'], prefix: ['hersteller', 'fabrikat'] },
  {
    key: 'purchase_year',
    label: 'Baujahr (Typenschild)',
    exact: ['baujahr', 'herstelljahr', 'herstellungsjahr', 'anschaffungsjahr', 'jahr', 'bj'],
    prefix: ['baujahr', 'herstelljahr', 'herstellungsjahr'],
  },
  {
    key: 'filling_kg',
    label: 'Füllmenge (kg bzw. l)',
    exact: ['fuellmenge', 'fuellmengekg', 'fuellmengekgbzwl', 'inhalt', 'loeschmittelmenge', 'menge', 'kg', 'groesse', 'fuellung'],
    prefix: ['fuellmenge', 'loeschmittelmenge', 'inhalt'],
  },
  {
    key: 'rating_le',
    label: 'Löschmitteleinheiten (LE)',
    exact: ['loeschmitteleinheitenle', 'loeschmitteleinheiten', 'loeschmitteleinheit', 'le', 'loescheinheiten', 'loescheinheit'],
    prefix: ['loeschmitteleinheit', 'loescheinheit'],
  },
];

export const FEUERDEX_IMPORT_SPEC: UnitImportSpec<Extinguisher, ExtinguisherData> = {
  cfg: FEUERDEX_VOR_ORT,
  dueName: FEUERDEX_EXPORT.dueName,
  retiredHeader: FEUERDEX_EXPORT.retiredHeader,
  nameLabel: 'Bezeichnung',
  nameHeaders: ['loeschernummer', 'loeschernr', 'feuerloeschernummer', 'inventarnummer', 'inventarnr', 'nummer', 'nr', 'standortnummer'],
  fields: FIELDS,
  build(get) {
    const hints: string[] = [];
    // „CO₂“ mit tiefgestellter Zwei wie „CO2“ (headerKey ließe sonst nur „co“ übrig)
    const catRaw = oneLine(get('category')).replace(/₂/g, '2');
    const code = shortCode(catRaw);
    const cat: OptionPick = code ? { value: code.category, how: 'synonym' } : pickOption(catRaw, options(EXTINGUISHER_CATEGORIES), CATEGORY_SYNONYMS, CATEGORY_DEFAULT);
    if (cat.how === 'unknown') hints.push(`Löschmittel „${catRaw}“ unbekannt → ${CATEGORY_DEFAULT}`);
    if (cat.how === 'empty') hints.push(`Löschmittel fehlt → ${CATEGORY_DEFAULT}`);
    // Bauart: eigene Spalte, sonst aus der Löschmittel-Zelle („Pulver Dauerdruck 6 kg“) bzw. dem Kürzel („PD 6“, CO₂)
    const buildRaw = oneLine(get('build_type'));
    let build: string;
    if (buildRaw) {
      const b = pickOption(buildRaw, options(EXTINGUISHER_BUILD_TYPES), BUILD_SYNONYMS, BUILD_DEFAULT);
      if (b.how === 'unknown') hints.push(`Bauart „${buildRaw}“ unbekannt → ${BUILD_DEFAULT}`);
      build = b.value;
    } else {
      const b = pickOption(catRaw, options(EXTINGUISHER_BUILD_TYPES), BUILD_SYNONYMS, '');
      build = b.how === 'synonym' || b.how === 'contains' ? b.value : code?.dauerdruck || cat.value === CO2 ? DAUERDRUCK : BUILD_DEFAULT;
    }
    const fillRaw = oneLine(get('filling_kg'));
    const filling = fillRaw ? (fillingOf(fillRaw) ?? cap(fillRaw, 20)) : catRaw ? fillingOf(catRaw) : null;
    const le = oneLine(get('rating_le'));
    return {
      input: {
        name: cap(oneLine(get('name')), 120),
        category: cat.value,
        build_type: build,
        manufacturer: text(get('manufacturer'), 120),
        purchase_year: text(get('purchase_year'), 10),
        filling_kg: filling,
        rating_le: le ? (/^\s*(\d+(?:[.,]\d+)?)\s*(?:le)?\s*$/i.exec(le)?.[1] ?? cap(le, 20)) : null,
      },
      hints,
    };
  },
  describe: (e) => [e.category, e.build_type !== BUILD_DEFAULT ? e.build_type : '', e.filling_kg ? `${e.filling_kg} kg/l` : '', e.rating_le ? `${e.rating_le} LE` : '']
    .filter(Boolean)
    .join(' · '),
  example: [
    { site: 'Bürogebäude', siteAddress: 'Hauptstraße 1, 8010 Graz', name: 'F-001 Eingang', category: 'Pulver (ABC)', build_type: 'Dauerdrucklöscher', manufacturer: 'Gloria', purchase_year: '2020', filling_kg: '6', rating_le: '10', lastInspection: '12.05.2025' },
    { site: 'Bürogebäude', name: 'F-002 Serverraum', category: 'CO2', filling_kg: '5', manufacturer: 'Minimax' },
    { site: 'Werkstatt', name: 'F-003 Werkbank', category: 'Schaum 6 l', build_type: 'Aufladelöscher', notes: 'hinter der Tür' },
  ],
};

export const FEUERDEX_IMPORT: UnitImportDef<Extinguisher, Site, Extinguisher, ExtinguisherData> = {
  spec: FEUERDEX_IMPORT_SPEC,
  api: {
    fetchSites,
    fetchUnits: (sb) => fetchExtinguishers(sb),
    siteRow: (orgId, name, address) =>
      siteRow(orgId, { name, address, operator_name: null, operator_contact: null, notes: null, active: true }),
    unitRow: (orgId, input, siteId, notes) => extinguisherRow(orgId, { ...input, site_id: siteId, notes, retired: false }),
    insertSites,
    insertUnits: insertExtinguishers,
  },
};
