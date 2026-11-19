// „Vor Ort“ — Prüfungen am Handy im Browser erfassen. EIN Modul für alle Prüf-Apps (LeiterDex, FeuerDex, ToreDex,
// GurtDex …): Was je App verschieden ist (Tabellen, Spalten, Bezeichnungen, Checkliste, Prüfarten, Gratis-Grenze),
// steht in dieser Konfiguration. Die Werte kommen aus der types.ts der jeweiligen App (eine Quelle) —
// siehe src/leiterdex/vorOrt.tsx als Vorlage.
//
// ZWEI FAMILIEN (mode):
//   'unit' (Standard) — LeiterDex, FeuerDex, ToreDex, GurtDex: geprüft wird EINE Einheit (Leiter, Löscher, Tor …);
//                       Prüfung und Mangel tragen den Fremdschlüssel der Einheit.
//                       HebeDex gehört dazu, mit zwei Besonderheiten (alles optionale Angaben): Checkliste und
//                       Prüfarten hängen vom Typ der Einheit ab (checklistFor, kindsFor), dazu kommen Messwerte mit
//                       Rechner (measure) und eine Frist, die sich nicht in Tagen ausdrücken lässt (dueDate).
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
  /** Optional: Überschrift der Beweisfotos bei dieser Prüfart (HebeDex Rissprüfung: „Foto der Bescheinigung / Fotos“). */
  photosTitle?: string;
  /** Optional: Platzhalter der Notiz bei dieser Prüfart (sonst labels.notesExample). */
  notesExample?: string;
  /** Optional: Zeile nach dem Speichern dieser Prüfart, wenn nichts gesperrt ist (HebeDex: „Nächste Rissprüfung in 3 Jahren.“). */
  doneText?: string;
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
  /**
   * Optional: Der Sperr-Vermerk ist bei dieser Stufe von Anfang an gesetzt (HebeDex bei Rot — „ablegereif, gesperrt“).
   * Er bleibt abwählbar; dann kommt wie üblich die Rückfrage.
   */
  autoBlock?: boolean;
}

// ---------------------------------------------------------------------------------------------------------
// Messwerte (HebeDex: Ablegereife-Rechner für Kette, Drahtseil, Haken) — nur Apps mit cfg.measure.
// Die Werte gehen als Text, so wie eingegeben, in die Spalte `measurements` der Prüfung (wie in der App).
// ---------------------------------------------------------------------------------------------------------

export interface MeasureField {
  /** Schlüssel im JSON der Spalte measurements, z. B. 'd1' */
  key: string;
  label: string;
  /** Einheit hinter der Bezeichnung, z. B. 'mm' */
  unit?: string;
  /** nur ganze Zahlen (z. B. gezählte Drahtbrüche) */
  integer?: boolean;
  /** Platzhalter aus den übrigen Werten, z. B. die Normteilung 3 × d */
  placeholder?: (values: Record<string, string>) => string;
}

/** Ergebnis des Rechners zu den eingegebenen Werten. */
export interface MeasureOutcome {
  /** true = Grenzwert erreicht (ablegereif) */
  red: boolean;
  /** Kurzer Satz fürs Protokoll, z. B. „Glieddicke −4,2 % · Längung 1,8 %“ */
  text: string;
  /** Genug Werte für eine Aussage? */
  complete: boolean;
  /** Messwert eingetragen, aber der Bezugswert fehlt (z. B. „Nenndicke d“) → keine Bewertung möglich */
  missing?: string;
  /** Wie nah am Grenzwert (1 = Grenze) — für den Balken */
  ratio?: number;
  ratioLabel?: string;
}

export interface MeasureSpec {
  /** Überschrift der Karte, z. B. „Ablegereife-Rechner“ */
  title: string;
  /** Erklärung über den Feldern (kann von den Werten abhängen, z. B. Grenzen je Seilart) */
  hint: (values: Record<string, string>) => string;
  /** Optional: Auswahl über den Feldern (Seilart) */
  choice?: { key: string; label: string; options: { id: string; label: string }[]; fallback: string };
  /** Eingabefelder, zeilenweise */
  rows: MeasureField[][];
  /** Nur wenn eines dieser Felder ausgefüllt ist, werden die Messwerte gespeichert (sonst `{}`). */
  measuredKeys: string[];
  /** Checklisten-Punkt, der bei Rot von selbst auf „Mangel“ springt */
  checkId?: string;
  evaluate: (values: Record<string, string>) => MeasureOutcome | undefined;
  /** Vorbelegung beim Öffnen aus den Messwerten der letzten Prüfung dieser Einheit (Neumaße, Nenndicke, Seilart). */
  prefill: (previous: Record<string, string>) => Record<string, string>;
  texts: {
    /** Ergebnis-Zeilen, z. B. „✕ Ablegereif — Teil sperren“ / „✓ Innerhalb der Grenzen“ */
    red: string;
    ok: string;
    /** Knopf unter einem roten Ergebnis, z. B. „Als roten Mangel erfassen & sperren“ */
    redAction: string;
    /** Rückfrage beim Speichern mit rotem Ergebnis ohne passenden Mangel */
    redAskTitle: string;
    redAsk: (text: string) => string;
    /** Titel des vorbelegten Mangels, z. B. „Ablegereif: …“ */
    defectTitle: (text: string) => string;
  };
  /** Stufe des vorbelegten Mangels bei Rot, z. B. 'red' */
  redSeverity: string;
}

