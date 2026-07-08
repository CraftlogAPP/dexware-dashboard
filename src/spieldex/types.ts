// Domain-Typen des SpielDex-Supabase-Schemas (Spiegel von mobile/src/types.ts,
// aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Kontrollarten nach DIN EN 1176-7
// ---------------------------------------------------------------------------
export type InspectionType = 'visual' | 'operational' | 'main';

export const INSPECTION_LABELS: Record<InspectionType, string> = {
  visual: 'Visuelle Routinekontrolle',
  operational: 'Operative Kontrolle',
  main: 'Jahreshauptinspektion',
};

export const INSPECTION_SHORT: Record<InspectionType, string> = {
  visual: 'Visuell',
  operational: 'Operativ',
  main: 'Hauptinspektion',
};

/** Empfohlenes Intervall in Tagen je Kontrollart (Fälligkeits-Anzeige). */
export const INSPECTION_INTERVAL_DAYS: Record<InspectionType, number> = {
  visual: 7,
  operational: 90,
  main: 365,
};

// ---------------------------------------------------------------------------
// Checkliste der visuellen/operativen Kontrolle (DIN EN 1176-7 orientiert) —
// identisch zur App, damit die gespeicherten checklist-Keys aufgelöst werden.
// ---------------------------------------------------------------------------
export type CheckResult = 'ok' | 'defect' | 'na';

export interface ChecklistItem {
  id: string;
  label: string;
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'glass_waste', label: 'Glasscherben, Spritzen, Abfall' },
  { id: 'fall_protection', label: 'Fallschutz (Sand, Kies, Matten)' },
  { id: 'damage_vandalism', label: 'Beschädigung / Vandalismus' },
  { id: 'missing_parts', label: 'Fehlende oder lose Teile' },
  { id: 'wear', label: 'Verschleiß' },
  { id: 'foundations', label: 'Freigelegte Fundamente' },
  { id: 'sharp_edges', label: 'Scharfe Kanten / Fangstellen' },
  { id: 'stability', label: 'Standsicherheit' },
  { id: 'fence_gates', label: 'Zäune, Tore, Zugänge' },
  { id: 'furniture', label: 'Bänke, Tische, Mülleimer' },
];

// ---------------------------------------------------------------------------
// Spielplatz (Objekt)
// ---------------------------------------------------------------------------
export interface Playground {
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
// Spielgerät — Inventar je Spielplatz.
// photo_url (Base64-Referenzfoto) wird im Dashboard bewusst nie geladen.
// ---------------------------------------------------------------------------
export interface Equipment {
  id: string;
  org_id: string;
  playground_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  install_year: string | null;
  notes: string | null;
  retired: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Kontrolle — APPEND-ONLY (rechtliches Kernversprechen).
// photo_urls (Base64-Beweisfotos) nur im Detail/Bericht laden!
// ---------------------------------------------------------------------------
export interface Inspection {
  id: string;
  org_id: string;
  playground_id: string;
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
// Mangel — entsteht bei einer Kontrolle, lebt bis zur Behebung (additiv).
// photo_urls/resolution_photo_urls (Base64) nur für den Bericht laden!
// ---------------------------------------------------------------------------
export type DefectSeverity = 'low' | 'medium' | 'danger';

export const SEVERITY_LABELS: Record<DefectSeverity, string> = {
  low: 'Gering',
  medium: 'Mittel',
  danger: 'Gefahr',
};

export type DefectStatus = 'open' | 'resolved';

export interface Defect {
  id: string;
  org_id: string;
  playground_id: string;
  inspection_id: string | null;
  equipment_id: string | null;
  title: string;
  description: string | null;
  severity: DefectSeverity;
  equipment_blocked: boolean;
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
  DE: 'Grundlage: Verkehrssicherungspflicht (§ 823 BGB) i. V. m. DIN EN 1176 (Spielplatzgeräte) und DIN EN 1176-7 (Anleitung für Inspektion und Wartung).',
  AT: 'Grundlage: Haftung des Halters (§ 1319 ABGB) i. V. m. ÖNORM EN 1176 — Inspektion und Wartung von Spielplatzgeräten.',
  CH: 'Grundlage: Werkeigentümerhaftung (Art. 58 OR) i. V. m. SN EN 1176 sowie den Empfehlungen der BFU.',
};
