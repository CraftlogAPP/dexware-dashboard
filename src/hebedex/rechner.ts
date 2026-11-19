// Ablegereife-Rechner von HebeDex — 1:1 aus der App übernommen (HebeDex/mobile/src/types.ts: chainWear,
// wireRopeBreaks, hookOpening, measureResult, fmtPct und die Grenzwerte). Gleiche Felder, gleiche Rechenregeln,
// gleiche Grenzen, gleiche Texte — damit „Vor Ort“ im Browser dasselbe Ergebnis zeigt wie die App.
// Grundlage: DGUV Information 209-013 — Kette: Glieddicke −10 %, Längung ≥ 5 %; Haken: Maulaufweitung > 10 %.
// Drahtseil: DGUV Regel 109-017, Tabellen 1 und 2 (Litzenseil 6 auf 6d, 14 auf 30d oder 3 benachbarte Drähte einer
// Litze; Kabelschlagseil 10/15/40 auf 3d/6d/30d).
// Bewusst ohne Abhängigkeiten: tests/hebedex-rechner.test.mjs prüft genau diese Datei gegen die Datei der App.
// Die Werte sind Text, wie eingegeben (Komma oder Punkt) — so stehen sie auch in der Spalte inspection.measurements.

/** Welcher Rechner zum Teil-Typ gehört (wie MeasureKind in der App). */
export type RechnerArt = 'chain' | 'wire' | 'hook' | null;

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface MeasureResult {
  /** true = Ablegekriterium erreicht. */
  red: boolean;
  /** Kurzer Satz fürs Protokoll, z. B. „Glieddicke −4,2 % · Längung 1,8 %". */
  text: string;
  /** Genug Werte für eine Aussage? */
  complete: boolean;
  /** Messwert eingetragen, aber der Bezugswert fehlt → keine Bewertung möglich (z. B. „Nenndicke d"). */
  missing?: string;
}

/** Grenzwerte (DGUV I 209-013). */
export const CHAIN_WEAR_LIMIT_PCT = 10;
export const CHAIN_ELONG_LIMIT_PCT = 5;
export const HOOK_OPENING_LIMIT_PCT = 10;

export function fmtPct(p: number): string {
  return `${p.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: p < 10 ? 1 : 0 })} %`;
}

/**
 * Kette: Verschleiß der Glieddicke ((d − (d1+d2)/2) / d) und Längung der Teilung.
 * Ohne Angabe der Teilung neu gilt die Normteilung 3·d (EN 818).
 */
export function chainWear(m: {
  nominal?: unknown;
  d1?: unknown;
  d2?: unknown;
  pitchNew?: unknown;
  pitchMeasured?: unknown;
}): MeasureResult & { wearPct?: number; elongPct?: number } {
  const d = num(m.nominal);
  const d1 = num(m.d1);
  const d2 = num(m.d2);
  const pm = num(m.pitchMeasured);
  const pn = num(m.pitchNew) ?? (d ? 3 * d : undefined);
  let wearPct: number | undefined;
  let elongPct: number | undefined;
  if (d && d1) {
    const mean = d2 ? (d1 + d2) / 2 : d1;
    wearPct = Math.max(0, ((d - mean) / d) * 100);
  }
  if (pn && pm) elongPct = Math.max(0, ((pm - pn) / pn) * 100);
  // Messwert ohne Bezugswert: ausdrücklich melden.
  const lacks: string[] = [];
  if ((d1 || d2) && !d) lacks.push('Nenndicke d');
  else if (pm && !pn) lacks.push('Teilung neu');
  const missing = lacks.length ? lacks.join(', ') : undefined;
  const parts: string[] = [];
  if (wearPct !== undefined) parts.push(`Glieddicke −${fmtPct(wearPct)}`);
  if (elongPct !== undefined) parts.push(`Längung ${fmtPct(elongPct)}`);
  const red =
    (wearPct !== undefined && wearPct >= CHAIN_WEAR_LIMIT_PCT) ||
    (elongPct !== undefined && elongPct >= CHAIN_ELONG_LIMIT_PCT);
  return { red, wearPct, elongPct, complete: parts.length > 0, text: parts.join(' · '), missing };
}

