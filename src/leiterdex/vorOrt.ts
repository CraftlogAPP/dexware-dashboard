// LeiterDex-Konfiguration für „Vor Ort“ (src/pruefen): alles aus types.ts gespeist — Checkliste, Prüfarten und
// Ampel-Stufen werden nur dort gepflegt. Vorlage für FeuerDex, ToreDex und GurtDex (dort ändern sich Tabellen-/
// Spaltennamen, Bezeichnungen und die Sperr-Rückfragen).

import type { PruefConfig } from '../pruefen/config';
import { ladderTypeLabel } from './labels';
import {
  CHECKLIST,
  INSPECTION_HINTS,
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_LABELS,
  INSPECTION_SHORT,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  SEVERITY_SHORT,
  type DefectSeverity,
  type InspectionType,
} from './types';

/** Gratis-Grenze wie in der App (mobile/src/lib/entitlement.ts → FREE_LIMITS.ladders). */
export const FREE_LADDERS = 2;

// DGUV Information 208-016: Orange und Rot = Leiter sofort der Benutzung entziehen (Rückfragen wortgleich zur App).
const BLOCK_QUESTION: Partial<Record<DefectSeverity, string>> = {
  amber: 'Bei Orange muss die Leiter sofort der Benutzung entzogen werden. Ist sie gesperrt?',
  red: 'Bei Rot muss die Leiter unverzüglich ausgesondert und unbrauchbar gemacht werden. Ist das erledigt?',
};

export const LEITERDEX_VOR_ORT: PruefConfig = {
  appId: 'leiterdex',
  appName: 'LeiterDex',
  tables: { site: 'site', unit: 'ladder', inspection: 'inspection', defect: 'defect' },
  cols: { unitFk: 'ladder_id', blocked: 'ladder_blocked', retired: 'retired' },
  // ohne photo_url (Referenzfoto als Daten-URI — für die Liste viel zu groß)
  unitSelect: 'id, site_id, name, category, material, retired',
  unitInfo: (r) => {
    const label = ladderTypeLabel(String(r.category ?? ''), String(r.material ?? ''));
    return label === '—' ? '' : label;
  },
  labels: {
    site: { one: 'Standort', many: 'Standorte' },
    unit: { one: 'Leiter', many: 'Leitern', full: 'Leiter / Tritt', which: 'Welche Leiter / welcher Tritt?' },
    blocked: 'Leiter gesperrt (Benutzung entzogen)',
    blockedAsk: 'Leiter gesperrt?',
    blockedYes: 'Ja, gesperrt',
    blockedShort: 'Leiter gesperrt',
    checklist: 'Checkliste (DGUV Information 208-016)',
    defectTitleExample: 'z. B. Holm verbogen — Sturzschaden',
    qualificationExample: 'z. B. befähigte Person nach TRBS 1203',
    notesExample: 'z. B. Fußkappen vorsorglich erneuert',
  },
  checklist: CHECKLIST,
  kinds: (Object.keys(INSPECTION_LABELS) as InspectionType[]).map((id) => ({
    id,
    label: INSPECTION_LABELS[id],
    short: INSPECTION_SHORT[id],
    hint: INSPECTION_HINTS[id],
  })),
  dueKind: 'expert',
  // Frist der regelmäßigen Prüfung je Betrieb (org.expert_interval_days, 1–3650 Tage); ungültig → Standard 365.
  dueIntervalDays: (org) => {
    const n = Number(org.expert_interval_days);
    return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : INSPECTION_INTERVAL_DAYS.expert;
  },
  severities: (Object.keys(SEVERITY_LABELS) as DefectSeverity[]).map((id) => ({
    id,
    label: SEVERITY_LABELS[id],
    short: SEVERITY_SHORT[id],
    hint: SEVERITY_HINTS[id],
    tone: id,
    blockQuestion: BLOCK_QUESTION[id],
  })),
  defaultSeverity: 'amber',
  freeUnits: FREE_LADDERS,
  proHow: 'Pro schließt du in der LeiterDex-App unter „Abo“ ab. Fragen dazu? Schreib uns an support@dexware.app.',
  photoFolders: { inspection: 'inspection', defect: 'defect' },
};
