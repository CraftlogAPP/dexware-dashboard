// Domain-Typen des LeiterDex-Supabase-Schemas (Spiegel von mobile/src/types.ts,
// aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.
// Rechtsgrundlage: BetrSichV §§ 4, 14 / ArbSchG (Arbeitgeber-Prüfpflicht) +
// TRBS 2121-2 + DGUV Information 208-016 (ehem. BGI 694) + DIN EN 131.

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Prüfarten nach BetrSichV / TRBS 2121-2 / DGUV Information 208-016
// ---------------------------------------------------------------------------
export type InspectionType = 'visual' | 'expert';

export const INSPECTION_LABELS: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle',
  expert: 'Regelmäßige Prüfung (befähigte Person)',
};

export const INSPECTION_SHORT: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle',
  expert: 'Regelmäßige Prüfung',
};

/** Erklärung je Prüfart — wortgleich zur App (mobile/src/types.ts), erscheint beim Erfassen „Vor Ort“. */
export const INSPECTION_HINTS: Record<InspectionType, string> = {
  visual: 'Sicht- und Funktionskontrolle durch den Benutzer bzw. eine beauftragte Person — vor der Benutzung; dokumentiert empfohlen z. B. monatlich.',
  expert: 'Wiederkehrende Prüfung durch eine zur Prüfung befähigte Person (BetrSichV § 14) — Frist aus der Gefährdungsbeurteilung, üblich: alle 12 Monate. LeiterDex dokumentiert Termin und Ergebnis.',
};

/** Empfohlenes Intervall in Tagen je Prüfart (Fälligkeits-Anzeige). */
export const INSPECTION_INTERVAL_DAYS: Record<InspectionType, number> = {
  visual: 30,
  expert: 365,
};

// ---------------------------------------------------------------------------
// Checkliste der Leitern-/Tritte-Prüfung (DGUV Information 208-016 orientiert) —
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
  { id: 'stiles', label: 'Holme', hint: 'Verbogen, geknickt, gerissen, aufgescheuerte Kanten, Korrosion? Beschädigte Alu-Holme sind nicht reparabel — aussondern.' },
  { id: 'rungs', label: 'Sprossen / Stufen', hint: 'Alle vorhanden, fest verbunden, unverformt? Trittflächen rutschhemmend und nicht abgenutzt?' },
  { id: 'feet', label: 'Leiter-/Trittfüße', hint: 'Fußkappen und Endstopfen vorhanden, unbeschädigt, rutschhemmend? Abgenutzte Füße = Wegrutschgefahr.' },
  { id: 'spreader', label: 'Spreizsicherung', hint: 'Bei Stehleitern: Spanngurte, Ketten oder Gelenke vorhanden, unbeschädigt, gleich lang und straff?' },
  { id: 'joints', label: 'Gelenke / Beschläge', hint: 'Gelenke und Arretierungen (Mehrzweck-/Gelenkleitern) fest, funktionsfähig, ohne Spiel? Alle Bolzen gesichert?' },
  { id: 'connections', label: 'Verbindungen', hint: 'Nieten, Schrauben und Bördelverbindungen fest? Keine losen oder fehlenden Verbindungselemente?' },
  { id: 'hooks', label: 'Führungen / Fallhaken / Zugseil', hint: 'Bei Schiebe- und Seilzugleitern: Führungsbügel intakt, Fallhaken rasten sicher ein, Zugseil unbeschädigt?' },
  { id: 'platform', label: 'Plattform / Podest', hint: 'Bei Tritten und Podestleitern: Plattform fest und unverformt, Belag rutschhemmend, Geländer/Haltebügel intakt?' },
  { id: 'accessories', label: 'Traverse / Zubehör', hint: 'Fußverbreiterung (Traverse), Wandabstützung, Einhängehaken, Erdspitzen fest und unbeschädigt?' },
  { id: 'wood', label: 'Holz: Oberfläche & Anstrich', hint: 'Splitter, Risse, Astabbrüche? Keine deckenden Anstriche (verdecken Risse) — nur transparente Lasur zulässig.' },
  { id: 'marking', label: 'Kennzeichnung', hint: 'Typenschild, EN-131-Kennzeichnung, Benutzungs-Piktogramme und Prüfplakette vorhanden und lesbar?' },
  { id: 'cleanliness', label: 'Verschmutzung', hint: 'Frei von Öl, Fett, Farbe, Mörtel und Beton? Verschmutzte Sprossen und Stufen = Abrutschgefahr.' },
];

