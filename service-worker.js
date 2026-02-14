const CACHE_NAME = 'firecalc-v3';
const urlsToCache = [
  '/index.html',
  '/' // Cache the root as well, which often resolves to index.html
];

// Install event: Cache essential assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Attempting to install version:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Cache opened:', CACHE_NAME);
        return cache.addAll(urlsToCache)
          .then(() => {
            console.log('[Service Worker] All URLs successfully cached:', urlsToCache);
          })
          .catch(error => {
            console.error('[Service Worker] Failed to cache URLs:', urlsToCache, error);
          });
      })
      .then(() => {
        console.log('[Service Worker] Installation complete for version:', CACHE_NAME);
        return self.skipWaiting(); // Force activation of new SW
      })
      .catch(error => {
        console.error('[Service Worker] Cache open/addAll failed during install:', error);
      })
  );
});

// Fetch event: Serve cached assets if available, otherwise fetch from network
self.addEventListener('fetch', event => {
  console.log('[Service Worker] Fetching:', event.request.url);
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          console.log('[Service Worker] Serving from cache:', event.request.url);
          return response;
        }
        console.log('[Service Worker] Serving from network:', event.request.url);
        return fetch(event.request).catch(error => {
          console.error('[Service Worker] Fetch failed from network:', event.request.url, error);
        });
      })
  );
});

// Activate event: Clean up old caches (optional for now, but good practice)
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating version:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Old caches deleted, new version active.');
      return self.clients.claim(); // Ensure new SW takes control immediately
    })
  );
}); 