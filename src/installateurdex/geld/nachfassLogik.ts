// Quelle: App InstallateurDex mobile/src/lib/quoteFollowUp.ts, Stand 07.11.2026 (Commit 74f28d3) — Texte und Logik 1:1, nichts angepasst
// (die Importe aus ./invoice heißen im Portal gleich: geld/invoice.ts). Datenweg im Portal: geld/api.ts
// followUpMarks/setFollowUpMark (Tabelle quote_follow_up; fehlt sie → nur ansehen, ohne Merker).
// Änderungen IMMER zuerst in der App, dann hier per Kopie nachziehen.
//
// Angebote nachfassen: welche ausgestellten Angebote sind „fällig“ (älter als X Tage, weder angenommen noch abgelehnt),
// freundlicher Nachfass-Text und Gewinnquote. Reine Logik ohne RN/Netz — getestet in scripts/test-nachfassen.js.
//
// Woher die App den Stand eines Angebots kennt (ohne neue Server-Felder):
// - angenommen: eine Rechnung verweist darauf (data.fromQuote, ältere Rechnungen: Hinweis „Laut Angebot AN-…“) oder
//   der Nutzer hat „Angenommen“ getippt (Merker auf dem Gerät, data/quoteFollowUp.ts)
// - abgelehnt: Angebot am Server storniert mit Grund „Abgelehnt: …“ (invoice_set_status, wie „Stornieren …“)
// - „später erinnern“ / „nachgefasst am“: Merker auf dem Gerät (ausgestellte Belege sind am Server unveränderlich)
import { addDaysYmd, calendarDaysBetween, euro, totals, type InvoiceDraft } from './invoice';

export const DEFAULT_FOLLOW_UP_DAYS = 10;
export const FOLLOW_UP_DAY_CHOICES = [7, 10, 14, 21] as const;
/** nach einer Nachfass-Nachricht bzw. „später erinnern“ wieder fällig nach … Tagen */
export const SNOOZE_DAYS = 7;
/** Vorsilbe des Storno-Grunds für abgelehnte Angebote (Server verlangt mindestens 3 Zeichen Grund) */
export const REJECT_PREFIX = 'Abgelehnt: ';
export const WIN_RATE_DAYS = 90;

/** Beleg wie die Liste ihn liefert (StoredInvoice-Ausschnitt) */
export interface QuoteLike {
  id: string;
  kind: 'invoice' | 'quote' | 'credit';
  status: 'draft' | 'issued' | 'paid' | 'canceled';
  number?: string;
  issuedAt?: string;
  dueAt?: string;
  canceledReason?: string;
  siteId?: string;
  netCents: number;
  grossCents: number;
  data: InvoiceDraft;
}

/** Merker je Angebot auf dem Gerät */
export interface FollowUpMark {
  /** erst ab diesem Tag wieder fällig (JJJJ-MM-TT) */
  snoozeUntil?: string;
  /** zuletzt nachgefasst (Nachricht geöffnet) */
  nudgedAt?: string;
  nudges?: number;
  /** „Angenommen“ getippt (Rechnung evtl. noch nicht angelegt) */
  acceptedAt?: string;
}
export type FollowUpMarks = Record<string, FollowUpMark>;

export type QuoteState = 'draft' | 'open' | 'accepted' | 'rejected' | 'canceled';

/** Zeile der Tabelle quote_follow_up (NACHTRAG-ANGEBOTE-2026-11-07.sql) */
export interface FollowUpRow {
  invoice_id: string;
  snooze_until?: string | null;
  nudged_at?: string | null;
  nudges?: number | null;
  accepted_at?: string | null;
}

const laterDay = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);
const earlierDay = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b);

/**
 * Zwei Merker-Stände zusammenführen (Server + Gerät, z. B. beim ersten Hochladen): später erinnern / nachgefasst = der
 * spätere Tag, Anzahl = die größere, angenommen = der frühere Tag. So geht auf keiner Seite etwas verloren.
 */
export function mergeMarks(a: FollowUpMark | undefined, b: FollowUpMark | undefined): FollowUpMark {
  const out: FollowUpMark = {};
  const snooze = laterDay(a?.snoozeUntil, b?.snoozeUntil);
  const nudged = laterDay(a?.nudgedAt, b?.nudgedAt);
  const nudges = Math.max(a?.nudges ?? 0, b?.nudges ?? 0);
  const accepted = earlierDay(a?.acceptedAt, b?.acceptedAt);
  if (snooze) out.snoozeUntil = snooze;
  if (nudged) out.nudgedAt = nudged;
  if (nudges) out.nudges = nudges;
  if (accepted) out.acceptedAt = accepted;
  return out;
}

