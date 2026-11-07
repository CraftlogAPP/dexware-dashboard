// Datenzugriff „Geld“ (Rechnungen, Angebote, Firmendaten, Material & Preise) — gleiche Tabellen, RPCs und RLS wie
// die App (InstallateurDex supabase/rechnung.sql + material.sql; App-Gegenstück mobile/src/data/invoices.ts und
// mobile/src/data/articles.ts). Nummernvergabe, Ausstellen, Bezahlt/Storno und Mahnstufen laufen NUR über die
// Server-RPCs (invoice_issue / invoice_set_status / invoice_remind) — das Portal rechnet nie selbst Nummern aus.
// Beispieldaten: geld/demo.ts (nur über DemoArea geladen).

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../fetchAll';
import type { AccountingSettings } from './accountingExport';
import { articleNoOf, matchArticle, saleCents, type Article, type PricingRule } from './articles';
import { defaultVatRate, totals, type InvoiceDeduction, type InvoiceDraft, type InvoiceKind, type InvoiceProfile, type InvoiceLine, type Land, type MaterialLine } from './invoice';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'canceled';

/** wie App data/invoices.ts StoredInvoice */
export interface StoredInvoice {
  id: string;
  kind: InvoiceKind;
  number?: string;
  status: InvoiceStatus;
  issuedAt?: string;
  dueAt?: string;
  paidAt?: string;
  canceledReason?: string;
  reminderLevel?: number;
  remindedAt?: string;
  siteId?: string;
  inspectionId?: string;
  cancelsId?: string;
  data: InvoiceDraft;
  profile?: InvoiceProfile;
  netCents: number;
  vatCents: number;
  grossCents: number;
  createdAt: string;
}

/**
 * Offener Betrag einer Rechnung (für „offen“/„überfällig“) — wie App data/invoices.ts openCents: bei Schlussrechnung und
 * eingetragenen Zahlungen der Rest nach Abzug, sonst brutto. Nie negativ.
 */
export function openCents(x: StoredInvoice): number {
  return x.kind === 'invoice' ? Math.max(0, totals(x.data).dueCents) : x.grossCents;
}

/** Firmendaten + mitlernende Materialpreise + Präfixe + Preisregel (org.invoice_profile) — wie App StoredProfile */
export type StoredProfile = InvoiceProfile & {
  prefix?: string;
  quotePrefix?: string;
  materialPrices?: Record<string, number>;
  articlePricing?: PricingRule;
  /** Konten für den DATEV-/BMD-Export (optional — ohne das Feld gelten die Standardwerte aus accountingExport.ts) */
  accounting?: AccountingSettings;
};

export type StoredArticle = Article & { id: string; usedAt?: string; updatedAt?: string };
export interface Catalog {
  supplier: string;
  count: number;
  updated?: string;
}

export interface DraftInput {
  id?: string;
  orgId: string;
  kind: InvoiceKind;
  siteId?: string;
  inspectionId?: string;
  data: InvoiceDraft;
}

/** Was eine Rechnung aus einem Einsatz braucht (keine Fotos/Unterschriften). */
export interface InspectionForInvoice {
  id: string;
  siteId: string;
  startedAt: string;
  workMinutes?: number;
  materials?: MaterialLine[];
  workDone?: string;
  canceled: boolean;
}

