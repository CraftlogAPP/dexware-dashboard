// Domain-Typen des ToreDex-Supabase-Schemas (Spiegel von mobile/src/types.ts,
// aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.
// Rechtsgrundlage: BetrSichV (Arbeitsmittel-Prüfpflicht) + ASR A1.7 („Türen und
// Tore": kraftbetätigte Tore mind. jährlich durch einen Sachkundigen prüfen)
// + DGUV Information 208-022 + Produktnormen EN 13241 / EN 12453 / EN 12604.

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Prüfarten nach ASR A1.7 / DGUV Information 208-022 / BetrSichV
// ---------------------------------------------------------------------------
export type InspectionType = 'visual' | 'expert';

export const INSPECTION_LABELS: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle',
  expert: 'Sachkundigen-Prüfung (ASR A1.7)',
};

export const INSPECTION_SHORT: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle',
  expert: 'Sachkundigen-Prüfung',
};

/** Empfohlenes Intervall in Tagen je Prüfart (Fälligkeits-Anzeige). */
export const INSPECTION_INTERVAL_DAYS: Record<InspectionType, number> = {
  visual: 30,
  expert: 365,
};

/**
 * Sachkundigen-Intervall je Land (wie in der Mobile-App): im gesamten
 * DACH-Raum ist die jährliche Prüfung kraftbetätigter Tore der Maßstab
 * (DE: ASR A1.7 / DGUV I 208-022, AT: AStV/AM-VO, CH: VUV/EKAS-Praxis).
 */
export function expertIntervalDays(_land: string | null | undefined): number {
  return 365;
}

// ---------------------------------------------------------------------------
// Checkliste der Torprüfung (ASR A1.7 / DGUV I 208-022 / EN 12453 orientiert) —
// identisch zur App, damit die gespeicherten checklist-Keys aufgelöst werden.
// ---------------------------------------------------------------------------
export type CheckResult = 'ok' | 'defect' | 'na';

export interface ChecklistItem {
  id: string;
  label: string;
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'marking', label: 'Kennzeichnung & Typenschild' },
  { id: 'closing_edge', label: 'Schließkantensicherung' },
  { id: 'photocell', label: 'Lichtschranke / Lichtgitter' },
  { id: 'force_limit', label: 'Kraftbegrenzung des Antriebs' },
  { id: 'fall_protection', label: 'Absturzsicherung / Fangvorrichtung' },
  { id: 'springs_cables', label: 'Federn, Seile & Ketten' },
  { id: 'guides_rollers', label: 'Führungsschienen & Laufrollen' },
  { id: 'emergency_release', label: 'Notentriegelung / Handbetrieb' },
  { id: 'crush_shear', label: 'Quetsch- & Scherstellen' },
  { id: 'wicket_door', label: 'Schlupftür' },
  { id: 'electrical', label: 'Elektrische Ausrüstung' },
  { id: 'body_function', label: 'Torblatt & Funktionslauf' },
];

// ---------------------------------------------------------------------------
// Torarten und Antriebsarten (Inventar-Stammdaten)
// ---------------------------------------------------------------------------
export const GATE_CATEGORIES = [
  'Sectionaltor',
  'Rolltor / Rollgitter',
  'Schiebetor',
  'Drehflügeltor',
  'Falttor',
  'Kipptor',
  'Schnelllauftor',
  'Schranke',
  'Karusselltür / Automatiktür',
  'Sonstige',
] as const;

export const GATE_DRIVE_TYPES = [
  'Kraftbetätigt',
  'Handbetätigt',
  'Unbekannt',
] as const;

// ---------------------------------------------------------------------------
// Objekt (Betriebsstätte, Gebäude, Halle, Tiefgarage …)
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
// Tor / Tür — Inventar je Objekt.
// photo_url (Base64-Referenzfoto) wird im Dashboard bewusst nie geladen.
// ---------------------------------------------------------------------------
export interface Gate {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
  category: string;
  drive_type: string;
  manufacturer: string | null;
  build_year: string | null;
  dimensions: string | null;
  serial_no: string | null;
  notes: string | null;
  retired: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Prüfung — je Tor, APPEND-ONLY (rechtliches Kernversprechen).
// photo_urls (Base64-Beweisfotos) nur im Detail/Bericht laden!
// ---------------------------------------------------------------------------
export interface Inspection {
  id: string;
  org_id: string;
  site_id: string;
  gate_id: string;
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
// Mangel — Ampelverfahren (Betreiberpflichten BetrSichV/ASR A1.7 sinngemäß),
// je Tor, lebt bis zur Instandsetzung/Stilllegung (additiv).
// photo_urls/resolution_photo_urls nur für den Bericht!
// ---------------------------------------------------------------------------
export type DefectSeverity = 'green' | 'amber' | 'red';

export const SEVERITY_LABELS: Record<DefectSeverity, string> = {
  green: 'Grün — beobachten',
  amber: 'Orange — zeitnah instand setzen',
  red: 'Rot — Tor stilllegen & sichern',
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
  gate_id: string;
  title: string;
  description: string | null;
  severity: DefectSeverity;
  gate_blocked: boolean;
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
  DE: 'Grundlage: BetrSichV (Prüfpflicht für Arbeitsmittel) i. V. m. ASR A1.7 „Türen und Tore" und DGUV Information 208-022 — kraftbetätigte Tore mindestens jährlich durch einen Sachkundigen prüfen, außerdem vor der ersten Inbetriebnahme und nach wesentlichen Änderungen (Sicherheitsanforderungen: EN 12453 / EN 13241).',
  AT: 'Grundlage: ArbeitnehmerInnenschutzgesetz (ASchG) und Arbeitsstättenverordnung (AStV) i. V. m. Arbeitsmittelverordnung (AM-VO) — wiederkehrende Prüfung kraftbetätigter Tore und Türen mindestens jährlich nach Herstellerangaben und Stand der Technik (EN 12453).',
  CH: 'Grundlage: Verordnung über die Unfallverhütung (VUV) — Instandhaltungs- und Prüfpflichten für Arbeitsmittel — i. V. m. EKAS-Richtlinien und Hersteller-Vorgaben (periodische Prüfung kraftbetätigter Tore, üblich jährlich; EN 12453).',
};
