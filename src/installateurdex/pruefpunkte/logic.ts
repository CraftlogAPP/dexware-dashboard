// Eigene Prüfpunkte & Messwerte des Betriebs (org.checklists) — 1:1 wie die App:
//   mobile/src/lib/customChecks.ts (cleanChecks, Grenzen, Größe) und mobile/src/types.ts (checklistFor, KIND_CHECKS,
//   Hinweistexte, measuresFor mit eigenen Feldern). Werte und Reihenfolgen MÜSSEN mit der App übereinstimmen.
//
// Aufbau: {"service": {"gas": {"add": ["CO-Melder geprüft"], "hide": ["siphon"], "fields": [{"label": "Kesselwasser pH"}]},
//                      "*":   {"add": ["Arbeitsplatz sauber hinterlassen"]}}}
// Im Einsatz stehen eigene Punkte als „c:<Text>“, eigene Messwerte als „m:<Bezeichnung>|<Einheit>“.
//
// Kein Datenverlust: mergeChecks() schreibt nur die Teile zurück, die das Portal kennt. Unbekannte Einsatzarten,
// Anlagentypen, Felder und Standard-IDs (z. B. aus einer neueren App-Version) bleiben erhalten.

import { ITEM_KINDS, JOB_TYPES, checkLabel, jobInfo, kindInfo, measuresFor, type InspectionType, type ItemKind, type MeasureField } from '../types';

export interface CheckCustom {
  add?: string[];
  hide?: string[];
  /** eigene Messwert-Felder (mit Einheit = Zahl, ohne = Text) */
  fields?: { label: string; unit?: string }[];
}
export type CustomChecks = Partial<Record<InspectionType, Record<string, CheckCustom>>>;

export const ALL = '*';
/** Einsatzarten mit Checkliste (Wartung, Inbetriebnahme). */
export const CHECK_TYPES: InspectionType[] = JOB_TYPES.filter((j) => j.checklist).map((j) => j.id);
const KINDS = new Set<string>([ALL, ...ITEM_KINDS.map((k) => k.id)]);
export const MAX_LABEL = 60;
export const MAX_OWN = 20;
export const MAX_FIELD_LABEL = 40;
export const MAX_UNIT = 12;
export const MAX_FIELDS = 10;
/** Die App prüft vor dem Speichern mit 40 000 Bytes JSON (Datenbank-Grenze 64 000, pflichtangaben.sql). */
export const MAX_CHECKS_BYTES = 40_000;
/** Vorschläge für „Alle Anlagen“ — allgemein, ohne Rechtsbehauptung (wie App CustomChecksScreen). */
export const SUGGEST_ALL = ['Arbeitsplatz sauber hinterlassen', 'Kunde über das Ergebnis informiert', 'Nächsten Wartungstermin besprochen'];