export interface GeldData {
  /** Einsatz für „Rechnung aus Einsatz“ (wie App InvoiceScreen mit inspectionId). */
  inspection(id: string): Promise<InspectionForInvoice | null>;
  /** Neueste 500 Belege (wie die App) bzw. alle mit Belegdatum im Zeitraum [from, to). */
  invoices(range?: { from: string; to: string }): Promise<StoredInvoice[]>;
  /**
   * Für die Kacheln „offen / überfällig / bezahlt im Monat“: ALLE offenen Rechnungen und alle seit `paidSince` (ISO)
   * bezahlten — vollständig, seitenweise (nicht nur aus den neuesten 500 Belegen der Liste).
   */
  tileInvoices(paidSince: string): Promise<StoredInvoice[]>;
  invoice(id: string): Promise<StoredInvoice | null>;
  /** Stornorechnung zu einer stornierten Rechnung (cancels_id) — gezielt, nicht nur unter den neuesten 500 Belegen. */
  creditFor(id: string): Promise<StoredInvoice | null>;
  /** Entwurf anlegen/ändern (nur Status „draft“, RLS invoice_insert/update). Liefert die ID. */
  saveDraft(input: DraftInput): Promise<string>;
  deleteDraft(id: string): Promise<void>;
  /** RPC invoice_issue: Nummer + Summen + Firmendaten einfrieren. Liefert die Nummer. */
  issue(id: string, profile: StoredProfile): Promise<string>;
  /**
   * RPC invoice_set_status. `paidAt` (JJJJ-MM-TT, nur bei „paid“): Tag des Zahlungseingangs — braucht
   * NACHTRAG-ZAHLUNGSDATUM-2026-11-07.sql. Kennt der Server das noch nicht, wird ohne Datum gebucht (= heute) und
   * `paidDateIgnored` gesetzt.
   */
  setStatus(
    id: string,
    status: 'paid' | 'issued' | 'canceled',
    reason?: string,
    paidAt?: string,
  ): Promise<{ creditId?: string; creditNumber?: string; paidDateIgnored?: boolean }>;
  remind(id: string): Promise<number>;
  profile(orgId: string, land: Land, fallbackName: string): Promise<StoredProfile>;
  /** Liest das aktuelle Profil frisch und schreibt nur die übergebenen Felder darüber (kein Überschreiben fremder Änderungen). */
  saveProfile(orgId: string, land: Land, fallbackName: string, patch: Partial<StoredProfile>): Promise<StoredProfile>;

