const CACHE_NAME = 'firecalc-v7';

function isHtmlRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate') return true;
  return url.pathname === '/' || url.pathname.endsWith('.html');
}

// Do not precache HTML. A cache-first shell can show Google a stale page.
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

// HTML is network-first, with the last good copy kept only as an offline fallback.
// Scripts, styles, and other assets are not intercepted.
self.addEventListener('fetch', event => {
  if (!isHtmlRequest(event.request)) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request.url, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || Response.error()))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});
