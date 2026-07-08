// Domain-Typen des PrüfDex-Supabase-Schemas (Spiegel von mobile/src/types.ts +
// mobile/src/lib/dguv.ts, aber in DB-Schreibweise snake_case).
// Achtung: PrüfDex hat KEIN land-Feld und KEIN Invite-/Team-System.

export type ProtectionClass = 'I' | 'II' | 'III';
export type InspectionResult = 'passed' | 'failed';

export interface Customer {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  contact: string | null;
  created_at: string;
}

// photo_url (Base64-Typenschild-Foto) wird im Dashboard bewusst nie geladen.
export interface Device {
  id: string;
  org_id: string;
  customer_id: string | null;
  qr_code: string | null;
  name: string;
  device_type: string | null;
  manufacturer: string | null;
  serial_number: string | null;
  protection_class: ProtectionClass | null;
  location_note: string | null;
  interval_months: number;
  next_due_date: string | null; // ISO 'YYYY-MM-DD'
  created_at: string;
}

export type VisualChecks = Record<string, boolean>;
export type Measurements = Record<string, string>;

// photo_urls (Base64-Beweisfotos) nur im Detail laden!
export interface Inspection {
  id: string;
  org_id: string;
  device_id: string;
  inspected_at: string; // ISO date
  inspector_name: string | null;
  visual_checks: VisualChecks;
  measurements: Measurements;
  result: InspectionResult;
  next_due_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface InspectionWithPhotos extends Inspection {
  photo_urls: string[];
}

export const RESULT_LABELS: Record<InspectionResult, string> = {
  passed: 'Bestanden',
  failed: 'Nicht bestanden',
};

// ---------------------------------------------------------------------------
// DGUV-V3 / VDE-0701-0702 Prüfinhalte — identisch zur App (mobile lib/dguv.ts),
// damit die gespeicherten visual_checks/measurements-Keys aufgelöst werden.
// ---------------------------------------------------------------------------
export interface VisualCheckDef {
  key: string;
  label: string;
}

export const VISUAL_CHECKS: VisualCheckDef[] = [
  { key: 'gehaeuse', label: 'Gehäuse unbeschädigt' },
  { key: 'leitung', label: 'Anschlussleitung/Kabel unbeschädigt' },
  { key: 'stecker', label: 'Stecker unbeschädigt' },
  { key: 'zugentlastung', label: 'Zugentlastung wirksam' },
  { key: 'knickschutz', label: 'Knickschutz vorhanden' },
  { key: 'schalter', label: 'Schalter/Bedienelemente funktionsfähig' },
  { key: 'lueftung', label: 'Lüftungsöffnungen frei' },
  { key: 'ueberhitzung', label: 'Keine Überhitzungs-/Brandspuren' },
  { key: 'kennzeichnung', label: 'Kennzeichnung/Aufschriften lesbar' },
];

export interface MeasurementDef {
  key: string;
  label: string;
  unit: string;
  hint: string;
}

export const MEASUREMENTS: MeasurementDef[] = [
  {
    key: 'schutzleiterwiderstand',
    label: 'Schutzleiterwiderstand',
    unit: 'Ω',
    hint: 'Grenzwert ≤ 0,3 Ω (bis 5 m Leitung) — nur Schutzklasse I',
  },
  {
    key: 'isolationswiderstand',
    label: 'Isolationswiderstand',
    unit: 'MΩ',
    hint: '≥ 1,0 MΩ (SK I) · ≥ 2,0 MΩ (SK II) · ≥ 0,25 MΩ (Heizgeräte)',
  },
  {
    key: 'ableitstrom',
    label: 'Schutzleiter-/Ersatzableitstrom',
    unit: 'mA',
    hint: '≤ 3,5 mA (SK I) · Berührstrom ≤ 0,5 mA (SK II)',
  },
];

export const LEGAL_BASIS =
  'Grundlage: Prüfpflicht des Arbeitgebers (DGUV Vorschrift 3, BetrSichV) — Wiederholungsprüfung ortsveränderlicher elektrischer Betriebsmittel nach DIN VDE 0701-0702.';
