// ObjektDex — Übernahme aus WinterDex (Stufe 1, Plan dexware-suite/docs/ganzjahr-2026-11-24.md 5.6) und „Leistungen für
// mehrere Objekte auf einmal“ (Plan Punkt 5). Reine Logik ohne React und ohne Server — tests/ganzjahr-uebernahme.test.mjs.
//
// Regeln:
//  - Gelesen wird mit der WinterDex-Sitzung (RLS), geschrieben mit der ObjektDex-Sitzung (RLS). Keine Server-Schlüssel.
//  - Spalten wie Tabelle 5.6: name/address/lat/lng/customer_name/customer_contact/notes 1:1, areas → notes („Flächen: …“),
//    duty_times entfällt, Saison-Pause (active=false) ist nur ein Hinweis in der Auswahl — angelegt wird immer aktiv.
//  - Gleiche Adresse schon in ObjektDex (ohne Adresse: gleicher Name) = „schon in ObjektDex“: nicht angehakt, bewusst
//    anhakbar. Strecken: gleicher Name = schon da.
//  - route.property_ids werden auf die ObjektDex-ids umgeschlüsselt (neu angelegt oder schon vorhanden); was es in
//    ObjektDex nicht gibt, fällt aus der Liste.
//  - Gratis-Grenze wie die App (ObjektDex/mobile/src/lib/entitlement.ts FREE_LIMITS): 2 AKTIVE Objekte, Runden (Strecken)
//    nur mit Pro. Der Server prüft das nicht — deshalb hält die Übernahme es selbst ein. Pro-Auskunft unklar = Gratis-Grenze
//    (bei einer Massen-Anlage lieber später noch einmal als zu viel).
//  - Mitglieder, Einsätze, Fotos bleiben in WinterDex (Konten lassen sich nicht übertragen → Team-Code teilen).

import { cmpKey } from '../lib/tableImport';
import { OBJEKTDEX_PLAY_LINK } from '../lib/ganzjahr';
import { sameAddress } from '../winterdex/importObjects';
import type { Cadence, Day } from './turnus';
import { gratisRahmen } from './grenze';

// Gratis-Grenze wie die App — eigenes kleines Modul (auch für Formular und „Wieder aktivieren“)
export { GRATIS_OBJEKTE, GRATIS_STRECKEN, gratisRahmen, objektGrenzeText } from './grenze';

// ---------------------------------------------------------------------------- Eingangsdaten

export type Land = 'DE' | 'AT' | 'CH';

export interface WdBetrieb {
  name: string;
  land: Land;
  address: string | null;
}

/** WinterDex-Objekt (Spalten aus WinterDex/supabase/schema.sql) */
export interface WdObjekt {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  customer_name: string | null;
  customer_contact: string | null;
  areas: string | null;
  notes: string | null;
  active: boolean;
}

/** WinterDex-Strecke (WinterDex/supabase/strecken.sql — spaltengleich mit ObjektDex.route) */
export interface WdStrecke {
  id: string;
  name: string;
  notes: string | null;
  path: unknown;
  length_m: number | null;
  source: string;
  property_ids: unknown;
  active: boolean;
}

/** Was die Übernahme aus WinterDex liest (mit der WinterDex-Sitzung) */
export interface WdQuelle {
  betrieb: WdBetrieb | null;
  /** Rolle im WinterDex-Betrieb ('owner' = Inhaber) */
  rolle: string | null;
  email: string;
  objekte: WdObjekt[];
  strecken: WdStrecke[];
  /** WinterDex-Datenbank ohne Strecken-Tabelle (älterer Stand) */
  ohneStrecken?: boolean;
}

export interface OdObjektKurz {
  id: string;
  name: string;
  address: string;
  active: boolean;
}
export interface OdStreckeKurz {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------- Zeilen für ObjektDex (ohne org_id — setzt data.ts)

export interface OdObjektNeu {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  customer_name: string | null;
  customer_contact: string | null;
  contact_person: string | null;
  notes: string | null;
}

export interface OdStreckeNeu {
  id: string;
  name: string;
  notes: string | null;
  /** [[lat,lng],…] — Länge rechnet der Server (route_bi) */
  path: [number, number][];
  source: 'recorded' | 'objects';
  property_ids: string[];
}

export interface OdLeistungNeu {
  id: string;
  property_id: string;
  name: string;
  template_key: string | null;
  cadence: Cadence;
  weekdays: number[];
  month_day: number | null;
  start_on: Day;
  sort: number;
  notes: string | null;
}

// ---------------------------------------------------------------------------- Werte

const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s);
const orNull = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/** Notiz in ObjektDex: „Flächen: …“ (WinterDex-Spalte areas, ObjektDex hat keine) und darunter die bisherige Notiz. */
export function notizMitFlaechen(notes: string | null | undefined, areas: string | null | undefined): string | null {
  const a = oneLine(areas ?? '');
  const n = (notes ?? '').trim();
  const out = [a ? `Flächen: ${a}` : '', n].filter(Boolean).join('\n');
  return out ? cap(out, 2000) : null;
}

