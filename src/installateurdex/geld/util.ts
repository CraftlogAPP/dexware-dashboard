// Kleine gemeinsame Helfer der Geld-Seiten (Eingabe-Umwandlung wie App InvoiceScreen/ArticlesScreen, Status-Abzeichen).

import type { StoredInvoice } from './api';

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
export const toCents = (s: string) => {
  const n = Number(s.replace(/[^0-9,.-]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};
export const toQty = (s: string) => {
  const n = Number(s.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
export const qtyText = (n: number) => (n ? String(n).replace('.', ',') : '');

/** „Musterstraße 1, 7000 Eisenstadt“ → Straße / PLZ / Ort (wie App InvoiceScreen splitAddress) */
export function splitAddress(a: string): { street?: string; zip?: string; city?: string } {
  const m = a.trim().match(/^(.*?),\s*(\d{4,5})\s+(.+)$/);
  return m ? { street: m[1].trim(), zip: m[2], city: m[3].trim() } : { street: a.trim() || undefined };
}

export const isOverdue = (x: StoredInvoice, today = localDay()) => x.kind === 'invoice' && x.status === 'issued' && !!x.dueAt && x.dueAt < today;

export const kindLabel = (x: Pick<StoredInvoice, 'kind' | 'data'>) =>
  x.kind === 'quote' ? 'Angebot' : x.kind === 'credit' ? 'Stornorechnung' : x.data?.partial ? 'Abschlagsrechnung' : 'Rechnung';

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
