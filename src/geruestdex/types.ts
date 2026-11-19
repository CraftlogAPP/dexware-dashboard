// Domain-Typen des GerüstDex-Supabase-Schemas (Spiegel von mobile/src/types.ts,
// aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.
// Rechtsgrundlage: BetrSichV §§ 3, 14 (Arbeitgeber-Prüfpflicht) + TRBS 2121-1
// (Gefährdung durch Absturz — Gerüste) + DGUV Information 201-011 (Arbeiten
// auf Gerüsten); Ausführung nach DIN EN 12811-1. Zwei Prüfarten:
// Inaugenscheinnahme durch den Nutzer (arbeitstäglich) + Prüfung durch eine
// zur Prüfung befähigte Person (nach Montage/Änderung/Sturm, bei Standzeit
// regelmäßig wiederholt).

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Prüfarten nach TRBS 2121-1 Abschnitt 5
// ---------------------------------------------------------------------------
export type InspectionType = 'visual' | 'expert';

export const INSPECTION_LABELS: Record<InspectionType, string> = {
  visual: 'Inaugenscheinnahme (Nutzer)',
  expert: 'Prüfung durch befähigte Person',
};

export const INSPECTION_SHORT: Record<InspectionType, string> = {
  visual: 'Inaugenscheinnahme',
  expert: 'Befähigte Person',
};

/** Erklärung je Prüfart — wortgleich zur App (mobile/src/types.ts), erscheint beim Erfassen „Vor Ort“. */
export const INSPECTION_HINTS: Record<InspectionType, string> = {
  visual: 'Sicht- und Funktionskontrolle durch den Gerüstnutzer vor jeder Verwendung — arbeitstäglich, dokumentiert.',
  expert: 'Prüfung durch eine zur Prüfung befähigte Person — nach der Montage, nach wesentlichen Änderungen und nach außergewöhnlichen Ereignissen (z. B. Sturm, starker Frost). Bei längerer Standzeit regelmäßig wiederholen.',
};

/** Empfohlenes Intervall in Tagen je Prüfart (Fälligkeits-Anzeige, wie die App). */
export const INSPECTION_INTERVAL_DAYS: Record<InspectionType, number> = {
  visual: 1,
  expert: 30,
};

// ---------------------------------------------------------------------------
// Checkliste der Gerüstprüfung (TRBS 2121-1 / DGUV Information 201-011) —
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
  { id: 'marking', label: 'Kennzeichnung / Freigabe', hint: 'Gerüstkennzeichnung am Zugang vorhanden und lesbar: Last- und Breitenklasse, Ersteller, Datum der Prüfung?' },
  { id: 'foundation', label: 'Gründung / Fußspindeln', hint: 'Fußplatten und Spindeln vollflächig auf tragfähigem Untergrund (lastverteilende Unterlagen)? Spindeln nicht überdreht, keine Provisorien?' },
  { id: 'anchors', label: 'Verankerung', hint: 'Alle Anker nach Montageanweisung/Verankerungsraster gesetzt, fest und unbeschädigt? Keine entfernten Anker (z. B. durch andere Gewerke)?' },
  { id: 'decks', label: 'Beläge', hint: 'Belagflächen vollständig, dicht verlegt, unbeschädigt und gegen Abheben gesichert? Keine Wippen oder klaffenden Spalte?' },
  { id: 'side_protection', label: 'Seitenschutz (3-teilig)', hint: 'Geländerholm, Zwischenholm und Bordbrett auf ALLEN Belagebenen vollständig und fest?' },
  { id: 'access', label: 'Aufstiege / Zugänge', hint: 'Innenliegende Leitergänge bzw. Treppentürme vorhanden, unbeschädigt, Durchstiegsklappen geschlossen?' },
  { id: 'bracing', label: 'Diagonalen / Aussteifung', hint: 'Verbände vollständig nach Aufbau- und Verwendungsanleitung, unbeschädigt und fest verbunden?' },
  { id: 'wall_distance', label: 'Wandabstand', hint: 'Abstand Belag–Fassade max. 30 cm — sonst innenliegender Seitenschutz erforderlich?' },
  { id: 'corners', label: 'Ecken / Überbrückungen', hint: 'Eckausbildung durchgehend mit Belag und Seitenschutz? Überbrückungen (Gitterträger) nach Anleitung eingebaut?' },
  { id: 'modifications', label: 'Keine eigenmächtigen Änderungen', hint: 'Keine entfernten Bauteile, keine nachträglichen Öffnungen, keine unzulässigen Anbauten (Werbebanner = Windlast!)?' },
  { id: 'electrical', label: 'Elektrische Leitungen / Anlagen', hint: 'Schutzabstände zu Freileitungen eingehalten oder Leitungen abgeschaltet/abgedeckt? Keine beschädigten Baustromleitungen am Gerüst?' },
  { id: 'environment', label: 'Umgebung / Schutz Dritter', hint: 'Schutz gegen herabfallende Gegenstände (Schutzdach, Netz/Plane), Absperrung, Beleuchtung an Verkehrswegen?' },
];

