// PrüfDex — Prüfinhalte, Grenzwerte und Fristen der DGUV-V3-Prüfung, 1:1 aus der App übernommen
// (PruefDex/mobile/src/lib/dguv.ts und die Regeln aus mobile/src/screens/InspectionScreen.tsx).
// Bewusst ohne Abhängigkeiten: tests/pruefdex-vor-ort.test.mjs lädt diese Datei UND den Quelltext der App und
// vergleicht beide Wert für Wert. Wer hier etwas ändert, muss es in der App genauso ändern (und umgekehrt).

export type ProtectionClass = 'I' | 'II' | 'III' | null;
export type Result = 'passed' | 'failed';
export type VisualChecks = Record<string, boolean>;
export type Measurements = Record<string, string>;

export interface VisualCheckDef {
  key: string;
  label: string;
}

// Sichtprüfung ortsveränderlicher elektrischer Betriebsmittel
export const VISUAL_CHECKS: VisualCheckDef[] = [
  { key: 'gehaeuse', label: 'Gehäuse unbeschädigt' },
  { key: 'leitung', label: 'Anschlussleitung/Kabel unbeschädigt' },
  { key: 'stecker', label: 'Stecker unbeschädigt' },
  { key: 'zugentlastung', label: 'Zugentlastung wirksam' },
  { key: 'knickschutz', label: 'Knickschutz vorhanden' },
  { key: 'schalter', label: 'Schalter/Bedienelemente funktionsfähig' },
  { key: 'lueftung', label: 'Lüftungsöffnungen frei' },
  { key: 'ueberhitzung', label: 'Keine Überhitzungs-/Brandspuren' },
  { key: 'kennzeichnung', label: 'Kennzeichnung/Aufschriften lesbar' },
];

export interface MeasurementDef {
  key: string;
  label: string;
  unit: string;
  hint: string;
}

export const MEASUREMENTS: MeasurementDef[] = [
  {
    key: 'leitungslaenge',
    label: 'Leitungslänge',
    unit: 'm',
    hint: 'Optional — bei Leitungen über 5 m steigt der Grenzwert für den Schutzleiterwiderstand',
  },
  {
    key: 'schutzleiterwiderstand',
    label: 'Schutzleiterwiderstand',
    unit: 'Ω',
    hint: '≤ 0,3 Ω bis 5 m Leitung, je weitere 7,5 m + 0,1 Ω (max. 1 Ω) — nur Schutzklasse I',
  },
  {
    key: 'isolationswiderstand',
    label: 'Isolationswiderstand',
    unit: 'MΩ',
    hint: '≥ 1,0 MΩ (SK I) · ≥ 2,0 MΩ (SK II) · ≥ 0,25 MΩ (SK III)',
  },
  {
    key: 'ableitstrom',
    label: 'Schutzleiter-/Ersatzableitstrom',
    unit: 'mA',
    hint: '≤ 3,5 mA (SK I) · Berührstrom ≤ 0,5 mA (SK II)',
  },
];

// --- Automatische Grenzwert-Bewertung der Messwerte (schutzklassen-abhängig) ---
// 'ok'   = innerhalb Grenzwert · 'fail' = Grenzwert überschritten
// 'na'   = für diese Schutzklasse nicht erforderlich · 'none' = kein/ungültiger Wert
export type MeasureEval = 'ok' | 'fail' | 'na' | 'none';

/**
 * Deutschen Messwert tolerant in eine Zahl wandeln: '0,32' → 0,32 · '> 300' → 300 · '1.234,5' → 1234,5 ·
 * '1.500' → 1,5 (ohne Komma ist der Punkt ein Dezimalpunkt) · '0.3' → 0,3 · '1.000.000' ohne Komma → null.
 * Nicht Lesbares ('1,2,3', Text) → null.
 */
