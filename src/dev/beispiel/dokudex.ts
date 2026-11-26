// DokuDex-Beispieldaten für den Beispiel-Zugang (NUR Dev-Server: /app/dokudex?beispiel, docs/beispiel-zugang.md).
// Persönliches Konto (kein Betrieb): ein erfundenes privates Archiv mit 16 Dokumenten in 4 Projekten (Ordnern) —
// Verträge, Rechnungen, Behördenbriefe, ein Arztbrief. Tabellen documents und projects (user_id, client_id, data jsonb,
// updated_at) wie der DokuDex-Cloud-Sync (src/dokudex/types.ts). Die „KI-Auswertung“ (analysis) ist von Hand
// geschrieben und rechnerisch stimmig; alle Daten, Fristen und Jahreszahlen hängen an „heute“.
// Keine echten Personen, Firmen oder Behörden: Absender nur allgemein („die Hausverwaltung“, „das Finanzamt“),
// Adressen erfunden (PLZ 123xx), keine Markennamen. Ohne Scan-Bild (imageBase64) — die Seiten zeigen dann einen Hinweis.
//
// Was die Übersicht damit zeigt (src/dokudex/pages/Overview.tsx):
//   · Dokumente 16 · Mit Fristen 11 · Projekte 4 · Diesen Monat (je nach Tag im Monat)
//   · Dokumente mit Fristen (8 Zeilen) · Zuletzt hinzugefügt mit KI-Zusammenfassung
// Bestes Einzelbild: Dokument „Betriebskostenabrechnung“ (/app/dokudex/dokumente/<id>): Zusammenfassung, das Wichtigste,
// Fristen, „Was tun?“ und Empfehlung (src/dokudex/pages/DocumentDetail.tsx).
// Liest die Listen über JSON-Pfade (data->>title …) — der Speicher-Client braucht dafür feld() (client-jsonpfad).
// Schema wie DokuDex/supabase/schema.sql.

import type { BeispielDaten, Zeile } from './typen.ts';

const NUTZER = 'b0000002-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------- Datums-Helfer

const heute = new Date();
const JAHR = heute.getFullYear();
const VORJAHR = JAHR - 1;
const p2 = (n: number) => String(n).padStart(2, '0');

/** Datum in `tage` Tagen als TT.MM.JJJJ (wie die KI-Auswertung der App Fristen schreibt) */
function in_(tage: number): string {
  const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + tage);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Erster Tag des Monats in `monate` Monaten als TT.MM.JJJJ */
