// wie App mobile/src/lib/invoice.ts — wortgleich übernommen (nur Importe angepasst). Änderungen IMMER in beiden Repos.
// Rechnung & Angebot aus dem Einsatz (ROADMAP Phase 5b, A1) — reine Logik ohne RN/Netz, getestet in
// scripts/test-invoice.js. Beträge immer in CENT (ganze Zahlen), Mengen als Dezimalzahl.
//
// Rechtliches (Fakten, keine Zusicherung): Pflichtangaben AT § 11 UStG (Kleinbetragsrechnung bis 400 € brutto),
// DE § 14 Abs. 4 UStG (Kleinbetragsrechnung bis 250 € brutto, § 33 UStDV). Kleinunternehmer AT § 6 Abs. 1 Z 27 UStG,
// DE § 19 UStG. Übergang der Steuerschuld bei Bauleistungen AT § 19 Abs. 1a UStG, DE § 13b UStG.
// E-Rechnung: EN 16931 im Format UN/CEFACT CII (lesbar für XRechnung-/ZUGFeRD-Empfänger).
/** wie App mobile/src/types.ts */
export type Land = 'DE' | 'AT' | 'CH';
/** wie App mobile/src/types.ts (Material im Einsatz) */
export interface MaterialLine {
  name: string;
  qty: string;
  unit?: string;
}

export type InvoiceKind = 'invoice' | 'quote' | 'credit'; // credit = Stornorechnung (vom Server erzeugt)
export type VatMode = 'normal' | 'kleinunternehmer' | 'reverseCharge';
export type LineKind = 'labor' | 'travel' | 'material' | 'flat' | 'other';

export interface InvoiceProfile {
  legalName: string; // Firmenwortlaut
  street: string;
  zip: string;
  city: string;
  land: Land;
  uid?: string; // UID / USt-IdNr. (ATU…, DE…)
  taxNumber?: string; // Steuernummer (DE: Steuernummer ODER USt-IdNr. Pflicht)
  iban?: string;
  bic?: string;
  email?: string;
  phone?: string;
  vatRate: number; // Normalsatz in % (AT 20, DE 19)
  hourlyRateCents?: number; // Stundensatz netto
  travelFlatCents?: number; // Anfahrtspauschale netto
  laborStepMinutes?: number; // Abrechnungstakt (Standard 15)
  paymentDays: number; // Zahlungsziel
  kleinunternehmer?: boolean;
}

export interface InvoiceParty {
  name: string;
  street?: string;
  zip?: string;
  city?: string;
  land?: Land;
  uid?: string;
  email?: string;
  /** Endkunde ist Privatperson (DE: Aufbewahrungshinweis § 14 Abs. 4 Nr. 9 UStG) */
  private?: boolean;
}

export interface InvoiceLine {
  kind: LineKind;
  text: string;
  qty: number;
  unit: string; // „h“, „Stk“, „m“, „pauschal“ …
  unitPriceCents: number; // netto
  vatRate: number; // %
}

export interface InvoiceDraft {
  kind: InvoiceKind;
  recipient: InvoiceParty;
  serviceDate: string; // YYYY-MM-DD (Leistungsdatum) …
  serviceDateTo?: string; // … bis (Leistungszeitraum)
  lines: InvoiceLine[];
  vatMode: VatMode;
  notes?: string;
  /** Nur Abschlags-/Teilrechnung: Hinweis + Typcode 326 */
  partial?: boolean;
  /** schon bezahlte Abschläge (Cent, brutto) — werden in der Schlussrechnung abgezogen */
  prepaidCents?: number;
  /** Stornorechnung: Nummer der stornierten Rechnung + Grund */
  cancels?: string;
  cancelReason?: string;
}

const round = (n: number) => Math.round(n + Number.EPSILON * Math.sign(n));

