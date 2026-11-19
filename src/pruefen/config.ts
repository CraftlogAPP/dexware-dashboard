// „Vor Ort“ — Prüfungen am Handy im Browser erfassen. EIN Modul für alle Prüf-Apps (LeiterDex, FeuerDex, ToreDex,
// GurtDex …): Was je App verschieden ist (Tabellen, Spalten, Bezeichnungen, Checkliste, Prüfarten, Gratis-Grenze),
// steht in dieser Konfiguration. Die Werte kommen aus der types.ts der jeweiligen App (eine Quelle) —
// siehe src/leiterdex/vorOrt.tsx als Vorlage.
//
// ZWEI FAMILIEN (mode):
//   'unit' (Standard) — LeiterDex, FeuerDex, ToreDex, GurtDex: geprüft wird EINE Einheit (Leiter, Löscher, Tor …);
//                       Prüfung und Mangel tragen den Fremdschlüssel der Einheit.
//   'site'            — GerüstDex, RegalDex, SpielDex: die Prüfung/Inspektion/Kontrolle hängt am ganzen ORT
//                       (Baustelle, Lager, Spielplatz). Mängel/Schäden nennen die betroffene Einheit des Orts
//                       (Gerüst, Regalzeile, Spielgerät) — oder keine („Lager allgemein“).

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
  /**
   * Nur Orts-Modus: abweichende Rückfrage, wenn der Mangel KEINE Einheit nennt („Fläche allgemein“) —
   * z. B. SpielDex: „… muss der Bereich sofort abgesperrt werden …“. Fehlt sie, gilt blockQuestion.
   */
  blockQuestionGeneral?: string;
  /**
   * Sperr-Schalter OHNE Rückfrage (z. B. ToreDex bei Orange: eingeschränkter Betrieb ist erlaubt, die Sperre lässt
   * sich aber vermerken). Mit blockQuestion ist der Schalter ohnehin da.
   */
  blockable?: boolean;
}

/**
 * Warnung an EINER Einheit, die aus ihren Stammdaten folgt — z. B. GurtDex: Hersteller-Gebrauchsdauer überschritten
 * („ablegereif“). Wie in der App: rote Warnkarte beim Prüfen, Checklisten-Punkt vorbelegt, kein „Wieder fällig am …“,
 * die Einheit zählt in den Listen wie gesperrt und wird in der Serienprüfung nicht angeboten.
 */
export interface UnitAlert {
  /** Kurz für Plaketten, z. B. „Ablegereif“ */
  badge: string;
  /** Was los ist (Liste und Warnkarte), z. B. „Ablegereif seit März 2024 (…) — der Benutzung entziehen und aussondern.“ */
  text: string;
  /** Zusatz nur in der Warnkarte beim Prüfen, z. B. was mit der Checkliste geschehen ist. */
  formHint?: string;
  /** Checklisten-Punkte, die deshalb einmal vorbelegt werden, z. B. { lifetime: 'defect' }. Bleibt änderbar. */
  checklist?: Record<string, CheckResult>;
  /** Zeile nach dem Speichern statt „Wieder fällig am …“ */
  doneText: string;
}

export type PruefMode = 'unit' | 'site';

/**
 * Zweite Frist neben der Fälligkeits-Art — z. B. SpielDex: operative Kontrolle alle 90 Tage; die
 * Jahreshauptinspektion zählt mit (sie umfasst die operative Kontrolle). Nur im Orts-Modus ausgewertet.
 */
export interface ExtraDue {
  /** Bezeichnung für die Zeile, z. B. „Operative Kontrolle“ */
  label: string;
  /** Prüfarten, die diese Frist erfüllen, z. B. ['operational', 'main'] */
  kinds: string[];
  intervalDays: number;
  /** ab so vielen Tagen Rest „bald fällig“ */
  soonDays: number;
  /** Nach dem Speichern DIESER Prüfart erscheint der Text unten mit dem neuen Datum, z. B. 'operational' */
  doneKind: string;
  /** Text nach dem Speichern, z. B. „Nächste operative Kontrolle bis“ */
  doneText: string;
}

