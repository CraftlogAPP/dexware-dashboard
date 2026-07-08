// Domain-Typen des RegalDex-Supabase-Schemas (Spiegel von mobile/src/types.ts,
// aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Inspektionsarten nach DIN EN 15635 Abs. 9.4
// ---------------------------------------------------------------------------
export type InspectionType = 'visual' | 'expert';

export const INSPECTION_LABELS: Record<InspectionType, string> = {
  visual: 'Wöchentliche Sichtkontrolle',
  expert: 'Experteninspektion',
};

export const INSPECTION_SHORT: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle',
  expert: 'Experteninspektion',
};

/** Empfohlenes Intervall in Tagen je Inspektionsart (Fälligkeits-Anzeige). */
export const INSPECTION_INTERVAL_DAYS: Record<InspectionType, number> = {
  visual: 7,
  expert: 365,
};

// ---------------------------------------------------------------------------
// Checkliste der Regalinspektion (DIN EN 15635 / DGUV Regel 108-007) —
// identisch zur App, damit die gespeicherten checklist-Keys aufgelöst werden.
// ---------------------------------------------------------------------------
export type CheckResult = 'ok' | 'defect' | 'na';

export interface ChecklistItem {
  id: string;
  label: string;
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'load_signs', label: 'Belastungsschilder (Fach-/Feldlast)' },
  { id: 'impact_protection', label: 'Anfahrschutz' },
  { id: 'uprights', label: 'Stützen / Rahmen' },
  { id: 'base_anchors', label: 'Fußplatten & Verankerung' },
  { id: 'plumb', label: 'Lotrechtstellung' },
  { id: 'bracing', label: 'Diagonalen / Aussteifung' },
  { id: 'beams', label: 'Traversen (Längsträger)' },
  { id: 'beam_locks', label: 'Sicherungsstifte' },
  { id: 'corrosion', label: 'Korrosion / Beschichtung' },
  { id: 'overload', label: 'Beladung / Überlastung' },
  { id: 'pallets', label: 'Paletten & Ladehilfsmittel' },
  { id: 'aisles', label: 'Gassen & Verkehrswege' },
];

// ---------------------------------------------------------------------------
// Lager (Objekt/Standort)
// ---------------------------------------------------------------------------
export interface Warehouse {
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
// Regalzeile — Inventar je Lager.
// photo_url (Base64-Referenzfoto) wird im Dashboard bewusst nie geladen.
// ---------------------------------------------------------------------------
export interface Rack {
  id: string;
  org_id: string;
  warehouse_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  install_year: string | null;
  bay_load_kg: string | null;
  field_load_kg: string | null;
  notes: string | null;
  retired: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Inspektion — APPEND-ONLY (rechtliches Kernversprechen).
// photo_urls (Base64-Beweisfotos) nur im Detail/Bericht laden!
// ---------------------------------------------------------------------------
export interface Inspection {
  id: string;
  org_id: string;
  warehouse_id: string;
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
// Schaden — Ampelverfahren nach DIN EN 15635 Abs. 9.4.3, lebt bis zur
// Instandsetzung (additiv). photo_urls/resolution_photo_urls nur für den Bericht!
// ---------------------------------------------------------------------------
export type DamageSeverity = 'green' | 'amber' | 'red';

export const SEVERITY_LABELS: Record<DamageSeverity, string> = {
  green: 'Grün — beobachten',
  amber: 'Orange — gefährlich',
  red: 'Rot — sehr schwerwiegend',
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
  warehouse_id: string;
  inspection_id: string | null;
  rack_id: string | null;
  title: string;
  description: string | null;
  severity: DamageSeverity;
  rack_blocked: boolean;
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
  DE: 'Grundlage: Prüfpflicht des Arbeitgebers (BetrSichV §§ 3, 14; ArbSchG) i. V. m. DIN EN 15635 (Ortsfeste Regalsysteme — Anwendung und Wartung) und DGUV Regel 108-007 (Lagereinrichtungen und Ladungsträger).',
  AT: 'Grundlage: ArbeitnehmerInnenschutzgesetz (ASchG) und Arbeitsmittelverordnung (AM-VO) i. V. m. ÖNORM EN 15635 — Anwendung und Wartung ortsfester Regalsysteme.',
  CH: 'Grundlage: Arbeitsmittel-Pflichten nach VUV (Art. 32b) und EKAS-Richtlinien i. V. m. SN EN 15635 sowie den Empfehlungen der Suva zur Regalsicherheit.',
};
