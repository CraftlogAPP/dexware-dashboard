// Domain-Typen des SchutzDex-Supabase-Schemas (Spiegel von src/types/db.ts der App).
// Besonderheit: SchutzDex hat KEINE membership-Tabelle — die org gehört direkt
// dem Auth-User (owner_user_id), Mitarbeiter sind Datensätze ohne eigene Accounts.

export type AssignmentStatus = 'offen' | 'erledigt' | 'ueberfaellig';

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  offen: 'Offen',
  erledigt: 'Erledigt',
  ueberfaellig: 'Überfällig',
};

export interface Member {
  id: string;
  org_id: string;
  name: string;
  taetigkeit: string | null;
  email: string | null;
  telefon: string | null;
  eintritt_am: string | null;
  aktiv: boolean;
  created_at: string;
}

/**
 * Unterweisung — content/questions (jsonb, KI-generierte Abschnitte + Fragen)
 * werden in Listen nicht gebraucht und deshalb nicht geladen.
 */
export interface Briefing {
  id: string;
  org_id: string;
  titel: string;
  thema: string | null;
  land: string | null;
  branche: string | null;
  taetigkeit: string | null;
  generiert_von: string;
  version: number;
  created_at: string;
}

export interface Assignment {
  id: string;
  org_id: string;
  briefing_id: string;
  member_id: string;
  faellig_am: string | null;
  status: AssignmentStatus;
  wiederholung: string;
  created_at: string;
}

/** Nachweis — append-only, prüffest (Unterschrift liegt im Storage). */
export interface Completion {
  id: string;
  org_id: string;
  assignment_id: string | null;
  member_id: string | null;
  briefing_id: string | null;
  briefing_version: number | null;
  abgeschlossen_am: string;
  check_score: number | null;
  check_passed: boolean;
  signed_name: string | null;
  device_info: string | null;
  created_at: string;
}

/**
 * Nachweis, wie ihn die Excel-Liste lädt — bewusst OHNE die Unterschrift (signature_path = PNG-Daten in der Zeile).
 * Die drei letzten Felder fehlen, wenn der jeweilige Nachtrag in der Datenbank noch nicht eingespielt ist.
 */
export interface CompletionExportRow {
  id: string;
  member_id: string | null;
  briefing_id: string | null;
  briefing_version: number | null;
  abgeschlossen_am: string;
  check_score: number | null;
  check_passed: boolean;
  signed_name: string | null;
  device_info: string | null;
  /** Thema zum Zeitpunkt der Unterschrift (NACHTRAG-RUNDUMCHECK-2026-11-10) */
  briefing_titel?: string | null;
  /** Person, die unterwiesen hat (NACHTRAG-RUNDUMCHECK-2026-11-10) */
  unterwiesen_von?: string | null;
  /** Prüfcode vom Server (0004_pruefcode) */
  entry_hash?: string | null;
}
