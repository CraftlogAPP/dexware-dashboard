// Domain-Typen des ToreDex-Supabase-Schemas (Spiegel von mobile/src/types.ts,
// aber in DB-Schreibweise snake_case). Org/Role/Member leben in src/lib/orgApi.ts.
// Rechtsgrundlage: BetrSichV (Arbeitsmittel-Prüfpflicht) + ASR A1.7 („Türen und
// Tore": kraftbetätigte Tore mind. jährlich durch einen Sachkundigen prüfen)
// + DGUV Information 208-022 + Produktnormen EN 13241 / EN 12453 / EN 12604.

import type { Org } from '../lib/orgApi';

// ---------------------------------------------------------------------------
// Prüfarten nach ASR A1.7 / DGUV Information 208-022 / BetrSichV
// ---------------------------------------------------------------------------
export type InspectionType = 'visual' | 'expert';

export const INSPECTION_LABELS: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle',
  expert: 'Sachkundigen-Prüfung (ASR A1.7)',
};

export const INSPECTION_SHORT: Record<InspectionType, string> = {
  visual: 'Sichtkontrolle',
  expert: 'Sachkundigen-Prüfung',
};

/** Erklärung je Prüfart — wortgleich zur App (mobile/src/types.ts), erscheint beim Erfassen „Vor Ort“. */
export const INSPECTION_HINTS: Record<InspectionType, string> = {
  visual: 'Sicht- und Funktionskontrolle durch den Betreiber bzw. eine beauftragte Person: Torlauf, Schließkanten, Lichtschranke, Notentriegelung, äußerer Zustand — dokumentiert empfohlen z. B. monatlich.',
  expert: 'Prüfung durch einen Sachkundigen (zur Prüfung befähigte Person) nach ASR A1.7 / DGUV Information 208-022 — kraftbetätigte Tore mindestens jährlich, außerdem vor der ersten Inbetriebnahme und nach wesentlichen Änderungen. ToreDex dokumentiert Termin und Ergebnis.',
};

/** Empfohlenes Intervall in Tagen je Prüfart (Fälligkeits-Anzeige). */
export const INSPECTION_INTERVAL_DAYS: Record<InspectionType, number> = {
  visual: 30,
  expert: 365,
};

/**
 * Sachkundigen-Intervall je Land (wie in der Mobile-App): im gesamten
 * DACH-Raum ist die jährliche Prüfung kraftbetätigter Tore der Maßstab
 * (DE: ASR A1.7 / DGUV I 208-022, AT: AStV/AM-VO, CH: VUV/EKAS-Praxis).
 */
export function expertIntervalDays(_land: string | null | undefined): number {
  return 365;
}

// ---------------------------------------------------------------------------
// Checkliste der Torprüfung (ASR A1.7 / DGUV I 208-022 / EN 12453 orientiert) —
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
  { id: 'marking', label: 'Kennzeichnung & Typenschild', hint: 'Typenschild lesbar (Hersteller, Baujahr, CE-Kennzeichnung)? Warnhinweise und ggf. Prüfplakette vorhanden?' },
  { id: 'closing_edge', label: 'Schließkantensicherung', hint: 'Kontaktleiste an der Hauptschließkante vorhanden und wirksam? Tor reversiert bzw. stoppt bei Berührung? Gummiprofil unbeschädigt?' },
  { id: 'photocell', label: 'Lichtschranke / Lichtgitter', hint: 'Absicherung des Torbereichs wirksam? Unterbrechen des Strahls stoppt/reversiert das Tor? Optiken sauber und ausgerichtet?' },
  { id: 'force_limit', label: 'Kraftbegrenzung des Antriebs', hint: 'Betriebskräfte begrenzt (EN 12453)? Tor reversiert bei Hindernis im Torlauf? Keine manipulierten Einstellungen?' },
  { id: 'fall_protection', label: 'Absturzsicherung / Fangvorrichtung', hint: 'Bei vertikal bewegten Toren: Fangvorrichtung bzw. Federbruchsicherung vorhanden und funktionsfähig? Torblatt gegen Absturz gesichert?' },
  { id: 'springs_cables', label: 'Federn, Seile & Ketten', hint: 'Torsions-/Zugfedern ohne Bruch und stark verschlissene Stellen? Drahtseile ohne gebrochene Litzen, richtig aufgetrommelt? Kettenspannung in Ordnung?' },
  { id: 'guides_rollers', label: 'Führungsschienen & Laufrollen', hint: 'Schienen fest, unverformt, sauber? Laufrollen ohne starkes Spiel oder Verschleiß? Torblatt läuft ohne Verkanten?' },
  { id: 'emergency_release', label: 'Notentriegelung / Handbetrieb', hint: 'Notentriegelung zugänglich, gekennzeichnet und funktionsfähig? Tor von Hand mit vertretbarem Kraftaufwand zu bewegen (z. B. bei Stromausfall)?' },
  { id: 'crush_shear', label: 'Quetsch- & Scherstellen', hint: 'Sicherheitsabstände zu festen Bauteilen eingehalten oder Stellen gesichert/verdeckt? Keine neuen Gefahrstellen durch Umbauten oder Anbauten?' },
  { id: 'wicket_door', label: 'Schlupftür', hint: 'Falls vorhanden: Schlupftürkontakt wirksam (Torlauf nur bei geschlossener Schlupftür)? Türschließer und Bänder in Ordnung, Schwelle gekennzeichnet?' },
  { id: 'electrical', label: 'Elektrische Ausrüstung', hint: 'Leitungen unbeschädigt, Steuerung/Endschalter funktionsfähig, Befehlsgeräte (Taster, Funk, Schlüsselschalter) in Ordnung? Not-Halt wirksam, Gehäuse geschlossen?' },
  { id: 'body_function', label: 'Torblatt & Funktionslauf', hint: 'Torblatt/Beschläge ohne Verformung, Risse, starke Korrosion? Kompletter Öffnungs- und Schließlauf ohne ungewöhnliche Geräusche, Endlagen werden sauber erreicht?' },
];