// ---------------------------------------------------------------------------
// Gerüstbauarten und Klassen (Inventar-Stammdaten, EN 12811-1)
// ---------------------------------------------------------------------------
export const SCAFFOLD_CATEGORIES = [
  'Fassadengerüst',
  'Fahrgerüst (Rollgerüst)',
  'Raumgerüst',
  'Schutzgerüst / Fanggerüst',
  'Dachfanggerüst',
  'Hängegerüst',
  'Traggerüst',
  'Bockgerüst',
  'Sonstiges',
] as const;

/** Lastklassen nach EN 12811-1 (gleichmäßig verteilte Last der Belagfläche). */
export const LOAD_CLASSES = [
  '1 (0,75 kN/m²)',
  '2 (1,50 kN/m²)',
  '3 (2,00 kN/m²)',
  '4 (3,00 kN/m²)',
  '5 (4,50 kN/m²)',
  '6 (6,00 kN/m²)',
] as const;

/** Breitenklassen nach EN 12811-1 (lichte Belagbreite). */
export const WIDTH_CLASSES = ['W06', 'W09', 'W12', 'W15', 'W18', 'W21', 'W24'] as const;

// ---------------------------------------------------------------------------
// Baustelle (Objekt/Standort)
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
// Gerüst — Inventar je Baustelle.
// photo_url (Base64-Referenzfoto) wird im Dashboard bewusst nie geladen.
// ---------------------------------------------------------------------------
export interface Scaffold {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  erected_by: string | null;
  erected_at: string | null;
  load_class: string | null;
  width_class: string | null;
  notes: string | null;
  retired: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Prüfung — je BAUSTELLE (nicht je Gerüst!), APPEND-ONLY (Kernversprechen).
// photo_urls (Base64-Beweisfotos) nur im Detail/Bericht laden!
// ---------------------------------------------------------------------------
export interface Inspection {
  id: string;
  org_id: string;
  site_id: string;
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
// Mangel — Ampelverfahren (angelehnt an DGUV Information 201-011), je Baustelle
// mit optionalem Gerüst-Bezug, lebt bis zur Beseitigung (additiv).
// photo_urls/resolution_photo_urls nur für den Bericht!
// ---------------------------------------------------------------------------
export type DamageSeverity = 'green' | 'amber' | 'red';

export const SEVERITY_LABELS: Record<DamageSeverity, string> = {
  green: 'Grün — beobachten',
  amber: 'Orange — Bereich sperren',
  red: 'Rot — Gerüst sperren',
};

/** Erklärung je Einstufung — wortgleich zur App, erscheint beim Erfassen „Vor Ort“. */
export const SEVERITY_HINTS: Record<DamageSeverity, string> = {
  green: 'Geringfügiger Mangel ohne unmittelbare Absturzgefahr — kennzeichnen, beobachten, bei der nächsten Prüfung erneut bewerten.',
  amber: 'Sicherheitsrelevanter Mangel — betroffenen Gerüstbereich (Ebene/Feld) absperren und nicht benutzen, bis der Mangel beseitigt ist.',
  red: 'Schwerwiegender Mangel (z. B. fehlende Verankerung, mangelhafte Gründung) — Gerüst SOFORT komplett sperren („Zutritt verboten"), Ersteller informieren, erst nach erneuter Prüfung freigeben!',
};

export const SEVERITY_SHORT: Record<DamageSeverity, string> = {
  green: 'Grün',
  amber: 'Orange',
  red: 'Rot',
};

export type DamageStatus = 'open' | 'resolved';

export interface Damage {
  id: string;
  org_id: string;
  site_id: string;
  inspection_id: string | null;
  scaffold_id: string | null;
  title: string;
  description: string | null;
  severity: DamageSeverity;
  scaffold_blocked: boolean;
  status: DamageStatus;
  reported_by: string | null;
  reporter_name: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolver_name: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface DamageWithPhotos extends Damage {
  photo_urls: string[];
  resolution_photo_urls: string[];
}

// Rechtsgrundlage je Land — erscheint im Berichtskopf (wie mobile pdf/report.ts).
export const LEGAL_BASIS: Record<Org['land'], string> = {
  DE: 'Grundlage: Prüfpflicht des Arbeitgebers (BetrSichV §§ 3, 14; ArbSchG) i. V. m. TRBS 2121-1 (Gefährdung durch Absturz — Gerüste) und DGUV Information 201-011 (Arbeiten auf Gerüsten); Ausführung nach DIN EN 12811-1.',
  AT: 'Grundlage: ArbeitnehmerInnenschutzgesetz (ASchG) und Bauarbeiterschutzverordnung (BauV, §§ 55–62 Gerüste; Prüfung nach § 61) i. V. m. ÖNORM EN 12811-1.',
  CH: 'Grundlage: Bauarbeitenverordnung (BauAV, Kapitel Gerüste) und VUV i. V. m. SN EN 12811-1 sowie den Suva-Regeln für Gerüstarbeiten.',
};
