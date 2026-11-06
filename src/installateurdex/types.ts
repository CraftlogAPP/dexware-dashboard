// Domain-Typen des InstallateurDex-Supabase-Schemas (Spiegel von InstallateurDex/mobile/src/types.ts
// und lib/due.ts, aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.
//
// Begriffe (DB ↔ Portal):
//   site        = Objekt (Haus/Wohnung/Betrieb eines Kunden, mit Kundendaten)
//   asset       = Anlage (Wärmepumpe, Klimagerät, Therme, Speicher …) mit QR-Anlagenpass
//   inspection  = Einsatz (Wartung, Inbetriebnahme, Störung, Arbeitsbericht …) — append-only
//   defect      = Mangel / Empfehlung aus einem Einsatz
//   service_request = Anfrage vom Anlagenpass (Wartung anfragen / Störung melden)
// Fachliche Werte (Intervalle, Messbereiche, Checklisten) MÜSSEN mit der App übereinstimmen.

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Betrieb (org) — Spalten aus schema.sql, diktat.sql, anlagenpass.sql, anfragen.sql
// ---------------------------------------------------------------------------
export interface InstOrg extends Org {
  plan?: 'free' | 'pro' | null;
  /** Pro gilt bis hier (Ablauf aus RevenueCat + Puffer); null = unbefristet (Suite, Sonderlizenz). tarif-abgleich.sql */
  plan_until?: string | null;
  /** Plätze für Monteure laut Abo (ohne Inhaber) — setzt nur der Server (sync_seat_limit). */
  seat_limit?: number | null;
  is_pro?: boolean | null;
  logo_url?: string | null;
  brand_color?: string | null;
  public_phone?: string | null;
  public_email?: string | null;
  website?: string | null;
  /** Preis je Wartung in € je Anlagentyp, z. B. {"hp_air": 220} */
  maintenance_prices?: Record<string, number> | null;
  reminder_mail?: boolean | null;
  reminder_days?: number | null;
}

/** Wie die App (diktat.sql → dictation_allowance): Pro nur bis plan_until — abgelaufen = Gratis. */
export function isProOrg(org: InstOrg): boolean {
  if (org.is_pro === true) return true;
  if (org.plan !== 'pro') return false;
  return !org.plan_until || new Date(org.plan_until).getTime() > Date.now();
}