// ---------------------------------------------------------------------------
// Torarten und Antriebsarten (Inventar-Stammdaten)
// ---------------------------------------------------------------------------
export const GATE_CATEGORIES = [
  'Sectionaltor',
  'Rolltor / Rollgitter',
  'Schiebetor',
  'Drehflügeltor',
  'Falttor',
  'Kipptor',
  'Schnelllauftor',
  'Schranke',
  'Karusselltür / Automatiktür',
  'Sonstige',
] as const;

export const GATE_DRIVE_TYPES = [
  'Kraftbetätigt',
  'Handbetätigt',
  'Unbekannt',
] as const;

// ---------------------------------------------------------------------------
// Objekt (Betriebsstätte, Gebäude, Halle, Tiefgarage …)
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
// Tor / Tür — Inventar je Objekt.
// photo_url (Base64-Referenzfoto) wird im Dashboard bewusst nie geladen.
// ---------------------------------------------------------------------------
export interface Gate {
  id: string;
  org_id: string;
  site_id: string;
  name: string;
  category: string;
  drive_type: string;
  manufacturer: string | null;
  build_year: string | null;
  dimensions: string | null;
  serial_no: string | null;
  notes: string | null;
  retired: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Prüfung — je Tor, APPEND-ONLY (rechtliches Kernversprechen).
// photo_urls (Base64-Beweisfotos) nur im Detail/Bericht laden!
// ---------------------------------------------------------------------------
export interface Inspection {
  id: string;
  org_id: string;
  site_id: string;
  gate_id: string;
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
// Mangel — Ampelverfahren (Betreiberpflichten BetrSichV/ASR A1.7 sinngemäß),
// je Tor, lebt bis zur Instandsetzung/Stilllegung (additiv).
// photo_urls/resolution_photo_urls nur für den Bericht!
// ---------------------------------------------------------------------------
export type DefectSeverity = 'green' | 'amber' | 'red';

export const SEVERITY_LABELS: Record<DefectSeverity, string> = {
  green: 'Grün — beobachten',
  amber: 'Orange — zeitnah instand setzen',
  red: 'Rot — Tor stilllegen & sichern',
};

/** Erklärung je Ampel-Stufe — wortgleich zur App, erscheint beim Erfassen eines Mangels „Vor Ort“. */
export const SEVERITY_HINTS: Record<DefectSeverity, string> = {
  green: 'Geringfügiger Mangel ohne Einfluss auf die Sicherheit (z. B. Kennzeichnung, Optik) — vermerken, beheben, bei der nächsten Kontrolle erneut bewerten.',
  amber: 'Sicherheit oder Funktion beeinträchtigt — Fachbetrieb zeitnah mit der Instandsetzung beauftragen; bis dahin Betrieb nur, wenn keine unmittelbare Gefahr besteht (z. B. nur Handbetrieb, Bereich freihalten).',
  red: 'Unmittelbare Gefahr (z. B. Schließkantensicherung/Fangvorrichtung unwirksam, Federbruch) — Tor sofort stilllegen, gegen Benutzung sichern (Kennzeichnung, ggf. Absperrung) und erst nach Instandsetzung und erneuter Prüfung wieder freigeben.',
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
  gate_id: string;
  title: string;
  description: string | null;
  severity: DefectSeverity;
  gate_blocked: boolean;
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
  DE: 'Grundlage: BetrSichV (Prüfpflicht für Arbeitsmittel) i. V. m. ASR A1.7 „Türen und Tore" und DGUV Information 208-022 — kraftbetätigte Tore mindestens jährlich durch einen Sachkundigen prüfen, außerdem vor der ersten Inbetriebnahme und nach wesentlichen Änderungen (Sicherheitsanforderungen: EN 12453 / EN 13241).',
  AT: 'Grundlage: ArbeitnehmerInnenschutzgesetz (ASchG) und Arbeitsstättenverordnung (AStV) i. V. m. Arbeitsmittelverordnung (AM-VO) — wiederkehrende Prüfung kraftbetätigter Tore und Türen mindestens jährlich nach Herstellerangaben und Stand der Technik (EN 12453).',
  CH: 'Grundlage: Verordnung über die Unfallverhütung (VUV) — Instandhaltungs- und Prüfpflichten für Arbeitsmittel — i. V. m. EKAS-Richtlinien und Hersteller-Vorgaben (periodische Prüfung kraftbetätigter Tore, üblich jährlich; EN 12453).',
};
