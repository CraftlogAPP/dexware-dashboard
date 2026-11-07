// Ältere Beispiel-Rechnungen (letzte 12 Monate) für Cockpit und Rechnungsliste — NUR Beispieldaten (Dev-Server).
// Einhängen in geld/demo.ts → buildInvoices(): `...historyInvoices(profileSnapshot(PROFILE))` ans Ende der Liste.
// Gleiche Beispielkunden wie ../demo.ts. Nummern je Jahr fortlaufend nach Datum: Vorjahr ab 0101, laufendes Jahr
// 0001–0010 — die vorhandenen Beispiele beginnen bei RE-<Jahr>-0011 / ST-<Jahr>-0001, es gibt keine Überschneidung.
// Enthält: bezahlte Rechnungen über das Jahr verteilt (Wartungen, Reparaturen, ein paar Montagen), eine Abschlags- +
// Schlussrechnung (Wärmepumpe Novak) und drei ältere offene Rechnungen ~50/80/110 Tage über dem Zahlungsziel.

import { SITES } from '../demo';
import type { StoredInvoice } from '../geld/api';
import { addDaysYmd, deductionFromInvoice, totals, type InvoiceDraft, type InvoiceLine, type InvoiceProfile } from '../geld/invoice';

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOffset = (n: number) => addDaysYmd(localDay(), n);
const tsOf = (ymd: string, hour = 10) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 15).toISOString();
};
const L = (kind: InvoiceLine['kind'], text: string, qty: number, unit: string, cents: number): InvoiceLine => ({ kind, text, qty, unit, unitPriceCents: cents, vatRate: 20 });

const BERGER: InvoiceDraft['recipient'] = { name: 'Hausverwaltung Berger', street: 'Seestraße 4', zip: '7100', city: 'Neusiedl', land: 'AT', email: 'verwaltung@example.com', private: false };
const GRUBER: InvoiceDraft['recipient'] = { name: 'Gruber KG', street: 'Marktplatz 1', zip: '7000', city: 'Musterstadt', land: 'AT', uid: 'ATU87654321', email: 'office@example.com', private: false };

function draftFor(siteId: string, lines: InvoiceLine[], serviceDate: string, extra: Partial<InvoiceDraft> = {}): InvoiceDraft {
  const s = SITES.find((x) => x.id === siteId)!;
  const m = s.address.match(/^(.*?),\s*(\d{4,5})\s+(.+)$/);
  return {
    kind: 'invoice',
    recipient: { name: s.operator_name || s.name, street: m?.[1], zip: m?.[2], city: m?.[3], land: 'AT', email: s.customer_email ?? undefined, private: true },
    serviceDate,
    lines,
    vatMode: 'normal',
    ...extra,
  };
}

const anfahrt = () => L('travel', 'Anfahrt', 1, 'pauschal', 3500);

interface Plan {
  /** Rechnungsdatum: vor so vielen Tagen */
  ago: number;
  site: string;
  lines: InvoiceLine[];
  /** bezahlt nach n Tagen; undefined = offen */
  paidAfter?: number;
  recipient?: InvoiceDraft['recipient'];
  /** Abschlags- bzw. Schlussrechnung (Wärmepumpe Novak) */
  role?: 'advance' | 'final';
}

