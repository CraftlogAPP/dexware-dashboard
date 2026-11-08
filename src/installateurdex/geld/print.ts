// Rechnung/Angebot zum Drucken bzw. „Als PDF speichern“ im Browser — Aufbau wie App mobile/src/pdf/invoice.ts
// (buildInvoiceHtml), Ausgabe über openReportWindow (src/lib/print.ts). Logo/Firmenfarbe nur mit Pro (wie App).
// Bezahl-QR (EPC/GiroCode) wie App shareInvoicePdf: nur ausgestellte Rechnungen, nicht wenn bezahlt (geld/qr.ts).

import { activeDeductions, deductionGross, epcPayload, euro, legalNotes, lineNet, toCiiXml, totals, type InvoiceDraft, type InvoiceProfile } from './invoice';
import { toEbInterfaceXml } from './ebInterface';
import { qrSvg } from './qr';
import { isSafeImgSrc } from '../../lib/imgSrc';

const DEFAULT_BRAND_COLOR = '#B5651D'; // wie App lib/branding.ts

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
// Alles, was ins Druckfenster geht, wird maskiert — auch Zahlen/Daten (kommen aus jsonb, siehe api.ts normalizeDraft).
const day = (iso?: string) => (iso ? esc(String(iso).slice(0, 10).split('-').reverse().join('.')) : '');
const qty = (n: number) => esc(Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 }));
const rate = (n: number) => esc(String(Number(n))); // wie App: Rohzahl (z. B. 8.1), aber garantiert eine Zahl
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** wie App pdf/report.ts pdfFileName (ohne Endung — der Browser nimmt den Titel als Dateinamen) */
export function fileBase(...parts: (string | undefined)[]): string {
  const base = parts
    .filter(Boolean)
    .join('_')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 90);
  return base || 'Protokoll';
}

export interface InvoiceDoc {
  draft: InvoiceDraft;
  profile: InvoiceProfile;
  number?: string;
  issuedAt?: string;
  dueAt?: string;
  status?: 'draft' | 'issued' | 'paid' | 'canceled';
}

export interface DocBranding {
  pro: boolean;
  brandColor?: string | null;
  logoUrl?: string | null;
}

function imgSrc(u: string | null | undefined): string {
  if (!u) return '';
  return isSafeImgSrc(u) ? esc(u) : '';
}

export function docTitle(d: InvoiceDraft): string {
  return d.kind === 'quote' ? 'Angebot' : d.kind === 'credit' ? 'Stornorechnung' : activeDeductions(d).length ? 'Schlussrechnung' : d.partial ? 'Abschlagsrechnung' : 'Rechnung';
}

