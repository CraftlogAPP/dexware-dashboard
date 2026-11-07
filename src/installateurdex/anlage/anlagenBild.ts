// Anlagen-Schema („Anlagen-Zwilling light“) im Portal — reine Logik, 1:1 wie die App
// (InstallateurDex/mobile/src/lib/anlagenSchema.ts): welche Teile gezeichnet werden (Typ → Schema-Art), welcher Status
// leuchtet und welche Kennzahlen dabeistehen. Die Zeichnung steckt in ./AnlagenSchema.tsx (Datei heißt anders als die der App, weil Windows Groß/Klein nicht unterscheidet).
//
// Status-Regel: KEINE eigene — dieselbe wie Kunden-Liste, Heute-Kacheln und Wartungstour der App (tourStops):
//  - außer Betrieb = offener Mangel „außer Betrieb“, ausgesondert = retired
//  - fällig/bald = Wartung ODER Pflicht-Dichtheitskontrolle (F-Gas), die dringendere entscheidet
//  - sonst „in Ordnung“, ohne jedes Datum „noch keine Wartung erfasst“
// Fälligkeiten rechnet die Portal-Logik in ../types.ts (dueInfo, leakDue) — mit der App abgeglichen.
// Symbolnamen bleiben die der App (MaterialCommunityIcons); das Portal übersetzt sie in ./AnlagenSchema.tsx auf lucide.

import { dueInfo, fmtDay, kindInfo, leakDue, type Asset, type Defect, type DueInfo, type ItemKind, type LeakInfo } from '../types';

// ---------------------------------------------------------------------------
// Typ → Schema
// ---------------------------------------------------------------------------

/** Leitungsart: färbt die Leitung (warm = Kupfer, kühl = Eisblau, Brennstoff/Abwasser = Graphit). */
export type LineTone = 'warm' | 'cool' | 'fuel' | 'water' | 'waste';

export interface SchemaLine {
  tone: LineTone;
  /** Fließt von rechts nach links (Rücklauf, Sauggas, Abluft). */
  reverse?: boolean;
  /** Klartext für Vorlesen/Legende, z. B. „Vorlauf“. */
  label: string;
}

export interface SchemaNode {
  /** Symbolname wie in der App (MaterialCommunityIcons) — Übersetzung auf lucide in AnlagenSchema.tsx */
  icon: string;
  label: string;
}

export type SchemaArt =
  | 'hp_air'
  | 'hp_brine'
  | 'split'
  | 'multisplit'
  | 'gas'
  | 'oil'
  | 'pellet'
  | 'district'
  | 'tank'
  | 'solar'
  | 'ventilation'
  | 'water'
  | 'lifting'
  | 'generic';

export interface SchemaSpec {
  art: SchemaArt;
  left: SchemaNode;
  /** Hauptgerät in der Mitte; null = nur zwei Teile (Split-Klima: Außen ↔ Innen). */
  mid: SchemaNode | null;
  right: SchemaNode;
  /** Leitungen links → Mitte (bzw. links → rechts ohne Mitte). */
  linkA: SchemaLine[];
  /** Leitungen Mitte → rechts (leer ohne Mitte). */
  linkB: SchemaLine[];
  /** Rechter Teil doppelt gezeichnet (Multisplit: mehrere Innengeräte). */
  rightMulti?: boolean;
  /** Kältekreis: Kältemittel-Beschriftung über der Leitung. */
  refrigerantLine?: boolean;
}

const HEIZKREIS: SchemaLine[] = [
  { tone: 'warm', label: 'Vorlauf' },
  { tone: 'cool', reverse: true, label: 'Rücklauf' },
];

const n = (icon: string, label: string): SchemaNode => ({ icon, label });

