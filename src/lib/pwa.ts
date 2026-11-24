// Web-App für den Home-Bildschirm (vorerst WinterDex-Außendienst): Manifest + Service Worker (Vorlage pwa/sw.js,
// gebaut von vite.config.ts → /sw.js). Nur im Produktions-Build — der Dev-Server hat keinen Service Worker.

const UPDATE_CHECK_MS = 30 * 60 * 1000;

/** iPhone/iPad (auch iPadOS, das sich als Mac ausgibt). */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Läuft die Seite als Symbol vom Home-Bildschirm (eigenes Fenster ohne Adresszeile)? */
export function isStandalone(): boolean {
  try {
    return (
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches
    );
  } catch {
    return false;
  }
}

/**
 * Hängt Manifest und Home-Bildschirm-Angaben in den Kopf der Seite und meldet den Service Worker an.
 * Gibt eine Aufräum-Funktion zurück (Manifest wieder entfernen, wenn der Bereich verlassen wird — der Service Worker
 * bleibt angemeldet, er gilt nur für seinen Bereich).
 */
export function installWebApp(opts: { manifest: string; scope: string }): () => void {
  const head = document.head;
  const added: HTMLElement[] = [];
  const add = (el: HTMLElement) => {
    head.appendChild(el);
    added.push(el);
  };
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = opts.manifest;
  add(link);
  for (const [name, content] of [
    ['mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-status-bar-style', 'black'],
  ]) {
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = content;
    add(meta);
  }
  registerServiceWorker(opts.scope);
  return () => added.forEach((el) => el.remove());
}

let registered = false;
function registerServiceWorker(scope: string): void {
  if (!import.meta.env.PROD || registered || !('serviceWorker' in navigator)) return;
  registered = true;
  void navigator.serviceWorker
    .register('/sw.js', { scope })
    .then((reg) => {
      // Am Home-Bildschirm bleibt die Seite oft tagelang offen (keine neuen Seitenaufrufe) — beim Zurückkehren selbst
      // nach einer neuen Fassung fragen. Die neue übernimmt sofort; die laufende Seite lädt nicht von sich aus neu
      // (eine laufende Strecken-Aufzeichnung darf nie unterbrochen werden).
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
        lastCheck = Date.now();
        void reg.update().catch(() => undefined);
      });
    })
    .catch(() => {
      registered = false; // z. B. privates Surfen ohne Speicher — dann wie bisher ohne Offline-Start
    });
}
