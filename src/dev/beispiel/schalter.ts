// Beispiel-Zugang (NUR Dev-Server, siehe docs/beispiel-zugang.md): Schalter und Liste der Apps mit Beispieldaten.
// Wird von src/auth/AppAuthContext.tsx nur hinter `import.meta.env.DEV` aufgerufen — im Produktions-Build fällt diese
// Datei samt Beispieldaten weg (Nachweis: Merkwort aus client.ts fehlt in dist/, Test tests/beispiel-zugang.test.mjs).
//
//   /app/<app>?beispiel        Beispielmodus an (bleibt im Tab an, auch beim Wechsel der Unterseite)
//   /app/<app>?beispiel=aus    wieder aus (oder „Abmelden“ im Kopf)
//
// Bewusst NICHT ?demo: Die Prüf-Apps springen bei ?demo in die Handy-Ansicht „Vor Ort“ mit eigenen Beispieldaten.

import type { BeispielDaten } from './typen';

/** Apps mit Beispieldaten — neue App: Datei src/dev/beispiel/<app>.ts anlegen und hier eintragen. */
export const BEISPIEL_APPS: Record<string, () => Promise<{ daten: BeispielDaten }>> = {
  feuerdex: () => import('./feuerdex'),
  spieldex: () => import('./spieldex'),
};

const SCHLUESSEL = 'dex-beispiel-zugang';

/** Beispielmodus gewünscht? (Adresse ?beispiel, danach für diesen Tab gemerkt) */
export function beispielGewuenscht(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('beispiel')) {
      if (q.get('beispiel') === 'aus') sessionStorage.removeItem(SCHLUESSEL);
      else sessionStorage.setItem(SCHLUESSEL, '1');
    }
    return sessionStorage.getItem(SCHLUESSEL) === '1';
  } catch {
    const q = new URLSearchParams(window.location.search);
    return q.has('beispiel') && q.get('beispiel') !== 'aus';
  }
}

const ohneDaten = new Set<string>();

/** Beispielmodus für DIESE App? Ohne Beispieldaten: Hinweis in der Konsole (einmal) und normale Anmeldung. */
export function beispielAn(appId: string): boolean {
  if (!beispielGewuenscht()) return false;
  if (BEISPIEL_APPS[appId]) return true;
  if (!ohneDaten.has(appId)) {
    ohneDaten.add(appId);
    console.warn(`[Beispiel] Für „${appId}“ gibt es noch keine Beispieldaten (src/dev/beispiel/${appId}.ts) — normale Anmeldung.`);
  }
  return false;
}

/** Beispielmodus beenden: Merker löschen und die Seite ohne ?beispiel neu laden. */
export function beispielAus(): void {
  try {
    sessionStorage.removeItem(SCHLUESSEL);
  } catch {
    /* egal */
  }
  const u = new URL(window.location.href);
  u.searchParams.delete('beispiel');
  window.location.replace(u.toString());
}
