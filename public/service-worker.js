const CACHE = 'sfdatahub-cache-v1';
const ASSETS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-48.png','/icons/icon-72.png','/icons/icon-96.png','/icons/icon-128.png','/icons/icon-144.png',
  '/icons/icon-152.png','/icons/icon-180.png','/icons/icon-192.png','/icons/icon-256.png','/icons/icon-384.png','/icons/icon-512.png','/icons/icon-512-maskable.png',
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : null)))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.headers.get('accept')?.includes('text/html')) {
      event.respondWith(
        fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
          return res;
        }).catch(async () => {
          const cached = await caches.match(req);
          return cached || caches.match('/offline.html');
        })
      );
      return;
    }
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return res;
      }))
    );
  }
});