/** „2,5“ / „3“ / „1.5“ → Zahl; Unlesbares → 1 */
export function parseQty(s: string | number | undefined): number {
  if (typeof s === 'number') return Number.isFinite(s) && s > 0 ? s : 1;
  const n = parseFloat(String(s ?? '').replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Minuten → abzurechnende Stunden im Takt (aufgerundet), z. B. 70 min @15 → 1,25 h */
export function billableHours(minutes: number, step = 15): number {
  if (!minutes || minutes <= 0) return 0;
  const s = step > 0 ? step : 15;
  return (Math.ceil(minutes / s) * s) / 60;
}

export function defaultVatRate(land: Land): number {
  return land === 'DE' ? 19 : 20;
}

/**
 * Positionen aus einem Einsatz: Arbeitszeit (Stundensatz), Anfahrt (Pauschale), Material (Preis aus der eigenen
 * Preisliste nach Name, sonst 0 € zum Ausfüllen — die Rechnung zeigt dann eine Warnung).
 */
export function linesFromInspection(
  insp: { workMinutes?: number; materials?: MaterialLine[]; workDone?: string },
  profile: InvoiceProfile,
  priceList: Record<string, number> = {}
): InvoiceLine[] {
  const rate = profile.kleinunternehmer ? 0 : profile.vatRate;
  const lines: InvoiceLine[] = [];
  const h = billableHours(insp.workMinutes ?? 0, profile.laborStepMinutes ?? 15);
  if (h > 0) {
    const what = (insp.workDone ?? '').trim().split(/\n/)[0].slice(0, 80);
    lines.push({ kind: 'labor', text: what ? `Arbeitszeit: ${what}` : 'Arbeitszeit', qty: h, unit: 'h', unitPriceCents: profile.hourlyRateCents ?? 0, vatRate: rate });
  }
  if (profile.travelFlatCents && profile.travelFlatCents > 0) {
    lines.push({ kind: 'travel', text: 'Anfahrt', qty: 1, unit: 'pauschal', unitPriceCents: profile.travelFlatCents, vatRate: rate });
  }
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const prices = new Map(Object.entries(priceList).map(([k, v]) => [key(k), v]));
  for (const m of insp.materials ?? []) {
    if (!m?.name?.trim()) continue;
    lines.push({ kind: 'material', text: m.name.trim(), qty: parseQty(m.qty), unit: (m.unit ?? 'Stk').trim() || 'Stk', unitPriceCents: prices.get(key(m.name)) ?? 0, vatRate: rate });
  }
  return lines;
}

export const lineNet = (l: InvoiceLine) => round(l.qty * l.unitPriceCents);

export interface InvoiceTotals {
  netCents: number;
  vatCents: number;
  grossCents: number;
  byRate: { rate: number; baseCents: number; vatCents: number }[];
  /** DE § 35a EStG: Arbeits- + Fahrtkosten (brutto) — Steuerermäßigung für Privatkunden */
  laborGrossCents: number;
  prepaidCents: number;
  dueCents: number;
}

/** Summen je Steuersatz (Steuer je Satz auf die Summe gerundet — wie in EN 16931 vorgesehen). */
export function totals(d: InvoiceDraft): InvoiceTotals {
  const noVat = d.vatMode !== 'normal';
  const groups = new Map<number, number>();
  for (const l of d.lines) {
    const r = noVat ? 0 : l.vatRate;
    groups.set(r, (groups.get(r) ?? 0) + lineNet(l));
  }
  const byRate = [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([rate, baseCents]) => ({ rate, baseCents, vatCents: round((baseCents * rate) / 100) }));
  const netCents = byRate.reduce((s, g) => s + g.baseCents, 0);
  const vatCents = byRate.reduce((s, g) => s + g.vatCents, 0);
  const grossCents = netCents + vatCents;
  const laborNet = d.lines.filter((l) => l.kind === 'labor' || l.kind === 'travel').reduce((s, l) => s + lineNet(l), 0);
  const laborGrossCents = noVat ? laborNet : round(laborNet * (1 + (d.lines.find((l) => l.kind === 'labor')?.vatRate ?? 0) / 100));
  const prepaidCents = Math.max(0, d.prepaidCents ?? 0);
  return { netCents, vatCents, grossCents, byRate, laborGrossCents, prepaidCents, dueCents: grossCents - prepaidCents };
}

export const euro = (cents: number) =>
  `${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Pflicht-Hinweise, die auf die Rechnung gehören (Text in Landessprache). */
export function legalNotes(d: InvoiceDraft, p: InvoiceProfile): string[] {
  const out: string[] = [];
  const at = p.land !== 'DE';
  if (d.kind === 'quote') return out;
  if (d.kind === 'credit') {
    out.push(`Stornorechnung zu Rechnung ${d.cancels ?? ''}${d.cancelReason ? ` (Grund: ${d.cancelReason})` : ''}. Die Beträge werden gutgeschrieben.`.replace('Rechnung  ', 'Rechnung '));
  }
  if (d.vatMode === 'kleinunternehmer') {
    out.push(at ? 'Umsatzsteuerbefreit – Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG.' : 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.');
  }
  if (d.vatMode === 'reverseCharge') {
    out.push(at ? 'Übergang der Steuerschuld auf den Leistungsempfänger gemäß § 19 Abs. 1a UStG (Bauleistungen).' : 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).');
  }
  if (!at && d.recipient.private && d.kind !== 'credit') {
    out.push('Sie sind gesetzlich verpflichtet, diese Rechnung zwei Jahre aufzubewahren (§ 14b Abs. 1 Satz 5 UStG).');
  }
  if (d.partial) out.push('Abschlagsrechnung — die Schlussrechnung folgt nach Fertigstellung.');
  return out;
}

/** Fehlende Pflichtangaben / Plausibilität. Leere Liste = vollständig (keine Rechtsberatung). */
export function validate(d: InvoiceDraft, p: InvoiceProfile): string[] {
  const issues: string[] = [];
  const t = totals(d);
  const at = p.land !== 'DE';
  const small = at ? t.grossCents <= 40000 : t.grossCents <= 25000; // Kleinbetragsrechnung
  if (!p.legalName.trim()) issues.push('Firmenname fehlt (Einstellungen → Rechnung).');
  if (!p.street.trim() || !p.zip.trim() || !p.city.trim()) issues.push('Firmenanschrift fehlt.');
  if (d.lines.length === 0) issues.push('Keine Positionen.');
  d.lines.forEach((l, i) => {
    if (!l.text.trim()) issues.push(`Position ${i + 1}: Bezeichnung fehlt.`);
    if (l.unitPriceCents <= 0 && l.kind !== 'other') issues.push(`Position ${i + 1} („${l.text.slice(0, 30)}“): Preis fehlt.`);
  });
  if (d.kind === 'quote') return issues;
  if (!d.serviceDate) issues.push('Leistungsdatum fehlt.');
  if (!small && !d.recipient.name.trim()) issues.push('Name des Kunden fehlt.');
  if (!small && !(d.recipient.street?.trim() && d.recipient.city?.trim())) issues.push('Anschrift des Kunden fehlt.');
  if (at) {
    if (!small && d.vatMode !== 'kleinunternehmer' && !p.uid?.trim()) issues.push('Ihre UID-Nummer fehlt (Pflicht über 400 € brutto).');
    if (d.vatMode === 'normal' && t.grossCents > 1000000 && !d.recipient.private && !d.recipient.uid?.trim()) issues.push('UID des Kunden fehlt (Unternehmer, über 10.000 € brutto).');
  } else if (!small && !p.uid?.trim() && !p.taxNumber?.trim()) {
    issues.push('Steuernummer oder USt-IdNr. fehlt.');
  }
  if (d.vatMode === 'reverseCharge') {
    if (!p.uid?.trim()) issues.push('Reverse Charge: Ihre UID-Nummer fehlt.');
    if (!d.recipient.uid?.trim()) issues.push('Reverse Charge: UID des Kunden fehlt.');
    if (d.recipient.private) issues.push('Reverse Charge gilt nur gegenüber Unternehmern.');
  }
  if (d.vatMode === 'kleinunternehmer' && !p.kleinunternehmer) issues.push('Kleinunternehmer-Regelung ist in den Einstellungen nicht aktiviert.');
  if (t.prepaidCents > t.grossCents) issues.push('Abschläge sind höher als die Rechnungssumme.');
  return issues;
}

// ---------------------------------------------------------------------------------------------------------------
// E-Rechnung (EN 16931, UN/CEFACT CII D16B)
// ---------------------------------------------------------------------------------------------------------------
const xml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const amt = (cents: number) => (cents / 100).toFixed(2);
const qtyStr = (n: number) => String(Math.round(n * 10000) / 10000);
const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
const country = (l?: Land) => (l === 'DE' ? 'DE' : 'AT');

/** „JJJJ-MM-TT“ + n Kalendertage (reine Datumsrechnung, keine Zeitzone) */
export function addDaysYmd(ymdStr: string, n: number): string {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1) + n * 86_400_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Kalendertage von a bis b (beide JJJJ-MM-TT), z. B. Tage überfällig */
export function calendarDaysBetween(aYmd: string, bYmd: string): number {
  const u = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
  return Math.round((u(bYmd) - u(aYmd)) / 86_400_000);
}

/** Einheit → UN/ECE Rec. 20 */
export function unitCode(unit: string): string {
  const u = unit.trim().toLowerCase().replace('.', '');
  if (/^(h|std|stunden?)$/.test(u)) return 'HUR';
  if (/^(m|lfm|meter)$/.test(u)) return 'MTR';
  if (/^(m2|m²|qm)$/.test(u)) return 'MTK';
  if (/^(kg)$/.test(u)) return 'KGM';
  if (/^(l|liter)$/.test(u)) return 'LTR';
  if (/^(pauschal|psch|pausch)$/.test(u)) return 'LS';
  if (/^(stk|stück|st|pcs)$/.test(u)) return 'H87';
  return 'C62';
}

function vatCategory(mode: VatMode): { code: string; reason?: string; reasonCode?: string } {
  if (mode === 'kleinunternehmer') return { code: 'E', reason: 'Kleinunternehmer – keine Umsatzsteuer' };
  if (mode === 'reverseCharge') return { code: 'AE', reason: 'Übergang der Steuerschuld (Reverse Charge)', reasonCode: 'VATEX-EU-AE' };
  return { code: 'S' };
}

/**
 * CII-XML nach EN 16931. `guideline`: 'en16931' (allgemein, z. B. ZUGFeRD EN16931) oder 'xrechnung' (DE, mit
 * Käuferreferenz BT-10 — bei Behörden die Leitweg-ID).
 */
export function toCiiXml(
  d: InvoiceDraft,
  p: InvoiceProfile,
  meta: { number: string; issueDate: string; buyerReference?: string; guideline?: 'en16931' | 'xrechnung' }
): string {
  const t = totals(d);
  const cat = vatCategory(d.vatMode);
  const guide = meta.guideline === 'xrechnung' ? 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0' : 'urn:cen.eu:en16931:2017';
  const credit = d.kind === 'credit';
  const typeCode = credit ? '381' : d.partial ? '326' : '380';
  const dueYmd = addDaysYmd(meta.issueDate.slice(0, 10), p.paymentDays || 0);
  const lines = d.lines
    .map((l, i) => {
      const rate = d.vatMode === 'normal' ? l.vatRate : 0;
      return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${xml(l.text)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${amt(l.unitPriceCents)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${unitCode(l.unit)}">${qtyStr(l.qty)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat.code}</ram:CategoryCode><ram:RateApplicablePercent>${rate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(lineNet(l))}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join('');
  const taxes = t.byRate
    .map(
      (g) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${amt(g.vatCents)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>${cat.reason ? `\n        <ram:ExemptionReason>${xml(cat.reason)}</ram:ExemptionReason>` : ''}
        <ram:BasisAmount>${amt(g.baseCents)}</ram:BasisAmount>
        <ram:CategoryCode>${cat.code}</ram:CategoryCode>${cat.reasonCode ? `\n        <ram:ExemptionReasonCode>${cat.reasonCode}</ram:ExemptionReasonCode>` : ''}
        <ram:RateApplicablePercent>${g.rate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`
    )
    .join('');
  const party = (x: { name: string; street?: string; zip?: string; city?: string; land?: Land; uid?: string; taxNumber?: string; email?: string }) => `
        <ram:Name>${xml(x.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${xml(x.zip ?? '')}</ram:PostcodeCode>
          <ram:LineOne>${xml(x.street ?? '')}</ram:LineOne>
          <ram:CityName>${xml(x.city ?? '')}</ram:CityName>
          <ram:CountryID>${country(x.land)}</ram:CountryID>
        </ram:PostalTradeAddress>${x.email ? `\n        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">${xml(x.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}${
          x.uid ? `\n        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xml(x.uid)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''
        }${x.taxNumber ? `\n        <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${xml(x.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}`;
  const notes = [...legalNotes(d, p), ...(d.notes?.trim() ? [d.notes.trim()] : [])]
    .map((n) => `\n    <ram:IncludedNote><ram:Content>${xml(n)}</ram:Content></ram:IncludedNote>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${guide}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${xml(meta.number)}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${ymd(meta.issueDate)}</udt:DateTimeString></ram:IssueDateTime>${notes}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${xml(meta.buyerReference || d.recipient.name || 'n/a')}</ram:BuyerReference>
      <ram:SellerTradeParty>${party({ name: p.legalName, street: p.street, zip: p.zip, city: p.city, land: p.land, uid: p.uid, taxNumber: p.taxNumber, email: p.email })}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>${party(d.recipient)}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${ymd(d.serviceDateTo || d.serviceDate)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>${
        p.iban && !credit
          ? `
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${xml(p.iban.replace(/\s+/g, ''))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>`
          : ''
      }${taxes}${
        credit
          ? ''
          : `
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${xml(`Zahlbar bis ${dueYmd.split('-').reverse().join('.')} ohne Abzug.`)}</ram:Description>
        <ram:DueDateDateTime><udt:DateTimeString format="102">${ymd(dueYmd)}</udt:DateTimeString></ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>`
      }
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amt(t.netCents)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amt(t.netCents)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${amt(t.vatCents)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amt(t.grossCents)}</ram:GrandTotalAmount>
        <ram:TotalPrepaidAmount>${amt(t.prepaidCents)}</ram:TotalPrepaidAmount>
        <ram:DuePayableAmount>${amt(t.dueCents)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>${
        d.cancels ? `
      <ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${xml(d.cancels)}</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>` : ''
      }
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

export const REMINDER_LABELS = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung'] as const;

/**
 * Text der nächsten Mahnstufe (level = bisher verschickte Stufen, 0 → freundliche Erinnerung). Sachlich, ohne
 * Drohungen; Verzugszinsen/Gebühren nennt die App nicht von sich aus (Sache des Betriebs).
 */
export function reminderText(level: number, o: { number: string; issuedAt?: string; dueAt?: string; amountCents: number; customer?: string; firm?: string; iban?: string }): { subject: string; body: string } {
  const lv = Math.max(0, Math.min(2, level));
  const de = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
  const hello = o.customer?.trim() ? `Guten Tag ${o.customer.trim()},` : 'Guten Tag,';
  const ref = `unsere Rechnung ${o.number}${o.issuedAt ? ` vom ${de(o.issuedAt)}` : ''} über ${euro(o.amountCents)}`;
  const pay = o.iban ? `\nIBAN: ${o.iban}\nVerwendungszweck: ${o.number}` : `\nVerwendungszweck: ${o.number}`;
  const lines = [
    `${hello}\n\nsicher ist es im Alltag untergegangen: ${ref} war am ${de(o.dueAt)} fällig. Wir bitten um Überweisung in den nächsten Tagen.${pay}\n\nFalls Sie bereits bezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.`,
    `${hello}\n\nzu ${ref} (fällig am ${de(o.dueAt)}) konnten wir leider noch keinen Zahlungseingang feststellen. Bitte überweisen Sie den Betrag innerhalb von 7 Tagen.${pay}\n\nFalls sich Ihre Zahlung mit dieser Mahnung überschnitten hat, danke — dann ist alles erledigt.`,
    `${hello}\n\ntrotz unserer Erinnerungen ist ${ref} (fällig am ${de(o.dueAt)}) weiterhin offen. Wir bitten Sie dringend, den Betrag innerhalb von 7 Tagen zu überweisen, und melden uns andernfalls erneut. Bei Fragen zur Rechnung rufen Sie uns gerne an.${pay}`,
  ];
  return { subject: `${REMINDER_LABELS[lv]}: Rechnung ${o.number}`, body: `${lines[lv]}\n\nFreundliche Grüße${o.firm ? `\n${o.firm}` : ''}` };
}

/**
 * EPC-QR-Code („GiroCode“, EPC069-12 Version 002): Banking-Apps füllen Empfänger, IBAN, Betrag und
 * Verwendungszweck aus. Null, wenn keine gültige IBAN oder kein positiver Betrag.
 */
export function epcPayload(p: Pick<InvoiceProfile, 'legalName' | 'iban' | 'bic'>, amountCents: number, reference: string): string | null {
  const iban = (p.iban ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) || !(amountCents > 0) || amountCents > 99999999999) return null;
  const clean = (s: string, n: number) => s.replace(/[\r\n]+/g, ' ').trim().slice(0, n);
  return ['BCD', '002', '1', 'SCT', clean(p.bic ?? '', 11).toUpperCase(), clean(p.legalName || 'Empfänger', 70), iban, `EUR${(amountCents / 100).toFixed(2)}`, '', '', clean(reference, 140), ''].join('\n');
}

/** Nächste Nummer im Format PRÄFIX-JJJJ-0001 (lokal/Offline; mit Konto vergibt der Server lückenlos). */
export function formatNumber(prefix: string, year: number, seq: number): string {
  return `${(prefix || 'RE').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'RE'}-${year}-${String(seq).padStart(4, '0')}`;
}