/** Gültige Koordinate (beide oder keine) */
export function koordinaten(lat: unknown, lng: unknown): { lat: number | null; lng: number | null } {
  const ok = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
  return ok(lat, 90) && ok(lng, 180) && !(lat === 0 && lng === 0) ? { lat, lng } : { lat: null, lng: null };
}

/** Objektname in ObjektDex: 1–160 Zeichen (Prüfung in ObjektDex/supabase/schema.sql); leer → Straße aus der Adresse */
export function objektName(name: string, address: string): string {
  const n = cap(oneLine(name), 160);
  if (n) return n;
  return cap(oneLine(address.split(',')[0] ?? ''), 160) || 'Objekt';
}

/** Betrieb vorbelegen (create_org_with_owner(p_name, p_land, p_address)) — der Nutzer bestätigt bzw. ändert. */
export function betriebVorbelegung(b: WdBetrieb | null): { name: string; land: Land; address: string } {
  const land: Land = b?.land === 'AT' || b?.land === 'CH' ? b.land : 'DE';
  return { name: cap(oneLine(b?.name ?? ''), 120), land, address: oneLine(b?.address ?? '') };
}

/** Fertiger Text zum Teilen des ObjektDex-Team-Codes (Plan 5.6 Schritt 4) */
export function teamText(code: string): string {
  return `Wir belegen ab jetzt auch Grünpflege und Reinigung mit ObjektDex. App: ${OBJEKTDEX_PLAY_LINK} – Team-Code: ${code} (in der App unter „Ich habe einen Team-Code“ eintippen)`;
}

// ---------------------------------------------------------------------------- Abgleich

/** Gibt es das WinterDex-Objekt in ObjektDex schon? Gleiche Adresse (PLZ/Ort dürfen auf einer Seite fehlen), ohne Adresse gleicher Name. */
export function findeVorhandenes<T extends Pick<OdObjektKurz, 'name' | 'address' | 'active'>>(w: Pick<WdObjekt, 'name' | 'address'>, od: readonly T[]): T | null {
  const ak = cmpKey(w.address ?? '');
  const treffer = ak
    ? od.filter((p) => {
        const pk = cmpKey(p.address ?? '');
        return !!pk && sameAddress(ak, pk);
      })
    : od.filter((p) => cmpKey(p.name) === cmpKey(w.name) && !!cmpKey(w.name));
  return treffer.find((p) => p.active) ?? treffer[0] ?? null;
}

export type UebStatus = 'neu' | 'vorhanden';

export interface ObjektPlanZeile {
  w: WdObjekt;
  status: UebStatus;
  /** gleiches Objekt in ObjektDex */
  odId: string | null;
  odName: string | null;
}

export interface StreckenPlanZeile {
  w: WdStrecke;
  status: UebStatus;
  /** Objekte der Strecke (WinterDex) */
  objekte: number;
}

export interface UebPlan {
  objekte: ObjektPlanZeile[];
  strecken: StreckenPlanZeile[];
}

const nameKey = (s: string) => cmpKey(s ?? '');
const byText = (a: string, b: string) => a.localeCompare(b, 'de', { sensitivity: 'base', numeric: true });

/** Ids aus property_ids (jsonb) — nur Texte, ohne Doppelte, Reihenfolge bleibt */
export function idListe(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === 'string' && x && !out.includes(x)) out.push(x);
  return out;
}

/** Pfad aus WinterDex (jsonb [[lat,lng],…]) — nur gültige Punkte */
export function pfad(v: unknown): [number, number][] {
  if (!Array.isArray(v)) return [];
  const out: [number, number][] = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const [lat, lng] = [Number(p[0]), Number(p[1])];
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) out.push([lat, lng]);
  }
  return out;
}

