// Domain-Typen des DokuDex-Cloud-Syncs. Modell wie CraftDex/TourDex:
// EIN User = EIN Konto (kein Betrieb/Team). Zwei Tabellen documents/projects,
// je (user_id, client_id, data jsonb, updated_at) — KEIN deleted-Flag, die App
// löscht hart. documents.data enthält imageBase64 (Dokument-Scan) — Listen
// selektieren nur skalare JSON-Felder, nie den ganzen Blob (siehe api.ts).

export type DocType = 'contract' | 'invoice' | 'doctor' | 'authority' | 'other';

// Labels wie in der App (src/i18n/strings.js, de)
export const TYPE_LABELS: Record<DocType, string> = {
  contract: '📄 Vertrag',
  invoice: '🧾 Rechnung',
  doctor: '🏥 Arztbrief',
  authority: '🏛️ Behördenbrief',
  other: '📋 Sonstiges',
};

/** Schmale Dokument-Zeile — nur skalare/kleine Felder aus dem data-jsonb. */
export interface DocumentSummary {
  id: string;
  updated_at: string;
  title: string | null;
  type: DocType | null;
  project_id: string | null;
  /** KI-erkannter Dokumenttyp, z. B. „Mietvertrag" */
  ai_type: string | null;
  summary: string | null;
  /** Fristen als kurze Strings, z. B. „Zahlung bis 15.01.2025" */
  deadlines: string[] | null;
  created_at: string | null;
}

// --- Voller Dokument-Blob (nur im Detail laden; Shape wie App-Dokument) ---

export interface Analysis {
  documentType?: string;
  summary?: string;
  keyPoints?: string[];
  deadlines?: string[];
  actionItems?: string[];
  recommendation?: string;
}

export interface DocumentData {
  id: string;
  title: string;
  type: DocType;
  /** Dokument-Scan als Base64-JPEG (ohne data:-Präfix) */
  imageBase64?: string | null;
  analysis?: Analysis | null;
  notes?: string;
  projectId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}
