// wie App mobile/src/lib/ebInterface.ts — wortgleich übernommen (nur Importe angepasst). Änderungen IMMER in beiden Repos.
// E-Rechnung im österreichischen Format ebInterface 6.1 (Pflicht bei Rechnungen an den Bund über e-rechnung.gv.at,
// von vielen Ländern/Gemeinden ebenso angenommen). Baut aus demselben Entwurf wie die CII-Ausgabe (lib/invoice.ts)
// ein XML nach dem Schema http://www.ebinterface.at/schema/6p1/ (Schema-Version 6.1, Stand 2022-06-25).
// Rein (ohne RN) — getestet in scripts/test-schlussrechnung.js.
//
// Reihenfolge und Pflichtfelder nach dem offiziellen Schema (InvoiceType, AbstractPartyType, AddressType,
// ListLineItemType, TaxItemType, PaymentMethodType). Beträge: Decimal2 (2 Nachkommastellen), Menge/Einzelpreis Decimal4.
// Summen kommen aus totals() in Cent, darum gehen sie exakt auf:
//   Summe LineItemAmount = Summe TaxableAmount (Tax) · TotalGrossAmount = TaxableAmount + TaxAmount
//   PayableAmount = TotalGrossAmount − PrepaidAmount
// Schlussrechnung: DocumentType „FinalSettlement“, jede Abschlagsrechnung als RelatedDocument
// („InvoiceForAdvancePayment“), abgezogener Betrag brutto als PrepaidAmount, Netto + USt je Abschlag im Kommentar.
// Für Bundesdienststellen: Auftragsreferenz (InvoiceRecipient/OrderReference/OrderID) und Lieferantennummer
// (Biller/InvoiceRecipientsBillerID) gibt der Auftraggeber vor.
import { activeDeductions, addDaysYmd, deductionGross, deductionNotes, legalNotes, lineNet, totals, unitCode, type InvoiceDraft, type InvoiceProfile, type Land, type VatMode } from './invoice';

export const EBINTERFACE_NS = 'http://www.ebinterface.at/schema/6p1/';

export interface EbInterfaceMeta {
  number: string;
  /** Rechnungsdatum JJJJ-MM-TT */
  issueDate: string;
  /** Auftragsreferenz / Bestellnummer des Auftraggebers (beim Bund Pflicht) */
  orderReference?: string;
  /** Lieferantennummer beim Auftraggeber (falls vergeben) */
  supplierId?: string;
}

/** Text für XML: Steuerzeichen raus (in XML 1.0 verboten), dann & < > " ' maskieren. */
export function ebText(s: unknown): string {
  return String(s ?? '')
    // eslint-disable-next-line no-control-regex -- Steuerzeichen sind in XML 1.0 verboten, darum gezielt entfernen
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, ' ')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

