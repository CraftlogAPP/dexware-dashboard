// Cockpit für den Inhaber — reine Rechenlogik (ohne React/Netz). Wiederverwendet statt neu erfunden:
//  - Umsatz: buildBookings aus geld/accountingExport.ts (Rechnungsausgangsbuch für den Steuerberater) — Stornorechnungen
//    negativ, Schlussrechnungen ziehen ihre Abschläge (und frei eingetragene Zahlungen) wieder ab, nichts doppelt.
//  - Offene Posten: openCents aus geld/api.ts (Schlussrechnung: nur der Rest nach Abzug).
//  - Wartungs-Vorschau: DueRow/counts aus portfolio.ts — dieselbe Quelle wie „Offenes Wartungspotenzial“ auf Start.
//  - Auslastung: netMinutes/sollUntilToday aus planung/zeitbuch.ts (Zeiten-Seite), Termine aus der Plantafel.
// Kalendertage immer LOKAL (nie toISOString().slice(0, 10)).

import { buildBookings, resolveAccounting } from '../geld/accountingExport';
import { openCents, type StoredInvoice } from '../geld/api';
import type { Land } from '../geld/invoice';
import { AGE_BUCKETS, ageOf, localDay, type AgeId } from '../geld/util';
import type { Appt, PlanMember, TimeEntry, TimeTarget } from '../planung/logic';
import { netMinutes, sollUntilToday, targetOf } from '../planung/zeitbuch';
import { counts, type DueRow } from '../portfolio';
import { addMonths, intervalOf } from '../types';

// ---------------------------------------------------------------------------
// Monate
// ---------------------------------------------------------------------------
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const two = (n: number) => String(n).padStart(2, '0');

export interface Month {
  /** „JJJJ-MM“ */
  key: string;
  /** „Nov“ (mit Jahr, wenn Januar oder erster Monat) */
  label: string;
  /** „November 2026“-artig für Vorlesen/Tooltip */
  long: string;
  start: Date;
}

const MON_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function monthAt(y: number, m: number, first: boolean): Month {
  const start = new Date(y, m, 1);
  const yy = start.getFullYear();
  const mm = start.getMonth();
  return {
    key: `${yy}-${two(mm + 1)}`,
    label: mm === 0 || first ? `${MON[mm]} ${String(yy).slice(2)}` : MON[mm],
    long: `${MON_LONG[mm]} ${yy}`,
    start,
  };
}

/** Die letzten n Monate bis einschließlich des laufenden (älteste zuerst). */
export function lastMonths(n: number, now = new Date()): Month[] {
  return Array.from({ length: n }, (_, i) => monthAt(now.getFullYear(), now.getMonth() - (n - 1) + i, i === 0));
}

/** Die nächsten n Monate ab dem laufenden (laufender zuerst). */
export function nextMonths(n: number, now = new Date()): Month[] {
  return Array.from({ length: n }, (_, i) => monthAt(now.getFullYear(), now.getMonth() + i, i === 0));
}

/** [von, bis) als JJJJ-MM-TT über eine Monatsreihe — für Abfragen nach Rechnungsdatum (Spalte date). */
export function monthsRange(months: Month[]): { from: string; to: string } {
  const last = months[months.length - 1].start;
  return { from: localDay(months[0].start), to: localDay(new Date(last.getFullYear(), last.getMonth() + 1, 1)) };
}

// ---------------------------------------------------------------------------
// 1. Umsatz je Monat (netto, nach Rechnungsdatum)
// ---------------------------------------------------------------------------
export interface RevenueMonth extends Month {
  /** bezahlte Rechnungen (netto, Cent) */
  paid: number;
  /** offene Rechnungen (netto, Cent) */
  open: number;
  /** Stornos: stornierte Rechnung + Stornorechnung (im selben Monat ≈ 0, sonst ±) */
  storno: number;
  /** Umsatz netto = paid + open + storno */
  net: number;
}

/**
 * Netto-Umsatz je Monat aus dem Rechnungsausgangsbuch (buildBookings): gleiche Regeln wie der Export für den
 * Steuerberater. Gestapelt nach Stand der Rechnung (bezahlt / offen); Stornos getrennt, damit nichts doppelt zählt.
 */
