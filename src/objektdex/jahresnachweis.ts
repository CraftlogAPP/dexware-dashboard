// ObjektDex — Ganzjahres-Nachweis je Objekt: Winterdienst aus WinterDex + Objektbetreuung aus ObjektDex in EINEM PDF
// für den Auftraggeber (Plan dexware-suite/docs/ganzjahr-2026-11-24.md, Nachtrag 24.11.: Alleinstellung der Ganzjahres-Brücke).
// Reine Logik ohne React und ohne Server — tests/jahresnachweis.test.mjs lädt die Datei direkt.
//
// Regeln:
//  - Kalendertage sind Texte „JJJJ-MM-TT“ in Wiener Zeit (Europe/Vienna; gleiche Regeln wie Europe/Berlin). Nie
//    toISOString().slice(0, 10) für Tage (Suite-Regel 05.11.). Grenzen für Abfragen: [Von 00:00, Tag nach Bis 00:00).
//  - Zeitraum: letzte 12 Monate (bis heute), Kalenderjahr (laufendes bis heute, Vorjahr ganz) oder frei, höchstens 400 Tage
//    (wie das Nachweis-PDF von ObjektDex) und nicht in der Zukunft (sonst zählte das Soll Tage, die noch kommen).
//  - Passendes WinterDex-Objekt: gleiche Adresse (PLZ/Ort dürfen auf einer Seite fehlen, „Straße“ = „Str.“), ohne Adresse
//    gleicher Name — wie die Übernahme (uebernahme.ts findeVorhandenes). Bei mehreren: aktiv + gleicher Name zuerst.
//  - Soll/Ist-Quote: erledigte fällige Termine / fällige Termine fester Leistungen; ein Mehr an Einsätzen gleicht keine
//    Lücke bei einer anderen Leistung aus. „Nach Bedarf“ hat kein Soll und zählt nicht mit. 100 % nur, wenn wirklich alles
//    erledigt ist (keine Rundung nach oben auf „alles“).
import { cmpKey } from '../lib/tableImport';
import type { Org } from '../lib/orgApi';
import { sameAddress } from '../winterdex/importObjects';
import type { OperationWithPhotos } from '../winterdex/types';
import { addDays, addMonths, daysBetween, formatDay, type Day } from './turnus';

export const ZEITZONE = 'Europe/Vienna';
/** Längster Zeitraum in Tagen (wie das Nachweis-PDF von ObjektDex) */
export const MAX_TAGE = 400;

// ---------------------------------------------------------------------------- Tage und Grenzen

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function teileFmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}
function teile(ms: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const p = teileFmt(tz).formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute'), s: g('second') };
}
const pad = (n: number) => String(n).padStart(2, '0');

/** Kalendertag eines Zeitpunkts in der Zeitzone (Standard Wien). */
export function tagIn(date: Date, tz = ZEITZONE): Day {
  const t = teile(date.getTime(), tz);
  return `${t.y}-${pad(t.mo)}-${pad(t.d)}`;
}

/** Heute in Wien */
export function heute(now: Date = new Date()): Day {
  return tagIn(now, ZEITZONE);
}

/** Abstand Zone ↔ UTC in Minuten zu einem Zeitpunkt (Wien: Winterzeit 60, Sommerzeit 120). */
function abstandMin(ms: number, tz: string): number {
  const t = teile(ms, tz);
  return Math.round((Date.UTC(t.y, t.mo - 1, t.d, t.h, t.mi, t.s) - Math.floor(ms / 1000) * 1000) / 60000);
}

/** Mitternacht (Beginn) eines Kalendertags in der Zone als ISO-Zeitpunkt — für Filter auf timestamptz. */
export function mitternachtIso(day: Day, tz = ZEITZONE): string {
  const [y, m, d] = day.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  let ms = utc - abstandMin(utc, tz) * 60000;
  // Der Abstand gilt am gesuchten Zeitpunkt, nicht um 00:00 UTC — einmal nachrechnen (Umstellungstage)
  const zweit = abstandMin(ms, tz);
  ms = utc - zweit * 60000;
  return new Date(ms).toISOString();
}

/** Abfrage-Grenzen eines Zeitraums: ab Von 00:00 (einschließlich) bis zum Tag nach Bis 00:00 (ausschließlich). */
export function zeitraumGrenzen(z: { from: Day; to: Day }, tz = ZEITZONE): { abIso: string; bisVorIso: string } {
  return { abIso: mitternachtIso(z.from, tz), bisVorIso: mitternachtIso(addDays(z.to, 1), tz) };
}

