// wie App mobile/src/lib/invoiceExport.ts — wortgleich übernommen (nur Importe angepasst). Änderungen IMMER in beiden Repos.
// Rechnungsausgangsbuch als CSV für Steuerberatung/Buchhaltung (BMD, DATEV & Co. lesen Semikolon-CSV ein).
// Rein (ohne RN) — getestet in scripts/test-invoice-export.js.
import { activeDeductions, totals, type InvoiceDraft } from './invoice';

export interface ExportRow {
  kind: 'invoice' | 'quote' | 'credit';
  number?: string;
  status: string;
  issuedAt?: string;
  paidAt?: string;
  data: InvoiceDraft;
}

export type Period = 'month' | 'quarter' | 'year';

/** Zeitraum (lokal) um ein Datum: Monat, Quartal oder Jahr → [von, bis) als JJJJ-MM-TT */
export function periodRange(ref: Date, p: Period): { from: string; to: string; label: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const ymd = (yy: number, mm: number) => `${yy + Math.floor(mm / 12)}-${String((mm % 12) + 1).padStart(2, '0')}-01`;
  if (p === 'month') return { from: ymd(y, m), to: ymd(y, m + 1), label: `${String(m + 1).padStart(2, '0')}-${y}` };
  if (p === 'quarter') {
    const q = Math.floor(m / 3);
    return { from: ymd(y, q * 3), to: ymd(y, q * 3 + 3), label: `Q${q + 1}-${y}` };
  }
  return { from: `${y}-01-01`, to: `${y + 1}-01-01`, label: String(y) };
}

// Nur echte Daten JJJJ-MM-TT ausgeben, sonst leer — das Leistungsdatum stammt aus dem Entwurf (jsonb) und darf weder
// Formel noch Semikolon in die Datei bringen. Ebenso der USt-Satz: nur als Zahl (Sicherheits-Nachtrag 06.11.).
const de = (iso?: string) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('.') : '');
const pct = (n: unknown) => (Number.isFinite(Number(n)) ? String(Number(n)) : '0');
/** Zeitstempel → lokaler Tag TT.MM.JJJJ (Zahlung um 23:30 zählt zum selben Tag) */
const deTs = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};
const num = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
/**
 * Textfeld in Anführungszeichen. Beginnt der Text mit = + - @ Tab oder CR, kommt ein ' davor — sonst führt Excel
 * ihn als Formel aus (CSV-Injection, Empfehlung OWASP). Bewusst ' statt Tab/Leerzeichen: Tab und CR gelten selbst als
 * gefährliche Anfangszeichen (Programme, die sie wegtrimmen, sähen wieder das =), und das sichtbare ' betrifft nur
 * solche seltenen Namen. Zahlenspalten (auch negative Storno-Beträge) bleiben unberührt, damit DATEV/BMD sie als Zahl lesen.
 */
const q = (s: unknown) => {
  let t = String(s ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};
const STATUS: Record<string, string> = { issued: 'offen', paid: 'bezahlt', canceled: 'storniert' };

/**
 * Eine Zeile je Beleg und Steuersatz (gemischte Sätze → mehrere Zeilen). Nur ausgestellte Rechnungen und
 * Stornorechnungen im Zeitraum (nach Rechnungsdatum); Angebote und Entwürfe nicht. Stornorechnungen negativ.
 */
export function invoiceBookCsv(rows: ExportRow[], from: string, to: string): string {
  const head = ['Belegdatum', 'Belegnummer', 'Belegart', 'Kunde', 'UID Kunde', 'Leistungsdatum', 'Netto', 'USt-Satz', 'USt', 'Brutto', 'Steuerart', 'Status', 'Bezahlt am', 'Bezug'].join(';');
  const out: string[] = [head];
  const list = rows
    .filter((r) => (r.kind === 'invoice' || r.kind === 'credit') && r.number && r.issuedAt && r.issuedAt.slice(0, 10) >= from && r.issuedAt.slice(0, 10) < to) // fehlermuster-ok: issued_at ist ein Datum (date), kein Zeitstempel
    .sort((a, b) => (a.issuedAt ?? '').localeCompare(b.issuedAt ?? '') || (a.number ?? '').localeCompare(b.number ?? ''));
  for (const r of list) {
    const sign = r.kind === 'credit' ? -1 : 1;
    const t = totals(r.data);
    const vatMode = r.data.vatMode === 'kleinunternehmer' ? 'Kleinunternehmer' : r.data.vatMode === 'reverseCharge' ? 'Reverse Charge' : 'Normal';
    const groups = t.byRate.length ? t.byRate : [{ rate: 0, baseCents: 0, vatCents: 0 }];
    const final = t.deductedByRate.length > 0;
    for (const g of groups) {
      out.push([
        de(r.issuedAt), q(r.number), r.kind === 'credit' ? 'Stornorechnung' : final ? 'Schlussrechnung' : r.data.partial ? 'Abschlagsrechnung' : 'Rechnung',
        q(r.data.recipient.name), q(r.data.recipient.uid ?? ''), de(r.data.serviceDateTo || r.data.serviceDate),
        num(sign * g.baseCents), pct(g.rate), num(sign * g.vatCents), num(sign * (g.baseCents + g.vatCents)),
        vatMode, r.kind === 'credit' ? 'Storno' : STATUS[r.status] ?? r.status, deTs(r.paidAt), q(r.data.cancels ?? ''),
      ].join(';'));
    }
    // Schlussrechnung: je abgezogener Abschlagsrechnung und Steuersatz eine Gegenzeile (sonst doppelter Umsatz)
    for (const x of activeDeductions(r.data)) {
      for (const p of x.byRate) {
        const net = Math.round(Number(p.netCents) || 0);
        const vat = Math.round(Number(p.vatCents) || 0);
        out.push([
          de(r.issuedAt), q(r.number), 'Abzug Abschlagsrechnung', q(r.data.recipient.name), q(r.data.recipient.uid ?? ''), de(r.data.serviceDateTo || r.data.serviceDate),
          num(-sign * net), pct(p.rate), num(-sign * vat), num(-sign * (net + vat)),
          vatMode, r.kind === 'credit' ? 'Storno' : STATUS[r.status] ?? r.status, deTs(r.paidAt), q(x.number),
        ].join(';'));
      }
    }
  }
  return out.join('\r\n');
}
