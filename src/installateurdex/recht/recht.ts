// KOPIE von InstallateurDex/mobile/src/lib/recht.ts — erzeugt von mobile/scripts/recht-daten.js, nicht von Hand ändern.
// Landesrecht für den Betrieb: Welche Regeln gelten für Land + Bundesland, welche Pflicht-Überprüfung
// hat eine Anlage, wann ist sie fällig? Daten: docs/recht/recht-at.json + recht-de.json, übersetzt von
// scripts/recht-daten.js nach lib/rechtData.ts (dieselben Texte bekommt auch die KI, supabase/functions/_shared).
// Die App rechnet Richtwerte — maßgeblich ist der Gesetzestext (Fundstelle + Link je Regel).
import type { Asset, Inspection, Land, Site } from './shim';
import { addMonths, calendarDaysUntil, DUE_SOON_DAYS, fmtDate } from './shim';
import type { DueInfo } from './shim';
import { RECHT } from './rechtData';

export type LegalTopic =
  | 'pruefpflicht'
  | 'fgas'
  | 'heizungstausch'
  | 'inbetriebnahme'
  | 'gas'
  | 'heizungswasser'
  | 'trinkwasser'
  | 'rechnung'
  | 'steuer'
  | 'aufbewahrung'
  | 'arbeitszeit'
  | 'qualifikation'
  | 'gewaehrleistung'
  | 'sonstiges';

export type InstallerRole = 'darf' | 'darf_mit_berechtigung' | 'nicht' | 'nur_hinweis';
export type Verified = 'wortlaut' | 'behoerdenseite' | 'sekundaer' | 'unsicher';

export interface LegalRule {
  id: string;
  land: 'AT' | 'DE' | 'EU';
  regions: string[];
  topic: LegalTopic;
  title: string;
  kinds: string[] | null;
  minKw: number | null;
  maxKwExclusive: number | null;
  conditions: string | null;
  intervalMonths: number | null;
  /** Spätester Ersttermin ab Inbetriebnahme (Monate), wenn anders getaktet als die Wiederholung. */
  firstMonths: number | null;
  /** Gilt erst ab so vielen Wohnungen/Nutzungseinheiten im Gebäude (Site.units). */
  minUnits: number | null;
  /** Standardfall → App rechnet automatisch eine Frist; sonst nur Hinweis in der Übersicht. */
  autoDue: boolean;
  /** Fester Stichtag (JJJJ-MM-TT) statt Abstand ab Inbetriebnahme, z. B. DE § 60b Altanlagen bis 30.09.2027. */
  dueDate: string | null;
  /** Gilt nur für Anlagen mit Inbetriebnahme NACH bzw. VOR diesem Tag (JJJJ-MM-TT). */
  installedAfter: string | null;
  installedBefore: string | null;
  firstCheck: string | null;
  tolerance: { beforeMonths: number; afterMonths: number } | null;
  installerRole: InstallerRole;
  prereq: string | null;
  duty: string;
  appHint: string;
  legalRef: string;
  sourceUrl: string;
  verified: Verified;
}

export interface LegalDataset {
  stand: string;
  land: 'AT' | 'DE';
  regions: Record<string, string>;
  rules: LegalRule[];
  aiSummary: Record<string, string>;
}

export const TOPIC_LABELS: Record<LegalTopic, { label: string; emoji: string }> = {
  pruefpflicht: { label: 'Pflicht-Überprüfungen', emoji: '🔎' },
  fgas: { label: 'Kältemittel (F-Gase)', emoji: '❄️' },
  heizungstausch: { label: 'Heizungstausch & Neubau', emoji: '🔥' },
  inbetriebnahme: { label: 'Inbetriebnahme', emoji: '▶️' },
  gas: { label: 'Gasanlagen', emoji: '💨' },
  heizungswasser: { label: 'Heizungswasser', emoji: '💧' },
  trinkwasser: { label: 'Trinkwasser', emoji: '🚰' },
  qualifikation: { label: 'Wer darf was', emoji: '🎓' },
  rechnung: { label: 'Rechnung', emoji: '🧾' },
  steuer: { label: 'Steuer', emoji: '💶' },
  aufbewahrung: { label: 'Aufbewahrung', emoji: '🗄️' },
  arbeitszeit: { label: 'Arbeitszeit', emoji: '⏱' },
  gewaehrleistung: { label: 'Gewährleistung', emoji: '🛡️' },
  sonstiges: { label: 'Sonstiges', emoji: '📌' },
};

