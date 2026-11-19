// HebeDex-Konfiguration für „Vor Ort“ (src/pruefen). Maßstab ist die App (HebeDex/mobile/src/screens/InspectionScreen.tsx).
// HebeDex gehört zur Einheiten-Familie (geprüft wird je Teil), mit zwei Besonderheiten:
//   1) Checkliste und Prüfarten hängen vom Teil-Typ ab (checklistFor / kindsFor — Rissprüfung nur bei Rundstahlketten).
//   2) Messwerte mit Ablegereife-Rechner für Kette, Drahtseil und Haken (measure) — Rechenregeln in ./rechner.ts,
//      1:1 aus der App; die Werte gehen als Text in die Spalte inspection.measurements, ohne Messung `{}`.
// Dazu die Frist: Deutschland 12 Monate, Österreich 15 Monate, spätestens 31.12. des Folgejahres (dueDate).
// Importe mit Dateiendung: Der Schema-Test (tests/pruefen-vor-ort.test.mjs) lädt genau diese Datei mit Node.

import type { InspectionKind, MeasureField, MeasureOutcome, MeasureSpec, PruefConfig, UnitExtraDue } from '../pruefen/config.ts';
import {
  CHAIN_ELONG_LIMIT_PCT,
  CHAIN_WEAR_LIMIT_PCT,
  HOOK_OPENING_LIMIT_PCT,
  MEASURED_KEYS,
  ROPE_KIND_LABELS,
  WIRE_LIMITS,
  anteilAnGrenze,
  rechne,
  vorbelegung,
  type RechnerTeil,
} from './rechner.ts';
import {
  CHECK_HINTS,
  CRACK_INTERVAL_YEARS,
  INSPECTION_HINTS,
  INSPECTION_SHORT,
  ITEM_KINDS,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  SEVERITY_SHORT,
  checklistFor,
  crackDue,
  fmtDate,
  itemSubtitle,
  kindInfo,
  nextExpertDate,
  type DefectSeverity,
  type InspectionType,
  type ItemKind,
} from './types.ts';

/** Gratis-Grenze wie in der App (mobile/src/lib/entitlement.ts → FREE_LIMITS.items): 3 aktive Teile. */
export const FREE_ITEMS = 3;

// Bezeichnungen der Prüfarten wie in der App (dort ohne den Klammerzusatz, den die Dashboard-Tabellen tragen).
const KIND_LABELS: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle vor Gebrauch',
  expert: 'Wiederkehrende Prüfung',
  crack: 'Rissprüfung (Kette)',
};

// Reihenfolge der Auswahl wie in der App: die wiederkehrende Prüfung ist vorbelegt.
const KIND_ORDER: InspectionType[] = ['expert', 'visual', 'crack'];

const KINDS: InspectionKind[] = KIND_ORDER.map((id) => ({
  id,
  label: KIND_LABELS[id],
  short: INSPECTION_SHORT[id],
  hint: INSPECTION_HINTS[id],
  ...(id === 'crack'
    ? {
        photosTitle: 'Foto der Bescheinigung / Fotos',
        notesExample: 'z. B. Magnetpulverprüfung durch Fa. Muster, Bericht Nr. 123',
        doneText: `Nächste Rissprüfung in ${CRACK_INTERVAL_YEARS} Jahren.`,
      }
    : {}),
}));

// Rückfragen beim Übernehmen eines Mangels ohne Sperr-Vermerk — wortgleich zur App.
const BLOCK_QUESTION: Partial<Record<DefectSeverity, string>> = {
  amber: 'Bis zur Instandsetzung durch Hersteller oder Fachbetrieb darf das Teil nicht benutzt werden. Ist es gesperrt?',
  red: 'Ablegekriterium erreicht: Das Teil darf nicht mehr benutzt werden — sperren, kennzeichnen und aussondern. Ist es gesperrt?',
};

const text = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

