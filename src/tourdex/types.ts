// Domain-Typen des TourDex-Cloud-Syncs. Modell wie CraftDex: EIN User = EIN
// Konto (kein Betrieb/Team). Alle Entities liegen in EINER Tabelle
// `sync_items` (user_id, collection, item_id, data jsonb, deleted) mit den
// Collections trips / vehicles / places. Trips enthalten im Blob optional
// `path` (GPS-Breadcrumbs, potenziell groß) — Listen selektieren deshalb nur
// skalare JSON-Felder, nie den ganzen Blob (siehe api.ts).

export type TripCategory = 'business' | 'private' | 'commute';

// Labels wie in der App (mobile i18n)
export const CATEGORY_LABELS: Record<TripCategory, string> = {
  business: 'Geschäftlich',
  private: 'Privat',
  commute: 'Arbeitsweg',
};

export type VehicleType = 'car' | 'van' | 'motorcycle' | 'truck';

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car: '🚗 PKW',
  van: '🚐 Transporter',
  motorcycle: '🏍️ Motorrad',
  truck: '🚛 LKW',
};

export type PlaceType = 'home' | 'office' | 'client' | 'other';

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  home: '🏠 Zuhause',
  office: '🏢 Büro',
  client: '🤝 Kunde',
  other: '📍 Sonstiges',
};

/** Schmale Fahrten-Zeile — nur skalare Felder aus dem data-jsonb. */
export interface TripSummary {
  id: string;
  updated_at: string;
  vehicle_id: string | null;
  start_time: string | null;
  end_time: string | null;
  start_address: string | null;
  end_address: string | null;
  distance_km: number | null;
  category: TripCategory | null;
  purpose: string | null;
  confirmed: boolean | null;
  manual: boolean | null;
}

// --- Volle Blobs (Shape wie mobile src/types) ---

export interface GeoPoint {
  latitude: number;
  longitude: number;
  address?: string;
  /** Unix epoch ms */
  timestamp?: number;
}

export interface AiSuggestion {
  category: TripCategory;
  /** 0..1 Modell-Konfidenz */
  confidence: number;
  reason: string;
  purpose?: string;
}

/** Voller Fahrt-Blob — nur im Detail laden (path kann groß sein). */
export interface TripData {
  id: string;
  vehicleId: string;
  startTime: string;
  endTime: string;
  start: GeoPoint;
  end: GeoPoint;
  distanceKm: number;
  category: TripCategory;
  purpose?: string;
  confirmed: boolean;
  aiSuggestion?: AiSuggestion;
  path?: GeoPoint[];
  manual: boolean;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  name: string;
  make?: string;
  model?: string;
  licensePlate?: string;
  type: VehicleType;
  initialOdometerKm?: number;
  isDefault: boolean;
  createdAt: string;
}

export interface SavedPlace {
  id: string;
  label: string;
  type: PlaceType;
  latitude: number;
  longitude: number;
  address?: string;
  defaultCategory?: TripCategory;
  createdAt: string;
}