/** Cent → „1234.56“ (Punkt, genau 2 Nachkommastellen, ganze Cent → kein Rundungsfehler) */
export function ebAmount(c: number): string {
  const n = Math.round(Number(c) || 0);
  const a = Math.abs(n);
  return `${n < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/** Menge → höchstens 4 Nachkommastellen, kaufmännisch gerundet, ohne Exponent */
const ebQty = (q: number) => {
  const n = Math.round((Number(q) || 0) * 10000) / 10000;
  return n.toFixed(4).replace(/0{1,2}$/, '');
};
const ebPct = (r: number) => String(Math.round((Number(r) || 0) * 100) / 100);
const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const countryCode = (l?: Land) => (l === 'DE' ? 'DE' : l === 'CH' ? 'CH' : 'AT');
const COUNTRY_NAME: Record<string, string> = { AT: 'Österreich', DE: 'Deutschland', CH: 'Schweiz' };

function category(mode: VatMode, rate: number): { code: string; comment?: string } {
  if (mode === 'kleinunternehmer') return { code: 'E', comment: 'Umsatzsteuerbefreit – Kleinunternehmer' };
  if (mode === 'reverseCharge') return { code: 'AE', comment: 'Übergang der Steuerschuld auf den Leistungsempfänger' };
  return { code: rate > 0 ? 'S' : 'Z' };
}

function address(x: { name: string; street?: string; zip?: string; city?: string; land?: Land; email?: string; phone?: string }, indent: string): string {
  const cc = countryCode(x.land);
  const rows = [
    `<Name>${ebText(x.name)}</Name>`,
    x.street?.trim() ? `<Street>${ebText(x.street.trim())}</Street>` : '',
    `<Town>${ebText((x.city ?? '').trim())}</Town>`,
    `<ZIP>${ebText((x.zip ?? '').trim())}</ZIP>`,
    `<Country CountryCode="${cc}">${COUNTRY_NAME[cc]}</Country>`,
    x.phone?.trim() ? `<Phone>${ebText(x.phone.trim())}</Phone>` : '',
    x.email?.trim() ? `<Email>${ebText(x.email.trim())}</Email>` : '',
  ].filter(Boolean);
  return `${indent}<Address>\n${rows.map((r) => `${indent}  ${r}`).join('\n')}\n${indent}</Address>`;
}

/**
 * ebInterface-6.1-XML aus einem ausgestellten Beleg. Angebote gibt es nicht als E-Rechnung (Fehler).
 * Stornorechnung → „CreditMemo“ mit Verweis auf die stornierte Rechnung (Beträge positiv, wie bei der CII-Gutschrift 381).
 */
export function toEbInterfaceXml(d: InvoiceDraft, p: InvoiceProfile, meta: EbInterfaceMeta): string {
  if (d.kind === 'quote') throw new Error('Ein Angebot ist keine Rechnung — ebInterface gibt es nur für Rechnungen.');
  if (!d.lines.length) throw new Error('Die Rechnung hat keine Positionen.');
  const t = totals(d);
  const ded = activeDeductions(d);
  const credit = d.kind === 'credit';
  const docType = credit ? 'CreditMemo' : ded.length ? 'FinalSettlement' : d.partial ? 'InvoiceForAdvancePayment' : 'Invoice';
  const title = credit ? 'Stornorechnung' : ded.length ? 'Schlussrechnung' : d.partial ? 'Abschlagsrechnung' : 'Rechnung';
  const issue = isYmd(meta.issueDate.slice(0, 10)) ? meta.issueDate.slice(0, 10) : '';
  if (!issue) throw new Error('Rechnungsdatum fehlt.');
  const noVat = d.vatMode !== 'normal';

  const related = [
    ...(credit && d.cancels
      ? [`  <RelatedDocument>
    <InvoiceNumber>${ebText(d.cancels)}</InvoiceNumber>
    <DocumentType>Invoice</DocumentType>
    <Comment>${ebText(`Storniert${d.cancelReason ? ` – Grund: ${d.cancelReason}` : ''}`)}</Comment>
  </RelatedDocument>`]
      : []),
    ...ded.map(
      (x) => `  <RelatedDocument>
    <InvoiceNumber>${ebText(x.number)}</InvoiceNumber>${isYmd(x.issuedAt) ? `\n    <InvoiceDate>${x.issuedAt}</InvoiceDate>` : ''}
    <DocumentType>InvoiceForAdvancePayment</DocumentType>
    <Comment>${ebText(`Abschlagsrechnung, abgezogen mit brutto ${ebAmount(deductionGross(x))} EUR`)}</Comment>
  </RelatedDocument>`
    ),
  ];

  const from = isYmd(d.serviceDate) ? d.serviceDate : '';
  const to = isYmd(d.serviceDateTo) && d.serviceDateTo > from ? d.serviceDateTo : '';
  const delivery = from
    ? to
      ? `  <Delivery>\n    <Period>\n      <FromDate>${from}</FromDate>\n      <ToDate>${to}</ToDate>\n    </Period>\n  </Delivery>`
      : `  <Delivery>\n    <Date>${from}</Date>\n  </Delivery>`
    : '';

  const biller = `  <Biller>
    <VATIdentificationNumber>${ebText(p.uid?.trim() || '00000000')}</VATIdentificationNumber>
${address({ name: p.legalName, street: p.street, zip: p.zip, city: p.city, land: p.land, email: p.email, phone: p.phone }, '    ')}${
    meta.supplierId?.trim() ? `\n    <InvoiceRecipientsBillerID>${ebText(meta.supplierId.trim().slice(0, 255))}</InvoiceRecipientsBillerID>` : ''
  }
  </Biller>`;
  const r = d.recipient;
  const recipient = `  <InvoiceRecipient>
    <VATIdentificationNumber>${ebText(r.uid?.trim() || '00000000')}</VATIdentificationNumber>${
    meta.orderReference?.trim() ? `\n    <OrderReference>\n      <OrderID>${ebText(meta.orderReference.trim().slice(0, 255))}</OrderID>\n    </OrderReference>` : ''
  }
${address({ name: r.name, street: r.street, zip: r.zip, city: r.city, land: r.land ?? p.land, email: r.email }, '    ')}
  </InvoiceRecipient>`;

  const items = d.lines
    .map((l, i) => {
      const rate = noVat ? 0 : Number(l.vatRate) || 0;
      const cat = category(d.vatMode, rate);
      const net = lineNet(l);
      return `        <ListLineItem>
          <PositionNumber>${i + 1}</PositionNumber>
          <Description>${ebText(l.text.trim() || 'Position')}</Description>
          <Quantity Unit="${unitCode(l.unit || '')}">${ebQty(l.qty)}</Quantity>
          <UnitPrice>${ebAmount(l.unitPriceCents)}</UnitPrice>
          <TaxItem>
            <TaxableAmount>${ebAmount(net)}</TaxableAmount>
            <TaxPercent TaxCategoryCode="${cat.code}">${ebPct(rate)}</TaxPercent>
          </TaxItem>
          <LineItemAmount>${ebAmount(net)}</LineItemAmount>
        </ListLineItem>`;
    })
    .join('\n');
  const details = `  <Details>${d.intro?.trim() ? `\n    <HeaderDescription>${ebText(d.intro.trim())}</HeaderDescription>` : ''}
    <ItemList>
${items}
    </ItemList>${d.notes?.trim() ? `\n    <FooterDescription>${ebText(d.notes.trim())}</FooterDescription>` : ''}
  </Details>`;

  const taxItems = t.byRate
    .map((g) => {
      const cat = category(d.vatMode, g.rate);
      return `    <TaxItem>
      <TaxableAmount>${ebAmount(g.baseCents)}</TaxableAmount>
      <TaxPercent TaxCategoryCode="${cat.code}">${ebPct(g.rate)}</TaxPercent>
      <TaxAmount>${ebAmount(g.vatCents)}</TaxAmount>${cat.comment ? `\n      <Comment>${ebText(cat.comment)}</Comment>` : ''}
    </TaxItem>`;
    })
    .join('\n');

  const dueYmd = addDaysYmd(issue, p.paymentDays || 0);
  const iban = (p.iban ?? '').replace(/\s+/g, '').toUpperCase();
  const bic = (p.bic ?? '').replace(/\s+/g, '').toUpperCase();
  let payment = '';
  if (!credit && t.dueCents <= 0) {
    payment = `  <PaymentMethod>
    <Comment>Bereits vollständig durch Abschläge bzw. Zahlungen beglichen.</Comment>
    <NoPayment/>
  </PaymentMethod>`;
  } else if (!credit && iban) {
    payment = `  <PaymentMethod>
    <UniversalBankTransaction>
      <BeneficiaryAccount>${/^[0-9A-Z]{8}([0-9A-Z]{3})?$/.test(bic) ? `\n        <BIC>${bic}</BIC>` : ''}
        <IBAN>${ebText(iban.slice(0, 34))}</IBAN>
        <BankAccountOwner>${ebText(p.legalName.trim().slice(0, 70))}</BankAccountOwner>
      </BeneficiaryAccount>
      <PaymentReference>${ebText(meta.number.slice(0, 35))}</PaymentReference>
    </UniversalBankTransaction>
  </PaymentMethod>`;
  }
  const conditions =
    !credit && t.dueCents > 0
      ? `  <PaymentConditions>
    <DueDate>${dueYmd}</DueDate>
    <Comment>${ebText(`Zahlbar bis ${dueYmd.split('-').reverse().join('.')} ohne Abzug.`)}</Comment>
  </PaymentConditions>`
      : '';
  const comment = [...legalNotes(d, p), ...deductionNotes(d)].join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Invoice xmlns="${EBINTERFACE_NS}" GeneratingSystem="InstallateurDex" DocumentType="${docType}" InvoiceCurrency="EUR" DocumentTitle="${ebText(title)}" Language="de">`,
    `  <InvoiceNumber>${ebText(meta.number)}</InvoiceNumber>`,
    `  <InvoiceDate>${issue}</InvoiceDate>`,
    ...related,
    delivery,
    biller,
    recipient,
    details,
    `  <Tax>\n${taxItems}\n  </Tax>`,
    `  <TotalGrossAmount>${ebAmount(t.grossCents)}</TotalGrossAmount>`,
    t.prepaidCents !== 0 ? `  <PrepaidAmount>${ebAmount(t.prepaidCents)}</PrepaidAmount>` : '',
    `  <PayableAmount>${ebAmount(t.dueCents)}</PayableAmount>`,
    payment,
    conditions,
    comment ? `  <Comment>${ebText(comment)}</Comment>` : '',
    '</Invoice>',
  ]
    .filter((x) => x !== '')
    .join('\n')
    .concat('\n');
}