/** Auswahlliste: aktive zuerst, dann nach Name. Standard-Häkchen: alle „neu“ (auch pausierte — im März ist vieles pausiert). */
export function planUebernahme(args: { objekte: readonly WdObjekt[]; strecken: readonly WdStrecke[]; od: readonly OdObjektKurz[]; odStrecken: readonly OdStreckeKurz[] }): UebPlan {
  const objekte = [...args.objekte]
    .sort((a, b) => Number(b.active) - Number(a.active) || byText(a.name, b.name))
    .map((w): ObjektPlanZeile => {
      const hit = findeVorhandenes(w, args.od);
      return { w, status: hit ? 'vorhanden' : 'neu', odId: hit?.id ?? null, odName: hit?.name ?? null };
    });
  const odNamen = new Set(args.odStrecken.map((r) => nameKey(r.name)));
  const strecken = [...args.strecken]
    .sort((a, b) => Number(b.active) - Number(a.active) || byText(a.name, b.name))
    .map((w): StreckenPlanZeile => ({ w, status: odNamen.has(nameKey(w.name)) ? 'vorhanden' : 'neu', objekte: idListe(w.property_ids).length }));
  return { objekte, strecken };
}

/** Standard-Auswahl: alle neuen Objekte; Strecken nur, wenn welche angelegt werden dürfen. */
export function standardAuswahl(plan: UebPlan, streckenErlaubt: boolean): { objekte: Set<string>; strecken: Set<string> } {
  return {
    objekte: new Set(plan.objekte.filter((z) => z.status === 'neu').map((z) => z.w.id)),
    strecken: new Set(streckenErlaubt ? plan.strecken.filter((z) => z.status === 'neu').map((z) => z.w.id) : []),
  };
}

// ---------------------------------------------------------------------------- Auftrag (beim Klick, gegen frische Daten)

export interface UebAuftrag {
  objekte: { w: WdObjekt; zeile: OdObjektNeu }[];
  /** WinterDex-Objekt-id → ObjektDex-id (neu angelegt oder schon vorhanden) */
  zuordnung: Map<string, string>;
  strecken: WdStrecke[];
  /** angehakt, aber inzwischen schon in ObjektDex (anderer Tab, zweiter Klick) — nicht noch einmal angelegt */
  inzwischenDa: number;
  streckenInzwischenDa: number;
  /** angehakt, aber über der Gratis-Grenze */
  ueberGrenze: number;
  streckenUeberGrenze: number;
}

/**
 * Was beim Klick wirklich angelegt wird — gegen die FRISCH geladenen ObjektDex-Daten und die frische Pro-Auskunft:
 * angehakte Objekte in Listen-Reihenfolge, ohne inzwischen Vorhandenes (bewusst angehakte „schon in ObjektDex“ bleiben),
 * höchstens bis zur Gratis-Grenze; Strecken genauso (ohne Pro keine).
 */
export function uebernahmeAuftrag(args: {
  plan: UebPlan;
  objekte: ReadonlySet<string>;
  strecken: ReadonlySet<string>;
  od: readonly OdObjektKurz[];
  odStrecken: readonly OdStreckeKurz[];
  pro: boolean | null;
  neueId: () => string;
}): UebAuftrag {
  const rahmen = gratisRahmen(args.pro, args.od.filter((p) => p.active).length);
  const zuordnung = new Map<string, string>();
  // Erst alles zuordnen, was es in ObjektDex schon gibt (auch nicht angehakte — Strecken verweisen darauf)
  for (const z of args.plan.objekte) {
    const hit = findeVorhandenes(z.w, args.od);
    if (hit) zuordnung.set(z.w.id, hit.id);
  }
  let inzwischenDa = 0;
  const gewollt: ObjektPlanZeile[] = [];
  for (const z of args.plan.objekte) {
    if (!args.objekte.has(z.w.id)) continue;
    if (z.status === 'neu' && zuordnung.has(z.w.id)) {
      inzwischenDa++;
      continue;
    }
    gewollt.push(z);
  }
  const anlegen = rahmen.objekte === null ? gewollt : gewollt.slice(0, rahmen.objekte);
  const objekte = anlegen.map((z) => {
    const id = args.neueId();
    zuordnung.set(z.w.id, id);
    const { lat, lng } = koordinaten(z.w.lat, z.w.lng);
    const zeile: OdObjektNeu = {
      id,
      name: objektName(z.w.name, z.w.address ?? ''),
      address: cap(oneLine(z.w.address ?? ''), 240),
      lat,
      lng,
      customer_name: orNull(cap(oneLine(z.w.customer_name ?? ''), 160)),
      customer_contact: orNull(cap(oneLine(z.w.customer_contact ?? ''), 200)),
      contact_person: null,
      notes: notizMitFlaechen(z.w.notes, z.w.areas),
    };
    return { w: z.w, zeile };
  });

  const odNamen = new Set(args.odStrecken.map((r) => nameKey(r.name)));
  let streckenInzwischenDa = 0;
  const streckenGewollt: WdStrecke[] = [];
  for (const z of args.plan.strecken) {
    if (!args.strecken.has(z.w.id)) continue;
    if (z.status === 'neu' && odNamen.has(nameKey(z.w.name))) {
      streckenInzwischenDa++;
      continue;
    }
    streckenGewollt.push(z.w);
  }
  const strecken = rahmen.strecken === null ? streckenGewollt : streckenGewollt.slice(0, rahmen.strecken);
  return {
    objekte,
    zuordnung,
    strecken,
    inzwischenDa,
    streckenInzwischenDa,
    ueberGrenze: gewollt.length - anlegen.length,
    streckenUeberGrenze: streckenGewollt.length - strecken.length,
  };
}

