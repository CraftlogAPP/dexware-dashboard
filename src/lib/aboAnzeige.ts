// Was die Abo-Seite (src/components/AboPage.tsx) über den Tarif sagt — als reine Funktion ohne React, damit
// tests/suite-bestand.test.mjs die Entscheidung und die Texte prüfen kann.
//
// Suite-Umstellung 26.11.2026 (Alex): Das Suite-Abo umfasst nur noch die Apps aus SUITE_APPS (registry). In Apps mit
// suiteNurBestand gilt eine Suite nur noch als Bestand (Abo vom Stichtag, ohne Unterbrechung) — die Seite sagt das so,
// verkauft dort keine Suite und wirbt dort nicht mit ihr. Apps mit notInSuite erwähnen die Suite nur als „nicht Teil“.
import { inSuite, SUITE_APPS, SUITE_STICHTAG, suiteAppNamen, type AppConfig } from '../apps/registry';
import type { AboInfo, EntitlementInfo } from './abo';

export interface AboAnzeige {
  suiteActive: boolean;
  /** eigenes Pro-Abo oder Pro dieser App laut Suite-Server (Sammel-App/Dankeschön-Code) */
  proActive: boolean;
  /** Pro nur über den Betrieb (org_pro_active: Inhaber-Abo, Rechnung, Kommunal-Lizenz, Bonus) */
  viaOrg: boolean;
  /** Suite gilt hier nur als Bestand (App mit suiteNurBestand) */
  bestand: boolean;
  /** Details des höchsten Tarifs (Store-Abo), sonst null */
  current: EntitlementInfo | null;
  planName: string;
  text: string;
  /** Hinweis, wenn ein Suite-Abo besteht, hier aber nicht gilt — sonst null */
  suiteNichtHierText: string | null;
}

/** Datum wie überall auf der Abo-Seite: TT.MM.JJJJ */
export function fmtAboDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Eine Zeile unter „Dexware Suite“ im Web-Kauf (Anzahl aus der registry, seit 26.11.2026: 9 Apps). */
export function suiteLead(): string {
  return `Pro in allen ${SUITE_APPS.length} Apps der Dexware Suite mit einem Abo`;
}

export function aboAnzeige(
  app: Pick<AppConfig, 'name' | 'notInSuite' | 'suiteNurBestand'>,
  info: AboInfo,
  org: { orgPro: boolean; bonusUntil: string | null },
  jetzt: number = Date.now(),
): AboAnzeige {
  const suiteActive = !!info.suite?.active || info.suiteBackendActive;
  // Pro dieser App aus der Sammel-App „Dexware“ bzw. per Dankeschön-Code (Suite-Server, nur bei Apps mit suiteNurBestand bekannt)
  const appProServer = !info.pro?.active ? info.appProBackend : null;
  const proActive = !!info.pro?.active || !!appProServer;
  const bestand = suiteActive && !!app.suiteNurBestand;
  const bonusActive = !!org.bonusUntil && Date.parse(org.bonusUntil) > jetzt;

  // Suite deckt Pro mit ab — angezeigt werden die Details des höchsten Tarifs.
  const current = suiteActive ? (info.suite?.active ? info.suite : null) : info.pro?.active ? info.pro : null;
  const viaOrg = !suiteActive && !proActive && org.orgPro;
  const planName = suiteActive
    ? bestand
      ? 'Dexware Suite (Bestandsschutz)'
      : 'Dexware Suite'
    : proActive
      ? `${app.name} Pro`
      : viaOrg
        ? `${app.name} Pro (für deinen Betrieb)`
        : 'Free';

  const text = suiteActive
    ? bestand
      ? `Dein Suite-Abo aus der Zeit vor der Umstellung am ${SUITE_STICHTAG} gilt hier weiter (Bestandsschutz), solange es ohne Unterbrechung läuft. Neue Suite-Abos umfassen ${app.name} nicht mehr — ${app.name} hat seitdem ein eigenes Abo.`
      : `Das Suite-Abo schaltet Pro in allen ${SUITE_APPS.length} Apps der Dexware Suite frei (${suiteAppNamen()}) — auch in dieser.`
    : viaOrg
      ? `Pro gilt für deinen Betrieb — freigeschaltet über das Abo des Inhabers, auf Rechnung, eine Kommunal-Lizenz oder einen Bonus${bonusActive ? ` (Freischaltung/Bonus bis ${fmtAboDatum(org.bonusUntil!)})` : ''}. Ein eigenes Abo ist nicht nötig.`
      : proActive
        ? appProServer
          ? `${app.name} Pro ist für dein Konto freigeschaltet — ${appProServer === 'gutschein' ? 'mit einem eingelösten Dankeschön-Code' : 'über die Dexware-App'}${info.appProBackendExpires ? ` (bis ${fmtAboDatum(info.appProBackendExpires)})` : ''}.`
          : `Dein Pro-Abo für ${app.name} ist aktiv.`
        : !inSuite(app)
          ? `Du nutzt ${app.name} im Free-Tarif. Pro schließt du in der ${app.name}-App am Handy ab (Google Play). ${app.name} ist nicht Teil des Dexware-Suite-Abos – ${app.name} hat ein eigenes Abo.`
          : `Du nutzt ${app.name} im Free-Tarif. Pro oder das Suite-Abo schließt du in der ${app.name}-App am Handy ab (Google Play).`;

  const suiteNichtHierText =
    !suiteActive && info.suiteNichtHier
      ? `Du hast ein Dexware-Suite-Abo — es gilt aber nicht für ${app.name}: Seit dem ${SUITE_STICHTAG} gehört ${app.name} nicht mehr zum Suite-Abo und hat ein eigenes Abo. Suite-Abos, die am ${SUITE_STICHTAG} schon bestanden, gelten hier weiter, solange sie ohne Unterbrechung laufen. Dein Suite-Abo umfasst ${suiteAppNamen()}. Fragen dazu? Schreib uns an support@dexware.app.`
      : null;

  return { suiteActive, proActive, viaOrg, bestand, current, planName, text, suiteNichtHierText };
}
