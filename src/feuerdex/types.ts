// Domain-Typen des FeuerDex-Supabase-Schemas (Spiegel von mobile/src/types.ts,
// aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.
// Rechtsgrundlage: ASR A2.2 (Maßnahmen gegen Brände — Ausstattung & Kontrolle)
// + DIN 14406-4 (Instandhaltung tragbarer Feuerlöscher durch Sachkundige,
// spätestens alle 2 Jahre) + BetrSichV (Druckbehälter: innere Prüfung 5 J,
// Festigkeitsprüfung 10 J) + DGUV Information 205-001.

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Prüfarten nach ASR A2.2 / DIN 14406-4 / BetrSichV
// ---------------------------------------------------------------------------
export type InspectionType = 'visual' | 'expert';

export const INSPECTION_LABELS: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle',
  expert: 'Sachkundigen-Prüfung (DIN 14406-4)',
};

export const INSPECTION_SHORT: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle',
  expert: 'Sachkundigen-Prüfung',
};

/** Empfohlenes Intervall in Tagen je Prüfart (Fälligkeits-Anzeige). */
export const INSPECTION_INTERVAL_DAYS: Record<InspectionType, number> = {
  visual: 90,
  expert: 730,
};

// ---------------------------------------------------------------------------
// Checkliste der Feuerlöscher-Kontrolle (ASR A2.2 / DIN 14406-4 orientiert) —
// identisch zur App, damit die gespeicherten checklist-Keys aufgelöst werden.
// ---------------------------------------------------------------------------
export type CheckResult = 'ok' | 'defect' | 'na';

export interface ChecklistItem {
  id: string;
  label: string;
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'location', label: 'Standort & Zugänglichkeit' },
  { id: 'mounting', label: 'Halterung / Befestigung' },
  { id: 'signage', label: 'Beschilderung' },
  { id: 'seal', label: 'Plombe / Sicherungsstift' },
  { id: 'gauge', label: 'Druckanzeige' },
  { id: 'body', label: 'Behälter / Gehäuse' },
  { id: 'hose', label: 'Schlauch / Düse' },
  { id: 'valve', label: 'Armatur / Auslösehebel' },
  { id: 'label', label: 'Etikett / Bedienanleitung' },
  { id: 'badge', label: 'Prüfplakette / Instandhaltungsnachweis' },
  { id: 'pressure_dates', label: 'Druckprüffristen (BetrSichV)' },
  { id: 'cleanliness', label: 'Verschmutzung / Umgebung' },
];

// ---------------------------------------------------------------------------
// Löschmittel-Arten und Bauarten (Inventar-Stammdaten)
// ---------------------------------------------------------------------------
export const EXTINGUISHER_CATEGORIES = [
  'Pulver (ABC)',
  'Pulver (BC)',
  'Metallbrand-Pulver (D)',
  'Schaum',
  'Wasser',
  'CO₂ (Kohlendioxid)',
  'Fettbrand (F)',
  'Sonstige',
] as const;

export const EXTINGUISHER_BUILD_TYPES = [
  'Aufladelöscher',
  'Dauerdrucklöscher',
  'Unbekannt',
] as const;

// ---------------------------------------------------------------------------
// Standort (Betriebsstätte, Gebäude, Etage, Fahrzeug …)
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
// Feuerlöscher — Inventar je Standort.
// photo_url (Base64-Referenzfoto) wird im Dashboard bewusst nie geladen.
// ---------------------------------------------------------------------------
export interface Extinguisher {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
  category: string;
  build_type: string;
  manufacturer: string | null;
  purchase_year: string | null;
  filling_kg: string | null;
  rating_le: string | null;
  notes: string | null;
  retired: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Prüfung — je Feuerlöscher, APPEND-ONLY (rechtliches Kernversprechen).
// photo_urls (Base64-Beweisfotos) nur im Detail/Bericht laden!
// ---------------------------------------------------------------------------
export interface Inspection {
  id: string;
  org_id: string;
  site_id: string;
  extinguisher_id: string;
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
// Mangel — Ampelverfahren (Betreiberpflichten ASR A2.2 sinngemäß), je Löscher,
// lebt bis zur Instandsetzung/Aussonderung (additiv).
// photo_urls/resolution_photo_urls nur für den Bericht!
// ---------------------------------------------------------------------------
export type DefectSeverity = 'green' | 'amber' | 'red';

export const SEVERITY_LABELS: Record<DefectSeverity, string> = {
  green: 'Grün — beobachten',
  amber: 'Orange — außer Betrieb & instand setzen',
  red: 'Rot — aussondern & ersetzen',
};

export const SEVERITY_SHORT: Record<DefectSeverity, string> = {
  green: 'Grün',
  amber: 'Orange',
  red: 'Rot',
};

export type DefectStatus = 'open' | 'resolved';

export interface Defect {
  id: string;
  org_id: string;
  site_id: string;
  inspection_id: string | null;
  extinguisher_id: string;
  title: string;
  description: string | null;
  severity: DefectSeverity;
  extinguisher_blocked: boolean;
  status: DefectStatus;
  reported_by: string | null;
  reporter_name: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolver_name: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface DefectWithPhotos extends Defect {
  photo_urls: string[];
  resolution_photo_urls: string[];
}

// Rechtsgrundlage je Land — erscheint im Berichtskopf (wie mobile pdf/report.ts).
export const LEGAL_BASIS: Record<Org['land'], string> = {
  DE: 'Grundlage: Bereitstellungs- und Kontrollpflichten des Arbeitgebers (ArbSchG; ASR A2.2 „Maßnahmen gegen Brände") i. V. m. DIN 14406-4 (Instandhaltung tragbarer Feuerlöscher durch Sachkundige, spätestens alle 2 Jahre) und BetrSichV (innere Prüfung alle 5 Jahre, Festigkeitsprüfung alle 10 Jahre).',
  AT: 'Grundlage: ArbeitnehmerInnenschutzgesetz (ASchG) und Arbeitsstättenverordnung (AStV) — Bereithaltung und wiederkehrende Überprüfung von Feuerlöschern — i. V. m. TRVB F 124 bzw. ÖNORM F 1053 (Überprüfung üblich alle 2 Jahre).',
  CH: 'Grundlage: Brandschutzvorschriften der VKF und Arbeitsmittel-Pflichten nach VUV i. V. m. den Hersteller-Vorgaben und Empfehlungen (periodische Wartung, üblich alle 3 Jahre).',
};
