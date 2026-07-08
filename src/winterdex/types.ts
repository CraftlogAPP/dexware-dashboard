// Domain-Typen des WinterDex-Supabase-Schemas (Spiegel von mobile/src/types.ts)
// Org/Role/Member sind suite-weit identisch und leben in src/lib/orgApi.ts.

import type { Org } from '../lib/orgApi';

export interface DutyTimes {
  mo_fr?: string;
  sa?: string;
  so?: string;
}

export interface Property {
  id: string;
  org_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  customer_name: string | null;
  customer_contact: string | null;
  areas: string | null;
  duty_times: DutyTimes;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export type OperationAction =
  | 'cleared'
  | 'gritted'
  | 'cleared_gritted'
  | 'checked_no_action';

export interface WeatherSnapshot {
  temp_c?: number;
  apparent_c?: number;
  precip_mm?: number;
  rain_mm?: number;
  snowfall_cm?: number;
  wind_kmh?: number;
  code?: number;
  today_min_c?: number;
  today_snowfall_cm?: number;
  today_precip_mm?: number;
  source?: string;
  fetched_at?: string;
}

/** Einsatz OHNE photo_urls — die Spalte enthält Base64-Fotos und wird nur im Detail geladen. */
export interface Operation {
  id: string;
  org_id: string;
  property_id: string;
  started_at: string;
  ended_at: string | null;
  lat: number | null;
  lng: number | null;
  gps_accuracy_m: number | null;
  action: OperationAction;
  grit_material: string | null;
  grit_amount: string | null;
  weather: WeatherSnapshot | null;
  notes: string | null;
  performed_by: string | null;
  performer_name: string | null;
  canceled: boolean;
  cancel_reason: string | null;
  canceled_at: string | null;
  created_at: string;
}

export interface OperationWithPhotos extends Operation {
  photo_urls: string[];
}

export const ACTION_LABELS: Record<OperationAction, string> = {
  cleared: 'Geräumt',
  gritted: 'Gestreut',
  cleared_gritted: 'Geräumt + gestreut',
  checked_no_action: 'Kontrolliert — keine Maßnahme nötig',
};

export const LAND_LABELS: Record<Org['land'], string> = {
  DE: 'Deutschland',
  AT: 'Österreich',
  CH: 'Schweiz',
};

export const LEGAL_BASIS: Record<Org['land'], string> = {
  DE: 'Rechtsgrundlage: Verkehrssicherungspflicht gem. § 823 BGB i. V. m. kommunaler Satzung; Beweislast im Schadensfall beim Pflichtigen.',
  AT: 'Rechtsgrundlage: § 93 StVO (Anrainerpflichten) — Räum- und Streupflicht 6–22 Uhr; Haftung nach ABGB.',
  CH: 'Rechtsgrundlage: Werkeigentümerhaftung Art. 58 OR i. V. m. kommunalen Vorschriften.',
};