const SPECS: Record<ItemKind, SchemaSpec> = {
  hp_air: {
    art: 'hp_air',
    left: n('fan', 'Außeneinheit'),
    mid: n('heat-pump', 'Wärmepumpe'),
    right: n('water-boiler', 'Speicher · Heizkreis'),
    linkA: [{ tone: 'cool', label: 'Umweltwärme aus der Außenluft' }],
    linkB: HEIZKREIS,
  },
  hp_brine: {
    art: 'hp_brine',
    left: n('water-well', 'Erdsonde'),
    mid: n('heat-pump', 'Wärmepumpe'),
    right: n('water-boiler', 'Speicher · Heizkreis'),
    linkA: [
      { tone: 'cool', label: 'Sole zur Wärmepumpe' },
      { tone: 'cool', reverse: true, label: 'Sole zurück' },
    ],
    linkB: HEIZKREIS,
  },
  ac_split: {
    art: 'split',
    left: n('fan', 'Außengerät'),
    mid: null,
    right: n('air-conditioner', 'Innengerät'),
    linkA: [
      { tone: 'warm', label: 'Flüssigkeitsleitung' },
      { tone: 'cool', reverse: true, label: 'Sauggasleitung' },
    ],
    linkB: [],
    refrigerantLine: true,
  },
  ac_multi: {
    art: 'multisplit',
    left: n('fan', 'Außengerät'),
    mid: null,
    right: n('air-conditioner', 'Innengeräte'),
    linkA: [
      { tone: 'warm', label: 'Flüssigkeitsleitung' },
      { tone: 'cool', reverse: true, label: 'Sauggasleitung' },
    ],
    linkB: [],
    rightMulti: true,
    refrigerantLine: true,
  },
  gas: {
    art: 'gas',
    left: n('pipe-valve', 'Gas'),
    mid: n('water-boiler', 'Brennwertkessel'),
    right: n('radiator', 'Heizkreis'),
    linkA: [{ tone: 'fuel', label: 'Gasleitung' }],
    linkB: HEIZKREIS,
  },
  oil: {
    art: 'oil',
    left: n('barrel', 'Öltank'),
    mid: n('water-boiler', 'Ölkessel'),
    right: n('radiator', 'Heizkreis'),
    linkA: [{ tone: 'fuel', label: 'Ölleitung' }],
    linkB: HEIZKREIS,
  },
  pellet: {
    art: 'pellet',
    left: n('storage-tank', 'Pelletlager'),
    mid: n('fireplace', 'Kessel'),
    right: n('radiator', 'Heizkreis'),
    linkA: [{ tone: 'fuel', label: 'Brennstoff-Zufuhr' }],
    linkB: HEIZKREIS,
  },
  district: {
    art: 'district',
    left: n('heat-wave', 'Fernwärme'),
    mid: n('heating-coil', 'Übergabestation'),
    right: n('radiator', 'Heizkreis'),
    linkA: [
      { tone: 'warm', label: 'Fernwärme Vorlauf' },
      { tone: 'cool', reverse: true, label: 'Fernwärme Rücklauf' },
    ],
    linkB: HEIZKREIS,
  },
  dhw_tank: {
    art: 'tank',
    left: n('water', 'Kaltwasser'),
    mid: n('water-boiler', 'Speicher'),
    right: n('shower-head', 'Warmwasser'),
    linkA: [{ tone: 'water', label: 'Kaltwasser' }],
    linkB: [{ tone: 'warm', label: 'Warmwasser' }],
  },
  solar: {
    art: 'solar',
    left: n('solar-panel', 'Kollektor'),
    mid: n('water-boiler', 'Speicher'),
    right: n('shower-head', 'Warmwasser'),
    linkA: [
      { tone: 'warm', label: 'Solarkreis Vorlauf' },
      { tone: 'cool', reverse: true, label: 'Solarkreis Rücklauf' },
    ],
    linkB: [{ tone: 'warm', label: 'Warmwasser' }],
  },
  ventilation: {
    art: 'ventilation',
    left: n('weather-windy', 'Außenluft'),
    mid: n('hvac', 'Lüftungsgerät'),
    right: n('home-outline', 'Wohnräume'),
    linkA: [
      { tone: 'cool', label: 'Außenluft' },
      { tone: 'cool', reverse: true, label: 'Fortluft' },
    ],
    linkB: [
      { tone: 'warm', label: 'Zuluft' },
      { tone: 'warm', reverse: true, label: 'Abluft' },
    ],
  },
  softener: {
    art: 'water',
    left: n('water', 'Zulauf'),
    mid: n('water-percent', 'Enthärtung'),
    right: n('home-outline', 'Hausnetz'),
    linkA: [{ tone: 'water', label: 'Trinkwasser' }],
    linkB: [{ tone: 'water', label: 'Weichwasser' }],
  },
  filter: {
    art: 'water',
    left: n('water', 'Zulauf'),
    mid: n('filter', 'Rückspülfilter'),
    right: n('home-outline', 'Hausnetz'),
    linkA: [{ tone: 'water', label: 'Trinkwasser' }],
    linkB: [{ tone: 'water', label: 'gefiltertes Wasser' }],
  },
  booster: {
    art: 'water',
    left: n('water', 'Zulauf'),
    mid: n('water-pump', 'Druckerhöhung'),
    right: n('office-building', 'Verbraucher'),
    linkA: [{ tone: 'water', label: 'Zulauf' }],
    linkB: [{ tone: 'water', label: 'Druckseite' }],
  },
  lifting: {
    art: 'lifting',
    left: n('toilet', 'Abwasser'),
    mid: n('pump', 'Hebeanlage'),
    right: n('pipe', 'Kanal'),
    linkA: [{ tone: 'waste', label: 'Zulauf Abwasser' }],
    linkB: [{ tone: 'waste', label: 'Druckleitung' }],
  },
  other: {
    art: 'generic',
    left: n('pipe-valve', 'Zulauf'),
    mid: n('cog', 'Anlage'),
    right: n('home-outline', 'Verbraucher'),
    linkA: [{ tone: 'water', label: 'Zulauf' }],
    linkB: [{ tone: 'water', label: 'Abgang' }],
  },
};

