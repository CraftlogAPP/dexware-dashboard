// KfzDex-Zeilentypen (PostgREST liefert snake_case) + Labels.
// Quelle: KfzDex/supabase/migrations/0001_init.sql und src/lib/labels.ts der App.

export type VehicleType =
  | 'pkw'
  | 'transporter'
  | 'lkw'
  | 'anhaenger'
  | 'stapler'
  | 'sonstig';

export interface Vehicle {
  id: string;
  org_id: string;
  plate: string;
  name: string | null;
  type: VehicleType;
  first_registration: string | null;
  /** Letzte bestandene UVV-Prüfung (YYYY-MM-DD); UVV gilt 12 Monate. */
  last_uvv: string | null;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  org_id: string;
  name: string;
  license_classes: string | null;
  /** Kontroll-Intervall in Monaten (üblich: 6). */
  check_interval_months: number;
  last_check: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type UvvResult = 'bestanden' | 'maengel' | 'nicht_bestanden';

export interface UvvInspection {
  id: string;
  org_id: string;
  vehicle_id: string;
  date: string;
  inspector: string;
  result: UvvResult;
  defects: string | null;
  /** Checklisten-Stand: Punkt-ID -> ok? */
  checklist: Record<string, boolean>;
  created_at: string;
}

export interface LicenseCheck {
  id: string;
  org_id: string;
  driver_id: string;
  date: string;
  checked_by: string;
  /** Foto-Nachweis liegt nur lokal auf dem kontrollierenden Gerät. */
  photo_uri: string | null;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'member';
  created_at: string;
}

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  pkw: 'Pkw',
  transporter: 'Transporter',
  lkw: 'Lkw',
  anhaenger: 'Anhänger',
  stapler: 'Stapler',
  sonstig: 'Sonstiges',
};

export const UVV_RESULT_LABEL: Record<UvvResult, string> = {
  bestanden: 'Bestanden',
  maengel: 'Mängel festgestellt',
  nicht_bestanden: 'Nicht bestanden',
};

/** Prüfpunkte der UVV-Sicht- und Funktionsprüfung (identisch zur App). */
export const CHECK_ITEMS: { id: string; label: string }[] = [
  { id: 'bremsen', label: 'Bremsen (Betriebs- & Feststellbremse)' },
  { id: 'beleuchtung', label: 'Beleuchtung & Blinker' },
  { id: 'reifen', label: 'Reifen & Räder (Profil, Schäden, Druck)' },
  { id: 'lenkung', label: 'Lenkung' },
  { id: 'sicht', label: 'Spiegel, Scheiben & Scheibenwischer' },
  { id: 'warn', label: 'Hupe & Warneinrichtungen' },
  { id: 'gurte', label: 'Sicherheitsgurte' },
  { id: 'fluessigkeiten', label: 'Flüssigkeitsstände & Leckagen' },
  { id: 'aufbau', label: 'Aufbau, Ladungssicherung & Anhängerkupplung' },
  { id: 'ausruestung', label: 'Verbandkasten, Warndreieck & Warnweste' },
];
