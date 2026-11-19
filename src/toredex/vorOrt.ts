// ToreDex-Konfiguration für „Vor Ort“ (src/pruefen): alles aus types.ts gespeist — Checkliste, Prüfarten und
// Ampel-Stufen werden nur dort gepflegt. Maßstab ist die App (mobile/src/screens/InspectionScreen.tsx).
// Besonderheiten: Der Ort heißt „Objekt“ (Dashboard-Pfad „objekte“); nach der Sperre wird nur bei Rot gefragt.
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

/** Gratis-Grenze wie in der App (mobile/src/lib/entitlement.ts → FREE_LIMITS.gates). */
export const FREE_GATES = 2;

// Rot = unmittelbare Gefahr: Tor sofort stilllegen und gegen Benutzung sichern (Rückfrage wortgleich zur App).
// Orange erlaubt eingeschränkten Betrieb ohne unmittelbare Gefahr — keine Rückfrage, der Sperr-Schalter ist aber da.
const BLOCK_QUESTION: Partial<Record<DefectSeverity, string>> = {
  red: 'Bei Rot muss das Tor sofort stillgelegt und gegen Benutzung gesichert werden (Kennzeichnung, ggf. Absperrung). Ist das erledigt?',
};

export const TOREDEX_VOR_ORT: PruefConfig = {
  appId: 'toredex',
  appName: 'ToreDex',
  sitesPath: 'objekte',
  tables: { site: 'site', unit: 'gate', inspection: 'inspection', defect: 'defect' },
  cols: { unitFk: 'gate_id', blocked: 'gate_blocked', retired: 'retired' },
  // ohne photo_url (Referenzfoto als Daten-URI — für die Liste viel zu groß)
  unitSelect: 'id, site_id, name, category, drive_type, retired',
  // wie in der App: „Sectionaltor · Kraftbetätigt“
  unitInfo: (r) => [r.category, r.drive_type].filter(Boolean).join(' · '),
  labels: {
    site: { one: 'Objekt', many: 'Objekte' },
    unit: { one: 'Tor', many: 'Tore', full: 'Tor', which: 'Welches Tor?' },
    blocked: 'Außer Betrieb (der Benutzung entzogen)',
    blockedAsk: 'Tor stillgelegt?',
    blockedYes: 'Ja, stillgelegt',
    blockedShort: 'Tor gesperrt',
    checklist: 'Checkliste (ASR A1.7 / DGUV I 208-022)',
    defectTitleExample: 'z. B. Lichtschranke ohne Funktion',
    qualificationExample: 'z. B. Sachkundiger für kraftbetätigte Tore',
    notesExample: 'z. B. Führungsschienen nachgefettet',
    naExample: 'Schlupftür, wenn keine vorhanden',
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
  // Sachkundigen-Prüfung kraftbetätigter Tore: im ganzen DACH-Raum jährlich (365 Tage).
  dueIntervalDays: (org) => expertIntervalDays(typeof org.land === 'string' ? org.land : null),
  severities: (Object.keys(SEVERITY_LABELS) as DefectSeverity[]).map((id) => ({
    id,
    label: SEVERITY_LABELS[id],
    short: SEVERITY_SHORT[id],
    hint: SEVERITY_HINTS[id],
    tone: id,
    blockQuestion: BLOCK_QUESTION[id],
    blockable: id !== 'green',
  })),
  defaultSeverity: 'amber',
  freeUnits: FREE_GATES,
  proHow: 'Pro schließt du in der ToreDex-App unter „Abo“ ab. Fragen dazu? Schreib uns an support@dexware.app.',
  photoFolders: { inspection: 'inspection', defect: 'defect' },
};

/** Beispiel-Stammdaten für /app/toredex/vor-ort?demo (nur Dev-Server). */
export const TOREDEX_DEMO_ROWS: Record<string, unknown>[] = [
  { name: 'T-01 Halle Nord', category: 'Sectionaltor', drive_type: 'Kraftbetätigt' },
  { name: 'T-02 Anlieferung', category: 'Rolltor / Rollgitter', drive_type: 'Kraftbetätigt' },
  { name: 'T-03 Hofeinfahrt', category: 'Schiebetor', drive_type: 'Kraftbetätigt' },
  { name: 'T-04 Lager', category: 'Drehflügeltor', drive_type: 'Handbetätigt' },
];
