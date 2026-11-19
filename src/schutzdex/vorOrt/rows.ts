// Die Zeile, die „Vor Ort“ für SchutzDex in die Tabelle completion (Nachweis einer Unterweisung) schreibt — EXAKT
// wie die App (SchutzDex/src/lib/queries.ts → createCompletion, aufgerufen aus
// src/screens/briefings/RunBriefingScreen.tsx): gleiche Spalten, gleiche Bedeutung. Bewusst ohne Abhängigkeiten,
// damit der Schema-Test (tests/schutzdex-vor-ort.test.mjs) genau diese Funktionen gegen das echte Schema prüft.
// Der Server ergänzt selbst: Eingang (received_at), Prüfcode (entry_hash) und created_at (Zeitpunkt der Übertragung).
// Die Unterschrift steht wie in der App als PNG-Daten-URI direkt in der Spalte signature_path.

/** Gratis-Grenzen wie in der App (src/lib/purchases.ts → FREE_LIMITS): 2 aktive Mitarbeiter, 1 Unterweisung. */
export const FREE_LIMITS = { members: 2, briefings: 1 } as const;

/** Mindest-Anteil korrekter Antworten zum Bestehen (RunBriefingScreen → PASS_RATIO). */
export const PASS_RATIO = 0.7;

/**
 * Felder aus NACHTRAG-RUNDUMCHECK-2026-11-10. Kennt die Datenbank sie noch nicht, wird der Nachweis EINMAL ohne sie
 * gespeichert — ein unterschriebener Nachweis darf nie an einer fehlenden Spalte scheitern (wie die App).
 */
export const NEW_COMPLETION_FIELDS = ['briefing_titel', 'content_hash', 'unterwiesen_von'] as const;

export interface BriefingSection {
  titel: string;
  text: string;
  kernpunkte?: string[];
}

export interface BriefingQuestion {
  frage: string;
  optionen: string[];
  loesung_index: number;
}

// --- Gespeicherte Inhalte defensiv lesen (wie src/lib/aiValidate.ts): nie werfen, Fehlendes weglassen -------------

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map(text).filter((s) => s.length > 0) : [];
}

/** Abschnitte einer gespeicherten Unterweisung — auch wenn content kein sauberes Array ist. */
export function safeSections(v: unknown): BriefingSection[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s) => s && typeof s === 'object')
    .map((s) => {
      const o = s as Record<string, unknown>;
      return { titel: text(o.titel), text: text(o.text), kernpunkte: strings(o.kernpunkte) };
    });
}

/**
 * Fragen einer gespeicherten Unterweisung. Eine Frage ohne gültige Lösung/Antworten wird WEGGELASSEN
 * (sie wäre nie richtig beantwortbar und ließe den Mitarbeiter ohne eigenes Zutun durchfallen).
 */
export function safeQuestions(v: unknown): BriefingQuestion[] {
  if (!Array.isArray(v)) return [];
  const out: BriefingQuestion[] = [];
  for (const q of v) {
    if (!q || typeof q !== 'object') continue;
    const o = q as Record<string, unknown>;
    const frage = text(o.frage);
    const optionen = Array.isArray(o.optionen) ? o.optionen.map(text) : [];
    const idx = o.loesung_index;
    if (!frage || optionen.length < 2 || optionen.some((x) => !x)) continue;
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= optionen.length) continue;
    out.push({ frage, optionen, loesung_index: idx });
  }
  return out;
}

// --- Verständnis-Check auswerten (RunBriefingScreen) -------------------------------------------------------------

export interface CheckOutcome {
  /** Prozent richtig; null = Unterweisung ohne Fragen (kein Check — nicht „100 %“). */
  score: number | null;
  correct: number;
  /** Ohne Fragen gilt die Unterweisung mit der Unterschrift als durchgeführt (true — daran hängt die Jahresfrist). */
  passed: boolean;
}

export function checkOutcome(questions: readonly BriefingQuestion[], answers: Record<number, number>): CheckOutcome {
  const total = questions.length;
  const c = questions.reduce((acc, q, i) => acc + (answers[i] === q.loesung_index ? 1 : 0), 0);
  const s = total === 0 ? null : Math.round((c / total) * 100);
  return { score: s, correct: c, passed: total === 0 || c / total >= PASS_RATIO };
}

/**
 * Text, über den die Inhaltsversion (content_hash) gebildet wird — wie src/lib/nachweis.ts:
 * sha256(JSON.stringify([titel, content, questions])), content/questions so, wie die Datenbank sie liefert.
 */
export function contentHashInput(b: { titel: string; content: unknown; questions: unknown }): string {
  return JSON.stringify([b.titel, b.content, b.questions]);
}

// --- Die Zeile ----------------------------------------------------------------------------------------------------

/** Nachweis — so, wie er in die Tabelle completion geht. */
export interface CompletionRow {
  id: string;
  /** Zeitpunkt der Unterschrift (ISO) — bleibt beim Nachsenden aus dem Funkloch gleich */
  abgeschlossen_am: string;
  org_id: string;
  member_id: string;
  briefing_id: string;
  briefing_version: number;
  check_score: number | null;
  check_passed: boolean;
  /** Unterschrift als PNG-Daten-URI (data:image/png;base64,…) */
  signature_path: string;
  signed_name: string;
  device_info: string | null;
  briefing_titel: string | null;
  content_hash: string | null;
  unterwiesen_von: string | null;
}

export interface CompletionInput {
  /** feste ID je Unterschrift: Nachsenden ist wiederholbar („gibt es schon“ = gespeichert), nichts doppelt */
  id: string;
  /** Zeitpunkt der Unterschrift (ISO) */
  at: string;
  orgId: string;
  memberId: string;
  memberName: string;
  briefingId: string;
  briefingVersion: number;
  briefingTitel: string;
  score: number | null;
  passed: boolean;
  signature: string;
  deviceInfo?: string;
  contentHash?: string | null;
  trainer?: string | null;
}

export function buildCompletionRow(i: CompletionInput): CompletionRow {
  return {
    id: i.id,
    abgeschlossen_am: i.at,
    org_id: i.orgId,
    member_id: i.memberId,
    briefing_id: i.briefingId,
    briefing_version: i.briefingVersion,
    check_score: i.score,
    check_passed: i.passed,
    signature_path: i.signature,
    signed_name: i.memberName,
    device_info: i.deviceInfo ?? null,
    briefing_titel: i.briefingTitel?.trim().slice(0, 300) || null,
    content_hash: i.contentHash || null,
    unterwiesen_von: i.trainer?.trim().slice(0, 120) || null,
  };
}

/** Dieselbe Zeile ohne die Felder des Nachtrags (für Datenbanken, die sie noch nicht kennen). */
export function withoutNewFields(row: CompletionRow): Omit<CompletionRow, (typeof NEW_COMPLETION_FIELDS)[number]> {
  const alt: Record<string, unknown> = { ...row };
  for (const k of NEW_COMPLETION_FIELDS) delete alt[k];
  return alt as Omit<CompletionRow, (typeof NEW_COMPLETION_FIELDS)[number]>;
}

/** Ist das eine Unterschrift im Format der App (PNG-Daten-URI)? */
export function isSignature(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/png;base64,') && v.length > 40;
}

/** Darf noch ein aktiver Mitarbeiter dazu? (Gratis-Regel der App: aktive < Grenze, sonst nur mit Pro.) */
export function withinFreeMembers(activeCount: number): boolean {
  return activeCount < FREE_LIMITS.members;
}