export interface PruefConfig {
  /** Kennung der App (wie in der Registry) — trennt Entwürfe, Warteschlange und gemerkte Angaben je App. */
  appId: string;
  appName: string;
  /** Familie: 'unit' = Prüfung je Einheit (Standard), 'site' = Prüfung je Ort (siehe oben). */
  mode?: PruefMode;
  /** Unterpfad der Standort-Verwaltung im Dashboard der App. Standard: 'standorte' (ToreDex: 'objekte'). */
  sitesPath?: string;
  /** Unterpfad der Prüfungs-Liste im Dashboard der App. Standard: 'pruefungen' (RegalDex: 'inspektionen', SpielDex: 'kontrollen'). */
  inspectionsPath?: string;
  /** Unterpfad der Mängel-Liste im Dashboard der App. Standard: 'maengel' (RegalDex: 'schaeden'). */
  defectsPath?: string;

  tables: {
    site: string;
    unit: string;
    inspection: string;
    defect: string;
  };
  cols: {
    /**
     * Fremdschlüssel der Einheit, z. B. 'ladder_id' — im Einheiten-Modus in inspection und defect,
     * im Orts-Modus NUR in defect (dort darf er leer sein: „Lager allgemein“).
     */
    unitFk: string;
    /**
     * Fremdschlüssel des Orts in Einheit, inspection und defect. Standard: 'site_id'
     * (RegalDex: 'warehouse_id', SpielDex: 'playground_id').
     */
    siteFk?: string;
    /** Sperr-Spalte in defect, z. B. 'ladder_blocked' */
    blocked: string;
    /** „außer Betrieb“-Spalte der Einheit, z. B. 'retired' */
    retired: string;
  };
  /** Spalten der Einheit für die Liste (ohne Foto-Spalten!). Muss id, den Orts-Fremdschlüssel (site_id bzw. cols.siteFk), name und cols.retired enthalten. */
  unitSelect: string;
  /** Unterzeile der Einheit, z. B. „Stehleiter · Aluminium“ */
  unitInfo: (row: Record<string, unknown>) => string;
  /**
   * Optional: Warnung aus den Stammdaten einer Einheit (Zeile mit den Spalten aus unitSelect). null = nichts.
   * Ohne diese Angabe verhält sich „Vor Ort“ wie bisher (LeiterDex, FeuerDex, ToreDex).
   */
  unitAlert?: (row: Record<string, unknown>) => UnitAlert | null;

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
    /** Optional: Platzhalter der Mangel-Beschreibung (Standard: „Details für die Instandsetzung (Position, Ersatzteil …)“) */
    defectDescriptionExample?: string;
    /** Optional: Beispiel für „n. z.“ unter der Checkliste, z. B. „Druckanzeige bei Aufladelöschern“ */
    naExample?: string;
    /** Optional: Name des PDF-Berichts im Reiter „Mehr“ (Standard: „Prüfbericht-PDF“) */
    report?: string;
    /**
     * Optional: Wie die Prüfung in dieser App heißt (Standard: Prüfung / Prüfungen / Prüfart) —
     * RegalDex: Inspektion / Inspektionen / Inspektionsart, SpielDex: Kontrolle / Kontrollen / Kontrollart.
     * Das Wort muss weiblich sein („die Prüfung“), die Sätze der Oberfläche sind so gebaut.
     */
    inspection?: { one: string; many: string; kind: string };
    /**
     * Optional: Wie der Mangel heißt (Standard: Mangel / Mängel / „mit 2 Mängeln“) — RegalDex: Schaden / Schäden / Schäden.
     * Das Wort muss männlich sein („der Mangel“).
     */
    defect?: { one: string; many: string; manyDative: string };
    /** Optional: Beschriftung des Namensfelds (Standard: „Geprüft von“; GerüstDex/RegalDex/SpielDex: „Kontrolliert von“) */
    inspectedBy?: string;
    /** Optional: Titel der Rückfrage ohne Namen (Standard: „Ohne Prüfernamen speichern?“) */
    noNameTitle?: string;
    /** Optional: Überschrift der Einstufung im Mangel (Standard: „Einstufung (Ampel)“) */
    severityTitle?: string;
    /** Orts-Modus: Auswahl „keine bestimmte Einheit“, z. B. „Lager allgemein“ */
    general?: string;
    /** Orts-Modus: Überschrift der Einheiten-Auswahl im Mangel, z. B. „Betroffene Regalzeile“ */
    affected?: string;
    /**
     * Orts-Modus, optional: abweichende Sperr-Texte, wenn der Mangel keine Einheit nennt (SpielDex: „Bereich gesperrt“
     * statt „Gerät gesperrt“). Fehlen sie, gelten blocked / blockedAsk / blockedShort.
     */
    blockedGeneral?: string;
    blockedAskGeneral?: string;
    blockedShortGeneral?: string;
    /**
     * Für den Hinweis an der Gratis-Grenze der Orte (cfg.freeSites): „aktives Lager“ / „aktive Lager“ und wie
     * nicht mitgezählte Orte heißen („stillgelegte“, bei GerüstDex „abgeschlossene“).
     */
    freeSites?: { one: string; many: string; inactive: string };
  };

  checklist: ChecklistPoint[];
  /** Prüfarten in der Reihenfolge der Auswahl; die erste ist vorbelegt. */
  kinds: InspectionKind[];
  /** Prüfart, an der die Fälligkeit hängt (z. B. 'expert'). */
  dueKind: string;
  /** Frist der Fälligkeits-Prüfart in Tagen — je Betrieb (z. B. org.expert_interval_days) oder je Land. */
  dueIntervalDays: (org: Record<string, unknown>) => number;
  /** Optional: ab so vielen Tagen Rest gilt die Fälligkeits-Art als „bald fällig“ (Standard 30; GerüstDex 14). */
  dueSoonDays?: number;
  /** Optional, Orts-Modus: zweite Frist (SpielDex: operative Kontrolle). */
  extraDue?: ExtraDue;
  /** Mangel-Stufen in der Reihenfolge der Auswahl. */
  severities: SeverityKind[];
  /** Vorbelegte Stufe eines neuen Mangels. */
  defaultSeverity: string;

  /** Gratis-Grenze der Einheiten wie in der App (z. B. 2 Einheiten im Bestand, außer Betrieb genommene zählen nicht). */
  freeUnits?: number;
  /** Gratis-Grenze der Orte wie in der App (GerüstDex/RegalDex/SpielDex: 1 aktiver Ort; stillgelegte zählen nicht). */
  freeSites?: number;
  /** Wie man Pro bekommt (Text für den Hinweis an der Gratis-Grenze). */
  proHow: string;

  /** Ordner im Foto-Speicher: <org>/<ordner>/<id>/<n>.jpg — gleiche Ordner wie die App. */
  photoFolders: { inspection: string; defect: string };
}

