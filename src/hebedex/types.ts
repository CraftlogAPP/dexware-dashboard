// Domain-Typen des HebeDex-Supabase-Schemas (Spiegel von HebeDex/mobile/src/types.ts,
// aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.
// Prüfbuch für Anschlag-, Lastaufnahme- und Zurrmittel.
//  DE: BetrSichV §§ 3, 14 + TRBS 1201/1203, DGUV Regel 109-017 — mindestens alle
//      12 Monate durch eine befähigte Person; Rundstahlketten zusätzlich alle 3 Jahre
//      Rissprüfung. Zurrmittel: BetrSichV, Praxis VDI 2700 Blatt 3.1 (jährlich).
//  AT: AM-VO § 8 Abs. 1 Z 13 — mindestens einmal im Kalenderjahr, längstens 15 Monate.
//  Ablegereife: DGUV Information 209-013 (Kette −10 % / 5 %, Drahtbruch-Tabelle, Haken 10 %).

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Prüfarten
// ---------------------------------------------------------------------------
export type InspectionType = 'visual' | 'expert' | 'crack';

export const INSPECTION_LABELS: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle vor Gebrauch',
  expert: 'Wiederkehrende Prüfung (befähigte Person)',
  crack: 'Rissprüfung (Kette)',
};

export const INSPECTION_SHORT: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle',
  expert: 'Wiederkehrende Prüfung',
  crack: 'Rissprüfung',
};

const DAY_MS = 86_400_000;
/** Ab so vielen Tagen Restlaufzeit gilt eine Prüfung als „bald fällig" (wie die App). */
export const DUE_SOON_DAYS = 30;
/** Rissprüfungs-Intervall für Rundstahlketten. */
export const CRACK_INTERVAL_YEARS = 3;

function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return r;
}

/**
 * Nächster Termin der wiederkehrenden Prüfung (wie die App, lib/due.ts):
 * DE +12 Monate; AT der frühere Termin von +15 Monaten bzw. 31.12. des Folgejahres.
 */
export function nextExpertDate(last: Date, land: string | null | undefined): Date {
  if (land === 'AT') {
    const by15 = addMonths(last, 15);
    const endNextYear = new Date(last.getFullYear() + 1, 11, 31, 23, 59);
    return by15 < endNextYear ? by15 : endNextYear;
  }
  return addMonths(last, 12);
}

export type DueState = 'never' | 'overdue' | 'soon' | 'ok';

export interface DueInfo {
  state: DueState;
  dueAt: Date | null;
  daysLeft: number | null;
}

function infoFor(dueAt: Date): DueInfo {
  const daysLeft = Math.ceil((dueAt.getTime() - Date.now()) / DAY_MS);
  const state: DueState = daysLeft <= 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'soon' : 'ok';
  return { state, dueAt, daysLeft };
}

/** Fälligkeit der wiederkehrenden Prüfung aus der letzten Prüfung (undefined = nie geprüft). */
export function expertDue(lastExpertAt: string | undefined, land: string | null | undefined): DueInfo {
  if (!lastExpertAt) return { state: 'never', dueAt: null, daysLeft: null };
  return infoFor(nextExpertDate(new Date(lastExpertAt), land));
}

/**
 * Rissprüfung (nur Typen mit crackTest): letzte Rissprüfung + 3 Jahre; ohne Rissprüfung
 * zählt das Herstelljahr bzw. das Anlagedatum als Start. undefined = für den Typ nicht nötig.
 */
