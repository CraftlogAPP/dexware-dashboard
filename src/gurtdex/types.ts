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

/** Erklärung je Prüfart — wortgleich zur App (mobile/src/types.ts), erscheint beim Erfassen „Vor Ort“. */
export const INSPECTION_HINTS: Record<InspectionType, string> = {
  visual:
    'Sicht- und Funktionskontrolle durch Benutzerin/Benutzer vor jeder Benutzung: Gurtband, Nähte, Beschläge, Karabiner-Funktion, Falldämpfer-Indikator, Kennzeichnung — dokumentiert empfohlen z. B. monatlich oder zu Einsatzbeginn.',
  expert:
    'Prüfung durch eine sachkundige Person (DGUV Grundsatz 312-906) nach DGUV Regel 112-198 / EN 365 — mindestens alle 12 Monate, außerdem nach Sturzbelastung oder erkennbarer Beschädigung (Ausrüstung bis dahin der Benutzung entziehen). GurtDex dokumentiert Termin und Ergebnis.',
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
  /** Prüfhinweis wie in der App (beim Erfassen „Vor Ort“) */
  hint: string;
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'marking', label: 'Kennzeichnung & Etikett', hint: 'Etikett nach EN 365 lesbar (Hersteller, Typ, Seriennummer, Herstellungsdatum, CE-Kennzeichnung, Norm)? Prüfplakette/Banderole vorhanden und aktuell?' },
  { id: 'lifetime', label: 'Ablegereife & Gebrauchsdauer', hint: 'Maximale Gebrauchs-/Lebensdauer laut Herstellerinformation nicht überschritten (ab Herstellungsdatum, Lagerzeit beachten)? Kein Ablegekriterium aus der Gebrauchsanleitung erfüllt?' },
  { id: 'webbing', label: 'Gurtband & Bandmaterial', hint: 'Keine Schnitte, Ausfransungen, aufgeraute/pelzige Stellen, Abrieb, Verbrennungen/Verschmelzungen, UV-Ausbleichung oder Chemikalien-/Mörtelspuren? Kanten intakt?' },
  { id: 'seams', label: 'Nähte', hint: 'Keine gerissenen, losen oder abgescheuerten Nähfäden? Kontrast-/Indikatorfäden unauffällig? Vernähungen und Endabschlüsse vollständig?' },
  { id: 'rope', label: 'Seil & Kernmantel', hint: 'Falls Seil/Verbindungsmittel: keine Mantelverschiebung, Verdickungen oder Kernbrüche, keine steifen/weichen Stellen? Spleiße/Endverbindungen intakt, keine starke Verschmutzung?' },
  { id: 'metal', label: 'Metallbeschläge', hint: 'Ösen, D-Ringe, Schnallen, Klemmen: keine Verformung, Risse, Korrosion, scharfen Kanten oder starker Abrieb? Beweglichkeit gegeben?' },
  { id: 'connectors', label: 'Karabiner & Verbindungselemente', hint: 'Schnapper schließt selbsttätig und vollständig? Verriegelung (Schraub-/Twistlock) wirksam? Gelenke leichtgängig, keine Verformung, keine Fremdkörper (EN 362)?' },
  { id: 'absorber', label: 'Falldämpfer & Sturzindikator', hint: 'Bandfalldämpfer nicht ausgelöst/aufgerissen, Schutzhülle intakt? Sturzindikatoren (an Gurt, HSG, Verbindungsmittel) unauffällig? Nach Sturz: sofort ablegen!' },
  { id: 'srl', label: 'Höhensicherungsgerät (HSG)', hint: 'Falls zutreffend: Seil/Gurtband zieht vollständig und zügig ein? Blockierfunktion greift beim ruckartigen Ziehen? Gehäuse und Wirbel unbeschädigt, Hersteller-Revision nicht überfällig?' },
  { id: 'adjusters', label: 'Einstell- & Verschlusselemente', hint: 'Schnallen rasten sicher ein und halten unter Zug? Gurtband läuft ohne Beschädigung durch die Versteller? Keine fehlenden oder fremden Ersatzteile?' },
  { id: 'plastic', label: 'Kunststoffteile & Helm', hint: 'Kunststoffelemente ohne Risse/Versprödung (UV)? Falls Helm dabei: Schale ohne Risse, Innenausstattung und Kinnriemen intakt (EN 397/EN 12492), Helm-Gebrauchsdauer beachtet?' },
  { id: 'docs', label: 'Herstellerinformation & Historie', hint: 'Gebrauchsanleitung des Herstellers verfügbar? Prüfhistorie/Dokumentation vollständig? Mängel aus der Vorprüfung behoben, Zubehör vollständig?' },
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