// ---------------------------------------------------------------------------- Zeitraum

export type ZeitraumArt = 'zwoelf' | 'jahr' | 'vorjahr' | 'frei';

export interface Zeitraum {
  from: Day;
  to: Day;
  /** für Deckblatt und Dateiname, z. B. „25.11.2025 – 24.11.2026“ */
  label: string;
}

const spanne = (from: Day, to: Day) => `${formatDay(from)} – ${formatDay(to)}`;

/** Gültiger Kalendertag „JJJJ-MM-TT“ (auch 29.02. nur im Schaltjahr) */
export function istTag(s: string): s is Day {
  if (!TAG.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Erster Tag von „letzte 12 Monate“ bis heute: heute vor 12 Monaten + 1 Tag (Monatsende gekappt: 29.02. → 28.02. + 1). */
export function zwoelfMonateAb(heuteTag: Day): Day {
  return addDays(addMonths(heuteTag, -12), 1);
}

/**
 * Zeitraum aus der Vorauswahl. „jahr“ = laufendes Kalenderjahr bis heute, „vorjahr“ = ganzes Vorjahr,
 * „frei“ = Von/Bis aus den Datumsfeldern (JJJJ-MM-TT). Fehler als verständlicher Satz.
 */
export function zeitraum(art: ZeitraumArt, heuteTag: Day, frei?: { von: string; bis: string }): Zeitraum | { fehler: string } {
  const jahr = Number(heuteTag.slice(0, 4));
  if (art === 'zwoelf') {
    const from = zwoelfMonateAb(heuteTag);
    return { from, to: heuteTag, label: spanne(from, heuteTag) };
  }
  if (art === 'jahr') {
    const from = `${jahr}-01-01`;
    return { from, to: heuteTag, label: `${jahr} bis ${formatDay(heuteTag)} (${spanne(from, heuteTag)})` };
  }
  if (art === 'vorjahr') {
    const from = `${jahr - 1}-01-01`;
    const to = `${jahr - 1}-12-31`;
    return { from, to, label: `Kalenderjahr ${jahr - 1} (${spanne(from, to)})` };
  }
  const von = (frei?.von ?? '').trim();
  const bis = (frei?.bis ?? '').trim();
  if (!istTag(von) || !istTag(bis)) return { fehler: 'Bitte Von und Bis als Datum wählen.' };
  if (von > bis) return { fehler: '„Von“ liegt nach „Bis“ — bitte den Zeitraum prüfen.' };
  if (bis > heuteTag) return { fehler: `„Bis“ liegt in der Zukunft — bitte höchstens bis heute (${formatDay(heuteTag)}) wählen.` };
  if (daysBetween(von, bis) + 1 > MAX_TAGE) return { fehler: `Höchstens ${MAX_TAGE} Tage auf einmal — bitte den Zeitraum kürzen.` };
  return { from: von, to: bis, label: spanne(von, bis) };
}

// ---------------------------------------------------------------------------- WinterDex-Objekt zum ObjektDex-Objekt

export interface WdObjektKurz {
  id: string;
  name: string;
  address: string | null;
  customer_name: string | null;
  active: boolean;
}

/**
 * Passendes WinterDex-Objekt zu einem ObjektDex-Objekt: gleiche Adresse (PLZ/Ort dürfen auf einer Seite fehlen;
 * andere Hausnummer = anderes Objekt), ohne Adresse gleicher Name. Bei mehreren Treffern zuerst aktiv mit gleichem
 * Namen, dann aktiv, dann gleicher Name. null = keins gefunden (Nutzer wählt selbst oder „kein Winterdienst“).
 */
export function passendesWinterdexObjekt<T extends Pick<WdObjektKurz, 'name' | 'address' | 'active'>>(
  od: { name: string; address: string | null },
  wd: readonly T[],
): T | null {
  const ak = cmpKey(od.address ?? '');
  const nk = cmpKey(od.name ?? '');
  const treffer = ak
    ? wd.filter((w) => {
        const wk = cmpKey(w.address ?? '');
        return !!wk && sameAddress(ak, wk);
      })
    : nk
      ? wd.filter((w) => cmpKey(w.name ?? '') === nk)
      : [];
  if (!treffer.length) return null;
  const gleicherName = (w: T) => !!nk && cmpKey(w.name ?? '') === nk;
  return treffer.find((w) => w.active && gleicherName(w)) ?? treffer.find((w) => w.active) ?? treffer.find(gleicherName) ?? treffer[0];
}

// ---------------------------------------------------------------------------- Was die Seite aus WinterDex liest

/**
 * Winterdienst-Quelle: echt über die WinterDex-Sitzung im selben Browser (RLS, nur lesen), in den Beispieldaten aus demo.ts.
 * `einsaetze` liefert die Einsätze eines Objekts im Zeitraum [abIso, bisVorIso) aufsteigend; ohne Fotos (fotos=false)
 * sind photo_urls leer und photo_total nennt die gespeicherte Zahl.
 */
export interface WdNachweisQuelle {
  betrieb: Org | null;
  /** Rolle im WinterDex-Betrieb */
  rolle: string | null;
  email: string;
  objekte: WdObjektKurz[];
  /** WinterDex Pro des Betriebs (Server; unklar = Pro, wie das WinterDex-PDF) */
  pro(): Promise<boolean>;
  einsaetze(objektId: string, abIso: string, bisVorIso: string, fotos: boolean): Promise<OperationWithPhotos[]>;
}

// ---------------------------------------------------------------------------- Kennzahlen fürs Deckblatt

export interface WdEinsatzKurz {
  canceled: boolean;
  nachgetragen?: boolean | null;
  lat: number | null;
  end_lat?: number | null;
}
export interface OdEinsatzKurz {
  canceled: boolean;
  services: readonly unknown[];
}
export interface SollIstKurz {
  soll: number | null;
  ist: number;
}
export interface MangelKurz {
  status: 'open' | 'done';
}

export interface Kennzahlen {
  /** null = Winterdienst nicht im Nachweis */
  winter: { einsaetze: number; storniert: number; nachgetragen: number; ohneGps: number } | null;
  objekt: {
    einsaetze: number;
    storniert: number;
    /** abgehakte Leistungen in gültigen Einsätzen */
    leistungen: number;
    /** fällige Termine fester Leistungen im Zeitraum */
    termine: number;
    /** davon erledigt (je Leistung höchstens ihr Soll) */
    erledigt: number;
    /** Einsätze „nach Bedarf“ (ohne Soll) */
    nachBedarf: number;
    maengel: number;
    offeneMaengel: number;
  };
}

export function kennzahlen(x: {
  wdOps: readonly WdEinsatzKurz[] | null;
  odOps: readonly OdEinsatzKurz[];
  sollIst: readonly SollIstKurz[];
  maengel: readonly MangelKurz[];
}): Kennzahlen {
  const wGueltig = x.wdOps?.filter((o) => !o.canceled) ?? [];
  const oGueltig = x.odOps.filter((o) => !o.canceled);
  let termine = 0;
  let erledigt = 0;
  let nachBedarf = 0;
  for (const r of x.sollIst) {
    if (r.soll == null) nachBedarf += Math.max(0, r.ist);
    else if (r.soll > 0) {
      termine += r.soll;
      erledigt += Math.min(Math.max(0, r.ist), r.soll);
    }
  }
  return {
    winter: x.wdOps
      ? {
          einsaetze: wGueltig.length,
          storniert: x.wdOps.length - wGueltig.length,
          nachgetragen: wGueltig.filter((o) => o.nachgetragen).length,
          ohneGps: wGueltig.filter((o) => o.lat == null && o.end_lat == null).length,
        }
      : null,
    objekt: {
      einsaetze: oGueltig.length,
      storniert: x.odOps.length - oGueltig.length,
      leistungen: oGueltig.reduce((n, o) => n + o.services.length, 0),
      termine,
      erledigt,
      nachBedarf,
      maengel: x.maengel.length,
      offeneMaengel: x.maengel.filter((m) => m.status === 'open').length,
    },
  };
}

/** Soll/Ist-Quote als Text: „92 %“; 100 % nur bei allem erledigt, über 0 nie „0 %“; ohne feste Termine „—“. */
export function quoteText(k: { termine: number; erledigt: number }): string {
  if (k.termine <= 0) return '—';
  let p = Math.round((k.erledigt / k.termine) * 100);
  if (p >= 100 && k.erledigt < k.termine) p = 99;
  if (p <= 0 && k.erledigt > 0) p = 1;
  return `${p} %`;
}

/** Zahl mit Einheit, deutsch: „1 Einsatz“, „12 Einsätze“ */
export function anzahl(n: number, eins: string, mehr: string): string {
  return `${n.toLocaleString('de-DE')} ${n === 1 ? eins : mehr}`;
}