  /** Server-Suche (RPC article_search). onlySupplier: "" = nur eigene Artikel. */
  searchArticles(q: string, limit: number, onlySupplier?: string): Promise<StoredArticle[]>;
  catalogs(): Promise<Catalog[]>;
  saveArticle(orgId: string, a: Article & { id?: string }): Promise<StoredArticle>;
  deleteArticle(id: string): Promise<void>;
  deleteCatalog(orgId: string, supplier: string): Promise<void>;
  /** Import-Baustein: Artikel ohne Nummer dieses Großhändlers vorher entfernen (wie App importArticles). */
  deleteSupplierWithoutNo(orgId: string, supplier: string): Promise<void>;
  /** Import-Baustein: ein Block (≤ 1.000) speichern — upsert über (org, supplier, no) oder insert. */
  writeArticleChunk(orgId: string, rows: Article[], upsert: boolean): Promise<void>;
  /** Artikel in eine Rechnung übernommen → „zuletzt verwendet“ (nur Inhaber darf, sonst still). */
  markUsed(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------------------------------------------
// Gemeinsame Helfer (auch von demo.ts genutzt)
// ---------------------------------------------------------------------------------------------------------------

/** wie App emptyProfile */
export function emptyProfile(land: Land, name = ''): StoredProfile {
  return { legalName: name, street: '', zip: '', city: '', land, vatRate: defaultVatRate(land), paymentDays: 14, laborStepMinutes: 15, prefix: 'RE', quotePrefix: 'AN', materialPrices: {} };
}

/** Schnappschuss fürs Ausstellen: ohne Preisliste/Preisregel/Buchhaltungskonten (wie App issueInvoice). */
export function profileSnapshot(p: StoredProfile): StoredProfile {
  const { materialPrices: _m, articlePricing: _p, accounting: _a, ...snapshot } = p;
  void _m;
  void _p;
  void _a;
  return snapshot;
}

/** wie App learnPrices: Materialpreise aus einem Beleg für das nächste Mal merken (null = nichts Neues). */
export function learnPrices(p: StoredProfile, lines: InvoiceLine[]): Record<string, number> | null {
  const prices = { ...(p.materialPrices ?? {}) };
  let changed = false;
  for (const l of lines) {
    if (l.kind !== 'material' || l.unitPriceCents <= 0) continue;
    const k = l.text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (prices[k] !== l.unitPriceCents) {
      prices[k] = l.unitPriceCents;
      changed = true;
    }
  }
  const keys = Object.keys(prices);
  if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete prices[k];
  return changed ? prices : null;
}

/** Fehlermeldungen der RPCs wie in der App (data/invoices.ts). */
export const ISSUE_ERROR = (code?: string) =>
  code === 'unknown'
    ? 'Ausstellen darf nur der Inhaber.'
    : code === 'pro'
      ? 'Ausstellen gibt es mit InstallateurDex Pro — der Server sieht für deinen Betrieb gerade kein aktives Abo. Falls du gerade gekauft hast: kurz warten und noch einmal versuchen.'
      : 'Das Ausstellen ging gerade nicht.';
export const STATUS_ERROR = (code?: string) =>
  code === 'reason'
    ? 'Bitte einen Storno-Grund angeben.'
    : code === 'unknown'
      ? 'Das darf nur der Inhaber.'
      : code === 'paid_future'
        ? 'Das Zahlungsdatum liegt in der Zukunft.'
        : code === 'paid_before_issue'
          ? 'Das Zahlungsdatum liegt vor dem Rechnungsdatum.'
          : 'Dieser Statuswechsel ist nicht möglich.';

/**
 * Server ohne NACHTRAG-ZAHLUNGSDATUM: PostgREST findet die Funktion mit p_paid_at nicht (PGRST202), sie ist mehrdeutig
 * (PGRST203) oder Postgres meldet „function … does not exist“ (42883). Dann ohne Datum wiederholen.
 */
export function isMissingPaidAtParam(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === 'PGRST202' || e.code === 'PGRST203' || e.code === '42883') return true;
  return /could not find the function|function .*does not exist|best candidate function/i.test(e.message ?? '');
}
export const REMIND_ERROR = (code?: string) =>
  code === 'max' ? 'Die 2. Mahnung ist schon verschickt.' : code === 'not_due' ? 'Die Rechnung ist noch nicht fällig.' : 'Das ging gerade nicht.';

/** wie App data/articles.ts toRow */
export const articleRow = (a: Article, orgId: string) => ({
  org_id: orgId,
  supplier: (a.supplier ?? '').trim(),
  no: a.no?.trim() || null,
  name: a.name.trim().slice(0, 200),
  unit: (a.unit || 'Stk').slice(0, 12),
  price_cents: Math.max(0, Math.round(a.priceCents)),
  price_kind: a.priceKind,
  grp: a.group?.slice(0, 40) || null,
  discount_group: a.discountGroup?.slice(0, 20) || null,
  ean: a.ean && /^\d{8,14}$/.test(a.ean) ? a.ean : null,
});

/**
 * wie App importArticles (Vorbereitung): doppelte Nummern in der Datei → die letzte gilt; Artikel ohne Nummer werden
 * je Großhändler ersetzt (nichts zuzuordnen). Reihenfolge der Datei bleibt erhalten.
 */
export function planArticleImport(list: Article[]): { withNo: Article[]; withoutNo: Article[]; suppliersWithoutNo: string[] } {
  const seen = new Set<string>();
  const withNo: Article[] = [];
  const withoutNo: Article[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (!a.no) {
      withoutNo.push(a);
      continue;
    }
    const k = `${a.supplier ?? ''}\u0001${a.no}`;
    if (seen.has(k)) continue;
    seen.add(k);
    withNo.push(a);
  }
  withNo.reverse();
  withoutNo.reverse();
  const suppliersWithoutNo = [...new Set(withoutNo.map((a) => (a.supplier ?? '').trim()))].filter(Boolean);
  return { withNo, withoutNo, suppliersWithoutNo };
}

/**
 * wie App data/articles.ts catalogPrices: Material-Positionen ohne Preis (aus dem Einsatz) mit dem Katalogpreis
 * ergänzen — gleiche Artikelnummer oder gleicher Name. Ohne Treffer/bei Fehlern bleibt die Position offen.
 */
export async function catalogPrices(geld: GeldData, lines: InvoiceLine[], rule: PricingRule): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const todo = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.kind === 'material' && l.unitPriceCents <= 0 && l.text.trim()).slice(0, 30);
  for (const { l, i } of todo) {
    try {
      const q = articleNoOf(l.text) ?? l.text.replace(/\(Art\.-Nr\.[^)]*\)\s*$/, '').trim();
      const items = await geld.searchArticles(q, 5);
      const hit = matchArticle(l.text, items);
      if (hit) out.set(i, saleCents(hit, rule));
    } catch {
      // Preis bleibt offen, der Pflichtangaben-Check zeigt es an
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------------------------------------------

// Liste ohne Firmen-Schnappschuss (profile) — der kommt nur in der Detailansicht.
const LIST_COLS =
  'id,kind,number,status,issued_at,due_at,paid_at,canceled_reason,reminder_level,reminded_at,site_id,inspection_id,cancels_id,data,net_cents,vat_cents,gross_cents,created_at';

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? undefined : String(v));