const PLANS: Plan[] = [
  { ago: 345, site: 's-see', recipient: BERGER, paidAfter: 12, lines: [L('labor', 'Arbeitszeit: Wartung Gasthermen (2 Geräte)', 3, 'h', 7800), anfahrt(), L('material', 'Wartungsset Gastherme', 2, 'Stk', 4200)] },
  { ago: 330, site: 's-steiner', paidAfter: 20, lines: [L('labor', 'Arbeitszeit: Wartung Ölbrenner', 2, 'h', 7800), anfahrt(), L('material', 'Ölfilter + Düse', 1, 'Set', 6400)] },
  { ago: 318, site: 's-see', recipient: BERGER, paidAfter: 14, lines: [L('labor', 'Arbeitszeit: Tausch Heizkreispumpen', 4, 'h', 7800), anfahrt(), L('material', 'Hocheffizienzpumpe 25-60', 2, 'Stk', 38900)] },
  { ago: 290, site: 's-gruber', recipient: GRUBER, paidAfter: 9, lines: [L('labor', 'Arbeitszeit: Störung Klimagerät Backstube', 2.5, 'h', 7800), anfahrt(), L('material', 'Lüftermotor Innengerät', 1, 'Stk', 18900)] },
  { ago: 260, site: 's-lechner', paidAfter: 24, lines: [L('labor', 'Arbeitszeit: Kesselreinigung + Wartung', 3, 'h', 7800), anfahrt(), L('material', 'Dichtungsset', 1, 'Set', 3900)] },
  { ago: 236, site: 's-huber', paidAfter: 11, lines: [L('flat', 'Warmwasserspeicher 300 l inkl. Montage und Entsorgung Altgerät', 1, 'pauschal', 248000), L('labor', 'Arbeitszeit: Anschluss + Inbetriebnahme', 3, 'h', 7800), anfahrt()] },
  { ago: 226, site: 's-novak', paidAfter: 7, role: 'advance', lines: [L('flat', 'Abschlag 30 % laut Angebot: Luft/Wasser-Wärmepumpe 9 kW', 1, 'pauschal', 446700)] },
  { ago: 205, site: 's-gruber', recipient: GRUBER, paidAfter: 13, lines: [L('flat', 'Split-Klimagerät 3,5 kW Büro inkl. Montage', 1, 'pauschal', 329000), L('labor', 'Arbeitszeit: Kernbohrung + Kondensat', 2.5, 'h', 7800), anfahrt()] },
  { ago: 183, site: 's-novak', paidAfter: 16, role: 'final', lines: [L('flat', 'Luft/Wasser-Wärmepumpe 9 kW inkl. Montage', 1, 'pauschal', 1489000), L('labor', 'Arbeitszeit: Hydraulik und Inbetriebnahme', 12, 'h', 7800)] },
  { ago: 150, site: 's-see', recipient: BERGER, paidAfter: 21, lines: [L('labor', 'Arbeitszeit: Solarstation entlüftet, Frostschutz', 2, 'h', 7800), anfahrt(), L('material', 'Solarflüssigkeit 20 l', 1, 'Stk', 8900)] },
  // ältere offene (Altersstruktur): Rechnungsdatum vor 125 / 95 / 66 Tagen, Zahlungsziel 14 Tage
  { ago: 125, site: 's-lechner', lines: [L('labor', 'Arbeitszeit: Pelletförderung blockiert', 2.5, 'h', 7800), anfahrt(), L('material', 'Förderschnecke Lager', 1, 'Stk', 31900)] },
  { ago: 95, site: 's-see', recipient: BERGER, lines: [L('labor', 'Arbeitszeit: Druckabfall Heizung', 1.75, 'h', 7800), anfahrt(), L('material', 'Ausdehnungsgefäß 25 l', 1, 'Stk', 11900)] },
  { ago: 66, site: 's-gruber', recipient: GRUBER, lines: [L('labor', 'Arbeitszeit: Kondensatpumpe Büro', 1.5, 'h', 7800), anfahrt(), L('material', 'Kondensatpumpe', 1, 'Stk', 11900)] },
];

