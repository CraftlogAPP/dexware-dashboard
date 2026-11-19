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

/** Erklärung je Prüfart — wortgleich zur App (mobile/src/types.ts), erscheint beim Erfassen „Vor Ort“. */
export const INSPECTION_HINTS: Record<InspectionType, string> = {
  visual: 'Regelmäßige Sichtprüfung durch eine beauftragte Person (Sicherheitsbeauftragter Lager) — üblich: wöchentlich, dokumentiert.',
  expert: 'Inspektion durch eine fachkundige Person nach DIN EN 15635 — mindestens alle 12 Monate. RegalDex dokumentiert Termin und Ergebnis.',
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
  /** Prüfhinweis wie in der App (beim Erfassen „Vor Ort“) */
  hint: string;
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'load_signs', label: 'Belastungsschilder (Fach-/Feldlast)', hint: 'An jeder Regalzeile vorhanden, lesbar und passend zur tatsächlichen Konfiguration?' },
  { id: 'impact_protection', label: 'Anfahrschutz', hint: 'Eck- und Stützenschutz vorhanden und unbeschädigt? Verformter Anfahrschutz hat gewirkt — austauschen.' },
  { id: 'uprights', label: 'Stützen / Rahmen', hint: 'Dellen, Risse, Anfahrschäden? Grenzwerte: 5 mm in Gassenrichtung, 3 mm quer — gemessen mit 1-m-Richtlatte.' },
  { id: 'base_anchors', label: 'Fußplatten & Verankerung', hint: 'Fußplatten vollflächig aufliegend, Anker fest, keine gerissenen Dübel oder unterlegten Provisorien?' },
  { id: 'plumb', label: 'Lotrechtstellung', hint: 'Rahmen im Lot? Max. Abweichung 1/350 der Höhe (z. B. 17 mm bei 6 m).' },
  { id: 'bracing', label: 'Diagonalen / Aussteifung', hint: 'Verbände vollständig, unbeschädigt und fest verschraubt?' },
  { id: 'beams', label: 'Traversen (Längsträger)', hint: 'Bleibende Verformung nach Entlastung, Risse, beschädigte Schweißnähte, aufgebogene Endplatten?' },
  { id: 'beam_locks', label: 'Sicherungsstifte', hint: 'Aushebesicherungen an JEDER Traverse beidseitig vorhanden und eingerastet?' },
  { id: 'corrosion', label: 'Korrosion / Beschichtung', hint: 'Rost, großflächig beschädigte Beschichtung, Feuchtigkeits- oder Frostschäden (Kühllager)?' },
  { id: 'overload', label: 'Beladung / Überlastung', hint: 'Fach- und Feldlasten eingehalten? Lasten mittig aufgelegt, keine gefährlichen Überstände?' },
  { id: 'pallets', label: 'Paletten & Ladehilfsmittel', hint: 'Paletten unbeschädigt (keine gebrochenen Kufen/Bretter), Ladung gesichert (Folie, Band)?' },
  { id: 'aisles', label: 'Gassen & Verkehrswege', hint: 'Freimaße eingehalten, nichts abgestellt, Bodenmarkierungen sichtbar, Beleuchtung intakt?' },
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
  /** Unterschrift der prüfenden Person (ab Datenbank-Update 2026-10-29), nur im Bericht geladen. */
  signature?: string | null;
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

/** Erklärung je Einstufung — wortgleich zur App, erscheint beim Erfassen „Vor Ort“. */
export const SEVERITY_HINTS: Record<DamageSeverity, string> = {
  green: 'Verformung unterhalb der Grenzwerte — kennzeichnen, beobachten, bei der nächsten Inspektion erneut bewerten.',
  amber: 'Grenzwert überschritten (bis 2×) — Feld entlasten, nach Entnahme nicht neu belegen, Instandsetzung binnen 4 Wochen.',
  red: 'Mehr als 2× über dem Grenzwert — SOFORT entlasten und sperren, bis die Instandsetzung erfolgt ist!',
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
