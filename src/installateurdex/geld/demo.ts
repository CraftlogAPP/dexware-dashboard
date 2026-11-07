// Beispieldaten „Geld“ — NUR über DemoArea (Dev-Server) geladen, nie im Produktions-Build. Gleiche Beispielkunden
// wie ../demo.ts. Nummernvergabe, Storno und Mahnstufen ahmen die Server-RPCs aus rechnung.sql nach.

import { JOBS, SITES } from '../demo';
import { historyInvoices } from '../auswertung/cockpitDemo';
import { searchArticles, type Article } from './articles';
import { emptyProfile, ISSUE_ERROR, profileSnapshot, REMIND_ERROR, STATUS_ERROR, type Catalog, type GeldData, type StoredArticle, type StoredInvoice, type StoredProfile } from './api';
import { addDaysYmd, formatNumber, totals, type InvoiceDraft, type InvoiceLine } from './invoice';
import { mergeMarks, type FollowUpMarks } from './nachfassLogik';

const wait = <T,>(v: T, ms = 120): Promise<T> => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => localDay();
const dayOffset = (n: number) => addDaysYmd(today(), n);
const tsAgo = (days: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};

const site = (id: string) => SITES.find((s) => s.id === id)!;
const L = (kind: InvoiceLine['kind'], text: string, qty: number, unit: string, cents: number): InvoiceLine => ({ kind, text, qty, unit, unitPriceCents: cents, vatRate: 20 });

const PROFILE: StoredProfile = {
  ...emptyProfile('AT', 'Installateur Muster GmbH'),
  street: 'Musterstraße 12',
  zip: '7000',
  city: 'Musterstadt',
  uid: 'ATU12345678',
  iban: 'AT611904300234573201',
  bic: 'BKAUATWW',
  email: 'service@example.com',
  phone: '+43 664 000 0000',
  hourlyRateCents: 7800,
  travelFlatCents: 3500,
  paymentDays: 14,
  articlePricing: { mode: 'list', discountPercent: 32, markupPercent: 20 },
  materialPrices: { 'kugelhahn 1"': 1890 },
};

