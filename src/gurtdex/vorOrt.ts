// GurtDex-Konfiguration für „Vor Ort“ (src/pruefen): alles aus types.ts gespeist — Checkliste, Prüfarten,
// Ampel-Stufen und die Ablegereife-Regel werden nur dort gepflegt. Maßstab ist die App
// (mobile/src/screens/InspectionScreen.tsx).
// Besonderheit Ablegereife: Ist die Hersteller-Gebrauchsdauer überschritten (Herstellungsdatum + max. Jahre), steht
// der Checklisten-Punkt „Ablegereife & Gebrauchsdauer“ von Anfang an auf Mangel und eine rote Warnkarte erklärt es.
// Importe mit Dateiendung: Der Schema-Test (tests/pruefen-vor-ort.test.mjs) lädt genau diese Datei mit Node.

import type { PruefConfig, UnitAlert } from '../pruefen/config.ts';
import {
  CHECKLIST,
  INSPECTION_HINTS,
  INSPECTION_LABELS,
  INSPECTION_SHORT,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  SEVERITY_SHORT,
  expertIntervalDays,
  lifespanExpired,
  lifespanWarning,
  type DefectSeverity,
  type InspectionType,
} from './types.ts';

/** Gratis-Grenze wie in der App (mobile/src/lib/entitlement.ts → FREE_LIMITS.items). */
export const FREE_ITEMS = 2;

// PSAgA: Orange = bis zur Klärung nicht benutzen, Rot = Ablegekriterium erfüllt (Rückfragen wortgleich zur App).
const BLOCK_QUESTION: Partial<Record<DefectSeverity, string>> = {
  amber: 'Bis zur Klärung durch den Hersteller darf der Artikel nicht benutzt werden. Ist er gesperrt?',
  red: 'Ablegekriterium erfüllt: Der Artikel muss sofort der Benutzung entzogen, gekennzeichnet und ausgesondert werden. Ist das erledigt?',
};

/** Checklisten-Punkt, den die Ablegereife betrifft (wie in der App: `lifetime`). */
const LIFETIME_POINT = 'lifetime';
const LIFETIME_LABEL = CHECKLIST.find((c) => c.id === LIFETIME_POINT)?.label ?? 'Ablegereife & Gebrauchsdauer';

const text = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

/** Ablegereif? Dann Warnkarte + Vorbelegung „Mangel“ — gleiche Regel wie die App (lifespanExpired). */
export function lifetimeAlert(row: Record<string, unknown>): UnitAlert | null {
  const item = {
    manufacture_date: text(row.manufacture_date),
    max_life_years: text(row.max_life_years),
    category: String(row.category ?? ''),
  };
  if (!lifespanExpired(item)) return null;
  return {
    badge: 'Ablegereif',
    text: lifespanWarning(item) ?? 'Maximale Gebrauchsdauer laut Hersteller überschritten.',
    formHint: `Der Punkt „${LIFETIME_LABEL}“ ist deshalb auf Mangel gestellt — bitte als Rot-Mangel mit Sperre erfassen.`,
    checklist: { [LIFETIME_POINT]: 'defect' },
    doneText: 'Ablegereif — Artikel aussondern, nicht wieder benutzen.',
  };
}

export const GURTDEX_VOR_ORT: PruefConfig = {
  appId: 'gurtdex',
  appName: 'GurtDex',
  tables: { site: 'site', unit: 'psa_item', inspection: 'inspection', defect: 'defect' },
  cols: { unitFk: 'item_id', blocked: 'item_blocked', retired: 'retired' },
  // ohne photo_url (Referenzfoto als Daten-URI — für die Liste viel zu groß); Herstellungsdatum und
  // Gebrauchsdauer braucht die Ablegereife-Regel
  unitSelect: 'id, site_id, name, category, serial_no, wearer_name, manufacture_date, max_life_years, retired',
  // wie in der App: „Auffanggurt (EN 361) · Nr. 23-B-0815“, dazu die Trägerin/der Träger (persönliche PSA)
  unitInfo: (r) =>
    [r.category, r.serial_no ? `Nr. ${String(r.serial_no)}` : '', r.wearer_name ? `Träger/in: ${String(r.wearer_name)}` : '']
      .filter(Boolean)
      .join(' · '),
  unitAlert: lifetimeAlert,
  labels: {
    site: { one: 'Standort', many: 'Standorte' },
    unit: { one: 'PSA-Artikel', many: 'PSA-Artikel', full: 'PSA-Artikel', which: 'Welcher Artikel?' },
    blocked: 'Der Benutzung entzogen (gekennzeichnet)',
    blockedAsk: 'Artikel gesperrt?',
    blockedYes: 'Ja, gesperrt',
    blockedShort: 'Artikel gesperrt',
    checklist: 'Checkliste (DGUV G 312-906 / EN 365)',
    defectTitleExample: 'z. B. Falldämpfer ausgelöst',
    qualificationExample: 'z. B. Sachkundiger PSAgA (DGUV G 312-906)',
    notesExample: 'z. B. Gurtband gereinigt, Prüfplakette erneuert',
    defectDescriptionExample: 'Details für Hersteller-Instandsetzung oder Ersatz (Stelle am Gurt, Bauteil …)',
    naExample: 'HSG-Punkt bei einem Auffanggurt',
    report: 'Prüfprotokoll-PDF',
  },
  checklist: CHECKLIST,
  kinds: (Object.keys(INSPECTION_LABELS) as InspectionType[]).map((id) => ({
    id,
    label: INSPECTION_LABELS[id],
    short: INSPECTION_SHORT[id],
    hint: INSPECTION_HINTS[id],
  })),
  dueKind: 'expert',
  // Sachkundigen-Prüfung von PSA gegen Absturz: im ganzen DACH-Raum jährlich (365 Tage).
  dueIntervalDays: (org) => expertIntervalDays(typeof org.land === 'string' ? org.land : null),
  severities: (Object.keys(SEVERITY_LABELS) as DefectSeverity[]).map((id) => ({
    id,
    label: SEVERITY_LABELS[id],
    short: SEVERITY_SHORT[id],
    hint: SEVERITY_HINTS[id],
    tone: id,
    blockQuestion: BLOCK_QUESTION[id],
  })),
  defaultSeverity: 'amber',
  freeUnits: FREE_ITEMS,
  proHow: 'Pro schließt du in der GurtDex-App unter „Abo“ ab. Fragen dazu? Schreib uns an support@dexware.app.',
  photoFolders: { inspection: 'inspection', defect: 'defect' },
};

/** Beispiel-Stammdaten für /app/gurtdex/vor-ort?demo (nur Dev-Server) — der erste Artikel ist ablegereif. */
export const GURTDEX_DEMO_ROWS: Record<string, unknown>[] = [
  { name: 'Gurt 1 — Kolonne Süd', category: 'Auffanggurt (EN 361)', serial_no: '14-A-0311', wearer_name: 'M. Krause', manufacture_date: '2014-03', max_life_years: '10' },
  { name: 'Gurt 2 — Kolonne Süd', category: 'Auffanggurt (EN 361)', serial_no: '23-B-0815', wearer_name: null, manufacture_date: '2023-04', max_life_years: '10' },
  { name: 'HSG 1', category: 'Höhensicherungsgerät (EN 360)', serial_no: 'H-2201', wearer_name: null, manufacture_date: '2022-01', max_life_years: null },
  { name: 'Verbindungsmittel 1', category: 'Verbindungsmittel mit Falldämpfer (EN 354/355)', serial_no: null, wearer_name: null, manufacture_date: '05/2015', max_life_years: '8' },
];