// ---------------------------------------------------------------------------
// Leiter-/Tritt-Bauarten und Werkstoffe (Inventar-Stammdaten)
// ---------------------------------------------------------------------------
export const LADDER_CATEGORIES = [
  'Anlegeleiter',
  'Schiebeleiter',
  'Seilzugleiter',
  'Stehleiter',
  'Mehrzweck-/Gelenkleiter',
  'Teleskopleiter',
  'Podestleiter',
  'Tritt',
  'Sonstige',
] as const;

export const LADDER_MATERIALS = ['Aluminium', 'Holz', 'GFK/Kunststoff', 'Stahl'] as const;

// ---------------------------------------------------------------------------
// Standort (Betriebsstätte, Gebäude, Fahrzeug, Baustelle …)
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
// Leiter / Tritt — Inventar je Standort.
// photo_url (Base64-Referenzfoto) wird im Dashboard bewusst nie geladen.
// ---------------------------------------------------------------------------
export interface Ladder {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
  category: string;
  material: string;
  manufacturer: string | null;
  purchase_year: string | null;
  length_m: string | null;
  rung_count: string | null;
  notes: string | null;
  retired: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Prüfung — je Leiter, APPEND-ONLY (rechtliches Kernversprechen).
// photo_urls (Base64-Beweisfotos) nur im Detail/Bericht laden!
// ---------------------------------------------------------------------------
export interface Inspection {
  id: string;
  org_id: string;
  site_id: string;
  ladder_id: string;
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
// Mangel — Ampelverfahren (DGUV Information 208-016 sinngemäß), je Leiter,
// lebt bis zur Instandsetzung/Aussonderung (additiv).
// photo_urls/resolution_photo_urls nur für den Bericht!
// ---------------------------------------------------------------------------
export type DefectSeverity = 'green' | 'amber' | 'red';

export const SEVERITY_LABELS: Record<DefectSeverity, string> = {
  green: 'Grün — beobachten',
  amber: 'Orange — sperren & reparieren',
  red: 'Rot — aussondern',
};

/** Erklärung je Ampel-Stufe — wortgleich zur App, erscheint beim Erfassen eines Mangels „Vor Ort“. */
export const SEVERITY_HINTS: Record<DefectSeverity, string> = {
  green: 'Geringfügiger Mangel ohne Sicherheitsrisiko — kennzeichnen, beobachten, bei der nächsten Kontrolle erneut bewerten.',
  amber: 'Sicherheitsrelevanter Mangel — Leiter sofort der Benutzung entziehen und erst nach fachgerechter Instandsetzung (Originalteile) wieder freigeben.',
  red: 'Nicht reparabel (z. B. verbogener Alu-Holm) — Leiter unverzüglich und dauerhaft aussondern und unbrauchbar machen.',
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
  ladder_id: string;
  title: string;
  description: string | null;
  severity: DefectSeverity;
  ladder_blocked: boolean;
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
  DE: 'Grundlage: Prüfpflicht des Arbeitgebers (BetrSichV §§ 4, 14; ArbSchG) i. V. m. TRBS 2121-2 (Gefährdungen durch Absturz — Leitern), DGUV Information 208-016 (Handlungsanleitung für den Umgang mit Leitern und Tritten) und DIN EN 131 (Leitern).',
  AT: 'Grundlage: ArbeitnehmerInnenschutzgesetz (ASchG) und Arbeitsmittelverordnung (AM-VO) i. V. m. ÖNORM EN 131 sowie den AUVA-Empfehlungen zur sicheren Verwendung von Leitern und Tritten.',
  CH: 'Grundlage: Arbeitsmittel-Pflichten nach VUV (Art. 32b) und EKAS-Richtlinien i. V. m. SN EN 131 sowie den Empfehlungen der Suva zur sicheren Benutzung von Leitern und Tritten.',
};