/**
 * Drahtbruch-Grenzen je Bezugslänge 3d / 6d / 30d — DGUV Regel 109-017 (Ausgabe Dezember 2020), Tabelle 1
 * (Litzenseile, gemäß DIN EN 13414-2: 6 auf 6d, 14 auf 30d, außerdem 3 benachbarte Drähte einer Litze) und
 * Tabelle 2 (Kabelschlagseile: 10 / 15 / 40). null = für diese Länge nennt die Regel keinen Wert.
 */
export const WIRE_LIMITS: Record<'strand' | 'cable', [number | null, number, number]> = {
  strand: [null, 6, 14],
  cable: [10, 15, 40],
};

/** Die Grenzen als Satz für den Hinweis über den Eingabefeldern. */
export function wireLimitText(kind: 'strand' | 'cable'): string {
  return kind === 'cable'
    ? 'Ablegereif ab 10 / 15 / 40 Brüchen auf 3d / 6d / 30d; abweichende Herstellerangaben beachten.'
    : 'Ablegereif ab 6 Brüchen auf 6d oder 14 Brüchen auf 30d — außerdem bei 3 benachbarten Drahtbrüchen in einer Litze.';
}

export const ROPE_KIND_LABELS: Record<'strand' | 'cable', string> = {
  strand: 'Litzenseil',
  cable: 'Kabelschlagseil',
};

/** Drahtseil: gezählte sichtbare Drahtbrüche gegen die Tabelle. */
export function wireRopeBreaks(m: { ropeKind?: unknown; b3?: unknown; b6?: unknown; b30?: unknown }): MeasureResult {
  const kind = m.ropeKind === 'cable' ? 'cable' : 'strand';
  const lim = WIRE_LIMITS[kind];
  const vals = [m.b3, m.b6, m.b30].map((v) => {
    if (v === '' || v === undefined || v === null) return undefined;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  });
  const names = ['3d', '6d', '30d'];
  const parts: string[] = [];
  let red = false;
  vals.forEach((v, i) => {
    if (v === undefined) return;
    const g = lim[i];
    // Litzenseil auf 3d: kein Wert in der Regel — die Zahl bleibt sichtbar, bewertet wird sie nicht.
    parts.push(g === null ? `${v} auf ${names[i]} (kein Grenzwert)` : `${v} auf ${names[i]} (Grenze ${g})`);
    if (g !== null && v >= g) red = true;
  });
  return { red, complete: parts.length > 0, text: parts.length ? `${ROPE_KIND_LABELS[kind]}: ${parts.join(', ')}` : '' };
}

/** Haken: Maulaufweitung gegenüber dem Neumaß. */
export function hookOpening(m: { openingNew?: unknown; openingMeasured?: unknown }): MeasureResult & { pct?: number } {
  const n = num(m.openingNew);
  const x = num(m.openingMeasured);
  if (!n || !x) return { red: false, complete: false, text: '', missing: x && !n ? 'Maulweite neu' : undefined };
  const pct = Math.max(0, ((x - n) / n) * 100);
  return { red: pct > HOOK_OPENING_LIMIT_PCT, pct, complete: true, text: `Maulaufweitung ${fmtPct(pct)}` };
}

/** Stammdaten des Teils, die der Rechner als Ersatz nimmt, wenn im Formular nichts steht. */
export interface RechnerTeil {
  /** Nenndicke (Kette) / Durchmesser (Seil), Spalte lifting_item.nominal_mm */
  nominal_mm?: string | null;
  /** Seilart, Spalte lifting_item.rope_kind */
  rope_kind?: string | null;
}

