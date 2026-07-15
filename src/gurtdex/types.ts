// Domain-Typen des GurtDex-Supabase-Schemas (Spiegel von mobile/src/types.ts,
// aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.
// Rechtsgrundlage: BetrSichV / PSA-Benutzungsverordnung (PSA-Prüfpflicht) +
// DGUV Regel 112-198/112-199 (PSA gegen Absturz / Rettung) + DGUV Grundsatz
// 312-906 (Sachkunde) + EN 365 (Kennzeichnung, regelmäßige Überprüfung mind.
// alle 12 Monate) + Produktnormen EN 361/354/355/360/353/362/1891/397.

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Prüfarten nach DGUV R 112-198 / DGUV G 312-906 / EN 365
// ---------------------------------------------------------------------------
export type InspectionType = 'visual' | 'expert';

export const INSPECTION_LABELS: Record<InspectionType, string> = {
  visual: 'Sicht-/Funktionskontrolle',
  expert: 'Sachkundigen-Prüfung (DGUV 312-906)',
};

export const INSPECTION_SHORT: Record<InspectionType, string> = {
  visual: 'Sicht-/Funktionskontrolle',
  expert: 'Sachkundigen-Prüfung',
};

/** Empfohlenes Intervall in Tagen je Prüfart (Fälligkeits-Anzeige). */
export const INSPECTION_INTERVAL_DAYS: Record<InspectionType, number> = {
  visual: 30,
  expert: 365,
};

/**
 * Sachkundigen-Intervall je Land (wie in der Mobile-App): im gesamten
 * DACH-Raum ist die jährliche Prüfung von PSA gegen Absturz der Maßstab
 * (DE: DGUV R 112-198 / EN 365, AT: PSA-Verordnung + Herstellerangaben,
 * CH: VUV/EKAS-Praxis + Herstellerangaben).
 */
export function expertIntervalDays(_land: string | null | undefined): number {
  return 365;
}

// ---------------------------------------------------------------------------
// Checkliste der PSAgA-Prüfung (DGUV G 312-906 / EN 365 / Herstellerangaben) —
// identisch zur App, damit die gespeicherten checklist-Keys aufgelöst werden.
// ---------------------------------------------------------------------------
export type CheckResult = 'ok' | 'defect' | 'na';

export interface ChecklistItem {
  id: string;
  label: string;
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'marking', label: 'Kennzeichnung & Etikett' },
  { id: 'lifetime', label: 'Ablegereife & Gebrauchsdauer' },
  { id: 'webbing', label: 'Gurtband & Bandmaterial' },
  { id: 'seams', label: 'Nähte' },
  { id: 'rope', label: 'Seil & Kernmantel' },
  { id: 'metal', label: 'Metallbeschläge' },
  { id: 'connectors', label: 'Karabiner & Verbindungselemente' },
  { id: 'absorber', label: 'Falldämpfer & Sturzindikator' },
  { id: 'srl', label: 'Höhensicherungsgerät (HSG)' },
  { id: 'adjusters', label: 'Einstell- & Verschlusselemente' },
  { id: 'plastic', label: 'Kunststoffteile & Helm' },
  { id: 'docs', label: 'Herstellerinformation & Historie' },
];

// ---------------------------------------------------------------------------
// Ausrüstungsarten (Inventar-Stammdaten, mit EN-Norm)
// ---------------------------------------------------------------------------
export const ITEM_CATEGORIES = [
  'Auffanggurt (EN 361)',
  'Halte-/Sitzgurt (EN 358/813)',
  'Verbindungsmittel mit Falldämpfer (EN 354/355)',
  'Höhensicherungsgerät (EN 360)',
  'Mitlaufendes Auffanggerät (EN 353)',
  'Karabiner / Verbindungselement (EN 362)',
  'Kernmantelseil (EN 1891)',
  'Bandschlinge / Anschlagmittel (EN 566/795 B)',
  'Schutzhelm mit Kinnriemen (EN 397/12492)',
  'Rettungs-/Abseilgerät (EN 341/1496)',
  'Sonstige PSAgA',
] as const;

/** Kategorien mit textilen Komponenten — dort ist die Hersteller-Gebrauchsdauer zentral. */
const TEXTILE_CATEGORIES: ReadonlyArray<string> = [
  'Auffanggurt (EN 361)',
  'Halte-/Sitzgurt (EN 358/813)',
  'Verbindungsmittel mit Falldämpfer (EN 354/355)',
  'Mitlaufendes Auffanggerät (EN 353)',
  'Kernmantelseil (EN 1891)',
  'Bandschlinge / Anschlagmittel (EN 566/795 B)',
];

/** "YYYY-MM" oder "YYYY-MM-DD" → Date (Monatsanfang), sonst undefined. */
export function parseIsoMonth(s?: string | null): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s.trim());
  if (!m) return undefined;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (year < 1980 || year > 2100 || month < 1 || month > 12) return undefined;
  return new Date(year, month - 1, 1);
}