export function buildInvoiceHtml(doc: InvoiceDoc, branding: DocBranding): string {
  const { draft: d, profile: p } = doc;
  const t = totals(d);
  const pro = branding.pro;
  const accent = pro && branding.brandColor && /^#[0-9A-Fa-f]{6}$/.test(branding.brandColor) ? branding.brandColor : DEFAULT_BRAND_COLOR;
  const logo = pro && imgSrc(branding.logoUrl) ? `<img class="logo" src="${imgSrc(branding.logoUrl)}" alt="Logo" />` : '';
  const quote = d.kind === 'quote';
  const credit = d.kind === 'credit';
  const sgn = (c: number) => euro(credit ? -c : c); // Stornorechnung: Beträge negativ
  const title = docTitle(d);
  const notes = [...legalNotes(d, p), ...(d.notes?.trim() ? [d.notes.trim()] : [])];
  const r = d.recipient;
  const period = d.serviceDateTo && d.serviceDateTo !== d.serviceDate ? `${day(d.serviceDate)} – ${day(d.serviceDateTo)}` : day(d.serviceDate);
  const stamp =
    doc.status === 'paid' ? '<div class="stamp paid">BEZAHLT</div>' : doc.status === 'canceled' ? '<div class="stamp canceled">STORNIERT</div>' : !doc.number ? '<div class="stamp draft">ENTWURF</div>' : '';
  const rows = d.lines
    .map(
      (l, i) =>
        `<tr><td class="pos">${i + 1}</td><td>${esc(l.text)}</td><td class="num">${qty(l.qty)} ${esc(l.unit)}</td><td class="num">${sgn(l.unitPriceCents)}</td>${
          d.vatMode === 'normal' ? `<td class="num">${rate(l.vatRate)} %</td>` : ''
        }<td class="num">${sgn(lineNet(l))}</td></tr>`,
    )
    .join('');
  const vatRows =
    d.vatMode === 'normal' ? t.byRate.map((g) => `<tr><td>zzgl. ${rate(g.rate)} % USt auf ${sgn(g.baseCents)}</td><td class="num">${sgn(g.vatCents)}</td></tr>`).join('') : '';
  // Schlussrechnung (wie App pdf/invoice.ts): je Abschlagsrechnung Netto / USt / Brutto abziehen, darunter der Rest
  const ded = activeDeductions(d);
  const dedRows = ded
    .map((x) => {
      const parts = x.byRate
        .map((pt) => (d.vatMode === 'normal' ? `netto ${sgn(-pt.netCents)} · USt ${rate(pt.rate)} % ${sgn(-pt.vatCents)}` : `netto ${sgn(-pt.netCents)}`))
        .join('<br/>');
      return `<tr class="ded"><td>abzüglich Abschlagsrechnung Nr. ${esc(x.number)}${x.issuedAt ? ` vom ${day(x.issuedAt)}` : ''}<div class="sub">${parts}</div></td><td class="num">${sgn(-deductionGross(x))}</td></tr>`;
    })
    .join('');
  const restRows = ded.length
    ? `<tr class="rest"><td>Restbetrag netto</td><td class="num">${sgn(t.restByRate.reduce((s, g) => s + g.baseCents, 0))}</td></tr>${
        d.vatMode === 'normal' ? t.restByRate.map((g) => `<tr><td>verbleibende USt ${rate(g.rate)} % auf ${sgn(g.baseCents)}</td><td class="num">${sgn(g.vatCents)}</td></tr>`).join('') : ''
      }${t.manualPrepaidCents > 0 ? `<tr><td>abzüglich weitere Zahlungen</td><td class="num">${sgn(-t.manualPrepaidCents)}</td></tr>` : ''}<tr class="total"><td>${
        credit ? 'Gutschrift (Rest)' : t.dueCents < 0 ? 'Überzahlung' : 'Zu zahlen'
      }</td><td class="num">${sgn(t.dueCents)}</td></tr>`
    : '';
  const sender = [p.legalName, p.street, `${p.zip} ${p.city}`].filter((x) => x?.trim()).map(esc).join(' · ');
  const name = fileBase(title, doc.number ?? 'Entwurf', r.name);
  // wie App shareInvoicePdf: EPC nur für ausgestellte Rechnungen (Nummer vorhanden), Betrag = zu zahlen
  const epc = d.kind === 'invoice' && doc.number ? epcPayload(p, t.dueCents, doc.number) : null;
  const epcSvg = epc ? qrSvg(epc) : '';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><title>${esc(name)}</title><style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1B1F24; font-size: 10.5pt; max-width: 180mm; margin: 0 auto; }
  .bar { height: 6px; background: ${accent}; border-radius: 3px; margin-bottom: 18px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .logo { max-height: 56px; max-width: 200px; }
  .firm { text-align: right; font-size: 9pt; color: #646B74; line-height: 1.45; }
  .firm b { color: #1B1F24; font-size: 11pt; }
  .sender { font-size: 7.5pt; color: #8A9098; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin: 26px 0 6px; display: inline-block; }
  .to { line-height: 1.45; min-height: 70px; }
  h1 { font-size: 20pt; margin: 26px 0 2px; color: ${accent}; letter-spacing: -0.3px; }
  .meta { display: grid; grid-template-columns: repeat(4, auto); gap: 2px 26px; font-size: 9pt; color: #646B74; margin: 6px 0 18px; justify-content: start; }
  .meta b { color: #1B1F24; display: block; font-size: 10pt; }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines th { text-align: left; font-size: 8.5pt; color: #646B74; font-weight: 600; border-bottom: 2px solid ${accent}; padding: 6px 4px; }
  table.lines td { padding: 7px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
  thead { display: table-header-group; } tr { break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; } .pos { color: #8A9098; width: 18px; }
  table.sum { margin-left: auto; margin-top: 10px; min-width: 260px; border-collapse: collapse; break-inside: avoid; }
  table.sum td { padding: 4px 4px; } table.sum .ded td { padding-top: 8px; } table.sum .sub { font-size: 8.5pt; color: #646B74; }
  table.sum .rest td { border-top: 1px solid #ddd; padding-top: 8px; font-weight: 700; }
  .intro { margin: 0 0 14px; line-height: 1.5; }
  table.sum .total td { font-size: 13pt; font-weight: 800; border-top: 2px solid ${accent}; padding-top: 8px; }
  .notes { margin-top: 18px; font-size: 9pt; color: #3f454d; line-height: 1.5; }
  .pay { margin-top: 16px; padding: 10px 12px; background: #F6F4F1; border-radius: 8px; font-size: 9.5pt; line-height: 1.5; overflow: hidden; break-inside: avoid; }
  .qr { float: right; width: 92px; text-align: center; font-size: 7pt; color: #646B74; margin-left: 12px; } .qr svg { width: 92px; height: 92px; display: block; background: #fff; padding: 4px; }
  .labor { font-size: 8.5pt; color: #646B74; margin-top: 6px; }
  footer { margin-top: 28px; font-size: 7.5pt; color: #8A9098; border-top: 1px solid #eee; padding-top: 6px; line-height: 1.5; }
  .stamp { position: fixed; top: 38%; left: 18%; transform: rotate(-18deg); font-size: 54pt; font-weight: 900; letter-spacing: 6px; border: 6px solid; border-radius: 14px; padding: 4px 22px; opacity: .18; }
  .stamp.paid { color: #16A34A; } .stamp.canceled { color: #DC2626; } .stamp.draft { color: #646B74; }
</style></head><body>
${stamp}
<div class="bar"></div>
<header><div>${logo}</div><div class="firm"><b>${esc(p.legalName)}</b><br/>${esc(p.street)}<br/>${esc(p.zip)} ${esc(p.city)}${p.phone ? `<br/>${esc(p.phone)}` : ''}${p.email ? `<br/>${esc(p.email)}` : ''}</div></header>
<div class="sender">${sender}</div>
<div class="to">${esc(r.name)}${r.street ? `<br/>${esc(r.street)}` : ''}${r.zip || r.city ? `<br/>${esc(r.zip ?? '')} ${esc(r.city ?? '')}` : ''}${r.uid ? `<br/>UID: ${esc(r.uid)}` : ''}</div>
<h1>${title}${doc.number ? ` ${esc(doc.number)}` : ''}</h1>
<div class="meta">
  <div>Datum<b>${day(doc.issuedAt) || day(localDay())}</b></div>
  ${quote ? `<div>Gültig bis<b>${day(doc.dueAt) || '30 Tage'}</b></div>` : `<div>Leistung<b>${period}</b></div>`}
  ${credit && d.cancels ? `<div>Zu Rechnung<b>${esc(d.cancels)}</b></div>` : ''}
  ${!quote && !credit && doc.dueAt ? `<div>Fällig am<b>${day(doc.dueAt)}</b></div>` : ''}
  ${p.uid ? `<div>Unsere UID<b>${esc(p.uid)}</b></div>` : p.taxNumber ? `<div>Steuernummer<b>${esc(p.taxNumber)}</b></div>` : ''}
</div>
${d.intro?.trim() ? `<p class="intro">${esc(d.intro.trim()).replace(/\n/g, '<br/>')}</p>` : ''}
<table class="lines"><thead><tr><th></th><th>Leistung / Material</th><th class="num">Menge</th><th class="num">Einzelpreis</th>${d.vatMode === 'normal' ? '<th class="num">USt</th>' : ''}<th class="num">Betrag</th></tr></thead><tbody>${rows}</tbody></table>
<table class="sum">
  <tr><td>Summe netto</td><td class="num">${sgn(t.netCents)}</td></tr>
  ${vatRows}
  <tr class="total"><td>${quote ? 'Angebotssumme' : credit ? 'Gutschrift gesamt' : ded.length ? 'Gesamtleistung brutto' : 'Gesamtbetrag'}</td><td class="num">${sgn(t.grossCents)}</td></tr>
  ${ded.length ? `${dedRows}${restRows}` : t.prepaidCents > 0 && !quote ? `<tr><td>abzüglich Abschläge</td><td class="num">− ${euro(t.prepaidCents)}</td></tr><tr class="total"><td>Zu zahlen</td><td class="num">${euro(t.dueCents)}</td></tr>` : ''}
</table>
${p.land === 'DE' && r.private && t.laborGrossCents > 0 && !quote ? `<div class="labor">Darin enthaltene Arbeits- und Fahrtkosten (§ 35a EStG): ${euro(t.laborGrossCents)} inkl. USt</div>` : ''}
${notes.length ? `<div class="notes">${notes.map(esc).join('<br/>')}</div>` : ''}
${!quote && !credit && p.iban && t.dueCents > 0 ? `<div class="pay">${epcSvg && doc.status !== 'paid' ? `<div class="qr">${epcSvg}<span>Mit der Banking-App scannen</span></div>` : ''}Bitte überweisen Sie ${euro(t.dueCents)}${doc.dueAt ? ` bis ${day(doc.dueAt)}` : ''} auf<br/><b>IBAN ${esc(p.iban)}</b>${p.bic ? ` · BIC ${esc(p.bic)}` : ''}<br/>Verwendungszweck: ${esc(doc.number ?? title)}</div>` : ''}
${quote ? '<div class="notes">Wir freuen uns auf Ihren Auftrag. Preise gelten bei Auftragserteilung innerhalb der Gültigkeit.</div>' : ''}
<footer>${esc(p.legalName)} · ${esc(p.street)} · ${esc(p.zip)} ${esc(p.city)}${p.uid ? ` · UID ${esc(p.uid)}` : ''}${p.taxNumber ? ` · St.-Nr. ${esc(p.taxNumber)}` : ''}${p.iban ? ` · IBAN ${esc(p.iban)}` : ''}<br/>Erstellt mit InstallateurDex</footer>
</body></html>`;
}

/** E-Rechnung (EN 16931, CII-XML) als Datei herunterladen — wie App shareEInvoice (DE: XRechnung-Kennung). */
export function downloadEInvoice(doc: InvoiceDoc, guideline: 'en16931' | 'xrechnung', buyerReference?: string): void {
  if (!doc.number || !doc.issuedAt) throw new Error('Die E-Rechnung gibt es erst nach dem Ausstellen.');
  const xmlText = toCiiXml(doc.draft, doc.profile, { number: doc.number, issueDate: doc.issuedAt, guideline, buyerReference: buyerReference?.trim() || undefined });
  downloadXml(xmlText, `${fileBase('E-Rechnung', doc.number)}.xml`);
}

/**
 * E-Rechnung im österreichischen Format ebInterface 6.1 (Bund/Länder/Gemeinden, Upload auf e-rechnung.gv.at) — wie App
 * shareEbInterface. Auftragsreferenz und Lieferantennummer gibt der öffentliche Auftraggeber vor.
 */
export function downloadEbInterface(doc: InvoiceDoc, ids: { orderReference?: string; supplierId?: string } = {}): void {
  if (!doc.number || !doc.issuedAt) throw new Error('Die E-Rechnung gibt es erst nach dem Ausstellen.');
  const xmlText = toEbInterfaceXml(doc.draft, doc.profile, { number: doc.number, issueDate: doc.issuedAt, orderReference: ids.orderReference, supplierId: ids.supplierId });
  downloadXml(xmlText, `${fileBase('ebInterface', doc.number)}.xml`);
}

function downloadXml(xmlText: string, fileName: string): void {
  const blob = new Blob([xmlText], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