/** Preis je Wartung für einen Anlagentyp; undefined = kein Preis hinterlegt. */
export function priceFor(org: InstOrg, kind: string): number | undefined {
  const v = org.maintenance_prices?.[kind];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1234 → „1.234 €" (ganze Euro; Cent nur wenn vorhanden). */
export function fmtEur(n: number): string {
  return Number.isInteger(n) ? eur.format(n) : eur2.format(n);
}

// ---------------------------------------------------------------------------
// Einsatzarten
// ---------------------------------------------------------------------------
export type InspectionType =
  | 'service'
  | 'commissioning'
  | 'repair'
  | 'workReport'
  | 'pressureTest'
  | 'flush'
  | 'refrigerant'
  | 'photoDoc';

export interface JobTypeInfo {
  id: InspectionType;
  label: string;
  short: string;
  emoji: string;
  checklist: boolean;
  measurements: boolean;
  /** Zählt als Wartung (setzt die nächste Fälligkeit neu). */
  resetsService: boolean;
}

export const JOB_TYPES: JobTypeInfo[] = [
  { id: 'service', label: 'Wartung', short: 'Wartung', emoji: '🔧', checklist: true, measurements: true, resetsService: true },
  { id: 'commissioning', label: 'Inbetriebnahme & Übergabe', short: 'Inbetriebnahme', emoji: '🚀', checklist: true, measurements: true, resetsService: true },
  { id: 'repair', label: 'Störung / Reparatur', short: 'Störung', emoji: '🚨', checklist: false, measurements: true, resetsService: false },
  { id: 'workReport', label: 'Arbeitsbericht', short: 'Arbeitsbericht', emoji: '📝', checklist: false, measurements: false, resetsService: false },
  { id: 'pressureTest', label: 'Druck- / Dichtheitsprobe', short: 'Druckprobe', emoji: '⏱️', checklist: false, measurements: true, resetsService: false },
  { id: 'flush', label: 'Spülen & Befüllen', short: 'Spülen', emoji: '💧', checklist: false, measurements: true, resetsService: false },
  { id: 'refrigerant', label: 'Kältemittel-Eintrag', short: 'Kältemittel', emoji: '❄️', checklist: false, measurements: true, resetsService: false },
  { id: 'photoDoc', label: 'Fotodoku (vor dem Zumauern)', short: 'Fotodoku', emoji: '📸', checklist: false, measurements: false, resetsService: false },
];

const JOB_MAP: Record<string, JobTypeInfo> = Object.fromEntries(JOB_TYPES.map((j) => [j.id, j]));

export function jobInfo(type: string | undefined | null): JobTypeInfo {
  return JOB_MAP[type ?? ''] ?? JOB_MAP.workReport;
}

/** Einsatzarten, die die Wartung zurücksetzen (wie asset_next_due in anfragen.sql). */
export const SERVICE_TYPES: InspectionType[] = JOB_TYPES.filter((j) => j.resetsService).map((j) => j.id);

// ---------------------------------------------------------------------------
// Anlagentypen
// ---------------------------------------------------------------------------
export type ItemKind =
  | 'hp_air'
  | 'hp_brine'
  | 'ac_split'
  | 'ac_multi'
  | 'gas'
  | 'oil'
  | 'pellet'
  | 'district'
  | 'dhw_tank'
  | 'solar'
  | 'ventilation'
  | 'softener'
  | 'filter'
  | 'booster'
  | 'lifting'
  | 'other';

export interface KindInfo {
  id: ItemKind;
  label: string;
  emoji: string;
  refrigerant: boolean;
  /** Übliches Wartungsintervall in Monaten (Vorschlag, je Anlage änderbar). */
  intervalMonths: number;
  /** Messwert-Felder bei Wartung/Inbetriebnahme/Störung. */
  measures: string[];
}

export const ITEM_KINDS: KindInfo[] = [
  { id: 'hp_air', label: 'Luft/Wasser-Wärmepumpe', emoji: '🌬️', refrigerant: true, intervalMonths: 12, measures: ['pressure', 'flow', 'return', 'dhw', 'outdoor', 'hp', 'lp'] },
  { id: 'hp_brine', label: 'Sole/Wasser-Wärmepumpe', emoji: '🌍', refrigerant: true, intervalMonths: 12, measures: ['pressure', 'flow', 'return', 'dhw', 'brineIn', 'brineOut', 'brinePressure'] },
  { id: 'ac_split', label: 'Split-Klimagerät', emoji: '❄️', refrigerant: true, intervalMonths: 12, measures: ['supplyAir', 'roomAir', 'outdoor', 'hp', 'lp'] },
  { id: 'ac_multi', label: 'Multisplit / VRF', emoji: '🧊', refrigerant: true, intervalMonths: 12, measures: ['supplyAir', 'roomAir', 'outdoor', 'hp', 'lp'] },
  { id: 'gas', label: 'Gas-Brennwert', emoji: '🔥', refrigerant: false, intervalMonths: 12, measures: ['pressure', 'flow', 'return', 'gasPressure', 'co2', 'co', 'fluegas', 'loss'] },
  { id: 'oil', label: 'Öl-Heizung', emoji: '🛢️', refrigerant: false, intervalMonths: 12, measures: ['pressure', 'flow', 'return', 'co2', 'co', 'fluegas', 'loss', 'soot'] },
  { id: 'pellet', label: 'Pellets / Holz', emoji: '🪵', refrigerant: false, intervalMonths: 12, measures: ['pressure', 'flow', 'return', 'co', 'fluegas'] },
  { id: 'district', label: 'Fernwärme-Station', emoji: '🏙️', refrigerant: false, intervalMonths: 12, measures: ['pressure', 'flow', 'return', 'dhw'] },
  { id: 'dhw_tank', label: 'Warmwasserspeicher', emoji: '🚿', refrigerant: false, intervalMonths: 24, measures: ['dhw'] },
  { id: 'solar', label: 'Solarthermie', emoji: '☀️', refrigerant: false, intervalMonths: 24, measures: ['solarPressure', 'frost', 'ph'] },
  { id: 'ventilation', label: 'Wohnraumlüftung', emoji: '💨', refrigerant: false, intervalMonths: 12, measures: ['airflow'] },
  { id: 'softener', label: 'Enthärtung', emoji: '🧂', refrigerant: false, intervalMonths: 12, measures: ['hardnessIn', 'hardnessOut'] },
  { id: 'filter', label: 'Rückspülfilter', emoji: '🚰', refrigerant: false, intervalMonths: 6, measures: [] },
  { id: 'booster', label: 'Druckerhöhung', emoji: '⬆️', refrigerant: false, intervalMonths: 12, measures: ['pressure'] },
  { id: 'lifting', label: 'Hebeanlage', emoji: '🪣', refrigerant: false, intervalMonths: 12, measures: [] },
  { id: 'other', label: 'Sonstige Anlage', emoji: '🛠️', refrigerant: false, intervalMonths: 12, measures: [] },
];

const KIND_MAP: Record<string, KindInfo> = Object.fromEntries(ITEM_KINDS.map((k) => [k.id, k]));

/** Kurzzeichen für die automatische Nummer (z. B. „WP-001") — wie prefix in mobile/src/types.ts. */
const KIND_PREFIX: Record<ItemKind, string> = {
  hp_air: 'WP',
  hp_brine: 'WP',
  ac_split: 'KL',
  ac_multi: 'KL',
  gas: 'GT',
  oil: 'OEL',
  pellet: 'PE',
  district: 'FW',
  dhw_tank: 'SP',
  solar: 'SO',
  ventilation: 'LU',
  softener: 'EH',
  filter: 'FI',
  booster: 'DE',
  lifting: 'HA',
  other: 'AN',
};

export function kindPrefix(kind: string): string {
  return KIND_PREFIX[kindInfo(kind).id];
}

/** Typ-Info; unbekannte Werte → „Sonstige Anlage". */
export function kindInfo(kind: string | undefined | null): KindInfo {
  return KIND_MAP[kind ?? ''] ?? KIND_MAP.other;
}

// ---------------------------------------------------------------------------
// Messwerte (Bereiche = Hinweis, kein Urteil — wie die App)
// ---------------------------------------------------------------------------
export interface MeasureField {
  id: string;
  label: string;
  unit: string;
  min?: number;
  max?: number;
  text?: boolean;
}

const M: Record<string, MeasureField> = {
  pressure: { id: 'pressure', label: 'Anlagendruck', unit: 'bar', min: 0.8, max: 3 },
  flow: { id: 'flow', label: 'Vorlauftemperatur', unit: '°C', min: 20, max: 90 },
  return: { id: 'return', label: 'Rücklauftemperatur', unit: '°C', min: 15, max: 80 },
  dhw: { id: 'dhw', label: 'Warmwassertemperatur', unit: '°C', min: 40, max: 70 },
  outdoor: { id: 'outdoor', label: 'Außentemperatur', unit: '°C', min: -30, max: 45 },
  hp: { id: 'hp', label: 'Hochdruck Kältekreis', unit: 'bar' },
  lp: { id: 'lp', label: 'Niederdruck Kältekreis', unit: 'bar' },
  brineIn: { id: 'brineIn', label: 'Sole Eintritt', unit: '°C', min: -10, max: 25 },
  brineOut: { id: 'brineOut', label: 'Sole Austritt', unit: '°C', min: -15, max: 20 },
  brinePressure: { id: 'brinePressure', label: 'Soledruck', unit: 'bar', min: 0.5, max: 3 },
  supplyAir: { id: 'supplyAir', label: 'Ausblastemperatur', unit: '°C' },
  roomAir: { id: 'roomAir', label: 'Raumtemperatur', unit: '°C', min: 10, max: 35 },
  gasPressure: { id: 'gasPressure', label: 'Gas-Fließdruck', unit: 'mbar', min: 15, max: 30 },
  co2: { id: 'co2', label: 'CO₂ im Abgas', unit: '%', min: 7, max: 11 },
  co: { id: 'co', label: 'CO im Abgas', unit: 'ppm', min: 0, max: 200 },
  fluegas: { id: 'fluegas', label: 'Abgastemperatur', unit: '°C' },
  loss: { id: 'loss', label: 'Abgasverlust', unit: '%', min: 0, max: 11 },
  soot: { id: 'soot', label: 'Rußzahl', unit: '', min: 0, max: 1 },
  solarPressure: { id: 'solarPressure', label: 'Anlagendruck Solar', unit: 'bar', min: 1, max: 6 },
  frost: { id: 'frost', label: 'Frostschutz bis', unit: '°C', min: -40, max: -15 },
  ph: { id: 'ph', label: 'pH-Wert', unit: '', min: 6.5, max: 10 },
  airflow: { id: 'airflow', label: 'Luftmenge', unit: 'm³/h' },
  hardnessIn: { id: 'hardnessIn', label: 'Härte Eingang', unit: '°dH' },
  hardnessOut: { id: 'hardnessOut', label: 'Härte Ausgang', unit: '°dH' },
  medium: { id: 'medium', label: 'Prüfmedium', unit: '', text: true },
  testPressure: { id: 'testPressure', label: 'Prüfdruck', unit: 'bar' },
  startPressure: { id: 'startPressure', label: 'Druck zu Beginn', unit: 'bar' },
  endPressure: { id: 'endPressure', label: 'Druck am Ende', unit: 'bar' },
  testMinutes: { id: 'testMinutes', label: 'Prüfdauer', unit: 'min' },
  flushMinutes: { id: 'flushMinutes', label: 'Spüldauer', unit: 'min' },
  fillVolume: { id: 'fillVolume', label: 'Füllmenge Anlage', unit: 'l' },
  conductivity: { id: 'conductivity', label: 'Leitfähigkeit', unit: 'µS/cm' },
  hardness: { id: 'hardness', label: 'Gesamthärte', unit: '°dH' },
  leakResult: { id: 'leakResult', label: 'Dichtheitskontrolle', unit: '', text: true },
  leakMethod: { id: 'leakMethod', label: 'Prüfverfahren', unit: '', text: true },
  rfAdded: { id: 'rfAdded', label: 'Kältemittel eingefüllt', unit: 'kg' },
  rfRecovered: { id: 'rfRecovered', label: 'Kältemittel zurückgewonnen', unit: 'kg' },
  errorCode: { id: 'errorCode', label: 'Fehlercode', unit: '', text: true },
};

const JOB_MEASURES: Partial<Record<InspectionType, string[]>> = {
  pressureTest: ['medium', 'testPressure', 'startPressure', 'endPressure', 'testMinutes'],
  flush: ['flushMinutes', 'fillVolume', 'pressure', 'conductivity', 'ph', 'hardness'],
  refrigerant: ['leakResult', 'leakMethod', 'rfAdded', 'rfRecovered', 'hp', 'lp'],
};

export function measuresFor(type: InspectionType, kind: string | undefined | null): MeasureField[] {
  if (!jobInfo(type).measurements) return [];
  const ids = JOB_MEASURES[type] ?? (type === 'repair' ? ['errorCode', ...kindInfo(kind).measures] : kindInfo(kind).measures);
  return ids.map((id) => M[id]).filter(Boolean);
}

/** Eigene Messwerte des Betriebs (App: Einstellungen → Prüfpunkte & Messwerte) stehen als „m:<Bezeichnung>|<Einheit>“ im Einsatz. */
export function measureField(id: string): MeasureField | undefined {
  if (id.startsWith('m:')) {
    const [label, unit] = id.slice(2).split('|');
    return { id, label, unit: unit ?? '', text: !unit };
  }
  return M[id];
}

function parseNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export function measureOutOfRange(id: string, v: string | undefined | null): boolean {
  const f = M[id];
  if (!f || f.text) return false;
  const n = parseNum(v);
  if (n === undefined) return false;
  return (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max);
}

export interface MeasureRow {
  id: string;
  label: string;
  value: string;
  unit: string;
  odd: boolean;
}

/** Ausgefüllte Messwerte in App-Reihenfolge (bekannte Felder zuerst, dann unbekannte Schlüssel). */
export function measureRows(type: InspectionType, kind: string | null | undefined, m: Record<string, string> | null | undefined): MeasureRow[] {
  const v = m ?? {};
  const fields = measuresFor(type, kind);
  const known = new Set(fields.map((f) => f.id));
  return [...fields.map((f) => f.id), ...Object.keys(v).filter((id) => !known.has(id))]
    .filter((id) => typeof v[id] === 'string' && v[id].trim() !== '')
    .map((id) => {
      const f = measureField(id);
      return { id, label: f?.label ?? id, value: v[id], unit: f?.unit ?? '', odd: measureOutOfRange(id, v[id]) };
    });
}

/** Kurzurteil: Druckprobe (Druckabfall) bzw. auffällige Messwerte. undefined = nichts gemessen. */
export function measureResult(
  kind: string | null | undefined,
  m: Record<string, string> | null | undefined,
  type: InspectionType = 'service',
): { red: boolean; text: string } | undefined {
  const v = m ?? {};
  if (type === 'pressureTest') {
    const a = parseNum(v.startPressure);
    const b = parseNum(v.endPressure);
    if (a === undefined || b === undefined) return undefined;
    const drop = Math.round((a - b) * 100) / 100;
    const mins = parseNum(v.testMinutes);
    const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
    const text = `Druckabfall ${fmt(Math.max(0, drop))} bar${mins ? ` in ${fmt(mins)} min` : ''}`;
    return { red: drop > 0, text: drop > 0 ? `${text} — bitte bewerten` : `${text} — kein Druckabfall` };
  }
  const fields = measuresFor(type, kind);
  if (!fields.some((f) => (v[f.id] ?? '').trim() !== '')) return undefined;
  const odd = fields.filter((f) => measureOutOfRange(f.id, v[f.id]));
  return {
    red: odd.length > 0,
    text: odd.length ? `Außerhalb des üblichen Bereichs: ${odd.map((f) => f.label).join(', ')}` : 'Messwerte im üblichen Bereich',
  };
}

// ---------------------------------------------------------------------------
// Kältemittel (GWP nach EU 2024/573 — gleiche Werte wie die App)
// ---------------------------------------------------------------------------
// fgas = fällt unter die F-Gas-VO; annex2Share = Anteil nach Anhang II Gruppe 1 (R-1234yf) im Gemisch
const REFRIGERANTS: { id: string; gwp: number; fgas: boolean; annex2Share?: number }[] = [
  { id: 'R32', gwp: 675, fgas: true },
  { id: 'R410A', gwp: 2088, fgas: true },
  { id: 'R454B', gwp: 466, fgas: true, annex2Share: 0.311 }, // R-32 68,9 % / R-1234yf 31,1 %
  { id: 'R407C', gwp: 1774, fgas: true },
  { id: 'R134a', gwp: 1430, fgas: true },
  { id: 'R513A', gwp: 631, fgas: true, annex2Share: 0.56 }, // R-134a 44 % / R-1234yf 56 %
  { id: 'R290', gwp: 3, fgas: false },
  { id: 'R744', gwp: 1, fgas: false },
  { id: 'R1234yf', gwp: 1, fgas: true, annex2Share: 1 },
];

function refrigerantInfo(id?: string | null) {
  const t = (id ?? '').toUpperCase().replace(/\s/g, '');
  return REFRIGERANTS.find((x) => x.id.toUpperCase() === t);
}

/** CO₂-Äquivalent in Tonnen (Füllmenge kg × GWP / 1000), undefined wenn unbekannt. */
export function co2eTons(refrigerant?: string | null, kg?: string | null): number | undefined {
  const r = refrigerantInfo(refrigerant);
  const k = parseNum(kg);
  if (!r || k === undefined || k <= 0) return undefined;
  return Math.round(((k * r.gwp) / 1000) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Pflicht-Dichtheitskontrolle nach Art. 5 VO (EU) 2024/573 — 1:1 wie mobile/src/lib/fgas.ts und
// fgas_leak_months in supabase/fgas.sql (Quellen + Herleitung dort). Richtwert für Erinnerungen,
// maßgeblich ist die Verordnung; die Pflicht trifft den Betreiber.
//   Anhang I (t CO₂e):     ab 5 t (hermetisch ab 10 t): < 50 t → 12 Monate, < 500 t → 6, sonst 3
//   Anhang II Gr. 1 (kg):  ab 1 kg (hermetisch ab 2 kg): < 10 kg → 12, < 100 kg → 6, sonst 3
//   Leckage-Erkennungssystem: doppelt so lang. Gemische: beide Teile, kürzeres Intervall gilt.
// ---------------------------------------------------------------------------
export interface LeakDuty {
  months: number;
  /** „alle 12 Monate (6,68 t CO₂e)" */
  short: string;
  /** „6,68 t CO₂e" bzw. „1,03 kg Anhang-II-Anteil (R-1234yf)" */
  basis: string;
  reason: string;
}

export interface LeakNoDuty {
  months: null;
  reason: string;
}

type FgasAsset = Pick<Asset, 'refrigerant' | 'refrigerant_kg' | 'fgas_hermetic' | 'fgas_leak_detection'>;

const deNum = (n: number, d = 2) => n.toLocaleString('de-DE', { maximumFractionDigits: d });

/** Intervall (Monate) oder Begründung, warum keine Pflicht besteht; null = keine Angaben (Kältemittel/Füllmenge). */
export function leakCheckDuty(a: FgasAsset): LeakDuty | LeakNoDuty | null {
  const rf = refrigerantInfo(a.refrigerant);
  const kg = parseNum(a.refrigerant_kg);
  if (!rf || kg === undefined || kg <= 0) return null;
  if (!rf.fgas) return { months: null, reason: `${rf.id} ist kein F-Gas — keine Dichtheitskontrolle nach F-Gas-Verordnung.` };

  const hermetic = !!a.fgas_hermetic;
  const les = !!a.fgas_leak_detection;
  const share2 = rf.annex2Share ?? 0;
  // Ungerundet vergleichen — 7,40 kg R-32 = 4,995 t liegt UNTER 5 t (gerundet wären es 5,00).
  const t = (kg * rf.gwp) / 1000;
  const kg2 = kg * share2;

  const t1 = hermetic ? 10 : 5;
  const k1 = hermetic ? 2 : 1;
  let m1: number | null = null;
  let m2: number | null = null;
  if (t >= t1 && share2 < 1) m1 = t >= 500 ? 3 : t >= 50 ? 6 : 12;
  if (share2 > 0 && kg2 >= k1) m2 = kg2 >= 100 ? 3 : kg2 >= 10 ? 6 : 12;

  // Knapp unter der Schwelle eine Stelle mehr zeigen, sonst stünde da „5 t … unter 5 t".
  const show = (v: number, limit: number) => (v < limit && Math.round(v * 100) / 100 >= limit ? deNum(v, 3) : deNum(v));
  const parts: string[] = [];
  if (share2 < 1) parts.push(`${show(t, t1)} t CO₂e`);
  if (share2 > 0) parts.push(`${show(kg2, k1)} kg ${share2 < 1 ? 'Anhang-II-Anteil (R-1234yf)' : 'F-Gas nach Anhang II'}`);
  const basis = parts.join(' · ');

  if (m1 === null && m2 === null) {
    const limit = share2 >= 1 ? `${k1} kg` : share2 > 0 ? `${t1} t CO₂e bzw. ${k1} kg Anhang II` : `${t1} t CO₂e`;
    return {
      months: null,
      reason: `Keine Pflicht-Dichtheitskontrolle nach Art. 5 F-Gas-VO: ${basis}, unter ${limit}${hermetic ? ' (hermetisch geschlossen)' : ''}.`,
    };
  }
  const base = Math.min(m1 ?? 99, m2 ?? 99);
  const months = les ? base * 2 : base;
  return {
    months,
    basis,
    short: `alle ${months} Monate (${basis})`,
    reason:
      `Pflicht-Dichtheitskontrolle nach Art. 5 F-Gas-VO alle ${months} Monate: ${basis}` +
      `${hermetic ? ', hermetisch geschlossen' : ''}${les ? ', mit Leckage-Erkennungssystem (Intervall verdoppelt)' : ''}.` +
      ' Pflicht des Betreibers — Richtwert, maßgeblich ist die Verordnung.',
  };
}

/** Zählt der Einsatz als Dichtheitskontrolle? (Ergebnis „dicht/undicht" eingetragen, nicht storniert) */
export function isLeakCheck(j: Pick<Job, 'canceled' | 'measurements'>): boolean {
  return !j.canceled && !!String(j.measurements?.leakResult ?? '').trim();
}

/** Ergebnis „undicht" (auch „nicht dicht", „Leck …") → nach der Reparatur ist eine Nachkontrolle fällig. */
export function isLeakFound(result: unknown): boolean {
  return /undicht|nicht\s*dicht|leck/i.test(String(result ?? ''));
}

export interface LeakInfo {
  /** Zeitpunkt der letzten dokumentierten Kontrolle */
  at: string;
  /** letzte Kontrolle ergab „undicht" → Nachkontrolle */
  open: boolean;
}

/** Letzte dokumentierte Dichtheitskontrolle je Anlage mit Ergebnis — wie leakInfoByItem in der App. */
export function leakInfoFromJobs(jobs: Pick<Job, 'item_id' | 'started_at' | 'canceled' | 'measurements'>[]): Map<string, LeakInfo> {
  const map = new Map<string, LeakInfo>();
  for (const j of jobs) {
    if (!isLeakCheck(j)) continue;
    const prev = map.get(j.item_id);
    if (!prev || j.started_at > prev.at) map.set(j.item_id, { at: j.started_at, open: isLeakFound(j.measurements?.leakResult) });
  }
  return map;
}

export type LeakDueInfo = DueInfo & { duty: LeakDuty; followUp: boolean };

/**
 * Nächste Dichtheitskontrolle: letzte Kontrolle bzw. Inbetriebnahme + Intervall. null = keine Pflicht.
 * Ergab die letzte Kontrolle „undicht", erinnert das Portal wie die App nach einem Monat an die Nachkontrolle
 * (die Reparatur selbst ist nicht erfasst; Frist im Verordnungstext prüfen). Ein reines Datum = Ergebnis „dicht".
 */
export function leakDue(a: FgasAsset & Pick<Asset, 'install_date'>, last?: string | LeakInfo): LeakDueInfo | null {
  const duty = leakCheckDuty(a);
  if (!duty || duty.months === null) return null;
  const info = typeof last === 'string' ? { at: last, open: false } : last;
  const followUp = !!info?.open;
  const from = info ? new Date(info.at) : a.install_date ? parseDay(a.install_date) : null;
  if (!from || Number.isNaN(from.getTime())) return { state: 'never', dueAt: null, daysLeft: null, duty, followUp };
  const dueAt = addMonths(from, followUp ? 1 : duty.months);
  const daysLeft = calendarDaysUntil(dueAt);
  return { state: daysLeft <= 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'soon' : 'ok', dueAt, daysLeft, duty, followUp };
}

/** Eine Zeile wie in der App (Radar/Objekt). */
export function leakDueLabel(d: DueInfo & { followUp?: boolean }): string {
  if (d.state === 'never' || !d.dueAt) return 'Dichtheitskontrolle (F-Gas): noch keine dokumentiert';
  const when = fmtDay(d.dueAt);
  if (d.followUp) return `Nachkontrolle Dichtheit (zuletzt „undicht“) ${d.state === 'overdue' ? `überfällig seit ${when}` : `bis ${when}`}`;
  if (d.state === 'overdue') {
    return Math.abs(d.daysLeft ?? 0) === 0 ? 'Dichtheitskontrolle (F-Gas) heute fällig' : `Dichtheitskontrolle (F-Gas) überfällig seit ${when}`;
  }
  if (d.state === 'soon') return `Dichtheitskontrolle (F-Gas) fällig am ${when}`;
  return `Dichtheitskontrolle (F-Gas) bis ${when}`;
}

// ---------------------------------------------------------------------------
// Checklisten (nur Beschriftungen — die Reihenfolge je Typ wie in der App)
// ---------------------------------------------------------------------------
export type CheckResult = 'ok' | 'defect' | 'na';

const C: Record<string, string> = {
  visual: 'Sichtprüfung Anlage',
  errors: 'Fehlerspeicher ausgelesen',
  settings: 'Einstellungen geprüft',
  expansion: 'Ausdehnungsgefäß',
  safety: 'Sicherheitsventil',
  strainer: 'Schmutzfänger / Filter',
  hydraulic: 'Hydraulik dicht',
  electric: 'Elektrische Anschlüsse',
  function: 'Funktionsprüfung',
  evaporator: 'Verdampfer / Lamellen',
  condensate: 'Kondensatablauf',
  fan: 'Ventilator & Geräusche',
  circuit: 'Kältekreis Sichtprüfung',
  indoorFilter: 'Filter Innengerät',
  coilClean: 'Wärmetauscher gereinigt & desinfiziert',
  condenserClean: 'Verflüssiger Außengerät',
  lines: 'Leitungen & Isolierung',
  brine: 'Solekreis',
  burner: 'Brenner & Wärmetauscher',
  siphon: 'Siphon',
  ignition: 'Zündung & Flammüberwachung',
  flue: 'Abgasweg',
  gasTight: 'Gasdichtheit',
  fluegasMeasure: 'Abgasmessung',
  ash: 'Asche & Brennraum',
  anode: 'Schutzanode',
  descale: 'Entkalkung',
  legionella: 'Legionellenschaltung',
  salt: 'Regeneriersalz',
  resin: 'Steuerung & Regeneration',
  backwash: 'Rückspülung',
  pump: 'Pumpe',
  alarm: 'Alarm & Rückstausicherung',
  ventFilter: 'Filter Lüftungsgerät',
  ventDucts: 'Ventile & Kanäle',
  collector: 'Kollektorfeld',
  plan: 'Installation nach Hydraulikplan',
  flushed: 'Gespült, befüllt, entlüftet',
  params: 'Parameter eingestellt',
  instructed: 'Kunde eingewiesen',
  docsHanded: 'Unterlagen übergeben',
  warranty: 'Herstellerformular erledigt',
  utility: 'Netzbetreiber / Förderung',
};

/** Eigene Prüfpunkte des Betriebs (App: Einstellungen → Eigene Prüfpunkte) stehen als „c:<Text>“ im Einsatz. */
export function checkLabel(id: string): string {
  if (id.startsWith('c:')) return id.slice(2);
  return C[id] ?? id;
}

/** „Alle 12 Punkte in Ordnung" bzw. „Mangel bei: Ausdehnungsgefäß, …"; '' ohne Checkliste. */
export function checklistSummary(checklist: Record<string, CheckResult> | null | undefined): string {
  const list = checklist ?? {};
  const ids = Object.keys(list);
  if (!ids.length) return '';
  const defects = ids.filter((id) => list[id] === 'defect').map(checkLabel);
  if (defects.length) return `Mangel bei: ${defects.join(', ')}`;
  const ok = ids.filter((id) => list[id] === 'ok').length;
  return `Checkliste in Ordnung (${ok}× OK${ids.length > ok ? `, ${ids.length - ok}× entfällt` : ''})`;
}

// ---------------------------------------------------------------------------
// Datensätze
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
  is_demo: boolean;
  created_at: string;
  customer_email?: string | null;
  reminder_opt_in?: boolean | null;
  // Double-Opt-in (App-Repo supabase/erinnerung-bestaetigung.sql) — zählt nur für die aktuell eingetragene Adresse
  reminder_confirmed_email?: string | null;
  reminder_confirmed_at?: string | null;
  reminder_confirm_sent_email?: string | null;
  reminder_confirm_sent_at?: string | null;
  reminder_unsub_email?: string | null;
}

export type ReminderState = 'confirmed' | 'pending' | 'queued' | 'unsubscribed' | 'none';

/**
 * Stand der Erinnerungsmail wie in der App (SiteDetailScreen): bestätigt · wartet auf Bestätigung · Bestätigungs-Mail folgt
 * (nächster täglicher Lauf) · abbestellt · keine Zustimmung. Ohne die Double-Opt-in-Spalten (ältere Datenbank) gilt das Häkchen.
 */
export function reminderState(s: Site): ReminderState {
  const em = (s.customer_email ?? '').trim().toLowerCase();
  if (!em) return 'none';
  if (s.reminder_unsub_email === em && s.reminder_confirmed_email !== em) return 'unsubscribed';
  if (!s.reminder_opt_in) return 'none';
  if (s.reminder_confirmed_email === undefined) return 'confirmed';
  if (s.reminder_confirmed_email === em) return 'confirmed';
  return s.reminder_confirm_sent_email === em ? 'pending' : 'queued';
}

export interface Asset {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
  kind: ItemKind;
  manufacturer: string | null;
  model: string | null;
  serial_no: string | null;
  build_year: string | null;
  install_date: string | null;
  power_kw: string | null;
  refrigerant: string | null;
  refrigerant_kg: string | null;
  interval_months: number | null;
  /** Wartungsvertrag mit dem Kunden (anlagenpass.sql) */
  contract: boolean;
  /** Preis je Wartung laut Vertrag (€); null = Preis des Anlagentyps */
  contract_price: number | null;
  /** Garantie-Ende (yyyy-mm-dd, anlagenpass.sql) */
  warranty_until: string | null;
  /** Garantie-Bedingung, z. B. „nur mit jährlicher Wartung durch Fachbetrieb" */
  warranty_note: string | null;
  /** Fernbetreuung über ein Hersteller-Portal (nur Anzeige) */
  remote_service: RemoteService | null;
  /** hermetisch geschlossen und gekennzeichnet (höhere Schwelle, F-Gas-VO Art. 5) — fgas.sql */
  fgas_hermetic?: boolean | null;
  /** Leckage-Erkennungssystem vorhanden (Dichtheitskontrolle halb so oft) — fgas.sql */
  fgas_leak_detection?: boolean | null;
  location: string | null;
  qr_token: string | null;
  notes: string | null;
  retired: boolean;
  retired_at: string | null;
  retire_reason: string | null;
  is_demo: boolean;
  created_at: string;
}

/**
 * Preis je Wartung einer Anlage — gleiche Regel wie computePotential/contractStats in
 * mobile/src/lib/potential.ts: bei Vertragsanlagen mit eingetragenem Vertragspreis zählt der, sonst der
 * Preis des Anlagentyps. 0 oder leer = kein Preis (zählt nicht mit).
 */
export function assetPrice(org: InstOrg, a: Pick<Asset, 'kind' | 'contract' | 'contract_price'>): number | undefined {
  const raw = a.contract && a.contract_price != null ? Number(a.contract_price) : priceFor(org, a.kind);
  return raw !== undefined && Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/** true, wenn der Preis aus dem Wartungsvertrag kommt (für „laut Vertrag"-Hinweise). */
export function hasContractPrice(a: Pick<Asset, 'contract' | 'contract_price'>): boolean {
  return a.contract && a.contract_price != null;
}

export interface MaterialLine {
  name: string;
  qty: string;
  unit?: string;
}

/** Einsatz OHNE Foto-/Unterschrift-Spalten (Base64) — für Listen und Zeitstrahl. */
export interface Job {
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
  measurements: Record<string, string>;
  work_done: string | null;
  materials: MaterialLine[];
  work_minutes: number | null;
  recommendations: string | null;
  /** „Folgeeinsatz nötig“ (App): was beim nächsten Einsatz noch zu tun ist — offen bis zum nächsten Einsatz an der Anlage */
  follow_up?: string | null;
  notes: string | null;
  inspector_name: string | null;
  customer_signer_name: string | null;
  canceled: boolean;
  cancel_reason: string | null;
  canceled_at: string | null;
  created_at: string;
}

/** Einsatz inkl. Fotos + Unterschriften — nur für den Druck der Akte. */
export interface JobWithPhotos extends Job {
  photo_urls: string[];
  signature: string | null;
  customer_signature: string | null;
  // GPS-Nachweis (gps-pruefnachweis.sql) — per withGpsProof ergänzt, fehlt bei älteren Datenbanken
  gps_at?: string | null;
  gps_mocked?: boolean | null;
  end_lat?: number | null;
  end_lng?: number | null;
  end_accuracy_m?: number | null;
  end_gps_at?: string | null;
  end_mocked?: boolean | null;
  distance_m?: number | null;
  end_distance_m?: number | null;
  received_at?: string | null;
  entry_hash?: string | null;
}

/** Offener „Folgeeinsatz nötig“ (App): jüngster gültiger Einsatz der Anlage trägt follow_up. */
export interface OpenFollowUp {
  inspection_id: string;
  site_id: string;
  item_id: string;
  started_at: string;
  follow_up: string;
  inspector_name: string | null;
}

/** Wie mobile/src/lib/followUp.ts bzw. portal_open_follow_ups(): je Anlage der jüngste nicht stornierte Einsatz. */
export function openFollowUpsFromJobs(
  jobs: { id: string; site_id: string; item_id: string; started_at: string; created_at?: string; canceled: boolean; follow_up?: string | null; inspector_name: string | null }[],
): OpenFollowUp[] {
  const latest = new Map<string, (typeof jobs)[number]>();
  for (const j of jobs) {
    if (j.canceled) continue;
    const cur = latest.get(j.item_id);
    if (!cur || j.started_at > cur.started_at || (j.started_at === cur.started_at && (j.created_at ?? '') > (cur.created_at ?? ''))) latest.set(j.item_id, j);
  }
  return [...latest.values()]
    .filter((j) => !!j.follow_up?.trim())
    .map((j) => ({ inspection_id: j.id, site_id: j.site_id, item_id: j.item_id, started_at: j.started_at, follow_up: j.follow_up!.trim(), inspector_name: j.inspector_name }))
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
}

/** Schmale Einsatz-Daten für Kennzahlen (diese Woche). */
export interface JobMeta {
  id: string;
  site_id: string;
  item_id: string;
  type: InspectionType;
  started_at: string;
  inspector_name: string | null;
}

export type DefectSeverity = 'green' | 'amber' | 'red';
export type DefectStatus = 'open' | 'resolved';

export const SEVERITY_LABELS: Record<DefectSeverity, string> = {
  green: 'Grün — Empfehlung',
  amber: 'Orange — bald beheben',
  red: 'Rot — Anlage außer Betrieb',
};

export const SEVERITY_SHORT: Record<DefectSeverity, string> = {
  green: 'Empfehlung',
  amber: 'bald beheben',
  red: 'außer Betrieb',
};

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
  reporter_name: string | null;
  resolved_at: string | null;
  resolver_name: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface DefectWithPhotos extends Defect {
  photo_urls: string[];
  resolution_photo_urls: string[];
}

// ---------------------------------------------------------------------------
// Anfragen vom Anlagenpass (anfragen.sql)
// ---------------------------------------------------------------------------
/** quote = „Angebot anfragen" zu einer Empfehlung (Nachricht beginnt mit „Angebot für: …") */
export type RequestKind = 'maintenance' | 'fault' | 'quote';
export type RequestStatus = 'new' | 'scheduled' | 'done' | 'dismissed';

export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  maintenance: 'Wartung angefragt',
  fault: 'Störung gemeldet',
  quote: 'Angebot angefragt',
};

/**
 * Reihenfolge in Listen (wie die App): neue Störungen → neue Angebote → neue Wartungen → Rest,
 * innerhalb gleicher Stufe neueste zuerst.
 */
export function requestRank(r: Pick<ServiceRequest, 'status' | 'kind'>): number {
  if (r.status !== 'new') return 3;
  return r.kind === 'fault' ? 0 : r.kind === 'quote' ? 1 : 2;
}

export function byRequestRank(a: ServiceRequest, b: ServiceRequest): number {
  return requestRank(a) - requestRank(b) || b.created_at.localeCompare(a.created_at);
}

// ---------------------------------------------------------------------------
// Garantie + Fernbetreuung (wie mobile/src/lib/warranty.ts und REMOTE_SERVICES in mobile/src/types.ts)
// ---------------------------------------------------------------------------
export type RemoteService = 'viguide' | 'myvaillant' | 'homecom' | 'other';

export const REMOTE_SERVICE_LABELS: Record<RemoteService, string> = {
  viguide: 'ViGuide (Viessmann)',
  myvaillant: 'myVAILLANT Pro',
  homecom: 'HomeCom Pro (Bosch/Buderus)',
  other: 'Anderes Portal',
};

export function remoteServiceLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return REMOTE_SERVICE_LABELS[v as RemoteService] ?? v;
}

export interface WarrantyInfo {
  active: boolean;
  /** Tage bis Garantie-Ende (negativ = abgelaufen); null = kein Datum */
  daysLeft: number | null;
  /** Garantie läuft noch, aber die Wartung ist überfällig */
  atRisk: boolean;
  until: Date | null;
}

/**
 * „Gefährdet" = Garantie läuft noch und die Wartung ist überfällig — viele Hersteller knüpfen die Garantie
 * an regelmäßige Wartung. Das Portal stellt nur fest, was eingetragen ist; ob die Garantie erlischt,
 * regelt der Hersteller.
 */
export function warrantyInfo(a: Pick<Asset, 'warranty_until'>, due?: DueInfo): WarrantyInfo {
  if (!a.warranty_until) return { active: false, daysLeft: null, atRisk: false, until: null };
  const d = new Date(`${a.warranty_until.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { active: false, daysLeft: null, atRisk: false, until: null };
  const daysLeft = calendarDaysUntil(d);
  const active = daysLeft >= 0;
  return { active, daysLeft, atRisk: active && due?.state === 'overdue', until: d };
}

/** „Garantie bis 12.03.2029" bzw. „Garantie abgelaufen (12.03.2024)"; null ohne Datum. */
export function warrantyLabel(w: WarrantyInfo): string | null {
  if (!w.until) return null;
  return w.active ? `Garantie bis ${fmtDay(w.until)}` : `Garantie abgelaufen (${fmtDay(w.until)})`;
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'Neu',
  scheduled: 'Geplant',
  done: 'Erledigt',
  dismissed: 'Abgelehnt',
};

export const REQUEST_STATUSES: RequestStatus[] = ['new', 'scheduled', 'done', 'dismissed'];

export interface ServiceRequest {
  id: string;
  org_id: string;
  asset_id: string | null;
  site_id: string | null;
  kind: RequestKind;
  message: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  preferred: string | null;
  source: 'pass' | 'reminder';
  status: RequestStatus;
  note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  /**
   * Foto vom Kunden (Edge Function pass-photo). In der DB 'storage:<org>/request/<id>.jpg' im privaten
   * Bucket photos — die Datenquelle ersetzt das durch eine signierte URL (null, wenn nicht abrufbar).
   */
  photo_url?: string | null;
  /** Vom Foto automatisch gelesener Displaytext/Fehlercode („… — bitte prüfen"), höchstens 500 Zeichen. */
  ai_note?: string | null;
  // Online-Terminwahl (termin.sql): Betrieb schlägt bis zu 3 Fenster vor, Kunde wählt per Link.
  slots?: Slot[] | null;
  /** Schlüssel des Kunden-Links (…/termin/?t=…); neuer Vorschlag = neuer Schlüssel */
  slot_token?: string | null;
  /** vom Kunden gewählter Termin */
  scheduled_at?: string | null;
  scheduled_end?: string | null;
}

export interface Slot {
  start: string;
  end: string;
}

/** Seite, auf der der Kunde den Termin wählt (web/termin in InstallateurDex). */
export const TERMIN_BASE = 'https://installateurdex.dexware.app/termin/?t=';

export function terminUrl(token: string | null | undefined): string | null {
  return token && (/^[0-9a-f]{32}$/.test(token) || token === 'demo') ? TERMIN_BASE + token : null;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const hm = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** „Do 14.11., 08:00–10:00" */
export function slotLabel(start: string, end?: string | null): string {
  const s = new Date(start);
  const day = `${WEEKDAYS[s.getDay()]} ${String(s.getDate()).padStart(2, '0')}.${String(s.getMonth() + 1).padStart(2, '0')}.`;
  return `${day}, ${hm(s)}${end ? `–${hm(new Date(end))}` : ''}`;
}

export type Appointment =
  | { state: 'picked'; start: string; end: string | null }
  | { state: 'proposed'; count: number }
  | { state: 'expired'; count: number };

/** Termin-Stand einer Anfrage: gewählt · vorgeschlagen (wartet) · Vorschläge verstrichen · nichts. */
export function appointmentOf(r: Pick<ServiceRequest, 'slots' | 'scheduled_at' | 'scheduled_end'>): Appointment | null {
  if (r.scheduled_at) return { state: 'picked', start: r.scheduled_at, end: r.scheduled_end ?? null };
  const slots = Array.isArray(r.slots) ? r.slots : [];
  if (!slots.length) return null;
  const future = slots.filter((s) => new Date(s.start).getTime() > Date.now());
  return future.length ? { state: 'proposed', count: future.length } : { state: 'expired', count: slots.length };
}

export function appointmentText(a: Appointment): string {
  if (a.state === 'picked') return `🗓️ Termin: ${slotLabel(a.start, a.end)} — vom Kunden gewählt`;
  if (a.state === 'proposed') return `🗓️ ${a.count} ${a.count === 1 ? 'Termin' : 'Termine'} vorgeschlagen — wartet auf Kunde`;
  return '🗓️ Vorgeschlagene Termine sind verstrichen — bitte neue vorschlagen';
}

/** Versandprotokoll der Erinnerungsmails (maintenance_reminder). */
export interface ReminderLog {
  id: string;
  asset_id: string;
  site_id: string | null;
  due_date: string;
  email: string;
  sent_at: string;
}

// ---------------------------------------------------------------------------
// Fälligkeit (wie mobile/src/lib/due.ts und asset_next_due in anfragen.sql)
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;

export type DueState = 'never' | 'overdue' | 'soon' | 'ok';

export interface DueInfo {
  state: DueState;
  dueAt: Date | null;
  daysLeft: number | null;
}

/** Ab so vielen Tagen Restlaufzeit gilt eine Wartung als „bald fällig" (wie die App). */
export const DUE_SOON_DAYS = 30;
/** Zeitraum fürs „offene Wartungspotenzial". */
export const POTENTIAL_DAYS = 90;

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return r;
}

export function intervalOf(a: Pick<Asset, 'kind' | 'interval_months'>): number {
  return a.interval_months && a.interval_months > 0 ? a.interval_months : kindInfo(a.kind).intervalMonths;
}

/** 'yyyy-mm-dd' als lokales Datum (nicht UTC). */
function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ganze Kalendertage von heute bis zum Tag (0 = heute, negativ = vorbei) — wie calendarDaysUntil in
 * mobile/src/lib/due.ts und infoFor in src/hebedex/types.ts. Früher Math.ceil auf die Millisekunden-
 * Differenz: am Fälligkeitstag stand dann „in 1 Tag", am Tag danach noch „heute fällig".
 * Math.round fängt die 23/25-Stunden-Tage der Zeitumstellung ab.
 */
export function calendarDaysUntil(day: Date): number {
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return Math.round((d.getTime() - today.getTime()) / DAY_MS);
}

function infoFor(dueAt: Date): DueInfo {
  const daysLeft = calendarDaysUntil(dueAt);
  const state: DueState = daysLeft <= 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'soon' : 'ok';
  return { state, dueAt, daysLeft };
}

/** Fälligkeit aus der letzten Wartung/Inbetriebnahme (ohne: Inbetriebnahme-Datum der Anlage). */
export function dueInfo(lastServiceAt: string | undefined, a: Pick<Asset, 'kind' | 'interval_months' | 'install_date'>): DueInfo {
  const months = intervalOf(a);
  if (lastServiceAt) return infoFor(addMonths(new Date(lastServiceAt), months));
  const inst = a.install_date ? parseDay(a.install_date) : null;
  if (inst) return infoFor(addMonths(inst, months));
  return { state: 'never', dueAt: null, daysLeft: null };
}

/** Letzte gültige Wartung/Inbetriebnahme je Anlage aus einer Einsatzliste. */
export function lastServiceFromJobs(jobs: Pick<Job, 'item_id' | 'type' | 'started_at' | 'canceled'>[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const j of jobs) {
    if (j.canceled || !jobInfo(j.type).resetsService) continue;
    const prev = map.get(j.item_id);
    if (!prev || j.started_at > prev) map.set(j.item_id, j.started_at);
  }
  return map;
}

/** Ampel-Stufe für Listen: überfällig / ≤30 Tage / ≤90 Tage / später / ohne Datum. */
export type DueBucket = 'overdue' | 'd30' | 'd90' | 'later' | 'never';

export function dueBucket(d: DueInfo): DueBucket {
  if (d.state === 'never' || d.daysLeft === null) return 'never';
  if (d.daysLeft <= 0) return 'overdue';
  if (d.daysLeft <= DUE_SOON_DAYS) return 'd30';
  if (d.daysLeft <= POTENTIAL_DAYS) return 'd90';
  return 'later';
}

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'überfällig',
  d30: 'in 30 Tagen',
  d90: 'in 90 Tagen',
  later: 'später',
  never: 'ohne Datum',
};

export function fmtDay(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Kurze Fälligkeits-Zeile für Tabellen. */
export function dueText(d: DueInfo): string {
  if (d.state === 'never' || !d.dueAt) return 'kein Datum';
  const days = d.daysLeft ?? 0;
  if (days < 0) return `seit ${Math.abs(days)} ${Math.abs(days) === 1 ? 'Tag' : 'Tagen'}`;
  if (days === 0) return 'heute fällig';
  return `in ${days} ${days === 1 ? 'Tag' : 'Tagen'}`;
}

// ---------------------------------------------------------------------------
// Anzeige-Helfer
// ---------------------------------------------------------------------------
/** Arbeitszeit lesbar: 100 → „1 h 40 min". */
export function fmtMinutes(min?: number | null): string {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

/** „Vaillant aroTHERM plus" bzw. '' */
export function makerModel(a: Pick<Asset, 'manufacturer' | 'model'>): string {
  return [a.manufacturer, a.model].filter(Boolean).join(' ');
}

/** Öffentlicher Anlagenpass (statische Seite, liest ?t=…) — gleiche Basis wie mobile/src/lib/qr.ts. */
export const PASS_BASE = 'https://installateurdex.dexware.app/a/?t=';

export function passUrl(a: Pick<Asset, 'qr_token' | 'retired' | 'is_demo'>): string | null {
  if (!a.qr_token || a.retired || a.is_demo || !/^[0-9a-f]{32}$/.test(a.qr_token)) return null;
  return PASS_BASE + a.qr_token;
}

/** Telefonnummer für tel:-Links (wie die Anlagenpass-Seite: nur + und Ziffern). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+0-9]/g, '')}`;
}

/** „vor 3 Std." · „gestern" · „vor 2 Tagen" (Kalendertage) · ab 14 Tagen das Datum. */
export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = -calendarDaysUntil(new Date(iso));
  if (d <= 1) return 'gestern';
  if (d < 14) return `vor ${d} Tagen`;
  return fmtDay(new Date(iso));
}

export function looksLikeEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

/**
 * Darf so in site.customer_email gespeichert werden? Gleiche Prüfregel wie die Datenbank (anfragen.sql:
 * ≤ 160 Zeichen, keine ? & # < > ") — sonst würde der Import den ganzen Stapel abweisen.
 */
export function validCustomerEmail(s: string): boolean {
  return s.length <= 160 && /^[^@\s?&#<>"]+@[^@\s?&#<>"]+\.[^@\s?&#<>"]+$/.test(s);
}

/**
 * mailto:-Link nur für schlichte Adressen. Die Server-Prüfung lässt ? & # zu — eine Kunden-Eingabe wie
 * „a@b.at?cc=…" würde sonst beim Klick Empfänger oder Text in die Mail schmuggeln. null = als Text zeigen.
 */
export function mailHref(email: string, subject?: string, body?: string): string | null {
  const e = email.trim();
  if (!/^[^@\s?&#/:%"<>]+@[^@\s?&#/:%"<>]+\.[^@\s?&#/:%"<>]+$/.test(e)) return null;
  const q = [subject ? `subject=${encodeURIComponent(subject)}` : '', body ? `body=${encodeURIComponent(body)}` : ''].filter(Boolean);
  return `mailto:${e}${q.length ? `?${q.join('&')}` : ''}`;
}

export function looksLikePhone(s: string): boolean {
  return /^[+0-9][0-9 ()/.-]{5,}$/.test(s.trim());
}