/** Schema je Anlagentyp; unbekannte Typen (ältere Daten) → allgemeines Bild. */
export function schemaFor(kind: string | undefined | null): SchemaSpec {
  return SPECS[kindInfo(kind).id] ?? SPECS.other;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
export type SchemaStatus = 'blocked' | 'retired' | 'overdue' | 'soon' | 'ok' | 'never';
/** Ampel-Ton wie die Abzeichen (.badge red/amber/green). */
export type StatusTone = 'red' | 'amber' | 'green' | 'muted';

export const STATUS_TONE: Record<SchemaStatus, StatusTone> = {
  blocked: 'red',
  retired: 'muted',
  overdue: 'red',
  soon: 'amber',
  ok: 'green',
  never: 'muted',
};

/** Kurzwort fürs Status-Licht — dieselben Wörter wie in der App. */
export const STATUS_WORD: Record<SchemaStatus, string> = {
  blocked: 'Außer Betrieb',
  retired: 'Ausgesondert',
  overdue: 'Fällig',
  soon: 'Bald fällig',
  ok: 'In Ordnung',
  never: 'Keine Wartung erfasst',
};

const tage = (d: number) => `${d} ${d === 1 ? 'Tag' : 'Tagen'}`;

/** Kurze Zeile zur Wartung: „Wartung in 12 Tagen fällig“. */
export function serviceText(info: DueInfo): string {
  if (info.state === 'never') return 'Noch keine Wartung erfasst';
  const d = info.daysLeft ?? 0;
  if (info.state === 'overdue') return d === 0 ? 'Wartung heute fällig' : `Wartung seit ${tage(-d)} überfällig`;
  if (info.state === 'soon') return `Wartung in ${tage(d)} fällig`;
  return 'Wartung in Ordnung';
}

/** Kurze Zeile zur Pflicht-Dichtheitskontrolle (F-Gas). */
export function leakText(info: DueInfo & { followUp?: boolean }): string {
  if (info.state === 'never') return 'Dichtheitskontrolle (F-Gas): noch keine dokumentiert';
  const d = info.daysLeft ?? 0;
  const what = info.followUp ? 'Nachkontrolle Dichtheit' : 'Dichtheitskontrolle (F-Gas)';
  if (info.state === 'overdue') return d === 0 ? `${what} heute fällig` : `${what} seit ${tage(-d)} überfällig`;
  if (info.state === 'soon') return `${what} in ${tage(d)} fällig`;
  return `${what} bis ${fmtDay(info.dueAt!)}`;
}

const dueTone = (s: DueInfo['state']): StatusTone => (s === 'overdue' ? 'red' : s === 'soon' ? 'amber' : s === 'ok' ? 'green' : 'muted');

export interface SchemaHint {
  text: string;
  tone: StatusTone;
}

export interface Kennzahl {
  label: string;
  value: string;
}

export interface AnlagenBild {
  spec: SchemaSpec;
  status: SchemaStatus;
  tone: StatusTone;
  /** Hauptzeile neben dem Status-Licht. */
  headline: string;
  /** Weitere Zeilen: Dichtheitskontrolle, offene Mängel. */
  hints: SchemaHint[];
  /** 2–4 Kennzahlen (nur, was eingetragen ist). */
  kennzahlen: Kennzahl[];
  /** Leitungen fließen (nicht bei „außer Betrieb“ und „ausgesondert“). */
  flowing: boolean;
  /** Klartext fürs Vorlesen: „Luft/Wasser-Wärmepumpe WP-001, Wartung in 12 Tagen fällig“. */
  a11y: string;
  /** Beschriftung über der Leitung (Split: Kältemittel); undefined = keine. */
  lineText?: string;
}

/** Zahl aus dem Formular hübsch: „1.2“ → „1,2“. */
const deNum = (s: string) => s.trim().replace('.', ',');

/** Kennzahlen: Leistung, Kältemittel + Menge, Baujahr, nächste Wartung — höchstens vier, nur ausgefüllte. */
export function kennzahlen(
  a: Pick<Asset, 'power_kw' | 'refrigerant' | 'refrigerant_kg' | 'build_year' | 'install_date' | 'kind'>,
  service?: DueInfo,
): Kennzahl[] {
  const out: Kennzahl[] = [];
  if (a.power_kw?.trim()) out.push({ label: 'Leistung', value: `${deNum(a.power_kw)} kW` });
  if (kindInfo(a.kind).refrigerant && a.refrigerant?.trim()) {
    out.push({ label: 'Kältemittel', value: a.refrigerant_kg?.trim() ? `${a.refrigerant.trim()} · ${deNum(a.refrigerant_kg)} kg` : a.refrigerant.trim() });
  }
  if (a.build_year?.trim()) out.push({ label: 'Baujahr', value: a.build_year.trim() });
  else if (/^\d{4}-/.test(a.install_date ?? '')) out.push({ label: 'In Betrieb seit', value: a.install_date!.slice(0, 4) });
  // Überfällig: „Nächste Wartung“ mit einem Datum in der Vergangenheit liest sich falsch
  if (service?.dueAt) out.push({ label: service.state === 'overdue' ? 'Wartung fällig seit' : 'Nächste Wartung', value: fmtDay(service.dueAt) });
  return out.slice(0, 4);
}

/** Was das Portal je Anlage schon weiß (Objektseite: lastService/lastLeakCheck, Anlagenseite: assetStatus). */
export interface AnlagenStand {
  /** letzte gültige Wartung/Inbetriebnahme (ISO) */
  lastService?: string;
  /** letzte Dichtheitskontrolle (mit „undicht“ → Nachkontrolle) */
  leak?: LeakInfo | string;
  /** offene Mängel — der Anlage oder des ganzen Objekts (gezählt wird nur, was zu dieser Anlage gehört) */
  defects: Pick<Defect, 'item_id' | 'item_blocked' | 'status'>[];
}

/** Alles fürs Bild einer Anlage — wie anlagenBild in der App. */
export function anlagenBild(asset: Asset, stand: AnlagenStand): AnlagenBild {
  const spec = schemaFor(asset.kind);
  const name = `${kindInfo(asset.kind).label} ${asset.name}`.trim();
  const mine = stand.defects.filter((d) => d.item_id === asset.id && d.status === 'open');
  const isBlocked = mine.some((d) => d.item_blocked);
  const service = dueInfo(stand.lastService, asset);
  const leak = asset.retired ? null : leakDue(asset, stand.leak);

  let status: SchemaStatus;
  if (asset.retired) status = 'retired';
  else if (isBlocked) status = 'blocked';
  else {
    // EINE Regel (App: tourStops): Wartung ODER Dichtheitskontrolle, die dringendere entscheidet
    const svc = service.state;
    const lk = leak?.state;
    if (svc === 'overdue' || lk === 'overdue') status = 'overdue';
    else if (svc === 'soon' || lk === 'soon') status = 'soon';
    else status = svc === 'never' ? 'never' : 'ok';
  }

  let headline: string;
  if (status === 'retired') headline = asset.retire_reason ? `Ausgesondert: ${asset.retire_reason}` : 'Ausgesondert';
  else if (status === 'blocked') headline = 'Außer Betrieb — Mangel offen';
  else headline = serviceText(service);

  const hints: SchemaHint[] = [];
  if (leak && status !== 'retired') hints.push({ text: leakText(leak), tone: dueTone(leak.state) });
  const notBlocking = mine.filter((d) => !d.item_blocked).length;
  if (status !== 'retired' && (notBlocking > 0 || (isBlocked && mine.length > 1))) {
    const c = isBlocked ? mine.length : notBlocking;
    hints.push({ text: `${c} ${c === 1 ? 'Mangel' : 'Mängel'} offen`, tone: 'red' });
  }

  const kz = kennzahlen(asset, status === 'retired' ? undefined : service);
  const a11y = [name, headline, ...hints.map((h) => h.text)].join(', ');
  return {
    spec,
    status,
    tone: STATUS_TONE[status],
    headline,
    hints,
    kennzahlen: kz,
    flowing: status !== 'retired' && status !== 'blocked',
    a11y,
    lineText: refrigerantLineText(spec, asset.refrigerant, asset.refrigerant_kg),
  };
}

/** Beschriftung über der Kältemittelleitung (Split/Multisplit): „R32 · 1,2 kg“, ohne Angabe „Kältemittelleitung“. */
export function refrigerantLineText(spec: SchemaSpec, refrigerant?: string | null, kg?: string | null): string | undefined {
  if (!spec.refrigerantLine) return undefined;
  const rf = refrigerant?.trim();
  if (!rf) return 'Kältemittelleitung';
  return kg?.trim() ? `${rf} · ${deNum(kg)} kg` : rf;
}