export function parseMeasure(raw?: string | null): number | null {
  if (raw == null) return null;
  const m = /[.,]?\d[\d.,]*/.exec(String(raw));
  if (!m) return null;
  let t = m[0].replace(/[.,]+$/, '');
  if (/^[.,]/.test(t)) t = '0' + t; // ',5' / '.5'
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  // Ohne Komma bleibt der Punkt ein Dezimalpunkt: '1.500' = 1,5 (Messgeräte zeigen drei Nachkommastellen).
  // Als Tausender gelesen würde ein SK-II-Gerät mit 1,5 MΩ fälschlich bestehen — im Zweifel die strengere Lesart.
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Grenzwert Schutzleiterwiderstand je Leitungslänge: 0,3 Ω bis 5 m, je weitere angefangene 7,5 m + 0,1 Ω, max. 1 Ω. */
export function schutzleiterLimit(lengthRaw: string | undefined): number {
  const len = parseMeasure(lengthRaw);
  if (len === null || len <= 5) return 0.3;
  return Math.min(1, Math.round((0.3 + 0.1 * Math.ceil((len - 5) / 7.5)) * 10) / 10);
}

/**
 * Bewertet einen Messwert gegen die Grenzwerte nach DIN EN 50699 (VDE 0702, Wiederholungsprüfung) bzw. DIN EN 50678
 * (VDE 0701, nach Reparatur):
 *  - Schutzleiterwiderstand: ≤ 0,3 Ω bis 5 m Leitung, sonst siehe schutzleiterLimit (nur Schutzklasse I)
 *  - Isolationswiderstand:   ≥ 1,0 MΩ (SK I) · ≥ 2,0 MΩ (SK II) · ≥ 0,25 MΩ (SK III)
 *  - Schutzleiter-/Ersatzableitstrom: ≤ 3,5 mA (SK I) · Berührstrom ≤ 0,5 mA (SK II)
 */
export function evaluateMeasurement(key: string, raw: string | undefined, sk: ProtectionClass, all?: Measurements): MeasureEval {
  if (key === 'leitungslaenge') return 'none'; // Angabe, kein Messwert mit Grenzwert
  const v = parseMeasure(raw);
  if (v === null) return 'none';
  // Schutzklasse fehlt am Gerät: nie automatisch „in Ordnung“. Was selbst die mildeste Grenze reißt, bleibt rot.
  if (sk == null) {
    if (key === 'isolationswiderstand') return v >= 1.0 ? 'none' : 'fail';
    if (key === 'ableitstrom') return v <= 3.5 ? 'none' : 'fail';
    return 'none';
  }
  switch (key) {
    case 'schutzleiterwiderstand':
      if (sk !== 'I') return 'na'; // nur bei Schutzklasse I relevant
      return v <= schutzleiterLimit(all?.leitungslaenge) ? 'ok' : 'fail';
    case 'isolationswiderstand': {
      const min = sk === 'II' ? 2.0 : sk === 'III' ? 0.25 : 1.0;
      return v >= min ? 'ok' : 'fail';
    }
    case 'ableitstrom': {
      if (sk === 'III') return 'na';
      const max = sk === 'II' ? 0.5 : 3.5;
      return v <= max ? 'ok' : 'fail';
    }
    default:
      return 'none';
  }
}

/** True, wenn mindestens ein eingetragener Messwert den Grenzwert überschreitet. */
export function anyMeasurementFail(meas: Measurements, sk: ProtectionClass): boolean {
  return MEASUREMENTS.some((m) => evaluateMeasurement(m.key, meas[m.key], sk, meas) === 'fail');
}

/** True, wenn mindestens ein lesbarer Messwert (ohne die Leitungslänge) eingetragen ist. */
export function hasAnyMeasurement(meas: Measurements): boolean {
  return MEASUREMENTS.some((m) => m.key !== 'leitungslaenge' && parseMeasure(meas[m.key]) !== null);
}

/**
 * Messung für diese Schutzklasse nicht erforderlich (nur Anzeige — eingeklappt statt weg):
 * Schutzleiterwiderstand + Leitungslänge (nur für dessen Grenzwert) nur bei SK I, Ableitstrom nicht bei SK III.
 * Wie notNeeded in InspectionScreen.tsx; deckt sich mit evaluateMeasurement ('na').
 */
export function notNeeded(key: string, sk: ProtectionClass): boolean {
  if (!sk) return false;
  if (key === 'schutzleiterwiderstand' || key === 'leitungslaenge') return sk !== 'I';
  if (key === 'ableitstrom') return sk === 'III';
  return false;
}

/** Schutzklasse aus der Datenbank (freier Text) — nur 'I', 'II', 'III' gelten, alles andere heißt „fehlt“. */
export function protectionClassOf(v: unknown): ProtectionClass {
  return v === 'I' || v === 'II' || v === 'III' ? v : null;
}

// --- Gesamtergebnis: Regeln aus InspectionScreen.tsx ------------------------------------------------------------

/** Sichtprüfung mit mindestens einem Punkt „nicht in Ordnung“? */
export function anyVisualFail(visual: VisualChecks): boolean {
  return Object.values(visual).some((v) => !v);
}

/**
 * Ergebnis-Vorschlag wie in der App: Sichtprüfung n. i. O. ODER Messwert über Grenzwert → „nicht bestanden“.
 * Der Vorschlag folgt den Eingaben (auch zurück auf „bestanden“), solange der Nutzer nicht selbst gewählt hat.
 * Eine eigene Wahl „nicht bestanden“ bleibt; ein neuer Mangel hebt ein gewähltes „bestanden“ auf.
 * @returns das Ergebnis und die danach noch gültige eigene Wahl
 */
export function followResult(anyFail: boolean, userChoice: Result | null): { result: Result; userChoice: Result | null } {
  if (anyFail) return { result: 'failed', userChoice: userChoice === 'passed' ? null : userChoice };
  return { result: userChoice ?? 'passed', userChoice };
}

/** Nächste Fälligkeit: bestanden → Prüfdatum + Intervall; nicht bestanden → sofort fällig (Nachprüfung nach Instandsetzung). */
export function nextDueDate(result: Result, inspectedAt: string, intervalMonths: number): string {
  return result === 'passed' ? addMonthsISO(inspectedAt, intervalMonths) : inspectedAt;
}

// --- Datums-Helfer (ISO 'YYYY-MM-DD') — immer LOKALES Kalenderdatum (toISOString wäre UTC) -----------------------
const pad2 = (n: number) => String(n).padStart(2, '0');
const localISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function todayISO(): string {
  return localISO(new Date());
}

/** Monate addieren; Monatsende wird gekappt (31.08. + 6 Monate = 28./29.02., nicht 03.03.). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return localISO(target);
}

export function formatDE(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

export type DueStatus = 'ok' | 'soon' | 'overdue' | 'none';

// Fälligkeits-Status für die Ampel
export function dueStatus(nextDue?: string | null): DueStatus {
  if (!nextDue) return 'none';
  const today = todayISO();
  if (nextDue < today) return 'overdue';
  const soon = addMonthsISO(today, 1);
  if (nextDue <= soon) return 'soon';
  return 'ok';
}

const DAY_MS = 86400000;

/** Ganze Tage bis zur Fälligkeit (0 = heute, negativ = überfällig); null ohne Termin. */
export function daysUntilDue(nextDue?: string | null): number | null {
  if (!nextDue) return null;
  const due = new Date(nextDue + 'T00:00:00').getTime();
  const today = new Date(todayISO() + 'T00:00:00').getTime();
  return Math.round((due - today) / DAY_MS);
}

/** Fristen-Zeile in einem Satz: „bis wann gilt die Prüfung / wann muss ich wieder ran?“ — wortgleich zur App. */
export function dueLabel(nextDue?: string | null): string {
  const status = dueStatus(nextDue);
  if (status === 'none') return 'Noch keine Prüfung — jetzt fällig';
  const days = daysUntilDue(nextDue)!;
  const date = formatDE(nextDue);
  if (status === 'overdue') {
    const n = Math.abs(days);
    return `Überfällig seit ${n} ${n === 1 ? 'Tag' : 'Tagen'} — war fällig am ${date}`;
  }
  if (days === 0) return `Prüfung heute fällig (${date})`;
  if (status === 'soon') return `Fällig in ${days} ${days === 1 ? 'Tag' : 'Tagen'} — am ${date}`;
  return `Gültig bis ${date} — dann erneut prüfen`;
}