/** Stammdaten-Zeile (Spalten aus unitSelect) in der Form, die Rechner und Fälligkeit brauchen. */
function teil(row: Record<string, unknown>) {
  return {
    kind: String(row.kind ?? '') as ItemKind,
    wll_kg: typeof row.wll_kg === 'number' ? row.wll_kg : null,
    length_m: text(row.length_m),
    nominal_mm: text(row.nominal_mm),
    rope_kind: row.rope_kind === 'cable' || row.rope_kind === 'strand' ? row.rope_kind : null,
    build_year: text(row.build_year),
    created_at: text(row.created_at) ?? new Date().toISOString(),
  };
}

const mm = (key: string, label: string, placeholder?: MeasureField['placeholder']): MeasureField => ({ key, label, unit: 'mm', ...(placeholder ? { placeholder } : {}) });

// Felder und Erklärungen je Rechner — Bezeichnungen und Reihenfolge wie in der App.
const CHAIN_ROWS: MeasureField[][] = [
  [mm('nominal', 'Nenndicke d'), mm('d1', 'gemessen d1'), mm('d2', 'gemessen d2')],
  [
    // ohne Angabe gilt die Normteilung 3 × d (EN 818) — als Platzhalter gezeigt
    mm('pitchNew', 'Teilung neu', (v) => (v.nominal ? String(3 * parseFloat(v.nominal.replace(',', '.')) || '') : '3 × d')),
    mm('pitchMeasured', 'Teilung gemessen'),
  ],
];
const WIRE_ROWS: MeasureField[][] = [
  (['b3', 'b6', 'b30'] as const).map((key, i) => ({ key, label: `Brüche auf ${['3d', '6d', '30d'][i]}`, integer: true })),
];
const HOOK_ROWS: MeasureField[][] = [[mm('openingNew', 'Maulweite neu'), mm('openingMeasured', 'Maulweite jetzt')]];

const TEXTS: MeasureSpec['texts'] = {
  red: '✕ Ablegereif — Teil sperren',
  ok: '✓ Innerhalb der Grenzen',
  redAction: 'Als roten Mangel erfassen & sperren',
  redAskTitle: 'Ablegekriterium erreicht',
  redAsk: (t) => `${t}. Das Teil ist ablegereif — als roten Mangel erfassen und sperren?`,
  defectTitle: (t) => `Ablegereif: ${t}`,
};

/** Ablegereife-Rechner dieses Teils — null, wenn der Teil-Typ keinen hat (z. B. Hebeband, Schäkel). */
export function rechnerFuer(row: Record<string, unknown>): MeasureSpec | null {
  const t = teil(row);
  const art = kindInfo(t.kind).measure;
  if (!art) return null;
  const stamm: RechnerTeil = { nominal_mm: t.nominal_mm, rope_kind: t.rope_kind };
  const evaluate = (values: Record<string, string>): MeasureOutcome | undefined => {
    const r = rechne(art, stamm, values);
    if (!r) return undefined;
    const bar = r.complete ? anteilAnGrenze(art, stamm, values) : null;
    return { red: r.red, text: r.text, complete: r.complete, missing: r.missing, ...(bar ? { ratio: bar.ratio, ratioLabel: bar.label } : {}) };
  };
  const common = {
    title: 'Ablegereife-Rechner',
    measuredKeys: [...MEASURED_KEYS],
    evaluate,
    prefill: (previous: Record<string, string>) => vorbelegung(t.kind, stamm, previous),
    texts: TEXTS,
    redSeverity: 'red',
  };
  if (art === 'chain') {
    return {
      ...common,
      hint: () =>
        `Glieddicke an der Auflagestelle in zwei Richtungen messen (d1, d2). Grenzen: −${CHAIN_WEAR_LIMIT_PCT} % Glieddicke, ${CHAIN_ELONG_LIMIT_PCT} % Längung.`,
      rows: CHAIN_ROWS,
      checkId: 'chainWear',
    };
  }
  if (art === 'wire') {
    return {
      ...common,
      hint: (v) =>
        `Sichtbare Drahtbrüche auf der Länge 3 × d, 6 × d und 30 × d zählen (d = Seil-Nenndurchmesser). Ablegereif ab ${WIRE_LIMITS[v.ropeKind === 'cable' ? 'cable' : 'strand'].join(' / ')} Brüchen.`,
      choice: {
        key: 'ropeKind',
        label: 'Seilart',
        options: (['strand', 'cable'] as const).map((id) => ({ id, label: ROPE_KIND_LABELS[id] })),
        fallback: 'strand',
      },
      rows: WIRE_ROWS,
      checkId: 'wireBreaks',
    };
  }
  return {
    ...common,
    hint: () => `Maulweite des Hakens messen und mit dem Neumaß vergleichen. Grenze: Aufweitung über ${HOOK_OPENING_LIMIT_PCT} %.`,
    rows: HOOK_ROWS,
    checkId: 'opening',
  };
}

