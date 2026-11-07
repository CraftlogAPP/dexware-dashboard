// Quelle: App InstallateurDex mobile/src/lib/wartungsvertrag.ts, Stand 07.11.2026 (Commit 244893e) — Texte und Logik 1:1.
// Nur angepasst: Importe (Portal-Typen), Feldnamen der Anlage (interval_months, contract_price) und der Menüpfad
// „Rechnungen → Firmendaten“ statt „Büro → Rechnungsdaten“. Änderungen IMMER zuerst in der App, dann hier nachziehen.
//
// Wartungsvertrag: reine Logik (Preise, Laufzeit/Kündigung, Leistungsumfang je Anlagentyp, Texte je Land,
// Verbraucher/Unternehmer, Widerrufsbelehrung). PDF: pdf/wartungsvertrag.ts · Bildschirm: screens/WartungsvertragScreen.tsx.
//
// VORLAGE — keine Rechtsberatung. Die App weist den Betrieb darauf hin, den Text einmal vom eigenen Rechtsberater prüfen
// zu lassen. Rechtsgrundlagen (Stand 11/2026, bitte beim Gegenlesen bestätigen):
//  - Widerrufsrecht bei Verträgen außerhalb von Geschäftsräumen mit Verbrauchern:
//      DE § 312b, § 312g Abs. 1, § 355 BGB; Muster-Widerrufsbelehrung Anlage 1 zu Art. 246a § 1 Abs. 2 Satz 2 EGBGB,
//      Muster-Widerrufsformular Anlage 2 zu Art. 246a § 1 Abs. 2 Satz 1 Nr. 1 EGBGB.
//      AT §§ 11 ff. FAGG (Gesetz nennt es „Rücktritt“, das amtliche Muster „Widerruf“); Muster-Widerrufsbelehrung
//      Anhang I Teil A FAGG, Muster-Widerrufsformular Anhang I Teil B FAGG.
//    Beide Muster setzen Anhang I der Richtlinie 2011/83/EU um und sind im Wortlaut gleich. Übernommen ist die Fassung
//    für Dienstleistungsverträge: Gestaltungshinweis „Beginn der Widerrufsfrist“ = „ab dem Tag des Vertragsabschlusses“,
//    der Absatz zum Wertersatz für während der Frist begonnene Dienstleistungen (Gestaltungshinweis 5c bzw. Anhang I
//    Teil A „Anleitung“ Z 5 lit. c). Platzhalter [Name], [Anschrift], [Telefonnummer, E-Mail-Adresse] = Firmendaten.
//  - Vorzeitiger Beginn auf ausdrückliches Verlangen + Wertersatz: DE § 357a Abs. 2 BGB, Erlöschen bei vollständiger
//    Erbringung § 356 Abs. 4 BGB; AT § 10 FAGG (Verlangen, außerhalb von Geschäftsräumen auf dauerhaftem Datenträger —
//    das unterschriebene PDF), Wertersatz § 16 FAGG, Ausnahme § 18 Abs. 1 Z 1 FAGG. (Paragraphen nur hier im Code,
//    nicht im Vertragstext — der verwendet die Worte der Muster.)
//  - Kündigung: Standard „unbefristet, Kündigung mit einem Monat Frist zum Ende des Vertragsjahres“ (DE: § 309 Nr. 9
//    BGB — keine Laufzeit über zwei Jahre, Kündigungsfrist höchstens ein Monat; AT Verbraucher: § 15 KSchG bleibt
//    unberührt, deshalb der Satz „gesetzliche Kündigungsrechte bleiben unberührt“). Keine stillschweigende Verlängerung.
//  - Kleinunternehmer-Hinweis: gleicher Wortlaut wie lib/invoice.ts legalNotes (AT § 6 Abs. 1 Z 27 UStG, DE § 19 UStG).
//  - Unternehmer-Kunde: kein Widerrufsrecht. CH: kein Widerrufstext (Land wird in der App nicht angeboten).
import type { Land } from '../geld/invoice';
import { checklistFor, type CustomChecks } from '../pruefpunkte/logic';
import { intervalOf, kindInfo, type Asset } from '../types';

// ---------------------------------------------------------------------------
// Begriffe
// ---------------------------------------------------------------------------
export type KundenArt = 'verbraucher' | 'unternehmer';
/** Wo wird unterschrieben? Beim Kunden/unterwegs = außerhalb von Geschäftsräumen (Widerrufsrecht für Verbraucher). */
export type Abschlussort = 'ausserhalb' | 'geschaeft';
/** jahr = Kündigung zum Ende jedes Vertragsjahres; monat = zum Ende jedes Kalendermonats (beides 1 Monat Frist). */
export type Kuendigung = 'jahr' | 'monat';
export type Zahlweise = 'jaehrlich' | 'halbjaehrlich' | 'jeWartung';