/** Zweite Frist an EINER Einheit (HebeDex: Rissprüfung der Rundstahlkette alle 3 Jahre) — für die Listen. */
export interface UnitExtraDue {
  state: 'overdue' | 'soon' | 'ok';
  /** Zeile in der Liste, z. B. „Rissprüfung überfällig (seit 01.01.2026)“ */
  text: string;
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
    /** Optional: Spalte „Beispieldaten“ der Einheit (HebeDex: 'is_demo') — solche Einheiten zählen nicht gegen die Gratis-Grenze. */
    demo?: string;
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

  // --- Optional, nur Einheiten-Modus: was von den Stammdaten der Einheit abhängt (HebeDex). Ohne diese Angaben
  //     gilt für jede Einheit dasselbe (checklist, kinds) — so arbeiten alle anderen Apps.
  /** Checkliste je Einheit (HebeDex: je Teil-Typ). Punkte und Reihenfolge wie in der App. */
  checklistFor?: (row: Record<string, unknown>) => ChecklistPoint[];
  /** Prüfarten je Einheit (HebeDex: Rissprüfung nur bei Rundstahlketten). Die erste ist vorbelegt. */
  kindsFor?: (row: Record<string, unknown>) => InspectionKind[];
  /** Messwerte mit Rechner je Einheit; null = diese Einheit hat keinen. */
  measure?: (row: Record<string, unknown>) => MeasureSpec | null;
  /**
   * Zweite Frist je Einheit für die Listen. `lastOf(kind)` liefert die jüngste gültige Prüfung dieser Art (ISO) oder undefined.
   * null = für diese Einheit nicht nötig.
   */
  unitExtraDue?: (row: Record<string, unknown>, lastOf: (kind: string) => string | undefined) => UnitExtraDue | null;

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
    /** Optional: Überschrift der Checkliste je Einheit (HebeDex: „Checkliste Rundstahlkette“). Sonst gilt `checklist`. */
    checklistFor?: (row: Record<string, unknown>) => string;
    /** Optional: was an der Gratis-Grenze der Einheiten nicht mitzählt (Standard: „außer Betrieb genommene zählen nicht“). */
    freeUnitsNote?: string;
  };

  checklist: ChecklistPoint[];
  /** Prüfarten in der Reihenfolge der Auswahl; die erste ist vorbelegt. */
  kinds: InspectionKind[];
  /** Prüfart, an der die Fälligkeit hängt (z. B. 'expert'). */
  dueKind: string;
  /** Frist der Fälligkeits-Prüfart in Tagen — je Betrieb (z. B. org.expert_interval_days) oder je Land. */
  dueIntervalDays: (org: Record<string, unknown>) => number;
  /**
   * Optional: Fälligkeitstag nach einer Prüfung am Tag `last`, wenn die Frist keine feste Zahl von Tagen ist
   * (HebeDex Österreich: 15 Monate, spätestens 31.12. des Folgejahres). Dann zählt für die Anzeige NUR das hier;
   * dueIntervalDays bestimmt weiter, wie weit die Prüf-Daten zurück geladen werden.
   */
  dueDate?: (last: Date, org: Record<string, unknown>) => Date;
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

type RowCfg = Pick<PruefConfig, 'unitAlert' | 'checklistFor' | 'kindsFor' | 'measure' | 'unitExtraDue'>;

/** Braucht die App die Stammdaten-Zeile je Einheit (Warnung, eigene Checkliste, Messwerte …)? */
export function needsUnitRow(cfg: Partial<RowCfg>): boolean {
  return !!(cfg.unitAlert || cfg.checklistFor || cfg.kindsFor || cfg.measure || cfg.unitExtraDue);
}

/** Checkliste dieser Einheit — die der App oder (HebeDex) die des Teil-Typs. */
export function checklistOf(cfg: Pick<PruefConfig, 'checklist' | 'checklistFor'>, unit: { row?: Record<string, unknown> } | null): ChecklistPoint[] {
  return cfg.checklistFor && unit?.row ? cfg.checklistFor(unit.row) : cfg.checklist;
}

/** Prüfarten dieser Einheit — die der App oder (HebeDex) die zum Teil-Typ passenden. */
export function kindsOf(cfg: Pick<PruefConfig, 'kinds' | 'kindsFor'>, unit: { row?: Record<string, unknown> } | null): InspectionKind[] {
  const list = cfg.kindsFor && unit?.row ? cfg.kindsFor(unit.row) : cfg.kinds;
  return list.length > 0 ? list : cfg.kinds;
}

/** Messwerte mit Rechner dieser Einheit — null, wenn die App oder die Einheit keinen hat. */
export function measureOf(cfg: Pick<PruefConfig, 'measure'>, unit: { row?: Record<string, unknown> } | null): MeasureSpec | null {
  return cfg.measure && unit?.row ? cfg.measure(unit.row) : null;
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
