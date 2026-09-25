// Network-first for same-origin GETs, cache as the offline fallback.
// Bump CACHE_NAME whenever the app shell changes so old caches are dropped.
const CACHE_NAME = 'firecalc-v6';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css?v=6',
  '/market-data.js?v=6',
  '/tax-engine.js?v=6',
  '/app.js?v=6',
  '/favicon.svg',
  '/manifest.json',
  '/privacy-policy.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(error => console.error('[Service Worker] Precache failed:', error))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(cached => {
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match('/index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        })
      )
  );
});