export const KUENDIGUNG_LABEL: Record<Kuendigung, string> = {
  jahr: 'Unbefristet, kündbar zum Ende jedes Vertragsjahres (1 Monat Frist)',
  monat: 'Unbefristet, kündbar zum Monatsende (1 Monat Frist)',
};
export const ZAHLWEISE_LABEL: Record<Zahlweise, string> = {
  jaehrlich: 'Jährlich im Voraus',
  halbjaehrlich: 'Halbjährlich im Voraus',
  jeWartung: 'Nach jeder Wartung',
};

// ---------------------------------------------------------------------------
// Geld (in Cent rechnen, Eingaben in Euro)
// ---------------------------------------------------------------------------
export const cents = (euro: number) => Math.round(euro * 100);
export const euroText = (c: number) => `${(c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** „120“, „120,50“, „1.200,50“ → Cent; ungültig/leer → null. */
export function parseEuro(s: string): number | null {
  const t = s.trim().replace(/\s|€/g, '');
  if (!t) return null;
  // „1.200,50“ / „120,5“ → Komma = Dezimal; „1.200“ → Tausenderpunkt; „120.50“ → Dezimalpunkt
  const norm = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t.replace(/,/g, '');
  const n = Number(norm);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) : null;
}

/** Wartungen pro Jahr bei einem Intervall in Monaten (24 → 0,5). */
export const wartungenProJahr = (intervalMonths: number) => 12 / Math.max(1, intervalMonths);

/**
 * Vorschlag Preis je Jahr (netto, Cent): eigener Vertragspreis der Anlage (Preis je Wartung) oder „Preis je Wartung“
 * des Anlagentyps (Büro → Material & Preise) × Wartungen pro Jahr. Ohne Preis → null.
 */
export function jahrespreisVorschlag(a: Pick<Asset, 'kind' | 'interval_months' | 'contract_price'>, prices: Partial<Record<string, number>>): number | null {
  const perService = a.contract_price && a.contract_price > 0 ? a.contract_price : prices[kindInfo(a.kind).id];
  if (!perService || perService <= 0) return null;
  return Math.round(cents(perService) * wartungenProJahr(intervalOf(a)));
}

/** Zurück ins Anlagenfeld „Preis je Wartung laut Vertrag“ (Euro, netto) — passt zu lib/potential.ts contractStats. */
export function preisJeWartung(jahrCents: number, intervalMonths: number): number {
  return Math.round(jahrCents / wartungenProJahr(intervalMonths)) / 100;
}

export interface Position {
  assetId: string;
  intervalMonths: number;
  /** Preis je Jahr netto in Cent (vor Rabatt) */
  jahrCents: number;
}

export interface Summen {
  netto: number;
  rabatt: number;
  nettoNachRabatt: number;
  ust: number;
  brutto: number;
  vatRate: number;
  /** je Anlage: Preis je Jahr netto nach Rabatt (für das Anlagenfeld) */
  jeAnlage: Map<string, number>;
}

/** Summen je Jahr. Rabatt in % auf alles; je Anlage anteilig (Rundungsrest auf die erste Anlage). */
export function summen(pos: Position[], o: { rabattPct?: number; vatRate: number; kleinunternehmer?: boolean }): Summen {
  const netto = pos.reduce((s, p) => s + Math.max(0, p.jahrCents), 0);
  const pct = Math.min(100, Math.max(0, o.rabattPct ?? 0));
  const rabatt = Math.round((netto * pct) / 100);
  const nettoNachRabatt = netto - rabatt;
  const vatRate = o.kleinunternehmer ? 0 : Math.max(0, o.vatRate);
  const ust = Math.round((nettoNachRabatt * vatRate) / 100);
  const jeAnlage = new Map<string, number>();
  let verteilt = 0;
  for (const p of pos) {
    const v = Math.round((Math.max(0, p.jahrCents) * (100 - pct)) / 100);
    jeAnlage.set(p.assetId, v);
    verteilt += v;
  }
  if (pos.length && verteilt !== nettoNachRabatt) jeAnlage.set(pos[0].assetId, (jeAnlage.get(pos[0].assetId) ?? 0) + nettoNachRabatt - verteilt);
  return { netto, rabatt, nettoNachRabatt, ust, brutto: nettoNachRabatt + ust, vatRate, jeAnlage };
}

/** Kleinunternehmer-Hinweis (gleicher Wortlaut wie auf der Rechnung, lib/invoice.ts). */
export function kleinunternehmerHinweis(land: Land): string {
  return land === 'DE' ? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.' : 'Umsatzsteuerbefreit – Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG.';
}

export function zahlweiseText(z: Zahlweise, bruttoJahr: number, mitUst: boolean): string {
  const inkl = mitUst ? ' (inkl. USt)' : '';
  if (z === 'jaehrlich') return `Der Jahrespreis von ${euroText(bruttoJahr)}${inkl} wird jährlich im Voraus in Rechnung gestellt und ist nach Erhalt der Rechnung fällig.`;
  if (z === 'halbjaehrlich') {
    // ungerade Cent-Summe: erster Teilbetrag trägt den Cent, damit beide zusammen genau den Jahrespreis ergeben
    const first = Math.ceil(bruttoJahr / 2);
    const second = bruttoJahr - first;
    const teile = first === second ? `zwei Teilbeträgen von je ${euroText(first)}` : `zwei Teilbeträgen von ${euroText(first)} und ${euroText(second)}`;
    return `Der Jahrespreis von ${euroText(bruttoJahr)}${inkl} wird in ${teile} halbjährlich im Voraus in Rechnung gestellt und ist jeweils nach Erhalt der Rechnung fällig.`;
  }
  return 'Die Wartung wird nach jeder Durchführung zum vereinbarten Preis in Rechnung gestellt und ist nach Erhalt der Rechnung fällig.';
}

// ---------------------------------------------------------------------------
// Leistungsumfang je Anlagentyp (Grundlage: Prüfpunkte der Wartungs-Checkliste, inkl. eigener Prüfpunkte des Betriebs)
// ---------------------------------------------------------------------------
export function intervallText(months: number): string {
  if (months === 12) return 'Jährliche Wartung';
  if (months === 6) return 'Halbjährliche Wartung';
  if (months % 12 === 0) return `Wartung alle ${months / 12} Jahre`;
  return `Wartung alle ${months} Monate`;
}

export interface Leistung {
  kind: string;
  kindLabel: string;
  /** „Jährliche Wartung nach Herstellerangaben, inkl. Abgasmessung“ */
  titel: string;
  punkte: string[];
}

/** Leistungsumfang einer Anlage aus Anlagentyp + Intervall (+ eigene Prüfpunkte). */
export function leistungFor(a: Pick<Asset, 'kind' | 'interval_months'>, custom?: CustomChecks): Leistung {
  const k = kindInfo(a.kind);
  const items = checklistFor(k.id, 'service', custom);
  const punkte = items.map((c) => c.label);
  const extra: string[] = [];
  if (items.some((c) => c.id === 'fluegasMeasure')) extra.push('inkl. Abgasmessung');
  return {
    kind: k.id,
    kindLabel: k.label,
    titel: `${intervallText(intervalOf(a))} nach Herstellerangaben${extra.length ? `, ${extra.join(', ')}` : ''}`,
    punkte,
  };
}

/** Leistungen zusammengefasst je Typ + Intervall (gleiche Anlagen nur einmal beschreiben). */
export function leistungenGruppiert(list: Pick<Asset, 'kind' | 'interval_months'>[], custom?: CustomChecks): Leistung[] {
  const seen = new Map<string, Leistung>();
  for (const a of list) {
    const l = leistungFor(a, custom);
    const key = `${l.kind}|${l.titel}`;
    if (!seen.has(key)) seen.set(key, l);
  }
  return [...seen.values()];
}

/** Was nicht im Preis ist bzw. was zusätzlich drin ist. */
export function umfangHinweise(o: { anfahrtInkl: boolean; kleinmaterialInkl: boolean }): string[] {
  return [
    o.anfahrtInkl ? 'Die Anfahrt ist im Preis enthalten.' : 'Die Anfahrt ist nicht im Preis enthalten und wird gesondert verrechnet.',
    o.kleinmaterialInkl
      ? 'Kleinmaterial für die Wartung (z. B. Dichtungen, Reinigungsmittel) ist im Preis enthalten.'
      : 'Material ist nicht im Preis enthalten und wird nach Verbrauch verrechnet.',
    'Reparaturen, Ersatzteile und Arbeiten außerhalb des beschriebenen Leistungsumfangs sind nicht enthalten; sie werden nur nach Rücksprache ausgeführt und gesondert verrechnet.',
  ];
}

// ---------------------------------------------------------------------------
// Laufzeit und Kündigung
// ---------------------------------------------------------------------------
export function kuendigungText(k: Kuendigung, o: { beginn: string; land: Land; kunde: KundenArt }): string[] {
  const out = [
    k === 'jahr'
      ? `Der Vertrag beginnt am ${o.beginn} und wird auf unbestimmte Zeit geschlossen. Beide Seiten können ihn mit einer Frist von einem Monat zum Ende jedes Vertragsjahres kündigen.`
      : `Der Vertrag beginnt am ${o.beginn} und wird auf unbestimmte Zeit geschlossen. Beide Seiten können ihn mit einer Frist von einem Monat zum Ende jedes Kalendermonats kündigen.`,
    'Die Kündigung ist per Brief oder E-Mail möglich. Das Recht zur Kündigung aus wichtigem Grund bleibt unberührt.',
  ];
  if (o.kunde === 'verbraucher') out.push(o.land === 'AT' ? 'Gesetzliche Kündigungsrechte des Kunden (insbesondere nach § 15 KSchG) bleiben unberührt.' : 'Gesetzliche Kündigungsrechte des Kunden bleiben unberührt.');
  return out;
}

// ---------------------------------------------------------------------------
// Widerrufsrecht
// ---------------------------------------------------------------------------
export interface Firma {
  name: string;
  street?: string;
  zip?: string;
  city?: string;
  phone?: string;
  email?: string;
}

/** Hat der Kunde ein Widerrufsrecht? Verbraucher + außerhalb von Geschäftsräumen + AT/DE. */
export function hatWiderrufsrecht(o: { land: Land; kunde: KundenArt; ort: Abschlussort }): boolean {
  return o.kunde === 'verbraucher' && o.ort === 'ausserhalb' && (o.land === 'AT' || o.land === 'DE');
}

const anschrift = (f: Firma) => [f.street, [f.zip, f.city].filter(Boolean).join(' ')].filter((x) => !!x && !!x.trim()).join(', ');

/** Fehlende Firmenangaben für die Widerrufsbelehrung (Name, Anschrift, Telefon, E-Mail). */
export function fehlendeFirmendaten(f: Firma): string[] {
  const out: string[] = [];
  if (!f.name.trim()) out.push('Firmenname');
  if (!f.street?.trim() || !f.city?.trim()) out.push('Anschrift');
  if (!f.phone?.trim()) out.push('Telefon');
  if (!f.email?.trim()) out.push('E-Mail');
  return out;
}

export interface Widerruf {
  titel: string;
  abschnitte: { h?: string; text: string }[];
  formularTitel: string;
  formular: string[];
  /** Quelle (nur für die App, steht nicht im PDF) */
  quelle: string;
}

/**
 * Muster-Widerrufsbelehrung + Muster-Widerrufsformular (Dienstleistung, außerhalb von Geschäftsräumen), Firmendaten
 * eingesetzt. null = kein Widerrufsrecht (Unternehmer, Geschäftsräume, CH).
 * Wortlaut: DE Anlage 1/2 zu Art. 246a EGBGB, AT Anhang I Teil A/B FAGG — am 07.11.2026 wortgenau gegen die amtlichen
 * Fassungen geprüft (AT idF BGBl. I Nr. 59/2026, in Kraft 01.10.2026; kleine Abweichungen je Land unten).
 */
export function widerrufsbelehrung(o: { land: Land; kunde: KundenArt; ort: Abschlussort; firma: Firma }): Widerruf | null {
  if (!hatWiderrufsrecht(o)) return null;
  const f = o.firma;
  const kontakt = [f.name.trim(), anschrift(f), f.phone?.trim() ? `Telefon ${f.phone.trim()}` : '', f.email?.trim() ? `E-Mail ${f.email.trim()}` : ''].filter(Boolean).join(', ');
  const an = [f.name.trim(), anschrift(f), f.email?.trim() ? `E-Mail ${f.email.trim()}` : ''].filter(Boolean).join(', ');
  // Wortlaut am 07.11.2026 gegen die amtlichen Texte abgeglichen (gesetze-im-internet.de EGBGB Anlage 1/2; RIS FAGG
  // Anhang I idF BGBl. I Nr. 59/2026). Die beiden Fassungen unterscheiden sich in Kleinigkeiten — je Land wortgenau:
  const at = o.land === 'AT';
  const beispiel = at ? '(z. B. mit der Post versandter Brief oder E-Mail)' : '(z. B. ein mit der Post versandter Brief oder eine E-Mail)';
  return {
    titel: 'Widerrufsbelehrung',
    abschnitte: [
      { h: 'Widerrufsrecht', text: 'Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.' },
      { text: 'Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.' },
      {
        text: `Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${kontakt}) mittels einer eindeutigen Erklärung ${beispiel} über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.`,
      },
      { text: 'Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.' },
      {
        h: 'Folgen des Widerrufs',
        text: 'Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.',
      },
      {
        text: 'Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.',
      },
    ],
    formularTitel: 'Muster-Widerrufsformular',
    formular: [
      at
        ? '(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück)'
        : '(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)',
      `– An ${an}:`,
      '– Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*)',
      '– Bestellt am (*)/erhalten am (*)',
      '– Name des/der Verbraucher(s)',
      '– Anschrift des/der Verbraucher(s)',
      '– Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)',
      '– Datum',
      '(*) Unzutreffendes streichen.',
    ],
    quelle: o.land === 'DE' ? 'Muster nach Anlage 1 und 2 zu Art. 246a EGBGB (§ 312g BGB)' : 'Muster nach Anhang I Teil A und B FAGG (§§ 11 ff. FAGG)',
  };
}

/**
 * Erklärung zum Beginn vor Ablauf der Widerrufsfrist (Kunde kreuzt Ja/Nein an, unterschreibt mit dem Vertrag).
 * Ja = Wertersatz für bis zum Widerruf erbrachte Leistungen; Widerrufsrecht erlischt bei vollständiger Erbringung.
 */
export function vorzeitigerBeginnText(ja: boolean): { frage: string; ja: string; nein: string; gewaehlt: 'ja' | 'nein' } {
  return {
    frage: 'Soll vor Ablauf der Widerrufsfrist mit der Leistung begonnen werden?',
    ja: 'Ja. Ich verlange ausdrücklich, dass der Auftragnehmer vor Ablauf der Widerrufsfrist mit den vereinbarten Leistungen beginnt. Mir ist bekannt, dass ich bei einem Widerruf einen angemessenen Betrag für die bis dahin erbrachten Leistungen zu zahlen habe und dass mein Widerrufsrecht erlischt, sobald die Leistung vollständig erbracht ist.',
    nein: 'Nein. Mit den Leistungen wird erst nach Ablauf der Widerrufsfrist begonnen.',
    gewaehlt: ja ? 'ja' : 'nein',
  };
}

/** Frühester Leistungsbeginn ohne vorzeitigen Beginn: Tag nach Ablauf der 14-tägigen Frist (Abschluss + 15 Tage). */
export function fruehesterBeginn(abschluss: Date, vorzeitig: boolean, widerruf: boolean): Date {
  if (!widerruf || vorzeitig) return new Date(abschluss.getFullYear(), abschluss.getMonth(), abschluss.getDate());
  return new Date(abschluss.getFullYear(), abschluss.getMonth(), abschluss.getDate() + 15);
}

export const deDatum = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

// ---------------------------------------------------------------------------
// Prüfung vor dem Unterschreiben
// ---------------------------------------------------------------------------
export interface VertragsCheck {
  ok: boolean;
  fehler: string[];
  hinweise: string[];
}

export function pruefeVertrag(o: {
  anlagen: number;
  ohnePreis: number;
  kundeName: string;
  kundeAnschrift: string;
  kunde: KundenArt;
  firma: Firma;
  widerruf: boolean;
}): VertragsCheck {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  if (o.anlagen === 0) fehler.push('Bitte mindestens eine Anlage auswählen.');
  if (o.ohnePreis > 0) fehler.push(o.ohnePreis === 1 ? 'Bei einer Anlage fehlt der Preis je Jahr.' : `Bei ${o.ohnePreis} Anlagen fehlt der Preis je Jahr.`);
  if (!o.kundeName.trim()) fehler.push('Name des Kunden fehlt.');
  if (!o.kundeAnschrift.trim()) fehler.push('Anschrift des Kunden fehlt.');
  const fehlt = fehlendeFirmendaten(o.firma);
  if (o.widerruf && fehlt.length) fehler.push(`Für die Widerrufsbelehrung fehlen deine Firmendaten: ${fehlt.join(', ')} (Rechnungen → Firmendaten).`);
  else if (fehlt.length) hinweise.push(`Firmendaten unvollständig: ${fehlt.join(', ')} (Rechnungen → Firmendaten).`);
  return { ok: fehler.length === 0, fehler, hinweise };
}