/** Rissprüfung (nur Rundstahlketten): Zeile für die Liste — wie crackLabel in der App. */
export function rissFrist(row: Record<string, unknown>, lastOf: (kind: string) => string | undefined): UnitExtraDue | null {
  const info = crackDue(teil(row), lastOf('crack'));
  if (!info || !info.dueAt || info.state === 'never') return null;
  const day = fmtDate(info.dueAt);
  if (info.state === 'overdue') return { state: 'overdue', text: `Rissprüfung überfällig (seit ${day})` };
  if (info.state === 'soon') return { state: 'soon', text: `Rissprüfung fällig am ${day}` };
  return { state: 'ok', text: `Rissprüfung bis ${day}` };
}

const withHints = (kind: string) => checklistFor(kind).map((c) => ({ ...c, hint: CHECK_HINTS[c.id] }));

/** Alle Checklisten-Punkte aller Teil-Typen (jeder einmal) — die Checkliste EINES Teils liefert checklistFor. */
const ALL_POINTS = [...new Map(ITEM_KINDS.flatMap((k) => withHints(k.id)).map((c) => [c.id, c])).values()];

export const HEBEDEX_VOR_ORT: PruefConfig = {
  appId: 'hebedex',
  appName: 'HebeDex',
  tables: { site: 'site', unit: 'lifting_item', inspection: 'inspection', defect: 'defect' },
  cols: { unitFk: 'item_id', blocked: 'item_blocked', retired: 'retired', demo: 'is_demo' },
  // ohne photo_url / retire_photo (Daten-URIs — für die Liste viel zu groß); Typ, Nenndicke und Seilart brauchen
  // Checkliste und Rechner, Herstelljahr und Anlagedatum die Rissprüfungs-Frist
  unitSelect: 'id, site_id, name, kind, wll_kg, length_m, nominal_mm, rope_kind, build_year, retired, is_demo, created_at',
  // wie in der App (itemSubtitle): „Hebeband · 2 t · 3 m“ — ohne Farbe
  unitInfo: (r) => itemSubtitle({ ...teil(r), color: null }),
  checklistFor: (r) => withHints(String(r.kind ?? '')),
  kindsFor: (r) => KINDS.filter((k) => k.id !== 'crack' || kindInfo(String(r.kind ?? '')).crackTest),
  measure: rechnerFuer,
  unitExtraDue: rissFrist,
  labels: {
    site: { one: 'Standort', many: 'Standorte' },
    unit: { one: 'Teil', many: 'Teile', full: 'Teil', which: 'Welches Teil?' },
    blocked: 'Gesperrt (nicht mehr benutzen)',
    blockedAsk: 'Teil gesperrt?',
    blockedYes: 'Ja, gesperrt',
    blockedShort: 'Teil gesperrt',
    checklist: 'Checkliste',
    checklistFor: (r) => `Checkliste ${kindInfo(String(r.kind ?? '')).label}`,
    defectTitleExample: 'z. B. Hebeband eingeschnitten',
    qualificationExample: 'z. B. befähigte Person für Anschlag- und Zurrmittel',
    notesExample: 'z. B. Etikett erneuert, Kette gereinigt',
    defectDescriptionExample: 'Stelle, Ausmaß, Ursache …',
    report: 'Prüfbuch-PDF',
    freeUnitsNote: 'ausgesonderte Teile und Beispieldaten zählen nicht',
  },
  checklist: ALL_POINTS,
  kinds: KINDS,
  dueKind: 'expert',
  // Nur dafür, wie weit die Prüf-Daten zurück geladen werden — die Fälligkeit selbst rechnet dueDate.
  dueIntervalDays: (org) => (org.land === 'AT' ? 457 : 365),
  // Wie in der App (lib/due.ts → nextExpertDate): DE +12 Monate; AT der frühere Termin von +15 Monaten bzw. 31.12. des Folgejahres.
  dueDate: (last, org) => nextExpertDate(last, typeof org.land === 'string' ? org.land : null),
  severities: (Object.keys(SEVERITY_LABELS) as DefectSeverity[]).map((id) => ({
    id,
    label: SEVERITY_LABELS[id],
    short: SEVERITY_SHORT[id],
    hint: SEVERITY_HINTS[id],
    tone: id,
    blockQuestion: BLOCK_QUESTION[id],
    // Rot = ablegereif: der Sperr-Vermerk ist wie in der App gleich gesetzt
    ...(id === 'red' ? { autoBlock: true } : {}),
  })),
  defaultSeverity: 'amber',
  freeUnits: FREE_ITEMS,
  proHow: 'Pro schließt du in der HebeDex-App unter „Abo“ ab. Fragen dazu? Schreib uns an support@dexware.app.',
  photoFolders: { inspection: 'inspection', defect: 'defect' },
};

