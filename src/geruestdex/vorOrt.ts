// GerüstDex-Konfiguration für „Vor Ort“ (src/pruefen), Orts-Modus: Die Prüfung hängt an der ganzen BAUSTELLE
// (inspection.site_id), Mängel nennen das betroffene Gerüst (damage.scaffold_id) oder keines („Baustelle allgemein“).
// Die Tabelle heißt „damage“, in der Oberfläche heißt es wie in der App „Mangel“.
// Alles aus types.ts gespeist — Checkliste, Prüfarten und Ampel-Stufen werden nur dort gepflegt.
// Maßstab ist die App (GeruestDex/mobile/src/screens/InspectionScreen.tsx, data/supabaseRepository.ts).
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

/** Gratis-Grenze wie in der App (mobile/src/lib/entitlement.ts → FREE_LIMITS.sites): 1 aktive Baustelle. */
export const FREE_SITES = 1;

/** „Bald fällig“ wie in der App (mobile/src/lib/due.ts → DUE_SOON_DAYS): 14 Tage, weil die Frist nur 30 Tage hat. */
export const DUE_SOON_DAYS = 14;

// TRBS 2121-1: Orange = Bereich absperren, Rot = Gerüst SOFORT komplett sperren (Rückfragen wortgleich zur App).
const BLOCK_QUESTION: Partial<Record<DamageSeverity, string>> = {
  amber: 'Bei Orange muss der betroffene Bereich (Ebene/Feld) abgesperrt werden. Ist er gesperrt?',
  red: 'Bei Rot muss das Gerüst sofort komplett gesperrt werden („Zutritt verboten“). Ist das erledigt?',
};

/** wie in der App (SiteDetailScreen → scaffoldInfo): „Fassadengerüst · aufgebaut 03.11.2026 · Lastklasse 4 · W09 · Layher Blitz“ */
function scaffoldInfo(r: Record<string, unknown>): string {
  const parts = [String(r.category ?? '')];
  if (r.erected_at) parts.push(`aufgebaut ${String(r.erected_at)}`);
  if (r.load_class) parts.push(`Lastklasse ${String(r.load_class)}`);
  if (r.width_class) parts.push(String(r.width_class));
  if (r.manufacturer) parts.push(String(r.manufacturer));
  return parts.filter(Boolean).join(' · ');
}

export const GERUESTDEX_VOR_ORT: PruefConfig = {
  appId: 'geruestdex',
  appName: 'GerüstDex',
  mode: 'site',
  sitesPath: 'baustellen',
  tables: { site: 'site', unit: 'scaffold', inspection: 'inspection', defect: 'damage' },
  cols: { unitFk: 'scaffold_id', blocked: 'scaffold_blocked', retired: 'retired' },
  // ohne photo_url (Referenzfoto als Daten-URI — für die Liste viel zu groß)
  unitSelect: 'id, site_id, name, category, manufacturer, erected_at, load_class, width_class, retired',
  unitInfo: scaffoldInfo,
  labels: {
    site: { one: 'Baustelle', many: 'Baustellen' },
    unit: { one: 'Gerüst', many: 'Gerüste', full: 'Gerüst', which: 'Welches Gerüst?' },
    inspectedBy: 'Kontrolliert von',
    severityTitle: 'Gefährdungsstufe (Ampelverfahren)',
    general: 'Baustelle allgemein',
    freeSites: { one: 'aktive Baustelle', many: 'aktive Baustellen', inactive: 'abgeschlossene' },
    affected: 'Betroffenes Gerüst',
    blocked: 'Bereich abgesperrt & gekennzeichnet',
    blockedAsk: 'Gerüst gesperrt?',
    blockedYes: 'Ja, gesperrt',
    blockedShort: 'Bereich gesperrt',
    checklist: 'Checkliste (TRBS 2121-1)',
    defectTitleExample: 'z. B. Anker Feld 3 entfernt',
    defectDescriptionExample: 'Details für die Beseitigung (Feld, Lage, Bauteil …)',
    qualificationExample: 'z. B. befähigte Person nach TRBS 1203',
    notesExample: 'z. B. Seitenschutz 2. Lage ergänzt',
    report: 'Prüfbericht-PDF',
  },
  checklist: CHECKLIST,
  kinds: (Object.keys(INSPECTION_LABELS) as InspectionType[]).map((id) => ({
    id,
    label: INSPECTION_LABELS[id],
    short: INSPECTION_SHORT[id],
    hint: INSPECTION_HINTS[id],
  })),
  // Die Fälligkeit der Baustelle hängt an der Prüfung durch die befähigte Person (bei längerer Standzeit alle 30 Tage).
  dueKind: 'expert',
  dueIntervalDays: () => INSPECTION_INTERVAL_DAYS.expert,
  dueSoonDays: DUE_SOON_DAYS,
  severities: (Object.keys(SEVERITY_LABELS) as DamageSeverity[]).map((id) => ({
    id,
    label: SEVERITY_LABELS[id],
    short: SEVERITY_SHORT[id],
    hint: SEVERITY_HINTS[id],
    tone: id,
    blockQuestion: BLOCK_QUESTION[id],
  })),
  defaultSeverity: 'amber',
  freeSites: FREE_SITES,
  proHow: 'Pro schließt du in der GerüstDex-App unter „Abo“ ab. Fragen dazu? Schreib uns an support@dexware.app.',
  photoFolders: { inspection: 'inspection', defect: 'damage' },
};

/** Beispiel-Stammdaten für /app/geruestdex/vor-ort?demo (nur Dev-Server). */
export const GERUESTDEX_DEMO_ROWS: Record<string, unknown>[] = [
  { name: 'Fassade Nord', category: 'Fassadengerüst', erected_at: '03.11.2026', load_class: '4 (3,00 kN/m²)', width_class: 'W09', manufacturer: 'Layher Blitz' },
  { name: 'Fassade Süd', category: 'Fassadengerüst', erected_at: '03.11.2026', load_class: '3 (2,00 kN/m²)', width_class: 'W06' },
  { name: 'Rollgerüst Halle', category: 'Fahrgerüst (Rollgerüst)' },
  { name: 'Dachfang West', category: 'Dachfanggerüst', erected_at: '10.11.2026' },
];