/**
 * Ablegereife-Wächter (wie mobile lifespanWarning): Hinweis aus Herstellungs-
 * datum + maximaler Gebrauchsdauer (Herstellerangabe). Warnt ab 6 Monaten vor
 * Ablauf und bei Überschreitung; ohne Angabe erinnert er bei textilen
 * Kategorien an die Herstellerangabe. Kein Hinweis ohne plausibles Datum.
 */
export function lifespanWarning(l: Pick<PsaItem, 'manufacture_date' | 'max_life_years' | 'category'>): string | undefined {
  const made = parseIsoMonth(l.manufacture_date);
  const years = parseInt(l.max_life_years ?? '', 10);
  if (made && Number.isFinite(years) && years > 0 && years < 50) {
    const retireAt = new Date(made.getFullYear() + years, made.getMonth(), 1);
    const monthsLeft = Math.floor((retireAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44));
    const when = retireAt.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    if (monthsLeft < 0)
      return `Ablegereif seit ${when} (max. Gebrauchsdauer ${years} Jahre überschritten) — der Benutzung entziehen und aussondern.`;
    if (monthsLeft <= 6)
      return `Ablegereife in ~${Math.max(monthsLeft, 1)} Monat(en) erreicht (${when}) — Ersatz einplanen.`;
    return undefined;
  }
  if (made) {
    const ageYears = (Date.now() - made.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (TEXTILE_CATEGORIES.includes(l.category) && ageYears >= 6)
      return `${Math.floor(ageYears)} Jahre seit Herstellung — maximale Gebrauchsdauer laut Herstellerinformation prüfen (textile PSAgA typisch 6–10 Jahre).`;
    return undefined;
  }
  if (TEXTILE_CATEGORIES.includes(l.category))
    return 'Herstellungsdatum erfassen — ohne Datum lässt sich die Ablegereife (Hersteller-Gebrauchsdauer) nicht überwachen.';
  return undefined;
}

// ---------------------------------------------------------------------------
// Standort (Betriebsstätte, Lager, Fahrzeug, Kolonne …)
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
  created_at: string;
}

// ---------------------------------------------------------------------------
// PSA-Artikel — Inventar je Standort.
// photo_url (Base64-Referenzfoto) wird im Dashboard bewusst nie geladen.
// ---------------------------------------------------------------------------
export interface PsaItem {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  serial_no: string | null;
  manufacture_date: string | null;
  first_use_date: string | null;
  max_life_years: string | null;
  wearer_name: string | null;
  notes: string | null;
  retired: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Prüfung — je Artikel, APPEND-ONLY (rechtliches Kernversprechen).
// photo_urls (Base64-Beweisfotos) nur im Detail/Bericht laden!
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
}

// ---------------------------------------------------------------------------
// Mangel — Ampelverfahren (Betreiberpflichten BetrSichV/DGUV R 112-198
// sinngemäß), je Artikel, lebt bis zur Instandsetzung/Aussonderung (additiv).
// photo_urls/resolution_photo_urls nur für den Bericht!
// ---------------------------------------------------------------------------
export type DefectSeverity = 'green' | 'amber' | 'red';

export const SEVERITY_LABELS: Record<DefectSeverity, string> = {
  green: 'Grün — beobachten',
  amber: 'Orange — instand setzen lassen',
  red: 'Rot — ablegereif, Benutzung entziehen',
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

// Rechtsgrundlage je Land — erscheint im Berichtskopf (wie mobile pdf/report.ts).
export const LEGAL_BASIS: Record<Org['land'], string> = {
  DE: 'Grundlage: BetrSichV i. V. m. PSA-Benutzungsverordnung — Pflicht zur sicheren Bereitstellung und Prüfung von PSA gegen Absturz — sowie DGUV Regel 112-198/112-199 und DGUV Grundsatz 312-906: Sicht-/Funktionskontrolle durch die Benutzerin/den Benutzer vor jeder Benutzung, mindestens alle 12 Monate Prüfung durch eine sachkundige Person (EN 365), außerdem nach Sturzbelastung oder erkennbarer Beschädigung. Ablegereife nach Herstellerangabe.',
  AT: 'Grundlage: ArbeitnehmerInnenschutzgesetz (ASchG) i. V. m. PSA-Sicherheitsverordnung (PSASV) und Arbeitsmittelverordnung (AM-VO) — wiederkehrende Prüfung von PSA gegen Absturz nach Herstellerangaben und Stand der Technik, mindestens jährlich durch eine fachkundige Person (EN 365).',
  CH: 'Grundlage: Verordnung über die Unfallverhütung (VUV) — Instandhaltungs- und Prüfpflichten für Arbeitsmittel/PSA — i. V. m. EKAS-Richtlinien und Hersteller-Vorgaben (periodische Prüfung von PSA gegen Absturz, üblich jährlich; EN 365).',
};