/**
 * Beispiel-Stammdaten für /app/hebedex/vor-ort?demo (nur Dev-Server): Kette (Rechner Glieddicke/Längung, Rissprüfung),
 * Hebeband (ohne Rechner), Drahtseil (Drahtbrüche), Lasthaken (Maulweite), Zurrgurt … — für jede Beispiel-Einheit
 * eine Zeile, weil Checkliste und Prüfarten bei HebeDex vom Teil-Typ abhängen.
 */
export const HEBEDEX_DEMO_ROWS: Record<string, unknown>[] = [
  { name: 'K-001', kind: 'chain', wll_kg: 2000, length_m: '2', nominal_mm: '10', rope_kind: null, build_year: '2021', retired: false, is_demo: false, created_at: '2025-01-15T08:00:00.000Z' },
  { name: 'HB-001', kind: 'webbing_sling', wll_kg: 2000, length_m: '3', nominal_mm: null, rope_kind: null, build_year: '2024', retired: false, is_demo: false, created_at: '2025-01-15T08:00:00.000Z' },
  { name: 'S-001', kind: 'wire_rope', wll_kg: 1500, length_m: '4', nominal_mm: '12', rope_kind: 'strand', build_year: '2023', retired: false, is_demo: false, created_at: '2025-01-15T08:00:00.000Z' },
  { name: 'H-001', kind: 'hook', wll_kg: 3200, length_m: null, nominal_mm: null, rope_kind: null, build_year: '2022', retired: false, is_demo: false, created_at: '2025-01-15T08:00:00.000Z' },
  { name: 'ZG-001', kind: 'lashing_strap', wll_kg: 2500, length_m: '8', nominal_mm: null, rope_kind: null, build_year: '2025', retired: false, is_demo: false, created_at: '2025-01-15T08:00:00.000Z' },
  { name: 'SCH-001', kind: 'shackle', wll_kg: 4750, length_m: null, nominal_mm: null, rope_kind: null, build_year: '2023', retired: false, is_demo: false, created_at: '2025-01-15T08:00:00.000Z' },
  { name: 'KZ-001', kind: 'hoist', wll_kg: 1000, length_m: '3', nominal_mm: null, rope_kind: null, build_year: '2022', retired: false, is_demo: false, created_at: '2025-01-15T08:00:00.000Z' },
  { name: 'RS-009 (alt)', kind: 'round_sling', wll_kg: 1000, length_m: '2', nominal_mm: null, rope_kind: null, build_year: '2015', retired: true, is_demo: false, created_at: '2025-01-15T08:00:00.000Z' },
  { name: 'ZK-001', kind: 'lashing_chain', wll_kg: 4000, length_m: '3,5', nominal_mm: '8', rope_kind: null, build_year: '2024', retired: false, is_demo: false, created_at: '2025-01-15T08:00:00.000Z' },
];