// Hinweistexte der Standard-Punkte (App types.ts C[…].hint) — für die Vorschau „so sieht es der Monteur“.
const HINTS: Record<string, string> = {
  visual: 'Gehäuse, Leitungen und Anschlüsse ohne Schäden, Korrosion oder Undichtheiten?',
  errors: 'Fehler- und Störmeldungen ausgelesen, bewertet und gelöscht?',
  settings: 'Heizkurve, Zeitprogramme, Warmwasser- und Sollwerte passend zum Kunden eingestellt?',
  expansion: 'Vordruck geprüft und an den Anlagendruck angepasst?',
  safety: 'Sicherheitsventil angelüftet, schließt wieder dicht, Abblaseleitung frei?',
  strainer: 'Schmutzfänger bzw. Magnetitabscheider gereinigt?',
  hydraulic: 'Heizkreis, Speicheranschlüsse und Armaturen dicht, Pumpen laufen ruhig?',
  electric: 'Klemmen fest, Kabel unbeschädigt, Schutzleiter angeschlossen?',
  function: 'Heizen, Kühlen bzw. Warmwasser im Betrieb geprüft?',
  evaporator: 'Außengerät frei von Laub und Schmutz, Lamellen sauber und nicht verbogen?',
  condensate: 'Kondensatablauf frei, Begleitheizung (falls vorhanden) funktioniert, kein Eisaufbau?',
  fan: 'Ventilator läuft frei, keine ungewöhnlichen Geräusche oder Vibrationen?',
  circuit: 'Keine Ölspuren an Verbindungen, Isolierung intakt? (Eingriffe nur mit Kältemittel-Zertifikat)',
  indoorFilter: 'Luftfilter gereinigt bzw. getauscht?',
  coilClean: 'Verdampfer im Innengerät gereinigt und desinfiziert, Walzenlüfter sauber?',
  condenserClean: 'Verflüssiger gereinigt, Luftweg frei?',
  lines: 'Kältemittelleitungen befestigt, Isolierung ohne UV-Schäden?',
  brine: 'Soledruck und Frostschutz geprüft, Solekreis dicht?',
  burner: 'Brenner und Wärmetauscher gereinigt, Elektroden eingestellt?',
  siphon: 'Kondensat-Siphon gereinigt und befüllt?',
  ignition: 'Zündung und Ionisation bzw. Flammfühler funktionieren?',
  flue: 'Abgasleitung dicht und frei, Verbrennungsluftzufuhr gesichert?',
  gasTight: 'Gasführende Teile mit Lecksuchmittel bzw. Messgerät auf Dichtheit geprüft?',
  fluegasMeasure: 'Abgasmessung durchgeführt, Werte bei den Messwerten eingetragen?',
  ash: 'Brennraum, Asche und Wärmetauscher gereinigt, Fördersystem geprüft?',
  anode: 'Magnesiumanode geprüft bzw. Fremdstromanode funktionsfähig?',
  descale: 'Speicher bzw. Wärmetauscher bei Bedarf entkalkt?',
  legionella: 'Thermische Desinfektion eingestellt und geprüft?',
  salt: 'Salz nachgefüllt, Regeneration ausgelöst?',
  resin: 'Steuerung, Uhrzeit und Regeneration geprüft?',
  backwash: 'Filter rückgespült, Siebeinsatz in Ordnung?',
  pump: 'Pumpe läuft, Schaltpunkte und Druck passen?',
  alarm: 'Alarmgeber und Rückstausicherung funktionieren?',
  ventFilter: 'Zu- und Abluftfilter getauscht?',
  ventDucts: 'Luftventile sauber, Kanäle ohne sichtbare Verschmutzung?',
  collector: 'Kollektoren und Befestigung ohne Schäden?',
  plan: 'Anlage nach Hydraulik- und Elektroplan des Herstellers installiert?',
  flushed: 'Anlage gespült, mit aufbereitetem Wasser befüllt und entlüftet?',
  params: 'Heizkurve, Warmwasser, Betriebsarten und Uhrzeit eingestellt?',
  instructed: 'Bedienung, Betreiberpflichten und Wartungsintervall erklärt?',
  docsHanded: 'Bedienungsanleitung, Protokoll und Garantieunterlagen übergeben?',
  warranty: 'Inbetriebnahme beim Hersteller registriert bzw. Herstellerformular ausgefüllt (Garantie)? Foto davon anhängen.',
  utility: 'Anmeldung beim Netzbetreiber bzw. Unterlagen für die Förderung erledigt (falls nötig)?',
};
/** Alle Standard-Punkt-IDs (zum Bereinigen von „hide“) — wie App STANDARD_CHECK_IDS. */
export const STANDARD_CHECK_IDS: ReadonlySet<string> = new Set(Object.keys(HINTS));

// App types.ts KIND_CHECKS — Reihenfolge der Standard-Checkliste je Anlagentyp
const KIND_CHECKS: Record<ItemKind, string[]> = {
  hp_air: ['visual', 'evaporator', 'condensate', 'fan', 'circuit', 'hydraulic', 'strainer', 'expansion', 'safety', 'errors', 'settings', 'function'],
  hp_brine: ['visual', 'brine', 'circuit', 'hydraulic', 'strainer', 'expansion', 'safety', 'errors', 'settings', 'function'],
  ac_split: ['visual', 'indoorFilter', 'coilClean', 'condensate', 'condenserClean', 'lines', 'circuit', 'electric', 'function'],
  ac_multi: ['visual', 'indoorFilter', 'coilClean', 'condensate', 'condenserClean', 'lines', 'circuit', 'electric', 'errors', 'function'],
  gas: ['visual', 'burner', 'siphon', 'ignition', 'flue', 'gasTight', 'fluegasMeasure', 'expansion', 'safety', 'errors', 'function'],
  oil: ['visual', 'burner', 'ignition', 'flue', 'fluegasMeasure', 'expansion', 'safety', 'function'],
  pellet: ['visual', 'ash', 'ignition', 'flue', 'fluegasMeasure', 'expansion', 'safety', 'function'],
  district: ['visual', 'hydraulic', 'strainer', 'safety', 'settings', 'function'],
  dhw_tank: ['visual', 'anode', 'descale', 'legionella', 'safety'],
  solar: ['visual', 'collector', 'hydraulic', 'safety', 'function'],
  ventilation: ['ventFilter', 'ventDucts', 'condensate', 'fan', 'function'],
  softener: ['salt', 'resin', 'visual'],
  filter: ['backwash', 'visual'],
  booster: ['pump', 'expansion', 'visual'],
  lifting: ['pump', 'alarm', 'visual'],
  other: ['visual', 'function'],
};