/** Tabellenzeile → Merker (Zeitstempel als Tag in Ortszeit; `toDay` = lib/dates localDay) */
export function markFromRow(r: FollowUpRow, toDay: (d: Date) => string): FollowUpMark {
  const day = (ts?: string | null) => (ts ? (/^\d{4}-\d{2}-\d{2}$/.test(ts) ? ts : toDay(new Date(ts))) : undefined);
  return mergeMarks({ snoozeUntil: r.snooze_until ?? undefined, nudgedAt: day(r.nudged_at), nudges: r.nudges ?? 0, acceptedAt: day(r.accepted_at) }, undefined);
}

/** Merker → Tabellenzeile (Tage als 12:00 Uhr, damit der Tag in jeder Zeitzone gleich bleibt) */
export function rowFromMark(invoiceId: string, orgId: string, m: FollowUpMark): FollowUpRow & { org_id: string } {
  const noon = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00` : null);
  return { invoice_id: invoiceId, org_id: orgId, snooze_until: m.snoozeUntil ?? null, nudged_at: noon(m.nudgedAt), nudges: m.nudges ?? 0, accepted_at: noon(m.acceptedAt) };
}

/** Server ohne NACHTRAG-ANGEBOTE: Tabelle fehlt (Postgres 42P01, PostgREST PGRST205/PGRST204) */
export function isMissingTable(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST204') return true;
  return /could not find the table|relation .*quote_follow_up.* does not exist|schema cache/i.test(e.message ?? '');
}

const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);
/** Tag JJJJ-MM-TT aus einem Datumsfeld (issued_at/due_at sind date-Spalten, Merker werden als Tag gespeichert) */
const day10 = (s: string) => s.slice(0, 10); // fehlermuster-ok: nur Datumsfelder (date / JJJJ-MM-TT), keine Zeitstempel
const deDay = (s?: string) => (isYmd(s) ? day10(s).split('-').reverse().join('.') : '');

export const isRejectedReason = (reason?: string) => typeof reason === 'string' && reason.trim().toLowerCase().startsWith(REJECT_PREFIX.trim().toLowerCase());

/** Storno-Grund für „Abgelehnt“ (immer lang genug für den Server, gekürzt auf 300 Zeichen wie dort) */
export function rejectReasonText(why: string): string {
  const w = why.replace(/\s+/g, ' ').trim();
  return `${REJECT_PREFIX}${w || 'ohne Angabe'}`.slice(0, 300);
}

/** Angebotsnummern, auf die eine Rechnung verweist (data.fromQuote oder Hinweis „Laut Angebot AN-…“) */
export function acceptedQuoteNumbers(all: QuoteLike[]): Set<string> {
  const out = new Set<string>();
  for (const x of all) {
    if (x.kind !== 'invoice') continue;
    const from = (x.data as { fromQuote?: unknown }).fromQuote;
    if (typeof from === 'string' && from.trim()) out.add(from.trim());
    const m = typeof x.data.notes === 'string' ? x.data.notes.match(/Laut Angebot ([A-Za-z0-9]+-\d{4}-\d+)\./) : null;
    if (m) out.add(m[1]);
  }
  return out;
}

export function quoteState(q: QuoteLike, accepted: Set<string>, marks: FollowUpMarks): QuoteState {
  if (q.status === 'draft') return 'draft';
  if (q.status === 'canceled') return isRejectedReason(q.canceledReason) ? 'rejected' : 'canceled';
  if ((q.number && accepted.has(q.number)) || marks[q.id]?.acceptedAt) return 'accepted';
  return 'open';
}

/** Betrag fürs Nachfassen: Privatkunde brutto, Firmenkunde netto (so steht es auch im Angebot im Blick) */
export function quoteAmount(q: QuoteLike): { cents: number; label: string } {
  const t = totals(q.data);
  if (q.data.vatMode === 'normal' && !q.data.recipient?.private) return { cents: t.netCents, label: `${euro(t.netCents)} netto` };
  return { cents: t.grossCents, label: q.data.vatMode === 'normal' ? `${euro(t.grossCents)} inkl. USt` : euro(t.grossCents) };
}

export interface FollowUpItem {
  quote: QuoteLike;
  /** Tage seit dem Angebotsdatum */
  ageDays: number;
  /** ab diesem Tag (wieder) nachfassen */
  nextDue: string;
  due: boolean;
  /** Gültigkeit (dueAt) schon vorbei */
  expired: boolean;
  validUntil?: string;
  amount: { cents: number; label: string };
  nudges: number;
  lastNudge?: string;
  snoozedUntil?: string;
}

/**
 * Offene Angebote mit Nachfass-Termin. Fällig = Angebotsdatum + `days`, nach einer Nachricht + 7 Tage, nach „später
 * erinnern“ ab dem gemerkten Tag — der späteste dieser Tage zählt. Sortiert: am längsten fällig zuerst.
 */
export function followUps(all: QuoteLike[], marks: FollowUpMarks, today: string, days = DEFAULT_FOLLOW_UP_DAYS): { due: FollowUpItem[]; waiting: FollowUpItem[] } {
  const accepted = acceptedQuoteNumbers(all);
  const d = Number.isFinite(days) && days > 0 ? Math.round(days) : DEFAULT_FOLLOW_UP_DAYS;
  const items: FollowUpItem[] = [];
  for (const q of all) {
    if (q.kind !== 'quote' || !isYmd(q.issuedAt) || quoteState(q, accepted, marks) !== 'open') continue;
    const issued = day10(q.issuedAt);
    const m = marks[q.id] ?? {};
    const candidates = [addDaysYmd(issued, d)];
    if (isYmd(m.nudgedAt)) candidates.push(addDaysYmd(day10(m.nudgedAt), SNOOZE_DAYS));
    if (isYmd(m.snoozeUntil)) candidates.push(day10(m.snoozeUntil));
    const nextDue = candidates.sort().at(-1)!;
    const validUntil = isYmd(q.dueAt) ? day10(q.dueAt) : undefined;
    items.push({
      quote: q,
      ageDays: Math.max(0, calendarDaysBetween(issued, today)),
      nextDue,
      due: nextDue <= today,
      expired: !!validUntil && validUntil < today,
      validUntil,
      amount: quoteAmount(q),
      nudges: m.nudges ?? 0,
      lastNudge: isYmd(m.nudgedAt) ? day10(m.nudgedAt) : undefined,
      snoozedUntil: isYmd(m.snoozeUntil) && m.snoozeUntil > today ? day10(m.snoozeUntil) : undefined,
    });
  }
  const due = items.filter((x) => x.due).sort((a, b) => a.nextDue.localeCompare(b.nextDue) || b.amount.cents - a.amount.cents);
  const waiting = items.filter((x) => !x.due).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  return { due, waiting };
}

/**
 * Freundlicher Nachfass-Text (Du/Sie: Kunden werden gesiezt; Ton neutral für AT und DE — kein „Grüß Gott“/„Moin“).
 * Abgelaufene Gültigkeit: Angebot, die Preise zu bestätigen oder anzupassen.
 */
export function followUpText(c: {
  customerName?: string;
  number?: string;
  amountLabel: string;
  ageDays: number;
  validUntil?: string;
  expired?: boolean;
  firmName?: string;
  inspectorName?: string;
  /** schon einmal nachgefasst → kürzer, ohne Druck */
  again?: boolean;
}): string {
  const name = c.customerName?.trim();
  const hello = name ? `Guten Tag ${name},` : 'Guten Tag,';
  const sign = [c.inspectorName?.trim(), c.firmName?.trim()].filter(Boolean).join(', ') || 'Ihr Installateur';
  const nr = c.number ? ` ${c.number}` : '';
  const when = c.ageDays >= 2 ? `vor ${c.ageDays} Tagen` : 'kürzlich';
  const validNote = c.validUntil && !c.expired ? ` (gültig bis ${deDay(c.validUntil)})` : '';
  const expiredLine = c.validUntil && c.expired ? `\nDas Angebot war bis ${deDay(c.validUntil)} gültig — gerne bestätigen wir Ihnen die Preise oder passen es an.` : '';
  if (c.again) {
    return `${hello}\nich melde mich noch einmal kurz zu unserem Angebot${nr} über ${c.amountLabel}${validNote}.${expiredLine}\nPasst es für Sie, oder dürfen wir etwas ändern? Eine kurze Antwort genügt.\nViele Grüße\n${sign}`;
  }
  return `${hello}\n${when} haben wir Ihnen unser Angebot${nr} über ${c.amountLabel} geschickt${validNote}.${expiredLine}\nHaben Sie noch Fragen dazu, oder sollen wir etwas anpassen? Gerne besprechen wir es auch kurz am Telefon.\nWenn es für Sie passt, genügt eine kurze Antwort — dann planen wir den Termin ein.\nViele Grüße\n${sign}`;
}

/** Gewinnquote der letzten `windowDays` Tage (nach Angebotsdatum): angenommen / abgelehnt / offen */
export function winRate(all: QuoteLike[], marks: FollowUpMarks, today: string, windowDays = WIN_RATE_DAYS): { accepted: number; rejected: number; open: number; rate: number | null } {
  const accepted = acceptedQuoteNumbers(all);
  const from = addDaysYmd(today, -windowDays);
  const r = { accepted: 0, rejected: 0, open: 0 };
  for (const q of all) {
    if (q.kind !== 'quote' || !isYmd(q.issuedAt) || day10(q.issuedAt) < from) continue;
    const s = quoteState(q, accepted, marks);
    if (s === 'accepted') r.accepted++;
    else if (s === 'rejected') r.rejected++;
    else if (s === 'open') r.open++;
  }
  const decided = r.accepted + r.rejected;
  return { ...r, rate: decided ? Math.round((r.accepted / decided) * 100) : null };
}
