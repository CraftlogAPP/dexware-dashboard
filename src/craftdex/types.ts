// Domain-Typen des CraftDex-Cloud-Syncs. Anderes Modell als die Prüf-Apps:
// EIN User = EIN Konto (kein Betrieb/Team), alle Projekte liegen als
// jsonb-Blob in projects.data — inkl. Base64-Fotos (photoBase64 am Projekt
// und an jedem Schritt). Listen selektieren deshalb nur skalare JSON-Felder,
// nie den ganzen Blob (siehe api.ts).

export type ProjectStatus = 'quote' | 'in_progress' | 'completed' | 'invoiced';

// Labels wie in der App (mobile i18n de.ts)
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  quote: 'Angebot',
  in_progress: 'In Arbeit',
  completed: 'Abgeschlossen',
  invoiced: 'Abgerechnet',
};

export const CATEGORY_LABELS: Record<string, string> = {
  handwerk: '🛠️ Handwerk',
  arbeit: '💼 Arbeit',
  sport: '🏃 Sport',
  lernen: '📚 Lernen',
  sonstiges: '✦ Sonstiges',
};

/** Schmale Listen-Zeile — nur skalare Felder aus dem data-jsonb. */
export interface ProjectSummary {
  id: string;
  updated_at: string;
  title: string | null;
  category: string | null;
  status: ProjectStatus | null;
  estimated_hours: number | null;
  logged_hours: number | null;
  budget: number | null;
  deadline_ms: number | null;
  customer_name: string | null;
  created_ms: number | null;
}

// --- Voller Projekt-Blob (nur im Detail laden; Shape wie mobile src/types) ---
export interface Step {
  id: string;
  title: string;
  done: boolean;
  photoBase64?: string;
}

export interface Material {
  id: string;
  name: string;
  amount?: string;
  done: boolean;
}

export interface MaterialCost {
  id: string;
  name: string;
  price: number;
}

export interface ProjectData {
  id: string;
  title: string;
  category: string;
  subcategory?: string;
  description?: string;
  photoBase64?: string;
  estimatedHours: number;
  loggedHours: number;
  steps: Step[];
  materials: Material[];
  costs: MaterialCost[];
  budget?: number;
  deadline?: { date: number };
  customer?: { name?: string; phone?: string; address?: string };
  status?: ProjectStatus;
  createdAt: number;
  updatedAt: number;
}
