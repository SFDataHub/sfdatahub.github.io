// /service-worker.js (ROOT) – robuste Variante auf Basis deiner Datei

const VERSION = 'v2';
const CACHE = `sfdatahub-cache-${VERSION}`;

// Nur tatsächlich vorhandene Root-Assets precachen – KEIN '/'!
const ASSETS = [
  '/offline.html',
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Robust: einzelne Fetches; 404/Fehler brechen die Installation NICHT ab
    await Promise.allSettled(
      ASSETS.map(async (u) => {
        try {
          const res = await fetch(u, { cache: 'reload' });
          if (res.ok) await cache.put(u, res.clone());
        } catch (_) {}
      })
    );
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // nur Same-Origin

  // HTML: network-first (keine Startseite im Cache „festkleben“)
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match('/offline.html')) || Response.error())
    );
    return;
  }

  // Andere Assets: cache-first mit Runtime-Fill
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      // Erfolgreiche Responses cachen
      if (res && res.ok) {
        const copy = res.clone();
        const cache = await caches.open(CACHE);
        cache.put(req, copy);
      }
      return res;
    } catch {
      // Fallback: falls vorhanden, aus Cache liefern
      const fallback = await caches.match(req);
      if (fallback) return fallback;
      throw new Error('Network error and not in cache');
    }
  })());
});
