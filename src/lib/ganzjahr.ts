// Ganzjahres-Brücke WinterDex → ObjektDex/SpielDex/BaumDex (Plan: dexware-suite/docs/ganzjahr-2026-11-24.md, 5.2–5.5).
// Reine Logik ohne React und ohne Server — tests/ganzjahr-uebernahme.test.mjs lädt die Datei direkt.

/**
 * SCHALTER: Ist ObjektDex öffentlich im Play Store?
 *   false (jetzt): Der Eintrag „Nach dem Winter weitermachen“ im WinterDex-Bereich ist unsichtbar (Navigation UND Adresse).
 *                  Die Übernahme im ObjektDex-Bereich bleibt per Direktlink /app/objektdex/aus-winterdex erreichbar
 *                  (der Bereich selbst bleibt `unlisted` in apps/registry.ts).
 *   true:          erst umlegen, wenn ObjektDex in Produktion ist (Plan Punkt 1) — dann auch `unlisted` bei ObjektDex
 *                  entfernen und ObjektDex in suite.js/apps.json aufnehmen.
 */
export const OBJEKTDEX_OEFFENTLICH = false;

/** Übernahme WinterDex → ObjektDex im Dashboard (Stufe 1, Plan 5.6) */
export const UEBERNAHME_PFAD = '/app/objektdex/aus-winterdex';

/** Ganzjahres-Nachweis je Objekt (Winterdienst aus WinterDex + Objektbetreuung aus ObjektDex in einem PDF) */
export const JAHRESNACHWEIS_PFAD = '/app/objektdex/jahresnachweis';

/** ObjektDex bei Google Play — für den Team-Text nach der Übernahme (ObjektDex gibt es nur für Android). */
export const OBJEKTDEX_PLAY_LINK = 'https://play.google.com/store/apps/details?id=com.objektdex.app';

export type Betriebstyp = 'gemeinde' | 'galabau' | 'hausbetreuung' | 'unbekannt';
export type BrueckenApp = 'objektdex' | 'spieldex' | 'baumdex';

/** Für Vergleiche: klein, Umlaute ausgeschrieben, ß → ss (wie norm() der Importe). */
function klein(s: string): string {
  return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

// Schlagwörter aus Plan 5.4. Kurze Wörter nur am Wortanfang („Stadt Graz“ ja, „Neustadt“ nein; „Markt …“ ja,
// „Supermarkt“ nein; „Amt“ nur als eigenes Wort bzw. „Bauamt“, nie „gesamt“).
const GEMEINDE = /gemeinde|bauhof|wirtschaftshof|kommun|\bstadt|\bmarkt|\bamt\b|bauamt|\.gv\.at\b|\bgde@/;
const HAUSBETREUUNG = /hausbetreu|hausmeister|hauswart|hausverwalt|immobil|facility|objekt|reinigung|wohn/;
const GALABAU = /garten|galabau|gruen|landschaft|baumpflege|forst|winterdienst|raeum|lohnunternehm|agrar|erdbau|bagger/;

/**
 * Betriebstyp grob schätzen — NUR für Reihenfolge der Kacheln und die BaumDex-Kachel, nie zum Ausblenden der Seite
 * (Plan 5.4). Quelle: Betriebsname und E-Mail des Inhabers, auf dem Gerät, ohne Server.
 * Reihenfolge der Prüfung: Gemeinde vor Hausbetreuung vor GaLaBau/Winterdienst — „Hausbetreuung & Winterdienst Huber“
 * ist eine Hausbetreuung („Winterdienst“ steht bei fast allen WinterDex-Kunden im Namen).
 */
export function betriebstyp(name: string | null | undefined, email: string | null | undefined): Betriebstyp {
  const text = klein(`${name ?? ''} ${email ?? ''}`);
  if (GEMEINDE.test(text)) return 'gemeinde';
  if (HAUSBETREUUNG.test(text)) return 'hausbetreuung';
  if (GALABAU.test(text)) return 'galabau';
  return 'unbekannt';
}

/** Höchstens 3 Kacheln je Typ (Plan 5.2/5.4). BaumDex fehlt nur bei Hausbetreuung. */
export function kacheln(typ: Betriebstyp): BrueckenApp[] {
  switch (typ) {
    case 'gemeinde':
      return ['spieldex', 'objektdex', 'baumdex'];
    case 'galabau':
      return ['objektdex', 'baumdex', 'spieldex'];
    case 'hausbetreuung':
      return ['objektdex', 'spieldex'];
    default:
      return ['objektdex', 'spieldex', 'baumdex'];
  }
}

const UTM = 'utm_source=winterdex&utm_medium=dashboard&utm_campaign=nach-dem-winter';

/** Website der App mit Herkunft (messbar, Plan 5.5/5.9) — im Browser/iPhone nie ein Play-Link. */
export function websiteLink(app: BrueckenApp): string {
  return `https://${app}.dexware.app/?${UTM}`;
}

/** Kommunal-Paket (nur bei Typ Gemeinde) */
export const KOMMUNAL_LINK = `https://dexware.app/kommunal/?${UTM}`;