function draftFor(siteId: string, lines: InvoiceLine[], serviceDate: string, extra: Partial<InvoiceDraft> = {}): InvoiceDraft {
  const s = site(siteId);
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

function issued(id: string, number: string, siteId: string, data: InvoiceDraft, issuedAgo: number, extra: Partial<StoredInvoice> = {}): StoredInvoice {
  const t = totals(data);
  const issuedAt = dayOffset(-issuedAgo);
  return {
    id,
    kind: data.kind,
    number,
    status: 'issued',
    issuedAt,
    dueAt: addDaysYmd(issuedAt, data.kind === 'quote' ? 30 : 14),
    siteId,
    data,
    profile: profileSnapshot(PROFILE),
    netCents: t.netCents,
    vatCents: t.vatCents,
    grossCents: t.grossCents,
    createdAt: tsAgo(issuedAgo),
    reminderLevel: 0,
    ...extra,
  };
}

const year = new Date().getFullYear();

function buildInvoices(): StoredInvoice[] {
  const huber = draftFor('s-huber', [L('labor', 'Arbeitszeit: Jahreswartung Wärmepumpe', 1.5, 'h', 7800), L('travel', 'Anfahrt', 1, 'pauschal', 3500), L('material', 'Filtereinsatz 1"', 1, 'Stk', 2490)], dayOffset(-40));
  const gruber = draftFor('s-gruber', [L('labor', 'Arbeitszeit: Störung Klimagerät Verkaufsraum', 2.25, 'h', 7800), L('travel', 'Anfahrt', 1, 'pauschal', 3500), L('material', 'Kondensatpumpe', 1, 'Stk', 11900)], dayOffset(-29), {
    recipient: { name: 'Gruber KG', street: 'Marktplatz 1', zip: '7000', city: 'Musterstadt', land: 'AT', uid: 'ATU87654321', email: 'office@example.com', private: false },
  });
  const berger = draftFor('s-see', [L('labor', 'Arbeitszeit: Wartung Gasthermen (2 Geräte)', 3, 'h', 7800), L('travel', 'Anfahrt', 1, 'pauschal', 3500), L('material', 'Wartungsset Gastherme', 2, 'Stk', 4200)], dayOffset(-5), {
    recipient: { name: 'Hausverwaltung Berger', street: 'Seestraße 4', zip: '7100', city: 'Neusiedl', land: 'AT', email: 'verwaltung@example.com', private: false },
  });
  const steinerOld = draftFor('s-steiner', [L('labor', 'Arbeitszeit: Ölbrenner Reinigung', 1, 'h', 7800)], dayOffset(-60));
  const novak = { ...draftFor('s-novak', [L('flat', 'Luft/Wasser-Wärmepumpe 9 kW inkl. Montage', 1, 'pauschal', 1489000), L('labor', 'Arbeitszeit: Hydraulik und Inbetriebnahme', 12, 'h', 7800)], dayOffset(-15)), kind: 'quote' as const };
  // Angebote nachfassen (Beispiele): 0001 angenommen (Rechnung „Laut Angebot“ in auswertung/cockpitDemo.ts), 0002 abgelehnt,
  // 0003 offen und schon abgelaufen, 0004 offen und fällig, 0005 frisch (wartet noch)
  const q = (siteId: string, lines: InvoiceLine[], ago: number, extra: Partial<InvoiceDraft> = {}) => ({ ...draftFor(siteId, lines, dayOffset(-ago - 1), extra), kind: 'quote' as const });
  const quoteGruber = q('s-gruber', [L('labor', 'Arbeitszeit: Kondensatpumpe Büro tauschen', 1.5, 'h', 7800), L('travel', 'Anfahrt', 1, 'pauschal', 3500), L('material', 'Kondensatpumpe', 1, 'Stk', 11900)], 80, {
    recipient: { name: 'Gruber KG', street: 'Marktplatz 1', zip: '7000', city: 'Musterstadt', land: 'AT', uid: 'ATU87654321', email: 'office@example.com', private: false },
  });
  const quoteLechner = q('s-lechner', [L('flat', 'Pelletkessel-Reinigung + Förderschnecke neu', 1, 'pauschal', 89000)], 60);
  const quoteSteiner = q('s-steiner', [L('flat', 'Tausch Ölkessel gegen Gas-Brennwerttherme 25 kW inkl. Montage', 1, 'pauschal', 948000), L('labor', 'Arbeitszeit: Demontage + Entsorgung Öltank', 10, 'h', 7800)], 41);
  const quoteSee = q('s-see', [L('flat', 'Hocheffizienzpumpen für 2 Heizkreise inkl. Montage', 1, 'pauschal', 132000)], 3, {
    recipient: { name: 'Hausverwaltung Berger', street: 'Seestraße 4', zip: '7100', city: 'Neusiedl', land: 'AT', email: 'verwaltung@example.com', private: false },
  });
  const steinerDraft = draftFor('s-steiner', [L('labor', 'Arbeitszeit: Störung Ölheizung', 1.25, 'h', 7800), L('travel', 'Anfahrt', 1, 'pauschal', 3500), L('material', 'Zündelektrode', 1, 'Stk', 0)], dayOffset(-1), {
    recipient: { name: 'Dr. Steiner', street: 'Bahnhofstraße 9', zip: '7000', city: 'Musterstadt', land: 'AT', private: false },
  });

  const canceled = issued('inv-0011', `RE-${year}-0011`, 's-steiner', steinerOld, 58, { status: 'canceled', canceledReason: 'Falscher Empfänger (Praxis statt privat)' });
  const credit: StoredInvoice = {
    ...issued('inv-st1', `ST-${year}-0001`, 's-steiner', { ...steinerOld, kind: 'credit', cancels: canceled.number, cancelReason: canceled.canceledReason }, 57),
    kind: 'credit',
    dueAt: dayOffset(-57),
    cancelsId: canceled.id,
    netCents: -canceled.netCents,
    vatCents: -canceled.vatCents,
    grossCents: -canceled.grossCents,
  };
  const t = totals(steinerDraft);
  return [
    {
      id: 'inv-draft1',
      kind: 'invoice',
      status: 'draft',
      siteId: 's-steiner',
      data: steinerDraft,
      netCents: t.netCents,
      vatCents: t.vatCents,
      grossCents: t.grossCents,
      createdAt: tsAgo(1, 16),
      reminderLevel: 0,
    },
    issued('inv-0014', `RE-${year}-0014`, 's-see', berger, 4),
    issued('an-0005', `AN-${year}-0005`, 's-see', quoteSee, 3),
    issued('an-0004', `AN-${year}-0004`, 's-novak', novak, 14),
    issued('an-0003', `AN-${year}-0003`, 's-steiner', quoteSteiner, 41),
    issued('an-0002', `AN-${year}-0002`, 's-lechner', quoteLechner, 60, { status: 'canceled', canceledReason: 'Abgelehnt: Kunde macht die Reinigung selbst' }),
    issued('an-0001', `AN-${year}-0001`, 's-gruber', quoteGruber, 80),
    issued('inv-0013', `RE-${year}-0013`, 's-gruber', gruber, 28, { reminderLevel: 1, remindedAt: tsAgo(6) }),
    issued('inv-0012', `RE-${year}-0012`, 's-huber', huber, 38, { status: 'paid', paidAt: tsAgo(30, 9) }),
    credit,
    canceled,
    ...historyInvoices(profileSnapshot(PROFILE)), // ältere Rechnungen der letzten 12 Monate (Cockpit, auswertung/cockpitDemo.ts)
  ];
}

const A = (supplier: string, no: string | undefined, name: string, unit: string, priceCents: number, priceKind: Article['priceKind'], extra: Partial<StoredArticle> = {}): StoredArticle => ({
  id: `art-${supplier || 'own'}-${no ?? name}`.replace(/\s+/g, '-'),
  supplier,
  no,
  name,
  unit,
  priceCents,
  priceKind,
  updatedAt: tsAgo(20),
  ...extra,
});

function buildArticles(): StoredArticle[] {
  return [
    A('', undefined, 'Kleinmaterial pauschal', 'pauschal', 1500, 'sale', { usedAt: tsAgo(1) }),
    A('', undefined, 'Entsorgung Altgerät', 'pauschal', 4900, 'sale'),
    A('', 'WS-GT', 'Wartungsset Gastherme', 'Stk', 4200, 'sale', { usedAt: tsAgo(5) }),
    A('Musterhandel', '100200', 'Kupferrohr 15x1 hart Stange 5 m', 'm', 1235, 'list', { group: 'KUPF', discountGroup: 'R12' }),
    A('Musterhandel', '100220', 'Kupferrohr 22x1 hart Stange 5 m', 'm', 1990, 'list', { group: 'KUPF', discountGroup: 'R12' }),
    A('Musterhandel', '300400', 'Pressfitting Bogen 90° 15 mm', 'Stk', 845, 'net', { group: 'PRESS', ean: '4012345678901' }),
    A('Musterhandel', '300420', 'Pressfitting Bogen 90° 22 mm', 'Stk', 1120, 'net', { group: 'PRESS' }),
    A('Musterhandel', '410010', 'Kugelhahn 1" mit Flügelgriff', 'Stk', 2790, 'list', { group: 'ARM' }),
    A('Musterhandel', '520300', 'Kondensatpumpe für Split-Klimageräte', 'Stk', 16900, 'list', { group: 'KLIMA' }),
    A('Musterhandel', '610050', 'Ausdehnungsgefäß 25 l Heizung', 'Stk', 7450, 'list', { group: 'HEIZ' }),
    A('Musterhandel', '700100', 'Isolierschlauch 22 mm 13 mm Wandstärke', 'm', 310, 'list', { group: 'ISO' }),
    A('Musterhandel', '800900', 'Zündelektrode Ölbrenner universal', 'Stk', 2380, 'list', { group: 'OEL' }),
  ];
}

export function demoGeld(): GeldData {
  let invoices = buildInvoices();
  let profile = structuredClone(PROFILE);
  let articles = buildArticles();
  const seq: Record<string, number> = { invoice: 14, quote: 5, credit: 1 };
  let followUp: FollowUpMarks = {};
  const find = (id: string) => invoices.find((x) => x.id === id);

  return {
    inspection: (id) => {
      const j = JOBS.find((x) => x.id === id);
      return wait(
        j
          ? { id: j.id, siteId: j.site_id, startedAt: j.started_at, workMinutes: j.work_minutes ?? undefined, materials: j.materials, workDone: j.work_done ?? undefined, canceled: !!j.canceled }
          : null,
      );
    },
    invoices: (range) =>
      wait(
        range
          ? invoices.filter((x) => x.issuedAt && x.issuedAt >= range.from && x.issuedAt < range.to)
          : [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ),
    tileInvoices: (paidSince) =>
      wait(invoices.filter((x) => x.kind === 'invoice' && (x.status === 'issued' || (x.status === 'paid' && !!x.paidAt && x.paidAt >= paidSince)))),
    invoice: (id) => wait(find(id) ?? null),
    creditFor: (id) => wait(invoices.find((x) => x.kind === 'credit' && x.cancelsId === id) ?? null),
    async saveDraft(inv) {
      const id = inv.id ?? crypto.randomUUID();
      const prev = find(id);
      if (prev && prev.status !== 'draft') throw new Error('Ausgestellte Belege lassen sich nicht mehr ändern.');
      const t = totals(inv.data);
      const next: StoredInvoice = {
        ...(prev ?? { createdAt: new Date().toISOString(), reminderLevel: 0 }),
        id,
        kind: inv.kind,
        status: 'draft',
        siteId: inv.siteId,
        inspectionId: inv.inspectionId,
        data: structuredClone(inv.data),
        netCents: t.netCents,
        vatCents: t.vatCents,
        grossCents: t.grossCents,
      } as StoredInvoice;
      invoices = [next, ...invoices.filter((x) => x.id !== id)];
      return wait(id);
    },
    async deleteDraft(id) {
      invoices = invoices.filter((x) => !(x.id === id && x.status === 'draft'));
      await wait(null);
    },
    async issue(id, p) {
      const inv = find(id);
      if (!inv) throw new Error(ISSUE_ERROR('unknown'));
      if (inv.status !== 'draft') throw new Error(ISSUE_ERROR('not_draft'));
      const t = totals(inv.data);
      seq[inv.kind] = (seq[inv.kind] ?? 0) + 1;
      const number = formatNumber(inv.kind === 'quote' ? profile.quotePrefix || 'AN' : profile.prefix || 'RE', year, seq[inv.kind]);
      const days = Math.max(0, Math.min(120, p.paymentDays ?? 14));
      Object.assign(inv, {
        number,
        status: 'issued',
        issuedAt: today(),
        dueAt: dayOffset(inv.kind === 'invoice' ? days : 30),
        profile: profileSnapshot(p),
        netCents: t.netCents,
        vatCents: t.vatCents,
        grossCents: t.grossCents,
      });
      return wait(number);
    },
    async setStatus(id, status, reason, paidAt) {
      const v = find(id);
      if (!v) throw new Error(STATUS_ERROR('unknown'));
      if (status === 'paid' && v.status === 'issued' && v.kind === 'invoice') {
        // wie NACHTRAG-ZAHLUNGSDATUM: Tag des Zahlungseingangs, nicht in der Zukunft, nicht vor dem Rechnungsdatum, 12:00 Ortszeit
        const day = paidAt && /^\d{4}-\d{2}-\d{2}$/.test(paidAt) ? paidAt : null;
        if (day && day > today()) throw new Error(STATUS_ERROR('paid_future'));
        if (day && v.issuedAt && day < v.issuedAt.slice(0, 10)) throw new Error(STATUS_ERROR('paid_before_issue'));
        const [y, m, d] = (day ?? '').split('-').map(Number);
        Object.assign(v, { status: 'paid', paidAt: day ? new Date(y, m - 1, d, 12).toISOString() : new Date().toISOString() });
      } else if (status === 'issued' && v.status === 'paid') {
        Object.assign(v, { status: 'issued', paidAt: undefined });
      } else if (status === 'canceled' && (v.status === 'issued' || v.status === 'paid') && (v.kind === 'invoice' || v.kind === 'quote')) {
        const r = (reason ?? '').trim();
        if (r.length < 3) throw new Error(STATUS_ERROR('reason'));
        Object.assign(v, { status: 'canceled', canceledReason: r.slice(0, 300) });
        if (v.kind === 'invoice') {
          seq.credit += 1;
          const credit: StoredInvoice = {
            ...structuredClone(v),
            id: crypto.randomUUID(),
            kind: 'credit',
            number: formatNumber('ST', year, seq.credit),
            status: 'issued',
            issuedAt: today(),
            dueAt: today(),
            paidAt: undefined,
            canceledReason: undefined,
            reminderLevel: 0,
            remindedAt: undefined,
            cancelsId: v.id,
            data: { ...structuredClone(v.data), kind: 'credit', cancels: v.number, cancelReason: r.slice(0, 300) },
            netCents: -v.netCents,
            vatCents: -v.vatCents,
            grossCents: -v.grossCents,
            createdAt: new Date().toISOString(),
          };
          invoices = [credit, ...invoices];
          return wait({ creditId: credit.id, creditNumber: credit.number });
        }
      } else {
        throw new Error(STATUS_ERROR('transition'));
      }
      return wait({});
    },
    async remind(id) {
      const v = find(id);
      if (!v || v.kind !== 'invoice' || v.status !== 'issued') throw new Error(REMIND_ERROR('not_open'));
      if (!v.dueAt || v.dueAt >= today()) throw new Error(REMIND_ERROR('not_due'));
      if ((v.reminderLevel ?? 0) >= 3) throw new Error(REMIND_ERROR('max'));
      v.reminderLevel = (v.reminderLevel ?? 0) + 1;
      v.remindedAt = new Date().toISOString();
      return wait(v.reminderLevel);
    },
    profile: () => wait(profile),
    async saveProfile(_o, _l, _n, patch) {
      profile = { ...profile, ...structuredClone(patch) };
      return wait(profile);
    },

    searchArticles: (q, limit, onlySupplier) => {
      const pool = onlySupplier === undefined ? articles : articles.filter((a) => (a.supplier ?? '') === onlySupplier);
      const sorted = q.trim() ? pool : [...pool].sort((x, y) => (y.usedAt ?? '').localeCompare(x.usedAt ?? '') || Number(!!x.supplier) - Number(!!y.supplier));
      return wait(searchArticles(sorted, q, limit));
    },
    catalogs: () => {
      const by = new Map<string, Catalog>();
      for (const a of articles) {
        const c = by.get(a.supplier ?? '') ?? { supplier: a.supplier ?? '', count: 0, updated: a.updatedAt };
        c.count += 1;
        if ((a.updatedAt ?? '') > (c.updated ?? '')) c.updated = a.updatedAt;
        by.set(c.supplier, c);
      }
      return wait([...by.values()].sort((x, y) => x.supplier.localeCompare(y.supplier)));
    },
    async saveArticle(_o, a) {
      const id = a.id ?? crypto.randomUUID();
      const no = a.no?.trim();
      if (no && articles.some((x) => x.id !== id && (x.supplier ?? '') === (a.supplier ?? '') && x.no === no)) throw new Error('Diese Artikelnummer gibt es schon.');
      const saved: StoredArticle = { ...a, id, supplier: (a.supplier ?? '').trim(), no: a.no?.trim() || undefined, updatedAt: new Date().toISOString() };
      articles = [saved, ...articles.filter((x) => x.id !== id)];
      return wait(saved);
    },
    async deleteArticle(id) {
      articles = articles.filter((x) => x.id !== id);
      await wait(null);
    },
    async deleteCatalog(_o, supplier) {
      articles = articles.filter((x) => (x.supplier ?? '') !== supplier);
      await wait(null);
    },
    async deleteSupplierWithoutNo(_o, supplier) {
      articles = articles.filter((x) => !((x.supplier ?? '') === supplier && !x.no));
      await wait(null);
    },
    async writeArticleChunk(_o, rows, upsert) {
      const now = new Date().toISOString();
      for (const r of rows) {
        const prev = upsert && r.no ? articles.find((x) => (x.supplier ?? '') === (r.supplier ?? '') && x.no === r.no) : undefined;
        const next: StoredArticle = { ...r, id: prev?.id ?? crypto.randomUUID(), updatedAt: now, usedAt: prev?.usedAt };
        if (prev) articles[articles.indexOf(prev)] = next;
        else articles.push(next);
      }
      if (articles.length > 300_000) throw new Error('Mehr als 300.000 Artikel je Betrieb sind nicht möglich.');
      await wait(null, 60);
    },
    async markUsed(id) {
      const a = articles.find((x) => x.id === id);
      if (a) a.usedAt = new Date().toISOString();
      await wait(null, 0);
    },
    // Beispieldaten: so, als wäre quote_follow_up schon eingespielt (Merker bis zum Neuladen)
    followUpMarks: () => wait(followUp),
    async setFollowUpMark(_orgId, quoteId, mark) {
      const v = find(quoteId);
      if (!v || v.kind !== 'quote' || v.status === 'draft') throw new Error('Merker gehen nur bei ausgestellten Angeboten.');
      const merged = mergeMarks(followUp[quoteId], mark); // wie am Server: zusammenführen statt überschreiben
      followUp = { ...followUp, [quoteId]: merged };
      return wait(merged, 150);
    },
  };
}
