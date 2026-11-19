// RegalDex-Konfiguration für „Vor Ort“ (src/pruefen), Orts-Modus: Die Inspektion hängt am ganzen LAGER
// (inspection.warehouse_id), Schäden nennen die betroffene Regalzeile (damage.rack_id) oder keine („Lager allgemein“).
// Alles aus types.ts gespeist — Checkliste, Inspektionsarten und Ampel-Stufen werden nur dort gepflegt.
// Maßstab ist die App (RegalDex/mobile/src/screens/InspectionScreen.tsx, data/supabaseRepository.ts).
// Importe mit Dateiendung: Der Schema-Test (tests/pruefen-vor-ort.test.mjs) lädt genau diese Datei mit Node.

import type { PruefConfig } from '../pruefen/config.ts';
import {
  CHECKLIST,
  INSPECTION_HINTS,
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_LABELS,
  INSPECTION_SHORT,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  SEVERITY_SHORT,
  type DamageSeverity,
  type InspectionType,
} from './types.ts';

/** Gratis-Grenze wie in der App (mobile/src/lib/entitlement.ts → FREE_LIMITS.warehouses): 1 aktives Lager. */
export const FREE_WAREHOUSES = 1;

// DIN EN 15635: Rot = SOFORT entlasten und sperren — nur dort fragt die App nach (wortgleich).
// Bei Orange gibt es den Sperr-Schalter ohne Rückfrage, bei Grün keinen.
const BLOCK_QUESTION: Partial<Record<DamageSeverity, string>> = {
  red: 'Bei einem roten Schaden muss das Feld sofort entlastet und gesperrt werden. Ist das erledigt?',
};

/** wie in der App (WarehouseDetailScreen → rackInfo): „Palettenregal · Baujahr 2019 · Fachlast 2000 kg · Feldlast 8000 kg“ */
function rackInfo(r: Record<string, unknown>): string {
  const parts = [String(r.category ?? '')];
  if (r.install_year) parts.push(`Baujahr ${String(r.install_year)}`);
  if (r.bay_load_kg) parts.push(`Fachlast ${String(r.bay_load_kg)} kg`);
  if (r.field_load_kg) parts.push(`Feldlast ${String(r.field_load_kg)} kg`);
  return parts.filter(Boolean).join(' · ');
}

export const REGALDEX_VOR_ORT: PruefConfig = {
  appId: 'regaldex',
  appName: 'RegalDex',
  mode: 'site',
  sitesPath: 'lager',
  inspectionsPath: 'inspektionen',
  defectsPath: 'schaeden',
  tables: { site: 'warehouse', unit: 'rack', inspection: 'inspection', defect: 'damage' },
  cols: { siteFk: 'warehouse_id', unitFk: 'rack_id', blocked: 'rack_blocked', retired: 'retired' },
  // ohne photo_url (Referenzfoto als Daten-URI — für die Liste viel zu groß)
  unitSelect: 'id, warehouse_id, name, category, install_year, bay_load_kg, field_load_kg, retired',
  unitInfo: rackInfo,
  labels: {
    site: { one: 'Lager', many: 'Lager' },
    unit: { one: 'Regalzeile', many: 'Regalzeilen', full: 'Regalzeile', which: 'Welche Regalzeile?' },
    inspection: { one: 'Inspektion', many: 'Inspektionen', kind: 'Inspektionsart' },
    defect: { one: 'Schaden', many: 'Schäden', manyDative: 'Schäden' },
    inspectedBy: 'Kontrolliert von',
    severityTitle: 'Gefährdungsstufe (Ampel nach DIN EN 15635)',
    general: 'Lager allgemein',
    freeSites: { one: 'aktives Lager', many: 'aktive Lager', inactive: 'stillgelegte' },
    affected: 'Betroffene Regalzeile',
    blocked: 'Feld/Zeile entlastet & gesperrt',
    blockedAsk: 'Rot: Feld sofort sperren',
    blockedYes: 'Ja, entlastet & gesperrt',
    blockedShort: 'Feld gesperrt',
    checklist: 'Checkliste (DIN EN 15635)',
    defectTitleExample: 'z. B. Stütze verformt — Anfahrschaden',
    defectDescriptionExample: 'Details für die Instandsetzung (Messwert, Position im Regal …)',
    qualificationExample: 'z. B. befähigte Person für Regalinspektionen',
    notesExample: 'z. B. Anfahrschutz Zeile A03 erneuert',
    report: 'Prüfbericht-PDF',
  },
  checklist: CHECKLIST,
  kinds: (Object.keys(INSPECTION_LABELS) as InspectionType[]).map((id) => ({
    id,
    label: INSPECTION_LABELS[id],
    short: INSPECTION_SHORT[id],
    hint: INSPECTION_HINTS[id],
  })),
  // Die Fälligkeit des Lagers hängt an der Experteninspektion (DIN EN 15635: mindestens alle 12 Monate).
  dueKind: 'expert',
  dueIntervalDays: () => INSPECTION_INTERVAL_DAYS.expert,
  severities: (Object.keys(SEVERITY_LABELS) as DamageSeverity[]).map((id) => ({
    id,
    label: SEVERITY_LABELS[id],
    short: SEVERITY_SHORT[id],
    hint: SEVERITY_HINTS[id],
    tone: id,
    blockQuestion: BLOCK_QUESTION[id],
    blockable: id !== 'green',
  })),
  defaultSeverity: 'amber',
  freeSites: FREE_WAREHOUSES,
  proHow: 'Pro schließt du in der RegalDex-App unter „Abo“ ab. Fragen dazu? Schreib uns an support@dexware.app.',
  photoFolders: { inspection: 'inspection', defect: 'damage' },
};

/** Beispiel-Stammdaten für /app/regaldex/vor-ort?demo (nur Dev-Server). */
export const REGALDEX_DEMO_ROWS: Record<string, unknown>[] = [
  { name: 'Zeile A01', category: 'Palettenregal', install_year: '2019', bay_load_kg: '2000', field_load_kg: '8000' },
  { name: 'Zeile A02', category: 'Palettenregal', install_year: '2019', bay_load_kg: '2000', field_load_kg: '8000' },
  { name: 'Zeile B01', category: 'Fachbodenregal', install_year: '2021' },
  { name: 'Kragarm Hof', category: 'Kragarmregal' },
];
