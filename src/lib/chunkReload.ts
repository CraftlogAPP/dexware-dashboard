// Nachgeladene Teile (lazy) fehlen: entweder kein Netz oder es gibt eine neue Fassung (nach einem Deploy liegen die
// alten Dateinamen nicht mehr auf dem Server). Bei Netz einmal neu laden — die neue Fassung kommt dann vom Server.
// Ohne Netz NICHT neu laden: ohne Service Worker stünde dann die Fehlerseite des Browsers da statt unserer Meldung.

const KEY = 'dex-neu-geladen';
const AGAIN_AFTER_MS = 2 * 60 * 1000; // nie in einer Schleife neu laden
let pending = false;

/** Fehler beim Laden eines nachgeladenen Teils (Chrome, Safari, Firefox, CSS-Vorladen von Vite)? */
export function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Failed to load module script/i.test(
    msg,
  );
}

/** Läuft das Neuladen schon? (Dann zeigt die Fehlergrenze „Neue Fassung wird geladen …“.) */
export function reloadPending(): boolean {
  return pending;
}

/**
 * Einmal neu laden, wenn der Server erreichbar ist. Gibt true zurück, wenn neu geladen wird.
 * Prüft das Netz mit einer kleinen Anfrage, die am Service Worker vorbeigeht (navigator.onLine sagt im Funkloch oft „online“).
 */
export async function reloadForNewVersion(): Promise<boolean> {
  if (pending) return true;
  if (!navigator.onLine) return false;
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < AGAIN_AFTER_MS) return false;
  } catch {
    return false; // ohne Speicher keine Schleifen-Sperre → lieber nicht von selbst neu laden
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`/robots.txt?netz=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  pending = true;
  window.location.reload();
  return true;
}

/** Einmal beim Start: Vite meldet fehlgeschlagenes Nachladen als „vite:preloadError“. Der Fehler geht trotzdem an die Fehlergrenze. */
export function installChunkReload(): void {
  window.addEventListener('vite:preloadError', () => {
    void reloadForNewVersion();
  });
}
