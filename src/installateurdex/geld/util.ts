// Kleine gemeinsame Helfer der Geld-Seiten (Eingabe-Umwandlung wie App InvoiceScreen/ArticlesScreen, Status-Abzeichen).

import type { StoredInvoice } from './api';
import { calendarDaysBetween, readQty } from './invoice';
import { parseEuro } from '../vertrag/vertragLogik';

/** Kalendertag „JJJJ-MM-TT“ in LOKALER Zeit (wie App lib/dates.ts localDay — nie toISOString). */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** „JJJJ-MM-TT“ → „TT.MM.JJJJ“ (reines Datum, keine Zeitzone) */
export const deDay = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
/** Zeitstempel → lokaler Tag „TT.MM.JJJJ“ */
export const deTs = (iso?: string) => (iso ? deDay(localDay(new Date(iso))) : '');

// wie App InvoiceScreen
export const centsText = (c: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
// Deutscher Tausenderpunkt: „1.500“ = 1.500 € (vorher 1,50 €), „1.500,50“ ging auf 0 — wie App (parseEuro)
export const toCents = (s: string) => parseEuro(s) ?? 0;
export const toQty = (s: string) => readQty(s) ?? 0; // gleicher Leser wie parseQty („1.500“ = 1500, „1.234,5“ = 1234,5)
export const qtyText = (n: number) => (n ? String(n).replace('.', ',') : '');

/** „Musterstraße 1, 7000 Eisenstadt“ → Straße / PLZ / Ort (wie App InvoiceScreen splitAddress) */
export function splitAddress(a: string): { street?: string; zip?: string; city?: string } {
  const m = a.trim().match(/^(.*?),\s*(\d{4,5})\s+(.+)$/);
  return m ? { street: m[1].trim(), zip: m[2], city: m[3].trim() } : { street: a.trim() || undefined };
}

export const isOverdue = (x: StoredInvoice, today = localDay()) => x.kind === 'invoice' && x.status === 'issued' && !!x.dueAt && x.dueAt < today;

/** Altersstufen offener Posten (Tage über dem Zahlungsziel) — Cockpit-Balken und Filter `?f=overdue&alter=…` der Liste */
export const AGE_BUCKETS = [
  { id: '0-30', label: '0–30 Tage', max: 30 },
  { id: '31-60', label: '31–60 Tage', max: 60 },
  { id: '61-90', label: '61–90 Tage', max: 90 },
  { id: '90+', label: 'über 90 Tage', max: Infinity },
] as const;
export type AgeId = (typeof AGE_BUCKETS)[number]['id'];
export const isAgeId = (v: string | null | undefined): v is AgeId => AGE_BUCKETS.some((b) => b.id === v);

/** Altersstufe einer überfälligen Rechnung; null = nicht überfällig */
export function ageOf(x: StoredInvoice, today = localDay()): AgeId | null {
  if (!isOverdue(x, today)) return null;
  const days = calendarDaysBetween(x.dueAt!, today);
  return AGE_BUCKETS.find((b) => days <= b.max)!.id;
}

export const kindLabel = (x: Pick<StoredInvoice, 'kind' | 'data'>) =>
  x.kind === 'quote' ? 'Angebot' : x.kind === 'credit' ? 'Stornorechnung' : x.data?.final && x.data.deductions?.length ? 'Schlussrechnung' : x.data?.partial ? 'Abschlagsrechnung' : 'Rechnung';

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
