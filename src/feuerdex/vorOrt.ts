// FeuerDex-Konfiguration für „Vor Ort“ (src/pruefen): alles aus types.ts gespeist — Checkliste, Prüfarten und
// Ampel-Stufen werden nur dort gepflegt. Maßstab ist die App (mobile/src/screens/InspectionScreen.tsx).
// Importe mit Dateiendung: Der Schema-Test (tests/pruefen-vor-ort.test.mjs) lädt genau diese Datei mit Node.

import type { PruefConfig } from '../pruefen/config.ts';
import {
  CHECKLIST,
  INSPECTION_HINTS,
  INSPECTION_LABELS,
  INSPECTION_SHORT,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  SEVERITY_SHORT,
  expertIntervalDays,
  type DefectSeverity,
  type InspectionType,
} from './types.ts';

/** Gratis-Grenze wie in der App (mobile/src/lib/entitlement.ts → FREE_LIMITS.extinguishers). */
export const FREE_EXTINGUISHERS = 2;

// ASR A2.2: Orange und Rot = Löscher der Benutzung entziehen (Rückfragen wortgleich zur App).
const BLOCK_QUESTION: Partial<Record<DefectSeverity, string>> = {
  amber: 'Bei Orange muss der Löscher der Benutzung entzogen und gleichwertiger Ersatz bereitgestellt werden. Ist er außer Betrieb?',
  red: 'Bei Rot muss der Löscher unverzüglich ausgesondert und ersetzt werden. Ist er außer Betrieb genommen?',
};

export const FEUERDEX_VOR_ORT: PruefConfig = {
  appId: 'feuerdex',
  appName: 'FeuerDex',
  tables: { site: 'site', unit: 'extinguisher', inspection: 'inspection', defect: 'defect' },
  cols: { unitFk: 'extinguisher_id', blocked: 'extinguisher_blocked', retired: 'retired' },
  // ohne photo_url (Referenzfoto als Daten-URI — für die Liste viel zu groß)
  unitSelect: 'id, site_id, name, category, build_type, retired',
  // wie in der App: „Pulver (ABC) · Aufladelöscher“
  unitInfo: (r) => [r.category, r.build_type].filter(Boolean).join(' · '),
  labels: {
    site: { one: 'Standort', many: 'Standorte' },
    unit: { one: 'Feuerlöscher', many: 'Feuerlöscher', full: 'Feuerlöscher', which: 'Welcher Feuerlöscher?' },
    blocked: 'Außer Betrieb (der Benutzung entzogen)',
    blockedAsk: 'Löscher außer Betrieb?',
    blockedYes: 'Ja, außer Betrieb',
    blockedShort: 'Löscher außer Betrieb',
    checklist: 'Checkliste (ASR A2.2 / DIN 14406-4)',
    defectTitleExample: 'z. B. Plombe fehlt — möglicher Teileinsatz',
    qualificationExample: 'z. B. Sachkundiger nach DIN 14406-4',
    notesExample: 'z. B. Sicherungsplombe erneuert',
    naExample: 'Druckanzeige bei Aufladelöschern',
  },
  checklist: CHECKLIST,
  kinds: (Object.keys(INSPECTION_LABELS) as InspectionType[]).map((id) => ({
    id,
    label: INSPECTION_LABELS[id],
    short: INSPECTION_SHORT[id],
    hint: INSPECTION_HINTS[id],
  })),
  dueKind: 'expert',
  // Frist der Sachkundigen-Prüfung je Land des Betriebs: DE/AT 2 Jahre (730 Tage), Schweiz 3 Jahre (1095).
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
  freeUnits: FREE_EXTINGUISHERS,
  proHow: 'Pro schließt du in der FeuerDex-App unter „Abo“ ab. Fragen dazu? Schreib uns an support@dexware.app.',
  photoFolders: { inspection: 'inspection', defect: 'defect' },
};

/** Beispiel-Stammdaten für /app/feuerdex/vor-ort?demo (nur Dev-Server). */
export const FEUERDEX_DEMO_ROWS: Record<string, unknown>[] = [
  { name: 'F-001 Eingang', category: 'Pulver (ABC)', build_type: 'Aufladelöscher' },
  { name: 'F-002 Werkbank', category: 'Schaum', build_type: 'Dauerdrucklöscher' },
  { name: 'F-003 Serverraum', category: 'CO₂ (Kohlendioxid)', build_type: 'Dauerdrucklöscher' },
  { name: 'F-004 Küche', category: 'Fettbrand (F)', build_type: 'Aufladelöscher' },
];
