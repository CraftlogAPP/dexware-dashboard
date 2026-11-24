// Service Worker des Dexware-Dashboards — vorerst nur für WinterDex (Gültigkeitsbereich /app/winterdex, angemeldet in
// src/lib/pwa.ts). Zweck: Das Home-Bildschirm-Symbol des Außendienstes öffnet auch im Funkloch (Halle, Tiefgarage,
// Tal) — die App-Hülle liegt auf dem Gerät, die Warteschlange (IndexedDB) übernimmt den Rest.
//
// Regeln:
//  • Seitenaufrufe: zuerst das Netz (immer die neueste Fassung). Ohne Netz — oder wenn nach 4 s noch keine Antwort da
//    ist — die gespeicherte Hülle (index.html dieser Fassung, passend zu den gespeicherten Dateien).
//  • /assets/… (Dateinamen mit Inhalts-Kennung, ändern sich nie): aus dem Speicher, sonst Netz (und merken).
//  • Alles andere geht am Service Worker vorbei: Supabase, Wetter, Kartenkacheln und alle fremden Server.
//    Server-Antworten werden NIE gespeichert.
//  • Jeder Deploy ändert diese Datei (Fassung + Dateiliste) → neue Fassung lädt die Hülle, ist sofort aktiv und
//    löscht die alten Speicher. Eine noch offene Seite der alten Fassung lädt bei einem fehlenden Teil einmal neu
//    (src/lib/chunkReload.ts) — kein Hängenbleiben auf der alten Fassung.
//
// VORLAGE: Beim Bauen setzt das Plugin „dex-service-worker“ (vite.config.ts) Fassung und Dateiliste ein → dist/sw.js.

const VERSION = '__DEX_VERSION__';
const PRECACHE = self.__DEX_PRECACHE__;
const SHELL = `dex-shell-${VERSION}`;
const RUNTIME = `dex-rt-${VERSION}`;
const SHELL_HTML = '/index.html';
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) =>
        cache.addAll(
          // Dateien mit Inhalts-Kennung dürfen aus dem HTTP-Speicher kommen; alles andere frisch vom Server holen
          // (GitHub Pages: max-age=600 — sonst passte eine alte index.html nicht zu den neuen Dateien).
          PRECACHE.map((url) => new Request(url, { cache: url.startsWith('/assets/') ? 'default' : 'reload' })),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dex-') && k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Wetter, Karten: nie anfassen
  if (req.mode === 'navigate') {
    event.respondWith(page(req));
    return;
  }
  if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) event.respondWith(file(req, url));
});

/** Seitenaufruf: Netz zuerst, bei Funkloch oder Zeitüberschreitung die gespeicherte Hülle. */
async function page(req) {
  const net = fetch(req);
  net.catch(() => undefined); // Fehler wird unten behandelt (sonst „unhandled rejection“)
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(resolve, NAV_TIMEOUT_MS, null);
  });
  try {
    const res = await Promise.race([net, slow]);
    if (res) return res;
  } catch {
    /* kein Netz */
  } finally {
    clearTimeout(timer);
  }
  const shell = (await caches.match(SHELL_HTML, { cacheName: SHELL })) ?? (await caches.match(SHELL_HTML));
  // Nichts gespeichert (Installation noch nicht fertig): wie ohne Service Worker
  return shell ?? net;
}

/** Datei mit fester Kennung: Speicher zuerst, sonst Netz (Antwort für die nächste Nutzung merken). */
async function file(req, url) {
  const hit = await caches.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && url.pathname.startsWith('/assets/')) {
    const copy = res.clone();
    caches
      .open(RUNTIME)
      .then((cache) => cache.put(req, copy))
      .catch(() => undefined);
  }
  return res;
}