export interface ChecklistItem {
  id: string;
  label: string;
  hint: string;
  own?: boolean;
}

/** Checkliste für Anlagentyp + Einsatzart, optional mit den Punkten des Betriebs — wie App checklistFor(). */
export function checklistFor(kind: string | undefined, type: InspectionType = 'service', custom?: CustomChecks): ChecklistItem[] {
  if (!jobInfo(type).checklist) return [];
  const k = kindInfo(kind).id;
  const base = KIND_CHECKS[k];
  const ids =
    type === 'commissioning'
      ? [
          'plan',
          'flushed',
          ...base.filter((id) => ['circuit', 'electric', 'gasTight', 'fluegasMeasure', 'condensate', 'expansion', 'safety'].includes(id)),
          'params',
          'function',
          'instructed',
          'docsHanded',
          'warranty',
          'utility',
        ]
      : base;
  const std = ids.map((id) => ({ id, label: checkLabel(id), hint: HINTS[id] ?? '' }));
  const cfg = custom?.[type];
  if (!cfg) return std;
  const hide = new Set(cfg[k]?.hide ?? []);
  const seen = new Set<string>();
  const own: ChecklistItem[] = [];
  // erst die Punkte für diesen Anlagentyp, dann die für alle Anlagen
  for (const label of [...(cfg[k]?.add ?? []), ...(cfg[ALL]?.add ?? [])]) {
    const id = `c:${label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    own.push({ id, label, hint: '', own: true });
  }
  return [...std.filter((c) => !hide.has(c.id)), ...own];
}

/** Messwert-Felder für Einsatzart + Anlagentyp mit den eigenen Feldern des Betriebs am Ende — wie App measuresFor(). */
export function measuresWithCustom(type: InspectionType, kind: string | undefined, custom?: CustomChecks): (MeasureField & { own?: boolean })[] {
  const std = measuresFor(type, kind);
  if (!jobInfo(type).measurements) return std;
  const cfg = custom?.[type];
  if (!cfg) return std;
  const k = kindInfo(kind).id;
  const seen = new Set<string>();
  const own: (MeasureField & { own?: boolean })[] = [];
  for (const f of [...(cfg[k]?.fields ?? []), ...(cfg[ALL]?.fields ?? [])]) {
    const id = `m:${f.label}${f.unit ? `|${f.unit}` : ''}`;
    if (seen.has(id)) continue;
    seen.add(id);
    own.push({ id, label: f.label, unit: f.unit ?? '', text: !f.unit, own: true });
  }
  return [...std, ...own];
}

/** Text eines Prüfpunkts säubern: Steuerzeichen raus, Leerraum zusammenfassen, Länge begrenzen (App cleanLabel). */
export function cleanLabel(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL)
    .trim();
}

/** Bezeichnung/Einheit eines eigenen Messwerts: wie cleanLabel, ohne „|“ (Trenner in der ID) — App cleanFieldPart. */
export function cleanFieldPart(s: unknown, max: number): string {
  return cleanLabel(typeof s === 'string' ? s.replace(/\|/g, '/') : s).slice(0, max).trim();
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const lower = (s: string) => s.toLocaleLowerCase('de');

/** Nur bekannte Einsatzarten/Anlagentypen, bekannte Standard-Punkte, saubere Texte ohne Doppelte — App cleanChecks. */
export function cleanChecks(x: unknown): CustomChecks {
  const out: CustomChecks = {};
  if (!isObj(x)) return out;
  for (const [type, byKind] of Object.entries(x)) {
    if (!CHECK_TYPES.includes(type as InspectionType) || !isObj(byKind)) continue;
    const t: Record<string, CheckCustom> = {};
    for (const [kind, raw] of Object.entries(byKind)) {
      if (!KINDS.has(kind) || !raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const seen = new Set<string>();
      const add: string[] = [];
      for (const l of Array.isArray(r.add) ? r.add : []) {
        const label = cleanLabel(l);
        const key = lower(label);
        if (label.length < 2 || seen.has(key)) continue;
        seen.add(key);
        add.push(label);
        if (add.length >= MAX_OWN) break;
      }
      const fseen = new Set<string>();
      const fields: { label: string; unit?: string }[] = [];
      for (const f of Array.isArray(r.fields) ? r.fields : []) {
        if (!f || typeof f !== 'object') continue;
        const label = cleanFieldPart((f as { label?: unknown }).label, MAX_FIELD_LABEL);
        const unit = cleanFieldPart((f as { unit?: unknown }).unit, MAX_UNIT);
        const key = lower(label);
        if (label.length < 2 || fseen.has(key)) continue;
        fseen.add(key);
        fields.push(unit ? { label, unit } : { label });
        if (fields.length >= MAX_FIELDS) break;
      }
      const hide =
        kind === ALL
          ? []
          : [...new Set((Array.isArray(r.hide) ? r.hide : []).filter((h): h is string => typeof h === 'string' && STANDARD_CHECK_IDS.has(h)))];
      const c: CheckCustom = {};
      if (add.length) c.add = add;
      if (hide.length) c.hide = hide;
      if (fields.length) c.fields = fields;
      if (c.add || c.hide || c.fields) t[kind] = c;
    }
    if (Object.keys(t).length) out[type as InspectionType] = t;
  }
  return out;
}

/**
 * Bearbeiteten Stand in den gespeicherten jsonb-Wert einarbeiten, ohne Unbekanntes zu verlieren:
 * - unbekannte Einsatzarten, Anlagentypen und Schlüssel bleiben unverändert
 * - „hide“: unbekannte IDs (Standard-Punkte einer neueren App-Version) bleiben stehen
 * - „add“: Einträge, die kein Text sind (neueres Format), bleiben am Ende stehen
 * - „fields“: Zusatzangaben eines Feldes (z. B. Bereich) bleiben am Feld, solange die Bezeichnung gleich bleibt
 */
export function mergeChecks(raw: unknown, edited: CustomChecks): Record<string, unknown> {
  const out: Record<string, unknown> = isObj(raw) ? structuredClone(raw) : {};
  const clean = cleanChecks(edited);
  for (const type of CHECK_TYPES) {
    const rawT = out[type];
    const e = clean[type] ?? {};
    if (!isObj(rawT) && !Object.keys(e).length) continue; // nichts zu tun, Fremdes (falls da) bleibt
    const t: Record<string, unknown> = isObj(rawT) ? rawT : {};
    for (const kind of KINDS) {
      const rk = t[kind];
      const ek = e[kind] ?? {};
      if (!isObj(rk) && !ek.add && !ek.hide && !ek.fields) continue;
      const k: Record<string, unknown> = isObj(rk) ? { ...rk } : {};

      const extraAdd = Array.isArray(k.add) ? k.add.filter((l) => typeof l !== 'string') : [];
      const add = [...(ek.add ?? []), ...extraAdd];
      if (add.length) k.add = add;
      else delete k.add;

      if (kind === ALL) {
        // „Alle Anlagen“ hat keine Standard-Punkte — ein vorhandenes hide (Fremdformat) bleibt unberührt
      } else {
        const extraHide = Array.isArray(k.hide) ? k.hide.filter((h) => typeof h !== 'string' || !STANDARD_CHECK_IDS.has(h)) : [];
        const hide = [...(ek.hide ?? []), ...extraHide];
        if (hide.length) k.hide = hide;
        else delete k.hide;
      }

      const rawFields = Array.isArray(k.fields) ? k.fields.filter(isObj) : [];
      const fields = (ek.fields ?? []).map((f) => {
        const before = rawFields.find((r) => typeof r.label === 'string' && lower(cleanFieldPart(r.label, MAX_FIELD_LABEL)) === lower(f.label));
        const merged: Record<string, unknown> = { ...(before ?? {}), label: f.label };
        if (f.unit) merged.unit = f.unit;
        else delete merged.unit;
        return merged;
      });
      if (fields.length) k.fields = fields;
      else delete k.fields;

      if (Object.keys(k).length) t[kind] = k;
      else delete t[kind];
    }
    if (Object.keys(t).length) out[type] = t;
    else delete out[type];
  }
  return out;
}

/** Größe wie gespeichert (UTF-8-Bytes des JSON) — wie App checksSize, hier aber vom tatsächlich gesendeten Wert. */
export function jsonBytes(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v)).length;
}

/** Anzahl eigener + ausgeblendeter Punkte und eigener Messwerte (App countCustom). */
export function countCustom(c: CustomChecks, type?: InspectionType): { own: number; hidden: number; fields: number } {
  let own = 0;
  let hidden = 0;
  let fields = 0;
  for (const t of type ? [type] : CHECK_TYPES) {
    for (const v of Object.values(c[t] ?? {})) {
      own += v.add?.length ?? 0;
      hidden += v.hide?.length ?? 0;
      fields += v.fields?.length ?? 0;
    }
  }
  return { own, hidden, fields };
}

/** JSON mit sortierten Objekt-Schlüsseln (Listen behalten ihre Reihenfolge) — jsonb in Postgres ordnet Schlüssel um. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObj(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Gleicher Inhalt? Unabhängig von der Reihenfolge der Einsatzarten/Anlagentypen (Reihenfolge der Punkte zählt). */
export function sameChecks(a: CustomChecks, b: CustomChecks): boolean {
  return canonical(cleanChecks(a)) === canonical(cleanChecks(b));
}