export const RESULT_LABELS: Record<CheckResult, string> = { ok: 'OK', defect: 'Mangel', na: 'n. z.' };

export function kindOf(cfg: PruefConfig, id: string): InspectionKind {
  return cfg.kinds.find((k) => k.id === id) ?? cfg.kinds[0];
}

/** Gibt es bei dieser Stufe den Sperr-Schalter? */
export function canBlock(s: SeverityKind): boolean {
  return !!s.blockQuestion || s.blockable === true;
}

/** Unterpfad der Standort-Verwaltung (wie im Dashboard der App). */
export function sitesPathOf(cfg: Pick<PruefConfig, 'sitesPath'>): string {
  return cfg.sitesPath ?? 'standorte';
}

/** Warnung einer Einheit laut Konfiguration — null, wenn die App keine kennt oder die Stammdaten fehlen. */
export function unitAlertOf(cfg: Pick<PruefConfig, 'unitAlert'>, unit: { row?: Record<string, unknown> }): UnitAlert | null {
  return cfg.unitAlert && unit.row ? cfg.unitAlert(unit.row) : null;
}

export function severityOf(cfg: PruefConfig, id: string): SeverityKind {
  return cfg.severities.find((s) => s.id === id) ?? cfg.severities[0];
}

// ---------------------------------------------------------------------------------------------------------
// Orts-Modus und Wortwahl — alles mit Standardwerten, die den bisherigen Texten der vier Einheiten-Apps entsprechen.
// ---------------------------------------------------------------------------------------------------------

