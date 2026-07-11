// Domain-Typen des GerüstDex-Supabase-Schemas (Spiegel von mobile/src/types.ts,
// aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.
// Rechtsgrundlage: BetrSichV §§ 3, 14 (Arbeitgeber-Prüfpflicht) + TRBS 2121-1
// (Gefährdung durch Absturz — Gerüste) + DGUV Information 201-011 (Arbeiten
// auf Gerüsten); Ausführung nach DIN EN 12811-1. Zwei Prüfarten:
// Inaugenscheinnahme durch den Nutzer (arbeitstäglich) + Prüfung durch eine
// zur Prüfung befähigte Person (nach Montage/Änderung/Sturm, bei Standzeit
// regelmäßig wiederholt).

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Prüfarten nach TRBS 2121-1 Abschnitt 5
// ---------------------------------------------------------------------------
export type InspectionType = 'visual' | 'expert';

export const INSPECTION_LABELS: Record<InspectionType, string> = {
  visual: 'Inaugenscheinnahme (Nutzer)',
  expert: 'Prüfung durch befähigte Person',
};

export const INSPECTION_SHORT: Record<InspectionType, string> = {
  visual: 'Inaugenscheinnahme',
  expert: 'Befähigte Person',
};

/** Empfohlenes Intervall in Tagen je Prüfart (Fälligkeits-Anzeige, wie die App). */
export const INSPECTION_INTERVAL_DAYS: Record<InspectionType, number> = {
  visual: 1,
  expert: 30,
};

// ---------------------------------------------------------------------------
// Checkliste der Gerüstprüfung (TRBS 2121-1 / DGUV Information 201-011) —
// identisch zur App, damit die gespeicherten checklist-Keys aufgelöst werden.
// ---------------------------------------------------------------------------
export type CheckResult = 'ok' | 'defect' | 'na';

export interface ChecklistItem {
  id: string;
  label: string;
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'marking', label: 'Kennzeichnung / Freigabe' },
  { id: 'foundation', label: 'Gründung / Fußspindeln' },
  { id: 'anchors', label: 'Verankerung' },
  { id: 'decks', label: 'Beläge' },
  { id: 'side_protection', label: 'Seitenschutz (3-teilig)' },
  { id: 'access', label: 'Aufstiege / Zugänge' },
  { id: 'bracing', label: 'Diagonalen / Aussteifung' },
  { id: 'wall_distance', label: 'Wandabstand' },
  { id: 'corners', label: 'Ecken / Überbrückungen' },
  { id: 'modifications', label: 'Keine eigenmächtigen Änderungen' },
  { id: 'electrical', label: 'Elektrische Leitungen / Anlagen' },
  { id: 'environment', label: 'Umgebung / Schutz Dritter' },
];

// ---------------------------------------------------------------------------
// Gerüstbauarten und Klassen (Inventar-Stammdaten, EN 12811-1)
// ---------------------------------------------------------------------------
export const SCAFFOLD_CATEGORIES = [
  'Fassadengerüst',
  'Fahrgerüst (Rollgerüst)',
  'Raumgerüst',
  'Schutzgerüst / Fanggerüst',
  'Dachfanggerüst',
  'Hängegerüst',
  'Traggerüst',
  'Bockgerüst',
  'Sonstiges',
] as const;

/** Lastklassen nach EN 12811-1 (gleichmäßig verteilte Last der Belagfläche). */
export const LOAD_CLASSES = [
  '1 (0,75 kN/m²)',
  '2 (1,50 kN/m²)',
  '3 (2,00 kN/m²)',
  '4 (3,00 kN/m²)',
  '5 (4,50 kN/m²)',
  '6 (6,00 kN/m²)',
] as const;

/** Breitenklassen nach EN 12811-1 (lichte Belagbreite). */
export const WIDTH_CLASSES = ['W06', 'W09', 'W12', 'W15', 'W18', 'W21', 'W24'] as const;

// ---------------------------------------------------------------------------
// Baustelle (Objekt/Standort)
// ---------------------------------------------------------------------------
export interface Site {
  id: string;
  org_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  operator_name: string | null;
  operator_contact: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Gerüst — Inventar je Baustelle.
// photo_url (Base64-Referenzfoto) wird im Dashboard bewusst nie geladen.
// ---------------------------------------------------------------------------
export interface Scaffold {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  erected_by: string | null;
  erected_at: string | null;
  load_class: string | null;
  width_class: string | null;
  notes: string | null;
  retired: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Prüfung — je BAUSTELLE (nicht je Gerüst!), APPEND-ONLY (Kernversprechen).
// photo_urls (Base64-Beweisfotos) nur im Detail/Bericht laden!
// ---------------------------------------------------------------------------
export interface Inspection {
  id: string;
  org_id: string;
  site_id: string;
  type: InspectionType;
  started_at: string;
  lat: number | null;
  lng: number | null;
  gps_accuracy_m: number | null;
  checklist: Record<string, CheckResult>;
  notes: string | null;
  performed_by: string | null;
  inspector_name: string | null;
  canceled: boolean;
  cancel_reason: string | null;
  canceled_at: string | null;
  created_at: string;
}

export interface InspectionWithPhotos extends Inspection {
  photo_urls: string[];
}

// ---------------------------------------------------------------------------
// Mangel — Ampelverfahren (angelehnt an DGUV Information 201-011), je Baustelle
// mit optionalem Gerüst-Bezug, lebt bis zur Beseitigung (additiv).
// photo_urls/resolution_photo_urls nur für den Bericht!
// ---------------------------------------------------------------------------
export type DamageSeverity = 'green' | 'amber' | 'red';

export const SEVERITY_LABELS: Record<DamageSeverity, string> = {
  green: 'Grün — beobachten',
  amber: 'Orange — Bereich sperren',
  red: 'Rot — Gerüst sperren',
};

export const SEVERITY_SHORT: Record<DamageSeverity, string> = {
  green: 'Grün',
  amber: 'Orange',
  red: 'Rot',
};

export type DamageStatus = 'open' | 'resolved';

export interface Damage {
  id: string;
  org_id: string;
  site_id: string;
  inspection_id: string | null;
  scaffold_id: string | null;
  title: string;
  description: string | null;
  severity: DamageSeverity;
  scaffold_blocked: boolean;
  status: DamageStatus;
  reported_by: string | null;
  reporter_name: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolver_name: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface DamageWithPhotos extends Damage {
  photo_urls: string[];
  resolution_photo_urls: string[];
}

// Rechtsgrundlage je Land — erscheint im Berichtskopf (wie mobile pdf/report.ts).
export const LEGAL_BASIS: Record<Org['land'], string> = {
  DE: 'Grundlage: Prüfpflicht des Arbeitgebers (BetrSichV §§ 3, 14; ArbSchG) i. V. m. TRBS 2121-1 (Gefährdung durch Absturz — Gerüste) und DGUV Information 201-011 (Arbeiten auf Gerüsten); Ausführung nach DIN EN 12811-1.',
  AT: 'Grundlage: ArbeitnehmerInnenschutzgesetz (ASchG) und Bauarbeiterschutzverordnung (BauV, 6. Abschnitt — Gerüste) i. V. m. ÖNORM EN 12811-1.',
  CH: 'Grundlage: Bauarbeitenverordnung (BauAV, Kapitel Gerüste) und VUV i. V. m. SN EN 12811-1 sowie den Suva-Regeln für Gerüstarbeiten.',
};