/** Rechner-Ergebnis für eine Prüfung (je nach Art), undefined = kein Rechner. Wie measureResult in der App. */
export function rechne(art: RechnerArt, teil: RechnerTeil, m: Record<string, string> | undefined): MeasureResult | undefined {
  const v = m ?? {};
  if (art === 'chain') return chainWear({ nominal: v.nominal || teil.nominal_mm, d1: v.d1, d2: v.d2, pitchNew: v.pitchNew, pitchMeasured: v.pitchMeasured });
  if (art === 'wire') return wireRopeBreaks({ ropeKind: v.ropeKind || teil.rope_kind, b3: v.b3, b6: v.b6, b30: v.b30 });
  if (art === 'hook') return hookOpening({ openingNew: v.openingNew, openingMeasured: v.openingMeasured });
  return undefined;
}

/** Felder, an denen die App erkennt, dass wirklich gemessen wurde — nur dann werden die Messwerte gespeichert. */
export const MEASURED_KEYS = ['d1', 'pitchMeasured', 'b3', 'b6', 'b30', 'openingMeasured'] as const;

/**
 * Vorbelegung des Rechners beim Öffnen — wie in der App (InspectionScreen): Neumaße (Maulweite neu, Teilung neu) aus
 * der letzten Prüfung des Teils, Nenndicke aus der letzten Prüfung oder den Stammdaten, beim Drahtseil die Seilart
 * (letzte Prüfung → Stammdaten → Litzenseil).
 */
export function vorbelegung(kind: string, teil: RechnerTeil, letzte: Record<string, string>): Record<string, string> {
  const keep: Record<string, string> = {};
  if (letzte.openingNew) keep.openingNew = letzte.openingNew;
  if (letzte.pitchNew) keep.pitchNew = letzte.pitchNew;
  keep.nominal = letzte.nominal || teil.nominal_mm || '';
  if (kind === 'wire_rope') keep.ropeKind = letzte.ropeKind || teil.rope_kind || 'strand';
  return keep;
}

/**
 * Wie nah der Messwert an der Grenze ist (1 = Grenze) samt Beschriftung — wie der Balken der App (ResultBar).
 */
export function anteilAnGrenze(art: RechnerArt, teil: RechnerTeil, m: Record<string, string>): { ratio: number; label: string } {
  let ratio = 0;
  let label = '';
  if (art === 'chain') {
    const r = chainWear({ nominal: m.nominal || teil.nominal_mm, d1: m.d1, d2: m.d2, pitchNew: m.pitchNew, pitchMeasured: m.pitchMeasured });
    const a = r.wearPct !== undefined ? r.wearPct / CHAIN_WEAR_LIMIT_PCT : 0;
    const b = r.elongPct !== undefined ? r.elongPct / CHAIN_ELONG_LIMIT_PCT : 0;
    ratio = Math.max(a, b);
    label =
      a >= b && r.wearPct !== undefined
        ? `${fmtPct(r.wearPct)} von ${CHAIN_WEAR_LIMIT_PCT} %`
        : r.elongPct !== undefined
          ? `${fmtPct(r.elongPct)} von ${CHAIN_ELONG_LIMIT_PCT} %`
          : '';
  } else if (art === 'hook') {
    const r = hookOpening(m);
    if (r.pct !== undefined) {
      ratio = r.pct / HOOK_OPENING_LIMIT_PCT;
      label = `${fmtPct(r.pct)} von ${HOOK_OPENING_LIMIT_PCT} %`;
    }
  } else if (art === 'wire') {
    const lim = WIRE_LIMITS[(m.ropeKind || teil.rope_kind) === 'cable' ? 'cable' : 'strand'];
    const vals = [m.b3, m.b6, m.b30].map((v) => parseInt(v ?? '', 10));
    ratio = Math.max(0, ...vals.map((v, i) => (Number.isFinite(v) && lim[i] !== null ? v / (lim[i] as number) : 0)));
    label = 'Anteil an der Grenze';
  }
  return { ratio, label };
}