export function revenueByMonth(invoices: StoredInvoice[], months: Month[], land: Land): RevenueMonth[] {
  const { from, to } = monthsRange(months);
  const { bookings } = buildBookings(invoices, from, to, land, resolveAccounting(land));
  const byNumber = new Map(invoices.filter((x) => x.number).map((x) => [x.number!, x]));
  const out = new Map(months.map((m) => [m.key, { ...m, paid: 0, open: 0, storno: 0, net: 0 }]));
  for (const b of bookings) {
    const row = out.get(b.date.slice(0, 7)); // fehlermuster-ok: Rechnungsdatum ist schon ein Kalendertag (JJJJ-MM-TT)
    if (!row) continue;
    const net = b.grossCents - b.vatCents;
    const inv = byNumber.get(b.number);
    if (b.credit || inv?.status === 'canceled') row.storno += net;
    else if (inv?.status === 'paid') row.paid += net;
    else row.open += net;
    row.net += net;
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------
// 2. Wartungsumsatz-Vorschau (nächste 12 Monate)
// ---------------------------------------------------------------------------
export interface ForecastMonth extends Month {
  /** Summe der Preise (Euro) */
  sum: number;
  /** Wartungen mit Preis */
  count: number;
  /** davon jetzt schon überfällig (nur im laufenden Monat) */
  overdueSum: number;
  overdueCount: number;
  /** fällige Wartungen ohne Preis (zählen nicht in die Summe) */
  unpriced: number;
}

/**
 * Fällige Wartungen je Monat × Preis je Wartung (Vertragspreis vor Typpreis — DueRow.price wie das Wartungspotenzial).
 * Überfälliges zählt in den laufenden Monat; danach im Intervall der Anlage weiter (eine Anlage mit 6 Monaten taucht
 * zweimal auf). Nur Anlagen, die auch auf Start zählen (counts: aktiv, keine App-Beispieldaten).
 */
export function maintenanceForecast(rows: DueRow[], months: Month[], includeDemo = false, now = new Date()): ForecastMonth[] {
  const out = new Map(months.map((m) => [m.key, { ...m, sum: 0, count: 0, overdueSum: 0, overdueCount: 0, unpriced: 0 }]));
  const first = months[0].start;
  const lastM = months[months.length - 1].start;
  const end = new Date(lastM.getFullYear(), lastM.getMonth() + 1, 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const r of rows) {
    if (!counts(r, includeDemo) || !r.due.dueAt) continue;
    const step = intervalOf(r.asset);
    const overdue = r.due.dueAt < today;
    // überfällig → „jetzt“ (laufender Monat), die nächste dann ein Intervall nach heute
    let d = overdue ? today : r.due.dueAt;
    let firstHit = true;
    for (let guard = 0; d < end && guard < 60; guard++) {
      if (d >= first) {
        const row = out.get(`${d.getFullYear()}-${two(d.getMonth() + 1)}`);
        if (row) {
          if (r.price === undefined) row.unpriced += 1;
          else {
            row.sum += r.price;
            row.count += 1;
            if (overdue && firstHit) {
              row.overdueSum += r.price;
              row.overdueCount += 1;
            }
          }
        }
      }
      firstHit = false;
      d = addMonths(d, step);
    }
  }
  return [...out.values()].map((m) => ({ ...m, sum: Math.round(m.sum * 100) / 100, overdueSum: Math.round(m.overdueSum * 100) / 100 }));
}

// ---------------------------------------------------------------------------
// 3. Offene Posten nach Alter
// ---------------------------------------------------------------------------
export interface AgeBucket {
  /** wie der Filter der Rechnungsliste (`?f=overdue&alter=<id>`) */
  id: AgeId;
  label: string;
  cents: number;
  count: number;
}

export interface Aging {
  buckets: AgeBucket[];
  /** offen, aber noch nicht fällig (bzw. ohne Fälligkeitsdatum) */
  notDue: { cents: number; count: number };
  overdue: { cents: number; count: number };
  total: { cents: number; count: number };
}

/** Offene Rechnungen nach Tagen über dem Fälligkeitsdatum: 0–30, 31–60, 61–90, über 90 (Betrag = openCents, brutto). */
export function agingOf(list: StoredInvoice[], today = localDay()): Aging {
  // gleiche Stufen und Grenzen wie der Altersfilter der Rechnungsliste (geld/util.ts ageOf)
  const buckets: AgeBucket[] = AGE_BUCKETS.map((b) => ({ id: b.id, label: b.label, cents: 0, count: 0 }));
  const notDue = { cents: 0, count: 0 };
  for (const x of list) {
    if (x.kind !== 'invoice' || x.status !== 'issued') continue;
    const c = openCents(x);
    if (c <= 0) continue;
    const age = ageOf(x, today);
    if (!age) {
      notDue.cents += c;
      notDue.count += 1;
      continue;
    }
    const b = buckets.find((y) => y.id === age)!;
    b.cents += c;
    b.count += 1;
  }
  const overdue = { cents: buckets.reduce((s, b) => s + b.cents, 0), count: buckets.reduce((s, b) => s + b.count, 0) };
  return { buckets, notDue, overdue, total: { cents: overdue.cents + notDue.cents, count: overdue.count + notDue.count } };
}

// ---------------------------------------------------------------------------
// 4. Auslastung je Monteur
// ---------------------------------------------------------------------------
export interface Load {
  userId: string;
  name: string;
  color: string;
  /** Arbeitszeit laut Zeitbuch (Minuten, ohne Pausen) */
  ist: number;
  /** Sollzeit bis heute (Minuten); null = keine Sollzeit hinterlegt bzw. Tabelle fehlt */
  soll: number | null;
  /** auf der Plantafel verplant (Minuten, ohne abgesagte) */
  planned: number;
}

/**
 * Ist (Zeitbuch) gegen Soll (time_target, bis heute) und Verplant (Plantafel) im Zeitraum [from, to).
 * targets null = Tabelle fehlt → Soll bleibt leer. Termine werden auf den Zeitraum gekappt.
 */
export function loadByMember(
  team: PlanMember[],
  entries: TimeEntry[] | null,
  targets: TimeTarget[] | null,
  appts: Appt[] | null,
  range: { from: Date; to: Date },
  hol: Map<string, string>,
  now = new Date(),
): Load[] {
  const f = range.from.getTime();
  const t = range.to.getTime();
  return team.map((m) => {
    const mine = (entries ?? []).filter((e) => e.user_id === m.userId);
    const target = targets ? targetOf(targets.find((x) => x.user_id === m.userId)) : null;
    const planned = (appts ?? [])
      .filter((a) => a.assigned_to === m.userId && a.status !== 'canceled')
      .reduce((s, a) => s + Math.max(0, Math.min(Date.parse(a.ends_at), t) - Math.max(Date.parse(a.starts_at), f)) / 60_000, 0);
    return {
      userId: m.userId,
      name: m.name,
      color: m.color,
      ist: mine.reduce((s, e) => s + netMinutes(e, now), 0),
      soll: target ? sollUntilToday(target, range.from, range.to, mine, hol, now) : null,
      planned: Math.round(planned),
    };
  });
}

// ---------------------------------------------------------------------------
// Anzeige
// ---------------------------------------------------------------------------
/** Cent → „12.345 €“ (ganze Euro, Cent abgeschnitten — wie die Kacheln der Rechnungsliste, damit dort dieselbe Zahl steht) */
export const euroWhole = (cents: number) => `${Math.trunc(cents / 100).toLocaleString('de-DE')} €`;
/** Euro → „12.345 €“ */
export const euroOf = (e: number) => `${Math.round(e).toLocaleString('de-DE')} €`;
/** Cent → kurz für Achsen/Balken: „850“, „4,2k“, „18k“ (Euro) */
export function compactEuro(cents: number): string {
  const e = Math.round(cents / 100);
  if (Math.abs(e) < 1000) return `${e}`;
  const k = e / 1000;
  return `${(Math.abs(k) >= 10 ? Math.round(k) : Math.round(k * 10) / 10).toLocaleString('de-DE')}k`;
}
/** Minuten → „38,5 h“ */
export const hours = (min: number) => `${(Math.round((min / 60) * 10) / 10).toLocaleString('de-DE')} h`;

/** „schöne“ Obergrenze für eine Achse (1, 2, 2,5, 5 × 10^n) und 4 Teilstriche */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}
