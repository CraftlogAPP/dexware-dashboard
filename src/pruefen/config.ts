// „Vor Ort“ — Prüfungen am Handy im Browser erfassen. EIN Modul für alle Prüf-Apps (LeiterDex, FeuerDex, ToreDex,
// GurtDex …): Was je App verschieden ist (Tabellen, Spalten, Bezeichnungen, Checkliste, Prüfarten, Gratis-Grenze),
// steht in dieser Konfiguration. Die Werte kommen aus der types.ts der jeweiligen App (eine Quelle) —
// siehe src/leiterdex/vorOrt.tsx als Vorlage.

export type CheckResult = 'ok' | 'defect' | 'na';
export type Tone = 'green' | 'amber' | 'red';

export interface ChecklistPoint {
  id: string;
  label: string;
  /** Prüfhinweis: erscheint bei „Mangel“ und auf Wunsch bei allen Punkten. */
  hint?: string;
}

export interface InspectionKind {
  /** Wert der Spalte inspection.type, z. B. 'visual' */
  id: string;
  label: string;
  short: string;
  hint?: string;
}

export interface SeverityKind {
  /** Wert der Spalte defect.severity, z. B. 'amber' */
  id: string;
  label: string;
  short: string;
  hint?: string;
  tone: Tone;
  /**
   * Rückfrage beim Übernehmen eines Mangels ohne Sperr-Vermerk (z. B. „Bei Orange muss die Leiter sofort der
   * Benutzung entzogen werden. Ist sie gesperrt?“). Ohne Text gibt es bei dieser Stufe weder Rückfrage noch Sperr-Schalter.
   */
  blockQuestion?: string;
}

export interface PruefConfig {
  /** Kennung der App (wie in der Registry) — trennt Entwürfe, Warteschlange und gemerkte Angaben je App. */
  appId: string;
  appName: string;

  tables: {
    site: string;
    unit: string;
    inspection: string;
    defect: string;
  };
  cols: {
    /** Fremdschlüssel der Einheit in inspection und defect, z. B. 'ladder_id' */
    unitFk: string;
    /** Sperr-Spalte in defect, z. B. 'ladder_blocked' */
    blocked: string;
    /** „außer Betrieb“-Spalte der Einheit, z. B. 'retired' */
    retired: string;
  };
  /** Spalten der Einheit für die Liste (ohne Foto-Spalten!). Muss id, site_id, name und cols.retired enthalten. */
  unitSelect: string;
  /** Unterzeile der Einheit, z. B. „Stehleiter · Aluminium“ */
  unitInfo: (row: Record<string, unknown>) => string;

  labels: {
    site: { one: string; many: string };
    /** Einzahl/Mehrzahl kurz („Leiter“/„Leitern“), die genaue Bezeichnung („Leiter / Tritt“) und die Frage in der Liste („Welche Leiter / welcher Tritt?“) */
    unit: { one: string; many: string; full: string; which: string };
    /** Schalter im Mangel, z. B. „Leiter gesperrt (Benutzung entzogen)“ */
    blocked: string;
    /** Titel der Sperr-Rückfrage, z. B. „Leiter gesperrt?“, und die Antwort „Ja, gesperrt“ */
    blockedAsk: string;
    blockedYes: string;
    /** Kurz für Listen und die Erfolgs-Ansicht, z. B. „Leiter gesperrt“ */
    blockedShort: string;
    /** Überschrift der Checkliste, z. B. „Checkliste (DGUV Information 208-016)“ */
    checklist: string;
    /** Platzhalter in Feldern */
    defectTitleExample: string;
    qualificationExample: string;
    notesExample: string;
  };

  checklist: ChecklistPoint[];
  /** Prüfarten in der Reihenfolge der Auswahl; die erste ist vorbelegt. */
  kinds: InspectionKind[];
  /** Prüfart, an der die Fälligkeit hängt (z. B. 'expert'). */
  dueKind: string;
  /** Frist der Fälligkeits-Prüfart in Tagen — je Betrieb (z. B. org.expert_interval_days) oder je Land. */
  dueIntervalDays: (org: Record<string, unknown>) => number;
  /** Mangel-Stufen in der Reihenfolge der Auswahl. */
  severities: SeverityKind[];
  /** Vorbelegte Stufe eines neuen Mangels. */
  defaultSeverity: string;

  /** Gratis-Grenze wie in der App (z. B. 2 Einheiten im Bestand, außer Betrieb genommene zählen nicht). */
  freeUnits: number;
  /** Wie man Pro bekommt (Text für den Hinweis an der Gratis-Grenze). */
  proHow: string;

  /** Ordner im Foto-Speicher: <org>/<ordner>/<id>/<n>.jpg — gleiche Ordner wie die App. */
  photoFolders: { inspection: string; defect: string };
}

export const RESULT_LABELS: Record<CheckResult, string> = { ok: 'OK', defect: 'Mangel', na: 'n. z.' };

export function kindOf(cfg: PruefConfig, id: string): InspectionKind {
  return cfg.kinds.find((k) => k.id === id) ?? cfg.kinds[0];
}

export function severityOf(cfg: PruefConfig, id: string): SeverityKind {
  return cfg.severities.find((s) => s.id === id) ?? cfg.severities[0];
}