/**
 * Strecke für ObjektDex: property_ids auf die ObjektDex-ids umschlüsseln. `vorhanden` = ObjektDex-ids, die es nach dem
 * Anlegen wirklich gibt (fehlgeschlagene Objekte fallen heraus).
 */
export function streckenZeile(w: WdStrecke, id: string, zuordnung: ReadonlyMap<string, string>, vorhanden: ReadonlySet<string>): OdStreckeNeu {
  const ids: string[] = [];
  for (const wid of idListe(w.property_ids)) {
    const oid = zuordnung.get(wid);
    if (oid && vorhanden.has(oid) && !ids.includes(oid)) ids.push(oid);
  }
  return {
    id,
    name: cap(oneLine(w.name), 120) || 'Strecke',
    notes: orNull(w.notes),
    path: pfad(w.path),
    source: w.source === 'objects' ? 'objects' : 'recorded',
    property_ids: ids,
  };
}

// ---------------------------------------------------------------------------- Leistungen für mehrere Objekte

/** Gewählte Vorlage mit Turnus (Turnus-Modell aus ObjektDex/supabase/schema.sql: service.cadence/weekdays/month_day) */
export interface VorlageWahl {
  key: string | null;
  name: string;
  cadence: Cadence;
  weekdays: number[];
  monthDay: number | null;
}

/** Fehler im Turnus (wie die Prüfung service_cadence_ok am Server) — null = in Ordnung */
export function vorlageFehler(v: VorlageWahl): string | null {
  if (!v.name.trim()) return 'Bitte einen Namen eingeben.';
  if (v.name.trim().length > 80) return `„${v.name.trim().slice(0, 30)}…“ ist zu lang (höchstens 80 Zeichen).`;
  if ((v.cadence === 'weekly' || v.cadence === 'biweekly') && !v.weekdays.some((d) => d >= 1 && d <= 7)) return `${v.name}: bitte mindestens einen Wochentag wählen.`;
  if (v.cadence === 'monthly' && !(v.monthDay && v.monthDay >= 1 && v.monthDay <= 31)) return `${v.name}: Monatstag bitte zwischen 1 und 31.`;
  return null;
}

export interface OdLeistungKurz {
  property_id: string;
  name: string;
  template_key: string | null;
  active: boolean;
}

/** Vorlagen, die je Objekt mehrfach vorkommen dürfen (wie die Chips im Formular „Leistung anlegen“) */
const MEHRFACH = new Set(['other', 'special']);

/** Gibt es diese Leistung am Objekt schon (laufend)? Gleiche Vorlage oder gleicher Name. */
export function leistungVorhanden(v: Pick<VorlageWahl, 'key' | 'name'>, objektId: string, vorhandene: readonly OdLeistungKurz[]): boolean {
  const n = cmpKey(v.name);
  return vorhandene.some(
    (s) => s.active && s.property_id === objektId && ((!!v.key && !MEHRFACH.has(v.key) && s.template_key === v.key) || cmpKey(s.name) === n),
  );
}

/** Leistungen für alle gewählten Objekte — Doppelte (am Objekt schon laufend) werden übersprungen. */
export function planLeistungen(args: {
  objektIds: readonly string[];
  vorlagen: readonly VorlageWahl[];
  vorhandene: readonly OdLeistungKurz[];
  startOn: Day;
  neueId: () => string;
}): { zeilen: OdLeistungNeu[]; doppelt: number } {
  const zeilen: OdLeistungNeu[] = [];
  let doppelt = 0;
  for (const pid of args.objektIds) {
    for (const v of args.vorlagen) {
      if (leistungVorhanden(v, pid, args.vorhandene)) {
        doppelt++;
        continue;
      }
      const woche = v.cadence === 'weekly' || v.cadence === 'biweekly';
      zeilen.push({
        id: args.neueId(),
        property_id: pid,
        name: v.name.trim(),
        template_key: v.key,
        cadence: v.cadence,
        weekdays: woche ? [...new Set(v.weekdays.filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b) : [],
        month_day: v.cadence === 'monthly' ? v.monthDay : null,
        start_on: args.startOn,
        sort: 0,
        notes: null,
      });
    }
  }
  return { zeilen, doppelt };
}