/**
 * Monatsangabe in gängigen Schreibweisen → "YYYY-MM", sonst undefined (wie mobile normalizeIsoMonth).
 * Akzeptiert „2023-04", „2023-4", „2023/04", „04/2023", „4.2023", „15.04.2023", „2023-04-15" — wer „04/2023"
 * eingetragen hat, bekommt die Ablegereife-Warnung genauso wie in der App (sicherheitsrelevant bei PSAgA).
 */
export function normalizeIsoMonth(s?: string | null): string | undefined {
  const t = (s ?? '').trim();
  if (!t) return undefined;
  let y: number | undefined;
  let m: number | undefined;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/.exec(t))) {
    y = +r[1];
    m = +r[2];
  } else if ((r = /^(?:(\d{1,2})[./-])?(\d{1,2})[./-](\d{4})$/.exec(t))) {
    y = +r[3];
    m = +r[2];
  }
  if (!y || !m || y < 1980 || y > 2100 || m < 1 || m > 12) return undefined;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Monatsangabe (siehe normalizeIsoMonth) → Date (Monatsanfang), sonst undefined. */
export function parseIsoMonth(s?: string | null): Date | undefined {
  const n = normalizeIsoMonth(s);
  if (!n) return undefined;
  const [year, month] = n.split('-').map((x) => parseInt(x, 10));
  return new Date(year, month - 1, 1);
}

/** Ende der Hersteller-Gebrauchsdauer (Monatsanfang), sonst undefined (keine plausible Angabe). Wie mobile lifespanEnd. */
export function lifespanEnd(l: Pick<PsaItem, 'manufacture_date' | 'max_life_years'>): Date | undefined {
  const made = parseIsoMonth(l.manufacture_date);
  const years = parseInt(l.max_life_years ?? '', 10);
  if (!made || !Number.isFinite(years) || years <= 0 || years >= 50) return undefined;
  return new Date(made.getFullYear() + years, made.getMonth(), 1);
}

/** true, wenn die Hersteller-Gebrauchsdauer ab Herstellungsdatum überschritten ist (wie mobile lifespanExpired). */
export function lifespanExpired(l: Pick<PsaItem, 'manufacture_date' | 'max_life_years'>, at: Date = new Date()): boolean {
  const end = lifespanEnd(l);
  return !!end && end.getTime() < at.getTime();
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
    // Kalendermonate statt Millisekunden/30,44 — und „abgelaufen" exakt wie lifespanExpired (ab dem Monatsersten),
    // sonst widersprächen sich Hinweis und Prüf-Vorbelegung im Ablaufmonat (wie in der App).
    const now = new Date();
    const monthsLeft =
      retireAt.getTime() < now.getTime()
        ? -1
        : (retireAt.getFullYear() - now.getFullYear()) * 12 + (retireAt.getMonth() - now.getMonth());
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
  /** Unterschrift der prüfenden Person (ab Datenbank-Update 2026-10-29), nur im Bericht geladen. */
  signature?: string | null;
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

/** Erklärung je Ampel-Stufe — wortgleich zur App, erscheint beim Erfassen eines Mangels „Vor Ort“. */
export const SEVERITY_HINTS: Record<DefectSeverity, string> = {
  green: 'Geringfügiger Mangel ohne Einfluss auf die Schutzwirkung (z. B. Kennzeichnung verblasst, Verschmutzung) — vermerken, beheben, bei der nächsten Prüfung erneut bewerten.',
  amber: 'Schutzwirkung möglicherweise beeinträchtigt — PSAgA darf nur der Hersteller bzw. eine von ihm autorisierte Stelle instand setzen; bis zur Klärung den Artikel nicht benutzen.',
  red: 'Ablegekriterium erfüllt (z. B. ausgelöster Falldämpfer, beschädigte Nähte oder Gurtband, verformte Beschläge, Sturzbelastung) — Artikel sofort der Benutzung entziehen, kennzeichnen und aussondern; Ersatz beschaffen.',
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
  AT: 'Grundlage: ArbeitnehmerInnenschutzgesetz (ASchG) i. V. m. § 14 der Verordnung Persönliche Schutzausrüstung (PSA-V) — wiederkehrende Prüfung von PSA gegen Absturz mindestens einmal im Kalenderjahr, längstens nach 15 Monaten, durch eine fachkundige Person nach Herstellerangaben und Stand der Technik (EN 365).',
  CH: 'Grundlage: Verordnung über die Unfallverhütung (VUV) — Instandhaltungs- und Prüfpflichten für Arbeitsmittel/PSA — i. V. m. EKAS-Richtlinien und Hersteller-Vorgaben (periodische Prüfung von PSA gegen Absturz, üblich jährlich; EN 365).',
};