export const TOPIC_ORDER: LegalTopic[] = Object.keys(TOPIC_LABELS) as LegalTopic[];

export const ROLE_LABELS: Record<InstallerRole, string> = {
  darf: 'Installateur darf das',
  darf_mit_berechtigung: 'nur mit Berechtigung',
  nicht: 'nicht Installateur (z. B. Rauchfangkehrer/Schornsteinfeger)',
  nur_hinweis: 'Hinweis für Betreiber/Kunde',
};

export function datasetOf(land: Land): LegalDataset | null {
  return land === 'AT' ? RECHT.AT : land === 'DE' ? RECHT.DE : null;
}

/** EU-Regeln (F-Gas-VO) stehen im AT-Datensatz und gelten in beiden Ländern. */
function euRules(): LegalRule[] {
  return [...RECHT.AT.rules, ...RECHT.DE.rules].filter((r) => r.land === 'EU');
}

/** Alle Regeln für Land + Bundesland (bundesweite + landesspezifische + EU). Ohne Bundesland: nur bundesweite. */
export function rulesFor(land: Land, region?: string | null): LegalRule[] {
  const ds = datasetOf(land);
  if (!ds) return [];
  const seen = new Set<string>();
  const out: LegalRule[] = [];
  for (const r of [...ds.rules.filter((x) => x.land !== 'EU'), ...euRules()]) {
    if (seen.has(r.id)) continue;
    if (!r.regions.includes('alle') && !(region && r.regions.includes(region))) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export function regionSummary(land: Land, region?: string | null): { all: string; region: string } {
  const ds = datasetOf(land);
  return { all: ds?.aiSummary.alle ?? '', region: (region && ds?.aiSummary[region]) || '' };
}

function kwOf(v?: string): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface AssetRule {
  rule: LegalRule;
  /** Leistung fehlt, die Regel hängt aber an kW-Grenzen → „bitte Leistung eintragen“. */
  kwUnknown: boolean;
  /** Wohneinheiten am Objekt fehlen, die Regel hängt aber daran (z. B. DE ab 6). */
  unitsUnknown: boolean;
  /** Inbetriebnahme-Datum fehlt, die Regel hängt aber an einem Stichtag. */
  dateUnknown: boolean;
}

type RuleAsset = Pick<Asset, 'kind' | 'powerKw'> & Partial<Pick<Asset, 'installDate'>>;
type RuleSite = Partial<Pick<Site, 'units'>> | null | undefined;

/** Regeln, die für diese Anlage gelten (Anlagentyp, Leistung, Inbetriebnahme, Wohneinheiten am Objekt). */
export function assetRules(a: RuleAsset, land: Land, region?: string | null, site?: RuleSite): AssetRule[] {
  const kw = kwOf(a.powerKw);
  const day = a.installDate && /^\d{4}-\d{2}-\d{2}/.test(a.installDate) ? a.installDate.slice(0, 10) : undefined;
  const units = site?.units && site.units > 0 ? site.units : undefined;
  const out: AssetRule[] = [];
  for (const r of rulesFor(land, region)) {
    if (!r.kinds || !r.kinds.includes(a.kind)) continue;
    const bounded = r.minKw != null || r.maxKwExclusive != null;
    if (bounded && kw !== undefined) {
      if (r.minKw != null && kw < r.minKw) continue;
      if (r.maxKwExclusive != null && kw >= r.maxKwExclusive) continue;
    }
    if (r.minUnits != null && units !== undefined && units < r.minUnits) continue;
    const dated = !!(r.installedAfter || r.installedBefore);
    if (dated && day) {
      if (r.installedAfter && day <= r.installedAfter) continue;
      if (r.installedBefore && day >= r.installedBefore) continue;
    }
    out.push({ rule: r, kwUnknown: bounded && kw === undefined, unitsUnknown: r.minUnits != null && units === undefined, dateUnknown: dated && !day });
  }
  return out;
}

/**
 * Die wiederkehrende Pflicht-Überprüfung der Anlage (kürzestes Intervall). F-Gas rechnet lib/fgas.ts
 * genauer (Füllmenge/CO₂e) — hier nur Prüfpflichten nach Landes-/Bundesrecht.
 * Mehrere Regeln mit unbekannter Leistung: die strengste (kürzeste) als Vorschlag, mit kwUnknown.
 */
export function periodicDuty(a: RuleAsset, land: Land, region?: string | null, site?: RuleSite): AssetRule | null {
  // Nur Regeln, die die Rechercheure als Standardfall markiert haben (autoDue) — Sonderfälle (nicht genormte Brennstoffe,
  // Rauchfangkehrer-Tätigkeiten, ab 1 MW …) bleiben Hinweise in der Übersicht. F-Gas rechnet lib/fgas.ts genauer.
  const list = assetRules(a, land, region, site).filter(
    (x) =>
      x.rule.autoDue &&
      x.rule.topic !== 'fgas' &&
      (x.rule.intervalMonths || x.rule.firstMonths || x.rule.dueDate) &&
      // Hängt die Pflicht an Leistung/Wohneinheiten/Stichtag und fehlt die Angabe, keine Frist erfinden (Hinweis in der Übersicht)
      !x.kwUnknown &&
      !x.unitsUnknown &&
      !x.dateUnknown
  );
  if (!list.length) return null;
  const m = (r: LegalRule) => r.intervalMonths ?? r.firstMonths ?? 999;
  return list.sort((x, y) => m(x.rule) - m(y.rule))[0];
}

/** Messwert-ID, mit der ein Einsatz als gesetzliche Überprüfung zählt (Ergebnis eingetragen). */
export const LEGAL_CHECK_ID = 'legalCheck';
export const LEGAL_CHECK_RESULTS = ['ohne Mängel', 'mit Mängeln'];

export function isLegalCheck(i: Pick<Inspection, 'canceled' | 'measurements'>): boolean {
  return !i.canceled && !!String(i.measurements?.[LEGAL_CHECK_ID] ?? '').trim();
}

/** Letzte dokumentierte gesetzliche Überprüfung je Anlage. */
export function lastLegalCheckByItem(inspections: Inspection[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const i of inspections) {
    if (!isLegalCheck(i)) continue;
    const prev = map.get(i.itemId);
    if (!prev || i.startedAt > prev) map.set(i.itemId, i.startedAt);
  }
  return map;
}

export interface LegalDue extends DueInfo {
  rule: LegalRule;
  kwUnknown: boolean;
  /**
   * Seit wann gerechnet: letzte Überprüfung, Inbetriebnahme, kein Datum ('none') oder
   * 'unknown' = Ersttermin liegt lange zurück und keine Prüfung ist dokumentiert (Stand unbekannt, kein Alarm).
   */
  basis: 'check' | 'install' | 'none' | 'unknown';
}

/** Fälligkeit der Pflicht-Überprüfung (ohne Prüfung: ab Inbetriebnahme). null = keine Prüfpflicht bekannt. */
export function legalDue(
  a: Pick<Asset, 'kind' | 'powerKw' | 'installDate'>,
  land: Land,
  region: string | null | undefined,
  lastCheck?: string,
  site?: RuleSite
): LegalDue | null {
  const d = periodicDuty(a, land, region, site);
  if (!d) return null;
  // Fester Stichtag: gilt, solange keine Prüfung dokumentiert ist (danach Wiederholung, falls vorgesehen)
  if (d.rule.dueDate && !lastCheck) {
    const [y, m, dd] = d.rule.dueDate.split('-').map(Number);
    const dueAt = new Date(y, m - 1, dd);
    const daysLeft = calendarDaysUntil(dueAt);
    return { rule: d.rule, kwUnknown: d.kwUnknown, basis: 'install', state: daysLeft <= 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'soon' : 'ok', dueAt, daysLeft };
  }
  // Nach einer Prüfung: Wiederholungsintervall (ohne → keine weitere Frist). Ohne Prüfung: Ersttermin ab Inbetriebnahme.
  const months = lastCheck ? d.rule.intervalMonths : d.rule.firstMonths ?? d.rule.intervalMonths;
  if (months == null) return null;
  const base = lastCheck ? new Date(lastCheck) : a.installDate ? new Date(a.installDate) : null;
  if (!base || Number.isNaN(base.getTime())) {
    return { rule: d.rule, kwUnknown: d.kwUnknown, basis: 'none', state: 'never', dueAt: null, daysLeft: null };
  }
  const dueAt = addMonths(base, months);
  const daysLeft = calendarDaysUntil(dueAt);
  // Ältere Anlage ohne dokumentierte Prüfung: ob schon geprüft wurde, weiß die App nicht → kein „überfällig“-Alarm.
  if (!lastCheck && daysLeft < -90) {
    return { rule: d.rule, kwUnknown: d.kwUnknown, basis: 'unknown', state: 'never', dueAt: null, daysLeft: null };
  }
  return {
    rule: d.rule,
    kwUnknown: d.kwUnknown,
    basis: lastCheck ? 'check' : 'install',
    state: daysLeft <= 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'soon' : 'ok',
    dueAt,
    daysLeft,
  };
}

/** Kurzer Gesetzesname aus der Fundstelle: „§ 27 Abs. 1 Bgld. HKG“ → „Bgld. HKG“. */
// Bestandteile einer Fundstelle vor dem Gesetzesnamen: §, Abs., Z, lit., Nummern, „und“, Kommas …
const REF_PART = /^(§+|Abs\.?|Z|lit\.?|Satz|Nr\.?|Ziff\.?|und|bis|sowie|[\d–-]+[a-z]?|[a-z])[,.]?$/;

/**
 * Kurzer Gesetzesname aus der Fundstelle, z. B. „§ 27 Abs. 1 Z 1 Bgld. HKG (LGBl. Nr. 33/2019 idF …)“ → „Bgld. HKG“,
 * „§ 12 Abs. 1, § 28 Abs. 1 und 2 Bgld. HKG“ → „Bgld. HKG“, „§ 26 NÖ BO 2014 iVm § 27 NÖ BTV 2014“ → „NÖ BO 2014“.
 * Fundstellen ohne § (z. B. „Art. 5 Verordnung (EU) 2024/573“) bleiben, nur ohne Fassungs-Klammer.
 */
export function lawShort(rule: LegalRule): string {
  const ref = rule.legalRef.replace(/\s*\([^()]*(?:LGBl|BGBl|idF|i\.d\.F)[^()]*\)/g, '').trim();
  if (!ref.startsWith('§')) return ref;
  const toks = ref.split(';')[0].trim().split(/\s+/);
  let i = 0;
  while (i < toks.length && REF_PART.test(toks[i])) i++;
  const name: string[] = [];
  for (; i < toks.length; i++) {
    if (/^(iVm|i\.V\.m\.|idF|i\.d\.F\.?)$/i.test(toks[i])) {
      if (name.length) break;
      // „§ 25 Abs 1 iVm § 24 Abs 3 Sbg. …“: Gesetz steht erst nach dem iVm-Verweis
      while (i + 1 < toks.length && REF_PART.test(toks[i + 1])) i++;
      continue;
    }
    name.push(toks[i]);
  }
  return name.join(' ').replace(/[,;]$/, '') || ref;
}

export function legalDueLabel(d: LegalDue): string {
  const law = lawShort(d.rule);
  if (d.state === 'never') {
    return d.basis === 'unknown'
      ? `Pflicht-Überprüfung nach ${law}: letzte Prüfung nicht dokumentiert`
      : `Pflicht-Überprüfung (${law}): Inbetriebnahme-Datum fehlt`;
  }
  const when = fmtDate(d.dueAt!);
  if (d.state === 'overdue') return `Überprüfung nach ${law} überfällig — war fällig am ${when}`;
  if (d.state === 'soon') return `Überprüfung nach ${law} fällig am ${when}`;
  return `Überprüfung nach ${law} bis ${when}`;
}

/** Ohne passende Berechtigung ist die Pflicht-Überprüfung nur ein Hinweis an den Kunden. */
export function mayInspect(rule: LegalRule, inspectionNo?: string): boolean {
  if (rule.installerRole === 'darf') return true;
  if (rule.installerRole === 'darf_mit_berechtigung') return !!inspectionNo?.trim();
  return false;
}
