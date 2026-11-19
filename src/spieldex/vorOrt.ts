// SpielDex-Konfiguration für „Vor Ort“ (src/pruefen), Orts-Modus: Die Kontrolle hängt am ganzen SPIELPLATZ
// (inspection.playground_id), Mängel nennen das betroffene Spielgerät (defect.equipment_id) oder keines
// („Fläche allgemein“). Besonderheiten gegenüber GerüstDex/RegalDex:
//   · drei Kontrollarten (visuell / operativ / Jahreshauptinspektion), zehn Checklisten-Punkte
//   · Schweregrad Gering / Mittel / Gefahr statt der Ampel; Sperre und Rückfrage nur bei „Gefahr“
//   · ohne gewähltes Gerät heißt die Sperre „Bereich gesperrt“ statt „Gerät gesperrt“
//   · zweite Frist: operative Kontrolle alle 90 Tage (die Jahreshauptinspektion zählt mit)
// Alles aus types.ts gespeist. Maßstab ist die App (SpielDex/mobile/src/screens/InspectionScreen.tsx, lib/due.ts).
// Importe mit Dateiendung: Der Schema-Test (tests/pruefen-vor-ort.test.mjs) lädt genau diese Datei mit Node.

import type { PruefConfig, Tone } from '../pruefen/config.ts';
import {
  CHECKLIST,
  INSPECTION_HINTS,
  INSPECTION_INTERVAL_DAYS,
  INSPECTION_LABELS,
  INSPECTION_SHORT,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  type DefectSeverity,
  type InspectionType,
} from './types.ts';

/** Gratis-Grenze wie in der App (mobile/src/lib/entitlement.ts → FREE_LIMITS.playgrounds): 1 aktiver Spielplatz. */
export const FREE_PLAYGROUNDS = 1;

/** „Bald fällig“ der operativen Kontrolle wie in der App (mobile/src/lib/due.ts → OPERATIONAL_SOON_DAYS). */
export const OPERATIONAL_SOON_DAYS = 14;

// wie in der App: Gering = grün, Mittel = orange, Gefahr = rot
const TONE: Record<DefectSeverity, Tone> = { low: 'green', medium: 'amber', danger: 'red' };

export const SPIELDEX_VOR_ORT: PruefConfig = {
  appId: 'spieldex',
  appName: 'SpielDex',
  mode: 'site',
  sitesPath: 'spielplaetze',
  inspectionsPath: 'kontrollen',
  tables: { site: 'playground', unit: 'equipment', inspection: 'inspection', defect: 'defect' },
  cols: { siteFk: 'playground_id', unitFk: 'equipment_id', blocked: 'equipment_blocked', retired: 'retired' },
  // ohne photo_url (Referenzfoto als Daten-URI — für die Liste viel zu groß)
  unitSelect: 'id, playground_id, name, category, install_year, retired',
  // wie in der App: „Schaukel · Baujahr 2018“
  unitInfo: (r) => [r.category, r.install_year ? `Baujahr ${String(r.install_year)}` : ''].filter(Boolean).join(' · '),
  labels: {
    site: { one: 'Spielplatz', many: 'Spielplätze' },
    unit: { one: 'Spielgerät', many: 'Spielgeräte', full: 'Spielgerät', which: 'Welches Spielgerät?' },
    inspection: { one: 'Kontrolle', many: 'Kontrollen', kind: 'Kontrollart' },
    inspectedBy: 'Kontrolliert von',
    noNameTitle: 'Ohne Namen speichern?',
    severityTitle: 'Schweregrad',
    general: 'Fläche allgemein',
    freeSites: { one: 'aktiver Spielplatz', many: 'aktive Spielplätze', inactive: 'stillgelegte' },
    affected: 'Betroffenes Gerät',
    blocked: 'Gerät gesperrt',
    blockedAsk: 'Gerät gesperrt?',
    blockedYes: 'Ja, gesperrt',
    blockedShort: 'Gerät gesperrt',
    // ohne gewähltes Gerät (Fläche allgemein) heißt es „Bereich“
    blockedGeneral: 'Bereich gesperrt',
    blockedAskGeneral: 'Bereich gesperrt?',
    blockedShortGeneral: 'Bereich gesperrt',
    checklist: 'Checkliste (DIN EN 1176-7)',
    defectTitleExample: 'z. B. Schaukelkette stark verschlissen',
    defectDescriptionExample: 'Details für die Behebung',
    qualificationExample: 'z. B. qualifizierter Spielplatzprüfer (DIN 79161)',
    notesExample: 'z. B. Sandkasten frisch aufgefüllt',
    report: 'Kontrollbuch-PDF',
  },
  checklist: CHECKLIST,
  kinds: (Object.keys(INSPECTION_LABELS) as InspectionType[]).map((id) => ({
    id,
    label: INSPECTION_LABELS[id],
    short: INSPECTION_SHORT[id],
    hint: INSPECTION_HINTS[id],
  })),
  // Die Fälligkeit des Spielplatzes hängt an der Jahreshauptinspektion (DIN EN 1176-7).
  dueKind: 'main',
  dueIntervalDays: () => INSPECTION_INTERVAL_DAYS.main,
  // Zweite Frist wie in der App (lastOperationalByPlayground / operationalDueInfo)
  extraDue: {
    label: 'Operative Kontrolle',
    kinds: ['operational', 'main'],
    intervalDays: INSPECTION_INTERVAL_DAYS.operational,
    soonDays: OPERATIONAL_SOON_DAYS,
    doneKind: 'operational',
    doneText: 'Nächste operative Kontrolle bis',
  },
  severities: (Object.keys(SEVERITY_LABELS) as DefectSeverity[]).map((id) => ({
    id,
    label: SEVERITY_LABELS[id],
    short: SEVERITY_LABELS[id],
    hint: SEVERITY_HINTS[id],
    tone: TONE[id],
    // „Gefahr“ = unmittelbare Gefahr → Gerät sperren oder Zugang verhindern (Rückfragen wortgleich zur App)
    ...(id === 'danger'
      ? {
          blockQuestion:
            'Bei „Gefahr“ muss das Gerät sofort gesperrt (Flatterband/abgebaut) oder der Zugang verhindert werden. Ist das erledigt?',
          blockQuestionGeneral:
            'Bei „Gefahr“ muss der Bereich sofort abgesperrt (Flatterband) oder der Zugang verhindert werden. Ist das erledigt?',
        }
      : {}),
  })),
  defaultSeverity: 'medium',
  freeSites: FREE_PLAYGROUNDS,
  proHow: 'Pro schließt du in der SpielDex-App unter „Abo“ ab. Fragen dazu? Schreib uns an support@dexware.app.',
  photoFolders: { inspection: 'inspection', defect: 'defect' },
};

/** Beispiel-Stammdaten für /app/spieldex/vor-ort?demo (nur Dev-Server). */
export const SPIELDEX_DEMO_ROWS: Record<string, unknown>[] = [
  { name: 'Doppelschaukel Nest', category: 'Schaukel', install_year: '2018' },
  { name: 'Rutschenturm', category: 'Rutsche', install_year: '2020' },
  { name: 'Kletternetz', category: 'Klettergerät' },
  { name: 'Federwipper Pferd', category: 'Federwipper', install_year: '2015' },
];
