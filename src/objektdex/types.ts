// ObjektDex — Zeilen-Typen wie in der Datenbank (ObjektDex/supabase/schema.sql, Vertrag: ObjektDex/SCHEMA.md).
import type { Cadence, Day, DayStatus } from './turnus';

export interface OdProperty {
  id: string;
  org_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  customer_name: string | null;
  customer_contact: string | null;
  contact_person: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export interface OdService {
  id: string;
  org_id: string;
  property_id: string;
  name: string;
  template_key: string | null;
  cadence: Cadence;
  weekdays: number[];
  month_day: number | null;
  start_on: Day;
  end_on: Day | null;
  active: boolean;
  /** Nur Server: Nachfolgerin nach Turnus-Wechsel/Wiederaufnahme — dann nur noch Historie (SCHEMA.md) */
  replaced_by?: string | null;
  sort: number;
  notes: string | null;
  created_at: string;
}

export interface OdOperation {
  id: string;
  property_id: string;
  started_at: string;
  ended_at: string | null;
  lat: number | null;
  lng: number | null;
  gps_accuracy_m: number | null;
  gps_mocked: boolean | null;
  service_ids: string[];
  services: { id: string; name: string; cadence?: Cadence }[];
  photo_count: number;
  notes: string | null;
  performer_name: string | null;
  received_at: string | null;
  distance_m: number | null;
  entry_hash: string | null;
  canceled: boolean;
  cancel_reason: string | null;
  canceled_at: string | null;
}

export interface OdDefect {
  id: string;
  property_id: string;
  operation_id: string | null;
  text: string;
  photo_count: number;
  reporter_name: string | null;
  created_at: string;
  entry_hash: string | null;
  status: 'open' | 'done';
  resolved_at: string | null;
  resolved_name: string | null;
  resolved_note: string | null;
}

export interface OdShareLink {
  id: string;
  property_id: string;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
}

/** Zeile von today_overview */
export interface OdTodayRow {
  property_id: string;
  name: string;
  due: number;
  done: number;
  overdue: number;
  status: DayStatus;
}

/** Zeile von soll_ist */
export interface OdSollIstRow {
  service_id: string;
  name: string;
  cadence: Cadence;
  active: boolean;
  soll: number | null;
  ist: number;
  last_done: string | null;
}

export interface OdMember {
  membership_id: string;
  email: string;
  role: 'owner' | 'worker';
  joined_at: string;
}

/** Eingaben beim Anlegen/Ändern */
export type PropertyInput = Pick<OdProperty, 'name' | 'address' | 'customer_name' | 'customer_contact' | 'contact_person' | 'notes'> & { id?: string };
export type ServiceInput = Pick<OdService, 'property_id' | 'name' | 'cadence' | 'weekdays' | 'month_day' | 'start_on' | 'notes'> & {
  id?: string;
  template_key?: string | null;
};

/** Web-Ansicht für den Auftraggeber (baut die Landing, Token hinter # landet nie in Server-Protokollen). */
export const SHARE_BASE_URL = 'https://objektdex.dexware.app/nachweis/#';

export const STATUS_LABEL: Record<DayStatus, string> = {
  overdue: 'Überfällig',
  open: 'Offen',
  done: 'Erledigt',
  none: 'Heute nichts fällig',
};
export const STATUS_BADGE: Record<DayStatus, string> = {
  overdue: 'badge red',
  open: 'badge amber',
  done: 'badge green',
  none: 'badge',
};

/** Vorlagen wie in der App (types.ts SERVICE_TEMPLATES) */
export const SERVICE_TEMPLATES: { key: string; name: string; cadence: Cadence; weekdays: number[]; monthDay?: number }[] = [
  { key: 'stairs', name: 'Treppenhausreinigung', cadence: 'weekly', weekdays: [1] },
  { key: 'bins', name: 'Mülltonnen raus/rein', cadence: 'weekly', weekdays: [2] },
  { key: 'mow', name: 'Rasen mähen', cadence: 'biweekly', weekdays: [3] },
  { key: 'hedge', name: 'Hecke schneiden', cadence: 'on_demand', weekdays: [] },
  { key: 'leaves', name: 'Laub entfernen', cadence: 'on_demand', weekdays: [] },
  { key: 'sweep', name: 'Kehren', cadence: 'weekly', weekdays: [5] },
  { key: 'patrol', name: 'Kontrollgang', cadence: 'weekly', weekdays: [1, 4] },
  { key: 'lights', name: 'Leuchtmittel prüfen', cadence: 'monthly', weekdays: [], monthDay: 1 },
  { key: 'playground', name: 'Spielplatz-Sichtkontrolle', cadence: 'weekly', weekdays: [1] },
  { key: 'meters', name: 'Zählerstände', cadence: 'monthly', weekdays: [], monthDay: 31 },
  { key: 'special', name: 'Sonderreinigung', cadence: 'on_demand', weekdays: [] },
  { key: 'other', name: 'Sonstiges', cadence: 'on_demand', weekdays: [] },
];