/** Kleine bezahlte Wartungsrechnungen zum Auffüllen der Nummern im laufenden Jahr */
const FILLERS: ((ago: number) => Plan)[] = [
  (ago) => ({ ago, site: 's-huber', paidAfter: 9, lines: [L('labor', 'Arbeitszeit: Jahreswartung Wärmepumpe', 1.5, 'h', 7800), anfahrt(), L('material', 'Filtereinsatz 1"', 1, 'Stk', 2490)] }),
  (ago) => ({ ago, site: 's-gruber', recipient: GRUBER, paidAfter: 12, lines: [L('labor', 'Arbeitszeit: Wartung Klimagerät inkl. Desinfektion', 1.25, 'h', 7800), anfahrt(), L('material', 'Reinigungsmittel', 1, 'Stk', 1890)] }),
  (ago) => ({ ago, site: 's-steiner', paidAfter: 18, lines: [L('labor', 'Arbeitszeit: Wartung Enthärtung', 1, 'h', 7800), anfahrt(), L('material', 'Regeneriersalz 25 kg', 2, 'Sack', 1290)] }),
];

/**
 * Rechnungen der letzten 12 Monate VOR den vorhandenen Beispielen (die liegen in den letzten ~60 Tagen).
 * `profile`: Firmendaten-Schnappschuss wie bei ausgestellten Belegen (optional).
 */
export function historyInvoices(profile?: InvoiceProfile): StoredInvoice[] {
  const year = String(new Date().getFullYear());
  // laufendes Jahr: höchstens 10 (Nummern 0001–0010) — sonst die ältesten bezahlten des Jahres weglassen
  const inYear = PLANS.filter((p) => dayOffset(-p.ago).startsWith(year));
  const removable = inYear.filter((p) => p.paidAfter !== undefined && !p.role);
  const drop = new Set(removable.slice(0, Math.max(0, inYear.length - 10)));
  const plans = PLANS.filter((p) => !drop.has(p));
  // … und lückenlos: weniger als 10 im laufenden Jahr (Lauf Anfang des Jahres) → kleine Wartungsrechnungen zwischen
  // dem 1.1. und der ersten vorhandenen Beispielrechnung (RE-…-0011 liegt ~58 Tage zurück) auffüllen
  const now = new Date();
  const sinceJan1 = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000);
  const need = 10 - plans.filter((p) => dayOffset(-p.ago).startsWith(year)).length;
  const lo = 62;
  if (need > 0 && sinceJan1 > lo) {
    for (let k = 0; k < need; k++) {
      const ago = Math.round(sinceJan1 - ((k + 0.5) * (sinceJan1 - lo)) / need);
      plans.push(FILLERS[k % FILLERS.length](ago));
    }
  }
  plans.sort((a, b) => b.ago - a.ago);

  const seq = new Map<string, number>();
  const out: StoredInvoice[] = [];
  let advance: StoredInvoice | null = null;
  plans.forEach((p, i) => {
    const issuedAt = dayOffset(-p.ago);
    const y = issuedAt.slice(0, 4);
    const n = (seq.get(y) ?? (y === year ? 0 : 100)) + 1;
    seq.set(y, n);
    const number = `RE-${y}-${String(n).padStart(4, '0')}`;
    const extra: Partial<InvoiceDraft> = { ...(p.recipient ? { recipient: p.recipient } : {}) };
    if (p.role === 'advance') extra.partial = true;
    if (p.role === 'final') Object.assign(extra, { final: true, deductions: advance ? [deductionFromInvoice(advance)] : [] });
    const data = draftFor(p.site, p.lines, dayOffset(-p.ago - 2), extra);
    const t = totals(data);
    const paid = p.paidAfter !== undefined && p.paidAfter < p.ago;
    const inv: StoredInvoice = {
      id: `inv-h-${i + 1}`,
      kind: 'invoice',
      number,
      status: paid ? 'paid' : 'issued',
      issuedAt,
      dueAt: addDaysYmd(issuedAt, 14),
      paidAt: paid ? tsOf(addDaysYmd(issuedAt, p.paidAfter!), 9) : undefined,
      siteId: p.site,
      data,
      profile,
      netCents: t.netCents,
      vatCents: t.vatCents,
      grossCents: t.grossCents,
      createdAt: tsOf(issuedAt),
      reminderLevel: paid ? 0 : p.ago > 100 ? 2 : 1,
    };
    if (p.role === 'advance') advance = inv;
    out.push(inv);
  });
  return out;
}