type ModeCfg = Pick<PruefConfig, 'cols'> & Partial<Pick<PruefConfig, 'mode'>>;

/** Hängt die Prüfung am ganzen Ort (GerüstDex, RegalDex, SpielDex)? */
export function isSiteMode(cfg: Partial<Pick<PruefConfig, 'mode'>>): boolean {
  return cfg.mode === 'site';
}

/** Fremdschlüssel des Orts in Einheit, Prüfung und Mangel. */
export function siteFkOf(cfg: Pick<PruefConfig, 'cols'>): string {
  return cfg.cols.siteFk ?? 'site_id';
}

/** Spalte der Prüfung, an der die Fälligkeit hängt: die Einheit — im Orts-Modus der Ort. */
export function dueFkOf(cfg: ModeCfg): string {
  return isSiteMode(cfg) ? siteFkOf(cfg) : cfg.cols.unitFk;
}

/** Unterpfade der Prüfungs- und der Mängel-Liste (wie im Dashboard der App). */
export function inspectionsPathOf(cfg: Pick<PruefConfig, 'inspectionsPath'>): string {
  return cfg.inspectionsPath ?? 'pruefungen';
}
export function defectsPathOf(cfg: Pick<PruefConfig, 'defectsPath'>): string {
  return cfg.defectsPath ?? 'maengel';
}

export interface Words {
  /** Prüfung / Prüfungen / Prüfart */
  insp: { one: string; many: string; kind: string };
  /** Mangel / Mängel / Mängeln */
  defect: { one: string; many: string; manyDative: string };
  /** „Geprüft von“ */
  by: string;
  /** OK / Mangel / n. z. */
  results: Record<CheckResult, string>;
}

/** Wortwahl der App (Prüfung/Inspektion/Kontrolle, Mangel/Schaden …). */
export function wordsOf(cfg: Pick<PruefConfig, 'labels'>): Words {
  const insp = cfg.labels.inspection ?? { one: 'Prüfung', many: 'Prüfungen', kind: 'Prüfart' };
  const defect = cfg.labels.defect ?? { one: 'Mangel', many: 'Mängel', manyDative: 'Mängeln' };
  return { insp, defect, by: cfg.labels.inspectedBy ?? 'Geprüft von', results: { ...RESULT_LABELS, defect: defect.one } };
}

/** „1 Mangel“ / „3 Mängel“ */
export function countWord(n: number, w: { one: string; many: string }): string {
  return `${n} ${n === 1 ? w.one : w.many}`;
}

/**
 * Sperr-Texte eines Mangels: Schalter, Titel der Rückfrage, Kurzform und die Rückfrage selbst.
 * Im Orts-Modus ohne gewählte Einheit gelten — wenn die App sie kennt — die „allgemein“-Texte.
 */
export function blockWords(
  cfg: Pick<PruefConfig, 'labels'>,
  severity: SeverityKind,
  hasUnit: boolean,
): { toggle: string; askTitle: string; short: string; question: string | undefined } {
  const L = cfg.labels;
  if (hasUnit) return { toggle: L.blocked, askTitle: L.blockedAsk, short: L.blockedShort, question: severity.blockQuestion };
  return {
    toggle: L.blockedGeneral ?? L.blocked,
    askTitle: L.blockedAskGeneral ?? L.blockedAsk,
    short: L.blockedShortGeneral ?? L.blockedShort,
    question: severity.blockQuestionGeneral ?? severity.blockQuestion,
  };
}