// invoice.data ist jsonb und kann per API mit beliebigem Inhalt geschrieben werden (z. B. von einem Teammitglied):
// beim Laden auf echte Zahlen/Texte/Enums bringen, damit nichts Fremdes in Anzeige oder Druckfenster gelangt.
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const txt = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'number' ? String(v) : '');
const opt = (v: unknown) => (typeof v === 'string' ? v : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const isoDay = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
const LINE_KINDS = ['labor', 'travel', 'material', 'flat', 'other'] as const;
const LANDS = ['DE', 'AT', 'CH'] as const;

export function normalizeDraft(raw: unknown): InvoiceDraft {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const r = (d.recipient && typeof d.recipient === 'object' ? d.recipient : {}) as Record<string, unknown>;
  const lines = Array.isArray(d.lines) ? d.lines : [];
  return {
    kind: oneOf(d.kind, ['invoice', 'quote', 'credit'] as const, 'invoice'),
    recipient: {
      name: txt(r.name),
      street: opt(r.street),
      zip: opt(r.zip),
      city: opt(r.city),
      land: LANDS.includes(r.land as (typeof LANDS)[number]) ? (r.land as (typeof LANDS)[number]) : undefined,
      uid: opt(r.uid),
      email: opt(r.email),
      private: r.private === true,
    },
    serviceDate: isoDay(d.serviceDate) ?? '',
    serviceDateTo: isoDay(d.serviceDateTo),
    lines: lines.map((x) => {
      const l = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      return {
        kind: oneOf(l.kind, LINE_KINDS, 'other'),
        text: txt(l.text),
        qty: num(l.qty, 1),
        unit: txt(l.unit),
        unitPriceCents: Math.round(num(l.unitPriceCents)),
        vatRate: num(l.vatRate),
      };
    }),
    vatMode: oneOf(d.vatMode, ['normal', 'kleinunternehmer', 'reverseCharge'] as const, 'normal'),
    notes: opt(d.notes),
    // Felder aus der App behalten — sonst gingen sie beim Speichern im Portal still verloren (wie App normalizeDraft)
    intro: opt(d.intro),
    source: d.source === 'ki' || d.source === 'zeitbuch' ? d.source : undefined,
    partial: d.partial === true,
    prepaidCents: d.prepaidCents == null ? undefined : Math.round(num(d.prepaidCents)),
    // Schlussrechnung: abgezogene Abschlagsrechnungen — nur Zahlen, Nummer als Text, Datum nur JJJJ-MM-TT
    final: d.final === true ? true : undefined,
    deductions: Array.isArray(d.deductions)
      ? d.deductions
          .slice(0, 50)
          .map((x): InvoiceDeduction => {
            const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
            const parts = Array.isArray(o.byRate) ? o.byRate.slice(0, 10) : [];
            return {
              id: opt(o.id),
              number: txt(o.number).slice(0, 60),
              issuedAt: isoDay(o.issuedAt) ?? '',
              byRate: parts.map((y) => {
                const p = (y && typeof y === 'object' ? y : {}) as Record<string, unknown>;
                return { rate: num(p.rate), netCents: Math.round(num(p.netCents)), vatCents: Math.round(num(p.vatCents)) };
              }),
            };
          })
          .filter((x) => x.number.trim() !== '')
      : undefined,
    cancels: opt(d.cancels),
    cancelReason: opt(d.cancelReason),
  };
}

function fromRow(r: Row): StoredInvoice {
  return {
    id: String(r.id),
    kind: r.kind as InvoiceKind,
    number: str(r.number),
    status: r.status as InvoiceStatus,
    issuedAt: str(r.issued_at),
    dueAt: str(r.due_at),
    paidAt: str(r.paid_at),
    canceledReason: str(r.canceled_reason),
    reminderLevel: Number(r.reminder_level ?? 0),
    remindedAt: str(r.reminded_at),
    siteId: str(r.site_id),
    inspectionId: str(r.inspection_id),
    cancelsId: str(r.cancels_id),
    data: normalizeDraft(r.data),
    profile: (r.profile as InvoiceProfile | null) ?? undefined,
    netCents: Number(r.net_cents ?? 0),
    vatCents: Number(r.vat_cents ?? 0),
    grossCents: Number(r.gross_cents ?? 0),
    createdAt: String(r.created_at),
  };
}

const articleFromRow = (r: Row): StoredArticle => ({
  id: String(r.id),
  supplier: (r.supplier as string) ?? '',
  no: str(r.no),
  name: String(r.name),
  unit: String(r.unit),
  priceCents: Number(r.price_cents ?? 0),
  priceKind: r.price_kind as Article['priceKind'],
  group: str(r.grp),
  discountGroup: str(r.discount_group),
  ean: str(r.ean),
  usedAt: str(r.used_at),
  updatedAt: str(r.updated_at),
});

function dbError(prefix: string, e: { message?: string; code?: string } | null): never {
  const m = e?.message ?? 'unbekannter Fehler';
  if (/Failed to fetch|NetworkError|network/i.test(m)) throw new Error(`${prefix}: keine Verbindung zum Server. Bitte Internet prüfen und erneut versuchen.`);
  if (e?.code === '42501') throw new Error(`${prefix}: dafür fehlt dir die Berechtigung (nur der Inhaber).`);
  throw new Error(`${prefix}: ${m}`);
}

export function supabaseGeld(sb: SupabaseClient): GeldData {
  /** Kennt der Server p_paid_at (NACHTRAG-ZAHLUNGSDATUM)? null = noch nicht ausprobiert */
  let paidAtSupported: boolean | null = null;
  async function readProfile(orgId: string, land: Land, fallbackName: string): Promise<StoredProfile> {
    const { data, error } = await sb.from('org').select('invoice_profile, name').eq('id', orgId).maybeSingle();
    if (error) dbError('Rechnungsdaten konnten nicht geladen werden', error);
    const row = (data ?? {}) as { invoice_profile?: Partial<StoredProfile> | null; name?: string };
    return { ...emptyProfile(land, row.name ?? fallbackName), ...(row.invoice_profile ?? {}) };
  }

  async function getInvoice(id: string): Promise<StoredInvoice | null> {
    const { data, error } = await sb.from('invoice').select(`${LIST_COLS},profile`).eq('id', id).maybeSingle();
    if (error) dbError('Beleg konnte nicht geladen werden', error);
    return data ? fromRow(data as Row) : null;
  }

  return {
    async inspection(id) {
      const { data, error } = await sb.from('inspection').select('id, site_id, started_at, work_minutes, materials, work_done, canceled').eq('id', id).maybeSingle();
      if (error) dbError('Einsatz konnte nicht geladen werden', error);
      if (!data) return null;
      const r = data as Row;
      return {
        id: String(r.id),
        siteId: String(r.site_id),
        startedAt: String(r.started_at),
        workMinutes: r.work_minutes == null ? undefined : Number(r.work_minutes),
        materials: Array.isArray(r.materials) ? (r.materials as MaterialLine[]) : undefined,
        workDone: str(r.work_done),
        canceled: !!r.canceled,
      };
    },
    async invoices(range) {
      if (!range) {
        const { data, error } = await sb.from('invoice').select(LIST_COLS).order('created_at', { ascending: false }).limit(500);
        if (error) dbError('Belege konnten nicht geladen werden', error);
        return ((data ?? []) as Row[]).map(fromRow);
      }
      // Zeitraum: alle Belege mit Belegdatum im Zeitraum, seitenweise bis zu einer leeren Seite (kein 500er-Deckel,
      // auch richtig bei max_rows < 1.000 — Export für den Steuerberater muss vollständig sein)
      const { data, error } = await fetchAllRows<Row>((a, b) =>
        sb.from('invoice').select(LIST_COLS).gte('issued_at', range.from).lt('issued_at', range.to).order('issued_at', { ascending: false }).order('id').range(a, b),
      );
      if (error) dbError('Belege konnten nicht geladen werden', error);
      return data.map(fromRow);
    },
    async tileInvoices(paidSince) {
      // fetchAllRows lädt bis zu einer LEEREN Seite — auch richtig, wenn max_rows im Projekt kleiner als 1.000 ist
      const all = async (label: string, page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>) => {
        const { data, error } = await fetchAllRows<Row>(page);
        if (error) dbError(label, error);
        return data.map(fromRow);
      };
      const [open, paid] = await Promise.all([
        all('Offene Rechnungen konnten nicht geladen werden', (a, b) =>
          sb.from('invoice').select(LIST_COLS).eq('kind', 'invoice').eq('status', 'issued').order('due_at').order('id').range(a, b),
        ),
        all('Bezahlte Rechnungen konnten nicht geladen werden', (a, b) =>
          sb.from('invoice').select(LIST_COLS).eq('kind', 'invoice').eq('status', 'paid').gte('paid_at', paidSince).order('paid_at', { ascending: false }).order('id').range(a, b),
        ),
      ]);
      return [...open, ...paid];
    },
    invoice: getInvoice,
    async creditFor(id) {
      const { data, error } = await sb.from('invoice').select(LIST_COLS).eq('kind', 'credit').eq('cancels_id', id).limit(1).maybeSingle();
      if (error) dbError('Stornobeleg konnte nicht geladen werden', error);
      return data ? fromRow(data as Row) : null;
    },
    async saveDraft(inv) {
      const id = inv.id ?? crypto.randomUUID();
      const t = totals(inv.data);
      const row = {
        id,
        org_id: inv.orgId,
        kind: inv.kind,
        site_id: inv.siteId ?? null,
        inspection_id: inv.inspectionId ?? null,
        data: inv.data,
        net_cents: t.netCents,
        vat_cents: t.vatCents,
        gross_cents: t.grossCents,
      };
      let { error } = await sb.from('invoice').upsert(row);
      // wie App: verknüpfter Einsatz (noch) nicht vorhanden → Entwurf ohne Verknüpfung speichern
      if (error && error.code === '23503') ({ error } = await sb.from('invoice').upsert({ ...row, inspection_id: null }));
      if (error) dbError('Entwurf konnte nicht gespeichert werden', error);
      return id;
    },
    async deleteDraft(id) {
      const { error } = await sb.from('invoice').delete().eq('id', id).eq('status', 'draft');
      if (error) dbError('Entwurf konnte nicht gelöscht werden', error);
    },
    async issue(id, profile) {
      const inv = await getInvoice(id);
      if (!inv) throw new Error('Beleg nicht gefunden.');
      const t = totals(inv.data);
      const send = async () => {
        const { data, error } = await sb.rpc('invoice_issue', { p_id: id, p_net: t.netCents, p_vat: t.vatCents, p_gross: t.grossCents, p_profile: profileSnapshot(profile) });
        if (error) dbError('Ausstellen nicht möglich', error);
        return (data ?? {}) as { number?: string; error?: string };
      };
      let r = await send();
      // wie App: Server sagt „kein Pro“ (z. B. gerade gekauft, noch nicht abgeglichen) → Tarif einmal abgleichen, erneut senden
      if (r.error === 'pro') {
        const { error: syncErr } = await sb.rpc('sync_seat_limit');
        if (!syncErr) r = await send();
      }
      if (!r.number) throw new Error(ISSUE_ERROR(r.error));
      return r.number;
    },
    async setStatus(id, status, reason, paidAt) {
      const base = { p_id: id, p_status: status, p_reason: reason ?? null };
      const wantDate = status === 'paid' && !!paidAt && /^\d{4}-\d{2}-\d{2}$/.test(paidAt);
      let dateIgnored = wantDate && paidAtSupported === false; // einmal festgestellt → nicht bei jeder Zeile neu probieren
      let res = await sb.rpc('invoice_set_status', wantDate && !dateIgnored ? { ...base, p_paid_at: paidAt } : base);
      if (wantDate && !dateIgnored && isMissingPaidAtParam(res.error)) {
        paidAtSupported = false;
        dateIgnored = true;
        res = await sb.rpc('invoice_set_status', base);
      } else if (wantDate && !dateIgnored && !res.error) paidAtSupported = true;
      if (res.error) dbError('Status konnte nicht geändert werden', res.error);
      const r = (res.data ?? {}) as { ok?: boolean; error?: string; credit_id?: string; credit_number?: string };
      if (!r.ok) throw new Error(STATUS_ERROR(r.error));
      return { creditId: r.credit_id, creditNumber: r.credit_number, paidDateIgnored: dateIgnored || undefined };
    },
    async remind(id) {
      const { data, error } = await sb.rpc('invoice_remind', { p_id: id });
      if (error) dbError('Mahnstufe konnte nicht vermerkt werden', error);
      const r = (data ?? {}) as { ok?: boolean; error?: string; level?: number };
      if (!r.ok) throw new Error(REMIND_ERROR(r.error));
      return Number(r.level ?? 0);
    },
    profile: readProfile,
    async saveProfile(orgId, land, fallbackName, patch) {
      const cur = await readProfile(orgId, land, fallbackName);
      const next = { ...cur, ...patch };
      const { error } = await sb.from('org').update({ invoice_profile: next }).eq('id', orgId);
      if (error) dbError('Rechnungsdaten konnten nicht gespeichert werden', error);
      return next;
    },

    async searchArticles(q, limit, onlySupplier) {
      const { data, error } = await sb.rpc('article_search', { q, lim: limit, only_supplier: onlySupplier ?? null });
      if (error) dbError('Artikelsuche fehlgeschlagen', error);
      return ((data ?? []) as Row[]).map(articleFromRow);
    },
    async catalogs() {
      const { data, error } = await sb.rpc('article_catalogs');
      if (error) dbError('Kataloge konnten nicht geladen werden', error);
      return ((data ?? []) as Row[]).map((r) => ({ supplier: (r.supplier as string) ?? '', count: Number(r.n ?? 0), updated: str(r.updated) }));
    },
    async saveArticle(orgId, a) {
      const id = a.id ?? crypto.randomUUID();
      const { data, error } = await sb.from('article').upsert({ id, ...articleRow(a, orgId) }).select().single();
      if (error) {
        if (error.code === '23505') throw new Error('Diese Artikelnummer gibt es schon.');
        if (error.code === '42501') throw new Error('Artikel pflegt nur der Inhaber.');
        dbError('Artikel konnte nicht gespeichert werden', error);
      }
      return articleFromRow(data as Row);
    },
    async deleteArticle(id) {
      const { error } = await sb.from('article').delete().eq('id', id);
      if (error) dbError('Artikel konnte nicht gelöscht werden', error);
    },
    async deleteCatalog(orgId, supplier) {
      const { error } = await sb.from('article').delete().eq('org_id', orgId).eq('supplier', supplier);
      if (error) dbError('Katalog konnte nicht entfernt werden', error);
    },
    async deleteSupplierWithoutNo(orgId, supplier) {
      const { error } = await sb.from('article').delete().eq('org_id', orgId).eq('supplier', supplier).is('no', null);
      if (error) dbError('Alte Artikel ohne Nummer konnten nicht ersetzt werden', error);
    },
    async writeArticleChunk(orgId, rows, upsert) {
      const chunk = rows.map((a) => articleRow(a, orgId));
      const { error } = upsert
        ? await sb.from('article').upsert(chunk, { onConflict: 'org_id,supplier,no' })
        : await sb.from('article').insert(chunk);
      if (error) {
        if (error.code === '54000') throw new Error(error.message);
        if (error.code === '42501') throw new Error('Importieren darf nur der Inhaber.');
        dbError('Import unterbrochen', error);
      }
    },
    async markUsed(id) {
      await sb.from('article').update({ used_at: new Date().toISOString() }).eq('id', id);
    },
  };
}