function ersterIn(monate: number): string {
  const d = new Date(heute.getFullYear(), heute.getMonth() + monate, 1);
  return `01.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const monatIn = (monate: number) => MONATE[new Date(heute.getFullYear(), heute.getMonth() + monate, 1).getMonth()];

/** Zeitpunkt vor `tage` Tagen um hh:mm (lokal), nie in der Zukunft, als ISO */
function vorIso(tage: number, hh: number, mm: number): string {
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  d.setDate(d.getDate() - tage);
  if (d.getTime() > Date.now() - 10 * 60_000) d.setDate(d.getDate() - 1);
  return d.toISOString();
}

/** HU vor 29 Tagen (Dokument 8) → nächste HU im selben Monat in zwei Jahren, als MM/JJJJ */
const HU = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() - 29);
const HU_MONAT = `${p2(HU.getMonth() + 1)}/${HU.getFullYear() + 2}`;

// ---------------------------------------------------------------------------- Projekte (Ordner)

const PROJEKTE = [
  { id: '4b6f1c2e-8d3a-4f51-9e07-2a5c8b1d0f01', name: 'Wohnung Lindenstraße', seit: 410 },
  { id: '4b6f1c2e-8d3a-4f51-9e07-2a5c8b1d0f02', name: `Steuer ${VORJAHR}`, seit: 260 },
  { id: '4b6f1c2e-8d3a-4f51-9e07-2a5c8b1d0f03', name: 'Auto', seit: 380 },
  { id: '4b6f1c2e-8d3a-4f51-9e07-2a5c8b1d0f04', name: 'Verträge und Versicherungen', seit: 395 },
];
const [WOHNUNG, STEUER, AUTO, VERSICHERUNG] = PROJEKTE.map((p) => p.id);

// ---------------------------------------------------------------------------- Dokumente

type Typ = 'contract' | 'invoice' | 'doctor' | 'authority' | 'other';
interface Doc {
  nr: number;
  title: string;
  type: Typ;
  projekt: string | null;
  vor: number;
  analysis: {
    documentType: string;
    summary: string;
    keyPoints?: string[];
    deadlines?: string[];
    actionItems?: string[];
    recommendation?: string;
  };
  notes?: string;
}

const DOKUMENTE: Doc[] = [
  {
    nr: 1,
    title: `Betriebskostenabrechnung ${VORJAHR}`,
    type: 'invoice',
    projekt: WOHNUNG,
    vor: 2,
    analysis: {
      documentType: 'Nebenkostenabrechnung',
      summary: `Die Hausverwaltung rechnet die Betriebskosten ${VORJAHR} für deine Wohnung in der Lindenstraße 8 ab. Nach Abzug deiner Vorauszahlungen bleibt eine Nachzahlung von 186,40 €. Die monatliche Vorauszahlung steigt außerdem von 210 € auf 228 €.`,
      keyPoints: [
        `Abrechnungszeitraum 01.01.–31.12.${VORJAHR}`,
        'Kosten gesamt 2.706,40 €, gezahlte Vorauszahlungen 2.520,00 € (12 × 210 €)',
        'Größte Posten: Heizung und Warmwasser 1.184,20 €, Grundsteuer 296,00 €, Müllabfuhr 241,80 €',
        'Umlage nach Wohnfläche: 68 m² von 412 m², Heizkosten nach Verbrauch',
      ],
      deadlines: [`Nachzahlung 186,40 € bis ${in_(19)}`, `Neue Vorauszahlung 228 € ab ${ersterIn(2)}`],
      actionItems: [
        '186,40 € bis zur Frist an die Hausverwaltung überweisen — der Verwendungszweck steht im Schreiben',
        `Dauerauftrag ab ${monatIn(2)} um 18 € erhöhen (Nebenkosten 228 € statt 210 €)`,
        'Bei Fragen zu einzelnen Posten bei der Hausverwaltung die Belege ansehen',
      ],
      recommendation: 'Die Abrechnung ist in sich schlüssig. Die Heizkosten liegen etwa 9 % über dem Vorjahr — vergleiche deinen Verbrauch auf der beiliegenden Heizkostenabrechnung mit dem des Vorjahres.',
    },
    notes: 'Nachzahlung zusammen mit der Miete am Monatsanfang überweisen.',
  },
  {
    nr: 2,
    title: 'Rechnung Heizungswartung',
    type: 'invoice',
    projekt: WOHNUNG,
    vor: 4,
    analysis: {
      documentType: 'Handwerkerrechnung',
      summary: 'Rechnung über die jährliche Wartung der Gastherme: 189,00 € inklusive Material, zahlbar innerhalb von 14 Tagen.',
      keyPoints: ['Arbeitszeit 1,5 Stunden, Dichtungssatz und Anfahrt', 'Rechnungsbetrag 189,00 € brutto'],
      deadlines: [`Zahlung 189,00 € bis ${in_(10)}`],
      actionItems: ['Betrag überweisen', 'Rechnung für die Steuererklärung aufheben (Handwerkerleistung)'],
    },
  },
  {
    nr: 3,
    title: `Einkommensteuerbescheid ${VORJAHR}`,
    type: 'authority',
    projekt: STEUER,
    vor: 6,
    analysis: {
      documentType: 'Steuerbescheid',
      summary: `Das Finanzamt setzt die Einkommensteuer ${VORJAHR} fest. Du bekommst 412,00 € erstattet; der Betrag wird auf dein Konto überwiesen.`,
      keyPoints: ['Erstattung 412,00 €', 'Werbungskosten wie erklärt anerkannt', 'Der Bescheid enthält einen Vorläufigkeitsvermerk zu einzelnen Punkten'],
      deadlines: [`Einspruch möglich bis ${in_(25)}`],
      actionItems: ['Bescheid mit der Erklärung vergleichen', 'Eingang der Erstattung auf dem Konto prüfen'],
      recommendation: 'Die Werte stimmen mit der abgegebenen Erklärung überein. Ein Einspruch ist nur nötig, wenn dir eine Abweichung auffällt.',
    },
  },
  {
    nr: 4,
    title: 'Zahnarzt: Heil- und Kostenplan',
    type: 'doctor',
    projekt: null,
    vor: 9,
    analysis: {
      documentType: 'Heil- und Kostenplan',
      summary: 'Kostenplan für eine Krone im Oberkiefer. Voraussichtlicher Eigenanteil 318,50 € nach Festzuschuss der Krankenkasse.',
      keyPoints: ['Geschätzte Gesamtkosten 742,00 €', 'Festzuschuss der Kasse 423,50 €', 'Eigenanteil voraussichtlich 318,50 €'],
      deadlines: [`Behandlungstermin am ${in_(33)}`],
      actionItems: ['Plan vor Behandlungsbeginn bei der Krankenkasse einreichen', 'Bonusheft beilegen, falls vorhanden'],
    },
  },
  {
    nr: 5,
    title: 'Kita: Einkommensnachweis für den Elternbeitrag',
    type: 'authority',
    projekt: null,
    vor: 13,
    analysis: {
      documentType: 'Behördenschreiben',
      summary: 'Die Gemeinde bittet um einen Einkommensnachweis, um den Elternbeitrag für das nächste Kita-Jahr festzusetzen.',
      keyPoints: ['Ohne Nachweis wird der Höchstbeitrag angesetzt', 'Benötigt: Einkommensnachweise der letzten 12 Monate'],
      deadlines: [`Unterlagen einreichen bis ${in_(16)}`],
      actionItems: ['Gehaltsabrechnungen zusammenstellen', 'Formular unterschreiben und mit den Nachweisen abgeben'],
    },
  },
  {
    nr: 6,
    title: 'Stromabrechnung',
    type: 'invoice',
    projekt: WOHNUNG,
    vor: 17,
    analysis: {
      documentType: 'Jahresabrechnung Strom',
      summary: 'Jahresabrechnung mit einem Guthaben von 64,20 €. Der monatliche Abschlag sinkt auf 74 €.',
      keyPoints: ['Verbrauch 2.140 kWh (Vorjahr 2.310 kWh)', 'Guthaben 64,20 € wird erstattet', 'Neuer Abschlag 74 € statt 79 €'],
      deadlines: [`Neuer Abschlag ab ${ersterIn(1)}`],
      actionItems: ['Prüfen, ob das Guthaben überwiesen wurde'],
    },
  },
  {
    nr: 7,
    title: 'Handyvertrag: Vertragsübersicht',
    type: 'contract',
    projekt: VERSICHERUNG,
    vor: 21,
    analysis: {
      documentType: 'Vertragszusammenfassung',
      summary: 'Übersicht über deinen Mobilfunkvertrag: 15 GB Datenvolumen für 17,99 € im Monat. Die Mindestlaufzeit endet bald.',
      keyPoints: ['Monatlicher Preis 17,99 €', '15 GB Datenvolumen, Telefonie und SMS pauschal'],
      deadlines: [`Mindestlaufzeit endet am ${in_(71)}`],
      actionItems: ['Vor Ende der Laufzeit Tarife vergleichen'],
    },
  },
  {
    nr: 8,
    title: 'Prüfbericht Hauptuntersuchung',
    type: 'other',
    projekt: AUTO,
    vor: 29,
    analysis: {
      documentType: 'Prüfbericht',
      summary: 'Hauptuntersuchung ohne Mängel bestanden. Die Plakette gilt zwei Jahre.',
      keyPoints: ['Keine Mängel festgestellt', 'Kilometerstand bei der Prüfung 86.412 km'],
      deadlines: [`Nächste Hauptuntersuchung ${HU_MONAT}`],
    },
  },
  {
    nr: 9,
    title: 'Kfz-Versicherung: Beitragsrechnung',
    type: 'invoice',
    projekt: AUTO,
    vor: 34,
    analysis: {
      documentType: 'Versicherungsrechnung',
      summary: 'Jahresbeitrag für Haftpflicht und Teilkasko: 412,80 €, Abbuchung per Lastschrift.',
      keyPoints: ['Haftpflicht 268,40 €, Teilkasko 144,40 €', 'Schadenfreiheitsklasse unverändert'],
      deadlines: [`Abbuchung 412,80 € am ${in_(36)}`],
      actionItems: ['Kontodeckung zum Abbuchungstermin sicherstellen'],
    },
  },
  {
    nr: 10,
    title: `Lohnsteuerbescheinigung ${VORJAHR}`,
    type: 'other',
    projekt: STEUER,
    vor: 48,
    analysis: {
      documentType: 'Lohnsteuerbescheinigung',
      summary: `Bescheinigung deines Arbeitgebers über Bruttolohn und einbehaltene Steuern ${VORJAHR}.`,
      keyPoints: ['Die Werte sind dem Finanzamt bereits elektronisch übermittelt'],
    },
  },
  {
    nr: 11,
    title: 'Hausratversicherung: Police',
    type: 'contract',
    projekt: VERSICHERUNG,
    vor: 77,
    analysis: {
      documentType: 'Versicherungsschein',
      summary: 'Hausratversicherung für 68 m² mit einer Versicherungssumme von 44.200 €, Jahresbeitrag 96,40 €.',
      keyPoints: ['Versicherungssumme 650 € je m²', 'Fahrraddiebstahl bis 1.000 € eingeschlossen', 'Selbstbeteiligung 150 €'],
    },
  },
  {
    nr: 12,
    title: 'Mietvertrag Lindenstraße 8',
    type: 'contract',
    projekt: WOHNUNG,
    vor: 409,
    analysis: {
      documentType: 'Mietvertrag',
      summary: 'Unbefristeter Mietvertrag für eine 3-Zimmer-Wohnung, 68 m², Kaltmiete 690 € zuzüglich 210 € Nebenkosten-Vorauszahlung.',
      keyPoints: ['Kaution 2.070 € (drei Kaltmieten)', 'Kündigungsfrist für dich: drei Monate', 'Kleinreparaturen bis 100 € trägst du selbst'],
    },
  },
  {
    nr: 13,
    title: 'Kaufvertrag Gebrauchtwagen',
    type: 'contract',
    projekt: AUTO,
    vor: 377,
    analysis: {
      documentType: 'Kaufvertrag',
      summary: 'Kauf eines Gebrauchtwagens von einem Händler für 11.900 €, Erstzulassung vor sechs Jahren.',
      keyPoints: ['Kaufpreis 11.900 €, bar bei Übergabe', 'Zwei Schlüssel und Serviceheft übergeben'],
    },
  },
  {
    nr: 14,
    title: 'Spendenbescheinigung',
    type: 'other',
    projekt: STEUER,
    vor: 112,
    analysis: {
      documentType: 'Zuwendungsbestätigung',
      summary: 'Bestätigung über eine Geldspende von 150 € an einen gemeinnützigen Verein.',
      keyPoints: ['Spende 150 €', 'Für die Steuererklärung aufbewahren'],
    },
  },
  {
    nr: 15,
    title: 'Rechnung Waschmaschine',
    type: 'invoice',
    projekt: WOHNUNG,
    vor: 156,
    analysis: {
      documentType: 'Kaufbeleg',
      summary: 'Rechnung über eine Waschmaschine für 549 € inklusive Lieferung und Anschluss.',
      keyPoints: ['Kaufpreis 549 €', 'Lieferung und Anschluss inklusive'],
      deadlines: [`Herstellergarantie bis ${in_(573)}`],
    },
  },
  {
    nr: 16,
    title: 'Kündigungsbestätigung Fitnessstudio',
    type: 'contract',
    projekt: null,
    vor: 63,
    analysis: {
      documentType: 'Kündigungsbestätigung',
      summary: 'Das Studio bestätigt deine Kündigung zum Ende der Laufzeit. Die letzte Abbuchung erfolgt noch einmal regulär.',
      keyPoints: ['Kündigung angenommen', 'Mitgliedskarte nach dem letzten Tag zurückgeben'],
      deadlines: [`Vertragsende ${in_(35)}`],
    },
  },
];

const docId = (nr: number) => `doc-${(1_755_000_000_000 + nr * 86_399_000).toString(36)}-${String(nr).padStart(3, '0')}`;

const documents: Zeile[] = DOKUMENTE.map((d) => {
  const angelegt = vorIso(d.vor, 18 + (d.nr % 3), (d.nr * 13) % 60);
  const data: Record<string, unknown> = {
    id: docId(d.nr),
    title: d.title,
    type: d.type,
    imageBase64: null,
    analysis: d.analysis,
    projectId: d.projekt,
    createdAt: angelegt,
  };
  if (d.notes) {
    data.notes = d.notes;
    data.updatedAt = new Date(Date.parse(angelegt) + 26 * 3_600_000 > Date.now() ? Date.parse(angelegt) + 600_000 : Date.parse(angelegt) + 26 * 3_600_000).toISOString();
  }
  return { user_id: NUTZER, client_id: docId(d.nr), data, updated_at: (data.updatedAt as string | undefined) ?? angelegt };
});

const projects: Zeile[] = PROJEKTE.map((p) => {
  const angelegt = vorIso(p.seit, 20, 10);
  return { user_id: NUTZER, client_id: p.id, data: { id: p.id, name: p.name, createdAt: angelegt }, updated_at: angelegt };
});

export const daten: BeispielDaten = {
  app: 'dokudex',
  nutzer: { id: NUTZER, email: 'archiv@beispiel-haushalt.example' },
  tabellen: { documents, projects },
};

/** ID des Dokuments für das Einzelbild (Betriebskostenabrechnung) */
export const BILD_DOKUMENT = docId(1);
