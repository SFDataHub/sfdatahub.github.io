// /service-worker.js (ROOT) – robuste Variante auf Basis deiner Datei

const VERSION = 'v2';
const CACHE = `sfdatahub-cache-${VERSION}`;

// Nur tatsächlich vorhandene Root-Assets precachen – KEIN '/'!
const ASSETS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-48.png','/icons/icon-72.png','/icons/icon-96.png','/icons/icon-128.png','/icons/icon-144.png',
  '/icons/icon-152.png','/icons/icon-180.png','/icons/icon-192.png','/icons/icon-256.png','/icons/icon-384.png',
  '/icons/icon-512.png','/icons/icon-512-maskable.png',
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