export function crackDue(
  item: Pick<LiftingItem, 'kind' | 'build_year' | 'created_at'>,
  lastCrackAt: string | undefined,
): DueInfo | undefined {
  if (!kindInfo(item.kind).crackTest) return undefined;
  let base: Date;
  if (lastCrackAt) base = new Date(lastCrackAt);
  else {
    const y = parseInt(item.build_year ?? '', 10);
    base = y > 1950 && y < 2100 ? new Date(y, 0, 1) : new Date(item.created_at);
  }
  return infoFor(addMonths(base, CRACK_INTERVAL_YEARS * 12));
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Kurze Fälligkeits-Zeile für Tabellen. */
export function dueLabel(info: DueInfo): string {
  if (info.state === 'never') return 'Noch nie geprüft';
  if (info.state === 'overdue') return `Überfällig seit ${fmtDate(info.dueAt!)}`;
  if (info.state === 'soon') return `Fällig am ${fmtDate(info.dueAt!)}`;
  return `Nächste bis ${fmtDate(info.dueAt!)}`;
}

// ---------------------------------------------------------------------------
// Teil-Typen (identisch zur App, damit gespeicherte kind-Werte aufgelöst werden)
// ---------------------------------------------------------------------------
export type ItemKind =
  | 'chain'
  | 'webbing_sling'
  | 'round_sling'
  | 'wire_rope'
  | 'shackle'
  | 'hook'
  | 'beam'
  | 'clamp'
  | 'hoist'
  | 'lashing_strap'
  | 'lashing_chain'
  | 'other';

export type MeasureKind = 'chain' | 'wire' | 'hook' | null;

export interface KindInfo {
  id: ItemKind;
  label: string;
  emoji: string;
  lashing: boolean;
  crackTest: boolean;
  measure: MeasureKind;
  /** Bezeichnung des Maß-Feldes (Nenndicke / Durchmesser), leer = kein Feld. */
  sizeLabel?: string;
}

export const ITEM_KINDS: KindInfo[] = [
  { id: 'chain', label: 'Rundstahlkette', emoji: '⛓️', lashing: false, crackTest: true, measure: 'chain', sizeLabel: 'Nenndicke d (mm)' },
  { id: 'webbing_sling', label: 'Hebeband', emoji: '🎗️', lashing: false, crackTest: false, measure: null },
  { id: 'round_sling', label: 'Rundschlinge', emoji: '➰', lashing: false, crackTest: false, measure: null },
  { id: 'wire_rope', label: 'Drahtseil', emoji: '🪢', lashing: false, crackTest: false, measure: 'wire', sizeLabel: 'Seil-Nenndurchmesser d (mm)' },
  { id: 'shackle', label: 'Schäkel', emoji: '🔩', lashing: false, crackTest: false, measure: null },
  { id: 'hook', label: 'Lasthaken / Wirbel', emoji: '🪝', lashing: false, crackTest: false, measure: 'hook' },
  { id: 'beam', label: 'Traverse / Lastaufnahmemittel', emoji: '🏗️', lashing: false, crackTest: false, measure: null },
  { id: 'clamp', label: 'Hebeklemme', emoji: '🗜️', lashing: false, crackTest: false, measure: null },
  { id: 'hoist', label: 'Kettenzug / Hebezeug', emoji: '⚙️', lashing: false, crackTest: false, measure: 'hook' },
  { id: 'lashing_strap', label: 'Zurrgurt', emoji: '🚚', lashing: true, crackTest: false, measure: null },
  { id: 'lashing_chain', label: 'Zurrkette', emoji: '🔗', lashing: true, crackTest: false, measure: 'chain', sizeLabel: 'Nenndicke d (mm)' },
  { id: 'other', label: 'Sonstiges', emoji: '📦', lashing: false, crackTest: false, measure: null },
];

const KIND_MAP: Record<string, KindInfo> = Object.fromEntries(ITEM_KINDS.map((k) => [k.id, k]));

/** Typ-Info; unbekannte Werte → „Sonstiges". */
export function kindInfo(kind: string | null | undefined): KindInfo {
  return KIND_MAP[kind ?? ''] ?? KIND_MAP.other;
}

// ---------------------------------------------------------------------------
// Checklisten je Typ (Ablegekriterien nach DGUV I 209-013 / Herstellerangaben)
// ---------------------------------------------------------------------------
export type CheckResult = 'ok' | 'defect' | 'na';

export interface ChecklistItem {
  id: string;
  label: string;
}

const C: Record<string, string> = {
  marking: 'Kennzeichnung / Etikett',
  links: 'Kettenglieder',
  chainWear: 'Verschleiß & Längung',
  fittings: 'Aufhänge- & Verbindungsglieder',
  corrosion: 'Korrosion & Hitze',
  webbing: 'Gewebe / Band',
  seams: 'Tragende Nähte',
  cover: 'Schutzhülle',
  heatChem: 'Hitze & Chemikalien',
  eyes: 'Schlaufen & Beschläge',
  wireBreaks: 'Drahtbrüche',
  strand: 'Litzenbruch',
  ropeDeform: 'Verformung',
  terminations: 'Endverbindungen',
  body: 'Grundkörper',
  pin: 'Bolzen & Sicherung',
  opening: 'Maulaufweitung',
  latch: 'Sicherungsfalle',
  swivel: 'Wirbel & Lager',
  structure: 'Tragkonstruktion',
  suspension: 'Aufhängung & Anschlagpunkte',
  wllPlate: 'Typenschild / Tragfähigkeit',
  jaws: 'Klemmbacken',
  lock: 'Verriegelung & Feder',
  loadChain: 'Lastkette / Seil',
  hooks: 'Haken',
  brake: 'Bremse & Funktion',
  ratchet: 'Ratsche / Spannelement',
  endFittings: 'Endbeschläge',
  tensioner: 'Spannelement',
  condition: 'Zustand',
  func: 'Funktion',
  docs: 'Herstellerangaben & Historie',
};

const KIND_CHECKS: Record<ItemKind, string[]> = {
  chain: ['marking', 'links', 'chainWear', 'fittings', 'corrosion', 'docs'],
  webbing_sling: ['marking', 'webbing', 'seams', 'heatChem', 'eyes', 'docs'],
  round_sling: ['marking', 'cover', 'seams', 'heatChem', 'docs'],
  wire_rope: ['marking', 'wireBreaks', 'strand', 'ropeDeform', 'terminations', 'corrosion', 'docs'],
  shackle: ['marking', 'body', 'pin', 'corrosion', 'docs'],
  hook: ['marking', 'opening', 'latch', 'body', 'swivel', 'docs'],
  beam: ['wllPlate', 'structure', 'suspension', 'pin', 'docs'],
  clamp: ['marking', 'jaws', 'lock', 'body', 'docs'],
  hoist: ['wllPlate', 'loadChain', 'hooks', 'opening', 'brake', 'docs'],
  lashing_strap: ['marking', 'webbing', 'seams', 'ratchet', 'endFittings', 'heatChem'],
  lashing_chain: ['marking', 'links', 'chainWear', 'tensioner', 'endFittings', 'corrosion'],
  other: ['marking', 'condition', 'func', 'docs'],
};

/** Checkliste für einen Teil-Typ (gleiche Punkte und Reihenfolge wie die App). */
export function checklistFor(kind: string | null | undefined): ChecklistItem[] {
  return KIND_CHECKS[kindInfo(kind).id].map((id) => ({ id, label: C[id] }));
}

/** Beschriftung eines Checklisten-Schlüssels (auch für ältere Prüfungen). */
export function checkLabel(id: string): string {
  return C[id] ?? id;
}

// ---------------------------------------------------------------------------
// Ablegereife-Rechner — Auswertung der in der App erfassten Messwerte
// ---------------------------------------------------------------------------
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function fmtPct(p: number): string {
  return `${p.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: p < 10 ? 1 : 0 })} %`;
}

export interface MeasureResult {
  red: boolean;
  text: string;
}

export const WIRE_LIMITS: Record<'strand' | 'cable', [number, number, number]> = {
  strand: [4, 6, 16],
  cable: [10, 15, 40],
};

export const ROPE_KIND_LABELS: Record<'strand' | 'cable', string> = {
  strand: 'Litzenseil',
  cable: 'Kabelschlagseil',
};

/** Rechner-Ergebnis einer Prüfung (je nach Typ); undefined = kein Rechner oder keine Werte. */
export function measureResult(
  item: Pick<LiftingItem, 'kind' | 'nominal_mm' | 'rope_kind'>,
  m: Record<string, unknown> | null | undefined,
): MeasureResult | undefined {
  const k = kindInfo(item.kind).measure;
  const v = m ?? {};
  if (k === 'chain') {
    const d = num(v.nominal) ?? num(item.nominal_mm);
    const d1 = num(v.d1);
    const d2 = num(v.d2);
    const pm = num(v.pitchMeasured);
    const pn = num(v.pitchNew) ?? (d ? 3 * d : undefined);
    const parts: string[] = [];
    let red = false;
    if (d && d1) {
      const wear = Math.max(0, ((d - (d2 ? (d1 + d2) / 2 : d1)) / d) * 100);
      parts.push(`Glieddicke −${fmtPct(wear)}`);
      if (wear >= 10) red = true;
    }
    if (pn && pm) {
      const elong = Math.max(0, ((pm - pn) / pn) * 100);
      parts.push(`Längung ${fmtPct(elong)}`);
      if (elong >= 5) red = true;
    }
    return parts.length ? { red, text: parts.join(' · ') } : undefined;
  }
  if (k === 'wire') {
    const kind = (v.ropeKind || item.rope_kind) === 'cable' ? 'cable' : 'strand';
    const lim = WIRE_LIMITS[kind];
    const names = ['3d', '6d', '30d'];
    const parts: string[] = [];
    let red = false;
    [v.b3, v.b6, v.b30].forEach((raw, i) => {
      if (raw === '' || raw === undefined || raw === null) return;
      const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      if (!Number.isFinite(n) || n < 0) return;
      parts.push(`${n} auf ${names[i]} (Grenze ${lim[i]})`);
      if (n >= lim[i]) red = true;
    });
    return parts.length ? { red, text: `${ROPE_KIND_LABELS[kind]}: ${parts.join(', ')}` } : undefined;
  }
  if (k === 'hook') {
    const n = num(v.openingNew);
    const x = num(v.openingMeasured);
    if (!n || !x) return undefined;
    const pct = Math.max(0, ((x - n) / n) * 100);
    return { red: pct > 10, text: `Maulaufweitung ${fmtPct(pct)}` };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tragfähigkeit + Farbe (EN 1492)
// ---------------------------------------------------------------------------
/** Tragfähigkeit lesbar: 2000 → „2 t", 750 → „750 kg". */
export function fmtWll(kg?: number | null): string {
  if (!kg || kg <= 0) return '';
  if (kg >= 1000) return `${(kg / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} t`;
  return `${kg} kg`;
}

/** Eingabe „2 t", „2,5t", „750 kg", „2000" → kg (Zahl ≤ 100 ohne Einheit = Tonnen). */
export function parseWll(s: string): number | undefined {
  const t = s.trim().toLowerCase().replace(',', '.');
  if (!t) return undefined;
  const m = /^(\d+(?:\.\d+)?)\s*(t|kg)?$/.exec(t);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (m[2] === 'kg') return Math.round(n);
  if (m[2] === 't' || n <= 100) return Math.round(n * 1000);
  return Math.round(n);
}

export const WLL_COLORS = ['violett', 'grün', 'gelb', 'grau', 'rot', 'braun', 'blau', 'orange'] as const;

/** Kurzbeschreibung: „Hebeband · 2 t · 3 m · grün". */
export function itemSubtitle(
  it: Pick<LiftingItem, 'kind' | 'wll_kg' | 'length_m' | 'nominal_mm' | 'color'>,
): string {
  const k = kindInfo(it.kind);
  const parts = [k.label];
  const w = fmtWll(it.wll_kg);
  if (w) parts.push(w);
  if (it.length_m) parts.push(`${it.length_m} m`);
  if (it.nominal_mm && k.sizeLabel) parts.push(`${k.measure === 'wire' ? 'Ø' : 'd'} ${it.nominal_mm} mm`);
  if (it.color) parts.push(it.color);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Standort (Lager, Fahrzeug, Baustelle, Kunde …)
// ---------------------------------------------------------------------------
export interface Site {
  id: string;
  org_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  operator_name: string | null;
  operator_contact: string | null;
  notes: string | null;
  active: boolean;
  is_demo?: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Teil — Anschlag-, Lastaufnahme- oder Zurrmittel je Standort.
// photo_url / retire_photo (Base64) werden im Dashboard bewusst nie geladen.
// ---------------------------------------------------------------------------
export interface LiftingItem {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
  kind: ItemKind;
  wll_kg: number | null;
  length_m: string | null;
  nominal_mm: string | null;
  rope_kind: 'strand' | 'cable' | null;
  manufacturer: string | null;
  serial_no: string | null;
  build_year: string | null;
  color: string | null;
  notes: string | null;
  retired: boolean;
  retired_at: string | null;
  retire_reason: string | null;
  is_demo: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Prüfung — je Teil, APPEND-ONLY. photo_urls/signature nur im Detail/Bericht laden!
// ---------------------------------------------------------------------------
export interface Inspection {
  id: string;
  org_id: string;
  site_id: string;
  item_id: string;
  type: InspectionType;
  started_at: string;
  lat: number | null;
  lng: number | null;
  gps_accuracy_m: number | null;
  checklist: Record<string, CheckResult>;
  measurements: Record<string, unknown> | null;
  notes: string | null;
  performed_by: string | null;
  inspector_name: string | null;
  canceled: boolean;
  cancel_reason: string | null;
  canceled_at: string | null;
  created_at: string;
}

export interface InspectionWithPhotos extends Inspection {
  photo_urls: string[];
  signature?: string | null;
}

// ---------------------------------------------------------------------------
// Mangel — Ampelverfahren, je Teil, lebt bis zur Instandsetzung/Aussonderung.
// ---------------------------------------------------------------------------
export type DefectSeverity = 'green' | 'amber' | 'red';

export const SEVERITY_LABELS: Record<DefectSeverity, string> = {
  green: 'Grün — beobachten',
  amber: 'Orange — instand setzen lassen',
  red: 'Rot — ablegereif, gesperrt',
};

export const SEVERITY_SHORT: Record<DefectSeverity, string> = {
  green: 'Grün',
  amber: 'Orange',
  red: 'Rot',
};

export type DefectStatus = 'open' | 'resolved';

export interface Defect {
  id: string;
  org_id: string;
  site_id: string;
  inspection_id: string | null;
  item_id: string;
  title: string;
  description: string | null;
  severity: DefectSeverity;
  item_blocked: boolean;
  status: DefectStatus;
  reported_by: string | null;
  reporter_name: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolver_name: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface DefectWithPhotos extends Defect {
  photo_urls: string[];
  resolution_photo_urls: string[];
}

// Rechtsgrundlage je Land — Berichtskopf, wortgleich mit der App (mobile/src/pdf/report.ts).
export const LEGAL_BASIS: Record<Org['land'], string> = {
  DE: 'Grundlage: Betriebssicherheitsverordnung (BetrSichV §§ 3, 14) i. V. m. TRBS 1201/1203 und DGUV Regel 109-017 — Lastaufnahme- und Anschlagmittel mindestens alle 12 Monate durch eine befähigte Person prüfen und das Ergebnis aufzeichnen; Rundstahlketten zusätzlich mindestens alle 3 Jahre auf Rissfreiheit prüfen. Zurrmittel: Arbeitsmittel nach BetrSichV, Prüfung durch eine befähigte Person (Praxis: jährlich, VDI 2700 Blatt 3.1). Ablegekriterien u. a. nach DGUV Information 209-013 und Herstellerangaben.',
  AT: 'Grundlage: ArbeitnehmerInnenschutzgesetz (ASchG) i. V. m. Arbeitsmittelverordnung (AM-VO) § 8 Abs. 1 Z 13 — Lastaufnahmeeinrichtungen und Anschlagmittel mindestens einmal im Kalenderjahr, längstens im Abstand von 15 Monaten wiederkehrend prüfen; Prüfbefund nach § 11 AM-VO. Zurrmittel nach Herstellerangaben und Stand der Technik (Empfehlung: jährlich). Ablegekriterien nach Herstellerangaben.',
  CH: 'Grundlage: Verordnung über die Unfallverhütung (VUV) — Instandhaltungs- und Prüfpflichten für Arbeitsmittel — i. V. m. Herstellerangaben (periodische Prüfung von Anschlagmitteln, üblich jährlich).',
};
